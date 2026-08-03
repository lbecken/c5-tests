/* ═══════════════════════════════════════════════════════════════════════════
   CRADLE SONG — game engine

   Plays entirely from the JSON in content/. Audio is optional: if a clip is
   missing the line is timed from its `sec` estimate and shown as a subtitle,
   so the game is fully playable before a single byte has been synthesised.
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

const SAVE_KEY = 'cradlesong.save.v1';
const META_KEY = 'cradlesong.meta.v1';
const CLOCK_START = 31 * 60;

/* ─────────────────────────── content + state ─────────────────────────── */

const C = { characters: null, evidence: null, interviews: null, scenes: null, endings: null };
let audioManifest = null;          // null => subtitle-only mode
let S = null;                      // game state
let meta = { runCount: 0, endingsSeen: [] };

const el = id => document.getElementById(id);

function freshState() {
  return {
    clock: CLOCK_START,
    flags: {},
    reels: {},                      // id -> {unlocked, played}
    analyses: {},                   // id -> done
    channels: {},                   // id -> {open, topicsUsed:[]}
    trust: { noema: 0, haugen: 0 },
    selectedReel: null,
    activeChannel: null,
    deductions: {},
    disposition: null,
    clockEventsFired: {},
    pityDone: false,
    forced: false,
    started: false
  };
}

/* ─────────────────────────── boot ─────────────────────────── */

async function boot() {
  const files = ['characters', 'evidence', 'interviews', 'scenes', 'endings'];
  const loaded = await Promise.all(
    files.map(f => fetch(`content/${f}.json`).then(r => {
      if (!r.ok) throw new Error(`content/${f}.json → ${r.status}`);
      return r.json();
    }))
  );
  files.forEach((f, i) => { C[f] = loaded[i]; });

  try {
    const r = await fetch('audio/manifest.json');
    if (r.ok) {
      const m = await r.json();
      // An empty manifest is subtitle mode, not broken audio.
      if (m && m.assets && Object.keys(m.assets).length) audioManifest = m;
    }
  } catch (_) { /* subtitle mode */ }

  el('audio-status').textContent = audioManifest
    ? `audio: ${Object.keys(audioManifest.assets).length} clips`
    : 'audio: not yet generated — subtitle mode';

  try { meta = JSON.parse(localStorage.getItem(META_KEY)) || meta; } catch (_) {}
  if (meta.runCount > 0) {
    const b = el('run-badge');
    b.textContent = `CASE FILE OPENED ${meta.runCount}× · ${meta.endingsSeen.length}/8 OUTCOMES ON RECORD`;
    b.classList.remove('hidden');
  }
  if (localStorage.getItem(SAVE_KEY)) el('btn-continue').classList.remove('hidden');

  wireUI();
}

/* ─────────────────────────── audio ─────────────────────────── */

const audio = {
  master: 0.8, amb: 0.45,
  cur: null, ambNode: null,

  /** Dialogue lines resolve to their own clip; `_fx` lines to their first effect. */
  srcFor(line) {
    if (!audioManifest) return null;
    if (line.speaker === '_fx') {
      const name = (line.fx || [])[0];
      const f = name && audioManifest.sfx && audioManifest.sfx[name];
      return f ? `audio/${f}` : null;
    }
    const a = audioManifest.assets && audioManifest.assets[line.id];
    return a ? `audio/${a.file}` : null;
  },

  /** One-shot effect layered under a spoken line (door, chime, query blip). */
  layer(names) {
    if (!audioManifest || !audioManifest.sfx) return;
    for (const n of names || []) {
      const f = audioManifest.sfx[n];
      if (!f) continue;
      const a = new Audio(`audio/${f}`);
      a.volume = this.master * 0.55;
      a.play().catch(() => {});
    }
  },

  /** Music-box variants are the same render at a different rate and level. */
  variantFor(line) {
    const name = line.speaker === '_fx' ? (line.fx || [])[0] : null;
    return (name && audioManifest && audioManifest.variants &&
            audioManifest.variants[name]) || null;
  },

  play(line) {
    return new Promise(resolve => {
      const src = this.srcFor(line);
      if (!src) { resolve(false); return; }
      const a = new Audio(src);
      const v = this.variantFor(line);
      a.volume = this.master * (v ? v.gain : 1);
      if (v) a.playbackRate = v.rate;
      this.cur = a;
      a.onended = () => { this.cur = null; resolve(true); };
      a.onerror = () => { this.cur = null; resolve(false); };
      a.play().catch(() => { this.cur = null; resolve(false); });
    });
  },

  stop() { if (this.cur) { this.cur.pause(); this.cur = null; } },

  ambience(bed) {
    if (!audioManifest || !bed || bed === 'none') { this.ambStop(); return; }
    const file = audioManifest.sfx && audioManifest.sfx[bed];
    if (!file) return;
    if (this.ambNode && this.ambNode.dataset.bed === bed) return;
    this.ambStop();
    const a = new Audio(`audio/${file}`);
    a.loop = true; a.volume = this.amb * 0.5; a.dataset.bed = bed;
    a.play().catch(() => {});
    this.ambNode = a;
  },

  ambStop() { if (this.ambNode) { this.ambNode.pause(); this.ambNode = null; } }
};

/* ─────────────────────────── playback ─────────────────────────── */

let playCtl = { skipLine: false, skipAll: false, running: false };
let textSpeed = 1.0;
let autoAdvance = true;

function speakerMeta(id) {
  if (id === '_fx') return { display: '', colour: '#6c7b82', fx: true };
  const ch = C.characters.characters[id];
  return ch ? { display: ch.display, colour: ch.colour, fx: false }
            : { display: id.toUpperCase(), colour: '#6c7b82', fx: false };
}

function renderLine(line, target) {
  const m = speakerMeta(line.speaker);
  const d = document.createElement('div');
  d.className = 'tline current' + (m.fx ? ' fx' : '');
  if (line.speaker === 'pa') d.classList.add('sys');

  if (!m.fx && m.display) {
    const s = document.createElement('span');
    s.className = 'spk'; s.style.color = m.colour; s.textContent = m.display;
    d.appendChild(s);
  }
  if (line.dir) {
    const dir = document.createElement('span');
    dir.className = 'dir'; dir.textContent = line.dir;
    d.appendChild(dir);
  }
  const t = document.createElement('span');
  t.className = 'txt';
  t.textContent = m.fx ? line.text : `“${line.text}”`;
  if (m.fx) t.textContent = line.text;
  d.appendChild(t);

  target.querySelectorAll('.tline.current').forEach(n => n.classList.remove('current'));
  target.appendChild(d);
  target.scrollTop = target.scrollHeight;
  return d;
}

function playerLine(text, target) {
  const d = document.createElement('div');
  d.className = 'tline player';
  const t = document.createElement('span');
  t.className = 'txt'; t.textContent = `▸ ${text}`;
  d.appendChild(t);
  target.appendChild(d);
  target.scrollTop = target.scrollHeight;
}

const wait = ms => new Promise(r => setTimeout(r, ms));

/**
 * Plays a run of lines. Deliberately does NOT clear skipAll: a scene is often
 * several sequences back to back, and a player who hit SKIP meant all of it.
 * The flag is cleared when the player next does something (see beginAction).
 */
async function playSequence(lines, target) {
  playCtl.running = true;
  el('playbar-right').style.visibility = 'visible';

  for (const line of lines) {
    if (playCtl.skipAll) { renderLine(line, target); continue; }
    playCtl.skipLine = false;

    renderLine(line, target);
    const m = speakerMeta(line.speaker);
    el('now-speaker').textContent = m.fx ? '· · ·' : (m.display || '');

    const ch = C.characters.characters[line.speaker];
    if (ch && ch.ambience) audio.ambience(C.characters.ambiences[ch.ambience]?.bed);
    // Spoken lines can carry an effect cue too; layer it rather than replace the voice.
    if (line.speaker !== '_fx') audio.layer(line.fx);

    const played = await audio.play(line);
    if (!played) {
      // subtitle mode: hold for the estimated read time
      const ms = Math.max(900 / Math.max(1, textSpeed), (line.sec || 4) * 1000 / textSpeed);
      const step = 60;
      for (let t = 0; t < ms; t += step) {
        if (playCtl.skipLine || playCtl.skipAll) break;
        await wait(step);
      }
    }
    if (!autoAdvance && !playCtl.skipAll) {
      await new Promise(res => {
        const h = () => { document.removeEventListener('click', h); res(); };
        setTimeout(() => document.addEventListener('click', h), 120);
      });
    }
  }

  el('now-speaker').textContent = '';
  el('playbar-right').style.visibility = 'hidden';
  playCtl.running = false;
}

/* ─────────────────────────── clock ─────────────────────────── */

function fmtClock(sec) {
  const s = Math.max(0, sec);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function renderClock() {
  const c = el('clock');
  c.textContent = fmtClock(S.clock);
  c.classList.toggle('warn', S.clock <= 12 * 60 && S.clock > 5 * 60);
  c.classList.toggle('crit', S.clock <= 5 * 60);
}

function spend(minutes) {
  S.clock = Math.max(0, S.clock - minutes * 60);
  renderClock();
}

async function checkClockEvents() {
  const mins = S.clock / 60;
  const fire = async (key, lines) => {
    if (S.clockEventsFired[key]) return;
    S.clockEventsFired[key] = true;
    await playSequence(lines, el('transcript'));
  };

  if (mins <= 20 && !S.clockEventsFired.T20) await fire('T20', C.scenes.clock_events.T20);
  if (mins <= 12 && !S.clockEventsFired.T12) await fire('T12', C.scenes.clock_events.T12);

  if (mins <= 6 && !S.pityDone) {
    S.pityDone = true;
    const missing = Object.entries(C.evidence.reels)
      .filter(([id, r]) => r.mandatory && !(S.reels[id] && S.reels[id].unlocked));
    if (missing.length) {
      await playSequence(C.scenes.clock_events.T06_pity, el('transcript'));
      missing.forEach(([id]) => unlockReel(id, true));
      toast(`${missing.length} reel(s) placed on your board`);
      renderReels();
    }
  }

  if (mins <= 4 && !S.forced) {
    S.forced = true;
    await playSequence(C.scenes.clock_events.T04_force, el('transcript'));
    openDeduction();
  }
}

/* ─────────────────────────── effects / unlocks ─────────────────────────── */

function setFlag(f) { S.flags[f] = true; }
function has(f) { return !!S.flags[f]; }

function unlockReel(id, silent) {
  if (!C.evidence.reels[id]) return;
  S.reels[id] = S.reels[id] || { unlocked: false, played: false };
  if (S.reels[id].unlocked) return;
  S.reels[id].unlocked = true;
  if (!silent) toast(`REEL ${id} available`);
}

function unlockAnalysis(id) {
  S.analyses[id] = S.analyses[id] || { available: true, done: false };
  S.analyses[id].available = true;
}

function applyEffects(o) {
  if (!o) return;
  (o.sets || []).forEach(setFlag);
  (o.sets_extra || []).forEach(setFlag);
  if (o.unlocks_reel) unlockReel(o.unlocks_reel);
  (o.unlocks_analysis || []).forEach(unlockAnalysis);
  (o.enables_analysis || []).forEach(unlockAnalysis);
  if (typeof o.trust_noema === 'number') {
    S.trust.noema = Math.max(-3, Math.min(3, S.trust.noema + o.trust_noema));
  }
  // derived flags
  if (has('heard_interlock') && has('heard_corridor')) setFlag('knows_credential_gap');
  refreshDerivedUnlocks();
}

/** Anything whose `unlocked_by` conditions are now satisfied becomes available. */
function refreshDerivedUnlocks() {
  for (const [id, r] of Object.entries(C.evidence.reels)) {
    if (S.reels[id] && S.reels[id].unlocked) continue;
    if (r.unlocked_at_start) { unlockReel(id, true); continue; }
    const by = r.unlocked_by || [];
    if (by.length && by.some(f => has(f) || (S.analyses[f] && S.analyses[f].done))) unlockReel(id);
  }
  for (const [id, a] of Object.entries(C.scenes.analyses)) {
    const req = a.requires || [];
    if (!req.length || req.every(f => has(f))) unlockAnalysis(id);
  }
}

/* ─────────────────────────── rendering ─────────────────────────── */

function renderReels() {
  const box = el('reels-list');
  box.innerHTML = '';
  const entries = Object.entries(C.evidence.reels);
  let unlockedCount = 0;

  for (const [id, r] of entries) {
    const st = S.reels[id] || { unlocked: false, played: false };
    if (st.unlocked) unlockedCount++;
    const d = document.createElement('div');
    d.className = 'reel'
      + (st.unlocked ? '' : ' locked')
      + (st.played ? ' played' : '')
      + (S.selectedReel === id ? ' selected' : '')
      + (r.mandatory && st.unlocked && !st.played ? ' mandatory-unheard' : '');
    d.innerHTML = `
      <div class="reel-id">${id}${r.mandatory ? ' ·' : ''}</div>
      <div class="reel-label">${st.unlocked ? r.label : '— sealed —'}</div>
      <div class="reel-meta">${st.unlocked ? r.source : 'not yet on your board'}
        ${st.unlocked ? `<span class="reel-cost">· ${r.cost} min</span>` : ''}</div>`;
    if (st.unlocked) d.onclick = () => selectReel(id);
    box.appendChild(d);
  }
  el('reel-count').textContent = `${unlockedCount}/${entries.length}`;
  renderTopics();
}

function renderAnalyses() {
  const box = el('analysis-list');
  box.innerHTML = '';
  for (const [id, a] of Object.entries(C.scenes.analyses)) {
    const st = S.analyses[id] || { available: false, done: false };
    const b = document.createElement('button');
    b.className = 'act';
    b.disabled = !st.available || st.done || playCtl.running;
    b.innerHTML = `${st.done ? '✓ ' : ''}${a.label}<span class="c">${a.cost ? a.cost + 'm' : ''}</span>`;
    b.onclick = () => runAnalysis(id);
    box.appendChild(b);
  }
}

function renderChannels() {
  const box = el('channels-list');
  box.innerHTML = '';
  for (const [id, ch] of Object.entries(C.interviews.channels)) {
    const person = C.characters.characters[id];
    const st = S.channels[id] || { open: false, topicsUsed: [] };
    const d = document.createElement('div');
    d.className = 'chan'
      + (S.activeChannel === id ? ' active' : '')
      + (has(`${id}_cracked`) ? ' cracked' : '');
    d.innerHTML = `<div>
        <div class="chan-name">${person ? person.name : id}</div>
        <div class="chan-role">${person ? person.role : ''}</div>
      </div><div class="chan-dot"></div>`;
    d.onclick = () => openChannel(id);
    box.appendChild(d);
  }
}

function renderTopics() {
  const head = el('topics-head');
  const box = el('topics-list');
  const hint = el('confront-hint');
  box.innerHTML = '';

  if (!S.activeChannel) {
    head.textContent = 'TOPICS';
    box.innerHTML = '<div class="hint">Open a channel.</div>';
    hint.classList.add('hidden');
    return;
  }

  const chId = S.activeChannel;
  const ch = C.interviews.channels[chId];
  const person = C.characters.characters[chId];
  head.textContent = `— ${person ? person.display : chId} —`;

  // confrontation button
  if (S.selectedReel) {
    const r = C.evidence.reels[S.selectedReel];
    const conf = ch.confrontations || {};
    const spec = conf[S.selectedReel] || conf._default;
    const b = document.createElement('button');
    b.className = 'act';
    b.disabled = playCtl.running;
    b.innerHTML = `▶ PLAY <b>${S.selectedReel}</b> AT ${person ? person.display : chId}
                   <span class="c">${(spec ? spec.cost : 1)}m</span>`;
    b.style.borderColor = 'var(--amber-dim)';
    b.onclick = () => confront(chId, S.selectedReel);
    box.appendChild(b);
    const note = document.createElement('div');
    note.className = 'hint';
    note.style.marginBottom = '10px';
    note.textContent = `“${r.slug}” — ${r.summary}`;
    box.appendChild(note);
  }

  for (const [tid, t] of Object.entries(ch.topics || {})) {
    const st = S.channels[chId] || { topicsUsed: [] };
    const used = st.topicsUsed.includes(tid);
    const gated = t.requires_flag && !has(t.requires_flag);
    const b = document.createElement('button');
    b.className = 'act';
    b.disabled = used || gated || playCtl.running;
    b.innerHTML = `${used ? '✓ ' : ''}${gated ? '— not yet —' : t.label}<span class="c">${t.cost}m</span>`;
    b.onclick = () => askTopic(chId, tid);
    box.appendChild(b);
  }

  hint.classList.toggle('hidden', !!S.selectedReel);
}

function renderAll() {
  renderClock(); renderReels(); renderAnalyses(); renderChannels(); renderTopics();
}

function toast(msg) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('hidden'), 2600);
}

function stageHeader(title, source) {
  el('stage-title').textContent = title;
  el('stage-source').textContent = source || '';
}

/* ─────────────────────────── actions ─────────────────────────── */

function selectReel(id) {
  S.selectedReel = S.selectedReel === id ? null : id;
  renderReels();
}

function beginAction() { playCtl.skipAll = false; playCtl.skipLine = false; }

async function guardedAction(fn) {
  if (playCtl.running || S.forced) return;
  beginAction();
  await fn();
  save();
  renderAll();
  await checkClockEvents();
  renderAll();
}

function playReel(id) {
  return guardedAction(async () => {
    const r = C.evidence.reels[id];
    spend(r.cost);
    S.reels[id].played = true;
    stageHeader(r.label, r.source);
    playerLine(`Audition reel ${id} — ${r.label}`, el('transcript'));
    applyEffects(r);
    await playSequence(r.lines, el('transcript'));
    if (r.grants_flag_if && r.grants_flag_if.requires.every(f => has(f))) setFlag(r.grants_flag_if.flag);
    applyEffects({});
  });
}

function openChannel(id) {
  return guardedAction(async () => {
    if (S.activeChannel === id) { S.activeChannel = null; return; }
    S.activeChannel = id;
    const ch = C.interviews.channels[id];
    S.channels[id] = S.channels[id] || { open: false, topicsUsed: [] };
    if (!S.channels[id].open) {
      S.channels[id].open = true;
      spend(ch.open_cost || 0);
      const person = C.characters.characters[id];
      stageHeader(`CHANNEL — ${person ? person.name : id}`, person ? person.role : '');
      playerLine(`Open channel to ${person ? person.name : id}`, el('transcript'));
      await playSequence(ch.open_lines || [], el('transcript'));
    }
  });
}

function askTopic(chId, tid) {
  return guardedAction(async () => {
    const t = C.interviews.channels[chId].topics[tid];
    spend(t.cost);
    S.channels[chId].topicsUsed.push(tid);
    playerLine(t.label, el('transcript'));
    applyEffects(t);
    await playSequence(t.lines || [], el('transcript'));
  });
}

function confront(chId, reelId) {
  return guardedAction(async () => {
    const ch = C.interviews.channels[chId];
    const conf = ch.confrontations || {};
    const spec = conf[reelId] || conf._default;
    if (!spec) return;
    if (spec.requires_flag && !has(spec.requires_flag)) {
      toast('Not yet — you cannot make that stick.');
      return;
    }
    spend(spec.cost || 1);
    const person = C.characters.characters[chId];
    playerLine(`Play ${reelId} into ${person ? person.display : chId}'s room`, el('transcript'));
    applyEffects(spec);
    if (spec.is_crack) setFlag(`${chId}_cracked`);
    await playSequence(spec.lines || [], el('transcript'));
    S.selectedReel = null;
  });
}

function runAnalysis(id) {
  return guardedAction(async () => {
    const a = C.scenes.analyses[id];
    if (a.is_puzzle) { await runPuzzle(a.puzzle); return; }
    spend(a.cost || 0);
    S.analyses[id] = S.analyses[id] || {};
    S.analyses[id].done = true;
    stageHeader('ANALYSIS', a.label);
    playerLine(a.label, el('transcript'));
    applyEffects(a);
    if (a.lines && a.lines.length) {
      await playSequence(a.lines, el('transcript'));
    } else if (a.unlocks_reel) {
      toast(`Reel ${a.unlocks_reel} available`);
    }
    refreshDerivedUnlocks();
  });
}

/* ─────────────────────────── the decode puzzle ─────────────────────────── */

async function runPuzzle(pid) {
  const p = C.scenes.puzzles[pid];
  stageHeader('DECODE', 'Cradle Song · 8 February 1983');
  await playSequence(p.intro, el('transcript'));

  const box = el('choices');
  const pick = await new Promise(resolve => {
    box.innerHTML = '';
    p.options.forEach(o => {
      const b = document.createElement('button');
      b.className = 'choice';
      const hint = (o.hint_flag && has(o.hint_flag)) ? ' ◂ consistent with the voice analysis' : '';
      b.innerHTML = `${o.label}<span class="c">${o.cost}m${hint}</span>`;
      b.onclick = () => { box.innerHTML = ''; resolve(o); };
      box.appendChild(b);
    });
  });

  spend(pick.cost);
  playerLine(pick.label, el('transcript'));
  applyEffects(pick);
  await playSequence(pick.lines, el('transcript'));
  S.analyses.ANL_PAUSES = S.analyses.ANL_PAUSES || {};
  if (pick.is_key) S.analyses.ANL_PAUSES.done = true;
  refreshDerivedUnlocks();
}

/* ─────────────────────────── deduction ─────────────────────────── */

function openDeduction() {
  audio.stop();
  showScreen('deduce-screen');
  const heard = Object.values(S.reels).filter(r => r.played).length;
  el('deduce-sub').textContent =
    `${heard} of ${Object.keys(C.evidence.reels).length} reels auditioned · ${fmtClock(S.clock)} of window remaining`;

  const slotsBox = el('slots');
  slotsBox.innerHTML = '';
  C.scenes.deduction.slots.forEach(slot => {
    const d = document.createElement('div');
    d.className = 'slot' + (S.deductions[slot.id] ? ' filled' : '');
    d.innerHTML = `<h3>${slot.prompt}</h3>`;
    slot.options.forEach(o => {
      const b = document.createElement('button');
      b.className = 'opt' + (S.deductions[slot.id] === o.id ? ' chosen' : '');
      const gated = o.requires_any && !o.requires_any.some(f => has(f));
      b.disabled = gated;
      b.innerHTML = o.label + (gated ? '<span class="lockmsg">no evidence heard</span>' : '');
      b.onclick = () => { S.deductions[slot.id] = o.id; openDeduction(); };
      d.appendChild(b);
    });
    slotsBox.appendChild(d);
  });

  const dispBox = el('disposition-options');
  dispBox.innerHTML = '';
  C.scenes.deduction.disposition.options.forEach(o => {
    const gated = typeof o.requires_trust_noema === 'number'
      && S.trust.noema < o.requires_trust_noema
      && meta.runCount < 3;
    const b = document.createElement('button');
    b.className = 'opt' + (S.disposition === o.id ? ' chosen' : '');
    b.disabled = gated;
    b.innerHTML = o.label + (gated ? '<span class="lockmsg">unavailable</span>' : '');
    b.onclick = () => { S.disposition = o.id; openDeduction(); };
    dispBox.appendChild(b);
  });

  const ready = C.scenes.deduction.slots.every(s => S.deductions[s.id]) && S.disposition;
  el('btn-transmit').disabled = !ready;
  el('btn-back-console').classList.toggle('hidden', S.forced);
  save();
}

function resolveEnding() {
  const access = S.deductions.access;
  const accessOpt = C.scenes.deduction.slots.find(s => s.id === 'access')
    .options.find(o => o.id === access);

  if (accessOpt && accessOpt.false_accusation) return 'E_WRONGROOM';
  if (access === 'a_none') return 'E_WINDOWCLOSES';

  const dispOpt = C.scenes.deduction.disposition.options.find(o => o.id === S.disposition);
  return (dispOpt && dispOpt.ending) || 'E_WINDOWCLOSES';
}

async function transmit() {
  const endId = resolveEnding();
  const e = C.endings.endings[endId];
  showScreen('ending-screen');
  el('ending-title').textContent = e.title;
  const box = el('ending-transcript');
  box.innerHTML = '';

  beginAction();
  const informed = has('knows_generated_not_received') && has('knows_unreleased_model');
  let lines = e.lines.slice();
  if (!informed && e.uninformed_extra) lines = lines.concat(e.uninformed_extra);

  await playSequence(lines.concat(C.endings.epilogue.lines), box);

  const card = document.createElement('div');
  card.className = 'closing-card';
  card.textContent = C.endings.epilogue.closing_card;
  box.appendChild(card);
  box.scrollTop = box.scrollHeight;

  meta.runCount++;
  if (!meta.endingsSeen.includes(endId)) meta.endingsSeen.push(endId);
  localStorage.setItem(META_KEY, JSON.stringify(meta));
  localStorage.removeItem(SAVE_KEY);

  el('ending-actions').classList.remove('hidden');
}

/* ─────────────────────────── reconstruction ─────────────────────────── */

const TRUTH = {
  mechanism: {
    answer: 'm_seizure',
    text: 'A seizure induced by a 17 Hz amplitude modulation, in a man with undisclosed temporal lobe epilepsy, alone in a room whose release plate needs two working hands.',
    note: 'The lock was never a weapon. It was a protocol. Nobody entered because nobody needed to.'
  },
  access: {
    answer: 'a_okonjo',
    text: 'Dr. Ada Okonjo. She lifted the capture limiter at 20:36 and muted the dead-man monitor at 20:41, using credentials Bloch gave her in Geneva in 2023.',
    note: 'She was not trying to kill him. She was trying to record proof that the system was unsafe, and she priced a brief seizure as acceptable. She intended to be standing at the door.'
  },
  origin: {
    answer: 'o_generated',
    text: 'Generated. The 17 Hz modulation appears nowhere in nine days of received signal. It was produced by NOEMA-7.0-rc4 — an evaluation build, routed to by capacity fallback because Okonjo\'s own capture job had saturated the 6.4 pool.',
    note: 'The killer had not been born because it had not passed release review. That was the whole of the sentence.'
  },
  source: {
    answer: null,
    text: 'Unresolved, and it stays unresolved.',
    note: 'The reply left Asterion in September 1998. Our question did not arrive until June 2010. Any explanation that fits that also fits three others.'
  }
};

function openReconstruction() {
  showScreen('recon-screen');
  const body = el('recon-body');
  body.innerHTML = '';

  C.scenes.deduction.slots.forEach(slot => {
    const t = TRUTH[slot.id];
    const chosenId = S.deductions[slot.id];
    const chosen = slot.options.find(o => o.id === chosenId);
    const row = document.createElement('div');
    row.className = 'recon-row';

    let verdict = 'none', vtext = 'no finding entered';
    if (chosen) {
      if (t.answer === null) { verdict = 'none'; vtext = `you filed: ${chosen.label}`; }
      else if (chosen.id === t.answer) { verdict = 'right'; vtext = `you filed: ${chosen.label}`; }
      else { verdict = 'wrong'; vtext = `you filed: ${chosen.label}`; }
    }

    row.innerHTML = `
      <div class="recon-k">${slot.id.toUpperCase()}</div>
      <div>
        <div class="recon-truth">${t.text}</div>
        <div class="recon-you ${verdict}">${vtext}</div>
        <div class="recon-note">${t.note}</div>
      </div>`;
    body.appendChild(row);
  });

  const missed = Object.entries(C.evidence.reels)
    .filter(([id]) => !(S.reels[id] && S.reels[id].played));
  const m = document.createElement('div');
  m.className = 'recon-missed';
  m.innerHTML = `<h3>NEVER AUDITIONED — ${missed.length} OF ${Object.keys(C.evidence.reels).length}</h3>`;
  missed.forEach(([id, r]) => {
    const d = document.createElement('div');
    d.className = 'missed-item';
    d.innerHTML = `<b>${id}</b> · ${r.label} — ${r.summary}`;
    m.appendChild(d);
  });
  body.appendChild(m);
}

/* ─────────────────────────── screens / save ─────────────────────────── */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  el(id).classList.add('active');
}

function save() {
  if (!S || !S.started) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (_) {}
}

async function startGame(loaded) {
  S = loaded || freshState();
  S.started = true;
  showScreen('console-screen');
  renderAll();

  if (!loaded) {
    beginAction();
    stageHeader('SKARV FACILITY', '12 February 2026 · 21:29');
    // One sequence, so a single SKIP takes the player past the whole cold open.
    const opening = C.scenes.opening.scenes.flatMap(sc => sc.lines);
    await playSequence(opening, el('transcript'));
    refreshDerivedUnlocks();
    renderAll();
    save();
  } else {
    stageHeader('CASE RESUMED', `${fmtClock(S.clock)} of window remaining`);
    refreshDerivedUnlocks();
    renderAll();
  }
}

/* ─────────────────────────── UI wiring ─────────────────────────── */

function wireUI() {
  el('btn-begin').onclick = () => startGame(null);
  el('btn-continue').onclick = () => {
    try { startGame(JSON.parse(localStorage.getItem(SAVE_KEY))); }
    catch (_) { startGame(null); }
  };
  el('btn-headphones').onclick = () =>
    toast('Stereo detail carries evidence. Headphones strongly advised.');

  el('btn-skipline').onclick = () => { playCtl.skipLine = true; audio.stop(); };
  el('btn-skipall').onclick = () => { playCtl.skipAll = true; audio.stop(); };

  el('btn-deduce').onclick = openDeduction;
  el('btn-back-console').onclick = () => { showScreen('console-screen'); renderAll(); };
  el('btn-transmit').onclick = transmit;

  el('btn-reconstruct').onclick = openReconstruction;
  el('btn-recon-back').onclick = () => showScreen('ending-screen');
  el('btn-again').onclick = () => location.reload();

  el('btn-menu').onclick = () => {
    el('menu-foot').textContent = audioManifest
      ? 'Audio present.'
      : 'No audio generated yet — running in subtitle mode. Run tools/generate_audio.py to synthesise.';
    el('menu-overlay').classList.remove('hidden');
  };
  el('btn-close-menu').onclick = () => el('menu-overlay').classList.add('hidden');
  el('btn-save').onclick = () => { save(); toast('Case saved'); };
  el('btn-abandon').onclick = () => {
    if (confirm('Abandon the case? Progress is lost.')) {
      localStorage.removeItem(SAVE_KEY); location.reload();
    }
  };

  el('vol-master').oninput = e => { audio.master = e.target.value / 100; if (audio.cur) audio.cur.volume = audio.master; };
  el('vol-amb').oninput = e => { audio.amb = e.target.value / 100; if (audio.ambNode) audio.ambNode.volume = audio.amb * 0.5; };
  el('text-speed').oninput = e => { textSpeed = e.target.value / 100; };
  el('opt-autoadvance').onchange = e => { autoAdvance = e.target.checked; };

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') el('menu-overlay').classList.add('hidden');
    if (e.code === 'Space' && playCtl.running) { e.preventDefault(); playCtl.skipLine = true; audio.stop(); }
  });
}

boot().catch(err => {
  document.body.innerHTML =
    `<pre style="padding:40px;color:#c96a5f;font-family:monospace">CONTENT LOAD FAILED\n\n${err.message}\n\nServe this directory over HTTP (file:// will not work):\n\n  cd cradle-song/game && python3 -m http.server 8080</pre>`;
});
