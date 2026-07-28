#!/usr/bin/env node
/**
 * Build the single-file distribution.
 *
 * A screensaver cannot depend on a CDN — showing an error because the wifi
 * blipped is not acceptable behaviour for something that runs while you are
 * away from the machine. It also cannot rely on ES modules, because those will
 * not load over `file://`, and a native wrapper wants to point at a file on
 * disk rather than run a web server.
 *
 * So this flattens everything — three.js, the addons, all our source, the CSS —
 * into one self-contained HTML file with no external references of any kind.
 *
 *   dist/electropaint.html              the full app, boot gate and controls
 *   dist/electropaint-screensaver.html  screensaver mode, no query string needed
 *
 * The second exists because a wrapper's preferences pane may mangle a query
 * string (`&` in a plist is a good way to lose half a URL), and because
 * "point it at this file" is a much better instruction than "point it at this
 * file and remember to append these parameters".
 *
 *   npm run build
 */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const DIST = join(ROOT, 'dist');

/**
 * `three/addons/` is a convention of three's own examples, not a real package
 * export, so nothing can resolve it without being told where to look.
 */
const addonsPlugin = {
  name: 'three-addons',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^three\/addons\// }, (args) => ({
      path: join(ROOT, 'node_modules/three/examples/jsm', args.path.replace(/^three\/addons\//, '')),
    }));
  },
};

/** Replace exactly once, and fail loudly if the anchor has moved. */
function replaceOnce(html, pattern, replacement, what) {
  const match = html.match(pattern);
  if (!match) {
    throw new Error(
      `build: could not find ${what} in index.html — the template changed, `
      + 'so this build would silently produce a broken file.',
    );
  }
  return html.replace(pattern, () => replacement);
}

async function main() {
  // ---------------------------------------------------------------- bundle --

  const bundled = await build({
    entryPoints: [join(ROOT, 'src/main.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    // Deliberately conservative: macOS 12's Safari and the WebKit inside
    // legacyScreenSaver are older than the browsers this is developed against.
    target: ['chrome100', 'safari15', 'firefox100'],
    legalComments: 'none',
    write: false,
    plugins: [addonsPlugin],
  });

  // A `</script>` sequence inside a string literal would close our inline tag.
  const js = bundled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = await readFile(join(ROOT, 'styles.css'), 'utf8');
  const template = await readFile(join(ROOT, 'index.html'), 'utf8');

  // ------------------------------------------------------------------ html --

  let html = template;

  html = replaceOnce(
    html,
    /<link rel="stylesheet" href="\.\/styles\.css">/,
    `<style>\n${css}\n</style>`,
    'the stylesheet link',
  );

  // The import map only exists to point at the CDN; nothing is left to map.
  html = replaceOnce(
    html,
    /\s*<script type="importmap">[\s\S]*?<\/script>/,
    '',
    'the import map',
  );

  // The module bootstrap and its CDN-failure handler are both moot once the
  // code is inline — it cannot fail to load.
  const BOOTSTRAP = /\s*<script type="module">[\s\S]*?<\/script>/;

  const full = replaceOnce(html, BOOTSTRAP, `\n<script>\n${js}\n</script>`, 'the module bootstrap');
  const saver = replaceOnce(
    html,
    BOOTSTRAP,
    `\n<script>window.ELECTROPAINT_SCREENSAVER = true;</script>\n<script>\n${js}\n</script>`,
    'the module bootstrap',
  );

  // ----------------------------------------------------------------- write --

  await mkdir(DIST, { recursive: true });
  await writeFile(join(DIST, 'electropaint.html'), full);
  await writeFile(join(DIST, 'electropaint-screensaver.html'), saver);

  for (const name of ['electropaint.html', 'electropaint-screensaver.html']) {
    const { size } = await stat(join(DIST, name));
    console.log(`  dist/${name}  ${(size / 1024).toFixed(0)} KB`);
  }

  // Nothing may reference the outside world.
  const offenders = [...full.matchAll(/(?:src|href)="(https?:)?\/\/[^"]*"/g)].map((m) => m[0]);
  if (offenders.length) {
    throw new Error(`build: external references survived: ${offenders.join(', ')}`);
  }
  console.log('  no external references');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
