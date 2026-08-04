#!/usr/bin/env node
/* Audio production for THE MAN WHO CALLED FROM TOMORROW.
 *
 * One ElevenLabs text-to-dialogue request per scene segment, so multi-speaker
 * scenes keep their interruptions, overlaps and contextual pacing instead of
 * being stitched from isolated single-voice reads.
 *
 * Output is deliberately CLEAN. Every channel effect — the narrow band on the
 * future calls, the pre-echo that encodes a caller's phase signature, packet
 * loss, room ambience — is applied live in the browser by audio.js, so the
 * player's enhancement tools can genuinely peel it back.
 *
 *   node tools/generate-audio.mjs            generate anything missing/changed
 *   node tools/generate-audio.mjs --dry-run  cost and coverage report only
 *   node tools/generate-audio.mjs --force    regenerate everything
 *   node tools/generate-audio.mjs --only S17A,S28
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadGame, segmentScene, stripTags, ROOT } from './lib/loadgame.mjs';

const API_KEY = process.env.ELEVENLABS_API_KEY;
const ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-dialogue';
const MODEL = 'eleven_v3';
const FORMAT = 'mp3_44100_128';
const OUT_DIR = path.join(ROOT, 'game', 'audio', 'dialogue');
const MANIFEST = path.join(ROOT, 'game', 'audio', 'manifest.json');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const FORCE = argv.includes('--force');
const ONLY = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 && argv[i + 1] ? new Set(argv[i + 1].split(',')) : null;
})();

/* Applied to synthesis text only — subtitles keep the real spelling.
 * Add entries here if a name comes back wrong; it is cheaper than re-recording. */
const PRONUNCIATION = [
  [/\bSayegh\b/g, 'Sayegh'],
  [/\bCoupure\b/g, 'Coupure'],
  [/\bkilohertz\b/g, 'kilohertz']
];

function speakText(t) {
  let s = t;
  for (const [re, to] of PRONUNCIATION) s = s.replace(re, to);
  return s;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* CBR 128 kbps: bytes → seconds, less a nominal tag allowance. */
function mp3Duration(bytes) {
  return Math.max(0, (bytes - 2048) * 8 / 128000);
}

async function synth(inputs, seed) {
  const body = {
    inputs,
    model_id: MODEL,
    output_format: FORMAT,
    seed,
    settings: { stability: 0.5, use_speaker_boost: true }
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const text = await res.text().catch(() => '');
    if (res.status === 429 || res.status >= 500) {
      const wait = 2000 * Math.pow(2, attempt);
      console.warn(`    ${res.status}; retrying in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${res.status} ${text.slice(0, 400)}`);
  }
  throw new Error('exhausted retries');
}

async function main() {
  if (!API_KEY && !DRY) throw new Error('ELEVENLABS_API_KEY is not set');
  const { scenes, characters } = loadGame();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const prev = fs.existsSync(MANIFEST)
    ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
    : { segments: {} };

  const manifest = { model: MODEL, format: FORMAT, generated: new Date().toISOString(), segments: {} };
  let chars = 0, made = 0, cached = 0, spoken = 0;

  for (const scene of scenes) {
    if (!scene.lines || !scene.lines.length) continue;
    if (ONLY && !ONLY.has(scene.id)) {
      // keep whatever we already had so a targeted run doesn't orphan the rest
      for (const [k, v] of Object.entries(prev.segments)) {
        if (k.startsWith(scene.id + '.')) manifest.segments[k] = v;
      }
      continue;
    }
    const segs = segmentScene(scene);
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const key = `${scene.id}.${i}`;
      if (seg.type === 'beat') {
        manifest.segments[key] = {
          type: 'beat', dur: seg.dur, sp: seg.line.sp, direction: seg.line.t
        };
        continue;
      }
      const inputs = seg.lines.map(ln => {
        const ch = characters[ln.sp];
        if (!ch) throw new Error(`${scene.id}: unknown speaker "${ln.sp}"`);
        return { text: speakText(ln.t), voice_id: ch.voice };
      });
      const payloadChars = inputs.reduce((n, x) => n + x.text.length, 0);
      const hash = crypto.createHash('sha1')
        .update(JSON.stringify(inputs) + MODEL + FORMAT).digest('hex').slice(0, 12);
      const file = `${key}.mp3`;
      const abs = path.join(OUT_DIR, file);
      const old = prev.segments[key];

      const reusable = !FORCE && old && old.hash === hash && fs.existsSync(abs);
      if (reusable) {
        manifest.segments[key] = old;
        cached++; spoken += old.dur || 0;
        continue;
      }
      chars += payloadChars;
      if (DRY) {
        manifest.segments[key] = { type: 'audio', file, hash, dur: payloadChars / 15, chars: payloadChars };
        made++;
        continue;
      }
      const seed = parseInt(hash.slice(0, 8), 16) % 2147483647;
      process.stdout.write(`  ${key.padEnd(16)} ${String(payloadChars).padStart(5)} ch  `);
      const buf = await synth(inputs, seed);
      fs.writeFileSync(abs, buf);
      const dur = mp3Duration(buf.length);
      manifest.segments[key] = {
        type: 'audio', file, hash, dur: +dur.toFixed(2), chars: payloadChars,
        lines: seg.lines.map(ln => ({ sp: ln.sp, text: stripTags(ln.t), weight: stripTags(ln.t).length }))
      };
      spoken += dur;
      made++;
      console.log(`${dur.toFixed(1)}s`);
      await sleep(400);
    }
  }

  // subtitle payload for beats and cached entries alike
  for (const scene of scenes) {
    const segs = segmentScene(scene);
    segs.forEach((seg, i) => {
      const m = manifest.segments[`${scene.id}.${i}`];
      if (m && seg.type === 'audio' && !m.lines) {
        m.lines = seg.lines.map(ln => ({ sp: ln.sp, text: stripTags(ln.t), weight: stripTags(ln.t).length }));
      }
    });
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  console.log(`\n${DRY ? '[dry run] ' : ''}segments: ${made} generated, ${cached} cached`);
  console.log(`characters billed this run: ${chars.toLocaleString()}`);
  console.log(`total spoken audio: ${(spoken / 60).toFixed(1)} min`);
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
