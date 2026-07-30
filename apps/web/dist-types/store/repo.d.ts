import type { Ref, RepoState } from '@gitscope/core';
import type { ChangeReason, RepoSummary } from '@gitscope/server/protocol';
export declare const REV_WORKTREE = ":worktree";
export declare const REV_INDEX = ":index";
/**
 * Where the user is. Every view is fully described by its parameters, so
 * navigation is just replacing this value — which makes back/forward, deep
 * links from the CLI, and restoring the last session all the same mechanism.
 */
export type View = {
    kind: 'working';
    path?: string;
    staged?: boolean;
} | {
    kind: 'graph';
    selected?: string;
} | {
    kind: 'commit';
    oid: string;
    parent?: string;
    path?: string;
} | {
    kind: 'changeset';
    from: string;
    to: string;
    path?: string;
} | {
    kind: 'history';
    path: string;
    from?: string;
    to?: string;
} | {
    kind: 'conflicts';
    path?: string;
} | {
    kind: 'compare';
    left?: string;
    right?: string;
} | {
    kind: 'directories';
    left?: string;
    right?: string;
};
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
    navigate: (view: View, options?: {
        replace?: boolean;
    }) => void;
    back: () => void;
    forward: () => void;
    canGoBack: () => boolean;
    canGoForward: () => boolean;
}
export declare const useRepoStore: import("zustand").UseBoundStore<import("zustand").StoreApi<RepoStoreState>>;
/** Short, human label for a revision as it appears in column headings. */
export declare function revisionLabel(revision: string, refs: readonly Ref[]): string;
export {};
//# sourceMappingURL=repo.d.ts.map