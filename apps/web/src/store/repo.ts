import { create } from 'zustand';

import type { Ref, RepoState } from '@gitscope/core';
import type { ChangeReason, RepoSummary } from '@gitscope/server/protocol';

import { api } from '../api/client';

export const REV_WORKTREE = ':worktree';
export const REV_INDEX = ':index';

/**
 * Where the user is. Every view is fully described by its parameters, so
 * navigation is just replacing this value — which makes back/forward, deep
 * links from the CLI, and restoring the last session all the same mechanism.
 */
export type View =
  | { kind: 'working'; path?: string; staged?: boolean }
  | { kind: 'graph'; selected?: string }
  | { kind: 'commit'; oid: string; parent?: string; path?: string }
  | { kind: 'changeset'; from: string; to: string; path?: string }
  | { kind: 'history'; path: string; from?: string; to?: string }
  | { kind: 'conflicts'; path?: string }
  | { kind: 'compare'; left?: string; right?: string }
  | { kind: 'directories'; left?: string; right?: string };

interface RepoStoreState {
  repo?: RepoSummary;
  state?: RepoState;
  refs: Ref[];
  loading: boolean;
  error?: string;
  view: View;
  history: View[];
  historyIndex: number;
  /** Bumped whenever the repository changes on disk, to invalidate queries. */
  revision: number;

  openRepo: (path: string) => Promise<void>;
  refresh: (reasons?: ChangeReason[]) => Promise<void>;
  navigate: (view: View, options?: { replace?: boolean }) => void;
  back: () => void;
  forward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
}

const INITIAL_VIEW: View = { kind: 'working' };

export const useRepoStore = create<RepoStoreState>((set, get) => ({
  refs: [],
  loading: false,
  view: INITIAL_VIEW,
  history: [INITIAL_VIEW],
  historyIndex: 0,
  revision: 0,

  openRepo: async (path: string) => {
    set({ loading: true, error: undefined });
    try {
      const opened = await api.openRepo(path);
      const refs = await api.refs(opened.repo.id);
      set({
        repo: opened.repo,
        state: opened.state,
        refs,
        loading: false,
        revision: get().revision + 1,
      });
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
      throw error;
    }
  },

  refresh: async (reasons?: ChangeReason[]) => {
    const repo = get().repo;
    if (!repo) return;
    // Refs only change for ref/head events; skipping the fetch otherwise keeps
    // typing in the working copy from re-querying the whole ref namespace.
    const needsRefs =
      reasons === undefined ||
      reasons.some((reason) => reason === 'refs' || reason === 'head' || reason === 'operation');
    const [state, refs] = await Promise.all([
      api.state(repo.id),
      needsRefs ? api.refs(repo.id) : Promise.resolve(get().refs),
    ]);
    set({ state, refs, revision: get().revision + 1 });
  },

  navigate: (view, options) => {
    const { history, historyIndex } = get();
    if (options?.replace) {
      const next = [...history];
      next[historyIndex] = view;
      set({ view, history: next });
      return;
    }
    const trimmed = history.slice(0, historyIndex + 1);
    trimmed.push(view);
    // Keep the stack bounded; nobody navigates back through 200 views.
    const bounded = trimmed.length > 200 ? trimmed.slice(trimmed.length - 200) : trimmed;
    set({ view, history: bounded, historyIndex: bounded.length - 1 });
  },

  back: () => {
    const { history, historyIndex } = get();
    if (historyIndex === 0) return;
    set({ historyIndex: historyIndex - 1, view: history[historyIndex - 1]! });
  },

  forward: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    set({ historyIndex: historyIndex + 1, view: history[historyIndex + 1]! });
  },

  canGoBack: () => get().historyIndex > 0,
  canGoForward: () => get().historyIndex < get().history.length - 1,
}));

/** Short, human label for a revision as it appears in column headings. */
export function revisionLabel(revision: string, refs: readonly Ref[]): string {
  if (revision === REV_WORKTREE) return 'Working copy';
  if (revision === REV_INDEX) return 'Staged';
  if (revision === 'HEAD') return 'HEAD';
  const ref = refs.find((candidate) => candidate.targetOid === revision);
  if (ref) return ref.name;
  if (/^[0-9a-f]{7,64}$/.test(revision)) return revision.slice(0, 8);
  return revision;
}
