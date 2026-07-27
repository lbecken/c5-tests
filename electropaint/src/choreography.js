/**
 * Choreographies.
 *
 * Every choreography is a regime for the parameter bank in `wings.js`: it says
 * where each generator is allowed to roam and how restless it is. Because the
 * ribbon is a *delay line* — polygon k sees the parameters as they were k steps
 * ago — a change of regime does not snap. It enters at the head of the ribbon
 * and travels down its length as a visible wave, which is the whole reason the
 * original screensaver felt composed rather than random.
 *
 * Angles are radians; `deltaAngle`, `zDelta`, `spineX` and `spineY` are *per
 * polygon* increments, so they set the shape of the ribbon itself:
 *
 *   deltaAngle  how fast the polygons wind around the ribbon's spine
 *   zDelta      how far the spine advances per polygon (its length)
 *   spineX/Y    how much the spine itself bends per polygon — zero is a
 *               straight column, 2*PI/count closes it into a ring, two
 *               non-zero axes tie it into a knot
 */

const D = Math.PI / 180;
const TAU = Math.PI * 2;

/** Terse generator spec: g(min, max, speed, accel, stability, wrap) */
const g = (min, max, speed, accel, stability, wrap = false) =>
  ({ min, max, speed, accel, stability, wrap });

/**
 * Length-relative spec for `zDelta`: the spine should end up roughly `span`
 * units long however many polygons are in it, so the ribbon keeps its
 * proportions — and stays the same size on screen — when the count changes.
 * `rate` is how many times a second the value could cross its whole range.
 */
const span = (units, spread, rate, stability) =>
  ({ span: units, spread, rate, stability });

/**
 * Length-relative spec for `spineX` / `spineY`: `closure` is how many complete
 * turns the spine makes over the whole ribbon. 1 closes it into a ring.
 */
const closure = (turns, spread, rate, stability) =>
  ({ closure: turns, spread, rate, stability });

/**
 * The neutral regime. Every choreography is this, overridden.
 * Anything a choreography omits keeps drifting the way it already was, which
 * makes the transitions feel like the piece is thinking rather than switching.
 */
export const BASE = {
  radius:     g(3, 11, 1.6, 2.4, 2.4),
  angle:      g(0, TAU, 0.9, 1.2, 2.0, true),
  deltaAngle: g(0.06, 0.34, 0.06, 0.08, 3.4),
  zDelta:     span(30, 0.45, 0.30, 3.0),
  spineX:     g(-0.004, 0.004, 0.004, 0.006, 4.0),
  spineY:     g(-0.004, 0.004, 0.004, 0.006, 4.0),
  roll:       g(0, TAU, 0.9, 1.3, 1.4, true),
  pitch:      g(0, TAU, 0.7, 1.1, 1.8, true),
  yaw:        g(0, TAU, 0.8, 1.2, 1.6, true),
  size:       g(0.85, 1.35, 0.20, 0.30, 3.0),
  hue:        g(0, 1, 0.09, 0.10, 2.6, true),
  hueDelta:   g(-0.0085, 0.0085, 0.0034, 0.0046, 3.2),
  sat:        g(0.86, 1.0, 0.10, 0.14, 3.0),
  light:      g(0.36, 0.52, 0.07, 0.09, 3.0),
};

/**
 * @typedef {object} Choreo
 * @property {string} name
 * @property {string} note      one-line description, shown in the panel tooltip
 * @property {object} bank      generator overrides
 * @property {number} spin      idle rotation of the whole model, rad/s
 * @property {[number,number]} tilt  camera elevation range the drift cam favours
 * @property {number} chord     index into the score's chord table
 */

/** @type {Choreo[]} */
export const CHOREOGRAPHIES = [
  {
    name: 'Helix',
    note: 'The classic column: polygons winding up a straight spine.',
    bank: {
      radius:     g(4, 11, 1.4, 2.0, 2.6),
      deltaAngle: g(0.10, 0.36, 0.05, 0.07, 3.6),
      zDelta:     span(32, 0.40, 0.28, 3.2),
      spineX:     g(-0.002, 0.002, 0.0018, 0.0026, 5.0),
      spineY:     g(-0.002, 0.002, 0.0018, 0.0026, 5.0),
      size:       g(1.0, 1.5, 0.18, 0.26, 3.2),
    },
    spin: 0.09,
    tilt: [-0.35, 0.35],
    chord: 0,
  },

  {
    name: 'Rosette',
    note: 'Spine collapsed to a point; the golden angle fans the polygons into a flower.',
    bank: {
      radius:     g(1.5, 12, 2.2, 3.0, 2.0),
      // 137.5 degrees — phyllotaxis. Drifting either side of it makes the
      // florets swirl in and out of alignment.
      deltaAngle: g(126 * D, 150 * D, 0.10, 0.14, 2.6),
      zDelta:     span(4, 0.95, 0.40, 3.4),
      spineX:     g(-0.001, 0.001, 0.001, 0.0014, 6.0),
      spineY:     g(-0.001, 0.001, 0.001, 0.0014, 6.0),
      // Roll and pitch tilt the polygon's normal; keeping them near zero holds
      // the florets in the plane of the flower. Yaw only spins each one about
      // its own normal, so it can stay wide open for variety.
      roll:       g(-0.42, 0.42, 0.30, 0.40, 2.6),
      pitch:      g(-0.42, 0.42, 0.25, 0.35, 3.0),
      size:       g(0.6, 1.05, 0.16, 0.22, 3.4),
      hueDelta:   g(-0.010, 0.010, 0.004, 0.005, 2.8),
    },
    spin: 0.16,
    tilt: [0.55, 1.25],
    chord: 1,
  },

  {
    name: 'Vortex',
    note: 'Long spine, slow winding, radius pumping hard — a funnel that swallows itself.',
    bank: {
      radius:     g(0.6, 13, 5.0, 7.0, 0.9),
      angle:      g(0, TAU, 2.2, 2.8, 1.1, true),
      deltaAngle: g(0.015, 0.10, 0.04, 0.06, 2.4),
      zDelta:     span(40, 0.35, 0.30, 2.6),
      roll:       g(0, TAU, 1.6, 2.2, 0.9, true),
      size:       g(0.85, 1.35, 0.24, 0.32, 2.4),
      hueDelta:   g(-0.004, 0.004, 0.003, 0.004, 2.4),
    },
    spin: 0.05,
    tilt: [-0.15, 0.55],
    chord: 2,
  },

  {
    name: 'Torus',
    note: 'The spine bends just enough to close on itself: a ring of twisted ribbon.',
    bank: {
      radius:     g(1.2, 4.6, 0.9, 1.2, 3.0),
      deltaAngle: g(0.12, 0.55, 0.09, 0.12, 3.0),
      zDelta:     span(38, 0.14, 0.25, 4.0),
      // 2*PI / count closes the loop; the range straddles it so the ring
      // opens and closes like a mouth instead of sitting perfectly still.
      spineX:     closure(1, 0.30, 0.20, 3.6),
      spineY:     g(-0.0035, 0.0035, 0.0030, 0.0045, 4.2),
      size:       g(0.85, 1.35, 0.16, 0.22, 3.4),
      hueDelta:   g(-0.008, 0.008, 0.003, 0.004, 3.0),
    },
    spin: 0.13,
    tilt: [0.15, 0.95],
    chord: 3,
  },

  {
    name: 'Knot',
    note: 'Two bending axes at odds; the spine ties and unties itself.',
    bank: {
      radius:     g(1.4, 5.5, 1.3, 1.8, 2.6),
      deltaAngle: g(0.08, 0.42, 0.09, 0.12, 3.0),
      zDelta:     span(44, 0.20, 0.26, 3.4),
      spineX:     closure(2, 0.45, 0.30, 3.0),
      spineY:     closure(1, 0.80, 0.35, 2.6),
      size:       g(0.85, 1.3, 0.18, 0.24, 3.0),
    },
    spin: 0.11,
    tilt: [-0.5, 0.7],
    chord: 4,
  },

  {
    name: 'Ribbon',
    note: 'Winding switched off, so the polygons line up edge to edge into one broad band.',
    bank: {
      radius:     g(5, 13, 1.1, 1.6, 3.4),
      deltaAngle: g(-0.02, 0.03, 0.012, 0.016, 4.0),
      zDelta:     span(26, 0.42, 0.28, 3.6),
      spineX:     closure(1, 0.65, 0.30, 3.4),
      spineY:     g(-0.006, 0.006, 0.0045, 0.0065, 3.4),
      roll:       g(0, TAU, 1.5, 2.0, 1.0, true),
      pitch:      g(0, TAU, 0.4, 0.6, 3.0, true),
      size:       g(1.25, 2.0, 0.20, 0.26, 3.4),
      hueDelta:   g(-0.004, 0.004, 0.002, 0.003, 3.6),
    },
    spin: 0.08,
    tilt: [-0.4, 0.6],
    chord: 5,
  },

  {
    name: 'Caduceus',
    note: 'Half a turn per polygon splits the ribbon into two strands chasing each other.',
    bank: {
      radius:     g(4.5, 10.5, 1.5, 2.0, 2.4),
      // Near PI the ribbon alternates side to side; detuning slightly makes the
      // two strands precess around each other.
      deltaAngle: g(168 * D, 192 * D, 0.09, 0.13, 2.4),
      zDelta:     span(32, 0.38, 0.28, 3.0),
      spineX:     g(-0.005, 0.005, 0.004, 0.006, 3.6),
      roll:       g(0, TAU, 1.1, 1.6, 1.2, true),
      size:       g(0.95, 1.45, 0.18, 0.24, 3.0),
      hueDelta:   g(-0.012, 0.012, 0.005, 0.006, 2.4),
    },
    spin: 0.10,
    tilt: [-0.3, 0.45],
    chord: 6,
  },

  {
    name: 'Supernova',
    note: 'Spine barely advances; everything piles into one shell and detonates outward.',
    bank: {
      radius:     g(0.4, 14, 6.5, 9.0, 0.7),
      angle:      g(0, TAU, 1.6, 2.2, 1.2, true),
      deltaAngle: g(0.35, 1.30, 0.22, 0.30, 1.8),
      zDelta:     span(7, 0.9, 0.45, 2.6),
      roll:       g(0, TAU, 2.0, 2.6, 0.8, true),
      pitch:      g(0, TAU, 1.8, 2.4, 0.9, true),
      yaw:        g(0, TAU, 1.9, 2.5, 0.9, true),
      size:       g(0.6, 1.2, 0.30, 0.40, 1.8),
      hue:        g(0, 1, 0.16, 0.20, 1.8, true),
      hueDelta:   g(-0.014, 0.014, 0.007, 0.009, 1.8),
      light:      g(0.40, 0.58, 0.12, 0.16, 2.2),
    },
    spin: 0.22,
    tilt: [-0.6, 0.6],
    chord: 7,
  },

  {
    name: 'Nebula',
    note: 'Everything slowed and enlarged; overlapping faces bleed into a cloud.',
    bank: {
      radius:     g(4, 13, 0.7, 0.9, 4.5),
      deltaAngle: g(0.25, 0.95, 0.05, 0.06, 5.0),
      zDelta:     span(16, 0.55, 0.18, 5.0),
      spineX:     g(-0.005, 0.005, 0.002, 0.003, 5.5),
      spineY:     g(-0.005, 0.005, 0.002, 0.003, 5.5),
      roll:       g(0, TAU, 0.35, 0.5, 4.0, true),
      pitch:      g(0, TAU, 0.3, 0.4, 4.5, true),
      size:       g(1.6, 2.6, 0.12, 0.16, 5.0),
      hue:        g(0, 1, 0.04, 0.05, 5.0, true),
      hueDelta:   g(-0.003, 0.003, 0.0012, 0.0016, 5.0),
      sat:        g(0.62, 0.90, 0.06, 0.08, 5.0),
      light:      g(0.30, 0.44, 0.05, 0.06, 5.0),
    },
    spin: 0.045,
    tilt: [-0.25, 0.5],
    chord: 8,
  },
];

/**
 * Resolve a choreography's bank into concrete generator specs.
 *
 * Specs written as `{ closure, spread, ... }` are relative to the ribbon's
 * length: `closure` is how many times the spine should curl all the way round
 * over `count` polygons, and `spread` how far either side of that it may roam.
 * Writing them this way keeps a Torus a torus when the polygon count changes.
 */
export function resolveBank(choreo, count) {
  const n = Math.max(8, count);
  const merged = { ...BASE, ...(choreo.bank || {}) };
  const out = {};

  for (const [name, spec] of Object.entries(merged)) {
    let centre = null;
    if (spec.closure !== undefined) centre = (TAU * spec.closure) / n;
    else if (spec.span !== undefined) centre = spec.span / n;

    if (centre === null) {
      out[name] = spec;
      continue;
    }

    const half = Math.abs(centre) * spec.spread;
    const speed = half * spec.rate * 2;
    out[name] = {
      min: centre - half,
      max: centre + half,
      speed,
      accel: speed * 1.6,
      stability: spec.stability,
      wrap: false,
    };
  }
  return out;
}

export const byName = (name) =>
  CHOREOGRAPHIES.findIndex((c) => c.name.toLowerCase() === String(name).toLowerCase());
