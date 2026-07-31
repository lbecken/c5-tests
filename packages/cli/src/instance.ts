import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Finding — or starting — the one server this machine should be talking to.
 *
 * The point is that `gsc diff a b` lands in the window you already have open
 * rather than starting a second copy of everything. A tiny state file records
 * where the running instance is; it is treated as a hint, never as truth, and
 * always verified with a real request before use.
 */

export interface InstanceInfo {
  url: string;
  pid: number;
  startedAt: number;
}

export function stateDirectory(): string {
  const base =
    process.env.XDG_STATE_HOME ??
    (process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support') : join(homedir(), '.local', 'state'));
  return join(base, 'gitscope');
}

function stateFile(): string {
  return join(stateDirectory(), 'instance.json');
}

async function readState(): Promise<InstanceInfo | null> {
  try {
    return JSON.parse(await readFile(stateFile(), 'utf8')) as InstanceInfo;
  } catch {
    return null;
  }
}

export async function writeState(info: InstanceInfo): Promise<void> {
  const file = stateFile();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(info, null, 2), 'utf8');
}

/** Confirm a server really is answering at `url`. */
export async function ping(url: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${url}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

export interface ConnectOptions {
  /** Start a server if none is running (default true). */
  autoStart?: boolean;
  /** Repository to open on startup. */
  open?: string;
  /** Path to the bundled server, when not resolvable from this package. */
  serverEntry?: string;
  staticDir?: string;
}

/**
 * Return the URL of a live server, starting one in the background if needed.
 */
export async function connect(options: ConnectOptions = {}): Promise<string> {
  // An explicit address wins over discovery, which is what makes the CLI
  // scriptable and testable against a server someone else started.
  const explicit = process.env.GITSCOPE_URL;
  if (explicit && (await ping(explicit))) return explicit;

  const existing = await readState();
  if (existing && (await ping(existing.url))) return existing.url;
  if (options.autoStart === false) {
    throw new Error('no running Gitscope instance');
  }
  return startBackgroundServer(options);
}

async function startBackgroundServer(options: ConnectOptions): Promise<string> {
  const entry = options.serverEntry ?? process.env.GITSCOPE_SERVER_ENTRY;
  if (!entry) {
    throw new Error(
      'cannot locate the Gitscope server; set GITSCOPE_SERVER_ENTRY or run `gsc serve` yourself',
    );
  }

  const port = await freePort();
  const args = [entry, '--port', String(port)];
  if (options.staticDir) args.push('--static', options.staticDir);
  if (options.open) args.push(options.open);

  // Detached so the server outlives the command that started it — which is the
  // whole point when `git difftool` invokes us once per file.
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, GITSCOPE_STATIC: options.staticDir ?? process.env.GITSCOPE_STATIC ?? '' },
  });
  child.unref();

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await ping(url, 500)) {
      await writeState({ url, pid: child.pid ?? 0, startedAt: Date.now() });
      return url;
    }
    await delay(150);
  }
  throw new Error('the Gitscope server did not start in time');
}

async function freePort(): Promise<number> {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
