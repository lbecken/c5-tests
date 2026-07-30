import { resolve } from 'node:path';

import { startServer } from './index.js';

/** `gitscope-server [--port N] [--static DIR] [repo...]` */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let port = Number(process.env.GITSCOPE_PORT ?? 0) || 7345;
  let staticDir: string | undefined = process.env.GITSCOPE_STATIC;
  const openPaths: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--port' || arg === '-p') {
      port = Number(args[++i]);
    } else if (arg === '--static') {
      staticDir = resolve(args[++i] ?? '');
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write('usage: gitscope-server [--port N] [--static DIR] [repository...]\n');
      return;
    } else {
      openPaths.push(resolve(arg));
    }
  }

  if (openPaths.length === 0) openPaths.push(process.cwd());

  const running = await startServer({ port, staticDir, openPaths });
  process.stdout.write(`gitscope server listening on ${running.url}\n`);

  const shutdown = (): void => {
    void running.close().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
