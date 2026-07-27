/**
 * Smoothly wandering random parameters.
 *
 * This is the heart of ElectroPaint. The original SGI screensaver (and Kent
 * Rosenkoetter's well known clone of it) drives every visual quantity through a
 * generator that never jumps: it holds a *velocity*, nudges that velocity with a
 * random acceleration every so often, and clamps the result into a range. The
 * output is therefore C1-continuous — which is exactly why the thing looks
 * choreographed rather than noisy.
 *
 * Two things are added here beyond the classic version:
 *
 *   1. Bounds are re-targetable. A choreography can slide a generator's range
 *      (and its temperament) over a few seconds, so switching choreographies is
 *      a glide, never a cut.
 *   2. Everything is expressed per second rather than per frame, so the motion
 *      is identical at 30, 60 or 144 Hz.
 */

const lerp = (a, b, t) => a + (b - a) * t;

/** Fields a choreography may specify for a generator. */
const SHAPE = ['min', 'max', 'speed', 'accel', 'stability'];

export class Smooth {
  /**
   * @param {object} cfg
   * @param {number} cfg.min        lower bound of the output
   * @param {number} cfg.max        upper bound of the output
   * @param {number} cfg.speed      maximum rate of change, units/second
   * @param {number} cfg.accel      maximum change of that rate, units/second^2
   * @param {number} cfg.stability  seconds between fresh random accelerations
   * @param {boolean} [cfg.wrap]    wrap around the range instead of clamping
   *                                (for angles and hues)
   */
  constructor(cfg) {
    this.wrap = !!cfg.wrap;
    this.cur = {};
    this.from = {};
    this.target = {};
    for (const k of SHAPE) {
      this.cur[k] = cfg[k];
      this.from[k] = cfg[k];
      this.target[k] = cfg[k];
    }
    this.blend = 1; // 1 == fully settled on target
    this.blendRate = 1;

    this.value = lerp(cfg.min, cfg.max, Math.random());
    this.velocity = 0;
    this.accel = 0;
    this.timer = Math.random() * cfg.stability;
  }

  /** Slide toward a new configuration over `seconds`. */
  retarget(cfg, seconds = 4) {
    for (const k of SHAPE) {
      this.from[k] = this.cur[k];
      if (cfg[k] !== undefined) this.target[k] = cfg[k];
    }
    if (cfg.wrap !== undefined) this.wrap = !!cfg.wrap;
    this.blend = 0;
    this.blendRate = 1 / Math.max(0.001, seconds);
  }

  /** Snap immediately to a configuration (used on reseed). */
  apply(cfg) {
    this.retarget(cfg, 0.001);
    this.blend = 1;
    for (const k of SHAPE) this.cur[k] = this.from[k] = this.target[k];
    this.value = Math.min(this.cur.max, Math.max(this.cur.min, this.value));
  }

  step(dt) {
    // Ease the live configuration toward whatever the choreography asked for.
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt * this.blendRate);
      // smoothstep so the parameter sweep itself has no visible corner
      const t = this.blend * this.blend * (3 - 2 * this.blend);
      for (const k of SHAPE) this.cur[k] = lerp(this.from[k], this.target[k], t);
    }

    const c = this.cur;

    this.timer += dt;
    if (this.timer >= c.stability) {
      this.timer = 0;
      this.accel = (Math.random() * 2 - 1) * c.accel;
    }

    this.velocity += this.accel * dt;
    if (this.velocity > c.speed) this.velocity = c.speed;
    else if (this.velocity < -c.speed) this.velocity = -c.speed;

    this.value += this.velocity * dt;

    const span = c.max - c.min;
    if (span <= 0) {
      this.value = c.min;
      return this.value;
    }

    if (this.wrap) {
      this.value = ((((this.value - c.min) % span) + span) % span) + c.min;
    } else if (this.value > c.max) {
      this.value = c.max;
      // Bleed off the velocity at a wall instead of pinning against it; the
      // parameter then drifts back rather than sticking to the extreme.
      this.velocity = -Math.abs(this.velocity) * 0.35;
      this.accel = -Math.abs(this.accel);
    } else if (this.value < c.min) {
      this.value = c.min;
      this.velocity = Math.abs(this.velocity) * 0.35;
      this.accel = Math.abs(this.accel);
    }

    return this.value;
  }
}

/**
 * A named bank of Smooth generators, stepped together.
 * `bank.values` is a plain object refreshed on every step, cheap to read.
 */
export class Bank {
  constructor(defs) {
    this.gens = {};
    this.values = {};
    for (const [name, cfg] of Object.entries(defs)) {
      this.gens[name] = new Smooth(cfg);
      this.values[name] = this.gens[name].value;
    }
  }

  retarget(defs, seconds) {
    for (const [name, cfg] of Object.entries(defs)) {
      const g = this.gens[name];
      if (g) g.retarget(cfg, seconds);
    }
  }

  reseed(defs) {
    for (const [name, cfg] of Object.entries(defs)) {
      const g = this.gens[name];
      if (!g) continue;
      g.apply(cfg);
      g.value = cfg.min + (cfg.max - cfg.min) * Math.random();
      g.velocity = 0;
    }
  }

  step(dt) {
    for (const name in this.gens) {
      this.values[name] = this.gens[name].step(dt);
    }
    return this.values;
  }
}
