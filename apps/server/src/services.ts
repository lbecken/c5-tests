import {
  buildTextDiff,
  merge3,
  splitLines,
  type BlobContent,
  type DiffOptions,
  type FileChange,
  type Repository,
} from '@gitscope/core';
import { INDEX, WORKTREE } from '@gitscope/core';

import { languageOf } from './language.js';
import type {
  ChangesetResponse,
  ConflictResponse,
  FileDiffResponse,
} from './protocol.js';

/** Files above this size are not worth aligning line by line in a browser. */
const MAX_DIFF_BYTES = 12 * 1024 * 1024;

/** A revision as the user should see it named. */
export function revisionLabel(revision: string): string {
  if (revision === WORKTREE) return 'Working copy';
  if (revision === INDEX) return 'Staged';
  if (/^[0-9a-f]{40}$/.test(revision)) return revision.slice(0, 8);
  return revision;
}

/**
 * Which side of the comparison a file existed on. A rename means the old side
 * is under a different path, which is the whole reason `oldPath` is threaded
 * through the diff request.
 */
function sidesFor(change: Pick<FileChange, 'status' | 'path' | 'oldPath'>): {
  oldPath: string | null;
  newPath: string | null;
} {
  switch (change.status) {
    case 'added':
    case 'untracked':
      return { oldPath: null, newPath: change.path };
    case 'deleted':
      return { oldPath: change.oldPath ?? change.path, newPath: null };
    case 'renamed':
    case 'copied':
      return { oldPath: change.oldPath ?? change.path, newPath: change.path };
    default:
      return { oldPath: change.oldPath ?? change.path, newPath: change.path };
  }
}

export async function getFileDiff(
  repo: Repository,
  params: {
    from: string;
    to: string;
    path: string;
    oldPath?: string;
    status?: FileChange['status'];
  },
  options: DiffOptions = {},
): Promise<FileDiffResponse> {
  const status = params.status ?? 'modified';
  const { oldPath, newPath } = sidesFor({
    status,
    path: params.path,
    oldPath: params.oldPath,
  });

  const [oldBlob, newBlob] = await Promise.all([
    oldPath ? repo.readFileAt(params.from, oldPath) : Promise.resolve(null),
    newPath ? repo.readFileAt(params.to, newPath) : Promise.resolve(null),
  ]);

  const base: Omit<FileDiffResponse, 'kind'> = {
    path: params.path,
    oldPath: params.oldPath,
    status,
    language: languageOf(params.path),
    oldSize: oldBlob?.size,
    newSize: newBlob?.size,
  };

  if (!oldBlob && !newBlob) return { ...base, kind: 'missing' };
  if (oldBlob?.isBinary || newBlob?.isBinary) return { ...base, kind: 'binary' };
  if ((oldBlob?.size ?? 0) > MAX_DIFF_BYTES || (newBlob?.size ?? 0) > MAX_DIFF_BYTES) {
    return { ...base, kind: 'too-large' };
  }

  const left = splitBlob(oldBlob);
  const right = splitBlob(newBlob);
  const diff = buildTextDiff(
    left.lines,
    right.lines,
    options,
    left.noFinalNewline,
    right.noFinalNewline,
  );
  return { ...base, kind: 'text', diff };
}

function splitBlob(blob: BlobContent | null): { lines: string[]; noFinalNewline: boolean } {
  if (!blob || blob.text === undefined) return { lines: [], noFinalNewline: false };
  const split = splitLines(blob.text);
  return { lines: split.lines, noFinalNewline: split.noFinalNewline };
}

export async function getChangeset(
  repo: Repository,
  from: string,
  to: string,
  paths?: string[],
  options: DiffOptions = {},
): Promise<ChangesetResponse> {
  const changes = await repo.changedFiles(from, to, {
    paths,
    algorithm: options.algorithm ?? 'histogram',
  });
  let additions = 0;
  let deletions = 0;
  for (const change of changes) {
    additions += change.additions ?? 0;
    deletions += change.deletions ?? 0;
  }
  return {
    from,
    to,
    fromLabel: revisionLabel(from),
    toLabel: revisionLabel(to),
    changes,
    totals: { files: changes.length, additions, deletions },
  };
}

/**
 * Everything needed to resolve one conflicted file: the three stages, the
 * merge regions, and — the part that actually makes a conflict resolvable —
 * the commits each side contributed since they diverged.
 */
export async function getConflict(
  repo: Repository,
  path: string,
): Promise<ConflictResponse | null> {
  const stages = await repo.conflictStages(path);
  if (!stages.ours && !stages.theirs) return null;

  const base = stages.base?.text ? splitLines(stages.base.text).lines : [];
  const ours = stages.ours?.text ? splitLines(stages.ours.text).lines : [];
  const theirs = stages.theirs?.text ? splitLines(stages.theirs.text).lines : [];
  const merged = merge3(base, ours, theirs);

  const state = await repo.state();
  const theirsRef = state.mergeHeads?.[0] ?? 'MERGE_HEAD';
  const oursLabel = state.head.branch ?? state.head.oid?.slice(0, 8) ?? 'HEAD';
  const theirsLabel = await describeRevision(repo, theirsRef);

  const mergeBase = state.head.oid ? await repo.mergeBase(state.head.oid, theirsRef) : null;
  const [oursCommits, theirsCommits] = await Promise.all([
    mergeBase && state.head.oid
      ? repo.log({ revisions: [`${mergeBase}..${state.head.oid}`], limit: 50, paths: [path] })
      : Promise.resolve([]),
    mergeBase
      ? repo.log({ revisions: [`${mergeBase}..${theirsRef}`], limit: 50, paths: [path] })
      : Promise.resolve([]),
  ]);

  return {
    path,
    regions: merged.regions,
    base,
    ours,
    theirs,
    conflictCount: merged.conflictCount,
    labels: {
      ours: oursLabel,
      theirs: theirsLabel,
      base: mergeBase ? `merge base ${mergeBase.slice(0, 8)}` : 'common ancestor',
    },
    oursCommits,
    theirsCommits,
  };
}

/** Best available human name for a revision: a ref if there is one, else a short oid. */
export async function describeRevision(repo: Repository, revision: string): Promise<string> {
  const refs = await repo.refs();
  const oid = await repo.revParse(revision);
  if (oid) {
    const match = refs.find((ref) => ref.targetOid === oid && ref.kind !== 'remote');
    if (match) return match.name;
    return oid.slice(0, 8);
  }
  return revision;
}
