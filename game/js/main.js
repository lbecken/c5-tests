/* THE MAN WHO CALLED FROM TOMORROW — interface */
const UI = (() => {
  const el = id => document.getElementById(id);
  let accTimer = null;

  const ENDING_TEXT = {
    1: {
      name: 'The Predicted Murder',
      tag: 'Ending one of three',
      body: [
        'Mira Sayegh died at twenty-two hundred hours in a sealed room with no wound on her, and the clock above the door stopped at the same second.',
        'Branch J stabilised around you. Project Echo stays under seal and under guard, and it stays running, because the only person who would ever have ordered it taken apart is on a mortuary trolley. In eleven weeks a committee will find that the death was consistent with a seizure disorder and that the emergency response was proportionate.',
        'Jonah Vale gets his Wednesday. He is not a monster and he never was, and that is the part that will keep you awake: he asked you for his life, and you gave it to him, and the receipt is a woman on a floor.'
      ]
    },
    2: {
      name: 'The Worse Tomorrow',
      tag: 'Ending two of three',
      body: [
        'She lived. The room screamed at an empty desk for four seconds and the array came through the window on its own and everybody went home.',
        'It was the right call and it was the humane call and it was, by any standard anyone will ever hold you to, a good night\'s work. Mira Sayegh will stand in front of the board on Thursday and tell them everything.',
        'But Echo was never collapsed. It was only survived. Nine weeks later the channel finds its own width, and the emergency line starts taking calls that do not come from any night anybody can reach — and every one of them is somebody asking for help from a date the switchboard cannot display.'
      ]
    },
    3: {
      name: 'The Narrow Door',
      tag: 'Ending three of three',
      body: [
        'She walked out of Studio B on her own feet at four minutes past ten, and the thing under the building went cold and stayed cold.',
        'The recordings began degrading almost immediately. Forty-seven minutes of a man\'s voice turning into weather on a disk, because the night he was speaking from has stopped being one of the things that happens. Jonah Vale is not dead. He is something with no word for it, and so is the woman who rang at twenty past eight to say she was sorry, and so is whatever was in the last packet.',
        'You did it by lying to a frightened man about the one thing he wanted, and by taking your own console off the record so that tomorrow would have nothing to read. Both of those were the right decision. Neither of them is going to feel like it at four in the morning.'
      ]
    }
  };

  /* ── header ──────────────────────────────────────────────────────── */
  function setClock(clock, act, title) {
    el('clock').textContent = clock;
    el('scene-title').textContent = title ? `Act ${act} · ${title}` : '';
  }

  function setChannelLabel(channel, env) {
    const c = el('channel-label');
    const map = {
      direct: 'console', phone: 'telephone', radio: 'police net',
      future_J: 'line 6 · origin +11h', future_M: 'line 6 · origin +18h',
      voicemail: 'archive · voicemail', studio_feed: 'studio b · live feed'
    };
    c.textContent = map[channel] || env || '';
    c.className = 'chan' + (channel === 'future_J' ? ' future' : channel === 'future_M' ? ' futureM' : '');
  }

  function setSpeaker(sp) {
    const n = el('speaker-name'), r = el('speaker-role'), m = el('meter');
    if (!sp) { n.textContent = '—'; n.style.color = ''; r.textContent = ''; m.className = ''; return; }
    const ch = CHARACTERS[sp];
    n.textContent = ch ? ch.name : sp;
    n.style.color = ch ? ch.color : '';
    r.textContent = ch ? ch.role : '';
    m.className = 'live';
  }

  function showSubtitle(who, text, isDirection) {
    const s = el('subtitle');
    s.className = isDirection ? 'direction' : '';
    s.textContent = isDirection ? text : `“${text}”`;
    if (isDirection) el('meter').className = '';
  }

  function setSegment(i, n) {
    el('seg-indicator').textContent = n ? `segment ${i} / ${n}` : '';
    if (!n) el('meter').className = '';
  }

  function setTranscript(lines) {
    const b = el('transcript-body');
    b.innerHTML = lines.map((l, i) =>
      `<div class="tl" data-i="${i}"><b>${CHARACTERS[l.sp] ? CHARACTERS[l.sp].name : l.sp}</b>${escapeHtml(l.text)}</div>`
    ).join('');
  }
  function highlightTranscript(i) {
    const b = el('transcript-body');
    [...b.querySelectorAll('.tl')].forEach(d => d.classList.toggle('now', +d.dataset.i === i));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /* ── interaction area ────────────────────────────────────────────── */
  function clearInteraction() { el('interaction').innerHTML = ''; }
  const clearChoices = clearInteraction;

  function showChoices(choices) {
    const box = el('interaction');
    box.innerHTML = '<p class="prompt">Your console</p>';
    choices.forEach(c => {
      const locked = (c.requiresAll || []).some(f => !Game.state.flags.has(f));
      const b = document.createElement('button');
      b.className = 'choice' + (locked ? ' locked' : '');
      b.innerHTML = escapeHtml(c.label) +
        `<span class="hint">${escapeHtml(locked ? (c.lockedHint || 'Not available.') : (c.hint || ''))}</span>`;
      b.disabled = locked;
      b.onclick = () => { clearInteraction(); Game.choose(c); };
      box.appendChild(b);
    });
  }

  function showHub(scene) {
    const h = Game.state.hub;
    // returning from a spoke leaves the spoke's heading up; put the hub back
    el('scene-title').textContent = `Act ${scene.act} · ${scene.title}`;
    setSpeaker(null);
    const box = el('interaction');
    box.innerHTML = `<p class="prompt">${escapeHtml(scene.hub.prompt)} — ${h.left} remaining</p>`;
    scene.hub.options.forEach((o, i) => {
      const done = h.taken.includes(o.next);
      const b = document.createElement('button');
      b.className = 'choice' + (done ? ' taken' : '');
      b.textContent = o.label;
      b.disabled = done;
      b.onclick = () => { clearInteraction(); Game.chooseHub(i); };
      box.appendChild(b);
    });
  }

  /* ── analysis ────────────────────────────────────────────────────── */
  const TOOLS = [
    { id: 'isolate_high', label: 'Isolate high band' },
    { id: 'isolate_low', label: 'Isolate low band' },
    { id: 'boost', label: 'Lift quiet detail' },
    { id: 'slow', label: 'Slow to 60%' }
  ];

  function showAnalysis(scene) {
    const box = el('interaction');
    box.innerHTML = `
      <div id="analysis">
        <h3>${escapeHtml(scene.analysis.prompt)}</h3>
        <p class="goal">${escapeHtml(scene.analysis.goal)}</p>
        <div class="tools"></div>
        <div class="analysis-actions">
          <button id="a-log">Log what I am hearing</button>
          <button id="a-skip" class="ghost">Leave it — no time</button>
        </div>
        <div id="a-miss"></div>
      </div>`;
    const tw = box.querySelector('.tools');
    TOOLS.forEach(t => {
      const b = document.createElement('button');
      b.className = 'tool' + (Game.state.tools.has(t.id) ? ' on' : '');
      b.textContent = t.label;
      b.onclick = () => {
        Game.toggleTool(t.id);
        [...tw.children].forEach((c, i) => c.classList.toggle('on', Game.state.tools.has(TOOLS[i].id)));
      };
      tw.appendChild(b);
    });
    el('a-log').onclick = () => Game.submitAnalysis(scene);
    el('a-skip').onclick = () => { clearInteraction(); Game.skipAnalysis(scene); };
  }

  function analysisMiss() {
    el('a-miss').innerHTML =
      '<p class="miss">BOYLE: “That\'s the room, that\'s all that is. If there\'s something up there you\'ll not find it sitting in the middle of the band — you\'ll have to go and get it, and then you\'ll have to make it louder than it wants to be.”</p>';
  }

  /* ── accusation ──────────────────────────────────────────────────── */
  function showAccusation() {
    const box = el('interaction');
    let remaining = 90;
    box.innerHTML = `
      <div id="accusation">
        <h3><span>Accusation — on the record</span><span id="acc-timer">1:30</span></h3>
        <div id="acc-questions"></div>
        <button id="acc-submit" disabled>Lock all four and submit</button>
      </div>`;
    const qbox = el('acc-questions');
    for (const key of ['method', 'hands', 'architect', 'calls']) {
      const spec = ACCUSATION[key];
      const d = document.createElement('div');
      d.className = 'acc-q';
      d.innerHTML = `<p>${escapeHtml(spec.prompt)}</p><div class="acc-opts"></div>`;
      const ob = d.querySelector('.acc-opts');
      for (const [val, label] of Object.entries(spec.options)) {
        const b = document.createElement('button');
        b.className = 'acc-opt';
        b.textContent = label;
        b.onclick = () => {
          Game.state.theory[key] = val;
          [...ob.children].forEach(c => c.classList.remove('sel'));
          b.classList.add('sel');
          el('acc-submit').disabled =
            !['method', 'hands', 'architect', 'calls'].every(k => Game.state.theory[k]);
        };
        ob.appendChild(b);
      }
      qbox.appendChild(d);
    }
    const submit = () => {
      clearInterval(accTimer);
      clearInteraction();
      Game.submitTheory();
    };
    el('acc-submit').onclick = submit;
    accTimer = setInterval(() => {
      remaining--;
      const m = Math.floor(remaining / 60), s = String(remaining % 60).padStart(2, '0');
      const t = el('acc-timer');
      if (!t) { clearInterval(accTimer); return; }
      t.textContent = `${m}:${s}`;
      if (remaining <= 0) submit(); // time runs out; you go with what you have
    }, 1000);
  }

  /* ── notebook ────────────────────────────────────────────────────── */
  function renderNotebook() {
    const b = el('notebook-body');
    const items = [...Game.state.evidence];
    el('ev-count').textContent = items.length;
    if (!items.length) {
      b.innerHTML = '<p class="ev-empty">Nothing logged yet. Everything on this console is evidence from the moment you open the line.</p>';
      return;
    }
    b.innerHTML = items.map(id => {
      const e = EVIDENCE[id];
      if (!e) return '';
      const revealed = e.unlock && Game.state.flags.has(e.unlock);
      return `<div class="ev ${revealed ? 'revealed' : ''}">
        <div class="id">${id}${e.mandatory ? '' : ' · peripheral'}</div>
        <div class="t">${escapeHtml(e.title)}</div>
        <div class="s">${escapeHtml(e.seems)}</div>
        ${revealed ? `<div class="m">${escapeHtml(e.means)}</div>` : ''}
      </div>`;
    }).join('');
  }

  function flashEvidence() {
    const c = el('ev-count');
    c.classList.add('flash');
    setTimeout(() => c.classList.remove('flash'), 1400);
  }

  /* ── ending ──────────────────────────────────────────────────────── */
  function showEnding(state) {
    const info = ENDING_TEXT[state.ending] || ENDING_TEXT[2];
    const { detail } = Game.scoreTheory();
    const labels = {
      method: 'Method', hands: 'Hands', architect: 'Intent', calls: 'The calls'
    };
    const rows = Object.keys(labels).map(k => {
      const spec = ACCUSATION[k];
      const pick = state.theory[k];
      return `<div class="srow">
        <span class="k">${labels[k]}</span>
        <span class="v ${detail[k]}">${escapeHtml(pick ? spec.options[pick] : 'not given')}</span>
      </div>`;
    }).join('');

    const allEv = Object.keys(EVIDENCE);
    const missed = allEv.filter(id => !state.evidence.has(id));
    const missedHtml = missed.length
      ? `<p class="missed"><b>${missed.length} of ${allEv.length} evidence items never reached your console.</b> ` +
        missed.slice(0, 6).map(id => escapeHtml(EVIDENCE[id].title)).join(' · ') +
        (missed.length > 6 ? ' …' : '') + '</p>'
      : '<p class="missed"><b>You logged every piece of evidence in the case.</b></p>';

    el('interaction').innerHTML = `
      <div id="ending-screen">
        <p class="etag">${info.tag}</p>
        <h2>${escapeHtml(info.name)}</h2>
        ${info.body.map(p => `<p>${escapeHtml(p)}</p>`).join('')}
        <div class="scorecard">
          <h4>Your statement, as read back at 21:59</h4>
          ${rows}
        </div>
        ${missedHtml}
        <div class="analysis-actions" style="margin-top:22px">
          <button id="e-again">Take the shift again</button>
          <button id="e-truth" class="ghost">Read what actually happened</button>
        </div>
        <div id="truth"></div>
      </div>`;
    setSpeaker(null);
    setSegment(0, 0);
    el('speaker-panel').style.display = 'none';
    el('subtitle-wrap').style.display = 'none';
    el('e-again').onclick = () => { Game.clearSave(); location.reload(); };
    el('e-truth').onclick = () => {
      el('truth').innerHTML = `
        <div class="scorecard" style="margin-top:18px">
          <h4>The case</h4>
          <p style="font-size:13.5px;color:var(--dim);line-height:1.7">
          Leonie Hart installed a phase-referenced oscillator in the Studio B wall clock on the Tuesday,
          believing it was a stabiliser. At phase lock it drives the brass case as a transducer at 22.1 kHz —
          the telemetry band of the neurostimulator Mira Sayegh has carried since the 2019 containment failure.
          <br><br>
          Jonah Vale supplied it. In his original branch Mira survives tonight, exposes Echo, and orders it
          dismantled; containment fails during the work and kills him. So he sent back the design — and, eight
          weeks earlier, the revised shutdown procedure that requires her to stand at that desk at exactly
          22:00. He did not only put a weapon in the room. He wrote the reason she would walk into it.
          <br><br>
          And he did not design the crystal. The build stamp is Leonie's own, dated eleven hours from now:
          tomorrow morning she reverse-engineers what she installed, and hands it to Jonah, who sends it back
          to her. It has no author. It only has a circumference.
          <br><br>
          Every caller was reading your incident log. That is how they knew. That is why going dark works.
          </p>
        </div>`;
      el('e-truth').disabled = true;
    };
  }

  return {
    setClock, setChannelLabel, setSpeaker, showSubtitle, setSegment,
    setTranscript, highlightTranscript, clearChoices,
    showChoices, showHub, showAnalysis, analysisMiss, showAccusation,
    renderNotebook, flashEvidence, showEnding
  };
})();

/* ── boot ──────────────────────────────────────────────────────────── */
(async function () {
  const audioEl = document.getElementById('dlg');
  const el = id => document.getElementById(id);

  try {
    await Game.boot(audioEl);
  } catch (e) {
    document.querySelector('.title-actions').innerHTML =
      `<p class="warn">Audio manifest could not be loaded.<br>
       Run <code>node tools/generate-audio.mjs</code>, then serve this folder over http
       (<code>python3 -m http.server</code>) rather than opening the file directly.</p>`;
    return;
  }

  if (Game.hasSave()) el('btn-continue').hidden = false;

  function goConsole(fresh) {
    AudioEngine.init(audioEl);
    AudioEngine.resume();
    el('title').classList.remove('on');
    el('console').classList.add('on');
    Game.start(fresh);
  }
  el('btn-begin').onclick = () => goConsole(true);
  el('btn-continue').onclick = () => goConsole(false);

  el('btn-replay').onclick = () => Game.replaySegment();
  el('btn-replay-scene').onclick = () => Game.replayScene();
  el('btn-skip').onclick = () => Game.skipSegment();

  const togglePanel = id => {
    ['notebook', 'transcript', 'mixer'].forEach(p =>
      el(p).classList.toggle('open', p === id && !el(p).classList.contains('open')));
  };
  el('btn-notebook').onclick = () => { UI.renderNotebook(); togglePanel('notebook'); };
  el('btn-transcript').onclick = () => togglePanel('transcript');
  el('btn-mixer').onclick = () => togglePanel('mixer');
  document.querySelectorAll('[data-close]').forEach(b => {
    b.onclick = () => el(b.dataset.close).classList.remove('open');
  });

  el('v-dlg').oninput = e => AudioEngine.setVolume('dialogue', +e.target.value);
  el('v-amb').oninput = e => AudioEngine.setVolume('amb', +e.target.value);
  el('v-sfx').oninput = e => AudioEngine.setVolume('sfx', +e.target.value);

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'r') Game.replaySegment();
    if (e.key === 'n') { UI.renderNotebook(); togglePanel('notebook'); }
    if (e.key === 't') togglePanel('transcript');
    if (e.key === ' ') { e.preventDefault(); audioEl.paused ? audioEl.play() : audioEl.pause(); }
  });
})();
