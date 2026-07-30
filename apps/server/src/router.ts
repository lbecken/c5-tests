import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { layoutGraph, Repository, type DiffOptions, type Ref } from '@gitscope/core';

import { languageOf } from './language.js';
import { getChangeset, getConflict, getFileDiff } from './services.js';
import type { SessionStore } from './session.js';
import type {
  BlobResponse,
  CommitDetail,
  FileHistoryResponse,
  LogResponse,
  OpenRepoResponse,
  StatusResponse,
  TreeResponse,
} from './protocol.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RequestContext {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

type Handler = (context: RequestContext, params: Record<string, string>) => Promise<unknown>;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

/** Read the diff options the UI passes as query parameters. */
function diffOptionsFrom(query: URLSearchParams): DiffOptions {
  const options: DiffOptions = {};
  const algorithm = query.get('algorithm');
  if (algorithm === 'myers' || algorithm === 'histogram') options.algorithm = algorithm;
  const whitespace = query.get('whitespace');
  if (
    whitespace === 'none' ||
    whitespace === 'change' ||
    whitespace === 'leading' ||
    whitespace === 'trailing' ||
    whitespace === 'all'
  ) {
    options.whitespace = whitespace;
  }
  if (query.get('ignoreCase') === 'true') options.ignoreCase = true;
  if (query.get('indentHeuristic') === 'false') options.indentHeuristic = false;
  const context = query.get('context');
  if (context !== null) {
    const parsed = Number.parseInt(context, 10);
    if (Number.isFinite(parsed) && parsed >= 0) options.context = Math.min(parsed, 10_000);
  }
  return options;
}

function intParam(query: URLSearchParams, name: string, fallback: number): number {
  const raw = query.get(name);
  if (raw === null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createRouter(sessions: SessionStore): (context: RequestContext) => Promise<unknown> {
  const routes: Route[] = [];

  const on = (method: string, pattern: string, handler: Handler): void => {
    routes.push({ method, segments: pattern.split('/').filter(Boolean), handler });
  };

  /** Look up the session named in the URL, or fail with a clear 404. */
  const sessionOf = (params: Record<string, string>) => {
    const session = sessions.get(params.id ?? '');
    if (!session) throw new HttpError(404, `no open repository with id ${params.id}`);
    return session;
  };

  on('GET', '/health', async () => ({ ok: true, version: 1 }));

  on('GET', '/repos', async () => sessions.list().map((session) => session.summary));

  on('POST', '/repos', async (context) => {
    const body = context.body as { path?: string } | null;
    const path = body?.path;
    if (typeof path !== 'string' || path.length === 0) {
      throw new HttpError(400, 'a repository path is required');
    }
    const absolute = isAbsolute(path) ? path : resolve(process.cwd(), path);
    if (!(await Repository.detect(absolute))) {
      throw new HttpError(400, `${absolute} is not inside a git repository`);
    }
    const session = await sessions.open(absolute);
    const response: OpenRepoResponse = {
      repo: session.summary,
      state: await session.repo.state(),
    };
    return response;
  });

  on('DELETE', '/repos/:id', async (_context, params) => {
    sessions.close(params.id ?? '');
    return { ok: true };
  });

  on('GET', '/repos/:id/state', async (_context, params) => sessionOf(params).repo.state());

  on('GET', '/repos/:id/refs', async (_context, params) => sessionOf(params).repo.refs());

  on('GET', '/repos/:id/remotes', async (_context, params) => sessionOf(params).repo.remotes());

  on('GET', '/repos/:id/status', async (_context, params) => {
    const repo = sessionOf(params).repo;
    const [entries, state] = await Promise.all([repo.status(), repo.state()]);
    const response: StatusResponse = { entries, state };
    return response;
  });

  on('GET', '/repos/:id/log', async (context, params) => {
    const repo = sessionOf(params).repo;
    const query = context.query;
    const limit = Math.min(intParam(query, 'limit', 200), 5000);
    const skip = intParam(query, 'skip', 0);
    const paths = query.getAll('path');

    // Ask for one extra commit so the UI knows whether to offer "load more"
    // without a second round trip.
    const commits = await repo.log({
      limit: limit + 1,
      skip,
      all: query.get('all') !== 'false',
      revisions: query.getAll('rev'),
      paths: paths.length > 0 ? paths : undefined,
      grep: query.get('grep') ?? undefined,
      search: query.get('search') ?? undefined,
      author: query.get('author') ?? undefined,
      firstParent: query.get('firstParent') === 'true',
    });
    const hasMore = commits.length > limit;
    const page = hasMore ? commits.slice(0, limit) : commits;

    const refs = await repo.refs();
    const refsByCommit: Record<string, Ref[]> = {};
    for (const ref of refs) {
      const bucket = refsByCommit[ref.targetOid] ?? (refsByCommit[ref.targetOid] = []);
      bucket.push(ref);
    }

    const layout = layoutGraph(page);
    const response: LogResponse = {
      commits: page,
      graph: layout.rows,
      graphWidth: layout.maxWidth,
      refsByCommit,
      hasMore,
    };
    return response;
  });

  on('GET', '/repos/:id/commits/:oid', async (_context, params) => {
    const repo = sessionOf(params).repo;
    const oid = params.oid ?? '';
    const commit = await repo.commit(oid);
    if (!commit) throw new HttpError(404, `no commit ${oid}`);

    // A merge has more than one meaningful changeset; offer each parent.
    const parentCommits = await Promise.all(commit.parents.map((parent) => repo.commit(parent)));
    const from = commit.parents[0] ?? `${oid}^`;
    const changes = await repo.changedFiles(
      commit.parents.length > 0 ? from : emptyTree,
      oid,
    );
    const detail: CommitDetail = {
      commit,
      changes,
      parents: parentCommits.filter(Boolean).map((parent) => ({
        oid: parent!.oid,
        shortOid: parent!.shortOid,
        subject: parent!.subject,
      })),
    };
    return detail;
  });

  on('GET', '/repos/:id/changeset', async (context, params) => {
    const repo = sessionOf(params).repo;
    const from = context.query.get('from');
    const to = context.query.get('to');
    if (!from || !to) throw new HttpError(400, 'from and to revisions are required');
    return getChangeset(repo, from, to, context.query.getAll('path'));
  });

  on('GET', '/repos/:id/diff', async (context, params) => {
    const repo = sessionOf(params).repo;
    const query = context.query;
    const from = query.get('from');
    const to = query.get('to');
    const path = query.get('path');
    if (!from || !to || !path) throw new HttpError(400, 'from, to and path are required');
    return getFileDiff(
      repo,
      {
        from,
        to,
        path,
        oldPath: query.get('oldPath') ?? undefined,
        status: (query.get('status') as never) ?? undefined,
      },
      diffOptionsFrom(query),
    );
  });

  on('GET', '/repos/:id/file', async (context, params) => {
    const repo = sessionOf(params).repo;
    const rev = context.query.get('rev');
    const path = context.query.get('path');
    if (!rev || !path) throw new HttpError(400, 'rev and path are required');
    const blob = await repo.readFileAt(rev, path);
    if (!blob) throw new HttpError(404, `${path} does not exist at ${rev}`);
    const response: BlobResponse = { ...blob, path, language: languageOf(path) };
    return response;
  });

  on('GET', '/repos/:id/history', async (context, params) => {
    const repo = sessionOf(params).repo;
    const path = context.query.get('path');
    if (!path) throw new HttpError(400, 'path is required');
    const limit = Math.min(intParam(context.query, 'limit', 100), 2000);
    const skip = intParam(context.query, 'skip', 0);
    const entries = await repo.fileHistory(path, {
      limit: limit + 1,
      skip,
      follow: context.query.get('follow') !== 'false',
    });
    const response: FileHistoryResponse = {
      entries: entries.slice(0, limit),
      hasMore: entries.length > limit,
    };
    return response;
  });

  on('GET', '/repos/:id/tree', async (context, params) => {
    const repo = sessionOf(params).repo;
    const rev = context.query.get('rev') ?? 'HEAD';
    const response: TreeResponse = {
      entries: await repo.listTree(rev, context.query.get('path') ?? ''),
    };
    return response;
  });

  on('GET', '/repos/:id/conflict', async (context, params) => {
    const repo = sessionOf(params).repo;
    const path = context.query.get('path');
    if (!path) throw new HttpError(400, 'path is required');
    const conflict = await getConflict(repo, path);
    if (!conflict) throw new HttpError(404, `${path} is not conflicted`);
    return conflict;
  });

  // Directory listing, so the web build can offer an "open repository" browser
  // without a native file dialog.
  on('GET', '/fs/list', async (context) => {
    const path = context.query.get('path') ?? homedir();
    const absolute = isAbsolute(path) ? path : resolve(homedir(), path);
    const names = await readdir(absolute, { withFileTypes: true });
    const entries = await Promise.all(
      names
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .slice(0, 500)
        .map(async (entry) => {
          const child = join(absolute, entry.name);
          let isRepo = false;
          try {
            const gitDir = await stat(join(child, '.git'));
            isRepo = gitDir.isDirectory() || gitDir.isFile();
          } catch {
            isRepo = false;
          }
          return { name: entry.name, path: child, isRepo };
        }),
    );
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return { path: absolute, parent: resolve(absolute, '..'), entries };
  });

  return async (context) => {
    const requestSegments = context.path.split('/').filter(Boolean);
    for (const route of routes) {
      if (route.method !== context.method) continue;
      if (route.segments.length !== requestSegments.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.segments.length; i++) {
        const expected = route.segments[i]!;
        const actual = requestSegments[i]!;
        if (expected.startsWith(':')) {
          params[expected.slice(1)] = decodeURIComponent(actual);
        } else if (expected !== actual) {
          matched = false;
          break;
        }
      }
      if (matched) return route.handler(context, params);
    }
    throw new HttpError(404, `no route for ${context.method} ${context.path}`);
  };
}

/** git's empty tree object, used as the "before" side of a root commit. */
const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
