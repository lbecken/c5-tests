import { watch, type FSWatcher } from 'node:fs';
import { join, sep } from 'node:path';

import type { ChangeReason } from './protocol.js';

/**
 * Watches a repository for anything that would change what the UI is showing.
 *
 * Two watchers, because the interesting events live in two places: the working
 * tree (files you edit) and the git directory (index, HEAD, refs). Events are
 * classified so the UI can refresh only the views that actually went stale —
 * typing in a file should not re-render the commit graph.
 */

const DEBOUNCE_MS = 120;

/** Directories never worth watching; they generate noise by the thousand. */
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.gitscope',
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.turbo',
  '.venv',
  '__pycache__',
]);

export type ChangeListener = (reasons: ChangeReason[]) => void;

export class RepoWatcher {
  private watchers: FSWatcher[] = [];
  private pending = new Set<ChangeReason>();
  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    private readonly root: string,
    private readonly gitDir: string,
    private readonly listener: ChangeListener,
  ) {}

  start(): void {
    this.watchWorktree();
    this.watchGitDir();
  }

  private watchWorktree(): void {
    try {
      const watcher = watch(this.root, { recursive: true, persistent: false }, (_event, name) => {
        if (typeof name !== 'string') return;
        const segments = name.split(sep);
        // Changes under .git are handled by the dedicated git-dir watcher, and
        // the recursive worktree watcher would otherwise fire on every lock
        // file git touches.
        if (segments[0] === '.git') return;
        if (segments.some((segment) => IGNORED_DIRECTORIES.has(segment))) return;
        this.queue('worktree');
      });
      watcher.on('error', () => {
        /* A watch limit or a deleted directory; the UI can still refresh manually. */
      });
      this.watchers.push(watcher);
    } catch {
      // Recursive watching is unavailable on some platforms and filesystems.
      // The UI keeps working; it just will not update by itself.
    }
  }

  private watchGitDir(): void {
    const targets: Array<{ path: string; reason: ChangeReason; recursive: boolean }> = [
      { path: this.gitDir, reason: 'operation', recursive: false },
      { path: join(this.gitDir, 'refs'), reason: 'refs', recursive: true },
    ];
    for (const target of targets) {
      try {
        const watcher = watch(
          target.path,
          { recursive: target.recursive, persistent: false },
          (_event, name) => {
            const file = typeof name === 'string' ? name : '';
            this.queue(classifyGitFile(file, target.reason));
          },
        );
        watcher.on('error', () => {
          /* Ignored: see above. */
        });
        this.watchers.push(watcher);
      } catch {
        // Missing refs directory in a fresh repository, for example.
      }
    }
  }

  private queue(reason: ChangeReason | null): void {
    if (this.closed || reason === null) return;
    this.pending.add(reason);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const reasons = [...this.pending];
      this.pending.clear();
      if (reasons.length > 0) this.listener(reasons);
    }, DEBOUNCE_MS);
    this.timer.unref?.();
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    for (const watcher of this.watchers) watcher.close();
    this.watchers = [];
  }
}

/**
 * Map a file inside the git directory to what it invalidates. Lock files are
 * ignored: git writes `index.lock` before `index`, and reacting to the lock
 * means reading the index mid-write.
 */
function classifyGitFile(name: string, fallback: ChangeReason): ChangeReason | null {
  if (name.endsWith('.lock')) return null;
  if (name === 'index') return 'index';
  if (name === 'HEAD') return 'head';
  if (name.startsWith('refs') || name === 'packed-refs') return 'refs';
  if (
    name === 'MERGE_HEAD' ||
    name === 'CHERRY_PICK_HEAD' ||
    name === 'REVERT_HEAD' ||
    name === 'BISECT_LOG' ||
    name.startsWith('rebase-')
  ) {
    return 'operation';
  }
  return fallback === 'operation' ? null : fallback;
}
