/**
 * The score.
 *
 * Nothing here is a sample or a loop — the whole thing is synthesised live from
 * the same numbers that are driving the polygons, so the sound and the picture
 * are two readings of one process rather than two things playing alongside each
 * other.
 *
 *   drone     a slow chord, retuned whenever the choreography changes
 *   filter    opens and closes with how far the ribbon has swung from its axis
 *   bells     sparse plucks on a scale drawn from the current chord; how often
 *             they fire tracks how hard the parameters are moving, and each one
 *             is panned to where the head of the ribbon happens to be
 *   swell     a filtered noise sweep on every transition
 *
 * Browsers will not start audio without a gesture, so nothing is constructed
 * until `enable()` is called from a click or a keypress.
 */

const CHORDS = [
  [0, 7, 12, 19],   // Helix      — open fifths
  [0, 4, 7, 11],    // Rosette    — major 7th
  [0, 3, 7, 10],    // Vortex     — minor 7th
  [0, 5, 7, 12],    // Torus      — suspended 4th
  [0, 3, 6, 10],    // Knot       — half diminished
  [0, 2, 7, 9],     // Ribbon     — sus2 add6
  [0, 4, 7, 14],    // Caduceus   — major add9
  [0, 5, 10, 15],   // Supernova  — quartal
  [0, 7, 14, 21],   // Nebula     — stacked fifths
];

/** Transpositions so consecutive choreographies do not all sit on one root. */
const ROOTS = [0, 5, -2, 3, -4, 7, 2, -5, 0];

const A1 = 55;
const hzOf = (semitones) => A1 * Math.pow(2, semitones / 12);

export class Score {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.volume = 0.55;
    this.chordIndex = 0;
    this.root = 0;
    this._nextNote = 0;
    this._timer = null;
    this._telemetry = { energy: 0, radius: 6, spread: 20, hue: 0, headX: 0 };
    this.supported = typeof window !== 'undefined'
      && !!(window.AudioContext || window.webkitAudioContext);
  }

  // ------------------------------------------------------------- lifecycle --

  async enable() {
    if (!this.supported) return false;
    if (!this.ctx) this._build();
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* user gesture missing */ }
    }
    this.on = true;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(this.volume, t + 1.6);
    if (!this._timer) this._timer = setInterval(() => this._schedule(), 90);
    return true;
  }

  disable() {
    this.on = false;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.0001, t + 0.9);
    clearInterval(this._timer);
    this._timer = null;
  }

  setVolume(v) {
    this.volume = v;
    if (this.ctx && this.on) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15);
    }
  }

  // ----------------------------------------------------------------- graph --

  _build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    // Gentle safety net; the drone plus a flurry of bells can add up.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.006;
    limiter.release.value = 0.28;

    this.master.connect(limiter);
    limiter.connect(ctx.destination);

    // Reverb, from a synthesised impulse response.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(4.2, 2.4);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.42;
    this.reverb.connect(this.wet);
    this.wet.connect(this.master);

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.75;
    this.dry.connect(this.master);

    // --- drone ------------------------------------------------------------
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 500;
    this.droneFilter.Q.value = 3.5;
    this.droneFilter.connect(this.dry);
    this.droneFilter.connect(this.reverb);

    this.voices = [];
    for (let i = 0; i < 4; i++) {
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.22 : 0.13;
      g.connect(this.droneFilter);

      // Two slightly detuned oscillators per voice: the beating between them is
      // what stops the pad sounding like a test tone.
      const pair = [];
      for (let d = 0; d < 2; d++) {
        const o = ctx.createOscillator();
        o.type = i < 2 ? 'sawtooth' : 'triangle';
        o.frequency.value = 110;
        o.detune.value = d === 0 ? -6 : 6;
        o.connect(g);
        o.start();
        pair.push(o);
      }
      this.voices.push({ gain: g, oscs: pair });
    }

    // Very slow breathing on the pad.
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.055;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 180;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.droneFilter.frequency);
    this.lfo.start();

    // --- bells ------------------------------------------------------------
    this.bellBus = ctx.createGain();
    this.bellBus.gain.value = 0.5;
    this.bellBus.connect(this.dry);
    this.bellBus.connect(this.reverb);

    this.noise = this._noise(2);

    this.setChord(0, 0);
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        // Slight pre-delay shaping keeps the tail smooth rather than gated.
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * Math.min(1, t * 40);
      }
    }
    return buf;
  }

  _noise(seconds) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------------------------------------------------------------- events --

  /** Retune to a new chord. Called on every choreography change. */
  setChord(chordIndex, choreoIndex) {
    this.chordIndex = chordIndex % CHORDS.length;
    this.root = ROOTS[choreoIndex % ROOTS.length];
    if (!this.ctx) return;

    const chord = CHORDS[this.chordIndex];
    const t = this.ctx.currentTime;
    this.voices.forEach((v, i) => {
      const semis = this.root + chord[i % chord.length];
      const hz = hzOf(semis);
      // Portamento — the pad slides into the new chord over a couple of bars.
      for (const o of v.oscs) o.frequency.setTargetAtTime(hz, t, 1.1);
    });
  }

  /** A filtered noise sweep, for the moment a transition begins. */
  swell(up = true) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3.2;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 1.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);

    bp.frequency.setValueAtTime(up ? 220 : 2600, t);
    bp.frequency.exponentialRampToValueAtTime(up ? 2800 : 200, t + 3.0);

    src.connect(bp); bp.connect(g);
    g.connect(this.dry); g.connect(this.reverb);
    src.start(t);
    src.stop(t + 3.6);
    src.onended = () => { try { src.disconnect(); bp.disconnect(); g.disconnect(); } catch { /* gone */ } };
  }

  /** Called every frame with the simulation's current state. */
  observe(telemetry) {
    this._telemetry = telemetry;
    if (!this.ctx || !this.on) return;
    // Wider ribbon, brighter pad.
    const open = 260 + Math.min(1, telemetry.radius / 12) * 1500 + telemetry.energy * 700;
    this.droneFilter.frequency.setTargetAtTime(open, this.ctx.currentTime, 0.4);
  }

  // ------------------------------------------------------------- sequencer --

  _schedule() {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const tele = this._telemetry;

    // Pulse rate follows how agitated the parameters are.
    const bpm = 44 + Math.min(1, tele.energy) * 34;
    const step = 60 / bpm / 2; // eighth notes

    if (this._nextNote < now) this._nextNote = now + 0.05;

    while (this._nextNote < now + 0.4) {
      const density = 0.12 + Math.min(1, tele.energy) * 0.5;
      if (Math.random() < density) {
        this._bell(this._nextNote, tele);
      }
      this._nextNote += step;
    }
  }

  _bell(when, tele) {
    const ctx = this.ctx;
    const chord = CHORDS[this.chordIndex];

    // Pitch is drawn from the current chord, octave chosen by hue: the ribbon's
    // colour and the register of the note move together.
    const degree = chord[Math.floor(Math.random() * chord.length)];
    const octave = 2 + Math.floor(tele.hue * 3);
    const semis = this.root + degree + octave * 12;
    const hz = hzOf(semis);

    const osc = ctx.createOscillator();
    osc.type = Math.random() < 0.3 ? 'triangle' : 'sine';
    osc.frequency.value = hz;

    // A quiet partial a twelfth up gives it a struck, glassy edge.
    const partial = ctx.createOscillator();
    partial.type = 'sine';
    partial.frequency.value = hz * 3.01;

    const pGain = ctx.createGain();
    pGain.gain.value = 0.16;
    partial.connect(pGain);

    const env = ctx.createGain();
    const peak = 0.10 + Math.random() * 0.07;
    const decay = 1.4 + Math.random() * 2.2;
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(peak, when + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, when + decay);

    const pan = ctx.createStereoPanner
      ? ctx.createStereoPanner()
      : null;
    if (pan) {
      const spread = Math.max(1, tele.spread);
      pan.pan.value = Math.max(-0.9, Math.min(0.9, (tele.headX / spread) * 1.4));
    }

    osc.connect(env);
    pGain.connect(env);
    const tail = pan ? (env.connect(pan), pan) : env;
    tail.connect(this.bellBus);

    osc.start(when); partial.start(when);
    osc.stop(when + decay + 0.1); partial.stop(when + decay + 0.1);
    osc.onended = () => {
      try {
        osc.disconnect(); partial.disconnect(); pGain.disconnect();
        env.disconnect(); if (pan) pan.disconnect();
      } catch { /* already torn down */ }
    };
  }
}
