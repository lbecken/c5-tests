#!/usr/bin/env node
/* Structural checks on the scene graph, the evidence ledger and the audio
 * manifest. Run after any change to the script.
 *
 *   node tools/validate.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadGame, segmentScene, stripTags, ROOT } from './lib/loadgame.mjs';

const { scenes, characters, evidence, accusation } = loadGame();
const byId = Object.fromEntries(scenes.map(s => [s.id, s]));
const problems = [], notes = [];
const MANIFEST = path.join(ROOT, 'game', 'audio', 'manifest.json');
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : null;

/* ── exits ───────────────────────────────────────────────────────── */
function exitsOf(s) {
  const out = [];
  if (s.next) out.push(s.next);
  (s.choices || []).forEach(c => c.next && out.push(c.next));
  if (s.hub) {
    s.hub.options.forEach(o => out.push(o.next));
    out.push(s.hub.after);
  }
  if (s.analysis) out.push(s.analysis.onSolve, s.analysis.onSkip);
  return out.filter(Boolean);
}

for (const s of scenes) {
  for (const t of exitsOf(s)) {
    if (!byId[t]) problems.push(`${s.id}: exit points at missing scene "${t}"`);
  }
  for (const ln of s.lines || []) {
    if (!characters[ln.sp]) problems.push(`${s.id}: unknown speaker "${ln.sp}"`);
  }
  for (const e of s.evidence || []) {
    if (!evidence[e]) problems.push(`${s.id}: unknown evidence "${e}"`);
  }
  if (!s.lines && !s.hub && !s.accusation) problems.push(`${s.id}: no lines, hub or accusation`);
  const terminal = s.terminal || s.hubReturn || s.accusation;
  if (!terminal && !exitsOf(s).length) problems.push(`${s.id}: dead end`);
}

/* ── reachability ────────────────────────────────────────────────── */
const seen = new Set();
(function walk(id) {
  if (!id || seen.has(id) || !byId[id]) return;
  seen.add(id);
  const s = byId[id];
  exitsOf(s).forEach(walk);
  // hub spokes return to the hub, which eventually falls through to hub.after
  if (s.hubReturn) {
    for (const h of scenes.filter(x => x.hub)) {
      if (h.hub.options.some(o => o.next === id)) walk(h.hub.after);
    }
  }
})('S01');
// verdict inserts are entered programmatically from the accusation
['VERDICT_STRONG', 'VERDICT_PARTIAL', 'VERDICT_WEAK'].forEach(v => {
  if (byId[v]) { seen.add(v); exitsOf(byId[v]).forEach(x => seen.add(x)); }
});
for (const s of scenes) {
  if (!seen.has(s.id)) problems.push(`${s.id}: unreachable from S01`);
}

/* ── endings ─────────────────────────────────────────────────────── */
const endings = new Set(scenes.filter(s => s.ending).map(s => s.ending));
if (endings.size !== 3) problems.push(`expected 3 endings, found ${endings.size}`);
for (const s of scenes.filter(x => x.terminal)) {
  if (!seen.has(s.id)) problems.push(`terminal ${s.id} unreachable`);
}

/* ── fair play: mandatory evidence must not live only behind a hub ── */
const spineEvidence = new Set();
for (const s of scenes) {
  if (s.hubReturn) continue;                       // optional spoke
  (s.evidence || []).forEach(e => spineEvidence.add(e));
}
for (const [id, e] of Object.entries(evidence)) {
  if (!e.mandatory) continue;
  if (!spineEvidence.has(id)) {
    problems.push(`fair-play: mandatory ${id} ("${e.title}") is only reachable through an optional hub spoke`);
  }
}
// every evidence item should be placed somewhere
const placed = new Set(scenes.flatMap(s => s.evidence || []));
for (const id of Object.keys(evidence)) {
  if (!placed.has(id)) notes.push(`${id} ("${evidence[id].title}") is defined but never awarded by a scene`);
}
// unlock flags must actually get set somewhere
const allSets = new Set(scenes.flatMap(s => [
  ...(s.sets || []),
  ...(s.choices || []).flatMap(c => c.sets || [])
]));
allSets.add('analysis_solved'); allSets.add('theory_submitted');
for (const [id, e] of Object.entries(evidence)) {
  if (e.unlock && !allSets.has(e.unlock)) {
    problems.push(`${id}: unlock flag "${e.unlock}" is never set by any scene`);
  }
}
// gated choices must reference flags that exist
for (const s of scenes) {
  for (const c of s.choices || []) {
    for (const f of c.requiresAll || []) {
      if (!allSets.has(f)) problems.push(`${s.id}: choice requires flag "${f}" that is never set`);
    }
  }
}

/* ── accusation sanity ───────────────────────────────────────────── */
for (const [k, spec] of Object.entries(accusation)) {
  if (!(spec.correct in spec.options)) problems.push(`accusation.${k}: correct answer not in options`);
  if (spec.partial && !(spec.partial in spec.options)) problems.push(`accusation.${k}: partial answer not in options`);
}

/* ── runtime estimate ────────────────────────────────────────────── */
const CPS = 15.4;   // measured against generated audio
function sceneSeconds(s) {
  const segs = segmentScene(s);
  let t = 0;
  segs.forEach((seg, i) => {
    const m = manifest && manifest.segments[`${s.id}.${i}`];
    if (m && m.dur) { t += m.dur; return; }
    if (seg.type === 'beat') { t += seg.dur; return; }
    t += seg.lines.reduce((n, l) => n + stripTags(l.t).length, 0) / CPS;
  });
  return t + (s.silenceIntro || 0);
}

function route(pickIndex, endingChoiceLabelMatch, prefer = []) {
  let id = 'S01', t = 0, guard = 0;
  const visited = [];
  const flags = new Set();
  while (id && guard++ < 200) {
    const s = byId[id];
    if (!s) break;
    visited.push(id);
    t += sceneSeconds(s);
    (s.sets || []).forEach(f => flags.add(f));
    if (s.terminal) break;
    if (s.accusation) { t += 25; id = 'VERDICT_STRONG'; continue; }
    if (s.analysis) { t += 30; id = s.analysis.onSolve; continue; }
    if (s.hub) {
      const opts = s.hub.options.slice(0, s.hub.pick);
      for (const o of opts) {
        const sp = byId[o.next];
        t += sceneSeconds(sp);
        (sp.sets || []).forEach(f => flags.add(f));
        visited.push(o.next);
      }
      id = s.hub.after; continue;
    }
    if (s.choices) {
      const avail = s.choices.filter(c => (c.requiresAll || []).every(f => flags.has(f)));
      let c = avail.find(x => (x.sets || []).some(f => prefer.includes(f)))
           || avail[Math.min(pickIndex, avail.length - 1)] || avail[0];
      if (endingChoiceLabelMatch && s.id === 'S34') {
        c = s.choices.find(x => x.next.startsWith(endingChoiceLabelMatch)) || c;
      }
      t += 8; // deliberation
      (c.sets || []).forEach(f => flags.add(f));
      id = c.next; continue;
    }
    id = s.next;
  }
  return { t, visited, flags };
}

const best = route(2, 'END3', ['chose_deception', 'design_file_obtained', 'jonah_rapport', 'went_silent']);
const first = route(0, 'END1');
const honest = route(0, 'END2', ['chose_honesty']);

console.log('── structure ─────────────────────────────────────────');
console.log(`scenes defined         ${scenes.length}`);
console.log(`  with dialogue        ${scenes.filter(s => s.lines && s.lines.length).length}`);
console.log(`characters             ${Object.keys(characters).length}`);
console.log(`evidence items         ${Object.keys(evidence).length}`);
console.log(`endings                ${endings.size}`);
console.log(`decision points        ${scenes.filter(s => s.choices).length} choices + ${scenes.filter(s => s.hub).length} hubs`);
if (manifest) {
  const segs = Object.values(manifest.segments);
  const audio = segs.filter(s => s.type === 'audio');
  const total = segs.reduce((n, s) => n + (s.dur || 0), 0);
  console.log(`audio segments         ${audio.length} generated, ${segs.length - audio.length} silent beats`);
  console.log(`total spoken audio     ${(total / 60).toFixed(1)} min`);
  const missing = audio.filter(s => !fs.existsSync(path.join(ROOT, 'game', 'audio', 'dialogue', s.file)));
  if (missing.length) problems.push(`${missing.length} manifest entries have no audio file (${missing.slice(0, 3).map(m => m.file).join(', ')}…)`);
} else {
  notes.push('no audio manifest yet — run tools/generate-audio.mjs');
}

console.log('\n── playthrough estimates ─────────────────────────────');
console.log(`route A (ending 1)     ${(first.t / 60).toFixed(1)} min · ${first.visited.length} scenes`);
console.log(`route B (ending 2)     ${(honest.t / 60).toFixed(1)} min · ${honest.visited.length} scenes`);
console.log(`route C (ending 3)     ${(best.t / 60).toFixed(1)} min · ${best.visited.length} scenes`);

console.log('\n── fair play ─────────────────────────────────────────');
const mand = Object.entries(evidence).filter(([, e]) => e.mandatory).map(([k]) => k);
const gotBest = mand.filter(id => best.visited.some(v => (byId[v].evidence || []).includes(id)));
console.log(`mandatory evidence     ${gotBest.length}/${mand.length} collected on a full route`);
const missingMand = mand.filter(id => !gotBest.includes(id));
if (missingMand.length) problems.push(`route C misses mandatory evidence: ${missingMand.join(', ')}`);
console.log(`ending 3 gate flags    ${['collapse_sequence', 'phase_key_obtained'].every(f => best.flags.has(f)) ? 'satisfied' : 'NOT SATISFIED'}`);

if (notes.length) {
  console.log('\n── notes ─────────────────────────────────────────────');
  notes.forEach(n => console.log('  · ' + n));
}
console.log('\n── result ────────────────────────────────────────────');
if (problems.length) {
  problems.forEach(p => console.log('  ✗ ' + p));
  console.log(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log('  ✓ all checks passed');
