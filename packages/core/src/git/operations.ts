import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Repository } from './repository.js';

/**
 * Write operations.
 *
 * Everything here changes the repository, so each function is a thin, explicit
 * wrapper over one git command rather than a clever abstraction — when
 * something goes wrong you want to know exactly which command ran. Anything
 * that can destroy uncommitted work is named so that it cannot be invoked by
 * accident.
 */

export interface OperationResult {
  ok: boolean;
  /** git's own message, shown verbatim when an operation fails. */
  message: string;
}

async function attempt(
  repo: Repository,
  args: string[],
  options: { input?: Buffer | string } = {},
): Promise<OperationResult> {
  const result = await repo.exec(args, { throwOnError: false, input: options.input });
  if (result.exitCode === 0) {
    return { ok: true, message: result.stdout.toString('utf8').trim() };
  }
  return {
    ok: false,
    message: result.stderr.trim() || `git ${args[0]} failed with exit code ${result.exitCode}`,
  };
}

// ------------------------------------------------------------------ staging --

export function stage(repo: Repository, paths: string[]): Promise<OperationResult> {
  if (paths.length === 0) return Promise.resolve({ ok: true, message: '' });
  return attempt(repo, ['add', '--', ...paths]);
}

export function unstage(repo: Repository, paths: string[]): Promise<OperationResult> {
  if (paths.length === 0) return Promise.resolve({ ok: true, message: '' });
  return attempt(repo, ['restore', '--staged', '--', ...paths]);
}

/** Discard working-tree changes. Destructive and deliberately named as such. */
export function discardChanges(repo: Repository, paths: string[]): Promise<OperationResult> {
  if (paths.length === 0) return Promise.resolve({ ok: true, message: '' });
  return attempt(repo, ['checkout', '--', ...paths]);
}

/**
 * Apply a patch to the index or the working tree. This is how partial staging
 * works: the UI builds a patch for the selected hunks and hands it over, rather
 * than trying to reimplement index surgery.
 */
export function applyPatch(
  repo: Repository,
  patch: string,
  options: { reverse?: boolean; cached?: boolean } = {},
): Promise<OperationResult> {
  const args = ['apply', '--whitespace=nowarn', '--unidiff-zero'];
  if (options.cached) args.push('--cached');
  if (options.reverse) args.push('--reverse');
  args.push('-');
  return attempt(repo, args, { input: patch.endsWith('\n') ? patch : `${patch}\n` });
}

// ------------------------------------------------------------------ commits --

export interface CommitOptions {
  message: string;
  amend?: boolean;
  /** Stage every tracked modification first, like `git commit -a`. */
  all?: boolean;
  author?: string;
  signoff?: boolean;
  allowEmpty?: boolean;
}

export function commit(repo: Repository, options: CommitOptions): Promise<OperationResult> {
  const args = ['commit', '-m', options.message];
  if (options.amend) args.push('--amend');
  if (options.all) args.push('--all');
  if (options.author) args.push(`--author=${options.author}`);
  if (options.signoff) args.push('--signoff');
  if (options.allowEmpty) args.push('--allow-empty');
  return attempt(repo, args);
}

// ----------------------------------------------------------------- branches --

export function createBranch(
  repo: Repository,
  name: string,
  startPoint?: string,
  checkout = true,
): Promise<OperationResult> {
  const args = checkout ? ['checkout', '-b', name] : ['branch', name];
  if (startPoint) args.push(startPoint);
  return attempt(repo, args);
}

export function deleteBranch(repo: Repository, name: string, force = false): Promise<OperationResult> {
  return attempt(repo, ['branch', force ? '-D' : '-d', name]);
}

export function renameBranch(
  repo: Repository,
  from: string,
  to: string,
): Promise<OperationResult> {
  return attempt(repo, ['branch', '-m', from, to]);
}

export function checkout(repo: Repository, target: string): Promise<OperationResult> {
  return attempt(repo, ['checkout', target]);
}

export function createTag(
  repo: Repository,
  name: string,
  target?: string,
  message?: string,
): Promise<OperationResult> {
  const args = message ? ['tag', '-a', name, '-m', message] : ['tag', name];
  if (target) args.push(target);
  return attempt(repo, args);
}

export function deleteTag(repo: Repository, name: string): Promise<OperationResult> {
  return attempt(repo, ['tag', '-d', name]);
}

// ------------------------------------------------------------------- stash --

export function stashPush(
  repo: Repository,
  options: { message?: string; includeUntracked?: boolean; keepIndex?: boolean } = {},
): Promise<OperationResult> {
  const args = ['stash', 'push'];
  if (options.includeUntracked) args.push('--include-untracked');
  if (options.keepIndex) args.push('--keep-index');
  if (options.message) args.push('-m', options.message);
  return attempt(repo, args);
}

export function stashApply(repo: Repository, ref: string, drop: boolean): Promise<OperationResult> {
  return attempt(repo, ['stash', drop ? 'pop' : 'apply', ref]);
}

export function stashDrop(repo: Repository, ref: string): Promise<OperationResult> {
  return attempt(repo, ['stash', 'drop', ref]);
}

export async function stashList(
  repo: Repository,
): Promise<Array<{ ref: string; message: string; date: string }>> {
  const result = await repo.exec(
    ['stash', 'list', '--format=%gd%x00%gs%x00%aI'],
    { throwOnError: false },
  );
  if (result.exitCode !== 0) return [];
  return result.stdout
    .toString('utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [ref, message, date] = line.split('\0');
      return { ref: ref ?? '', message: message ?? '', date: date ?? '' };
    });
}

// ------------------------------------------------------ history-altering ops --

export function merge(
  repo: Repository,
  target: string,
  options: { noFastForward?: boolean; squash?: boolean } = {},
): Promise<OperationResult> {
  const args = ['merge', '--no-edit'];
  if (options.noFastForward) args.push('--no-ff');
  if (options.squash) args.push('--squash');
  args.push(target);
  return attempt(repo, args);
}

export function rebase(
  repo: Repository,
  onto: string,
  options: { interactive?: boolean } = {},
): Promise<OperationResult> {
  const args = ['rebase'];
  if (options.interactive) args.push('--interactive');
  args.push(onto);
  return attempt(repo, args);
}

export function cherryPick(repo: Repository, oids: string[]): Promise<OperationResult> {
  return attempt(repo, ['cherry-pick', ...oids]);
}

export function revert(repo: Repository, oids: string[]): Promise<OperationResult> {
  return attempt(repo, ['revert', '--no-edit', ...oids]);
}

/** Abort or continue whichever multi-step operation is in progress. */
export function continueOperation(
  repo: Repository,
  operation: 'merge' | 'rebase' | 'cherry-pick' | 'revert',
  action: 'continue' | 'abort' | 'skip',
): Promise<OperationResult> {
  const command = operation === 'cherry-pick' ? 'cherry-pick' : operation;
  const args = [command, `--${action}`];
  // `git merge --continue` opens an editor unless told otherwise.
  if (command === 'merge' && action === 'continue') args.push('--no-edit');
  return attempt(repo, args);
}

// ------------------------------------------------------------------ remotes --

export function fetch(repo: Repository, remote?: string, prune = true): Promise<OperationResult> {
  const args = ['fetch'];
  if (prune) args.push('--prune');
  args.push(remote ?? '--all');
  return attempt(repo, args);
}

export function pull(
  repo: Repository,
  options: { rebase?: boolean; remote?: string; branch?: string } = {},
): Promise<OperationResult> {
  const args = ['pull'];
  args.push(options.rebase ? '--rebase' : '--no-rebase');
  if (options.remote) args.push(options.remote);
  if (options.branch) args.push(options.branch);
  return attempt(repo, args);
}

export function push(
  repo: Repository,
  options: { remote?: string; branch?: string; setUpstream?: boolean; force?: boolean } = {},
): Promise<OperationResult> {
  const args = ['push'];
  if (options.setUpstream) args.push('--set-upstream');
  // Force-with-lease refuses to overwrite work that arrived since the last
  // fetch; plain --force is never offered.
  if (options.force) args.push('--force-with-lease');
  if (options.remote) args.push(options.remote);
  if (options.branch) args.push(options.branch);
  return attempt(repo, args);
}

// -------------------------------------------------------------- resolutions --

/**
 * Write a resolved file and mark it resolved. Writing the bytes and staging
 * them is one action from the user's point of view, and leaving the file
 * written but unstaged is the state that confuses people most.
 */
export async function resolveConflict(
  repo: Repository,
  path: string,
  content: string,
): Promise<OperationResult> {
  const target = join(repo.root, path);
  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  } catch (error) {
    return { ok: false, message: `could not write ${path}: ${(error as Error).message}` };
  }
  return attempt(repo, ['add', '--', path]);
}

/** Resolve a conflicted path by taking one side wholesale. */
export function takeSide(
  repo: Repository,
  path: string,
  side: 'ours' | 'theirs',
): Promise<OperationResult> {
  return attempt(repo, ['checkout', `--${side}`, '--', path]).then(async (result) =>
    result.ok ? attempt(repo, ['add', '--', path]) : result,
  );
}
