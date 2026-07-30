import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TempRepo } from '../../../packages/core/test/helpers/tempRepo.js';
import { startServer, type RunningServer } from '../src/index.js';
import type {
  ChangesetResponse,
  FileDiffResponse,
  FileHistoryResponse,
  LogResponse,
  OpenRepoResponse,
  StatusResponse,
} from '../src/protocol.js';

let temp: TempRepo;
let server: RunningServer;
let repoId: string;
let first: string;
let second: string;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${server.url}/api${path}`, init);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(`${response.status}: ${payload.error}`);
  return payload;
}

beforeAll(async () => {
  temp = await TempRepo.create();
  first = await temp.commit('initial', {
    'README.md': '# Demo\n',
    'src/app.ts': 'export const version = 1;\nexport const name = "demo";\n',
  });
  second = await temp.commit('bump version', {
    'src/app.ts': 'export const version = 2;\nexport const name = "demo";\n',
  });
  server = await startServer({ port: 0 });
  const opened = await api<OpenRepoResponse>('/repos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: temp.dir }),
  });
  repoId = opened.repo.id;
});

afterAll(async () => {
  await server?.close();
  await temp?.destroy();
});

describe('server API', () => {
  it('reports health', async () => {
    expect(await api('/health')).toMatchObject({ ok: true });
  });

  it('opens a repository and reports its state', async () => {
    const repos = await api<Array<{ id: string; name: string }>>('/repos');
    expect(repos).toHaveLength(1);
    expect(repos[0]!.id).toBe(repoId);
  });

  it('rejects a path that is not a repository', async () => {
    const response = await fetch(`${server.url}/api/repos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '/' }),
    });
    expect(response.status).toBe(400);
  });

  it('returns the log with graph lanes and refs', async () => {
    const log = await api<LogResponse>(`/repos/${repoId}/log?limit=10`);
    expect(log.commits.map((commit) => commit.oid)).toEqual([second, first]);
    expect(log.graph).toHaveLength(2);
    expect(log.graph[0]!.lane).toBe(0);
    expect(log.graphWidth).toBe(1);
    expect(log.refsByCommit[second]?.some((ref) => ref.name === 'main')).toBe(true);
    expect(log.hasMore).toBe(false);
  });

  it('paginates the log', async () => {
    const page = await api<LogResponse>(`/repos/${repoId}/log?limit=1`);
    expect(page.commits).toHaveLength(1);
    expect(page.hasMore).toBe(true);
  });

  it('returns a changeset between two commits', async () => {
    const changeset = await api<ChangesetResponse>(
      `/repos/${repoId}/changeset?from=${first}&to=${second}`,
    );
    expect(changeset.changes.map((change) => change.path)).toEqual(['src/app.ts']);
    expect(changeset.totals).toEqual({ files: 1, additions: 1, deletions: 1 });
  });

  it('returns an aligned diff with character-level spans', async () => {
    const diff = await api<FileDiffResponse>(
      `/repos/${repoId}/diff?from=${first}&to=${second}&path=src/app.ts`,
    );
    expect(diff.kind).toBe('text');
    expect(diff.language).toBe('typescript');
    const changed = diff.diff!.rows.find((row) => row.kind === 'replace')!;
    expect(changed.a!.text).toBe('export const version = 1;');
    expect(changed.b!.text).toBe('export const version = 2;');
    expect(changed.a!.spans).toEqual([{ start: 23, end: 24, emphasis: 'strong' }]);
  });

  it('diffs a file that was added', async () => {
    const diff = await api<FileDiffResponse>(
      `/repos/${repoId}/diff?from=${first}&to=${second}&path=src/new.ts&status=added`,
    );
    expect(diff.kind).toBe('missing');
  });

  it('honours whitespace options', async () => {
    await temp.write('src/app.ts', 'export const version   = 2;\nexport const name = "demo";\n');
    const strict = await api<FileDiffResponse>(
      `/repos/${repoId}/diff?from=${second}&to=:worktree&path=src/app.ts`,
    );
    expect(strict.diff!.stats.modifications).toBe(1);
    const relaxed = await api<FileDiffResponse>(
      `/repos/${repoId}/diff?from=${second}&to=:worktree&path=src/app.ts&whitespace=change`,
    );
    expect(relaxed.diff!.stats.modifications).toBe(0);
    await temp.git(['checkout', '--', 'src/app.ts']);
  });

  it('includes untracked files when comparing against the working copy', async () => {
    await temp.write('scratch.txt', 'hello\n');
    const changeset = await api<ChangesetResponse>(
      `/repos/${repoId}/changeset?from=HEAD&to=:worktree`,
    );
    expect(changeset.changes.map((change) => change.path)).toContain('scratch.txt');
    const status = await api<StatusResponse>(`/repos/${repoId}/status`);
    expect(status.entries.some((entry) => entry.path === 'scratch.txt')).toBe(true);
    expect(status.state.operation).toBe('none');
  });

  it('returns file history newest first', async () => {
    const history = await api<FileHistoryResponse>(
      `/repos/${repoId}/history?path=src/app.ts&limit=10`,
    );
    expect(history.entries.map((entry) => entry.commit.subject)).toEqual([
      'bump version',
      'initial',
    ]);
  });

  it('returns file contents at a revision', async () => {
    const blob = await api<{ text: string; language: string }>(
      `/repos/${repoId}/file?rev=${first}&path=src/app.ts`,
    );
    expect(blob.text).toBe('export const version = 1;\nexport const name = "demo";\n');
    expect(blob.language).toBe('typescript');
  });

  it('returns a commit detail with its changed files', async () => {
    const detail = await api<{ commit: { subject: string }; changes: Array<{ path: string }> }>(
      `/repos/${repoId}/commits/${second}`,
    );
    expect(detail.commit.subject).toBe('bump version');
    expect(detail.changes.map((change) => change.path)).toEqual(['src/app.ts']);
  });

  it('treats a root commit as a diff against the empty tree', async () => {
    const detail = await api<{ changes: Array<{ path: string; status: string }> }>(
      `/repos/${repoId}/commits/${first}`,
    );
    expect(detail.changes.map((change) => change.path).sort()).toEqual(['README.md', 'src/app.ts']);
    expect(detail.changes.every((change) => change.status === 'added')).toBe(true);
  });

  it('404s for an unknown repository and an unknown route', async () => {
    expect((await fetch(`${server.url}/api/repos/nope/state`)).status).toBe(404);
    expect((await fetch(`${server.url}/api/nothing`)).status).toBe(404);
  });

  it('rejects cross-origin requests', async () => {
    const response = await fetch(`${server.url}/api/repos`, {
      headers: { origin: 'https://evil.example.com' },
    });
    expect(response.status).toBe(403);
  });

  it('pushes a live update over the websocket when the working copy changes', async () => {
    const { WebSocket } = await import('ws');
    const socket = new WebSocket(`${server.url.replace('http', 'ws')}/api/events?repo=${repoId}`);
    await new Promise((done) => socket.once('open', done));

    const received = new Promise<string>((done) => {
      socket.on('message', (data) => done(data.toString()));
    });
    await temp.write('scratch.txt', 'changed\n');
    const message = await Promise.race([
      received,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);
    const event = JSON.parse(message) as { type: string; repoId: string; reasons: string[] };
    expect(event.type).toBe('repo-changed');
    expect(event.repoId).toBe(repoId);
    expect(event.reasons).toContain('worktree');
    socket.close();
  });
});
