import type {
  BlobContent,
  Commit,
  DiffOptions,
  FileChange,
  GraphRow,
  MergeRegion,
  Ref,
  RepoState,
  StatusEntry,
  TextDiff,
  TreeEntry,
} from '@gitscope/core';

/**
 * The wire contract between the server and the UI. Both sides import these
 * types, so a change to an endpoint's shape is a compile error rather than a
 * runtime surprise.
 */

export interface RepoSummary {
  id: string;
  root: string;
  name: string;
  isBare: boolean;
}

export interface OpenRepoResponse {
  repo: RepoSummary;
  state: RepoState;
}

export interface LogResponse {
  commits: Commit[];
  /** Lane layout parallel to `commits`, computed server-side. */
  graph: GraphRow[];
  graphWidth: number;
  /** Refs pointing at loaded commits, keyed by commit oid. */
  refsByCommit: Record<string, Ref[]>;
  hasMore: boolean;
}

export interface CommitDetail {
  commit: Commit;
  changes: FileChange[];
  /** Parent oids paired with a label for the changeset selector on merges. */
  parents: Array<{ oid: string; shortOid: string; subject: string }>;
}

export interface ChangesetResponse {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  changes: FileChange[];
  totals: { files: number; additions: number; deletions: number };
}

export type FileDiffKind = 'text' | 'binary' | 'submodule' | 'too-large' | 'missing';

export interface FileDiffResponse {
  kind: FileDiffKind;
  path: string;
  oldPath?: string;
  status: FileChange['status'];
  diff?: TextDiff;
  /** Populated for binary comparisons so the UI can report what changed. */
  oldSize?: number;
  newSize?: number;
  language?: string;
}

export interface FileHistoryEntry {
  commit: Commit;
  path: string;
  status: string;
  oldPath?: string;
}

export interface FileHistoryResponse {
  entries: FileHistoryEntry[];
  hasMore: boolean;
}

export interface ConflictResponse {
  path: string;
  regions: MergeRegion[];
  base: string[];
  ours: string[];
  theirs: string[];
  conflictCount: number;
  /** Labels for each side, e.g. `HEAD (main)` and `feature/x`. */
  labels: { ours: string; theirs: string; base: string };
  /** Commits that diverged since the merge base, so the conflict has context. */
  oursCommits: Commit[];
  theirsCommits: Commit[];
}

export interface TreeCompareEntry {
  path: string;
  name: string;
  type: 'blob' | 'tree' | 'commit';
  status: 'same' | 'added' | 'removed' | 'modified' | 'typechange';
  leftSize?: number;
  rightSize?: number;
  leftMtime?: number;
  rightMtime?: number;
  /** Depth-first children for directories. */
  children?: TreeCompareEntry[];
}

export interface DirectoryCompareResponse {
  left: string;
  right: string;
  entries: TreeCompareEntry[];
  totals: { added: number; removed: number; modified: number; same: number };
}

export interface StatusResponse {
  entries: StatusEntry[];
  state: RepoState;
}

export interface BlobResponse extends BlobContent {
  path: string;
  language?: string;
}

export interface TreeResponse {
  entries: TreeEntry[];
}

export type ServerEvent =
  | { type: 'repo-changed'; repoId: string; reasons: ChangeReason[] }
  | { type: 'error'; message: string };

export type ChangeReason = 'worktree' | 'index' | 'refs' | 'head' | 'operation';

export interface DiffQuery extends DiffOptions {
  from: string;
  to: string;
  path: string;
  oldPath?: string;
}

/** Aliases understood everywhere a revision is accepted. */
export const REV_WORKTREE = ':worktree';
export const REV_INDEX = ':index';
