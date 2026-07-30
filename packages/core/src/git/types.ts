/** Typed model of the parts of git the UI needs. */

export interface Signature {
  name: string;
  email: string;
  /** ISO-8601 with the author's original offset preserved. */
  date: string;
}

export interface Commit {
  oid: string;
  shortOid: string;
  parents: string[];
  author: Signature;
  committer: Signature;
  subject: string;
  body: string;
  /** Refs pointing at this commit, resolved separately from `for-each-ref`. */
  refs?: RefName[];
}

export interface RefName {
  name: string;
  kind: RefKind;
}

export type RefKind = 'head' | 'branch' | 'remote' | 'tag' | 'stash' | 'other';

export interface Ref {
  /** Full ref name, e.g. `refs/heads/main`. */
  fullName: string;
  /** Display name, e.g. `main` or `origin/main`. */
  name: string;
  kind: RefKind;
  oid: string;
  /** For annotated tags, the commit the tag ultimately points at. */
  targetOid: string;
  isHead: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
  subject?: string;
  date?: string;
}

export interface Remote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface HeadInfo {
  oid: string | null;
  /** Branch short name, or null when HEAD is detached or unborn. */
  branch: string | null;
  detached: boolean;
  /** True for a repository with no commits yet. */
  unborn: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
}

/** In-progress multi-step operations, which change what actions make sense. */
export type PendingOperation =
  | 'none'
  | 'merge'
  | 'rebase'
  | 'rebase-interactive'
  | 'cherry-pick'
  | 'revert'
  | 'bisect';

export interface RepoState {
  head: HeadInfo;
  operation: PendingOperation;
  /** Paths with unresolved conflicts. */
  conflicted: string[];
  /** Set during a merge/cherry-pick: the commit being merged in. */
  mergeHeads?: string[];
}

export type ChangeStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'typechange'
  | 'unmerged'
  | 'untracked'
  | 'ignored';

export interface FileChange {
  path: string;
  /** Previous path for renames and copies. */
  oldPath?: string;
  status: ChangeStatus;
  /** Rename/copy similarity as a percentage. */
  similarity?: number;
  oldOid?: string;
  newOid?: string;
  oldMode?: string;
  newMode?: string;
  additions?: number;
  deletions?: number;
  isBinary?: boolean;
  /** True when the entry is a submodule (gitlink). */
  isSubmodule?: boolean;
}

export interface StatusEntry {
  path: string;
  oldPath?: string;
  /** Change between HEAD and the index. */
  indexStatus: ChangeStatus | 'unchanged';
  /** Change between the index and the working tree. */
  worktreeStatus: ChangeStatus | 'unchanged';
  isConflicted: boolean;
  /** Conflict stage OIDs, when conflicted. */
  stages?: { base?: string; ours?: string; theirs?: string };
  isSubmodule?: boolean;
}

export interface TreeEntry {
  path: string;
  name: string;
  mode: string;
  oid: string;
  type: 'blob' | 'tree' | 'commit';
  size?: number;
}

export interface BlobContent {
  oid: string;
  /** Decoded text; absent when the blob is binary. */
  text?: string;
  size: number;
  isBinary: boolean;
  encoding?: string;
  noFinalNewline?: boolean;
}

export interface LogOptions {
  /** Revision range or list of revisions. Defaults to HEAD. */
  revisions?: string[];
  /** Restrict history to these paths. */
  paths?: string[];
  limit?: number;
  skip?: number;
  /** Include every ref, not just the current branch. */
  all?: boolean;
  /** Follow renames; only valid with exactly one path. */
  follow?: boolean;
  /** Text search over commit messages. */
  grep?: string;
  /** Text search over the patch content (`git log -S`). */
  search?: string;
  author?: string;
  since?: string;
  until?: string;
  /** Parents before children, so graph rendering never has to look ahead. */
  topoOrder?: boolean;
  /** Only show commits that changed the given paths (default true when paths set). */
  simplify?: boolean;
  firstParent?: boolean;
}
