import { createHash } from 'node:crypto';
import { basename } from 'node:path';

import { Repository } from '@gitscope/core';

import { RepoWatcher } from './watcher.js';
import type { ChangeReason, RepoSummary } from './protocol.js';

/**
 * One open repository, its watcher, and the subscribers listening for changes.
 *
 * Sessions are keyed by the repository root, so opening the same repository
 * from two windows shares one watcher and one `cat-file --batch` process.
 */
export class RepoSession {
  readonly id: string;
  private readonly watcher: RepoWatcher;
  private readonly listeners = new Set<(reasons: ChangeReason[]) => void>();

  private constructor(readonly repo: Repository) {
    this.id = createHash('sha1').update(repo.root).digest('hex').slice(0, 12);
    this.watcher = new RepoWatcher(repo.root, repo.gitDir, (reasons) => {
      for (const listener of this.listeners) listener(reasons);
    });
    this.watcher.start();
  }

  static async open(path: string): Promise<RepoSession> {
    const repo = await Repository.open(path);
    return new RepoSession(repo);
  }

  get summary(): RepoSummary {
    return {
      id: this.id,
      root: this.repo.root,
      name: basename(this.repo.root),
      isBare: this.repo.info.isBare,
    };
  }

  subscribe(listener: (reasons: ChangeReason[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.watcher.close();
    this.repo.dispose();
    this.listeners.clear();
  }
}

/** Registry of open repositories for the lifetime of the server process. */
export class SessionStore {
  private readonly byId = new Map<string, RepoSession>();
  private readonly byRoot = new Map<string, RepoSession>();

  async open(path: string): Promise<RepoSession> {
    const session = await RepoSession.open(path);
    const existing = this.byRoot.get(session.repo.root);
    if (existing) {
      // Another window already has it open; keep the original and discard the
      // duplicate rather than running two watchers over the same tree.
      session.close();
      return existing;
    }
    this.byId.set(session.id, session);
    this.byRoot.set(session.repo.root, session);
    return session;
  }

  get(id: string): RepoSession | undefined {
    return this.byId.get(id);
  }

  list(): RepoSession[] {
    return [...this.byId.values()];
  }

  close(id: string): void {
    const session = this.byId.get(id);
    if (!session) return;
    session.close();
    this.byId.delete(id);
    this.byRoot.delete(session.repo.root);
  }

  closeAll(): void {
    for (const session of this.byId.values()) session.close();
    this.byId.clear();
    this.byRoot.clear();
  }
}
