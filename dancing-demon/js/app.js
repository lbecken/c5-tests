// app.js — wiring: the screen, the show, and the editors.

import { Screen, Presenter, THEMES, C, W, H, textCentred, text } from './pixels.js';
import { Demon, pose, lerpPose } from './demon.js';
import { MOVES, MOVE_BY_CODE, sampleMove, routineAt, routineBeats, routineTapOffsets } from './moves.js';
import { Stage, FLOOR_Y } from './stage.js';
import { Sound, REST, HOLD, toEvents, noteName } from './audio.js';
import { TUNES, ROUTINES } from './tunes.js';

const MAX_NOTES = 255;
const MAX_STEPS = 120;

const scr = new Screen();
const presenter = new Presenter(document.getElementById('screen'));
const stage = new Stage();
const demon = new Demon();
const sound = new Sound();

const state = {
  mode: 'menu',
  notes: TUNES[0].notes.slice(),
  codes: ROUTINES[0].codes,
  speed: 128,
  repeats: 4,
  taps: true,
  reopenAt: 0,         // clock time to raise the curtain again after a show
  prevBeat: 0,         // last frame's beat position, for firing tap accents
  preview: null,       // move code being rehearsed in the dance editor
  musicPlay: null,     // { start, bps }
  show: null,
};

// Speed dial 1..255 maps onto something musical: 60..280 beats per minute.
const bpmFor = (speed) => 60 + (speed - 1) * (220 / 254);

// ---------------------------------------------------------------------------
// The show
// ---------------------------------------------------------------------------
const CURTAIN_UP = 2.0;
const MIN_BOW_SECONDS = 2.4;

function startShow() {
  const total = routineBeats(state.codes);
  if (!total) { setHud('No dance entered — add some steps first'); return; }
  sound.ensure();
  const bpm = bpmFor(state.speed);
  const bps = bpm / 60;
  const t0 = sound.ctx.currentTime + 0.1;
  const musicStart = t0 + CURTAIN_UP;
  const showBeats = total * state.repeats;

  // Build the whole event list up front, then feed it to Web Audio just ahead
  // of the playhead.
  const events = [];
  if (state.notes.length) {
    const noteEvents = toEvents(state.notes);
    const len = state.notes.length;
    const loops = Math.ceil((showBeats + 8) / len);
    for (let l = 0; l < loops; l++) {
      for (const e of noteEvents) {
        const b = l * len + e.beat;
        if (b < showBeats) events.push({ beat: b, type: 'note', midi: e.midi, len: e.beats });
      }
    }
  }
  if (state.taps) {
    const list = state.codes.split('').map((c) => MOVE_BY_CODE[c]).filter(Boolean);
    for (let r = 0; r < state.repeats; r++) {
      let base = r * total;
      for (const m of list) {
        for (const tp of m.taps) events.push({ beat: base + tp, type: 'tap' });
        base += m.beats;
      }
    }
  }
  events.sort((a, b) => a.beat - b.beat);

  sound.curtain(t0, true);
  stage.open();
  stage.cheer = 0.5;

  // The bow is measured in beats, but it should never flash past at high
  // tempos, so give it a floor in real seconds.
  const bowBeats = Math.max(4, Math.ceil(bps * MIN_BOW_SECONDS));
  state.show = { t0, musicStart, bps, showBeats, bowBeats, events, ptr: 0, phase: 'raise' };
  state.reopenAt = 0;
  state.prevBeat = 0;
  demon.snapTo(idlePose(clock));
  setMode('perform', true);
  updatePerformButtons();
}

function stopShow(quiet = false) {
  if (!state.show) return;
  state.show = null;
  stage.close();
  stage.cheer = 0;
  state.reopenAt = clock + 1.6;
  if (!quiet) sound.curtain(null, false);
  updatePerformButtons();
  setHud('Curtain down');
}

function updateShow() {
  const s = state.show;
  if (!s) return;
  const now = sound.ctx.currentTime;
  const beat = (now - s.musicStart) * s.bps;

  // Feed the audio graph roughly a third of a second ahead.
  const ahead = beat + 0.4 * s.bps;
  while (s.ptr < s.events.length && s.events[s.ptr].beat <= ahead) {
    const e = s.events[s.ptr++];
    const when = s.musicStart + e.beat / s.bps;
    if (e.type === 'note') sound.note(e.midi, when, Math.max(0.06, (e.len / s.bps) * 0.92));
    else sound.tap(when, 0.85 + Math.random() * 0.4);
  }

  if (s.phase === 'raise' && beat >= 0) s.phase = 'dance';
  if (s.phase === 'dance' && beat >= s.showBeats) {
    s.phase = 'bow';
    stage.cheer = 1;
    stage.burst(46);
    sound.applause(now, 3.2);
  }
  if (s.phase === 'bow' && beat >= s.showBeats + s.bowBeats) {
    s.phase = 'down';
    stage.close();
    sound.curtain(now, false);
  }
  if (s.phase === 'down' && stage.curtain >= 1) {
    state.show = null;
    state.reopenAt = clock + 1.2;
    updatePerformButtons();
    setHud('That&rsquo;s a wrap — he&rsquo;ll go again whenever you are ready');
  }
}

// ---------------------------------------------------------------------------
// Posing
// ---------------------------------------------------------------------------
function idlePose(t) {
  // Weight rocks slowly from foot to foot, the shoulders counter it, and every
  // few seconds he taps a toe out of sheer impatience.
  const sway = Math.sin(t * 1.15);
  const b = Math.sin(t * 2.3);
  const ph = (t % 3.4) / 3.4;
  const kick = ph < 0.12 ? Math.sin((ph / 0.12) * Math.PI) : 0;
  return pose({
    weight: sway * 0.55,
    crouch: 0.05 + Math.abs(b) * 0.05,
    lean: -sway * 0.05,
    head: sway * 0.07,
    twist: -sway * 0.18,
    shTilt: -sway * 0.05,
    armL: [0.30 + sway * 0.10, 0.28 + b * 0.05],
    armR: [-0.30 + sway * 0.10, -0.28 + b * 0.05],
    legR: [-0.14 - kick * 0.10, 0.05 + kick * 0.55, -kick * 0.35],
    tail: 0.35 + Math.sin(t * 1.7) * 0.55,
  });
}

/**
 * Fire a shoe-tap impulse into the rig for every tap crossed since the last
 * frame. This is what makes the whole body punch on the beat rather than only
 * the foot that made the sound.
 */
function fireAccents(prevBeat, beat, offsets, period) {
  if (!offsets.length || period <= 0 || beat <= prevBeat) return;
  const first = Math.floor(prevBeat / period);
  const last = Math.floor(beat / period);
  for (let l = first; l <= last; l++) {
    for (const o of offsets) {
      const at = l * period + o;
      if (at > prevBeat && at <= beat) demon.accent(0.85);
    }
  }
}

/** Fold a travelling position back onto the stage so he never walks off. */
function foldX(v, lim) {
  const p = 4 * lim;
  let m = ((v + lim) % p + p) % p;
  if (m > 2 * lim) m = p - m;
  return m - lim;
}

function currentPose(t, dt) {
  const s = state.show;
  if (s) {
    const beat = (sound.ctx.currentTime - s.musicStart) * s.bps;
    if (s.phase === 'bow' || s.phase === 'down') {
      const local = Math.min(4, Math.max(0, (beat - s.showBeats) * (4 / s.bowBeats)));
      const p = { ...sampleMove(MOVE_BY_CODE.Q, local) };
      p.x = foldX(p.x + (s.lastAnchor || 0), 50);
      return p;
    }
    if (s.phase === 'dance') {
      const total = routineBeats(state.codes);
      fireAccents(Math.max(0, state.prevBeat), Math.max(0, beat), routineTapOffsets(state.codes), total);
      state.prevBeat = Math.max(0, beat);
      const at = routineAt(state.codes, Math.max(0, beat));
      if (at) {
        const p = { ...sampleMove(at.move, at.local) };
        const list = state.codes.split('').map((c) => MOVE_BY_CODE[c]).filter(Boolean);
        const loopDx = list.reduce((n, m) => n + m.dx, 0);
        const abs = at.loops * loopDx + at.anchor + p.x;
        s.lastAnchor = at.loops * loopDx + at.anchor;
        p.x = foldX(abs, 50);
        return p;
      }
    }
    // Waiting behind the curtain — a nervous little shuffle.
    return idlePose(t * 1.6);
  }

  if (state.mode === 'dance') {
    if (state.preview) {
      const m = MOVE_BY_CODE[state.preview];
      const bps = bpmFor(state.speed) / 60;
      fireAccents(state.prevBeat, t * bps, m.taps, m.beats);
      state.prevBeat = t * bps;
      const local = (t * bps) % m.beats;
      const p = { ...sampleMove(m, local) };
      p.x = foldX(p.x, 40);
      return p;
    }
    if (routineBeats(state.codes)) {
      const bps = bpmFor(state.speed) / 60;
      fireAccents(state.prevBeat, t * bps, routineTapOffsets(state.codes), routineBeats(state.codes));
      state.prevBeat = t * bps;
      const at = routineAt(state.codes, t * bps);
      if (at) {
        const p = { ...sampleMove(at.move, at.local) };
        const list = state.codes.split('').map((c) => MOVE_BY_CODE[c]).filter(Boolean);
        const loopDx = list.reduce((n, m) => n + m.dx, 0);
        p.x = foldX(at.loops * loopDx + at.anchor + p.x, 46);
        return p;
      }
    }
  }

  if (state.mode === 'music' && state.musicPlay) {
    // He keeps time while you audition the tune.
    const bps = state.musicPlay.bps;
    const beat = (sound.ctx.currentTime - state.musicPlay.start) * bps;
    const ph = (beat % 2) / 2;
    const bounce = Math.abs(Math.sin(ph * Math.PI));
    const side = beat % 4 < 2 ? 1 : -1;
    return lerpPose(idlePose(t), pose({
      crouch: 0.34, y: -1.5, weight: 0.55 * side, twist: -0.25 * side, head: 0.06 * side,
      armL: [0.85, 0.25], armR: [-0.85, -0.25], tail: -0.6 * side,
    }), bounce * 0.6);
  }

  return idlePose(t);
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
let last = performance.now();
let clock = 0;

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(0.05, Math.max(0.0001, dt));
  clock += dt;

  if (state.show && sound.ctx) updateShow();
  if (state.musicPlay && sound.ctx && sound.ctx.currentTime > state.musicPlay.end) {
    state.musicPlay = null;
    document.getElementById('music-play').textContent = '▶ Play';
  }

  if (!state.show && state.reopenAt && clock > state.reopenAt) {
    state.reopenAt = 0;
    if (state.mode !== 'tape' && state.mode !== 'options') stage.open();
  }

  stage.update(dt);
  demon.update(dt, currentPose(clock, dt));

  stage.drawBack(scr);

  // Hide the performer behind the curtain as it flies in and out.
  const curtainBottom = 8 + stage.curtain * (FLOOR_Y + 4);
  scr.clip(Math.ceil(curtainBottom) - 1, H);
  demon.draw(scr, W / 2, FLOOR_Y + 3, 1);
  scr.noClip();

  stage.drawFront(scr);
  drawOverlay();

  presenter.draw(scr);
  requestAnimationFrame(frame);
}

function drawOverlay() {
  if (state.show) {
    const s = state.show;
    const beat = (sound.ctx.currentTime - s.musicStart) * s.bps;
    if (s.phase === 'raise') {
      stage.drawTitle(scr, 'THE DANCING DEMON', 'PRESENTED BY YOUR TRS-80');
    } else if (s.phase === 'dance') {
      const at = routineAt(state.codes, Math.max(0, beat));
      if (at) {
        const rep = Math.floor(beat / routineBeats(state.codes)) + 1;
        text(scr, `${at.move.code}`, 14, 12, C.GLOW, 1, 1);
        text(scr, at.move.name.toUpperCase(), 22, 12, C.LIGHT, 1, 1);
        const label = `${rep}/${state.repeats}`;
        textCentred(scr, label, W - 22, 12, C.LIGHT, 1, 1);
      }
    } else if (s.phase === 'down') {
      stage.drawTitle(scr, 'BRAVO', '');
    } else {
      stage.drawBanner(scr, 'BRAVO!', 10);
    }
    return;
  }

  switch (state.mode) {
    case 'menu':
      stage.drawTitle(scr, 'THE DANCING DEMON', 'PRESS 1 MUSIC  2 DANCE  3 PERFORM');
      break;
    case 'music':
      stage.drawBanner(scr, `MUSIC ${state.notes.length}/${MAX_NOTES} COUNTS`);
      break;
    case 'dance': {
      const label = state.preview
        ? `${state.preview} ${MOVE_BY_CODE[state.preview].name.toUpperCase()}`
        : `DANCE ${state.codes.length} STEPS`;
      stage.drawBanner(scr, label);
      break;
    }
    case 'perform':
      stage.drawBanner(scr, `SPEED ${state.speed}  REPEAT ${state.repeats}`);
      break;
    case 'tape':
      stage.drawBanner(scr, 'TAPE');
      break;
    case 'options':
      stage.drawBanner(scr, 'OPTIONS');
      break;
  }
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const hud = $('hud');
function setHud(msg) { hud.innerHTML = msg; }

function setMode(mode, keepShow = false) {
  if (!keepShow && state.show && mode !== 'perform') stopShow();
  state.mode = mode;
  for (const b of document.querySelectorAll('.tabs button')) {
    b.classList.toggle('active', b.dataset.mode === mode);
  }
  for (const p of document.querySelectorAll('.panel')) {
    p.classList.toggle('hidden', p.id !== 'panel-' + mode);
  }
  // Curtain is only up when there's something to look at.
  if (!state.show) {
    if (mode === 'tape' || mode === 'options') stage.close();
    else stage.open();
  }
  const notes = {
    menu: 'Welcome to the theatre',
    music: 'One note per count — just like 1979',
    dance: 'Eighteen steps, A through R',
    perform: 'Set the speed and raise the curtain',
    tape: 'Save your show',
    options: 'Pick your phosphor',
  };
  setHud(notes[mode] || '');
}

// ---------------------------------------------------------------------------
// Music editor
// ---------------------------------------------------------------------------
const KEYMAP = {
  z: 60, s: 61, x: 62, d: 63, c: 64, v: 65, g: 66, b: 67, h: 68, n: 69, j: 70, m: 71,
  q: 72, 2: 73, w: 74, 3: 75, e: 76, r: 77, 5: 78, t: 79, 6: 80, y: 81, 7: 82, u: 83,
  i: 84,
};

function buildPiano() {
  const host = $('piano');
  host.innerHTML = '';
  const whiteSemis = [0, 2, 4, 5, 7, 9, 11];
  const labels = {};
  for (const [k, v] of Object.entries(KEYMAP)) labels[v] = k.toUpperCase();

  const whites = [];
  for (let midi = 60; midi <= 84; midi++) {
    if (whiteSemis.includes(midi % 12)) whites.push(midi);
  }
  whites.forEach((midi) => {
    const el = document.createElement('div');
    el.className = 'wkey';
    el.dataset.midi = midi;
    el.textContent = labels[midi] || '';
    el.title = noteName(midi);
    host.appendChild(el);
  });
  // Black keys, positioned over the gaps.
  const wpc = 100 / whites.length;
  whites.forEach((midi, i) => {
    const semi = midi % 12;
    if (semi === 4 || semi === 11 || midi === 84) return;
    const el = document.createElement('div');
    el.className = 'bkey';
    el.dataset.midi = midi + 1;
    el.textContent = labels[midi + 1] || '';
    el.title = noteName(midi + 1);
    el.style.left = `calc(${(i + 1) * wpc}% - 1.55%)`;
    host.appendChild(el);
  });

  host.addEventListener('pointerdown', (ev) => {
    const t = ev.target.closest('[data-midi]');
    if (!t) return;
    ev.preventDefault();
    addNote(parseInt(t.dataset.midi, 10));
    flash(t);
  });
}

function flash(el) {
  el.classList.add('on');
  setTimeout(() => el.classList.remove('on'), 110);
}

function addNote(midi) {
  if (state.notes.length >= MAX_NOTES) { setHud('Tape full — 255 counts is the limit'); return; }
  state.notes.push(midi);
  if (midi >= 0) sound.note(midi, sound.now, 0.16, 0.2);
  else sound.tap(sound.now, 0.5);
  renderMusic();
}

function renderMusic() {
  const strip = $('music-strip');
  strip.innerHTML = '';
  state.notes.forEach((n, i) => {
    const el = document.createElement('span');
    el.className = 'chip' + (n === REST ? ' rest' : n === HOLD ? ' hold' : '');
    el.textContent = noteName(n);
    el.title = 'Click to delete count ' + (i + 1);
    el.dataset.i = i;
    strip.appendChild(el);
  });
  $('music-count').textContent = `${state.notes.length} / ${MAX_NOTES} counts`;
}

function playMusic() {
  if (state.musicPlay) { stopMusic(); return; }
  if (!state.notes.length) { setHud('Nothing to play yet'); return; }
  sound.ensure();
  const bps = bpmFor(state.speed) / 60;
  const start = sound.ctx.currentTime + 0.08;
  for (const e of toEvents(state.notes)) {
    sound.note(e.midi, start + e.beat / bps, Math.max(0.06, (e.beats / bps) * 0.9));
  }
  state.musicPlay = { start, bps, end: start + state.notes.length / bps };
  $('music-play').textContent = '■ Stop';
}

function stopMusic() {
  state.musicPlay = null;
  $('music-play').textContent = '▶ Play';
  sound.hush();
}

// ---------------------------------------------------------------------------
// Dance editor
// ---------------------------------------------------------------------------
function buildMoves() {
  const host = $('moves');
  host.innerHTML = '';
  for (const m of MOVES) {
    const b = document.createElement('button');
    b.className = 'move';
    b.dataset.code = m.code;
    b.innerHTML = `<span class="letter">${m.code}</span><span class="nm">${m.name}<span class="ct">${m.beats} count${m.beats > 1 ? 's' : ''}</span></span>`;
    b.addEventListener('mouseenter', () => { state.preview = m.code; });
    b.addEventListener('focus', () => { state.preview = m.code; });
    b.addEventListener('mouseleave', () => { if (state.preview === m.code) state.preview = null; });
    b.addEventListener('blur', () => { if (state.preview === m.code) state.preview = null; });
    b.addEventListener('click', () => addStep(m.code));
    host.appendChild(b);
  }
}

function addStep(code) {
  if (state.codes.length >= MAX_STEPS) { setHud('That routine is long enough!'); return; }
  state.codes += code;
  sound.blip(76 + (code.charCodeAt(0) % 7));
  renderDance();
}

function renderDance() {
  const strip = $('dance-strip');
  strip.innerHTML = '';
  state.codes.split('').forEach((c, i) => {
    const m = MOVE_BY_CODE[c];
    if (!m) return;
    const el = document.createElement('span');
    el.className = 'chip';
    el.textContent = `${c} ${m.name}`;
    el.title = 'Click to remove';
    el.dataset.i = i;
    strip.appendChild(el);
  });
  $('dance-count').textContent = `${state.codes.length} steps · ${routineBeats(state.codes)} counts`;
}

// ---------------------------------------------------------------------------
// Tape (save / load)
// ---------------------------------------------------------------------------
const STORE = 'dancing-demon-shows';

function loadSaves() {
  try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; }
}
function writeSaves(list) {
  try { localStorage.setItem(STORE, JSON.stringify(list)); } catch { /* private mode */ }
}

function renderSaves() {
  const host = $('save-list');
  const list = loadSaves();
  host.innerHTML = '';
  if (!list.length) {
    host.innerHTML = '<p class="muted small">No shows saved yet.</p>';
    return;
  }
  list.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'saverow';
    row.innerHTML = `<span class="nm">${escapeHtml(s.name)}</span>
      <span class="muted small">${s.notes.length} counts · ${s.codes.length} steps</span>`;
    const load = document.createElement('button');
    load.textContent = 'Load';
    load.onclick = () => { applyShow(s); setHud('Loaded ' + escapeHtml(s.name)); };
    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'danger';
    del.onclick = () => { const l = loadSaves(); l.splice(i, 1); writeSaves(l); renderSaves(); };
    row.append(load, del);
    host.appendChild(row);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function currentShowData(name) {
  return { name: name || 'Untitled', notes: state.notes.slice(), codes: state.codes, speed: state.speed, repeats: state.repeats };
}

function applyShow(s) {
  if (Array.isArray(s.notes)) state.notes = s.notes.slice(0, MAX_NOTES);
  if (typeof s.codes === 'string') state.codes = s.codes.split('').filter((c) => MOVE_BY_CODE[c]).join('');
  if (s.speed) { state.speed = clampInt(s.speed, 1, 255); $('speed').value = state.speed; $('speed-val').textContent = state.speed; }
  if (s.repeats) { state.repeats = clampInt(s.repeats, 1, 16); $('repeats').value = state.repeats; $('repeat-val').textContent = state.repeats; }
  renderMusic();
  renderDance();
}

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)));

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
function init() {
  // Tabs.
  $('tabs').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-mode]');
    if (!b) return;
    sound.ensure();
    setMode(b.dataset.mode);
    if (b.dataset.mode === 'tape') renderSaves();
  });

  // Quick start buttons.
  const qs = $('quickstart');
  ROUTINES.forEach((r, i) => {
    const b = document.createElement('button');
    b.textContent = `▶ ${r.name}`;
    if (i === 2) b.className = 'primary';
    b.onclick = () => {
      state.codes = r.codes;
      state.notes = TUNES[i % TUNES.length].notes.slice();
      renderMusic();
      renderDance();
      startShow();
    };
    qs.appendChild(b);
  });

  // Music.
  buildPiano();
  renderMusic();
  $('music-play').onclick = playMusic;
  $('music-rest').onclick = () => addNote(REST);
  $('music-hold').onclick = () => addNote(HOLD);
  $('music-back').onclick = () => { state.notes.pop(); renderMusic(); };
  $('music-clear').onclick = () => { state.notes = []; renderMusic(); };
  $('music-strip').addEventListener('click', (ev) => {
    const c = ev.target.closest('.chip');
    if (!c) return;
    state.notes.splice(parseInt(c.dataset.i, 10), 1);
    renderMusic();
  });
  const mp = $('music-preset');
  mp.innerHTML = '<option value="">choose…</option>' + TUNES.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');
  mp.onchange = () => {
    if (mp.value === '') return;
    state.notes = TUNES[+mp.value].notes.slice();
    renderMusic();
    mp.value = '';
    setHud('Tune loaded');
  };

  // Dance.
  buildMoves();
  renderDance();
  $('dance-back').onclick = () => { state.codes = state.codes.slice(0, -1); renderDance(); };
  $('dance-clear').onclick = () => { state.codes = ''; renderDance(); };
  $('dance-random').onclick = () => {
    let out = '';
    const n = 8 + Math.floor(Math.random() * 7);
    for (let i = 0; i < n; i++) out += MOVES[(Math.random() * MOVES.length) | 0].code;
    out += 'Q';
    state.codes = out;
    renderDance();
    setHud('Improvised a routine');
  };
  $('dance-strip').addEventListener('click', (ev) => {
    const c = ev.target.closest('.chip');
    if (!c) return;
    const i = parseInt(c.dataset.i, 10);
    state.codes = state.codes.slice(0, i) + state.codes.slice(i + 1);
    renderDance();
  });
  const dp = $('dance-preset');
  dp.innerHTML = '<option value="">choose…</option>' + ROUTINES.map((r, i) => `<option value="${i}">${r.name}</option>`).join('');
  dp.onchange = () => {
    if (dp.value === '') return;
    state.codes = ROUTINES[+dp.value].codes;
    renderDance();
    dp.value = '';
    setHud('Routine loaded');
  };

  // Perform.
  $('speed').oninput = (e) => { state.speed = +e.target.value; $('speed-val').textContent = state.speed; updatePerformStatus(); };
  $('repeats').oninput = (e) => { state.repeats = +e.target.value; $('repeat-val').textContent = state.repeats; updatePerformStatus(); };
  $('opt-taps').onchange = (e) => { state.taps = e.target.checked; };
  $('go').onclick = () => startShow();
  $('stop').onclick = () => stopShow();
  updatePerformStatus();
  updatePerformButtons();

  // Tape.
  $('save-btn').onclick = () => {
    const name = ($('save-name').value || '').trim() || `Show ${loadSaves().length + 1}`;
    const list = loadSaves();
    list.push(currentShowData(name));
    writeSaves(list);
    $('save-name').value = '';
    renderSaves();
    setHud('Saved to tape');
  };
  $('export-btn').onclick = async () => {
    const code = 'DD1:' + btoa(unescape(encodeURIComponent(JSON.stringify(currentShowData('Exported')))));
    $('tape-code').value = code;
    try { await navigator.clipboard.writeText(code); $('tape-status').textContent = 'Copied to the clipboard.'; }
    catch { $('tape-status').textContent = 'Code is in the box — copy it yourself.'; }
  };
  $('import-btn').onclick = () => {
    const raw = $('tape-code').value.trim();
    try {
      if (!raw.startsWith('DD1:')) throw new Error('bad header');
      const data = JSON.parse(decodeURIComponent(escape(atob(raw.slice(4)))));
      applyShow(data);
      $('tape-status').textContent = 'Loaded “' + escapeHtml(data.name || 'Untitled') + '”.';
    } catch {
      $('tape-status').textContent = 'That does not look like a show code.';
    }
  };
  renderSaves();

  // Options.
  const th = $('opt-theme');
  th.innerHTML = Object.entries(THEMES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
  th.onchange = () => presenter.setTheme(th.value);
  $('opt-crt').onchange = (e) => { presenter.crt = e.target.checked; };
  $('opt-mute').onchange = (e) => { sound.setMuted(e.target.checked); };
  $('opt-volume').oninput = (e) => { sound.setVolume(e.target.value / 100); $('vol-val').textContent = e.target.value; };

  // Sound: browsers hold the audio clock shut until a gesture, so nudge it on
  // every interaction and say so plainly if it is still closed.
  sound.onStateChange = updateSoundNotice;
  const wake = () => { sound.ensure(); updateSoundNotice(); };
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  updateSoundNotice();

  // Keyboard.
  window.addEventListener('keydown', onKey);

  // Screen sizing.
  const ro = new ResizeObserver(() => presenter.resize());
  ro.observe(document.querySelector('.canvas-host'));
  window.addEventListener('resize', () => presenter.resize());
  presenter.resize();

  setMode('menu');
  requestAnimationFrame((t) => { last = t; frame(t); });
}

function updateSoundNotice() {
  const el = $('sound-notice');
  if (el) el.classList.toggle('hidden', !sound.ctx || sound.running);
}

function updatePerformStatus() {
  const beats = routineBeats(state.codes);
  const bpm = Math.round(bpmFor(state.speed));
  const secs = beats * state.repeats / (bpm / 60);
  $('perform-status').innerHTML = beats
    ? `${beats} counts per pass · ${bpm} beats per minute · about ${secs.toFixed(0)}s of dancing, then a bow.`
    : 'No steps entered — visit <b>2 Dance</b> first.';
}

function updatePerformButtons() {
  const running = !!state.show;
  $('go').disabled = running;
  $('stop').disabled = !running;
}

function onKey(ev) {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const tag = (ev.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  const k = ev.key.toLowerCase();

  if (k === 'escape') { stopShow(); return; }
  if (state.mode !== 'music' && '1234'.includes(k)) {
    setMode({ 1: 'music', 2: 'dance', 3: 'perform', 4: 'tape' }[k]);
    ev.preventDefault();
    return;
  }

  if (state.mode === 'music') {
    if (k === ' ') { ev.preventDefault(); playMusic(); return; }
    if (k === 'backspace') { ev.preventDefault(); state.notes.pop(); renderMusic(); return; }
    if (k === ',') { ev.preventDefault(); addNote(REST); return; }
    if (k === '.') { ev.preventDefault(); addNote(HOLD); return; }
    if (KEYMAP[k] !== undefined) {
      ev.preventDefault();
      addNote(KEYMAP[k]);
      const el = document.querySelector(`[data-midi="${KEYMAP[k]}"]`);
      if (el) flash(el);
      return;
    }
  }

  if (state.mode === 'dance') {
    if (k === 'backspace') { ev.preventDefault(); state.codes = state.codes.slice(0, -1); renderDance(); return; }
    const up = ev.key.toUpperCase();
    if (MOVE_BY_CODE[up]) { ev.preventDefault(); addStep(up); return; }
  }

  if (k === ' ' && state.mode === 'perform') {
    ev.preventDefault();
    if (state.show) stopShow(); else startShow();
  }
}

init();
