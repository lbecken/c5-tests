/**
 * The browser resolves the bare specifier "three" through the import map in
 * index.html. Node has no such mechanism, so this creates a tiny node_modules
 * shim pointing at the same vendored build. No network access, no install --
 * it just lets `node tests/verify.mjs` resolve the same module the page does.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shim = resolve(root, 'node_modules/three');

if (!existsSync(resolve(shim, 'index.js'))) {
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    resolve(shim, 'package.json'),
    JSON.stringify(
      { name: 'three', version: '0.160.0', type: 'module', exports: { '.': './index.js' } },
      null,
      2
    )
  );
  writeFileSync(
    resolve(shim, 'index.js'),
    "export * from '../../vendor/three/three.module.js';\n"
  );
  console.log('created node_modules/three shim -> vendor/three/three.module.js');
}
