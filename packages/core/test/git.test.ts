import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { INDEX, Repository, WORKTREE } from '../src/git/repository.js';
import { TempRepo } from './helpers/tempRepo.js';

let temp: TempRepo;
let repo: Repository;
let first: string;
let second: string;
let third: string;

beforeAll(async () => {
  temp = await TempRepo.create();
  first = await temp.commit('initial commit', {
    'README.md': '# Project\n\nHello.\n',
    'src/app.ts': 'export function app() {\n  return 1;\n}\n',
  });
  second = await temp.commit('add a helper\n\nWith a longer body explaining why.\n', {
    'src/helper.ts': 'export const helper = () => 2;\n',
    'src/app.ts': 'export function app() {\n  return 2;\n}\n',
  });
  await temp.git(['mv', 'src/helper.ts', 'src/util.ts']);
  third = await temp.commit('rename helper to util');
  repo = await Repository.open(temp.dir);
});

afterAll(async () => {
  repo?.dispose();
  await temp?.destroy();
});

describe('Repository', () => {
  it('opens the repository and reports its root', async () => {
    expect(repo.root).toBe(await realpath(temp.dir));
  });

  it('reads HEAD', async () => {
    const head = await repo.head();
    expect(head).toMatchObject({ branch: 'main', detached: false, unborn: false });
    expect(head.oid).toBe(third);
  });

  it('lists commits newest first with parents and messages', async () => {
    const commits = await repo.log({ limit: 10 });
    expect(commits.map((commit) => commit.oid)).toEqual([third, second, first]);
    expect(commits[1]).toMatchObject({
      subject: 'add a helper',
      body: 'With a longer body explaining why.',
      parents: [first],
    });
    expect(commits[1]!.author).toMatchObject({ name: 'Test User', email: 'test@example.com' });
    expect(commits[2]!.parents).toEqual([]);
  });

  it('reads a single commit by oid', async () => {
    const commit = await repo.commit(second);
    expect(commit?.subject).toBe('add a helper');
    expect(commit?.shortOid).toBe(second.slice(0, commit!.shortOid.length));
  });

  it('lists refs including branches', async () => {
    const refs = await repo.refs();
    const main = refs.find((ref) => ref.name === 'main');
    expect(main).toMatchObject({ kind: 'branch', isHead: true, oid: third });
  });

  it('detects changed files between two commits', async () => {
    const changes = await repo.changedFiles(first, second);
    const byPath = Object.fromEntries(changes.map((change) => [change.path, change]));
    expect(byPath['src/helper.ts']).toMatchObject({ status: 'added' });
    expect(byPath['src/app.ts']).toMatchObject({ status: 'modified', additions: 1, deletions: 1 });
  });

  it('detects renames with a similarity score', async () => {
    const changes = await repo.changedFiles(second, third);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      status: 'renamed',
      path: 'src/util.ts',
      oldPath: 'src/helper.ts',
      similarity: 100,
    });
  });

  it('reads file contents at a revision', async () => {
    const blob = await repo.readFileAt(first, 'src/app.ts');
    expect(blob?.text).toBe('export function app() {\n  return 1;\n}\n');
    expect(blob?.isBinary).toBe(false);
    expect(await repo.readFileAt(first, 'src/util.ts')).toBeNull();
  });

  it('detects binary content', async () => {
    await writeFile(join(temp.dir, 'blob.bin'), Buffer.from([1, 2, 0, 3, 4]));
    await temp.git(['add', 'blob.bin']);
    const staged = await repo.readFileAt(INDEX, 'blob.bin');
    expect(staged?.isBinary).toBe(true);
    expect(staged?.text).toBeUndefined();
    await temp.git(['rm', '-f', '-q', '--cached', 'blob.bin']);
    await rm(join(temp.dir, 'blob.bin'));
  });

  it('follows a file through a rename in its history', async () => {
    const history = await repo.fileHistory('src/util.ts');
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0]!.commit.oid).toBe(third);
    expect(history[0]!.status.startsWith('R')).toBe(true);
    expect(history[0]!.oldPath).toBe('src/helper.ts');
    expect(history[1]!.commit.oid).toBe(second);
    expect(history[1]!.path).toBe('src/helper.ts');
  });

  it('lists tree entries at a revision', async () => {
    const entries = await repo.listTree(third);
    expect(entries.map((entry) => entry.path).sort()).toEqual([
      'README.md',
      'src/app.ts',
      'src/util.ts',
    ]);
    expect(entries[0]!.type).toBe('blob');
  });

  it('reports working copy status for staged, unstaged and untracked files', async () => {
    await temp.write('src/app.ts', 'export function app() {\n  return 3;\n}\n');
    await temp.write('staged.txt', 'staged\n');
    await temp.write('untracked.txt', 'untracked\n');
    await temp.git(['add', 'staged.txt']);

    const status = await repo.status();
    const byPath = Object.fromEntries(status.map((entry) => [entry.path, entry]));
    expect(byPath['src/app.ts']).toMatchObject({
      indexStatus: 'unchanged',
      worktreeStatus: 'modified',
    });
    expect(byPath['staged.txt']).toMatchObject({ indexStatus: 'added' });
    expect(byPath['untracked.txt']).toMatchObject({ worktreeStatus: 'untracked' });

    // The working copy compared against HEAD must include untracked files,
    // otherwise a review of "what have I done" silently omits new files.
    const changes = await repo.changedFiles('HEAD', WORKTREE);
    const paths = changes.map((change) => change.path);
    expect(paths).toContain('src/app.ts');
    expect(paths).toContain('staged.txt');
    expect(paths).toContain('untracked.txt');

    const stagedOnly = await repo.changedFiles('HEAD', INDEX);
    expect(stagedOnly.map((change) => change.path)).toEqual(['staged.txt']);

    await temp.git(['reset', '-q', '--hard', 'HEAD']);
    await rm(join(temp.dir, 'untracked.txt'), { force: true });
  });

  it('reports a clean state with no pending operation', async () => {
    const state = await repo.state();
    expect(state.operation).toBe('none');
    expect(state.conflicted).toEqual([]);
  });

  it('surfaces conflict stages during a real merge conflict', async () => {
    await temp.git(['checkout', '-q', '-b', 'side', first]);
    await temp.commit('side change', { 'src/app.ts': 'export function app() {\n  return 99;\n}\n' });
    await temp.git(['checkout', '-q', 'main']);
    const result = await temp.git(['merge', '--no-edit', 'side']);
    expect(result.exitCode).not.toBe(0);

    const state = await repo.state();
    expect(state.operation).toBe('merge');
    expect(state.conflicted).toContain('src/app.ts');

    const stages = await repo.conflictStages('src/app.ts');
    expect(stages.base?.text).toBe('export function app() {\n  return 1;\n}\n');
    expect(stages.ours?.text).toBe('export function app() {\n  return 2;\n}\n');
    expect(stages.theirs?.text).toBe('export function app() {\n  return 99;\n}\n');

    await temp.git(['merge', '--abort']);
  });

  it('resolves merge bases', async () => {
    expect(await repo.mergeBase('main', 'side')).toBe(first);
  });
});

async function realpath(path: string): Promise<string> {
  const { realpath: rp } = await import('node:fs/promises');
  return rp(path);
}
