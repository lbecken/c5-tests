/* THE MAN WHO CALLED FROM TOMORROW — scene runner and game state */
const Game = (() => {
  const SAVE_KEY = 'tmwcft.save.v2';
  const el = id => document.getElementById(id);

  let manifest = null;
  let sceneById = {};
  let audioEl = null;

  const state = {
    sceneId: null,
    clock: '21:13',
    act: 1,
    flags: new Set(),
    evidence: new Set(),
    hub: null,
    theory: { method: null, hands: null, architect: null, calls: null },
    tools: new Set(),
    seen: new Set(),
    ending: null,
    score: 0
  };

  let seg = { list: [], i: 0, timer: null, subTimer: null, playing: false, sceneDone: null };

  /* ── save / load ─────────────────────────────────────────────────── */

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        sceneId: state.sceneId, clock: state.clock, act: state.act,
        flags: [...state.flags], evidence: [...state.evidence],
        hub: state.hub, theory: state.theory, seen: [...state.seen],
        ending: state.ending, score: state.score
      }));
    } catch (e) {}
  }
  function hasSave() { return !!localStorage.getItem(SAVE_KEY); }
  function load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    state.sceneId = d.sceneId; state.clock = d.clock; state.act = d.act;
    state.flags = new Set(d.flags); state.evidence = new Set(d.evidence);
    state.hub = d.hub; state.theory = d.theory; state.seen = new Set(d.seen || []);
    state.ending = d.ending; state.score = d.score || 0;
    return true;
  }
  function clearSave() { localStorage.removeItem(SAVE_KEY); }

  /* ── boot ────────────────────────────────────────────────────────── */

  async function boot(audioElement) {
    audioEl = audioElement;
    SCENES.forEach(s => { sceneById[s.id] = s; });
    const res = await fetch('audio/manifest.json');
    manifest = await res.json();
  }

  /* ── scene flow ──────────────────────────────────────────────────── */

  function enter(id) {
    const scene = sceneById[id];
    if (!scene) { console.error('missing scene', id); return; }
    state.sceneId = id;
    state.act = scene.act || state.act;
    if (scene.clock) state.clock = scene.clock;
    state.seen.add(id);
    if (scene.ending) state.ending = scene.ending;

    UI.setClock(state.clock, scene.act, scene.title);
    UI.clearChoices();
    UI.setChannelLabel(scene.channel, scene.env);

    // Studio B's trigger circuit is live from the moment the room is surveyed —
    // the alias is present in every studio scene after that, whether or not the
    // player ever thinks to look for it.
    AudioEngine.armStudio(state.flags.has('studio_baseline') && !state.flags.has('crystal_removed'));
    AudioEngine.setAmbience(scene.env || 'control');
    AudioEngine.setChannel(scene.channel || 'direct');
    if ((scene.channel || '').startsWith('future')) AudioEngine.phasePips(scene.channel);

    // scheduled one-shots
    (scene.sfx || []).forEach(s => setTimeout(() => AudioEngine.fire(s.id), s.at * 1000));

    applyScene(scene);
    save();

    const start = () => playScene(scene, () => afterScene(scene));
    if (scene.silenceIntro) {
      UI.showSubtitle('—', `[the line is open. rain. nobody says anything.]`, true);
      UI.setSpeaker(null);
      setTimeout(start, scene.silenceIntro * 1000);
    } else {
      start();
    }
  }

  function applyScene(scene) {
    (scene.sets || []).forEach(f => state.flags.add(f));
    (scene.evidence || []).forEach(e => {
      if (!state.evidence.has(e)) { state.evidence.add(e); UI.flashEvidence(e); }
    });
    UI.renderNotebook();
  }

  function segmentsFor(sceneId) {
    const out = [];
    for (let i = 0; ; i++) {
      const m = manifest.segments[`${sceneId}.${i}`];
      if (!m) break;
      out.push(m);
    }
    return out;
  }

  function playScene(scene, done) {
    seg.list = segmentsFor(scene.id);
    seg.i = 0;
    seg.sceneDone = done;
    if (!seg.list.length) { done(); return; }
    playSegment();
  }

  function playSegment() {
    clearTimeout(seg.timer);
    clearInterval(seg.subTimer);
    const m = seg.list[seg.i];
    if (!m) {
      // hand off exactly once: a stale callback would re-run afterScene and
      // could re-open a hub the player has already left
      seg.playing = false;
      const done = seg.sceneDone; seg.sceneDone = null;
      done && done();
      return;
    }
    seg.playing = true;
    UI.setSegment(seg.i + 1, seg.list.length);

    if (m.type === 'beat') {
      UI.setSpeaker(m.sp);
      UI.showSubtitle(CHARACTERS[m.sp] ? CHARACTERS[m.sp].short : '—', m.direction, true);
      seg.timer = setTimeout(() => { seg.i++; playSegment(); }, m.dur * 1000);
      return;
    }

    audioEl.src = `audio/dialogue/${m.file}`;
    audioEl.playbackRate = state.tools.has('slow') ? 0.6 : 1;
    audioEl.play().catch(e => console.warn('play blocked', e));
    scheduleSubtitles(m);
    const advance = () => { audioEl.onended = audioEl.onerror = null; seg.i++; playSegment(); };
    audioEl.onended = advance;
    // a missing or unplayable file must not strand the shift
    audioEl.onerror = () => { console.warn('audio failed', m.file); setTimeout(advance, 400); };
  }

  /* Line timings are apportioned by character count across the segment. It is an
   * approximation, but the full transcript is always on screen beside it. */
  function scheduleSubtitles(m) {
    const lines = m.lines || [];
    if (!lines.length) return;
    const total = lines.reduce((n, l) => n + Math.max(l.weight, 8), 0);
    let acc = 0;
    const marks = lines.map(l => {
      const share = Math.max(l.weight, 8) / total;
      const at = acc; acc += share;
      return { at, line: l };
    });
    UI.setTranscript(lines);
    let shown = -1;
    seg.subTimer = setInterval(() => {
      const dur = audioEl.duration || m.dur || 1;
      const p = (audioEl.currentTime || 0) / dur;
      let idx = 0;
      for (let i = 0; i < marks.length; i++) if (p >= marks[i].at) idx = i;
      if (idx !== shown) {
        shown = idx;
        const l = marks[idx].line;
        UI.setSpeaker(l.sp);
        UI.showSubtitle(CHARACTERS[l.sp] ? CHARACTERS[l.sp].short : l.sp, l.text, false);
        UI.highlightTranscript(idx);
      }
    }, 90);
  }

  function replaySegment() {
    if (!seg.list.length) return;
    const m = seg.list[seg.i];
    if (m && m.type === 'audio') { audioEl.currentTime = 0; audioEl.play(); }
  }
  function replayScene() {
    clearTimeout(seg.timer); clearInterval(seg.subTimer);
    audioEl.pause();
    const scene = sceneById[state.sceneId];
    playScene(scene, () => afterScene(scene));
  }
  function skipSegment() {
    if (!seg.playing) return;   // nothing is running: silent intro, or awaiting a choice
    clearTimeout(seg.timer); clearInterval(seg.subTimer);
    audioEl.pause(); audioEl.onended = audioEl.onerror = null;
    seg.i++; playSegment();
  }

  /* ── what happens when a scene runs out ──────────────────────────── */

  function afterScene(scene) {
    clearInterval(seg.subTimer);
    UI.setSegment(0, 0);

    if (scene.terminal) { UI.showEnding(state); save(); return; }

    if (scene.analysis) { UI.showAnalysis(scene); return; }

    if (scene.accusation) { UI.showAccusation(); return; }

    if (scene.hubReturn) {
      const h = state.hub;
      if (h) {
        h.taken.push(scene.id);
        h.left--;
        if (h.left > 0) { UI.showHub(sceneById[h.hubId]); return; }
        const after = h.after; state.hub = null; save(); enter(after); return;
      }
    }

    if (scene.hub) { startHub(scene); return; }

    if (scene.choices) { UI.showChoices(scene.choices); return; }

    if (scene.next) { enter(scene.next); return; }

    UI.showEnding(state);
  }

  function startHub(scene) {
    state.hub = { hubId: scene.id, left: scene.hub.pick, taken: [], after: scene.hub.after };
    UI.showHub(scene);
  }

  function chooseHub(optIdx) {
    const scene = sceneById[state.hub.hubId];
    const opt = scene.hub.options[optIdx];
    enter(opt.next);
  }

  function choose(choice) {
    (choice.sets || []).forEach(f => state.flags.add(f));
    save();
    enter(choice.next);
  }

  /* ── analysis puzzle ─────────────────────────────────────────────── */

  function submitAnalysis(scene) {
    const need = scene.analysis.require;
    const ok = need.every(t => state.tools.has(t));
    if (ok) {
      state.flags.add('analysis_solved');
      save();
      enter(scene.analysis.onSolve);
    } else {
      UI.analysisMiss();
    }
  }
  function skipAnalysis(scene) { enter(scene.analysis.onSkip); }

  function toggleTool(t) {
    if (state.tools.has(t)) state.tools.delete(t); else state.tools.add(t);
    if (t === 'isolate_high' && state.tools.has('isolate_low')) state.tools.delete('isolate_low');
    if (t === 'isolate_low' && state.tools.has('isolate_high')) state.tools.delete('isolate_high');
    AudioEngine.setEnhancementSet(state.tools);
    if (audioEl) audioEl.playbackRate = state.tools.has('slow') ? 0.6 : 1;
    return state.tools;
  }

  /* ── accusation scoring ──────────────────────────────────────────── */

  function scoreTheory() {
    let n = 0;
    const detail = {};
    for (const k of ['method', 'hands', 'architect', 'calls']) {
      const spec = ACCUSATION[k];
      const pick = state.theory[k];
      if (pick === spec.correct) { n++; detail[k] = 'correct'; }
      else if (spec.partial && pick === spec.partial) { n += 0.5; detail[k] = 'partial'; }
      else detail[k] = 'wrong';
    }
    state.score = n;
    return { n, detail };
  }

  function submitTheory() {
    const { n } = scoreTheory();
    state.flags.add('theory_submitted');
    save();
    const verdict = n >= 3 ? 'VERDICT_STRONG' : n >= 2 ? 'VERDICT_PARTIAL' : 'VERDICT_WEAK';
    enter(verdict);
  }

  /* ── start / restart ─────────────────────────────────────────────── */

  function start(fresh) {
    if (fresh) {
      clearSave();
      state.sceneId = null; state.clock = '21:13'; state.act = 1;
      state.flags = new Set(); state.evidence = new Set(); state.hub = null;
      state.theory = { method: null, hands: null, architect: null, calls: null };
      state.tools = new Set(); state.seen = new Set(); state.ending = null; state.score = 0;
      AudioEngine.setEnhancementSet(state.tools);
      enter('S01');
    } else {
      load();
      AudioEngine.setEnhancementSet(state.tools);
      enter(state.sceneId || 'S01');
    }
  }

  return {
    boot, start, enter, choose, chooseHub, toggleTool, submitAnalysis, skipAnalysis,
    submitTheory, scoreTheory, replaySegment, replayScene, skipSegment,
    hasSave, clearSave, save,
    get state() { return state; },
    get scene() { return sceneById[state.sceneId]; },
    sceneById
  };
})();
