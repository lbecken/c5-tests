/* ==========================================================================
   MURDER AT THE EUROPA SUMMIT
   Audio-first branching mystery engine.
   ========================================================================== */
'use strict';

const SAVE_KEY = 'europa_summit_save_v1';
const $ = id => document.getElementById(id);

let CFG = null;
let SCENES = {};
let CUES = {};

let S = null;              // game state
let cur = null;            // current scene record
let curCues = [];
let subsOn = true;
let masterVol = 0.85;
let ambSlot = 0;           // which ambience element is live
let ambKey = null;

/* ---------------------------------------------------------------- state */

function freshState() {
  return {
    scene: null,
    evidence: [],
    flags: {},
    visited: [],
    usedChoices: [],
    transcript: [],
    deductions: {},
    policy: null,
    ending: null
  };
}

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

const hasEv   = e => S.evidence.includes(e);
const hasFlag = f => !!S.flags[f];

/* ----------------------------------------------------------- conditions */

function condOk(c) {
  if (!c) return true;
  if (c.flags    && !c.flags.every(hasFlag))          return false;
  if (c.notFlags &&  c.notFlags.some(hasFlag))        return false;
  if (c.evidence && !c.evidence.every(hasEv))         return false;
  if (c.count) {
    let n = 0;
    (c.count.flags    || []).forEach(f => { if (hasFlag(f)) n++; });
    (c.count.evidence || []).forEach(e => { if (hasEv(e))   n++; });
    if (n < (c.count.min || 1)) return false;
  }
  return true;
}

/* ---------------------------------------------------------------- audio */

const aDlg = $('a-dialogue');
const aAmb = [$('a-amb-a'), $('a-amb-b')];
const aSfx = $('a-sfx');

const AMB_UNDER  = 0.30;   // while dialogue plays
const AMB_ALONE  = 0.52;   // between scenes

function applyVolumes() {
  aDlg.volume = masterVol;
  aSfx.volume = masterVol * 0.55;
}

function fadeTo(el, target, ms, done) {
  if (el._fade) clearInterval(el._fade);
  const from = el.volume, steps = Math.max(1, Math.round(ms / 40));
  let i = 0;
  el._fade = setInterval(() => {
    i++;
    const v = from + (target - from) * (i / steps);
    el.volume = Math.max(0, Math.min(1, v));
    if (i >= steps) { clearInterval(el._fade); el._fade = null; if (done) done(); }
  }, 40);
}

function setAmbience(key) {
  if (key === ambKey) return;
  const def = CFG.ambience[key];
  const nextEl = aAmb[1 - ambSlot];
  const prevEl = aAmb[ambSlot];

  fadeTo(prevEl, 0, 1200, () => { prevEl.pause(); });

  if (!def || !def.file) { ambKey = key; return; }

  nextEl.src = def.file;
  nextEl.volume = 0;
  nextEl.play().catch(() => {});
  fadeTo(nextEl, AMB_UNDER * masterVol, 1400);
  ambSlot = 1 - ambSlot;
  ambKey = key;
}

function duckAmbience(under) {
  const el = aAmb[ambSlot];
  fadeTo(el, (under ? AMB_UNDER : AMB_ALONE) * masterVol, 700);
}

function playSfx(key) {
  const def = CFG.sfx[key];
  if (!def) return;
  aSfx.src = def.file;
  aSfx.currentTime = 0;
  aSfx.play().catch(() => {});
}

/* ------------------------------------------------------------ subtitles */

function clean(t) {
  return t.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
}

function speakerName(code) {
  const c = CFG.characters[code];
  return c ? c.name : code;
}
function speakerColour(code) {
  const c = CFG.characters[code];
  return c ? c.colour : '#7d8f9d';
}

function showSubtitle(line) {
  if (!subsOn) { $('sub-speaker').textContent = ''; $('sub-text').textContent = ''; return; }
  if (!line) { $('sub-text').textContent = ''; $('sub-speaker').textContent = ''; return; }
  const txt = clean(line.t);
  $('sub-speaker').textContent = speakerName(line.s);
  $('sub-speaker').style.color = speakerColour(line.s);
  if (!txt) {
    $('sub-text').textContent = '—';
    $('sub-text').classList.add('beat');
  } else {
    $('sub-text').textContent = txt;
    $('sub-text').classList.remove('beat');
  }
}

function pushTranscript(entry) {
  S.transcript.push(entry);
  if (S.transcript.length > 400) S.transcript.shift();
  renderTranscript();
}

function renderTranscript() {
  const box = $('transcript');
  box.innerHTML = S.transcript.map(e => {
    if (e.k === 'scene')
      return `<div class="sceneline">${esc(e.t)}</div>`;
    if (e.k === 'choice')
      return `<div class="tl"><div class="who" style="color:var(--cyan)">You chose</div>
              <div class="what" style="color:var(--cyan)">${esc(e.t)}</div></div>`;
    return `<div class="tl"><div class="who" style="color:${speakerColour(e.s)}">${
      esc(speakerName(e.s))}</div><div class="what">${esc(e.t)}</div></div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

const esc = s => String(s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* --------------------------------------------------------- scene player */

let lastCueIdx = -1;
let sceneEnded = false;
let transcriptMark = 0;   // transcript length when the current scene began

function goto(id) {
  // special routes
  if (id === 'ROUTE_ACCUSATION') return goto(routeAccusation());
  if (id === 'ROUTE_ENDING')     return goto(routeEnding());
  if (id === 'ROUTE_CODA')       return goto(routeCoda());
  if (id === 'END')              return showEpilogue();

  const sc = SCENES[id];
  if (!sc) { console.error('missing scene', id); return; }

  // tear down whatever the previous scene left running
  if (cur && cur._timer) { clearTimeout(cur._timer); cur._timer = null; }
  aDlg.pause();
  curCues = [];
  lastCueIdx = -1;

  cur = sc;
  S.scene = id;
  if (!S.visited.includes(id)) S.visited.push(id);
  transcriptMark = S.transcript.length;
  sceneEnded = false;

  save();
  renderChrome();

  ['board', 'policy', 'epilogue'].forEach(x => $(x).classList.add('hidden'));
  $('choices').innerHTML = '';
  $('transcript').classList.remove('hidden');
  $('subtitle').classList.remove('hidden');

  setAmbience(sc.ambience || 'booth');
  if (sc.sfx) playSfx(sc.sfx);

  const lines = sc.lines || [];
  if (!lines.length) { onSceneEnd(); return; }

  pushTranscript({ k: 'scene', t: sc.title || id });

  const rec = CUES[id];
  curCues = (rec && rec.cues) ? rec.cues : [];
  lastCueIdx = -1;

  if (rec && rec.file) {
    aDlg.src = rec.file;
    aDlg.currentTime = 0;
    duckAmbience(true);
    applyVolumes();
    aDlg.play().catch(err => { console.warn('audio blocked', err); fallbackText(); });
    $('btn-play').textContent = 'Pause';
  } else {
    fallbackText();          // no audio produced for this scene yet
  }
}

/* If audio is missing or blocked, run the scene as timed text. */
function fallbackText() {
  const lines = cur.lines || [];
  let i = 0;
  const step = () => {
    if (!cur || i >= lines.length) { onSceneEnd(); return; }
    const ln = lines[i];
    showSubtitle(ln);
    pushTranscript({ k: 'line', s: ln.s, t: clean(ln.t) || '—' });
    const words = clean(ln.t).split(/\s+/).filter(Boolean).length;
    i++;
    cur._timer = setTimeout(step, Math.max(1200, words / 150 * 60000));
  };
  step();
}

aDlg.addEventListener('timeupdate', () => {
  if (!cur || !curCues.length) return;
  const t = aDlg.currentTime;
  const d = aDlg.duration || 1;
  $('progress-fill').style.width = (t / d * 100) + '%';
  $('time').textContent = fmt(t);

  let idx = -1;
  for (let i = 0; i < curCues.length; i++) {
    if (t >= curCues[i].start - 0.05 && t < curCues[i].end + 0.05) { idx = i; break; }
    if (curCues[i].start > t) break;
  }
  if (idx !== -1 && idx !== lastCueIdx) {
    lastCueIdx = idx;
    const ln = cur.lines[curCues[idx].i];
    if (ln) {
      showSubtitle(ln);
      const txt = clean(ln.t);
      pushTranscript({ k: 'line', s: ln.s, t: txt || '—' });
    }
  }
});

aDlg.addEventListener('ended', () => { if (!sceneEnded) onSceneEnd(); });

function fmt(s) {
  s = Math.max(0, Math.floor(s || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function onSceneEnd() {
  if (sceneEnded) return;
  sceneEnded = true;
  if (cur && cur._timer) { clearTimeout(cur._timer); cur._timer = null; }

  // Evidence lands when you have actually heard the scene, not on entry.
  (cur.evidence || []).forEach(e => {
    if (!S.evidence.includes(e)) { S.evidence.push(e); flashEvidence(); }
  });
  Object.entries(cur.flags || {}).forEach(([k, v]) => { S.flags[k] = v; });
  renderChrome();
  save();

  duckAmbience(false);
  showSubtitle(null);
  $('progress-fill').style.width = '100%';

  if (cur.type === 'deduction') return showBoard();
  if (cur.type === 'policy')    return showPolicy();

  const choices = visibleChoices(cur);
  if (choices.length) return renderChoices(choices);
  if (cur.next) return goto(cur.next);
  showEpilogue();
}

/* -------------------------------------------------------------- choices */

function choiceKey(sc, ch) { return sc.id + '|' + ch.to + '|' + (ch.label || ''); }

function visibleChoices(sc) {
  return (sc.choices || []).filter(ch => {
    if (ch.once && S.usedChoices.includes(choiceKey(sc, ch))) return false;
    return condOk(ch.if);
  });
}

function renderChoices(list) {
  const box = $('choices');
  box.innerHTML = '';
  list.forEach(ch => {
    const b = document.createElement('button');
    b.className = 'choice' + (ch.to === 's37_theory' ? ' terminal' : '');
    b.innerHTML = esc(ch.label) +
      (ch.note ? `<span class="note">${esc(ch.note)}</span>` : '');
    b.onclick = () => {
      const key = choiceKey(cur, ch);
      if (!S.usedChoices.includes(key)) S.usedChoices.push(key);
      Object.entries(ch.sets || {}).forEach(([k, v]) => { S.flags[k] = v; });
      if (cur.type !== 'hub') pushTranscript({ k: 'choice', t: ch.label });
      box.innerHTML = '';
      save();
      goto(ch.to);
    };
    box.appendChild(b);
  });
}

/* ------------------------------------------------------- deduction board */

function showBoard() {
  $('choices').innerHTML = '';
  $('board').classList.remove('hidden');
  const wrap = $('board-questions');
  wrap.innerHTML = '';

  Object.entries(CFG.deductions).forEach(([key, q]) => {
    const div = document.createElement('div');
    div.className = 'q';
    div.innerHTML = `<div class="qtext">${esc(q.prompt)}</div>`;
    const opts = document.createElement('div');
    opts.className = 'opts';
    Object.entries(q.options).forEach(([val, label]) => {
      const b = document.createElement('button');
      b.className = 'opt' + (S.deductions[key] === val ? ' sel' : '');
      b.textContent = label;
      b.onclick = () => {
        S.deductions[key] = val;
        [...opts.children].forEach(c => c.classList.remove('sel'));
        b.classList.add('sel');
        $('btn-submit-board').disabled =
          Object.keys(CFG.deductions).some(k => !S.deductions[k]);
        save();
      };
      opts.appendChild(b);
    });
    div.appendChild(opts);
    wrap.appendChild(div);
  });

  $('btn-submit-board').disabled =
    Object.keys(CFG.deductions).some(k => !S.deductions[k]);
  $('btn-submit-board').onclick = () => {
    $('board').classList.add('hidden');
    goto('ROUTE_ACCUSATION');
  };
}

/* -------------------------------------------------------------- policy */

const POLICIES = [
  { id: 'ratify',   name: 'Ratify',
    desc: 'Sign the Accord. Bind them to an inspection regime and trust the institution to outlast the people in it.' },
  { id: 'suspend',  name: 'Suspend',
    desc: 'Quarantine the corpus, halt the vote, leave the question open until somebody knows what the question is.' },
  { id: 'transmit', name: 'Answer',
    desc: 'Put a reply into the water. Whatever is down there spoke first; refusing to answer is also a decision.' }
];

function showPolicy() {
  $('choices').innerHTML = '';
  $('policy').classList.remove('hidden');
  const box = $('policy-options');
  box.innerHTML = '';
  POLICIES.forEach(p => {
    const b = document.createElement('button');
    b.className = 'pol';
    b.innerHTML = `<div class="polname">${esc(p.name)}</div>
                   <div class="poldesc">${esc(p.desc)}</div>`;
    b.onclick = () => {
      S.policy = p.id;
      save();
      $('policy').classList.add('hidden');
      goto('ROUTE_ENDING');
    };
    box.appendChild(b);
  });
}

/* --------------------------------------------------------------- routing */

// Is the case against Okafor actually built, or just guessed?
function chainProved() {
  const keys = ['E18', 'E19', 'E20', 'E21'].filter(hasEv).length;
  return hasEv('E17') && keys >= 3;
}

function routeAccusation() {
  const k = S.deductions.killer;
  if (k === 'okafor' && chainProved()) return 's38_accusation_okafor';
  if (k === 'halloran')                return 's39_accusation_halloran';
  return 's40_accusation_other';
}

function routeEnding() {
  const k = S.deductions.killer;
  let e = 'C';
  if (k === 'okafor' && chainProved()) e = 'A';
  else if (k === 'halloran')           e = 'B';
  S.ending = e;
  save();
  return CFG.endings[e].scene;
}

function routeCoda() {
  return { ratify: 'coda_ratify', suspend: 'coda_suspend', transmit: 'coda_transmit' }
    [S.policy] || 'coda_suspend';
}

/* ------------------------------------------------------------- epilogue */

const KEY_EVIDENCE = ['E17', 'E18', 'E19', 'E20', 'E21'];

function showEpilogue() {
  ['board', 'policy'].forEach(x => $(x).classList.add('hidden'));
  $('choices').innerHTML = '';
  $('subtitle').classList.add('hidden');
  const box = $('epilogue');
  box.classList.remove('hidden');

  const end = CFG.endings[S.ending || 'C'];
  const rows = Object.entries(CFG.deductions).map(([k, q]) => {
    const mine = S.deductions[k];
    const right = mine === q.correct;
    const mineLabel = mine ? q.options[mine] : '(not answered)';
    return `<div class="vrow">
      <div class="vq">${esc(k)}</div>
      <div class="va ${right ? 'right' : 'wrong'}">${esc(mineLabel)}
        ${right ? '' : `<span class="truth">Canonical: ${esc(q.options[q.correct])}</span>`}
      </div></div>`;
  }).join('');

  const correct = Object.entries(CFG.deductions)
    .filter(([k, q]) => S.deductions[k] === q.correct).length;
  const missed = KEY_EVIDENCE.filter(e => !hasEv(e));

  // Naming the right person is not the same as proving it.
  let note = '';
  if (S.deductions.killer === 'okafor' && !chainProved()) {
    note = `<p class="dim" style="margin:0 0 18px">You named the right person and
      could not show how. Without the second discharge and the chain that explains it,
      the finding did not survive a courtroom.</p>`;
  } else if (S.ending === 'B') {
    note = `<p class="dim" style="margin:0 0 18px">Everything you proved about the
      Ambassador was true. She built a weapon, deployed it, and confessed. It simply
      was not the weapon that killed him.</p>`;
  }

  box.innerHTML = `
    <div class="endid">Ending ${esc(end.id)} of 3 &middot; ${
      S.evidence.length} of ${Object.keys(CFG.evidence).length} evidence items recovered</div>
    <h2>${esc(end.title)}</h2>
    ${note}
    <div class="verdict">${rows}</div>
    <div class="scoreline">${correct} of 4 findings match the canonical solution.</div>
    ${missed.length ? `<div class="missed">
        <h3>Evidence you never recovered</h3>
        <ul>${missed.map(e =>
          `<li><strong>${esc(CFG.evidence[e].name)}</strong> — ${esc(CFG.evidence[e].text)}</li>`
        ).join('')}</ul>
      </div>` : `<div class="missed"><h3>You recovered the entire chain.</h3></div>`}
    <div style="margin-top:32px;display:flex;gap:12px;flex-wrap:wrap">
      <button class="primary" onclick="restart()">Examine it again</button>
      <button class="ghost" onclick="document.getElementById('casefile').classList.remove('hidden');renderCase()">Read the case file</button>
    </div>`;
  save();
}

/* ---------------------------------------------------------------- chrome */

const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };

function renderChrome() {
  $('loc-name').textContent = cur.location || '—';
  $('act-name').textContent = cur.act ? `Act ${ROMAN[cur.act] || cur.act}` : '';
  $('scene-title').textContent = cur.title || '';
  $('ev-count').textContent = S.evidence.length;
}

function flashEvidence() {
  const el = $('ev-count');
  el.style.transition = 'none';
  el.style.background = 'var(--amber)';
  el.style.color = '#1a1206';
  setTimeout(() => {
    el.style.transition = 'background .8s, color .8s';
    el.style.background = '';
    el.style.color = '';
  }, 60);
  playSfx('evidence');
}

const CAT_LABEL = {
  key: 'Unaccounted for', physical: 'Physical', access: 'Access and authority',
  motive: 'Motive', forecast: 'Forecast rehearsals', signal: 'The signal'
};

function renderCase() {
  const body = $('case-body');
  if (!S.evidence.length) {
    body.innerHTML = '<div class="emptycase">Nothing recovered yet.</div>';
    return;
  }
  const groups = {};
  S.evidence.forEach(e => {
    const rec = CFG.evidence[e];
    if (!rec) return;
    (groups[rec.cat] = groups[rec.cat] || []).push([e, rec]);
  });
  const order = ['key', 'physical', 'access', 'motive', 'forecast', 'signal'];
  body.innerHTML = order.filter(c => groups[c]).map(cat => `
    <div class="evgroup">
      <h3>${esc(CAT_LABEL[cat] || cat)}</h3>
      ${groups[cat].map(([id, r]) => `
        <div class="ev ${cat === 'key' ? 'key' : ''}">
          <div class="evname">${esc(id)} — ${esc(r.name)}</div>
          <div class="evtext">${esc(r.text)}</div>
        </div>`).join('')}
    </div>`).join('');
}

/* ---------------------------------------------------------------- boot */

async function boot() {
  CFG = await (await fetch('data/config.json')).json();
  for (const rel of CFG.sceneFiles) {
    const d = await (await fetch(rel)).json();
    d.scenes.forEach(s => { SCENES[s.id] = s; });
  }
  try { CUES = await (await fetch('data/cues.json')).json(); }
  catch (e) { CUES = {}; console.warn('no cues.json — running in text mode'); }

  const saved = load();
  if (saved && saved.scene) $('btn-continue').classList.remove('hidden');

  $('btn-begin').onclick    = () => start(freshState());
  $('btn-continue').onclick = () => start(saved);
}

function start(state) {
  S = state;
  $('titlecard').classList.add('hidden');
  $('game').classList.remove('hidden');
  applyVolumes();
  renderTranscript();
  goto(S.scene || CFG.start);
}

function restart() {
  aDlg.pause();
  ambKey = null;
  aAmb.forEach(a => { a.pause(); a.volume = 0; });
  localStorage.removeItem(SAVE_KEY);
  S = freshState();
  ['board', 'policy', 'epilogue'].forEach(x => $(x).classList.add('hidden'));
  $('subtitle').classList.remove('hidden');
  $('casefile').classList.add('hidden');
  renderTranscript();
  goto(CFG.start);
}
window.restart = restart;

/* ------------------------------------------------------------- controls */

$('btn-play').onclick = () => {
  if (aDlg.paused) { aDlg.play().catch(() => {}); $('btn-play').textContent = 'Pause'; }
  else { aDlg.pause(); $('btn-play').textContent = 'Resume'; }
};
$('btn-replay').onclick = () => {
  if (!cur || !curCues.length) return;
  S.transcript.length = transcriptMark;      // drop this scene's lines, avoid dupes
  pushTranscript({ k: 'scene', t: cur.title || cur.id });
  lastCueIdx = -1;
  sceneEnded = false;
  aDlg.currentTime = 0;
  duckAmbience(true);
  aDlg.play().catch(() => {});
  $('btn-play').textContent = 'Pause';
};
$('btn-skip').onclick = () => {
  if (cur && cur._timer) { clearTimeout(cur._timer); cur._timer = null; }
  if (!aDlg.paused) aDlg.pause();
  if (!sceneEnded) onSceneEnd();
};
$('btn-subs').onclick = () => {
  subsOn = !subsOn;
  $('btn-subs').textContent = 'Subtitles: ' + (subsOn ? 'on' : 'off');
  if (!subsOn) showSubtitle(null);
};
$('vol').oninput = e => {
  masterVol = e.target.value / 100;
  applyVolumes();
  aAmb[ambSlot].volume = (aDlg.paused ? AMB_ALONE : AMB_UNDER) * masterVol;
};
$('btn-case').onclick = () => { renderCase(); $('casefile').classList.remove('hidden'); };
$('btn-case-close').onclick = () => $('casefile').classList.add('hidden');
$('btn-menu').onclick = () => $('menu').classList.remove('hidden');
$('btn-menu-close').onclick = () => $('menu').classList.add('hidden');
$('btn-restart').onclick = () => { $('menu').classList.add('hidden'); restart(); };
$('btn-wipe').onclick = () => {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
};

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); $('btn-play').click(); }
  if (e.code === 'KeyS')  $('btn-skip').click();
  if (e.code === 'KeyR')  $('btn-replay').click();
  if (e.code === 'KeyC')  $('btn-case').click();
  if (e.code === 'Escape') {
    $('casefile').classList.add('hidden');
    $('menu').classList.add('hidden');
  }
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9) {
    const btns = $('choices').querySelectorAll('.choice');
    if (btns[n - 1]) btns[n - 1].click();
  }
});

boot();
