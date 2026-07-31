import { resolve } from 'node:path';

import { connect, ping, writeState } from './instance.js';

/**
 * `gsc` — the command line front end.
 *
 * Everything here is a thin client over a running instance, so a comparison
 * opens in the window you already have rather than starting a second copy of
 * the application. The two commands that matter for daily use are the git
 * integrations: `difftool` and `mergetool` are invoked by git itself and must
 * block until the user is finished, then exit with a status git understands.
 */

const USAGE = `gitscope — diff and merge with deep git integration

usage:
  gsc [<repository>]                 open a repository (defaults to the current directory)
  gsc diff <left> <right>            compare two files or folders
  gsc difftool <local> <remote>      git difftool integration
  gsc merge <base> <local> <remote> <output>
                                     git mergetool integration
  gsc serve [--port N] [<repo>...]   run the server in the foreground
  gsc install-git [--global]         register gsc as git's difftool and mergetool
  gsc status                         report whether an instance is running

options:
  --no-start                         fail instead of starting an instance
  --help, -h                         show this message
`;

interface Options {
  autoStart: boolean;
  rest: string[];
}

function parse(argv: string[]): { command: string; options: Options } {
  const rest: string[] = [];
  let autoStart = true;
  for (const arg of argv) {
    if (arg === '--no-start') autoStart = false;
    else rest.push(arg);
  }
  const command = rest[0] ?? 'open';
  return { command, options: { autoStart, rest: rest.slice(1) } };
}

async function post<T>(url: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${url}/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

/** Create an intent and block until the window reports it finished. */
async function handOff(
  url: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<{ completed: boolean; saved: boolean }> {
  const intent = await post<{ id: string }>(url, '/intents', { kind, payload });
  const response = await fetch(`${url}/api/intents/${intent.id}/wait`);
  if (!response.ok) return { completed: false, saved: false };
  return (await response.json()) as { completed: boolean; saved: boolean };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return 0;
  }

  const { command, options } = parse(argv);

  switch (command) {
    case 'serve': {
      const { startServer } = await import('@gitscope/server');
      const portIndex = options.rest.indexOf('--port');
      const port = portIndex >= 0 ? Number(options.rest[portIndex + 1]) : 7345;
      const paths = options.rest.filter(
        (arg, index) => !arg.startsWith('--') && index !== portIndex + 1,
      );
      const running = await startServer({
        port,
        staticDir: process.env.GITSCOPE_STATIC || undefined,
        openPaths: paths.length > 0 ? paths.map((path) => resolve(path)) : [process.cwd()],
      });
      await writeState({ url: running.url, pid: process.pid, startedAt: Date.now() });
      process.stdout.write(`gitscope listening on ${running.url}\n`);
      await new Promise(() => undefined);
      return 0;
    }

    case 'status': {
      const url = process.env.GITSCOPE_URL;
      if (url && (await ping(url))) {
        process.stdout.write(`running at ${url}\n`);
        return 0;
      }
      try {
        const found = await connect({ autoStart: false });
        process.stdout.write(`running at ${found}\n`);
        return 0;
      } catch {
        process.stdout.write('not running\n');
        return 1;
      }
    }

    case 'install-git': {
      const { installGitIntegration } = await import('./install.js');
      return installGitIntegration(options.rest.includes('--global'));
    }

    case 'diff':
    case 'difftool': {
      const [left, right] = options.rest;
      if (!left || !right) {
        process.stderr.write('gsc diff needs two paths\n');
        return 2;
      }
      const url = await connect({ autoStart: options.autoStart });
      const result = await handOff(url, 'compare-files', {
        left: resolve(left),
        right: resolve(right),
        leftLabel: process.env.GITSCOPE_LEFT_LABEL ?? left,
        rightLabel: process.env.GITSCOPE_RIGHT_LABEL ?? right,
      });
      // git difftool ignores our status, but exiting non-zero on a window that
      // was never opened surfaces a broken setup instead of hiding it.
      return result.completed ? 0 : 1;
    }

    case 'merge': {
      const [base, local, remote, output] = options.rest;
      if (!base || !local || !remote || !output) {
        process.stderr.write('gsc merge needs <base> <local> <remote> <output>\n');
        return 2;
      }
      const url = await connect({ autoStart: options.autoStart });
      const result = await handOff(url, 'merge-files', {
        base: resolve(base),
        local: resolve(local),
        remote: resolve(remote),
        output: resolve(output),
      });
      // git treats a non-zero exit as "the merge was not resolved" and keeps
      // the conflict markers, which is exactly right if nothing was saved.
      return result.saved ? 0 : 1;
    }

    case 'open':
    default: {
      const target = resolve(command === 'open' ? (options.rest[0] ?? '.') : command);
      const url = await connect({ autoStart: options.autoStart, open: target });
      await post(url, '/repos', { path: target }).catch(() => undefined);
      await post(url, '/intents', { kind: 'open-repo', payload: { path: target } }).catch(
        () => undefined,
      );
      process.stdout.write(`${url}\n`);
      return 0;
    }
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`gsc: ${(error as Error).message}\n`);
    process.exit(1);
  },
);
