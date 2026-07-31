import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';

/**
 * Bundle the Electron main and preload scripts, then copy the built UI in
 * beside them. The server is bundled into the main process rather than spawned:
 * one process is simpler to ship, simpler to shut down, and there is no port to
 * coordinate.
 */

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  // Electron provides these itself and must not be bundled.
  external: ['electron'],
  logLevel: 'info',
});

await build({
  entryPoints: ['src/preload.ts'],
  outfile: 'dist/preload.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  logLevel: 'info',
});

const webDist = '../web/dist';
if (existsSync(webDist)) {
  await cp(webDist, 'dist/ui', { recursive: true });
} else {
  process.stderr.write('gitscope: apps/web has not been built; run `pnpm --filter @gitscope/web build`\n');
  process.exitCode = 1;
}
