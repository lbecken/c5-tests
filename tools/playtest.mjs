#!/usr/bin/env node
/**
 * Headless playthrough. Walks the scene graph the way the engine does, using
 * the real manifest durations, and reports:
 *
 *   - runtime for a set of representative playstyles
 *   - which ending each one reaches
 *   - key evidence gathered, and whether the case would hold
 *   - exhaustive reachability of all three endings
 *
 *   node tools/playtest.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'script.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'audio', 'manifest.json'), 'utf8'));
const { scenes, meta, deduction, puzzles } = script;

const cueSeconds = (cue) => {
  if (cue.type === 'synth') return manifest.synth[cue.synth]?.dur ?? 0;
  if (cue.type === 'sfx') return manifest.sfx[cue.sfx]?.dur ?? 0;
  return manifest.cues[cue.id]?.dur ?? 0;
};

const CHOICE_THINK_SECONDS = 6;
const PUZZLE_SECONDS = { ambience: 100, phrasematch: 80, cardiac: 70, packet: 45 };

function run({ name, pick, deduce, solvePuzzles = true }) {
  const state = { flags: {}, seen: new Set(), evidence: new Set(), counters: {} };
  let seconds = 0;
  let scenesVisited = 0;
  let sceneId = meta.start;
  const path_ = [];
  let ending = null;

  const applySet = (set) => {
    for (const [k, v] of Object.entries(set || {})) {
      if (k.startsWith('+')) state.counters[k.slice(1)] = (state.counters[k.slice(1)] || 0) + v;
      else state.flags[k] = v;
    }
  };

  const resolve = (obj, fallback) => {
    for (const r of obj.nextIf || []) {
      if (r.unlessSeen && !state.seen.has(r.unlessSeen)) return r.next;
      if (r.whenFlag && state.flags[r.whenFlag]) return r.next;
    }
    return obj.next ?? fallback;
  };

  const available = (scene) =>
    (scene.choices || []).filter((c) => {
      if (c.once && state.flags[`took:${c.next}`]) return false;
      const min = c.requires?.min || {};
      return Object.entries(min).every(([k, v]) => (state.counters[k] || 0) >= v);
    });

  for (let guard = 0; guard < 400; guard++) {
    const scene = scenes[sceneId];
    if (!scene) throw new Error(`missing scene ${sceneId}`);
    path_.push(sceneId);
    if (!state.seen.has(sceneId)) scenesVisited++;
    state.seen.add(sceneId);

    for (const cue of scene.cues || []) seconds += cueSeconds(cue);
    (scene.grants || []).forEach((e) => state.evidence.add(e));
    applySet(scene.set);

    if (scene.puzzle) {
      seconds += PUZZLE_SECONDS[scene.puzzle] ?? 60;
      if (solvePuzzles) {
        (puzzles[scene.puzzle].onSolve?.grants || []).forEach((e) => state.evidence.add(e));
        applySet(puzzles[scene.puzzle].onSolve?.set);
      }
    }

    if (scene.ending) { ending = scene.ending; break; }

    if (scene.deduction) {
      seconds += 60;
      const keys = meta.keyEvidence.filter((e) => state.evidence.has(e));
      const oneOf = meta.strongCaseRequiresOneOf.some((e) => state.evidence.has(e));
      const strong = keys.length >= meta.strongCaseThreshold && oneOf;
      const culprit = deduce(state);
      const route = deduction.routes.find(
        (r) => (r.when.culprit === '*' || r.when.culprit === culprit) &&
               (r.when.strongCase === undefined || r.when.strongCase === strong));
      sceneId = route.next;
      continue;
    }

    const choices = available(scene);
    if (choices.length) {
      seconds += CHOICE_THINK_SECONDS;
      const c = pick(scene, choices, state);
      state.flags[`took:${c.next}`] = true;
      applySet(c.set);
      sceneId = resolve(c, c.next);
    } else {
      sceneId = resolve(scene);
    }
    if (!sceneId) break;
  }

  const keys = meta.keyEvidence.filter((e) => state.evidence.has(e));
  const oneOf = meta.strongCaseRequiresOneOf.some((e) => state.evidence.has(e));
  return {
    name, seconds, scenesVisited, ending,
    keyCount: keys.length,
    strong: keys.length >= meta.strongCaseThreshold && oneOf,
    missing: meta.keyEvidence.filter((e) => !state.evidence.has(e)),
    path: path_,
  };
}

const fmt = (s) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;

// ---- playstyles ----
const thorough = {
  name: 'Thorough (all interviews, all optional threads)',
  pick: (scene, choices) => {
    // prefer the still-unexplored branch, and the sky log at the orbital window
    const sky = choices.find((c) => c.next === 's27_solaris_sky');
    if (sky) return sky;
    const opt = choices.find((c) => c.once);
    return opt ?? choices[0];
  },
  deduce: () => 'voss',
};

// Shortest legal route: four interviews, no optional threads, no follow-ups.
const SKIP_TARGETS = new Set(['s05b_suspicious', 's11b_rook_motor', 's12d_okafor_out',
  's13d_cross_out', 's31b_voss_alibi', 's35a_injection', 's35b_quiet_question']);
const efficient = {
  name: 'Speedrun (four interviews, no optional threads)',
  pick: (scene, choices) => {
    const advance = choices.find((c) => c.requires?.min);
    if (advance) return advance;
    const motive = choices.find((c) => c.next === 's34_the_fraud');
    if (motive) return motive;
    const deduce = choices.find((c) => c.next === 's36_deduction');
    if (deduce) return deduce;
    return choices.find((c) => !SKIP_TARGETS.has(c.next)) ?? choices[0];
  },
  deduce: () => 'voss',
};

const careless = {
  name: 'Careless (wrong timing layer, skips the workstation, wastes the pass)',
  pick: (scene, choices) => {
    const frames = choices.find((c) => c.next === 's27_solaris_frames');
    if (frames) return frames;
    const motive = choices.find((c) => c.next === 's34_the_fraud');
    if (motive) return motive;
    const advance = choices.find((c) => c.requires?.min);
    if (advance) return advance;
    return choices[0];
  },
  deduce: () => 'voss',
  solvePuzzles: false,
};

const wrong = {
  ...thorough,
  name: 'Thorough but accuses the engineer',
  deduce: () => 'rook',
};

console.log('\n  THE OBSERVATORY MURDER — headless playthroughs\n');
const results = [thorough, efficient, careless, wrong].map(run);
for (const r of results) {
  console.log(`  ${r.name}`);
  console.log(`     runtime ${fmt(r.seconds)}   scenes ${r.scenesVisited}   key evidence ${r.keyCount}/${meta.keyEvidence.length}   case ${r.strong ? 'STRONG' : 'weak'}`);
  console.log(`     ending  ${r.ending}${r.missing.length ? `   missing ${r.missing.join(', ')}` : ''}`);
  console.log('');
}

// ---- every ending reachable in practice ----
const endingsHit = new Set(results.map((r) => r.ending));
const suppress = run({
  ...thorough,
  name: 'suppress',
  pick: (scene, choices) => {
    const s = choices.find((c) => c.next === 'end_consortium');
    if (s) return s;
    return thorough.pick(scene, choices);
  },
});
endingsHit.add(suppress.ending);

const want = ['shadow', 'consortium', 'dead_air'];
const missing = want.filter((e) => !endingsHit.has(e));
console.log(`  endings reached across these runs: ${[...endingsHit].join(', ')}`);
if (missing.length) {
  console.log(`  NOT REACHED: ${missing.join(', ')}\n`);
  process.exit(1);
}

const times = results.map((r) => r.seconds);
console.log(`  runtime range ${fmt(Math.min(...times))} – ${fmt(Math.max(...times))}`);
console.log(`  total produced audio ${fmt(manifest.totalCueSeconds)} across all branches\n`);
