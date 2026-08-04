#!/usr/bin/env node
// Merges data/*.json into web/script.json and validates the scene graph.
// Exits non-zero on any structural problem, so this doubles as the test suite.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(ROOT, 'web', 'script.json');

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ---------- merge ----------
const files = fs.readdirSync(DATA).filter((f) => f.endsWith('.json')).sort();
const script = { scenes: {} };
for (const f of files) {
  let part;
  try {
    part = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
  } catch (e) {
    console.error(`\n  ${f}: ${e.message}\n`);
    process.exit(1);
  }
  for (const [k, v] of Object.entries(part)) {
    if (k === 'scenes') {
      for (const [id, scene] of Object.entries(v)) {
        if (script.scenes[id]) err(`duplicate scene id "${id}" (${f})`);
        script.scenes[id] = { id, ...scene };
      }
    } else {
      if (script[k]) err(`duplicate top-level key "${k}" (${f})`);
      script[k] = v;
    }
  }
}

const { scenes, characters, beds, sfx, synth, evidence, meta, puzzles, deduction, fx } = script;

// ---------- collect cues and clips ----------
const cues = [];
const clips = {};
for (const scene of Object.values(scenes)) {
  for (const cue of scene.cues || []) {
    cue.scene = scene.id;
    if (!cue.bed) cue.bed = scene.bed;
    cues.push(cue);
    if (cue.clip) {
      if (clips[cue.clip.id]) warn(`clip "${cue.clip.id}" defined twice (${cue.scene})`);
      clips[cue.clip.id] = { ...cue.clip, cue: cue.id, bed: cue.bed, scene: scene.id };
    }
  }
}
script.clips = clips;

// ---------- validate references ----------
const allCueIds = new Set(cues.map((c) => c.id));
const seenCueIds = new Set();
for (const cue of cues) {
  const where = `${cue.scene}/${cue.id}`;
  if (seenCueIds.has(cue.id)) err(`duplicate cue id "${cue.id}" (${where})`);
  seenCueIds.add(cue.id);

  if (cue.bed && !beds[cue.bed]) err(`unknown bed "${cue.bed}" (${where})`);
  if (cue.fx && !fx[cue.fx]) err(`unknown fx "${cue.fx}" (${where})`);

  switch (cue.type) {
    case 'tts':
      if (!characters[cue.sp]) err(`unknown speaker "${cue.sp}" (${where})`);
      if (!cue.t) err(`tts cue with no text (${where})`);
      break;
    case 'dialogue':
      if (!Array.isArray(cue.lines) || cue.lines.length < 2)
        err(`dialogue cue needs >= 2 lines (${where})`);
      for (const l of cue.lines || []) {
        if (!characters[l.sp]) err(`unknown speaker "${l.sp}" (${where})`);
        if (!l.t) err(`dialogue line with no text (${where})`);
      }
      break;
    case 'sfx':
      if (!sfx[cue.sfx]) err(`unknown sfx "${cue.sfx}" (${where})`);
      break;
    case 'synth':
      if (!synth[cue.synth]) err(`unknown synth "${cue.synth}" (${where})`);
      break;
    default:
      err(`unknown cue type "${cue.type}" (${where})`);
  }
  if (cue.reuse && !cues.some((c) => c.id === cue.reuse) && !allCueIds.has(cue.reuse))
    err(`cue reuses missing cue "${cue.reuse}" (${where})`);
  for (const m of cue.mix || []) {
    if (m.sfx && !sfx[m.sfx]) err(`unknown mix sfx "${m.sfx}" (${where})`);
    if (m.synth && !synth[m.synth]) err(`unknown mix synth "${m.synth}" (${where})`);
  }
  if (cue.clip?.evidence && !evidence[cue.clip.evidence])
    err(`unknown evidence "${cue.clip.evidence}" (${where})`);
}

// ---------- validate scene graph ----------
const targetsOf = (scene) => {
  const out = [];
  const add = (n) => { if (n) out.push(n); };
  add(scene.next);
  for (const r of scene.nextIf || []) add(r.next);
  for (const c of scene.choices || []) {
    add(c.next);
    for (const r of c.nextIf || []) add(r.next);
  }
  return out;
};

for (const scene of Object.values(scenes)) {
  for (const t of targetsOf(scene))
    if (!scenes[t]) err(`scene "${scene.id}" points at missing scene "${t}"`);
  for (const e of scene.grants || [])
    if (!evidence[e]) err(`scene "${scene.id}" grants unknown evidence "${e}"`);
  if (scene.puzzle && !puzzles[scene.puzzle])
    err(`scene "${scene.id}" uses unknown puzzle "${scene.puzzle}"`);
  const terminal = !scene.next && !scene.choices?.length && !scene.nextIf?.length;
  if (terminal && !scene.ending && !scene.deduction)
    err(`scene "${scene.id}" is a dead end (no next, no choices, not an ending)`);
  for (const r of scene.nextIf || [])
    if (r.unlessSeen && !scenes[r.unlessSeen])
      err(`scene "${scene.id}" nextIf references missing scene "${r.unlessSeen}"`);
}

for (const r of deduction.routes || [])
  if (!scenes[r.next]) err(`deduction route points at missing scene "${r.next}"`);

// ---------- reachability ----------
const reach = new Set();
const walk = (id) => {
  if (!id || reach.has(id) || !scenes[id]) return;
  reach.add(id);
  targetsOf(scenes[id]).forEach(walk);
  if (scenes[id].deduction) (deduction.routes || []).forEach((r) => walk(r.next));
};
walk(meta.start);
for (const id of Object.keys(scenes))
  if (!reach.has(id)) err(`scene "${id}" is unreachable from "${meta.start}"`);

const endings = Object.values(scenes).filter((s) => s.ending);
for (const e of endings)
  if (!reach.has(e.id)) err(`ending "${e.id}" unreachable`);
if (endings.length !== 3) warn(`expected 3 endings, found ${endings.length}`);

// ---------- puzzle sanity ----------
for (const [pid, p] of Object.entries(puzzles)) {
  if (p.kind === 'match') {
    const refIds = new Set(p.references.map((r) => r.clip || r.bed));
    for (const it of p.items)
      if (!refIds.has(it.answer)) err(`puzzle "${pid}": item "${it.clip}" answer "${it.answer}" is not a reference`);
    for (const it of p.items)
      if (it.clip && it.clip !== 'NONE' && !clips[it.clip]) err(`puzzle "${pid}": unknown clip "${it.clip}"`);
    for (const r of p.references)
      if (r.clip && r.clip !== 'NONE' && !clips[r.clip]) err(`puzzle "${pid}": unknown reference clip "${r.clip}"`);
      else if (r.bed && !beds[r.bed]) err(`puzzle "${pid}": unknown reference bed "${r.bed}"`);
  }
  if (p.kind === 'select' && !p.options.some((o) => o.correct))
    err(`puzzle "${pid}": no correct option`);
  for (const e of p.onSolve?.grants || [])
    if (!evidence[e]) err(`puzzle "${pid}" grants unknown evidence "${e}"`);
}

// ---------- key evidence must be obtainable ----------
const granted = new Set();
for (const s of Object.values(scenes)) (s.grants || []).forEach((e) => granted.add(e));
for (const p of Object.values(puzzles)) (p.onSolve?.grants || []).forEach((e) => granted.add(e));
for (const e of meta.keyEvidence)
  if (!granted.has(e)) err(`key evidence "${e}" is never granted by any scene or puzzle`);
for (const e of Object.keys(evidence))
  if (!granted.has(e)) warn(`evidence "${e}" is never granted`);

// ---------- stats ----------
const lineCount = cues.reduce((n, c) => n + (c.type === 'dialogue' ? c.lines.length : c.type === 'tts' ? 1 : 0), 0);
const words = cues.reduce((n, c) => {
  const texts = c.type === 'dialogue' ? c.lines.map((l) => l.t) : c.t ? [c.t] : [];
  return n + texts.join(' ').replace(/\[[^\]]*\]/g, '').split(/\s+/).filter(Boolean).length;
}, 0);
const chars = cues.reduce((n, c) => {
  const texts = c.type === 'dialogue' ? c.lines.map((l) => l.t) : c.t ? [c.t] : [];
  return n + texts.join(' ').length;
}, 0);

script.meta.stats = {
  scenes: Object.keys(scenes).length,
  cues: cues.length,
  spokenLines: lineCount,
  words,
  ttsCharacters: chars,
  clips: Object.keys(clips).length,
  evidence: Object.keys(evidence).length,
  endings: endings.length,
};

// ---------- report ----------
console.log('\n  THE OBSERVATORY MURDER — build\n');
console.log(`  scenes            ${script.meta.stats.scenes}`);
console.log(`  cues              ${script.meta.stats.cues}`);
console.log(`  spoken lines      ${script.meta.stats.spokenLines}`);
console.log(`  words             ${script.meta.stats.words}`);
console.log(`  TTS characters    ${script.meta.stats.ttsCharacters}  (ElevenLabs billing estimate)`);
console.log(`  archive clips     ${script.meta.stats.clips}`);
console.log(`  evidence items    ${script.meta.stats.evidence}`);
console.log(`  endings           ${script.meta.stats.endings}`);
console.log(`  beds / sfx / synth  ${Object.keys(beds).length} / ${Object.keys(sfx).length} / ${Object.keys(synth).length}`);

if (warnings.length) {
  console.log('\n  warnings:');
  warnings.forEach((w) => console.log(`    - ${w}`));
}
if (errors.length) {
  console.log('\n  ERRORS:');
  errors.forEach((e) => console.log(`    x ${e}`));
  console.log('');
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(script, null, 1));
console.log(`\n  graph OK — all ${reach.size} scenes reachable, 3 endings reachable`);
console.log(`  wrote ${path.relative(ROOT, OUT)}\n`);
