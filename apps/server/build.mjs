import { build } from 'esbuild';

/**
 * Bundle the server to a single file.
 *
 * The workspace resolves `@gitscope/core` to TypeScript source, which is what
 * makes the dev loop fast, but means `node` cannot run the server directly.
 * Bundling sidesteps the whole question: one `.mjs` with no runtime resolution
 * to get wrong, which is also exactly what the desktop build wants to ship.
 */
await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/gitscope-server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  minify: false,
  banner: {
    // `ws` reaches for these CommonJS globals even in ESM.
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
  logLevel: 'info',
});
