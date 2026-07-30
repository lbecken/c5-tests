import type {
  BlobResponse,
  ChangesetResponse,
  CommitDetail,
  ConflictResponse,
  DirectoryCompareResponse,
  FileDiffResponse,
  FileHistoryResponse,
  LogResponse,
  OpenRepoResponse,
  RepoSummary,
  ServerEvent,
  StatusResponse,
  TreeResponse,
} from '@gitscope/server/protocol';
import type { DiffOptions, Ref, Remote, RepoState } from '@gitscope/core';

/** Typed client for the local server. Every call goes through `request`. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  const payload = text.length > 0 ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : response.statusText;
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

function query(params: Record<string, string | number | boolean | undefined | string[]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text.length > 0 ? `?${text}` : '';
}

function diffParams(options: DiffOptions | undefined): Record<string, string | number | boolean> {
  if (!options) return {};
  const params: Record<string, string | number | boolean> = {};
  if (options.algorithm) params.algorithm = options.algorithm;
  if (options.whitespace) params.whitespace = options.whitespace;
  if (options.ignoreCase) params.ignoreCase = true;
  if (options.indentHeuristic === false) params.indentHeuristic = false;
  if (options.context !== undefined) params.context = options.context;
  return params;
}

export const api = {
  health: () => request<{ ok: boolean }>('/health'),

  listRepos: () => request<RepoSummary[]>('/repos'),

  openRepo: (path: string) =>
    request<OpenRepoResponse>('/repos', { method: 'POST', body: JSON.stringify({ path }) }),

  closeRepo: (id: string) => request<{ ok: true }>(`/repos/${id}`, { method: 'DELETE' }),

  state: (id: string) => request<RepoState>(`/repos/${id}/state`),

  refs: (id: string) => request<Ref[]>(`/repos/${id}/refs`),

  remotes: (id: string) => request<Remote[]>(`/repos/${id}/remotes`),

  status: (id: string) => request<StatusResponse>(`/repos/${id}/status`),

  log: (
    id: string,
    options: {
      limit?: number;
      skip?: number;
      all?: boolean;
      rev?: string[];
      path?: string[];
      grep?: string;
      search?: string;
      author?: string;
      firstParent?: boolean;
    } = {},
  ) => request<LogResponse>(`/repos/${id}/log${query(options)}`),

  commit: (id: string, oid: string) => request<CommitDetail>(`/repos/${id}/commits/${oid}`),

  changeset: (id: string, from: string, to: string, paths?: string[], options?: DiffOptions) =>
    request<ChangesetResponse>(
      `/repos/${id}/changeset${query({ from, to, path: paths, ...diffParams(options) })}`,
    ),

  diff: (
    id: string,
    params: { from: string; to: string; path: string; oldPath?: string; status?: string },
    options?: DiffOptions,
  ) => request<FileDiffResponse>(`/repos/${id}/diff${query({ ...params, ...diffParams(options) })}`),

  file: (id: string, rev: string, path: string) =>
    request<BlobResponse>(`/repos/${id}/file${query({ rev, path })}`),

  history: (id: string, path: string, options: { limit?: number; skip?: number } = {}) =>
    request<FileHistoryResponse>(`/repos/${id}/history${query({ path, ...options })}`),

  tree: (id: string, rev: string, path?: string) =>
    request<TreeResponse>(`/repos/${id}/tree${query({ rev, path })}`),

  conflict: (id: string, path: string) =>
    request<ConflictResponse>(`/repos/${id}/conflict${query({ path })}`),

  /** Every repository-changing action goes through this one endpoint. */
  operation: (id: string, payload: Record<string, unknown> & { op: string }) =>
    request<{ ok: boolean; message: string }>(`/repos/${id}/op`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  stashes: (id: string) =>
    request<Array<{ ref: string; message: string; date: string }>>(`/repos/${id}/stashes`),

  compareDirectories: (left: string, right: string, options: { ignore?: string[] } = {}) =>
    request<DirectoryCompareResponse>(`/fs/compare${query({ left, right, ...options })}`),

  /** Read a file from the filesystem, outside any repository. */
  readFsFile: (path: string) =>
    request<BlobResponse>(`/fs/file${query({ path })}`),

  copyPath: (payload: {
    left: string;
    right: string;
    path: string;
    direction: 'to-right' | 'to-left';
  }) =>
    request<{ ok: boolean; message: string }>('/fs/copy', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deletePath: (root: string, path: string) =>
    request<{ ok: boolean; message: string }>('/fs/delete', {
      method: 'POST',
      body: JSON.stringify({ root, path }),
    }),

  browse: (path?: string) =>
    request<{
      path: string;
      parent: string;
      entries: Array<{ name: string; path: string; isRepo: boolean }>;
    }>(`/fs/list${query({ path })}`),
};

/**
 * Subscribe to live repository events. Reconnects with backoff, because the
 * server restarting during development should not leave a dead UI.
 */
export function subscribeToEvents(
  repoIds: string[],
  onEvent: (event: ServerEvent) => void,
): () => void {
  if (repoIds.length === 0) return () => undefined;
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = (): void => {
    if (closed) return;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocol}://${window.location.host}/api/events${query({ repo: repoIds })}`;
    socket = new WebSocket(url);
    socket.onopen = () => {
      attempt = 0;
    };
    socket.onmessage = (message) => {
      try {
        onEvent(JSON.parse(String(message.data)) as ServerEvent);
      } catch {
        // A malformed frame is not worth tearing the connection down for.
      }
    };
    socket.onclose = () => {
      if (closed) return;
      const delay = Math.min(1000 * 2 ** attempt++, 15_000);
      retryTimer = setTimeout(connect, delay);
    };
    socket.onerror = () => socket?.close();
  };

  connect();
  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    socket?.close();
  };
}
