/* Loads the game's plain-<script> data files into a Node context so tools can
 * read the same source of truth the browser does. No build step, no duplication. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const DATA_DIR = path.join(ROOT, 'game', 'js', 'data');

const FILES = [
  'characters.js',
  'evidence.js',
  'scenes_act1.js',
  'scenes_act2.js',
  'scenes_act3.js',
  'scenes_act4.js',
  'scenes_act5.js'
];

export function loadGame() {
  // Concatenated into one script: `const` at the top level of a vm script is
  // lexically scoped to that script and would not survive separate runs.
  const src = FILES
    .map(f => fs.readFileSync(path.join(DATA_DIR, f), 'utf8'))
    .join('\n;\n');
  const ctx = vm.createContext({ SCENES: [], console });
  const out = vm.runInContext(
    `${src}\n;({ CHARACTERS, EVIDENCE, ACCUSATION, PHASE_SIGNATURES, SCENES })`,
    ctx, { filename: 'gamedata' }
  );
  return {
    scenes: out.SCENES,
    characters: out.CHARACTERS,
    evidence: out.EVIDENCE,
    accusation: out.ACCUSATION,
    signatures: out.PHASE_SIGNATURES
  };
}

/* Strip ElevenLabs v3 performance tags for on-screen subtitles. */
export function stripTags(t) {
  return t.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* A line whose text is nothing but a stage direction becomes a timed silence
 * rather than a synthesis request — more reliable than asking a model to act
 * out "[a very long silence]". */
export function isBeat(t) {
  return stripTags(t).length === 0;
}

export function beatDuration(t) {
  const s = t.toLowerCase();
  if (s.includes('very long')) return 4.5;
  if (s.includes('long')) return 3.0;
  return 1.6;
}

/* Split a scene into synthesis segments separated by beats. */
export function segmentScene(scene) {
  const segs = [];
  let cur = [];
  for (const ln of scene.lines || []) {
    if (isBeat(ln.t)) {
      if (cur.length) { segs.push({ type: 'audio', lines: cur }); cur = []; }
      segs.push({ type: 'beat', dur: beatDuration(ln.t), line: ln });
    } else {
      cur.push(ln);
    }
  }
  if (cur.length) segs.push({ type: 'audio', lines: cur });
  return segs;
}
