import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  COMMIT_FIELDS,
  COMMIT_FORMAT,
  commitFromFields,
  decodeBlob,
  parseCommits,
  parseTrack,
  porcelainStatusOf,
  rawStatusOf,
} from './parse.js';
import { BatchReader, GitError, runGit, runGitText, splitNul } from './runner.js';
import type {
  BlobContent,
  Commit,
  FileChange,
  HeadInfo,
  LogOptions,
  PendingOperation,
  Ref,
  RefKind,
  Remote,
  RepoState,
  StatusEntry,
  TreeEntry,
} from './types.js';

/** Revision alias for the working tree, understood by the diff helpers. */
export const WORKTREE = ':worktree';
/** Revision alias for the index (staging area). */
export const INDEX = ':index';

export interface RepositoryInfo {
  root: string;
  gitDir: string;
  commonDir: string;
  isBare: boolean;
}

export class Repository {
  private readonly batch: BatchReader;

  private constructor(readonly info: RepositoryInfo) {
    this.batch = new BatchReader(info.root);
  }

  get root(): string {
    return this.info.root;
  }

  get gitDir(): string {
    return this.info.gitDir;
  }

  /** Open the repository containing `path`. Throws if there is none. */
  static async open(path: string): Promise<Repository> {
    const out = await runGitText(
      ['rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-common-dir', '--is-bare-repository'],
      { cwd: path },
    );
    const lines = out.split('\n').filter((line) => line.length > 0);
    const [root, gitDir, commonDir, bare] = lines;
    if (!root || !gitDir) throw new GitError('not a git repository', ['rev-parse'], null, out);
    // `--git-common-dir` is reported relative to the working directory, unlike
    // `--absolute-git-dir`. In a linked worktree it points at the main
    // repository, which is where MERGE_HEAD and friends actually live.
    return new Repository({
      root,
      gitDir,
      commonDir: commonDir ? resolve(root, commonDir) : gitDir,
      isBare: bare === 'true',
    });
  }

  /** Whether `path` is inside a git repository. */
  static async detect(path: string): Promise<boolean> {
    try {
      await runGitText(['rev-parse', '--git-dir'], { cwd: path });
      return true;
    } catch {
      return false;
    }
  }

  dispose(): void {
    this.batch.close();
  }

  private run(args: string[], throwOnError = true) {
    return runGit(args, { cwd: this.root, throwOnError });
  }

  /**
   * Run an arbitrary git command in this repository. Used by the write
   * operations, which live outside this class so that the read model stays
   * readable.
   */
  exec(args: string[], options: { throwOnError?: boolean; input?: Buffer | string } = {}) {
    return runGit(args, {
      cwd: this.root,
      throwOnError: options.throwOnError ?? true,
      input: options.input,
    });
  }

  private async text(args: string[], throwOnError = true): Promise<string> {
    const result = await this.run(args, throwOnError);
    return result.stdout.toString('utf8');
  }

  // ---------------------------------------------------------------- refs ---

  async revParse(revision: string): Promise<string | null> {
    try {
      const out = await this.text(['rev-parse', '--verify', '--quiet', `${revision}^{commit}`]);
      const oid = out.trim();
      return oid.length > 0 ? oid : null;
    } catch {
      return null;
    }
  }

  async head(): Promise<HeadInfo> {
    const oid = await this.revParse('HEAD');
    if (oid === null) {
      // No commits yet: HEAD points at a branch that does not exist.
      const symbolic = (await this.text(['symbolic-ref', '--short', '-q', 'HEAD'], false)).trim();
      return {
        oid: null,
        branch: symbolic.length > 0 ? symbolic : null,
        detached: false,
        unborn: true,
      };
    }
    const symbolic = (await this.text(['symbolic-ref', '--short', '-q', 'HEAD'], false)).trim();
    if (symbolic.length === 0) {
      return { oid, branch: null, detached: true, unborn: false };
    }
    const info: HeadInfo = { oid, branch: symbolic, detached: false, unborn: false };
    const track = (
      await this.text(
        ['for-each-ref', '--format=%(upstream:short)%00%(upstream:track)', `refs/heads/${symbolic}`],
        false,
      )
    ).trim();
    if (track.length > 0) {
      const [upstream, trackInfo] = track.split('\0');
      if (upstream) {
        info.upstream = upstream;
        Object.assign(info, parseTrack(trackInfo ?? ''));
      }
    }
    return info;
  }

  async refs(): Promise<Ref[]> {
    const format = [
      '%(refname)',
      '%(objectname)',
      '%(objecttype)',
      '%(*objectname)',
      '%(HEAD)',
      '%(upstream:short)',
      '%(upstream:track)',
      '%(contents:subject)',
      '%(committerdate:iso-strict)',
    ].join('%00');
    const out = await this.text([
      'for-each-ref',
      `--format=${format}`,
      'refs/heads',
      'refs/remotes',
      'refs/tags',
    ]);
    const refs: Ref[] = [];
    for (const line of out.split('\n')) {
      if (line.length === 0) continue;
      const f = line.split('\0');
      const fullName = f[0] ?? '';
      if (fullName.length === 0) continue;
      const oid = f[1] ?? '';
      const targetOid = (f[3] ?? '').length > 0 ? f[3]! : oid;
      const kind: RefKind = fullName.startsWith('refs/heads/')
        ? 'branch'
        : fullName.startsWith('refs/remotes/')
          ? 'remote'
          : fullName.startsWith('refs/tags/')
            ? 'tag'
            : 'other';
      const name = fullName.replace(/^refs\/(heads|remotes|tags)\//, '');
      const ref: Ref = {
        fullName,
        name,
        kind,
        oid,
        targetOid,
        isHead: f[4] === '*',
        subject: f[7] || undefined,
        date: f[8] || undefined,
      };
      if (f[5]) {
        ref.upstream = f[5];
        Object.assign(ref, parseTrack(f[6] ?? ''));
      }
      // `origin/HEAD` is a symbolic pointer, not a branch worth listing.
      if (kind === 'remote' && name.endsWith('/HEAD')) continue;
      refs.push(ref);
    }
    return refs;
  }

  async remotes(): Promise<Remote[]> {
    const out = await this.text(['remote', '-v'], false);
    const map = new Map<string, Remote>();
    for (const line of out.split('\n')) {
      const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line.trim());
      if (!match) continue;
      const [, name, url, direction] = match;
      const existing = map.get(name!) ?? { name: name!, fetchUrl: '', pushUrl: '' };
      if (direction === 'fetch') existing.fetchUrl = url!;
      else existing.pushUrl = url!;
      map.set(name!, existing);
    }
    return [...map.values()];
  }

  /**
   * What operation, if any, the repository is in the middle of. This drives
   * which actions the UI offers — you cannot "commit" your way out of a rebase.
   */
  async state(): Promise<RepoState> {
    const head = await this.head();
    const dir = this.info.commonDir;
    let operation: PendingOperation = 'none';
    if (existsSync(join(dir, 'rebase-merge', 'interactive'))) operation = 'rebase-interactive';
    else if (existsSync(join(dir, 'rebase-merge')) || existsSync(join(dir, 'rebase-apply')))
      operation = 'rebase';
    else if (existsSync(join(dir, 'CHERRY_PICK_HEAD'))) operation = 'cherry-pick';
    else if (existsSync(join(dir, 'REVERT_HEAD'))) operation = 'revert';
    else if (existsSync(join(dir, 'MERGE_HEAD'))) operation = 'merge';
    else if (existsSync(join(dir, 'BISECT_LOG'))) operation = 'bisect';

    const conflicted = splitNul(await this.text(['diff', '--name-only', '--diff-filter=U', '-z'], false));

    const state: RepoState = { head, operation, conflicted };
    if (operation === 'merge') {
      try {
        const content = await readFile(join(dir, 'MERGE_HEAD'), 'utf8');
        state.mergeHeads = content.split('\n').filter((l) => l.length === 40);
      } catch {
        // The merge finished between the check and the read; not an error.
      }
    }
    return state;
  }

  // ------------------------------------------------------------- history ---

  private logArgs(options: LogOptions): string[] {
    const args = ['log', `--format=format:${COMMIT_FORMAT}%x00`];
    if (options.topoOrder !== false) args.push('--topo-order');
    if (options.limit !== undefined) args.push(`--max-count=${options.limit}`);
    if (options.skip !== undefined && options.skip > 0) args.push(`--skip=${options.skip}`);
    if (options.all) args.push('--all');
    if (options.follow) args.push('--follow');
    if (options.firstParent) args.push('--first-parent');
    if (options.grep) args.push(`--grep=${options.grep}`, '--regexp-ignore-case');
    if (options.search) args.push(`-S${options.search}`);
    if (options.author) args.push(`--author=${options.author}`);
    if (options.since) args.push(`--since=${options.since}`);
    if (options.until) args.push(`--until=${options.until}`);
    if (options.revisions && options.revisions.length > 0) args.push(...options.revisions);
    else if (!options.all) args.push('HEAD');
    if (options.paths && options.paths.length > 0) args.push('--', ...options.paths);
    return args;
  }

  async log(options: LogOptions = {}): Promise<Commit[]> {
    const result = await this.run(this.logArgs(options), false);
    if (result.exitCode !== 0) return [];
    return parseCommits(result.stdout.toString('utf8'));
  }

  async commit(oid: string): Promise<Commit | null> {
    const out = await this.text(
      ['show', '--no-patch', `--format=format:${COMMIT_FORMAT}%x00`, oid],
      false,
    );
    const commits = parseCommits(out);
    return commits[0] ?? null;
  }

  /**
   * Every revision of a single file, following it across renames. Each entry
   * records the path the file had at that commit, so opening any revision works
   * even after the file has moved.
   */
  async fileHistory(
    path: string,
    options: LogOptions = {},
  ): Promise<Array<{ commit: Commit; path: string; status: string; oldPath?: string }>> {
    const args = this.logArgs({ ...options, follow: options.follow !== false, paths: [path] });
    // Insert the name-status request before the pathspec separator.
    const sep = args.indexOf('--');
    const extra = ['--name-status', '-z'];
    if (sep === -1) args.push(...extra);
    else args.splice(sep, 0, ...extra);

    const result = await this.run(args, false);
    if (result.exitCode !== 0) return [];
    const fields = result.stdout.toString('utf8').split('\0');

    const entries: Array<{ commit: Commit; path: string; status: string; oldPath?: string }> = [];
    let i = 0;
    while (i < fields.length) {
      const candidate = (fields[i] ?? '').replace(/^\n+/, '');
      if (candidate.length === 0) {
        i++;
        continue;
      }
      if (!/^[0-9a-f]{40}$/.test(candidate)) {
        // A stray status entry with no owning commit; skip it.
        i++;
        continue;
      }
      const commit = commitFromFields(fields, i);
      i += COMMIT_FIELDS;

      // Status entries for this commit follow until the next commit record.
      let currentPath = path;
      let status = 'M';
      let oldPath: string | undefined;
      while (i < fields.length) {
        const raw = (fields[i] ?? '').replace(/^\n+/, '');
        if (raw.length === 0) {
          i++;
          continue;
        }
        if (/^[0-9a-f]{40}$/.test(raw)) break;
        status = raw;
        i++;
        const first = (fields[i] ?? '').replace(/^\n+/, '');
        i++;
        if (raw.startsWith('R') || raw.startsWith('C')) {
          const second = (fields[i] ?? '').replace(/^\n+/, '');
          i++;
          oldPath = first;
          currentPath = second;
        } else {
          currentPath = first;
        }
      }
      entries.push({ commit, path: currentPath, status, oldPath });
    }
    return entries;
  }

  async mergeBase(a: string, b: string): Promise<string | null> {
    const out = await this.text(['merge-base', a, b], false);
    const oid = out.trim();
    return oid.length > 0 ? oid : null;
  }

  // --------------------------------------------------------------- blobs ---

  /**
   * Read an object through the long-lived batch process.
   *
   * Only immutable specs may go through here — an object id, or `<oid>:path`.
   * The batch process loads the index once at startup, so anything
   * index-relative (`:path`, `:2:path`) would be answered from a stale
   * snapshot; those paths take the one-shot route below instead.
   */
  async readObject(spec: string): Promise<Buffer | null> {
    if (spec.includes('\n')) return null;
    const result = await this.batch.read(spec);
    return result ? result.data : null;
  }

  async readBlobContent(spec: string): Promise<BlobContent | null> {
    const result = await this.batch.read(spec);
    if (!result || result.type !== 'blob') return null;
    return toBlobContent(result.oid, result.data);
  }

  /** Read a spec that depends on the current index, via a fresh git process. */
  private async readVolatileBlob(spec: string): Promise<BlobContent | null> {
    const result = await this.run(['cat-file', 'blob', spec], false);
    if (result.exitCode !== 0) return null;
    return toBlobContent('', result.stdout);
  }

  /** True for a full 40- or 64-character object id. */
  private static isOid(revision: string): boolean {
    return /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(revision);
  }

  /**
   * Read a path at a revision, where `WORKTREE` means the file on disk and
   * `INDEX` means the staged copy. Returns null when the path does not exist
   * there, which is how additions and deletions are represented.
   */
  async readFileAt(revision: string, path: string): Promise<BlobContent | null> {
    if (revision === WORKTREE) {
      try {
        const data = await readFile(join(this.root, path));
        return toBlobContent('', data);
      } catch {
        return null;
      }
    }
    if (revision === INDEX) return this.readVolatileBlob(`:${path}`);

    // Resolve once to an object id so the batch process can answer safely.
    const oid = Repository.isOid(revision) ? revision : await this.revParse(revision);
    if (oid === null) return null;
    return this.readBlobContent(`${oid}:${path}`);
  }

  /**
   * Conflict stages of an unmerged path: 1=base, 2=ours, 3=theirs.
   * The stage object ids come from the index, but once resolved they are
   * immutable and can be read through the batch process.
   */
  async conflictStages(
    path: string,
  ): Promise<{ base: BlobContent | null; ours: BlobContent | null; theirs: BlobContent | null }> {
    const out = await this.text(['ls-files', '-u', '-z', '--', path], false);
    const stages: Record<string, string> = {};
    for (const record of splitNul(out)) {
      const tab = record.indexOf('\t');
      if (tab === -1) continue;
      const meta = record.slice(0, tab).split(/\s+/);
      const oid = meta[1];
      const stage = meta[2];
      if (oid && stage) stages[stage] = oid;
    }
    const read = async (oid: string | undefined): Promise<BlobContent | null> =>
      oid ? this.readBlobContent(oid) : null;
    const [base, ours, theirs] = await Promise.all([
      read(stages['1']),
      read(stages['2']),
      read(stages['3']),
    ]);
    return { base, ours, theirs };
  }

  async listTree(revision: string, subPath = ''): Promise<TreeEntry[]> {
    const args = ['ls-tree', '-r', '-z', '--long', revision];
    if (subPath.length > 0) args.push('--', subPath);
    const out = await this.text(args, false);
    const entries: TreeEntry[] = [];
    for (const record of splitNul(out)) {
      const tab = record.indexOf('\t');
      if (tab === -1) continue;
      const meta = record.slice(0, tab).split(/\s+/);
      const path = record.slice(tab + 1);
      const [mode, type, oid, size] = meta;
      entries.push({
        path,
        name: path.slice(path.lastIndexOf('/') + 1),
        mode: mode ?? '',
        oid: oid ?? '',
        type: (type as TreeEntry['type']) ?? 'blob',
        size: size && size !== '-' ? Number(size) : undefined,
      });
    }
    return entries;
  }

  // --------------------------------------------------------------- diffs ---

  /**
   * Translate our revision aliases into the arguments `git diff` expects.
   * The four interesting comparisons — commit↔commit, HEAD↔index, index↔
   * worktree and HEAD↔worktree — are all expressible, and the caller does not
   * have to know which flag combination produces which.
   */
  private diffRangeArgs(from: string, to: string): string[] {
    if (from === INDEX && to === WORKTREE) return [];
    if (to === INDEX) return ['--cached', from === WORKTREE ? 'HEAD' : from];
    if (to === WORKTREE) return from === INDEX ? [] : [from];
    return [from, to];
  }

  async changedFiles(
    from: string,
    to: string,
    options: {
      findRenames?: boolean;
      paths?: string[];
      /**
       * Must match the algorithm the file's diff will be rendered with,
       * otherwise the line counts in a file list disagree with the diff the
       * user opens from it.
       */
      algorithm?: 'histogram' | 'myers';
    } = {},
  ): Promise<FileChange[]> {
    const range = this.diffRangeArgs(from, to);
    const common = ['-z', '--no-color', `--diff-algorithm=${options.algorithm ?? 'histogram'}`];
    if (options.findRenames !== false) common.push('--find-renames', '--find-copies');
    const paths = options.paths && options.paths.length > 0 ? ['--', ...options.paths] : [];

    const [rawResult, numstatResult] = await Promise.all([
      this.run(['diff', ...common, '--raw', '--abbrev=40', ...range, ...paths], false),
      this.run(['diff', ...common, '--numstat', ...range, ...paths], false),
    ]);

    const changes = parseRawDiff(rawResult.stdout.toString('utf8'));
    applyNumstat(changes, numstatResult.stdout.toString('utf8'));

    if (to === WORKTREE) {
      // Untracked files are invisible to `git diff` but are part of what the
      // working copy actually looks like, so a review of it must include them.
      const untracked = splitNul(
        await this.text(['ls-files', '-z', '--others', '--exclude-standard'], false),
      );
      for (const path of untracked) {
        if (options.paths && options.paths.length > 0 && !options.paths.some((p) => path.startsWith(p)))
          continue;
        changes.push({ path, status: 'untracked' });
      }
      changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    }
    return changes;
  }

  async status(): Promise<StatusEntry[]> {
    const out = await this.text(
      ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--branch'],
      false,
    );
    const records = splitNul(out);
    const entries: StatusEntry[] = [];
    for (let i = 0; i < records.length; i++) {
      const record = records[i]!;
      if (record.startsWith('# ')) continue;
      const kind = record[0];

      if (kind === '1') {
        // `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`
        const parts = record.split(' ');
        const xy = parts[1] ?? '..';
        entries.push({
          path: parts.slice(8).join(' '),
          indexStatus: porcelainStatusOf(xy[0] ?? '.'),
          worktreeStatus: porcelainStatusOf(xy[1] ?? '.'),
          isConflicted: false,
          isSubmodule: (parts[2] ?? 'N...') !== 'N...',
        });
      } else if (kind === '2') {
        const parts = record.split(' ');
        const xy = parts[1] ?? '..';
        const newPath = parts.slice(9).join(' ');
        const oldPath = records[++i] ?? '';
        entries.push({
          path: newPath,
          oldPath,
          indexStatus: porcelainStatusOf(xy[0] ?? '.'),
          worktreeStatus: porcelainStatusOf(xy[1] ?? '.'),
          isConflicted: false,
          isSubmodule: (parts[2] ?? 'N...') !== 'N...',
        });
      } else if (kind === 'u') {
        // `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`
        const parts = record.split(' ');
        entries.push({
          path: parts.slice(10).join(' '),
          indexStatus: 'unmerged',
          worktreeStatus: 'unmerged',
          isConflicted: true,
          stages: { base: parts[7], ours: parts[8], theirs: parts[9] },
        });
      } else if (kind === '?') {
        entries.push({
          path: record.slice(2),
          indexStatus: 'unchanged',
          worktreeStatus: 'untracked',
          isConflicted: false,
        });
      } else if (kind === '!') {
        entries.push({
          path: record.slice(2),
          indexStatus: 'unchanged',
          worktreeStatus: 'ignored',
          isConflicted: false,
        });
      }
    }
    return entries;
  }
}

function toBlobContent(oid: string, data: Buffer): BlobContent {
  const decoded = decodeBlob(data);
  return {
    oid,
    text: decoded.text,
    size: data.length,
    isBinary: decoded.isBinary,
    encoding: decoded.encoding,
    noFinalNewline: decoded.noFinalNewline,
  };
}

/** Parse `git diff -z --raw --abbrev=40` output. */
export function parseRawDiff(stdout: string): FileChange[] {
  const fields = splitNul(stdout);
  const changes: FileChange[] = [];
  let i = 0;
  while (i < fields.length) {
    const meta = fields[i]!;
    i++;
    if (!meta.startsWith(':')) continue;
    // `:<oldmode> <newmode> <oldoid> <newoid> <status>`
    const parts = meta.slice(1).split(' ');
    const oldMode = parts[0] ?? '';
    const newMode = parts[1] ?? '';
    const oldOid = parts[2] ?? '';
    const newOid = parts[3] ?? '';
    const statusCode = parts[4] ?? 'M';
    const status = rawStatusOf(statusCode);
    const similarity =
      statusCode.length > 1 ? Number.parseInt(statusCode.slice(1), 10) || undefined : undefined;

    if (status === 'renamed' || status === 'copied') {
      const oldPath = fields[i++] ?? '';
      const newPath = fields[i++] ?? '';
      changes.push({
        path: newPath,
        oldPath,
        status,
        similarity,
        oldOid,
        newOid,
        oldMode,
        newMode,
        isSubmodule: newMode === '160000' || oldMode === '160000',
      });
    } else {
      const path = fields[i++] ?? '';
      changes.push({
        path,
        status,
        oldOid,
        newOid,
        oldMode,
        newMode,
        isSubmodule: newMode === '160000' || oldMode === '160000',
      });
    }
  }
  return changes;
}

/** Merge line counts from `git diff -z --numstat` into an existing change list. */
export function applyNumstat(changes: FileChange[], stdout: string): void {
  const byPath = new Map(changes.map((change) => [change.path, change]));
  const fields = splitNul(stdout);
  let i = 0;
  while (i < fields.length) {
    const record = fields[i++]!;
    const parts = record.split('\t');
    if (parts.length < 3) continue;
    const [addedText, deletedText, inlinePath] = parts;
    let path = inlinePath ?? '';
    if (path.length === 0) {
      // Renames put the two paths in the following NUL fields.
      i++; // old path
      path = fields[i++] ?? '';
    }
    const change = byPath.get(path);
    if (!change) continue;
    if (addedText === '-' || deletedText === '-') {
      change.isBinary = true;
    } else {
      change.additions = Number(addedText) || 0;
      change.deletions = Number(deletedText) || 0;
    }
  }
}
