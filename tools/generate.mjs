#!/usr/bin/env node
/**
 * Audio production for THE OBSERVATORY MURDER.
 *
 * Reads web/script.json and produces every clip the game needs:
 *
 *   beds/   looping room tone per station  (ElevenLabs sound-generation)
 *   sfx/    one-shot effects               (ElevenLabs sound-generation)
 *   cues/   every spoken cue               (ElevenLabs v3 TTS / text-to-dialogue)
 *
 * Each cue is post-processed through an ffmpeg chain that gives it its channel
 * character: `radio` for the primary loop, `relay` for the narrower emergency
 * loop, `archive` for the rehearsal tape, `synthetic` for the fabricated line.
 * Cues may also have sfx or synth clips mixed in at an exact offset.
 *
 * Everything is content-hashed. Re-running only regenerates what changed, so an
 * interrupted run costs nothing to resume.
 *
 *   node tools/generate.mjs --dry        estimate cost, generate nothing
 *   node tools/generate.mjs --only=cues  beds | sfx | cues
 *   node tools/generate.mjs --force      ignore the cache
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = path.join(ROOT, 'web', 'audio');
const CACHE_FILE = path.join(AUDIO, '.cache.json');
const API = 'https://api.elevenlabs.io';
const KEY = process.env.ELEVENLABS_API_KEY;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const FORCE = args.includes('--force');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;
const MATCH = (args.find((a) => a.startsWith('--match=')) || '').split('=')[1] || null;
const CONCURRENCY = 3;

if (!KEY && !DRY) {
  console.error('ELEVENLABS_API_KEY is not set.');
  process.exit(1);
}

const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'script.json'), 'utf8'));
const { characters, beds, sfx, fx, scenes } = script;

const cache = FORCE || !fs.existsSync(CACHE_FILE) ? {} : JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const hash = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 20);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let spentChars = 0;
let generated = 0;
let skipped = 0;

const cueIndex = {};
for (const scene of Object.values(scenes)) for (const c of scene.cues || []) cueIndex[c.id] = c;

// v3 accepts three stability settings; anything else is rejected.
const snapStability = (v) => [0.0, 0.5, 1.0].reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), 0.5);

async function api(route, body, { retries = 4 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + route, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const text = await res.text().catch(() => '');
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new Error(`${route} -> ${res.status} ${text.slice(0, 300)}`);
    }
    const wait = 2000 * 2 ** attempt;
    process.stdout.write(`\n    ${res.status}, retrying in ${wait / 1000}s `);
    await sleep(wait);
  }
}

async function ffmpeg(argv) {
  try {
    await exec('ffmpeg', ['-y', '-loglevel', 'error', ...argv]);
  } catch (e) {
    throw new Error(`ffmpeg failed: ${e.stderr || e.message}`);
  }
}

async function duration(file) {
  const { stdout } = await exec('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ]);
  return Math.round(parseFloat(stdout.trim()) * 100) / 100;
}

/* ------------------------------------------------------------------ beds */

async function makeBed(id, def) {
  const out = path.join(AUDIO, 'beds', `${id}.mp3`);
  const key = `bed:${id}`;
  const h = hash({ ...def, v: 3 });
  if (!FORCE && cache[key] === h && fs.existsSync(out)) { skipped++; return; }
  spentChars += def.duration * 25; // sound-generation is billed by duration
  if (DRY) return;

  const raw = await api(`/v1/sound-generation?output_format=mp3_44100_128`, {
    text: def.prompt,
    duration_seconds: def.duration,
    loop: true,
    prompt_influence: 0.55,
  });
  const tmp = path.join(AUDIO, 'beds', `${id}.raw.mp3`);
  fs.writeFileSync(tmp, raw);
  // Beds are looped under dialogue, so normalise hard and fade the seam.
  await ffmpeg(['-i', tmp, '-af',
    `afade=t=in:st=0:d=0.25,afade=t=out:st=${def.duration - 0.25}:d=0.25,loudnorm=I=-26:TP=-6:LRA=6`,
    '-codec:a', 'libmp3lame', '-b:a', '96k', '-ac', '1', out]);
  fs.unlinkSync(tmp);
  cache[key] = h;
  generated++;
}

/* ------------------------------------------------------------------- sfx */

async function makeSfx(id, def) {
  const out = path.join(AUDIO, 'sfx', `${id}.mp3`);
  const key = `sfx:${id}`;
  const h = hash({ ...def, v: 3 });
  if (!FORCE && cache[key] === h && fs.existsSync(out)) { skipped++; return; }
  spentChars += def.duration * 25;
  if (DRY) return;

  const raw = await api(`/v1/sound-generation?output_format=mp3_44100_128`, {
    text: def.prompt,
    duration_seconds: def.duration,
    loop: false,
    prompt_influence: 0.6,
  });
  const tmp = path.join(AUDIO, 'sfx', `${id}.raw.mp3`);
  fs.writeFileSync(tmp, raw);
  await ffmpeg(['-i', tmp, '-af', 'loudnorm=I=-20:TP=-3:LRA=9',
    '-codec:a', 'libmp3lame', '-b:a', '96k', '-ac', '1', out]);
  fs.unlinkSync(tmp);
  cache[key] = h;
  generated++;
}

/* ------------------------------------------------------------------ cues */

// Models leave dead air at the head and tail of a take. Across 275 cues that is
// minutes of nothing, and in a radio drama it reads as sluggish. Trim it to a
// short, consistent breath either side.
const TRIM = [
  'silenceremove=start_periods=1:start_duration=0.05:start_threshold=-45dB:detection=peak',
  'areverse',
  'silenceremove=start_periods=1:start_duration=0.10:start_threshold=-45dB:detection=peak',
  'areverse',
  'adelay=60|60',
  'apad=pad_dur=0.18',
].join(',');

async function trimSilence(file) {
  const tmp = file.replace(/\.mp3$/, '.trim.mp3');
  await ffmpeg(['-i', file, '-af', TRIM, '-codec:a', 'libmp3lame', '-b:a', '128k', '-ac', '1', tmp]);
  const d = await duration(tmp).catch(() => 0);
  if (d > 0.2) fs.renameSync(tmp, file);
  else fs.rmSync(tmp, { force: true });
}


// eleven_v3 is the better performer but becomes unreliable on very short text —
// it can return near-silence for a two-word line. The plot depends on several
// two-word lines, so anything under this length is voiced with multilingual_v2,
// which is dependable at that length and accepts continuous stability.
const V3_MIN_CHARS = 120;
const plainLength = (s) => s.replace(/\[[^\]]*\]/g, '').trim().length;

function cuePayload(cue) {
  if (cue.type === 'dialogue') {
    return {
      route: '/v1/text-to-dialogue?output_format=mp3_44100_128',
      body: {
        model_id: 'eleven_v3',
        inputs: cue.lines.map((l) => ({ text: l.t, voice_id: characters[l.sp].voiceId })),
        settings: { stability: snapStability(0.5), use_speaker_boost: true },
      },
      chars: cue.lines.reduce((n, l) => n + l.t.length, 0),
    };
  }
  const ch = characters[cue.sp];
  const short = plainLength(cue.t) < V3_MIN_CHARS;
  const model = short ? 'eleven_multilingual_v2' : 'eleven_v3';
  // The fabricated line is voiced at maximum stability: flatter, more uniform,
  // fewer human irregularities. Its tell is a property of how it was made.
  const wanted = cue.fx === 'synthetic' ? 1.0 : ch.stability;
  return {
    route: `/v1/text-to-speech/${ch.voiceId}?output_format=mp3_44100_128`,
    body: {
      model_id: model,
      text: short ? cue.t.replace(/\[[^\]]*\]\s*/g, '') : cue.t,
      voice_settings: {
        stability: short ? wanted : snapStability(wanted),
        similarity_boost: ch.similarity,
        use_speaker_boost: true,
      },
    },
    chars: cue.t.length,
  };
}

// A "take" is the unprocessed voice audio. Cues that reuse another cue's take
// share the file on disk, so the rehearsal fragments and the transmissions
// attributed to a dead man are literally the same recording — which is exactly
// what the mystery claims about them.
async function ensureTake(cue) {
  const takePath = path.join(AUDIO, '.takes', `${cue.id}.mp3`);
  const key = `take:${cue.id}`;
  const payload = cuePayload(cue);
  const h = hash({ p: payload.body, v: 5 });
  if (!FORCE && cache[key] === h && fs.existsSync(takePath)) return takePath;
  spentChars += payload.chars;
  if (DRY) return takePath;

  const raw = await api(payload.route, payload.body);
  fs.writeFileSync(takePath, raw);
  await trimSilence(takePath);
  const d = await duration(takePath).catch(() => 0);
  if (!d || d < 0.35 || raw.length < 2048) {
    fs.rmSync(takePath, { force: true });
    throw new Error(`cue ${cue.id}: model returned ${raw.length}B / ${d}s — text too short for ${payload.body.model_id}`);
  }
  cache[key] = h;
  return takePath;
}

async function makeCue(cue) {
  const out = path.join(AUDIO, 'cues', `${cue.id}.mp3`);
  const key = `cue:${cue.id}`;
  const source = cue.reuse ? cueIndex[cue.reuse] : cue;
  if (!source) throw new Error(`cue ${cue.id}: reuse target "${cue.reuse}" not found`);
  const payload = cuePayload(source);
  const h = hash({ p: payload.body, fx: cue.fx, mix: cue.mix, tail: cue.tail, reuse: cue.reuse, v: 6 });
  if (!FORCE && cache[key] === h && fs.existsSync(out)) { skipped++; return; }

  const tmp = await ensureTake(source);
  if (DRY) return;

  const chain = (fx[cue.fx] || fx.clean).chain;
  const inputs = ['-i', tmp];
  const filters = [];
  const labels = [];

  // loudnorm needs ~3 s of signal and emits nothing for anything shorter, which
  // matters here because several plot-critical lines are two words long. Pad
  // first, normalise, then trim back to the length we actually want — which is
  // the take plus any tail a mixed-in artefact needs to land in.
  const takeDur = await duration(tmp);
  const target = Math.max(0.5, takeDur + (cue.tail || 0));
  filters.push(`[0:a]apad=whole_dur=4.5,${chain},atrim=0:${target.toFixed(3)},asetpts=N/SR/TB[v]`);
  labels.push('[v]');

  (cue.mix || []).forEach((m, i) => {
    const src = m.sfx
      ? path.join(AUDIO, 'sfx', `${m.sfx}.mp3`)
      : path.join(AUDIO, 'synth', `${m.synth}.mp3`);
    if (!fs.existsSync(src)) throw new Error(`mix source missing: ${src} (cue ${cue.id})`);
    inputs.push('-i', src);
    const delayMs = Math.round((m.at || 0) * 1000);
    filters.push(`[${i + 1}:a]adelay=${delayMs}|${delayMs},volume=${m.gain ?? 0.4}[m${i}]`);
    labels.push(`[m${i}]`);
  });

  if (labels.length > 1) {
    filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=first:dropout_transition=0:normalize=0[out]`);
  } else {
    filters.push(`[v]anull[out]`);
  }

  await ffmpeg([...inputs, '-filter_complex', filters.join(';'), '-map', '[out]',
    '-codec:a', 'libmp3lame', '-b:a', '80k', '-ac', '1', out]);
  const d = await duration(out).catch(() => 0);
  if (!d || d < 0.35) throw new Error(`cue ${cue.id}: produced ${d}s of audio`);
  cache[key] = h;
  generated++;
}

/* ------------------------------------------------------------------ main */

async function pool(items, worker, label) {
  let i = 0;
  let done = 0;
  const total = items.length;
  const step = Math.max(1, Math.floor(total / 10));
  const tick = () => {
    done++;
    if (done === total || done % step === 0) {
      const pct = Math.round((done / total) * 100);
      console.log(`  ${label.padEnd(8)} ${String(done).padStart(3)}/${total}  ${pct}%`);
    }
  };
  const runners = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      try {
        await worker(item);
      } catch (e) {
        console.error(`\n  ! ${e.message}`);
        throw e;
      }
      tick();
    }
  });
  await Promise.all(runners);
  process.stdout.write('\n');
}

async function main() {
  for (const d of ['beds', 'sfx', 'cues', 'synth', '.takes']) fs.mkdirSync(path.join(AUDIO, d), { recursive: true });

  const allCues = [];
  for (const scene of Object.values(scenes)) for (const c of scene.cues || []) allCues.push(c);
  const spoken = allCues
    .filter((c) => c.type === 'tts' || c.type === 'dialogue')
    .filter((c) => !MATCH || c.id.includes(MATCH));

  console.log(`\n  ${DRY ? 'ESTIMATE' : 'GENERATING'}: ${Object.keys(beds).length} beds, ${Object.keys(sfx).length} sfx, ${spoken.length} spoken cues\n`);

  const save = () => { if (!DRY) fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1)); };

  try {
    // Beds and sfx first: cue mixing reads sfx files off disk.
    if (!ONLY || ONLY === 'beds') await pool(Object.entries(beds), ([id, d]) => makeBed(id, d), 'beds');
    save();
    if (!ONLY || ONLY === 'sfx') await pool(Object.entries(sfx), ([id, d]) => makeSfx(id, d), 'sfx');
    save();
    if (!ONLY || ONLY === 'cues') await pool(spoken, makeCue, 'cues');
    save();
  } finally {
    save();
  }

  console.log(`\n  generated ${generated}, cached ${skipped}`);
  console.log(`  billed characters (approx): ${spentChars.toLocaleString()}`);

  if (DRY) { console.log(''); return; }

  // ---- manifest ----
  const manifest = { beds: {}, sfx: {}, cues: {}, synth: {} };
  let total = 0;
  for (const [group, dir] of [['beds', 'beds'], ['sfx', 'sfx'], ['synth', 'synth'], ['cues', 'cues']]) {
    const d = path.join(AUDIO, dir);
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.mp3'))) {
      const id = f.replace(/\.mp3$/, '');
      const dur = await duration(path.join(d, f));
      manifest[group][id] = { file: `audio/${dir}/${f}`, dur, bytes: fs.statSync(path.join(d, f)).size };
      if (group === 'cues') total += dur;
    }
  }
  manifest.totalCueSeconds = Math.round(total);
  fs.writeFileSync(path.join(AUDIO, 'manifest.json'), JSON.stringify(manifest, null, 1));

  const bytes = Object.values(manifest).flatMap((g) => (typeof g === 'object' ? Object.values(g) : []))
    .reduce((n, x) => n + (x.bytes || 0), 0);
  const mins = Math.floor(total / 60), secs = Math.round(total % 60);
  console.log(`  spoken audio: ${mins}m ${secs}s across ${Object.keys(manifest.cues).length} cues`);
  console.log(`  total on disk: ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  wrote web/audio/manifest.json\n`);
}

main().catch((e) => { console.error('\n', e.message, '\n'); process.exit(1); });
