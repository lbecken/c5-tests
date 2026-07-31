import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

import { WebSocketServer, type WebSocket } from 'ws';

import { IntentRegistry } from './intents.js';
import { createRouter, HttpError, type RequestContext } from './router.js';
import { SessionStore } from './session.js';
import type { ServerEvent } from './protocol.js';

export interface ServerOptions {
  port?: number;
  host?: string;
  /** Directory of built UI assets to serve; omitted in development. */
  staticDir?: string;
  /** Repositories to open at startup. */
  openPaths?: string[];
}

export interface RunningServer {
  server: Server;
  port: number;
  url: string;
  sessions: SessionStore;
  intents: IntentRegistry;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const MAX_BODY_BYTES = 32 * 1024 * 1024;

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    request.on('data', (chunk: Buffer) => {
      length += chunk.length;
      if (length > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'request body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (chunks.length === 0) {
        resolvePromise(null);
        return;
      }
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'request body is not valid JSON'));
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

/**
 * Serve a file from the built UI. Paths are resolved inside `staticDir` and
 * rejected if they escape it, and anything that is not a real file falls back
 * to `index.html` so client-side routes work on reload.
 */
async function serveStatic(
  staticDir: string,
  urlPath: string,
  response: ServerResponse,
): Promise<void> {
  const requested = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(staticDir, requested);
  if (!filePath.startsWith(resolve(staticDir))) {
    sendJson(response, 403, { error: 'forbidden' });
    return;
  }
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    filePath = join(staticDir, 'index.html');
  }
  try {
    await stat(filePath);
  } catch {
    sendJson(response, 404, { error: 'not found' });
    return;
  }
  response.writeHead(200, {
    'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
    'cache-control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000',
  });
  createReadStream(filePath).pipe(response);
}

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const sessions = new SessionStore();
  const intents = new IntentRegistry();
  const route = createRouter(sessions, intents);

  for (const path of options.openPaths ?? []) {
    try {
      await sessions.open(path);
    } catch (error) {
      process.stderr.write(`gitscope: cannot open ${path}: ${(error as Error).message}\n`);
    }
  }

  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });

  async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    // The server binds to loopback and holds no credentials, but a malicious
    // page could still drive it from the user's browser, so only same-origin
    // and Electron requests are accepted.
    const origin = request.headers.origin;
    if (origin && !isLocalOrigin(origin)) {
      sendJson(response, 403, { error: 'cross-origin requests are not allowed' });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        const context: RequestContext = {
          method: request.method ?? 'GET',
          path: url.pathname.slice('/api'.length),
          query: url.searchParams,
          body: request.method === 'POST' || request.method === 'PUT' ? await readBody(request) : null,
        };
        sendJson(response, 200, await route(context));
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        sendJson(response, status, { error: (error as Error).message });
      }
      return;
    }

    if (options.staticDir) {
      await serveStatic(options.staticDir, url.pathname, response);
      return;
    }
    sendJson(response, 404, { error: 'not found' });
  }

  // Live updates: the UI subscribes per repository and receives one message
  // whenever the working copy, index or refs change.
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/api/events') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      attachEvents(ws, url.searchParams.getAll('repo'));
    });
  });

  function attachEvents(ws: WebSocket, repoIds: string[]): void {
    const unsubscribes: Array<() => void> = [];
    const send = (event: ServerEvent): void => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
    };

    // Every window hears about command-line hand-offs, whichever repository
    // it happens to have open.
    unsubscribes.push(intents.subscribe((intent) => send({ type: 'intent', intent })));
    for (const repoId of repoIds) {
      const session = sessions.get(repoId);
      if (!session) {
        send({ type: 'error', message: `no open repository with id ${repoId}` });
        continue;
      }
      unsubscribes.push(
        session.subscribe((reasons) => send({ type: 'repo-changed', repoId, reasons })),
      );
    }
    ws.on('close', () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    });
  }

  const port = await new Promise<number>((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => {
      const address = server.address();
      resolvePort(typeof address === 'object' && address ? address.port : 0);
    });
  });

  return {
    server,
    port,
    url: `http://${options.host ?? '127.0.0.1'}:${port}`,
    sessions,
    intents,
    close: async () => {
      wss.close();
      sessions.closeAll();
      // Long-poll hand-offs hold a connection open by design, so shutting down
      // has to drop them rather than wait for them.
      server.closeAllConnections?.();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

function isLocalOrigin(origin: string): boolean {
  if (origin === 'null' || origin.startsWith('file://')) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

export { SessionStore } from './session.js';
export * from './protocol.js';
