/* THE OBSERVATORY MURDER — engine
 *
 * Plays a scene graph of audio cues. Every cue is a voice recording over a
 * looping room tone; the room tone is diegetic evidence, so it is always mixed
 * audibly under the voice and can be soloed from the archive.
 */

'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SAVE_KEY = 'observatory-murder.save.v1';

let SCRIPT = null, MANIFEST = null;

/* ══════════════════════════════════════════════════════════ state ═══ */

const S = {
  scene: null, cueIndex: 0,
  flags: {}, counters: {}, seen: [], evidence: [], clips: [], taken: {},
  deduction: {}, ending: null,
  settings: { volume: 0.85, rate: 1 },
};

const has = (e) => S.evidence.includes(e);
const keyEvidence = () => SCRIPT.meta.keyEvidence.filter(has);
const strongCase = () =>
  keyEvidence().length >= SCRIPT.meta.strongCaseThreshold &&
  SCRIPT.meta.strongCaseRequiresOneOf.some(has);

function applySet(set) {
  for (const [k, v] of Object.entries(set || {})) {
    if (k.startsWith('+')) S.counters[k.slice(1)] = (S.counters[k.slice(1)] || 0) + v;
    else S.flags[k] = v;
  }
}

function grant(ids, announce = true) {
  for (const id of ids || []) {
    if (has(id)) continue;
    S.evidence.push(id);
    if (announce) toastEvidence(id);
  }
  updateHud();
}

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* private mode */ }
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.scene ? d : null;
  } catch { return null; }
}

/* ══════════════════════════════════════════════════════════ audio ═══ */

const A = {
  voice: $('#a-voice'), bed: $('#a-bed'), pre: $('#a-pre'),
  bedId: null, fade: null, onEnd: null, raf: null,
  bedGain: 1, voiceGain: 1,
};

function bedVolume() {
  const def = SCRIPT.beds[A.bedId];
  return (def ? def.gain : 0.2) * S.settings.volume * A.bedGain;
}

function setBed(id) {
  if (!id || id === A.bedId) { A.bed.volume = bedVolume(); return; }
  const next = SCRIPT.beds[id] && MANIFEST.beds[id];
  if (!next) return;
  A.bedId = id;
  clearInterval(A.fade);
  const target = bedVolume();
  // Short crossfade: stations should feel like different places, not hard cuts.
  const from = A.bed.volume;
  let t = 0;
  A.fade = setInterval(() => {
    t += 0.06;
    if (t < 0.5) { A.bed.volume = Math.max(0, from * (1 - t / 0.5)); return; }
    if (A.bed.src.indexOf(next.file) === -1) {
      A.bed.src = next.file;
      A.bed.play().catch(() => {});
    }
    const k = Math.min(1, (t - 0.5) / 0.6);
    A.bed.volume = target * k;
    if (k >= 1) { clearInterval(A.fade); A.fade = null; }
  }, 60);
}

function stopVoice() {
  A.voice.pause();
  A.voice.removeAttribute('src');
  A.voice.load();
  cancelAnimationFrame(A.raf);
  $('#meter').classList.remove('on');
}

function playFile(file, { rate = S.settings.rate, gain = 1, onEnd } = {}) {
  A.onEnd = onEnd || null;
  A.voice.src = file;
  A.voice.volume = Math.min(1, S.settings.volume * gain);
  A.voice.playbackRate = rate;
  if ('preservesPitch' in A.voice) A.voice.preservesPitch = true;
  A.voice.play().catch(() => {});
  const meter = $('#meter');
  meter.classList.add('on');
  const tick = () => {
    const d = A.voice.duration;
    if (d) meter.querySelector('i').style.setProperty('--p', `${(A.voice.currentTime / d) * 100}%`);
    A.raf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(A.raf);
  A.raf = requestAnimationFrame(tick);
}

A.voice.addEventListener('ended', () => {
  cancelAnimationFrame(A.raf);
  $('#meter').classList.remove('on');
  const cb = A.onEnd; A.onEnd = null;
  if (cb) cb();
});
A.voice.addEventListener('error', () => {
  const cb = A.onEnd; A.onEnd = null;
  if (cb) setTimeout(cb, 200);
});

function cueFile(cue) {
  if (cue.type === 'sfx')   return MANIFEST.sfx[cue.sfx]?.file;
  if (cue.type === 'synth') return MANIFEST.synth[cue.synth]?.file;
  return MANIFEST.cues[cue.id]?.file;
}

/* ══════════════════════════════════════════════════ scene playback ═══ */

function sceneOf(id) { return SCRIPT.scenes[id]; }

function startScene(id) {
  const scene = sceneOf(id);
  if (!scene) return;
  S.scene = id;
  S.cueIndex = 0;
  if (!S.seen.includes(id)) S.seen.push(id);
  applySet(scene.set);
  grant(scene.grants, false);

  $('#choices').hidden = true;
  $('#puzzle-slot').hidden = true;
  $('#deduction-slot').hidden = true;

  if (scene.title) {
    const head = el('div', 'scene-head');
    head.append(el('h3', null, esc(scene.title)));
    if (scene.time) head.append(el('span', 'clock', esc(scene.time)));
    $('#log').append(head);
  }
  // Evidence granted by entering a scene is announced after the header so the
  // player sees what the scene gave them, not a toast out of nowhere.
  for (const e of scene.grants || []) if (has(e)) toastEvidence(e, true);

  updateHud();
  scrollLog();
  nextCue();
  save();
}

function nextCue() {
  const scene = sceneOf(S.scene);
  const cue = (scene.cues || [])[S.cueIndex];
  if (!cue) return endOfScene();

  S.cueIndex++;
  setBed(cue.bed || scene.bed);
  renderCue(cue);

  const file = cueFile(cue);
  if (!file) return nextCue();

  // A cue flagged `isolate: bed` is a deliberate act of analysis: the room
  // matters more than the words.
  const isoBed = cue.isolate === 'bed';
  A.bedGain = isoBed ? 3.0 : 1;
  A.bed.volume = bedVolume();

  registerClip(cue);
  preloadNext();
  playFile(file, { gain: isoBed ? 0.55 : 1, onEnd: () => { A.bedGain = 1; A.bed.volume = bedVolume(); nextCue(); } });
  updateNowPlaying(cue);
  scrollLog();
}

function preloadNext() {
  const scene = sceneOf(S.scene);
  const cue = (scene.cues || [])[S.cueIndex];
  const f = cue && cueFile(cue);
  if (f) { A.pre.src = f; }
}

function skipCue() {
  if (A.voice.src && !A.voice.paused) { stopVoice(); const cb = A.onEnd; A.onEnd = null; A.bedGain = 1; if (cb) cb(); }
  else if (A.voice.src) { stopVoice(); nextCue(); }
}

function replayCue() {
  const scene = sceneOf(S.scene);
  const cue = (scene.cues || [])[S.cueIndex - 1];
  if (!cue) return;
  const f = cueFile(cue);
  if (f) playFile(f, { onEnd: () => nextCue() });
}

function endOfScene() {
  stopVoice();
  updateNowPlaying(null);
  const scene = sceneOf(S.scene);

  if (scene.puzzle) return renderPuzzle(scene);
  if (scene.deduction) return renderDeduction();
  if (scene.ending) return finishEnding(scene);

  const choices = availableChoices(scene);
  if (choices.length) return renderChoices(scene, choices);

  const next = resolveNext(scene);
  if (next) startScene(next);
}

function resolveNext(obj) {
  for (const r of obj.nextIf || []) {
    if (r.unlessSeen && !S.seen.includes(r.unlessSeen)) return r.next;
  }
  return obj.next || null;
}

function availableChoices(scene) {
  return (scene.choices || []).filter((c) => {
    if (c.once && S.taken[c.next]) return false;
    const min = c.requires?.min || {};
    return Object.entries(min).every(([k, v]) => (S.counters[k] || 0) >= v);
  });
}

function chooseChoice(c) {
  S.taken[c.next] = true;
  applySet(c.set);
  grant(c.grants, true);
  $('#choices').hidden = true;
  const next = resolveNext(c) || c.next;
  startScene(next);
}

/* ═══════════════════════════════════════════════════════ rendering ═══ */

function renderCue(cue) {
  const log = $('#log');
  $$('.line', log).forEach((n) => n.classList.add('past'));

  const push = (who, what, cls, colour) => {
    const line = el('div', `line ${cls || ''}`);
    const w = el('div', 'who', esc(who || ''));
    if (colour) w.style.setProperty('--who', colour);
    line.append(w, el('div', 'what', what));
    log.append(line);
  };

  const fmt = (t) => esc(t)
    .replace(/\[([^\]]+)\]/g, '<span class="dirn">($1)</span>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');

  if (cue.type === 'dialogue') {
    for (const l of cue.lines) {
      const ch = SCRIPT.characters[l.sp];
      push(ch.short, fmt(l.t), ch.short === 'MERIDIAN' ? 'sys' : '', ch.colour);
    }
  } else if (cue.type === 'tts') {
    const ch = SCRIPT.characters[cue.sp];
    push(ch.short, fmt(cue.t), ch.short === 'MERIDIAN' ? 'sys' : '', ch.colour);
  } else if (cue.type === 'sfx') {
    push('', esc(SCRIPT.sfx[cue.sfx]?.label || 'sound'), 'sfx');
  } else if (cue.type === 'synth') {
    push('', esc(SCRIPT.synth[cue.synth]?.label || 'telemetry'), 'sfx');
  }

  if (cue.caption) push('', esc(cue.caption), 'caption');
}

function toastEvidence(id, force) {
  const ev = SCRIPT.evidence[id];
  if (!ev) return;
  const t = el('div', 'evidence-toast');
  t.append(el('span', 'tag', ev.key ? 'Evidence &middot; key' : 'Evidence'));
  t.append(el('span', 'nm', esc(ev.name)));
  $('#log').append(t);
  $('[data-panel="evidence"]').classList.add('pulse');
  setTimeout(() => $('[data-panel="evidence"]').classList.remove('pulse'), 2600);
  if (force) scrollLog();
}

function renderChoices(scene, choices) {
  const box = $('#choices');
  box.innerHTML = '';
  box.hidden = false;
  box.append(el('div', 'prompt', scene.hub ? 'Open a channel' : 'Your move'));
  choices.forEach((c, i) => {
    const b = el('button', 'choice');
    b.style.animationDelay = `${i * 45}ms`;
    b.append(el('span', 'idx', String(i + 1)));
    b.append(el('span', null, esc(c.t)));
    b.onclick = () => chooseChoice(c);
    box.append(b);
  });
  if (scene.hub) {
    const total = (scene.choices || []).filter((c) => c.once).length;
    const done = (scene.choices || []).filter((c) => c.once && S.taken[c.next]).length;
    box.append(el('div', 'prompt', `${done} of ${total} stations contacted &middot; four required`));
  }
  scrollLog();
}

function updateNowPlaying(cue) {
  if (!cue) { $('#now-speaker').textContent = '—'; $('#now-station').textContent = ''; return; }
  let name = '', station = '';
  if (cue.type === 'dialogue') {
    name = [...new Set(cue.lines.map((l) => SCRIPT.characters[l.sp].short))].join(' / ');
    station = SCRIPT.characters[cue.lines[0].sp].station;
  } else if (cue.type === 'tts') {
    name = SCRIPT.characters[cue.sp].short;
    station = SCRIPT.characters[cue.sp].station;
  } else {
    name = 'RECORDING';
    station = SCRIPT.beds[cue.bed]?.label || '';
  }
  $('#now-speaker').textContent = name;
  $('#now-station').textContent = station;
}

function updateHud() {
  const scene = sceneOf(S.scene);
  $('#hud-scene').textContent = scene?.title || '—';
  $('#hud-act').textContent = ['', 'Act I', 'Act II', 'Act III', 'Act IV', 'Act V'][scene?.act || 1];
  $('#ev-count').textContent = S.evidence.length;
  $('#cl-count').textContent = S.clips.length;
  const pct = Math.min(100, 93 + (scene?.act || 1) * 1.4 + S.seen.length * 0.04);
  $('#buffer-fill').style.width = `${pct}%`;
  $('#buffer-pct').textContent = `${Math.round(pct)}%`;
  $('#buffer').classList.toggle('hot', pct > 97.5);
}

function scrollLog() {
  const st = $('#stage');
  requestAnimationFrame(() => { st.scrollTop = st.scrollHeight; });
}

/* ═════════════════════════════════════════════════════════ archive ═══ */

function registerClip(cue) {
  if (!cue.clip) return;
  if (!S.clips.includes(cue.clip.id)) S.clips.push(cue.clip.id);
  if (cue.clip.evidence) grant([cue.clip.evidence]);
  updateHud();
}

const ENHANCE = {
  both:  { voice: 1.0,  bed: 1.0, rate: 1 },
  voice: { voice: 1.0,  bed: 0.0, rate: 1 },
  bed:   { voice: 0.04, bed: 3.2, rate: 1 },
  slow:  { voice: 1.0,  bed: 1.2, rate: 0.5 },
};

let archiveMode = 'both';

function playClip(clipId, mode = archiveMode) {
  const clip = SCRIPT.clips[clipId];
  if (!clip) return;
  const cue = clip.cue;
  const file = MANIFEST.cues[cue]?.file || MANIFEST.synth[cue]?.file || MANIFEST.sfx[cue]?.file;
  const m = ENHANCE[mode] || ENHANCE.both;
  // Look the cue up so sfx/synth clips resolve to the right folder.
  let resolved = file;
  if (!resolved) {
    for (const g of ['cues', 'synth', 'sfx']) if (MANIFEST[g][cue]) { resolved = MANIFEST[g][cue].file; break; }
  }
  if (!resolved) return;
  setBed(clip.bed);
  A.bedGain = m.bed;
  A.bed.volume = bedVolume();
  playFile(resolved, { rate: m.rate, gain: m.voice, onEnd: () => { A.bedGain = 1; A.bed.volume = bedVolume(); } });
}

function playBed(bedId) {
  setBed(bedId);
  A.bedGain = 3.2;
  A.bed.volume = bedVolume();
  stopVoice();
  updateNowPlaying(null);
}

function renderArchive() {
  const body = $('#panel-body');
  body.innerHTML = '';
  $('#panel-title').textContent = 'Clip archive';

  if (!S.clips.length) {
    body.append(el('p', 'ev-empty', 'Nothing recorded yet.'));
    return;
  }

  const modes = el('div', 'clip');
  modes.append(el('span', 'cl-label', '<b>Enhancement</b><small>applies to every clip below</small>'));
  for (const [id, label] of [['both', 'Full mix'], ['voice', 'Voice'], ['bed', 'Room'], ['slow', '0.5&times;']]) {
    const b = el('button', archiveMode === id ? 'on' : '', label);
    b.onclick = () => { archiveMode = id; renderArchive(); };
    modes.append(b);
  }
  body.append(modes);

  body.append(el('p', 'hint-box',
    'Every transmission carries the room it was made in. <b>Room</b> mutes the voice and lifts the background: ' +
    'Coll&rsquo;s chamber has ventilation, a circular resonance, and &mdash; only while the telescope is tracking &mdash; a thin drive whine.'));

  // The room a clip was made in is the answer to the central puzzle, so it is
  // never printed until the player has earned it by ear. Until then the archive
  // shows only what the station log claims, which for three of these is a lie.
  const roomsKnown = !!S.flags.solved_ambience;
  for (const id of S.clips) {
    const clip = SCRIPT.clips[id];
    if (!clip) continue;
    const row = el('div', 'clip');
    const sub = roomsKnown
      ? (SCRIPT.beds[clip.bed]?.label || '')
      : 'room tone not yet analysed';
    row.append(el('span', 'cl-label', `${esc(clip.label)}<small>${esc(sub)}</small>`));
    const p = el('button', '', 'Play');
    p.onclick = () => playClip(id);
    row.append(p);
    body.append(row);
  }

  const refs = el('div');
  refs.append(el('p', 'hint-box', '<b>Reference room tones</b>'));
  for (const [bid, b] of Object.entries(SCRIPT.beds)) {
    if (!S.flags.ambience_unlocked) break;
    const row = el('div', 'clip');
    row.append(el('span', 'cl-label', esc(b.label)));
    const p = el('button', '', 'Play');
    p.onclick = () => playBed(bid);
    row.append(p);
    refs.append(row);
  }
  if (S.flags.ambience_unlocked) body.append(refs);
}

function renderEvidence() {
  const body = $('#panel-body');
  body.innerHTML = '';
  $('#panel-title').textContent = `Evidence — ${S.evidence.length} items`;
  if (!S.evidence.length) { body.append(el('p', 'ev-empty', 'Nothing yet.')); return; }

  const order = Object.keys(SCRIPT.evidence).filter(has);
  for (const id of order) {
    const ev = SCRIPT.evidence[id];
    const card = el('div', `ev ${ev.key ? 'key' : ''}`);
    card.append(el('div', 'id', `${id}${ev.key ? ' &middot; key' : ''}`));
    card.append(el('h4', null, esc(ev.name)));
    card.append(el('p', null, esc(ev.initial)));
    // The second reading only appears once you have earned the context for it.
    if (revealed(id)) card.append(el('p', 'truth', esc(ev.truth)));
    body.append(card);
  }
}

// An evidence item's true significance unlocks when the player has the scene
// that explains it — never before.
const REVEAL_RULES = {
  E01: 'knows_not_live', E02: 'confirmed_early_death', E04: 'confirmed_early_death',
  E05: 'found_relay_delay', E07: 'has_solaris', E08: 'found_room_tone',
  E09: 'knows_not_live', E10: 'found_injector', E11: 'phrases_matched',
  E12: 'confirmed_early_death', E13: 'found_injector', E14: 'has_solaris',
  E15: 'found_packet', E16: 'found_synthetic_origin', E17: 'knows_motive',
  E18: 'knows_motive', E19: 'found_relay_delay', E20: 'knows_motive',
  E03: 'found_injector', E06: 'has_voicemail',
};
const revealed = (id) => { const f = REVEAL_RULES[id]; return !f || !!S.flags[f]; };

/* ═════════════════════════════════════════════════════════ puzzles ═══ */

function renderPuzzle(scene) {
  const p = SCRIPT.puzzles[scene.puzzle];
  const slot = $('#puzzle-slot');
  slot.hidden = false;
  slot.innerHTML = '';
  const box = el('div', 'pz');
  box.append(el('h3', null, esc(p.title)));
  box.append(el('p', 'instr', esc(p.instruction)));

  const finish = () => {
    grant(p.onSolve?.grants, true);
    applySet(p.onSolve?.set);
    slot.hidden = true;
    const next = resolveNext(scene);
    if (next) startScene(next);
  };

  if (p.kind === 'match') buildMatch(box, p, finish);
  else buildSelect(box, p, finish);

  slot.append(box);
  scrollLog();
}

function buildMatch(box, p, finish) {
  const refs = el('div', 'pz-refs');
  for (const r of p.references) {
    if (r.clip === 'NONE') continue;
    const row = el('div', 'pz-ref');
    row.append(el('span', 'lbl', esc(r.label)));
    const b = el('button', 'pz-play', 'Play');
    b.onclick = () => (r.bed ? playBed(r.bed) : playClip(r.clip, 'both'));
    row.append(b);
    refs.append(row);
  }
  box.append(refs);

  const answers = {};
  const rows = [];
  for (const it of p.items) {
    const row = el('div', 'pz-item');
    row.append(el('span', 'lbl', esc(it.label)));
    const b = el('button', 'pz-play', 'Play');
    b.onclick = () => playClip(it.clip, p.references[0]?.bed ? 'bed' : 'both');
    row.append(b);
    const sel = document.createElement('select');
    sel.append(new Option('— choose —', ''));
    for (const r of p.references) sel.append(new Option(r.label, r.clip || r.bed));
    sel.onchange = () => { answers[it.clip] = sel.value; row.className = 'pz-item'; };
    row.append(sel);
    rows.push({ row, it });
    box.append(row);
  }

  const actions = el('div', 'pz-actions');
  const msg = el('span', 'pz-msg');
  const check = el('button', 'solid', 'Check');
  const hint = el('button', 'line-btn', 'Hint');
  const skip = el('button', 'line-btn', 'Move on');
  let tries = 0;
  check.onclick = () => {
    tries++;
    let right = 0;
    for (const { row, it } of rows) {
      const ok = answers[it.clip] === it.answer;
      row.classList.toggle('right', ok);
      row.classList.toggle('wrong', !!answers[it.clip] && !ok);
      if (ok) right++;
    }
    if (right === rows.length) {
      msg.className = 'pz-msg ok';
      msg.textContent = 'All correct.';
      check.disabled = true;
      setTimeout(finish, 900);
    } else {
      msg.className = 'pz-msg no';
      msg.textContent = `${right} of ${rows.length} correct.`;
      if (tries >= 2) hint.hidden = false;
    }
  };
  hint.hidden = true;
  hint.onclick = () => { msg.className = 'pz-msg'; msg.textContent = p.hint; };
  skip.onclick = finish;
  actions.append(check, hint, el('span', 'fill'), msg, skip);
  box.append(actions);
}

function buildSelect(box, p, finish) {
  if (p.monospace) box.append(el('pre', null, p.monospace.map(esc).join('\n')));
  const chosen = new Set();
  const opts = el('div', 'pz-opts');
  for (const o of p.options) {
    const b = el('button', 'pz-opt');
    b.append(el('span', 'box'));
    b.append(el('span', null, esc(o.t)));
    b.onclick = () => {
      if (chosen.has(o.id)) chosen.delete(o.id); else chosen.add(o.id);
      b.classList.toggle('sel', chosen.has(o.id));
    };
    opts.append(b);
  }
  box.append(opts);

  const actions = el('div', 'pz-actions');
  const msg = el('span', 'pz-msg');
  const check = el('button', 'solid', 'Confirm');
  const hint = el('button', 'line-btn', 'Hint');
  const skip = el('button', 'line-btn', 'Move on');
  hint.hidden = true;
  let tries = 0;
  check.onclick = () => {
    tries++;
    const want = new Set(p.options.filter((o) => o.correct).map((o) => o.id));
    const ok = want.size === chosen.size && [...want].every((x) => chosen.has(x));
    if (ok) {
      msg.className = 'pz-msg ok';
      msg.textContent = p.solution || 'Correct.';
      check.disabled = true;
      setTimeout(finish, p.solution ? 2600 : 900);
    } else {
      msg.className = 'pz-msg no';
      msg.textContent = 'Not quite.';
      if (tries >= 2) hint.hidden = false;
    }
  };
  hint.onclick = () => { msg.className = 'pz-msg'; msg.textContent = p.hint; };
  skip.onclick = finish;
  actions.append(check, hint, el('span', 'fill'), msg, skip);
  box.append(actions);
}

/* ═══════════════════════════════════════════════════════ deduction ═══ */

function renderDeduction() {
  const d = SCRIPT.deduction;
  const slot = $('#deduction-slot');
  slot.hidden = false;
  slot.innerHTML = '';
  const box = el('div', 'ded');
  box.append(el('h3', null, 'Incident determination'));
  box.append(el('p', null, esc(d.prompt)));

  const strong = strongCase();
  const kc = keyEvidence().length;
  const cs = el('div', 'ded-case');
  cs.innerHTML =
    `Key evidence <b>${kc}</b> of ${SCRIPT.meta.keyEvidence.length} &nbsp;&middot;&nbsp; ` +
    `case strength <span class="${strong ? 'strong' : 'weak'}">${strong ? 'sufficient' : 'thin'}</span><br>` +
    (strong
      ? 'You can place her hands on it.'
      : 'You can describe what happened. Proving who did it is another matter.');
  box.append(cs);

  const picks = {};
  for (const f of d.fields) {
    const wrap = el('div', 'ded-field');
    wrap.append(el('label', null, esc(f.label)));
    const opts = el('div', 'ded-opts');
    for (const o of f.options) {
      const b = el('button', 'pz-opt');
      b.append(el('span', 'box'));
      b.append(el('span', null, esc(o.t)));
      b.onclick = () => {
        picks[f.id] = o.id;
        $$('.pz-opt', opts).forEach((n) => n.classList.remove('sel'));
        b.classList.add('sel');
        commit.disabled = d.fields.some((x) => !picks[x.id]);
      };
      opts.append(b);
    }
    wrap.append(opts);
    box.append(wrap);
  }

  const actions = el('div', 'pz-actions');
  const commit = el('button', 'solid', 'Commit the determination');
  commit.disabled = true;
  commit.onclick = () => {
    S.deduction = { ...picks, correct: {} };
    for (const f of d.fields) {
      const chosen = f.options.find((o) => o.id === picks[f.id]);
      S.deduction.correct[f.id] = !!chosen?.correct;
    }
    S.deduction.strong = strong;
    S.deduction.keyCount = kc;
    slot.hidden = true;
    const route = d.routes.find(
      (r) => (r.when.culprit === '*' || r.when.culprit === picks.culprit) &&
             (r.when.strongCase === undefined || r.when.strongCase === strong));
    startScene(route.next);
  };
  actions.append(commit);
  box.append(actions);
  slot.append(box);
  scrollLog();
}

/* ════════════════════════════════════════════════════════ epilogue ═══ */

const ENDING_TITLES = {
  shadow: ['Ending A', 'The Shadow'],
  consortium: ['Ending B', 'The Consortium'],
  dead_air: ['Ending C', 'Dead Air'],
};

function finishEnding(scene) {
  S.ending = scene.ending;
  save();
  const [k, name] = ENDING_TITLES[scene.ending] || ['Ending', ''];
  const card = el('div', 'ending-card');
  card.append(el('div', 'k', k));
  card.append(el('h2', null, esc(name)));
  $('#log').append(card);

  const d = S.deduction || {};
  const D = SCRIPT.deduction;
  const box = el('div', 'debrief');
  box.append(el('h3', null, 'Debrief'));
  const t = document.createElement('table');
  for (const f of D.fields) {
    const chosen = f.options.find((o) => o.id === d[f.id]);
    const right = f.options.find((o) => o.correct);
    const ok = d.correct?.[f.id];
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${esc(f.label)}</td><td class="${ok ? 'yes' : 'no'}">${esc(chosen ? chosen.t : '—')}` +
      (ok ? '' : `<br><span class="dim">Actually: ${esc(right.t)}</span>`) + '</td>';
    t.append(tr);
  }
  const missed = SCRIPT.meta.keyEvidence.filter((e) => !has(e));
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>Key evidence</td><td>${d.keyCount ?? keyEvidence().length} of ${SCRIPT.meta.keyEvidence.length}` +
    (missed.length ? `<br><span class="dim">Never found: ${missed.map((e) => esc(SCRIPT.evidence[e].name)).join('; ')}</span>` : '') + '</td>';
  t.append(tr);
  box.append(t);

  const acts = el('div', 'actions');
  const again = el('button', 'solid', 'Play again');
  again.onclick = () => { localStorage.removeItem(SAVE_KEY); location.reload(); };
  const arch = el('button', 'line-btn', 'Browse the archive');
  arch.onclick = () => openPanel('archive');
  acts.append(again, arch);
  box.append(acts);
  $('#log').append(box);
  updateNowPlaying(null);
  scrollLog();
}

/* ══════════════════════════════════════════════════════════ panels ═══ */

function openPanel(which) {
  $('#panel').hidden = false;
  $('#scrim').hidden = false;
  $$('.panel-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === which));
  if (which === 'archive') renderArchive(); else renderEvidence();
}
function closePanel() { $('#panel').hidden = true; $('#scrim').hidden = true; }

/* ════════════════════════════════════════════════════════════ boot ═══ */

async function boot() {
  [SCRIPT, MANIFEST] = await Promise.all([
    fetch('script.json').then((r) => r.json()),
    fetch('audio/manifest.json').then((r) => r.json()),
  ]);

  const saved = load();
  if (saved) $('#btn-continue').hidden = false;

  $('#btn-start').onclick = () => begin(null);
  $('#btn-continue').onclick = () => begin(saved);

  $('#btn-skip').onclick = skipCue;
  $('#btn-replay').onclick = replayCue;
  $('#vol').oninput = (e) => {
    S.settings.volume = +e.target.value;
    A.voice.volume = Math.min(1, S.settings.volume * A.voiceGain);
    A.bed.volume = bedVolume();
  };
  $('#rate').onchange = (e) => {
    S.settings.rate = +e.target.value;
    A.voice.playbackRate = S.settings.rate;
  };
  $('#panel-close').onclick = closePanel;
  $('#scrim').onclick = closePanel;
  $$('[data-panel]').forEach((b) => (b.onclick = () => openPanel(b.dataset.panel)));
  $$('.panel-tabs button').forEach((b) => (b.onclick = () => openPanel(b.dataset.tab)));
  $('#btn-settings').onclick = () => {
    if (confirm('Abandon this investigation and start again?')) {
      localStorage.removeItem(SAVE_KEY); location.reload();
    }
  };

  document.addEventListener('keydown', (e) => {
    if ($('#game').hidden) return;
    if (e.target.matches('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); skipCue(); }
    else if (k === 'r') replayCue();
    else if (k === 'e') openPanel('evidence');
    else if (k === 'a') openPanel('archive');
    else if (k === 'escape') closePanel();
    else if (/^[1-9]$/.test(k)) {
      const btns = $$('#choices .choice');
      const b = btns[+k - 1];
      if (b && !$('#choices').hidden) b.click();
    }
  });
}

function begin(saved) {
  $('#title').hidden = true;
  $('#game').hidden = false;
  if (saved) Object.assign(S, saved);
  $('#vol').value = S.settings.volume;
  $('#rate').value = String(S.settings.rate);
  A.bed.volume = 0;
  startScene(saved ? saved.scene : SCRIPT.meta.start);
}

boot();
