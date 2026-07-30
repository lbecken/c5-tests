import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

/**
 * Thin, typed wrapper around the `git` binary.
 *
 * Shelling out beats reimplementing: every command works exactly as it does in
 * the terminal, on every repository layout, including submodules, worktrees,
 * LFS and custom configuration. We use plumbing commands with NUL-delimited
 * output so parsing is unambiguous.
 */

export class GitError extends Error {
  constructor(
    message: string,
    readonly args: readonly string[],
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'GitError';
  }
}

export interface RunOptions {
  cwd: string;
  /** Bytes written to stdin before it is closed. */
  input?: Buffer | string;
  /** Reject with GitError on a non-zero exit (default true). */
  throwOnError?: boolean;
  /** Kill the process after this many milliseconds. */
  timeoutMs?: number;
  env?: Record<string, string>;
  /** Cap stdout; exceeding it aborts the command. */
  maxBuffer?: number;
}

export interface RunResult {
  stdout: Buffer;
  stderr: string;
  exitCode: number | null;
}

const DEFAULT_TIMEOUT = 120_000;
const DEFAULT_MAX_BUFFER = 512 * 1024 * 1024;

/**
 * Environment that makes git's output stable and non-interactive: C locale so
 * messages are not translated, no pager, no terminal prompts, and no index
 * lock taken for read-only commands.
 */
function baseEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    LC_ALL: 'C',
    LANG: 'C',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_CONFIG_PARAMETERS: "'core.quotepath=false'",
    ...extra,
  };
}

export function runGit(args: readonly string[], options: RunOptions): Promise<RunResult> {
  const {
    cwd,
    input,
    throwOnError = true,
    timeoutMs = DEFAULT_TIMEOUT,
    env,
    maxBuffer = DEFAULT_MAX_BUFFER,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn('git', args as string[], {
      cwd,
      env: baseEnv(env),
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    let stdoutLength = 0;
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new GitError(`git ${args[0]} timed out after ${timeoutMs}ms`, args, null, stderr));
    }, timeoutMs);
    timer.unref?.();

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutLength += chunk.length;
      if (stdoutLength > maxBuffer) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill('SIGKILL');
        reject(new GitError(`git ${args[0]} output exceeded ${maxBuffer} bytes`, args, null, ''));
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new GitError(`failed to run git: ${error.message}`, args, null, stderr));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result: RunResult = {
        stdout: Buffer.concat(stdoutChunks),
        stderr,
        exitCode: code,
      };
      if (code !== 0 && throwOnError) {
        reject(
          new GitError(
            `git ${args.join(' ')} exited with ${code}: ${stderr.trim()}`,
            args,
            code,
            stderr,
          ),
        );
        return;
      }
      resolve(result);
    });

    if (input !== undefined) {
      child.stdin.end(input);
    } else {
      child.stdin.end();
    }
  });
}

export async function runGitText(args: readonly string[], options: RunOptions): Promise<string> {
  const result = await runGit(args, options);
  return result.stdout.toString('utf8');
}

/** Split NUL-delimited output, dropping the trailing empty element. */
export function splitNul(text: string): string[] {
  const parts = text.split('\0');
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

interface PendingRead {
  resolve: (value: { oid: string; type: string; data: Buffer } | null) => void;
  reject: (error: Error) => void;
}

/**
 * Persistent `git cat-file --batch` process.
 *
 * Reviewing a changeset means reading hundreds of blobs; paying process-startup
 * cost per blob is the difference between a view that appears instantly and one
 * that visibly loads. One long-lived process answers all of them over a pipe.
 */
export class BatchReader {
  private child: ChildProcessWithoutNullStreams | null = null;
  private queue: PendingRead[] = [];
  private buffer: Buffer = Buffer.alloc(0);
  private closed = false;

  constructor(private readonly cwd: string) {}

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const child = spawn('git', ['cat-file', '--batch'], {
      cwd: this.cwd,
      env: baseEnv(),
      windowsHide: true,
    });
    child.stdout.on('data', (chunk: Buffer) => {
      this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
    child.on('close', () => {
      this.child = null;
      const error = new Error('git cat-file --batch exited');
      for (const pending of this.queue) pending.reject(error);
      this.queue = [];
    });
    child.on('error', (error) => {
      for (const pending of this.queue) pending.reject(error);
      this.queue = [];
    });
    this.child = child;
    return child;
  }

  /** Parse as many complete responses out of the buffer as are available. */
  private drain(): void {
    for (;;) {
      if (this.queue.length === 0) return;
      const newline = this.buffer.indexOf(0x0a);
      if (newline === -1) return;
      const header = this.buffer.subarray(0, newline).toString('utf8');

      if (header.endsWith(' missing')) {
        this.buffer = this.buffer.subarray(newline + 1);
        this.queue.shift()!.resolve(null);
        continue;
      }

      const parts = header.split(' ');
      const oid = parts[0] ?? '';
      const type = parts[1] ?? '';
      const size = Number.parseInt(parts[2] ?? '0', 10);
      // Payload is `size` bytes followed by a newline git adds itself.
      const total = newline + 1 + size + 1;
      if (this.buffer.length < total) return;

      const data = Buffer.from(this.buffer.subarray(newline + 1, newline + 1 + size));
      this.buffer = this.buffer.subarray(total);
      this.queue.shift()!.resolve({ oid, type, data });
    }
  }

  /** Read an object by any revision expression git accepts. Null when missing. */
  read(spec: string): Promise<{ oid: string; type: string; data: Buffer } | null> {
    if (this.closed) return Promise.reject(new Error('BatchReader is closed'));
    const child = this.ensureStarted();
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      child.stdin.write(`${spec}\n`, (error) => {
        if (error) reject(error);
      });
    });
  }

  close(): void {
    this.closed = true;
    if (this.child) {
      this.child.stdin.end();
      this.child.kill();
      this.child = null;
    }
  }
}
