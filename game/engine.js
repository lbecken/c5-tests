/* THE FORECAST IS MEMORY — player engine.
 *
 * Web Audio throughout, because the analysis bench performs real DSP on the
 * same decoded buffer the player just heard: the radiator tick under the
 * nine-second insert is genuinely in the file, and gating the speech genuinely
 * uncovers it. Nothing about the central clue is faked with a text callout.
 */
'use strict';

const S = window.STORY;
const FAST = new URLSearchParams(location.search).has('fast');
const $ = (id) => document.getElementById(id);
const el = (t, c, h) => { const n = document.createElement(t);
  if (c) n.className = c; if (h !== undefined) n.innerHTML = h; return n; };

/* ── state ─────────────────────────────────────────────────────────── */
const SAVE = 'forecast_is_memory_v1';
let G = null;

function freshState() {
  return {
    scene: S.start, clock: 28, flags: {}, evidence: [], tags: {},
    visited: {}, taken: {}, bench: {}, theory: {}, disclosure: null,
    challenges: [], benchCorrect: 0, started: Date.now(),
  };
}
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(G)); } catch (e) {} };
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE)); } catch (e) { return null; } };

/* ── audio ─────────────────────────────────────────────────────────── */
const AU = {
  ctx: null, master: null, voxGain: null, ambGain: null,
  buffers: new Map(), timings: null, amb: null, ambName: null,
  src: null, startedAt: 0, offset: 0, dur: 0, playing: false, onEnd: null,

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);
    this.voxGain = this.ctx.createGain(); this.voxGain.connect(this.master);
    this.ambGain = this.ctx.createGain(); this.ambGain.gain.value = 0.34;
    this.ambGain.connect(this.master);
  },

  async buffer(url) {
    if (this.buffers.has(url)) return this.buffers.get(url);
    const p = fetch(url).then(r => {
      if (!r.ok) throw new Error(url);
      return r.arrayBuffer();
    }).then(b => this.ctx.decodeAudioData(b));
    this.buffers.set(url, p);
    return p;
  },

  async play(asset, onEnd) {
    this.stop();
    if (FAST) {                       // playtest mode: advance without audio
      (window.__assets = window.__assets || []).push(asset);
      this.dur = 0.4; this.offset = 0; this.playing = true; this.onEnd = onEnd;
      this.startedAt = this.ctx.currentTime;
      setTimeout(() => { if (this.playing) { this.playing = false;
        if (onEnd) onEnd(); } }, 60);
      return;
    }
    let buf;
    try { buf = await this.buffer(`audio/vo/${asset}.mp3`); }
    catch (e) { console.warn('missing audio', asset); if (onEnd) onEnd(); return; }
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.connect(this.voxGain);
    src.onended = () => { if (this.src === src && this.playing) {
      this.playing = false; if (this.onEnd) this.onEnd(); } };
    this.src = src; this.dur = buf.duration; this.offset = 0;
    this.startedAt = this.ctx.currentTime; this.playing = true; this.onEnd = onEnd;
    src.start(0);
  },

  stop() {
    if (this.src) { try { this.src.onended = null; this.src.stop(); } catch (e) {} }
    this.src = null; this.playing = false;
  },

  pause() {
    if (!this.playing || !this.src) return;
    this.offset += this.ctx.currentTime - this.startedAt;
    this.stop();
  },

  resumeFrom() {
    if (this.playing || !this.src0) return;
  },

  get time() {
    return this.playing ? this.offset + (this.ctx.currentTime - this.startedAt)
                        : this.offset;
  },

  async sting(name) {
    // one-shot: klaxon, bolt, patch relay. Under the dialogue, never over it.
    if (FAST) return;
    try {
      const buf = await this.buffer(`audio/sfx/${name}.mp3`);
      const s = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      g.gain.value = 0.55;
      s.buffer = buf; s.connect(g); g.connect(this.master); s.start(0);
    } catch (e) { /* stings are decorative */ }
  },

  async ambience(name) {
    if (this.ambName === name) return;
    this.ambName = name;
    if (this.amb) { try { this.amb.stop(); } catch (e) {} this.amb = null; }
    if (!name) return;
    try {
      const buf = await this.buffer(`audio/amb/${name}.mp3`);
      if (this.ambName !== name) return;
      const s = this.ctx.createBufferSource();
      s.buffer = buf; s.loop = true;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(1, this.ctx.currentTime + 1.6);
      s.connect(g); g.connect(this.ambGain); s.start(0);
      this.amb = s;
    } catch (e) { /* ambience is decorative */ }
  },
};

/* ── requirement evaluation ────────────────────────────────────────── */
function meets(req) {
  if (!req) return true;
  if (req.flag && !G.flags[req.flag]) return false;
  if (req.not_flag && G.flags[req.not_flag]) return false;
  if (req.tag_count) {
    const [t, n] = req.tag_count;
    if ((G.tags[t] || 0) < n) return false;
  }
  return true;
}

function grant(list) {
  (list || []).forEach(id => {
    if (!G.evidence.includes(id)) {
      G.evidence.push(id);
      toast(`Evidence filed — ${S.evidence[id].name}`);
    }
  });
  $('ev-count').textContent = G.evidence.length;
}
function setFlags(obj) {
  Object.entries(obj || {}).forEach(([k, v]) => {
    G.flags[k] = (typeof v === 'number' && typeof G.flags[k] === 'number')
      ? G.flags[k] + v : v;
  });
}

/* overlay close handlers, so a panel that owns the screen can hand it back */
let overlayCloseCbs = [];
function onOverlayClose(fn) { overlayCloseCbs.push(fn); }
function closeOverlay() {
  $('overlay').classList.remove('on');
  const cbs = overlayCloseCbs; overlayCloseCbs = [];
  cbs.forEach(f => { try { f(); } catch (e) {} });
}

/* ── toast ─────────────────────────────────────────────────────────── */
let toastT = null;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

/* ── scene playback ────────────────────────────────────────────────── */
let CUR = null, SEG = 0, TICK = null, PENDING = null;

const ACTS = ['', 'ACT ONE', 'ACT TWO', 'ACT THREE', 'ACT FOUR', 'ACT FIVE', ''];

async function enterScene(id) {
  const sc = S.scenes[id];
  if (!sc) { console.error('no scene', id); return; }
  CUR = sc; SEG = 0; PENDING = null;
  G.scene = id;
  G.visited[id] = (G.visited[id] || 0) + 1;
  window.__scene = id;
  if (typeof sc.clock === 'number' && sc.clock < G.clock) G.clock = sc.clock;
  grant(sc.grants); setFlags(sc.sets);
  save();

  $('act-label').textContent = sc.ending ? 'FORECAST' : (ACTS[sc.act] || '');
  $('scene-title').textContent = sc.title || '';
  updateClock();
  AU.ambience(sc.amb === 'apartment' || sc.amb === 'line' ? 'line' : sc.amb);
  if (sc.sting) AU.sting(sc.sting);

  $('transcript').innerHTML = '';
  $('transcript').classList.remove('done');
  $('choices').innerHTML = '';
  $('choices').style.visibility = 'visible';
  buildSpeakerStrip(sc);
  playSegments(sc.segments, () => afterSegments(sc));
}

function buildSpeakerStrip(sc) {
  const strip = $('speaker-strip'); strip.innerHTML = '';
  const seen = [];
  (sc.segments || []).forEach(g => g.lines.forEach(l => {
    if (!seen.includes(l.spk)) seen.push(l.spk);
  }));
  seen.forEach(k => {
    const tag = el('span', 'spk-tag', S.speakers[k].name);
    tag.dataset.spk = k; strip.appendChild(tag);
  });
}

function renderSegment(seg) {
  const t = $('transcript');
  seg.lines.forEach((l, i) => {
    const n = el('div', `ln fx-${seg.fx}`);
    n.innerHTML = `<span class="who">${S.speakers[l.spk].name}</span>` +
                  `<span class="txt">${l.text}</span>`;
    n.dataset.seg = seg.asset; n.dataset.i = i;
    t.appendChild(n);
  });
  t.parentElement.scrollTop = t.parentElement.scrollHeight;
}

function playSegments(segs, done) {
  if (!segs || !segs.length) { done(); return; }
  let i = 0;
  const step = () => {
    if (i >= segs.length) { done(); return; }
    const seg = segs[i++];
    renderSegment(seg);
    highlightFor(seg);
    AU.play(seg.asset, step);
  };
  step();
}

/* line-level highlighting driven by forced-alignment timings */
function highlightFor(seg) {
  const times = (AU.timings && AU.timings[seg.asset]) || null;
  const nodes = [...document.querySelectorAll(
    `.ln[data-seg="${CSS.escape(seg.asset)}"]`)];
  nodes.forEach(n => n.classList.remove('now'));
  clearInterval(TICK);
  const starts = times && times.starts;
  TICK = setInterval(() => {
    const t = AU.time;
    $('progress-fill').style.width =
      Math.min(100, (t / (AU.dur || 1)) * 100) + '%';
    let active = 0;
    if (starts && starts.length === nodes.length) {
      for (let k = 0; k < starts.length; k++) if (t >= starts[k] - 0.12) active = k;
    } else if (nodes.length) {
      active = Math.min(nodes.length - 1,
        Math.floor((t / (AU.dur || 1)) * nodes.length));
    }
    nodes.forEach((n, k) => {
      n.classList.toggle('now', k === active);
      n.classList.toggle('said', k < active);
    });
    const spk = nodes[active] && seg.lines[active] && seg.lines[active].spk;
    document.querySelectorAll('.spk-tag').forEach(s =>
      s.classList.toggle('on', s.dataset.spk === spk));
    const node = nodes[active];
    if (node && AU.playing) {
      const st = node.closest('.stage');
      if (st && node.offsetTop > st.scrollTop + st.clientHeight - 120)
        st.scrollTop = node.offsetTop - st.clientHeight / 2;
    }
  }, 90);
}

function afterSegments(sc) {
  clearInterval(TICK);
  // playback is over: lift the whole passage to readable while they choose
  $('transcript').classList.add('done');
  document.querySelectorAll('.spk-tag').forEach(s => s.classList.remove('on'));
  if (sc.bench) return renderBench(sc);
  if (sc.confront) return renderConfront(sc);
  if (sc.theory) return renderTheory(sc);
  if (sc.disclosure) return renderDisclosure(sc);
  if (sc.ending) return renderEnding(sc);
  if (sc.choices && sc.choices.length) return renderChoices(sc);
  if (sc.next) { advanceClock(); return enterScene(sc.next); }
}

function advanceClock() { /* clock is driven by scene definitions */ }

function updateClock() {
  const c = $('clock'), m = $('clock-min');
  m.textContent = G.clock;
  c.classList.toggle('warn', G.clock <= 11 && G.clock > 5);
  c.classList.toggle('crit', G.clock <= 5);
}

/* ── choices ───────────────────────────────────────────────────────── */
function renderChoices(sc) {
  const box = $('choices'); box.innerHTML = '';
  sc.choices.forEach((c, idx) => {
    const key = sc.id + ':' + idx;
    const used = c.once && G.taken[key];
    const ok = meets(c.req);
    if (used && c.once) return;               // consumed one-shots disappear
    const b = el('button', 'choice' + (ok ? '' : ' locked'));
    b.innerHTML = (c.tag ? `<span class="tagl">${c.tag}</span>` : '') + c.label;
    if (!ok) {
      b.title = 'Not yet.';
      b.disabled = true;
    } else {
      b.onclick = () => {
        G.taken[key] = true;
        if (c.tag) G.tags[c.tag] = (G.tags[c.tag] || 0) + 1;
        setFlags(c.sets); grant(c.grants);
        box.innerHTML = '';
        enterScene(c.goto);
      };
    }
    box.appendChild(b);
  });
  if (!box.children.length && sc.next) enterScene(sc.next);
}

/* ── analysis bench ────────────────────────────────────────────────── */
const INSERT_ASSET = 's24_insert__01';

function renderBench(sc) {
  // The overlay is the whole interface here. The buttons below it only appear
  // if the player closes it, so nothing is ever visible but unclickable.
  const box = $('choices'); box.innerHTML = '';
  const reopen = el('button', 'choice grave', 'Reopen the analysis bench');
  reopen.onclick = () => openBench(sc);
  const done = el('button', 'choice', 'Leave the bench');
  done.onclick = () => enterScene(sc.next);
  box.appendChild(reopen); box.appendChild(done);
  box.style.visibility = 'hidden';
  openBench(sc);
  onOverlayClose(() => { box.style.visibility = 'visible'; });
}

function openBench(sc) {
  const body = $('panel-body'); body.innerHTML = '';
  body.appendChild(el('h2', null, 'Analysis bench'));
  body.appendChild(el('div', 'sub', 'Nine seconds, isolated and looped'));
  const scope = el('canvas', 'scope'); scope.width = 700; scope.height = 86;
  body.appendChild(scope);
  drawScope(scope, null);

  const results = el('div');
  sc.bench_options.forEach(o => {
    const btn = el('button', 'bench-opt' + (G.bench[o.id] ? ' used' : ''));
    btn.textContent = o.label;
    if (G.bench[o.id]) btn.disabled = true;
    const gated = o.req && !G.bench[o.req.replace('bench_', '')];
    if (gated) { btn.disabled = true; btn.textContent = o.label + '  — run the previous pass first'; }
    btn.onclick = async () => {
      G.bench[o.id] = true;
      btn.classList.add('used');
      btn.disabled = true;              // each pass is run once
      const r = el('div', 'bench-result',
        `<b>${o.label}</b><br>${o.result}`);
      results.appendChild(r);
      if (o.correct) {
        G.benchCorrect++;
        if (sc.on_correct && G.benchCorrect >= 2) {
          grant(sc.on_correct.grants); setFlags(sc.on_correct.sets);
        }
      }
      save();
      const buf = await benchRender(o.id);
      drawScope(scope, buf);
      if (o.asset) {
        renderSegment({ asset: o.asset, fx: sc.amb,
          lines: [o.line] });
        AU.play(o.asset, null);
      } else if (buf) {
        playBuffer(buf);
      }
      refreshBenchGating(sc, body);
    };
    body.appendChild(btn);
  });
  body.appendChild(results);
  const close = el('button', 'choice', 'Close the bench and go on');
  close.style.marginTop = '16px';
  close.onclick = () => { closeOverlay(); enterScene(sc.next); };
  body.appendChild(close);
  $('overlay').classList.add('on');
}

function refreshBenchGating(sc, body) {
  [...body.querySelectorAll('.bench-opt')].forEach((btn, i) => {
    const o = sc.bench_options[i];
    if (o && o.req && !G.bench[o.id] &&
        G.bench[o.req.replace('bench_', '')] && btn.disabled) {
      btn.disabled = false; btn.textContent = o.label;   // prerequisite met
    }
  });
}

/* Real DSP on the insert buffer. */
async function benchRender(mode) {
  let src;
  try { src = await AU.buffer(`audio/vo/${INSERT_ASSET}.mp3`); }
  catch (e) { return null; }
  const sr = src.sampleRate, n = src.length, x = src.getChannelData(0);

  if (mode === 'slow') {
    const out = AU.ctx.createBuffer(1, n * 2, sr);
    const y = out.getChannelData(0);
    for (let i = 0; i < n * 2; i++) {       // linear interp, pitch drops
      const p = i / 2, a = Math.floor(p), f = p - a;
      y[i] = (x[a] || 0) * (1 - f) + (x[a + 1] || 0) * f;
    }
    return out;
  }
  if (mode === 'speech') {
    const off = new OfflineAudioContext(1, n, sr);
    const s = off.createBufferSource(); s.buffer = src;
    const hp = off.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
    const lp = off.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400;
    s.connect(hp); hp.connect(lp); lp.connect(off.destination); s.start();
    return off.startRendering();
  }
  if (mode === 'floor' || mode === 'compare') {
    // Gate the speech: build a short-time envelope, then invert it so the
    // quiet inter-phrase floor is lifted and the loud speech is pushed down.
    const win = Math.floor(sr * 0.02);
    const env = new Float32Array(Math.ceil(n / win));
    for (let b = 0; b < env.length; b++) {
      let s2 = 0, c = 0;
      for (let i = b * win; i < Math.min(n, (b + 1) * win); i++) { s2 += x[i] * x[i]; c++; }
      env[b] = Math.sqrt(s2 / Math.max(1, c));
    }
    const sorted = [...env].sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * 0.25)] || 1e-6;
    const out = AU.ctx.createBuffer(1, n, sr);
    const y = out.getChannelData(0);
    let smooth = 0;
    for (let i = 0; i < n; i++) {
      const e = env[Math.floor(i / win)] || floor;
      const target = Math.min(1, Math.pow(floor / Math.max(e, 1e-7), 1.35));
      smooth += (target - smooth) * 0.002;
      y[i] = x[i] * smooth;
    }
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(y[i]));
    if (pk > 0) for (let i = 0; i < n; i++) y[i] = y[i] / pk * 0.92;
    return out;
  }
  return src;
}

function playBuffer(buf) {
  AU.stop();
  const s = AU.ctx.createBufferSource();
  s.buffer = buf; s.connect(AU.voxGain); s.start();
  AU.src = s; AU.dur = buf.duration; AU.offset = 0;
  AU.startedAt = AU.ctx.currentTime; AU.playing = true; AU.onEnd = null;
  s.onended = () => { AU.playing = false; };
}

function drawScope(cv, buf) {
  const g = cv.getContext('2d');
  g.fillStyle = '#0b0f11'; g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = '#242e35'; g.beginPath();
  g.moveTo(0, cv.height / 2); g.lineTo(cv.width, cv.height / 2); g.stroke();
  if (!buf) return;
  const x = buf.getChannelData(0), N = cv.width, step = Math.floor(x.length / N);
  g.strokeStyle = '#e6a552'; g.beginPath();
  for (let i = 0; i < N; i++) {
    let mx = 0;
    for (let k = 0; k < step; k++) mx = Math.max(mx, Math.abs(x[i * step + k] || 0));
    const h = mx * (cv.height / 2 - 2);
    g.moveTo(i + .5, cv.height / 2 - h); g.lineTo(i + .5, cv.height / 2 + h);
  }
  g.stroke();
}

/* ── confrontation ─────────────────────────────────────────────────── */
function renderConfront(sc) {
  const box = $('choices'); box.innerHTML = '';
  box.appendChild(el('div', 'stage-note', sc.accuse_prompt || 'Put it to him.'));
  let landed = G.challenges.filter(c =>
    sc.challenges.find(x => x.id === c && x.correct)).length;

  sc.challenges.forEach(ch => {
    if (G.challenges.includes(ch.id)) return;
    const ok = !ch.req || G.flags[ch.req];
    const b = el('button', 'choice' + (ok ? '' : ' locked'));
    b.innerHTML = ch.label + (ok ? '' :
      '<span class="tagl" style="margin-top:4px">you have nothing to support this</span>');
    if (!ok) { b.disabled = true; box.appendChild(b); return; }
    b.onclick = () => {
      G.challenges.push(ch.id);
      if (ch.cost) G.clock = Math.max(0, G.clock - ch.cost);
      updateClock(); save();
      box.innerHTML = '';
      playSegments(ch.segments, () => {
        landed = G.challenges.filter(c =>
          sc.challenges.find(x => x.id === c && x.correct)).length;
        if (landed >= 2) {
          G.flags.nagel_broken = true; save();
          playSegments(sc.break_lines, () => enterScene(sc.next));
        } else if (G.challenges.length >= 3) {
          playSegments(sc.fail_lines, () => enterScene(sc.next));
        } else {
          renderConfront(sc);
        }
      });
    };
    box.appendChild(b);
  });

  const move = el('button', 'choice', 'Say nothing more. Go to the finding.');
  move.onclick = () => {
    box.innerHTML = '';
    if (landed >= 2) { G.flags.nagel_broken = true;
      playSegments(sc.break_lines, () => enterScene(sc.next)); }
    else enterScene(sc.next);
  };
  box.appendChild(move);
}

/* ── final theory ──────────────────────────────────────────────────── */
function renderTheory(sc) {
  const body = $('panel-body'); body.innerHTML = '';
  $('choices').style.visibility = 'hidden';
  body.appendChild(el('h2', null, 'The finding'));
  body.appendChild(el('div', 'sub', `T minus ${G.clock} — entered on Vogt's authority`));

  sc.questions.forEach(q => {
    const wrap = el('div', 'q');
    wrap.appendChild(el('div', 'qt', q.prompt));
    q.options.forEach(([id, label]) => {
      const b = el('button', 'opt' + (G.theory[q.id] === id ? ' sel' : ''));
      b.textContent = label;
      b.onclick = () => {
        G.theory[q.id] = id; save();
        [...wrap.querySelectorAll('.opt')].forEach(o => o.classList.remove('sel'));
        b.classList.add('sel');
        check();
      };
      wrap.appendChild(b);
    });
    body.appendChild(wrap);
  });

  const submit = el('button', 'primary');
  submit.textContent = 'Enter the finding';
  submit.disabled = true;
  submit.style.width = '100%';
  submit.onclick = () => { closeOverlay(); enterScene(sc.next); };
  body.appendChild(submit);
  function check() {
    submit.disabled = sc.questions.some(q => !G.theory[q.id]);
  }
  check();
  $('overlay').classList.add('on');
  const box = $('choices');
  box.innerHTML = '';
  const reopen = el('button', 'choice grave', 'Open the finding');
  reopen.onclick = () => renderTheory(sc);
  box.appendChild(reopen);
  onOverlayClose(() => { box.style.visibility = 'visible'; });
}

/* ── disclosure ────────────────────────────────────────────────────── */
function renderDisclosure(sc) {
  const box = $('choices'); box.innerHTML = '';
  sc.options.forEach(o => {
    const b = el('button', 'disc');
    b.innerHTML = `<div class="dt">${o.label}</div><div class="dd">${o.desc}</div>`;
    b.onclick = () => {
      G.disclosure = o.id; G.clock = 0; save();
      box.innerHTML = '';
      enterScene(resolveEnding());
    };
    box.appendChild(b);
  });
}

/* Which ending the evidence and the choices have earned. */
function resolveEnding() {
  const t = G.theory || {};
  const rightInsert = t.insert === 'nagel';
  const broke = !!G.flags.nagel_broken;
  const sawInsert = !!G.flags.found_insert;
  if (!rightInsert || !sawInsert || !broke) return 'end_repeated';
  if (G.disclosure === 'suppress') return 'end_necessary_lie';
  return 'end_forecast';
}

/* ── ending ────────────────────────────────────────────────────────── */
function renderEnding(sc) {
  const play = () => {
    const tail = (sc.id === 'end_forecast' && G.disclosure === 'total' &&
                  sc.coda_total) ? sc.coda_total : null;
    if (tail) playSegments(tail, () => showVerdict(sc));
    else showVerdict(sc);
  };
  play();
}

const ENDING_NAMES = {
  forecast: ['The Forecast Is Memory', 'the whole file, and the names kept out of it'],
  necessary_lie: ['The Necessary Lie', 'the truth found, and buried by the finder'],
  repeated: ['You Have Repeated 1983', 'a name, chosen quickly, and the wrong one'],
};

function showVerdict(sc) {
  const [name, sub] = ENDING_NAMES[sc.ending_id] || ['—', ''];
  const body = $('panel-body'); body.innerHTML = '';
  const card = el('div', 'ending-card');
  card.appendChild(el('div', 'et', name));
  card.appendChild(el('div', 'es', sub));
  body.appendChild(card);

  const truth = { insert: 'nagel', compromise: 'dorsey', kroll: 'halloway' };
  const labels = {
    insert: 'Who inserted the nine seconds',
    compromise: 'Who compromised GLASSHOUSE',
    kroll: 'What happened to Willi Kroll',
  };
  const v = el('div', 'verdict');
  let right = 0;
  Object.keys(truth).forEach(k => {
    const ok = G.theory[k] === truth[k];
    if (ok) right++;
    const q = (S.scenes.s35_theory.questions || []).find(x => x.id === k);
    const pick = q && (q.options.find(o => o[0] === G.theory[k]) || [])[1];
    v.appendChild(el('div', 'row',
      `<span>${labels[k]}</span><span class="${ok ? 'ok' : 'no'}">` +
      `${ok ? '✓' : '✕'} ${pick || 'not answered'}</span>`));
  });
  v.appendChild(el('div', 'row',
    `<span>Evidence recovered</span><span>${G.evidence.length} of ` +
    `${Object.keys(S.evidence).length}</span>`));
  v.appendChild(el('div', 'row',
    `<span>The forgery</span><span class="${G.flags.nagel_broken ? 'ok' : 'no'}">` +
    `${G.flags.nagel_broken ? 'proved to his face' : 'never proved'}</span>`));
  body.appendChild(v);

  const missed = Object.keys(S.evidence).filter(e => !G.evidence.includes(e));
  if (missed.length) {
    body.appendChild(el('div', 'sub', 'What you did not find'));
    missed.forEach(id => {
      const e = S.evidence[id];
      body.appendChild(el('div', 'ev',
        `<div class="id">${id}</div><div class="nm">${e.name}</div>` +
        `<div class="tr">${e.truth}</div>`));
    });
  }

  const again = el('button', 'primary');
  again.style.width = '100%'; again.textContent = 'Listen again';
  again.onclick = () => { localStorage.removeItem(SAVE); location.reload(); };
  body.appendChild(again);
  $('overlay').classList.add('on');
  $('choices').innerHTML = '';
}

/* ── panels ────────────────────────────────────────────────────────── */
function showEvidence() {
  const body = $('panel-body'); body.innerHTML = '';
  body.appendChild(el('h2', null, 'Evidence locker'));
  body.appendChild(el('div', 'sub',
    `${G.evidence.length} items filed`));
  if (!G.evidence.length)
    body.appendChild(el('div', 'ev', '<div class="sf">Nothing yet.</div>'));
  G.evidence.forEach(id => {
    const e = S.evidence[id];
    body.appendChild(el('div', 'ev',
      `<div class="id">${id}</div><div class="nm">${e.name}</div>` +
      `<div class="sf">${e.surface}</div><div class="tr">${e.truth}</div>`));
  });
  $('overlay').classList.add('on');
}

const ROLES = {
  vogt: 'Federal archive liaison. Runs the facility. Sealed in with the rest of them.',
  frayne: 'Retired SIS. Halloway\'s handler in 1983. Has given this statement four times.',
  nagel: 'Former Stasi radio technician, Hauptabteilung III. Listened to the West for eleven years.',
  iris: 'Cryptanalyst. Peter Halloway\'s daughter. Was six when he crossed.',
  dorsey: 'Former CIA liaison to GLASSHOUSE. Now a private consultant.',
  halloway: 'Cryptographer. Crossed into East Berlin, 14 October 1983. Archive recordings only.',
  kroll: 'West German field officer. Halloway\'s extraction contact. One recording exists.',
  meteo: 'The station announcer. Reads weather that has never occurred anywhere.',
};
function showCast() {
  const body = $('panel-body'); body.innerHTML = '';
  body.appendChild(el('h2', null, 'On the line'));
  body.appendChild(el('div', 'sub', 'Berlin, tonight — and two voices from the archive'));
  const g = el('div', 'cast');
  Object.entries(S.speakers).forEach(([k, s]) => {
    g.appendChild(el('div', 'c',
      `<div class="nm">${s.name}</div><div class="rl">${ROLES[k] || ''}</div>`));
  });
  body.appendChild(g);
  $('overlay').classList.add('on');
}

function showSettings() {
  const body = $('panel-body'); body.innerHTML = '';
  body.appendChild(el('h2', null, 'Settings'));
  body.appendChild(el('div', 'sub', 'The mystery is solvable by ear alone'));
  const mk = (label, get, set) => {
    const row = el('div', 'set-row');
    row.appendChild(el('span', 'lbl', label));
    const sw = el('div', 'sw' + (get() ? ' on' : ''));
    sw.onclick = () => { set(!get()); sw.classList.toggle('on', get()); };
    row.appendChild(sw); body.appendChild(row);
  };
  mk('Show transcript', () => !document.body.classList.contains('no-tx'),
     v => document.body.classList.toggle('no-tx', !v));
  mk('Room ambience', () => AU.ambGain.gain.value > 0.02,
     v => AU.ambGain.gain.value = v ? 0.34 : 0);
  const row = el('div', 'set-row');
  row.appendChild(el('span', 'lbl', 'Start over'));
  const b = el('button', 'chip', 'Reset');
  b.onclick = () => { localStorage.removeItem(SAVE); location.reload(); };
  row.appendChild(b); body.appendChild(row);
  $('overlay').classList.add('on');
}

/* ── tuning minigame ───────────────────────────────────────────────── */
const TARGET = 4921;
let tuneCtx = null, tuneNodes = null;

function startTuner() {
  const dial = $('dial'), hint = $('tuner-hint');
  const update = () => {
    const f = +dial.value;
    $('freq').textContent = (f / 1000).toFixed(3);
    const d = Math.abs(f - TARGET);
    const strength = Math.max(0, 1 - d / 120);
    $('meter-fill').style.width = (strength * 100).toFixed(0) + '%';
    if (tuneNodes) {
      tuneNodes.noise.gain.value = 0.16 * (1 - strength * 0.92);
      tuneNodes.tone.gain.value = strength * 0.09;
      tuneNodes.osc.frequency.value = 620 + d * 2.2;
    }
    if (strength > 0.92) {
      hint.textContent = 'Carrier locked — Station 417';
      hint.classList.add('lock');
      $('begin').disabled = false;
      $('begin').textContent = 'Begin the review';
    } else {
      hint.textContent = strength > 0.4 ? 'Something is there. Closer.'
                                        : 'Turn the dial. Find the carrier.';
      hint.classList.remove('lock');
      $('begin').disabled = true;
      $('begin').textContent = 'Locked';
    }
  };
  dial.addEventListener('input', () => { ensureTuneAudio(); update(); });
  dial.addEventListener('pointerdown', ensureTuneAudio);
  update();
}

function ensureTuneAudio() {
  if (tuneCtx) return;
  tuneCtx = new (window.AudioContext || window.webkitAudioContext)();
  const len = tuneCtx.sampleRate * 2;
  const buf = tuneCtx.createBuffer(1, len, tuneCtx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = 0.55 * last + 0.45 * (Math.random() * 2 - 1);
    d[i] = last * 0.8;
  }
  const src = tuneCtx.createBufferSource(); src.buffer = buf; src.loop = true;
  const ng = tuneCtx.createGain(); ng.gain.value = 0.16;
  const bp = tuneCtx.createBiquadFilter(); bp.type = 'bandpass';
  bp.frequency.value = 1400; bp.Q.value = 0.7;
  src.connect(bp); bp.connect(ng); ng.connect(tuneCtx.destination); src.start();
  const osc = tuneCtx.createOscillator(); osc.type = 'sine';
  const tg = tuneCtx.createGain(); tg.gain.value = 0;
  osc.connect(tg); tg.connect(tuneCtx.destination); osc.start();
  tuneNodes = { noise: ng, tone: tg, osc };
}

function stopTuner() {
  if (tuneCtx) { try { tuneCtx.close(); } catch (e) {} tuneCtx = null; tuneNodes = null; }
}

/* ── boot ──────────────────────────────────────────────────────────── */
async function boot() {
  try {
    AU_TIMINGS: {
      const r = await fetch('audio/timings.json');
      if (r.ok) AU.timings = await r.json();
    }
  } catch (e) { AU.timings = null; }

  const saved = load();
  if (saved && saved.scene && saved.scene !== S.start) {
    $('resume').classList.remove('hidden');
    $('resume').onclick = () => { G = saved; go(saved.scene); };
  }
  startTuner();
  $('begin').onclick = () => { G = freshState(); go(S.start); };

  $('close-overlay').onclick = closeOverlay;
  $('overlay').onclick = (e) => { if (e.target === $('overlay')) closeOverlay(); };
  $('btn-evidence').onclick = showEvidence;
  $('btn-cast').onclick = showCast;
  $('btn-settings').onclick = showSettings;
  $('vol').oninput = (e) => { if (AU.master) AU.master.gain.value = e.target.value / 100; };
  $('btn-play').onclick = togglePlay;
  $('btn-replay').onclick = () => {
    const seg = currentSegment();
    if (seg) { AU.play(seg.asset, AU.onEnd); highlightFor(seg); }
  };
  $('btn-skip').onclick = () => { if (AU.src) { AU.stop(); if (AU.onEnd) AU.onEnd(); } };
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.key === 'Escape') closeOverlay();
  });
}

function currentSegment() {
  if (!CUR || !CUR.segments) return null;
  const nodes = [...document.querySelectorAll('.ln')];
  const last = nodes[nodes.length - 1];
  if (!last) return null;
  return (CUR.segments || []).find(s => s.asset === last.dataset.seg) || null;
}

function togglePlay() {
  if (!AU.ctx) return;
  if (AU.playing) {
    AU.pause();
    $('btn-play').innerHTML = '&#9654;';
  } else if (AU.src === null && AU.offset > 0) {
    const seg = currentSegment();
    if (seg) AU.play(seg.asset, AU.onEnd);
    $('btn-play').innerHTML = '&#10074;&#10074;';
  } else {
    if (AU.ctx.state === 'suspended') AU.ctx.resume();
    $('btn-play').innerHTML = '&#10074;&#10074;';
  }
}

function go(scene) {
  stopTuner();
  AU.init();
  if (AU.ctx.state === 'suspended') AU.ctx.resume();
  $('title').classList.remove('active');
  $('play').classList.add('active');
  if (!G) G = freshState();
  $('ev-count').textContent = G.evidence.length;
  enterScene(scene);
}

boot();
