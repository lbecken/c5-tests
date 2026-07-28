// audio.js — Web Audio standing in for the TRS-80's cassette-port speaker.
//
// The Model I made sound by toggling the cassette output line, so everything
// it played was a hard square wave with an audible click at each transition.
// A square oscillator with a very fast attack and a touch of drive gets us
// close, and the noise-burst "tap" gives the demon's shoes something to say.

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.75;
    this.noiseBuf = null;
    this.onStateChange = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;

      // Voices land on their own buses so the tune always sits on top of the
      // shoe taps rather than underneath them.
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 1.0;
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.42;

      // A gentle low-pass keeps the square wave from being fatiguing without
      // sanding off its character...
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 6400;
      this.filter.Q.value = 0.8;

      // ...and a soft clipper puts back the overdriven bite the cassette port
      // had, which is also what makes it carry on a laptop speaker.
      this.drive = this.ctx.createWaveShaper();
      const n = 1024;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * 2.1) / Math.tanh(2.1);
      }
      this.drive.curve = curve;
      this.drive.oversample = '2x';

      this.musicBus.connect(this.filter);
      this.sfxBus.connect(this.filter);
      this.filter.connect(this.drive);
      this.drive.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise();
      this.ctx.onstatechange = () => this.onStateChange && this.onStateChange(this.ctx.state);
    }
    if (this.ctx.state !== 'running') {
      this.ctx.resume().then(
        () => this.onStateChange && this.onStateChange(this.ctx.state),
        () => this.onStateChange && this.onStateChange(this.ctx.state),
      );
    }
    return this.ctx;
  }

  makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.25);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master && !this.muted) this.master.gain.value = v;
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get now() {
    return this.ensure().currentTime;
  }

  /** One square-wave note. `dur` in seconds. */
  note(midi, when, dur, gain = 0.40) {
    const ctx = this.ensure();
    when = Math.max(when, ctx.currentTime + 0.001);
    dur = Math.max(0.04, dur);
    const f = 440 * Math.pow(2, (midi - 69) / 12);

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(f, when);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.004);
    g.gain.setValueAtTime(gain, when + Math.min(dur * 0.7, dur - 0.02));
    g.gain.exponentialRampToValueAtTime(0.0008, when + dur);

    osc.connect(g);
    g.connect(this.musicBus);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  /** Shoe tap: a short filtered noise burst. */
  tap(when, bright = 1) {
    const ctx = this.ensure();
    when = Math.max(when, ctx.currentTime + 0.001);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2100 * bright;
    bp.Q.value = 2.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.30, when);
    g.gain.exponentialRampToValueAtTime(0.0006, when + 0.032);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxBus);
    src.start(when);
    src.stop(when + 0.06);
  }

  /** UI blip. */
  blip(midi = 84, dur = 0.05) {
    this.note(midi, this.now, dur, 0.18);
  }

  /** Stop every note currently ringing (used by the editor's Stop button). */
  hush() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(0.0001, t + 0.04);
    this.musicBus.gain.setValueAtTime(1.0, t + 0.30);
  }

  /** Curtain rumble. */
  curtain(when = null, up = true) {
    const ctx = this.ensure();
    when = Math.max(when ?? ctx.currentTime, ctx.currentTime + 0.001);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(up ? 400 : 900, when);
    lp.frequency.linearRampToValueAtTime(up ? 900 : 400, when + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.10, when + 0.2);
    g.gain.linearRampToValueAtTime(0, when + 1.5);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.sfxBus);
    src.start(when);
    src.stop(when + 1.6);
  }

  /** Applause: swelling noise, because he earned it. */
  applause(when = null, dur = 2.6) {
    const ctx = this.ensure();
    when = Math.max(when ?? ctx.currentTime, ctx.currentTime + 0.001);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 1800;
    hp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.16, when + 0.25);
    g.gain.setValueAtTime(0.16, when + dur * 0.5);
    g.gain.linearRampToValueAtTime(0, when + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.sfxBus);
    src.start(when);
    src.stop(when + dur + 0.1);
  }
}

export const REST = -1;
export const HOLD = -2;

/**
 * Turn a flat note list (one entry per count, HOLD extends the previous note)
 * into scheduled events.
 */
export function toEvents(notes) {
  const out = [];
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (n === REST || n === HOLD) continue;
    let len = 1;
    while (i + len < notes.length && notes[i + len] === HOLD) len++;
    out.push({ beat: i, midi: n, beats: len });
  }
  return out;
}

/** Note-name parser for the built-in tunes: "c4 d#4 - . g4". */
const STEP = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
export function parseTune(str) {
  const out = [];
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '-') { out.push(HOLD); continue; }
    if (tok === '.') { out.push(REST); continue; }
    const m = /^([a-g])([#b]?)(\d)$/i.exec(tok);
    if (!m) continue;
    let v = STEP[m[1].toLowerCase()];
    if (m[2] === '#') v++;
    if (m[2] === 'b') v--;
    out.push(12 * (parseInt(m[3], 10) + 1) + v);
  }
  return out;
}

export function noteName(midi) {
  if (midi === REST) return '·';
  if (midi === HOLD) return '—';
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return names[midi % 12] + (Math.floor(midi / 12) - 1);
}
