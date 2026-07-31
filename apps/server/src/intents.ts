import { randomUUID } from 'node:crypto';

/**
 * Hand-offs from the command line to a running window.
 *
 * `git difftool` and `git mergetool` invoke a command and wait for it to exit;
 * the exit code tells git whether the merge succeeded. Our command is a thin
 * client, so it has to stay alive until the window is finished with the file.
 * An intent is that pending piece of work: created by the CLI, pushed to every
 * connected window, and completed when the user is done — at which point the
 * waiting command exits with the right status.
 */

export type IntentKind = 'compare-files' | 'merge-files' | 'open-repo';

export interface Intent {
  id: string;
  kind: IntentKind;
  payload: Record<string, unknown>;
  createdAt: number;
}

interface PendingIntent extends Intent {
  waiters: Array<(result: { completed: boolean; saved: boolean }) => void>;
  settled: boolean;
}

/** Abandoned intents are cleaned up rather than leaking a waiter forever. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class IntentRegistry {
  private readonly intents = new Map<string, PendingIntent>();
  private readonly listeners = new Set<(intent: Intent) => void>();

  create(kind: IntentKind, payload: Record<string, unknown>): Intent {
    this.sweep();
    const intent: PendingIntent = {
      id: randomUUID(),
      kind,
      payload,
      createdAt: Date.now(),
      waiters: [],
      settled: false,
    };
    this.intents.set(intent.id, intent);
    const view: Intent = {
      id: intent.id,
      kind: intent.kind,
      payload: intent.payload,
      createdAt: intent.createdAt,
    };
    for (const listener of this.listeners) listener(view);
    return view;
  }

  /** Resolves when the intent completes; `saved` reports whether work was written. */
  wait(id: string): Promise<{ completed: boolean; saved: boolean }> {
    const intent = this.intents.get(id);
    if (!intent) return Promise.resolve({ completed: false, saved: false });
    if (intent.settled) return Promise.resolve({ completed: true, saved: false });
    return new Promise((resolve) => intent.waiters.push(resolve));
  }

  complete(id: string, saved: boolean): boolean {
    const intent = this.intents.get(id);
    if (!intent || intent.settled) return false;
    intent.settled = true;
    for (const waiter of intent.waiters) waiter({ completed: true, saved });
    intent.waiters = [];
    this.intents.delete(id);
    return true;
  }

  pending(): Intent[] {
    this.sweep();
    return [...this.intents.values()].map(({ id, kind, payload, createdAt }) => ({
      id,
      kind,
      payload,
      createdAt,
    }));
  }

  subscribe(listener: (intent: Intent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private sweep(): void {
    const cutoff = Date.now() - MAX_AGE_MS;
    for (const [id, intent] of this.intents) {
      if (intent.createdAt < cutoff) {
        for (const waiter of intent.waiters) waiter({ completed: false, saved: false });
        this.intents.delete(id);
      }
    }
  }
}
