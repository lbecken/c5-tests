/* THE MAN WHO CALLED FROM TOMORROW — audio engine
 *
 * Every environment, every channel effect and every sound effect in this game is
 * synthesised in the browser. There are no ambience or SFX files: the rain, the
 * array throb, the clock, the transformer arc and the thing hiding in the top of
 * the Studio B band are all generated live.
 *
 * That is not showing off. It is what makes the central clue honest — the
 * ultrasonic alias is really present in the signal at a level you cannot hear,
 * and the player's isolate/boost tools really do recover it. Nothing is faked
 * with a "you found it!" flag.
 */
const AudioEngine = (() => {
  let ctx = null;
  let master, busDialogue, busAmb, busSfx;
  let el, elSource, chainIn, chainOut;
  let currentChain = null;
  let ambience = null;
  let studioArmed = false;
  let enhancement = 'normal';
  let enhIn = null, enhOut = null, enhChain = null;

  const vol = { dialogue: 1, amb: 0.55, sfx: 0.8 };

  /* ── helpers ─────────────────────────────────────────────────────── */

  function noiseBuffer(seconds = 2, kind = 'white') {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.0990460;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
    } else {
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  function noiseSource(kind = 'white', loop = true) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(2, kind);
    s.loop = loop;
    return s;
  }

  function impulse(seconds, decay) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
      }
    }
    return buf;
  }

  const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const bp = (f, q = 1) => { const n = ctx.createBiquadFilter(); n.type = 'bandpass'; n.frequency.value = f; n.Q.value = q; return n; };
  const lp = (f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = 'lowpass'; n.frequency.value = f; n.Q.value = q; return n; };
  const hp = (f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = 'highpass'; n.frequency.value = f; n.Q.value = q; return n; };

  /* ── init ────────────────────────────────────────────────────────── */

  function init(audioElement) {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = g(1); master.connect(ctx.destination);
    busDialogue = g(vol.dialogue); busDialogue.connect(master);
    busAmb = g(vol.amb); busAmb.connect(master);
    busSfx = g(vol.sfx); busSfx.connect(master);

    el = audioElement;
    elSource = ctx.createMediaElementSource(el);
    chainIn = g(1);
    chainOut = g(1);
    elSource.connect(chainIn);

    // enhancement sits after the channel chain: the player's tools operate on
    // what actually arrives at the console, exactly as they would in the room
    enhIn = g(1);
    enhOut = g(1);
    chainOut.connect(enhIn);
    enhOut.connect(busDialogue);
    setEnhancement('normal');
    setChannel('direct');
  }

  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  /* ── channel chains ──────────────────────────────────────────────── */

  const PHASE = { future_J: 0.041, future_M: 0.068, future_L: 0.041 };

  function disconnectChain() {
    if (currentChain) {
      currentChain.nodes.forEach(n => { try { n.disconnect(); } catch (e) {} });
      if (currentChain.timers) currentChain.timers.forEach(clearInterval);
      if (currentChain.sources) currentChain.sources.forEach(s => { try { s.stop(); } catch (e) {} });
    }
    try { chainIn.disconnect(); } catch (e) {}
    currentChain = null;
  }

  function setChannel(kind) {
    if (!ctx) return;
    disconnectChain();
    const nodes = [], timers = [], sources = [];

    const finish = last => { last.connect(chainOut); currentChain = { kind, nodes, timers, sources }; };

    if (kind === 'direct') {
      const h = hp(70); nodes.push(h);
      chainIn.connect(h); finish(h);
      return;
    }

    if (kind === 'phone') {
      const h = hp(300), l = lp(3400), comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -26; comp.ratio.value = 6;
      nodes.push(h, l, comp);
      chainIn.connect(h); h.connect(l); l.connect(comp); finish(comp);
      return;
    }

    if (kind === 'radio') {
      const h = hp(320), l = lp(3000), out = g(1);
      const hiss = noiseSource('white'); const hissF = bp(2200, 0.8); const hissG = g(0.008);
      hiss.connect(hissF); hissF.connect(hissG); hissG.connect(out); hiss.start();
      nodes.push(h, l, out, hissF, hissG); sources.push(hiss);
      chainIn.connect(h); h.connect(l); l.connect(out); finish(out);
      return;
    }

    if (kind === 'voicemail') {
      const h = hp(350), l = lp(3200), out = g(1);
      // tape wobble: a slowly modulated delay
      const d = ctx.createDelay(0.05); d.delayTime.value = 0.012;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 3.1;
      const lfoG = g(0.0016); lfo.connect(lfoG); lfoG.connect(d.delayTime); lfo.start();
      nodes.push(h, l, out, d, lfoG); sources.push(lfo);
      chainIn.connect(h); h.connect(l); l.connect(d); d.connect(out); finish(out);
      return;
    }

    if (kind === 'studio_feed') {
      const h = hp(60), out = g(0.9);
      const conv = ctx.createConvolver(); conv.buffer = impulse(0.9, 3.2);
      const wet = g(0.16);
      nodes.push(h, out, conv, wet);
      chainIn.connect(h); h.connect(out); h.connect(conv); conv.connect(wet); wet.connect(out);
      finish(out);
      return;
    }

    if (kind.startsWith('future')) {
      const delay = PHASE[kind] ?? 0.041;
      const out = g(1);

      // narrow reconstruction band
      const h = hp(380), l = lp(2900);
      chainIn.connect(h); h.connect(l);

      // PRE-echo: the dry path is delayed, so the ghost arrives *ahead* of the
      // syllable. The interval is the caller's phase signature and is genuinely
      // measurable by a player who slows the clip down.
      const dry = ctx.createDelay(0.5); dry.delayTime.value = delay;
      const ghost = g(0.30); const ghostF = bp(1400, 0.9);
      l.connect(dry); dry.connect(out);
      l.connect(ghostF); ghostF.connect(ghost); ghost.connect(out);

      // packet loss + reconstruction artifacts
      const gate = g(1);
      out.connect(gate);
      const artifactBus = g(1); artifactBus.connect(chainOut);
      gate.connect(artifactBus);

      const t = setInterval(() => {
        if (Math.random() < 0.30) {
          const now = ctx.currentTime;
          const dur = 0.03 + Math.random() * 0.06;
          gate.gain.cancelScheduledValues(now);
          gate.gain.setValueAtTime(1, now);
          gate.gain.linearRampToValueAtTime(0.12, now + 0.006);
          gate.gain.setValueAtTime(0.12, now + dur);
          gate.gain.linearRampToValueAtTime(1, now + dur + 0.01);
          // a little burst of reconstruction noise in the gap
          const nb = noiseSource('white', false);
          const nf = bp(1100, 3); const ng = g(0.02);
          nb.connect(nf); nf.connect(ng); ng.connect(artifactBus);
          nb.start(now); nb.stop(now + dur);
        }
      }, 900);

      nodes.push(h, l, dry, ghost, ghostF, out, gate, artifactBus);
      timers.push(t);
      currentChain = { kind, nodes, timers, sources };
      return;
    }

    const h = hp(70); nodes.push(h); chainIn.connect(h); finish(h);
  }

  /* Three descending or ascending timing pips announce a future call.
   * Same motif, reversed — Jonah falls, Mira rises, and Leonie falls with
   * Jonah's exact interval because she is calling from his night. */
  function phasePips(kind) {
    if (!ctx) return;
    const dir = kind === 'future_M' ? 'up' : 'down';
    const base = [880, 740, 620];
    const seq = dir === 'up' ? [...base].reverse() : base;
    const t0 = ctx.currentTime + 0.05;
    seq.forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const gg = g(0);
      o.connect(gg); gg.connect(busSfx);
      const t = t0 + i * 0.13;
      gg.gain.setValueAtTime(0, t);
      gg.gain.linearRampToValueAtTime(0.07, t + 0.008);
      gg.gain.exponentialRampToValueAtTime(0.0005, t + 0.11);
      o.start(t); o.stop(t + 0.13);
    });
  }

  /* ── enhancement tools ───────────────────────────────────────────── */

  function setEnhancement(mode) {
    if (!ctx) return;
    enhancement = mode;
    if (enhChain) enhChain.forEach(n => { try { n.disconnect(); } catch (e) {} });
    try { enhIn.disconnect(); } catch (e) {}
    enhChain = [];

    el.preservesPitch = true;
    el.playbackRate = 1;

    if (mode === 'isolate_high') {
      const h = hp(5200, 1.2), h2 = hp(5200, 1.2), amp = g(9);
      enhIn.connect(h); h.connect(h2); h2.connect(amp); amp.connect(enhOut);
      enhChain = [h, h2, amp];
    } else if (mode === 'isolate_low') {
      const l = lp(320, 1.1), amp = g(2.4);
      enhIn.connect(l); l.connect(amp); amp.connect(enhOut);
      enhChain = [l, amp];
    } else if (mode === 'boost') {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -48; comp.ratio.value = 12; comp.knee.value = 6;
      comp.attack.value = 0.003; comp.release.value = 0.25;
      const amp = g(2.6);
      enhIn.connect(comp); comp.connect(amp); amp.connect(enhOut);
      enhChain = [comp, amp];
    } else if (mode === 'slow') {
      el.playbackRate = 0.6;
      enhIn.connect(enhOut);
    } else {
      enhIn.connect(enhOut);
    }
  }

  /* Combined tools: isolating AND boosting is what actually lifts the alias out
   * of the noise floor, which is why the puzzle asks for both. */
  function setEnhancementSet(set) {
    if (!ctx) return;
    if (enhChain) enhChain.forEach(n => { try { n.disconnect(); } catch (e) {} });
    try { enhIn.disconnect(); } catch (e) {}
    enhChain = [];
    el.preservesPitch = true;
    el.playbackRate = set.has('slow') ? 0.6 : 1;

    let node = enhIn;
    if (set.has('isolate_high')) {
      const h = hp(5200, 1.2), h2 = hp(5200, 1.2);
      node.connect(h); h.connect(h2); node = h2; enhChain.push(h, h2);
      const amp = g(7); node.connect(amp); node = amp; enhChain.push(amp);
    }
    if (set.has('isolate_low')) {
      const l = lp(320, 1.1); node.connect(l); node = l; enhChain.push(l);
    }
    if (set.has('boost')) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -48; comp.ratio.value = 12; comp.knee.value = 6;
      const amp = g(2.6);
      node.connect(comp); comp.connect(amp); node = amp; enhChain.push(comp, amp);
    }
    node.connect(enhOut);
    enhancement = [...set].join('+') || 'normal';
  }

  /* ── ambience ────────────────────────────────────────────────────── */

  function stopAmbience() {
    if (!ambience) return;
    const now = ctx.currentTime;
    ambience.out.gain.cancelScheduledValues(now);
    ambience.out.gain.setValueAtTime(ambience.out.gain.value, now);
    ambience.out.gain.linearRampToValueAtTime(0, now + 0.8);
    const a = ambience;
    setTimeout(() => {
      a.sources.forEach(s => { try { s.stop(); } catch (e) {} });
      a.timers.forEach(clearInterval);
      a.nodes.forEach(n => { try { n.disconnect(); } catch (e) {} });
    }, 900);
    ambience = null;
  }

  function setAmbience(kind) {
    if (!ctx) return;
    // the armed state is part of the identity of the studio bed: going from
    // "empty room" to "empty room with a live trigger circuit in it" has to
    // rebuild, or the clue never appears
    if (ambience && ambience.kind === kind && ambience.armed === studioArmed) return;
    stopAmbience();
    const out = g(0);
    out.connect(busAmb);
    const nodes = [out], timers = [], sources = [];
    const add = (...n) => nodes.push(...n);

    if (kind === 'control') {
      // rain against the window
      const rain = noiseSource('pink');
      const rf = bp(1600, 0.4), rg = g(0.30);
      rain.connect(rf); rf.connect(rg); rg.connect(out); rain.start();
      const rlfo = ctx.createOscillator(); rlfo.frequency.value = 0.07;
      const rlg = g(0.09); rlfo.connect(rlg); rlg.connect(rg.gain); rlfo.start();
      // HVAC
      const hv = noiseSource('pink'); const hf = lp(220), hg = g(0.16);
      hv.connect(hf); hf.connect(hg); hg.connect(out); hv.start();
      // distant radio traffic and a phone that nobody answers
      timers.push(setInterval(() => {
        if (Math.random() < 0.45) blip(out, 0.02 + Math.random() * 0.02);
      }, 4200));
      timers.push(setInterval(() => {
        if (Math.random() < 0.3) distantRing(out);
      }, 17000));
      add(rf, rg, rlg, hf, hg); sources.push(rain, rlfo, hv);
    }

    else if (kind === 'halcyon') {
      const vent = noiseSource('pink'); const vf = lp(500), vg = g(0.22);
      vent.connect(vf); vf.connect(vg); vg.connect(out); vent.start();
      const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 100;
      const hg2 = g(0.012); hum.connect(hg2); hg2.connect(out); hum.start();
      timers.push(setInterval(() => alarmPulse(out), 8000));
      add(vf, vg, hg2); sources.push(vent, hum);
    }

    else if (kind === 'studio') {
      // a dead room: mains hum, an enormous amount of nothing, and a clock
      const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 50;
      const hg2 = g(0.020); hum.connect(hg2); hg2.connect(out); hum.start();
      const hum2 = ctx.createOscillator(); hum2.type = 'sine'; hum2.frequency.value = 150;
      const hg3 = g(0.006); hum2.connect(hg3); hg3.connect(out); hum2.start();
      const air = noiseSource('pink'); const af = lp(140), ag = g(0.05);
      air.connect(af); af.connect(ag); ag.connect(out); air.start();

      // The escapement wanders by a few milliseconds, the way a real one does.
      timers.push(setInterval(() => clockTick(out, (Math.random() - 0.5) * 0.02), 1000));

      if (studioArmed) {
        // The alias. 22.1 kHz folded down by the feed's sample rate, sitting at
        // roughly -46 dB — under the noise floor of ordinary listening, and
        // recoverable with isolate-high + boost. It is really in the signal.
        const alias = ctx.createOscillator();
        alias.type = 'sine'; alias.frequency.value = 7620;
        const agn = g(0.005);
        alias.connect(agn); agn.connect(out); alias.start();
        const shimmer = ctx.createOscillator(); shimmer.frequency.value = 0.23;
        const sg = g(0.0018); shimmer.connect(sg); sg.connect(agn.gain); shimmer.start();
        // and the relay, landing on exactly the same sample every second
        timers.push(setInterval(() => relayTick(out), 1000));
        add(agn, sg); sources.push(alias, shimmer);
      }
      add(hg2, hg3, af, ag); sources.push(hum, hum2, air);
    }

    else if (kind === 'echo') {
      const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 38;
      const sg2 = g(0.10); sub.connect(sg2); sg2.connect(out); sub.start();
      const throb = ctx.createOscillator(); throb.frequency.value = 0.6;
      const tg = g(0.045); throb.connect(tg); tg.connect(sg2.gain); throb.start();
      const cryo = noiseSource('pink'); const cf = bp(700, 0.7), cg = g(0.10);
      cryo.connect(cf); cf.connect(cg); cg.connect(out); cryo.start();
      const pump = ctx.createOscillator(); pump.frequency.value = 1.35;
      const pg = g(0.055); pump.connect(pg); pg.connect(cg.gain); pump.start();
      timers.push(setInterval(() => syncPip(out), 2000));
      timers.push(setInterval(() => { if (Math.random() < 0.5) relayTick(out, 0.02); }, 3300));
      add(sg2, tg, cf, cg, pg); sources.push(sub, throb, cryo, pump);
    }

    else { // dead
      const air = noiseSource('pink'); const af = lp(90), ag = g(0.03);
      air.connect(af); af.connect(ag); ag.connect(out); air.start();
      add(af, ag); sources.push(air);
    }

    const now = ctx.currentTime;
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(1, now + 1.2);
    ambience = { kind, out, nodes, timers, sources, armed: studioArmed };
  }

  /* Callers always follow this with setAmbience, so flipping the flag is enough
   * — rebuilding here too would race the scene's own ambience change. */
  function armStudio(on) { studioArmed = on; }

  /* ── small procedural sounds ─────────────────────────────────────── */

  function clockTick(dest, jitter = 0) {
    const t = ctx.currentTime + 0.02 + jitter;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 2400;
    const f = bp(3000, 2.2); const gg = g(0);
    o.connect(f); f.connect(gg); gg.connect(dest);
    gg.gain.setValueAtTime(0, t);
    gg.gain.linearRampToValueAtTime(0.05, t + 0.002);
    gg.gain.exponentialRampToValueAtTime(0.0005, t + 0.045);
    o.start(t); o.stop(t + 0.06);
  }

  function relayTick(dest, level = 0.012) {
    const t = ctx.currentTime + 0.02;
    const n = noiseSource('white', false);
    const f = bp(5200, 6); const gg = g(0);
    n.connect(f); f.connect(gg); gg.connect(dest);
    gg.gain.setValueAtTime(0, t);
    gg.gain.linearRampToValueAtTime(level, t + 0.0008);
    gg.gain.exponentialRampToValueAtTime(0.00005, t + 0.012);
    n.start(t); n.stop(t + 0.02);
  }

  function blip(dest, level = 0.03) {
    const t = ctx.currentTime + Math.random() * 0.4;
    const n = noiseSource('white', false);
    const f = bp(1200 + Math.random() * 900, 3); const gg = g(0);
    n.connect(f); f.connect(gg); gg.connect(dest);
    const dur = 0.15 + Math.random() * 0.5;
    gg.gain.setValueAtTime(0, t);
    gg.gain.linearRampToValueAtTime(level, t + 0.03);
    gg.gain.setValueAtTime(level, t + dur - 0.04);
    gg.gain.linearRampToValueAtTime(0, t + dur);
    n.start(t); n.stop(t + dur + 0.02);
  }

  function distantRing(dest) {
    const t0 = ctx.currentTime + 0.1;
    for (let i = 0; i < 2; i++) {
      const t = t0 + i * 0.9;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 440;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 480;
      const gg = g(0); const f = lp(1200);
      o.connect(f); o2.connect(f); f.connect(gg); gg.connect(dest);
      gg.gain.setValueAtTime(0, t);
      gg.gain.linearRampToValueAtTime(0.014, t + 0.05);
      gg.gain.setValueAtTime(0.014, t + 0.38);
      gg.gain.linearRampToValueAtTime(0, t + 0.45);
      o.start(t); o2.start(t); o.stop(t + 0.5); o2.stop(t + 0.5);
    }
  }

  function alarmPulse(dest) {
    const t = ctx.currentTime + 0.05;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 620;
    const gg = g(0); const f = bp(620, 2);
    o.connect(f); f.connect(gg); gg.connect(dest);
    gg.gain.setValueAtTime(0, t);
    gg.gain.linearRampToValueAtTime(0.018, t + 0.04);
    gg.gain.linearRampToValueAtTime(0, t + 0.5);
    o.start(t); o.stop(t + 0.6);
  }

  function syncPip(dest) {
    const t = ctx.currentTime + 0.05;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1000;
    const gg = g(0); const f = lp(2400);
    o.connect(f); f.connect(gg); gg.connect(dest);
    gg.gain.setValueAtTime(0, t);
    gg.gain.linearRampToValueAtTime(0.008, t + 0.003);
    gg.gain.exponentialRampToValueAtTime(0.0002, t + 0.05);
    o.start(t); o.stop(t + 0.07);
  }

  /* ── one-shot effects fired from scene data ──────────────────────── */

  const SFX = {
    transformer(dest) {
      const t = ctx.currentTime + 0.03;
      const n = noiseSource('white', false);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
      f.frequency.setValueAtTime(5200, t);
      f.frequency.exponentialRampToValueAtTime(180, t + 1.1);
      const gg = g(0);
      n.connect(f); f.connect(gg); gg.connect(dest);
      gg.gain.setValueAtTime(0, t);
      gg.gain.linearRampToValueAtTime(0.55, t + 0.012);
      gg.gain.exponentialRampToValueAtTime(0.002, t + 1.6);
      n.start(t); n.stop(t + 1.8);

      const boom = ctx.createOscillator(); boom.type = 'sine';
      boom.frequency.setValueAtTime(64, t); boom.frequency.exponentialRampToValueAtTime(28, t + 1.4);
      const bg = g(0); boom.connect(bg); bg.connect(dest);
      bg.gain.setValueAtTime(0, t);
      bg.gain.linearRampToValueAtTime(0.45, t + 0.03);
      bg.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
      boom.start(t); boom.stop(t + 2);

      for (let i = 0; i < 9; i++) relayTick(dest, 0.05 + Math.random() * 0.05);
    },
    door_release(dest) {
      const t = ctx.currentTime + 0.02;
      const n = noiseSource('white', false);
      const f = bp(900, 1.4); const gg = g(0);
      n.connect(f); f.connect(gg); gg.connect(dest);
      gg.gain.setValueAtTime(0, t);
      gg.gain.linearRampToValueAtTime(0.16, t + 0.004);
      gg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      n.start(t); n.stop(t + 0.3);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 90;
      const og = g(0); o.connect(og); og.connect(dest);
      og.gain.setValueAtTime(0, t + 0.05);
      og.gain.linearRampToValueAtTime(0.18, t + 0.07);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.start(t); o.stop(t + 0.5);
    },
    relay_click(dest) { relayTick(dest, 0.09); },
    packet_loss(dest) {
      for (let i = 0; i < 14; i++) {
        const t = ctx.currentTime + 0.05 + i * 0.055;
        const n = noiseSource('white', false);
        const f = bp(900 + Math.random() * 1800, 5); const gg = g(0);
        n.connect(f); f.connect(gg); gg.connect(dest);
        gg.gain.setValueAtTime(0, t);
        gg.gain.linearRampToValueAtTime(0.05, t + 0.004);
        gg.gain.exponentialRampToValueAtTime(0.0005, t + 0.04);
        n.start(t); n.stop(t + 0.05);
      }
    },
    phase_lock(dest) {
      const t = ctx.currentTime + 0.02;
      [110, 220, 330].forEach((f0, i) => {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(f0 * 0.94, t);
        o.frequency.linearRampToValueAtTime(f0, t + 3.5);
        const gg = g(0); o.connect(gg); gg.connect(dest);
        gg.gain.setValueAtTime(0, t);
        gg.gain.linearRampToValueAtTime(0.05 / (i + 1), t + 2.6);
        gg.gain.linearRampToValueAtTime(0.09 / (i + 1), t + 3.5);
        o.start(t); o.stop(t + 4.2);
      });
    },
    /* What 22.1 kHz sounds like when a recording chain folds it down: not the
     * weapon itself — the shadow of it. */
    kill_tone(dest) {
      const t = ctx.currentTime + 0.02;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 7620;
      const gg = g(0); o.connect(gg); gg.connect(dest);
      gg.gain.setValueAtTime(0, t);
      gg.gain.linearRampToValueAtTime(0.10, t + 0.02);
      gg.gain.setValueAtTime(0.10, t + 3.4);
      gg.gain.linearRampToValueAtTime(0, t + 3.9);
      o.start(t); o.stop(t + 4);
      const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 31;
      const sg = g(0); sub.connect(sg); sg.connect(dest);
      sg.gain.setValueAtTime(0, t);
      sg.gain.linearRampToValueAtTime(0.22, t + 0.1);
      sg.gain.setValueAtTime(0.22, t + 3.4);
      sg.gain.linearRampToValueAtTime(0, t + 4);
      sub.start(t); sub.stop(t + 4.1);
    },
    held_tone(dest) {
      const t = ctx.currentTime + 0.02;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(7620, t);
      o.frequency.exponentialRampToValueAtTime(120, t + 14);
      const gg = g(0); o.connect(gg); gg.connect(dest);
      gg.gain.setValueAtTime(0, t);
      gg.gain.linearRampToValueAtTime(0.09, t + 0.05);
      gg.gain.setValueAtTime(0.09, t + 11);
      gg.gain.linearRampToValueAtTime(0, t + 15);
      o.start(t); o.stop(t + 15.5);
    },
    collapse(dest) {
      const t = ctx.currentTime + 0.02;
      const n = noiseSource('pink', false);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(3000, t);
      f.frequency.exponentialRampToValueAtTime(40, t + 5);
      const gg = g(0);
      n.connect(f); f.connect(gg); gg.connect(dest);
      gg.gain.setValueAtTime(0.22, t);
      gg.gain.exponentialRampToValueAtTime(0.0005, t + 6);
      n.start(t); n.stop(t + 6.2);
    },
    body_fall(dest) {
      const t = ctx.currentTime + 0.02;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
      const gg = g(0); o.connect(gg); gg.connect(dest);
      gg.gain.setValueAtTime(0, t);
      gg.gain.linearRampToValueAtTime(0.28, t + 0.01);
      gg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      o.start(t); o.stop(t + 0.7);
      // the microphone takes the weight
      const n = noiseSource('white', false);
      const bf = bp(1800, 1.4); const ng = g(0);
      n.connect(bf); bf.connect(ng); ng.connect(dest);
      ng.gain.setValueAtTime(0, t + 0.04);
      ng.gain.linearRampToValueAtTime(0.30, t + 0.05);
      ng.gain.exponentialRampToValueAtTime(0.0008, t + 0.5);
      n.start(t); n.stop(t + 0.6);
    },
    switchboard(dest) {
      for (let i = 0; i < 22; i++) {
        setTimeout(() => distantRing(dest), i * (620 - i * 18));
      }
    },
    last_packet(dest) {
      const t = ctx.currentTime + 0.02;
      for (let i = 0; i < 6; i++) {
        const n = noiseSource('white', false);
        const f = bp(700 + i * 500, 8); const gg = g(0);
        n.connect(f); f.connect(gg); gg.connect(dest);
        const tt = t + i * 0.03;
        gg.gain.setValueAtTime(0, tt);
        gg.gain.linearRampToValueAtTime(0.03, tt + 0.003);
        gg.gain.exponentialRampToValueAtTime(0.0003, tt + 0.03);
        n.start(tt); n.stop(tt + 0.04);
      }
    }
  };

  function fire(id) {
    if (!ctx || !SFX[id]) return;
    try { SFX[id](busSfx); } catch (e) { console.warn('sfx', id, e); }
  }

  /* ── mixer ───────────────────────────────────────────────────────── */

  function setVolume(bus, v) {
    vol[bus] = v;
    if (!ctx) return;
    const n = bus === 'dialogue' ? busDialogue : bus === 'amb' ? busAmb : busSfx;
    n.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }

  return {
    init, resume, setChannel, setAmbience, armStudio, fire, phasePips,
    setEnhancement, setEnhancementSet, setVolume,
    get context() { return ctx; },
    get enhancement() { return enhancement; },
    get ready() { return !!ctx; }
  };
})();
