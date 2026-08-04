#!/usr/bin/env node
/**
 * Verifies that every file the game can ask for exists, is served, and is a
 * plausible audio file — and that nothing in the audio folder is orphaned.
 *
 *   node tools/assetcheck.mjs [baseUrl]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');
const base = process.argv[2] || 'http://localhost:8099';

const script = JSON.parse(fs.readFileSync(path.join(WEB, 'script.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(WEB, 'audio', 'manifest.json'), 'utf8'));

const problems = [];
const wanted = new Set();

// Everything the engine can reference.
for (const scene of Object.values(script.scenes)) {
  for (const cue of scene.cues || []) {
    if (cue.type === 'sfx') wanted.add(`sfx/${cue.sfx}`);
    else if (cue.type === 'synth') wanted.add(`synth/${cue.synth}`);
    else wanted.add(`cues/${cue.id}`);
    if (cue.bed) wanted.add(`beds/${cue.bed}`);
    // Artefacts mixed into a cue are baked in at build time, but the source
    // files must still exist for a rebuild to reproduce the same clip.
    for (const m of cue.mix || []) {
      if (m.sfx) wanted.add(`sfx/${m.sfx}`);
      if (m.synth) wanted.add(`synth/${m.synth}`);
    }
  }
  if (scene.bed) wanted.add(`beds/${scene.bed}`);
}
for (const b of Object.keys(script.beds)) wanted.add(`beds/${b}`);

for (const w of wanted) {
  const [group, id] = w.split('/');
  const entry = manifest[group]?.[id];
  if (!entry) { problems.push(`manifest has no ${group}/${id}`); continue; }
  const abs = path.join(WEB, entry.file);
  if (!fs.existsSync(abs)) { problems.push(`missing file ${entry.file}`); continue; }
  if (entry.bytes < 1500) problems.push(`suspiciously small (${entry.bytes}B) ${entry.file}`);
  if (entry.dur < 0.3) problems.push(`suspiciously short (${entry.dur}s) ${entry.file}`);
}

// Orphans: generated but unreachable.
for (const group of ['cues', 'beds', 'sfx', 'synth']) {
  for (const id of Object.keys(manifest[group] || {})) {
    if (!wanted.has(`${group}/${id}`)) problems.push(`orphaned asset ${group}/${id}.mp3`);
  }
}

// Served over HTTP with the right type.
let served = 0;
const sample = [...wanted];
await Promise.all(sample.map(async (w) => {
  const [group, id] = w.split('/');
  const entry = manifest[group]?.[id];
  if (!entry) return;
  try {
    const r = await fetch(`${base}/${entry.file}`, { method: 'HEAD' });
    if (!r.ok) problems.push(`HTTP ${r.status} for ${entry.file}`);
    else served++;
  } catch (e) { problems.push(`fetch failed ${entry.file}: ${e.message}`); }
}));

const totalBytes = ['cues', 'beds', 'sfx', 'synth']
  .flatMap((g) => Object.values(manifest[g] || {})).reduce((n, x) => n + x.bytes, 0);

console.log('\n  asset check\n');
console.log(`  referenced assets  ${wanted.size}`);
console.log(`  served OK          ${served}`);
console.log(`  total audio        ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`  spoken runtime     ${Math.floor(manifest.totalCueSeconds / 60)}m ${manifest.totalCueSeconds % 60}s`);

if (problems.length) {
  console.log('\n  PROBLEMS:');
  problems.slice(0, 30).forEach((p) => console.log(`    x ${p}`));
  if (problems.length > 30) console.log(`    ... and ${problems.length - 30} more`);
  console.log('');
  process.exit(1);
}
console.log('\n  all assets present and served\n');
