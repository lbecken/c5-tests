// moves.js — the eighteen dance steps.
//
// The 1979 original gave you eighteen lettered steps of differing lengths,
// with left/right versions of the same step paired on one line of the manual.
// Same idea here: nine base steps, mirrored where a mirror makes sense, each
// described as sparse keyframes on a beat grid.

import { pose, lerpPose, mirrorPose } from './demon.js';

const kf = (t, p) => ({ t, p: pose(p) });

// A relaxed standing pose that every step starts and ends on, so steps chain
// together without a hitch no matter what order you put them in.
const READY = {
  armL: [0.30, 0.28],
  armR: [-0.30, -0.28],
  legL: [0.14, -0.05, 0],
  legR: [-0.14, 0.05, 0],
  tail: 0.45,
};

const ready = (extra = {}) => ({ ...READY, ...extra });

const BASE = [
  {
    code: 'A', name: 'Step Right', beats: 1, dx: 4, taps: [0.5],
    keys: [
      kf(0, ready()),
      kf(0.35, ready({ x: 1.5, legR: [-0.5, -0.55, 0.45], legL: [0.12, 0.03, 0], lean: 0.06, armL: [0.55, 0.2], armR: [-0.15, -0.4], tail: 0.2 })),
      kf(0.55, ready({ x: 3, legR: [-0.42, -0.05, -0.25], legL: [0.2, 0.05, 0], lean: 0.05, armL: [0.45, 0.25], armR: [-0.2, -0.35] })),
      kf(1, ready({ x: 4, tail: 0.6 })),
    ],
  },
  {
    code: 'C', name: 'Shuffle Right', beats: 2, dx: 3, taps: [0.35, 0.65, 1.35, 1.65],
    keys: [
      kf(0, ready()),
      kf(0.3, ready({ legR: [-0.55, -0.4, 0.5], lean: -0.05, armR: [-0.5, -0.2], armL: [0.2, 0.5], tail: -0.2 })),
      kf(0.55, ready({ x: 1, legR: [0.1, -0.15, -0.4], lean: 0.05, armR: [-0.1, -0.5], armL: [0.5, 0.2], tail: 0.4 })),
      kf(0.8, ready({ x: 1.5, legR: [-0.35, -0.3, 0.35], lean: 0, armR: [-0.35, -0.3], armL: [0.35, 0.3] })),
      kf(1.3, ready({ x: 2, legR: [-0.55, -0.4, 0.5], lean: -0.05, armR: [-0.5, -0.2], armL: [0.2, 0.5], tail: -0.2 })),
      kf(1.55, ready({ x: 2.6, legR: [0.1, -0.15, -0.4], lean: 0.05, armR: [-0.1, -0.5], armL: [0.5, 0.2], tail: 0.4 })),
      kf(2, ready({ x: 3 })),
    ],
  },
  {
    code: 'E', name: 'Stomp Right', beats: 1, dx: 0, taps: [0.55],
    keys: [
      kf(0, ready()),
      kf(0.35, ready({ y: -3, crouch: -0.15, legR: [-0.30, 0.95, -0.5], legL: [0.10, -0.02, 0], armL: [0.9, 0.3], armR: [-0.9, -0.3], head: 0.05, squash: -0.25, tail: 0.4, face: 'wow' })),
      kf(0.55, ready({ crouch: 0.45, legR: [-0.22, 0.06, 0], legL: [0.24, -0.10, 0], armL: [1.1, 0.1], armR: [-1.1, -0.1], squash: 0.5, lean: -0.08, face: 'grin' })),
      kf(0.75, ready({ crouch: 0.12, squash: 0.1 })),
      kf(1, ready()),
    ],
  },
  {
    code: 'G', name: 'Kick Right', beats: 2, dx: 0, taps: [1.6],
    keys: [
      kf(0, ready()),
      kf(0.4, ready({ crouch: 0.3, lean: 0.14, legR: [0.30, -0.5, 0], armL: [0.1, 0.5], armR: [-0.7, -0.2], tail: 0.5 })),
      kf(1.0, ready({ lean: 0.26, legR: [-0.95, 0.12, 0.5], legL: [0.2, -0.06, 0], armL: [-0.2, 0.3], armR: [-1.2, -0.2], head: -0.08, tail: 1.0, face: 'wow' })),
      kf(1.45, ready({ lean: 0.06, legR: [-0.3, 0.2, 0.2], armL: [0.2, 0.35], armR: [-0.6, -0.3] })),
      kf(1.65, ready({ crouch: 0.18, legR: [0.1, -0.05, 0], squash: 0.22 })),
      kf(2, ready()),
    ],
  },
  {
    code: 'I', name: 'Spin Right', beats: 4, dx: 0, taps: [0.5, 1.5, 2.5, 3.5],
    keys: [
      kf(0, ready({ face: 'cool' })),
      kf(0.5, ready({ crouch: 0.35, turn: -0.1, armL: [1.3, 0.1], armR: [-1.3, -0.1], lean: -0.08, face: 'cool' })),
      kf(1.2, ready({ turn: -1.6, y: -3, armL: [1.5, 0.2], armR: [-1.5, -0.2], legR: [-0.3, -0.6, 0.3], squash: -0.15 })),
      kf(2.0, ready({ turn: -Math.PI, y: -4, armL: [1.5, 0.3], armR: [-1.5, -0.3], legR: [-0.4, -0.8, 0.3], legL: [0.15, 0.05, 0], squash: -0.2 })),
      kf(2.8, ready({ turn: -4.7, y: -3, armL: [1.4, 0.2], armR: [-1.4, -0.2], legR: [-0.3, -0.6, 0.3] })),
      kf(3.5, ready({ turn: -2 * Math.PI, crouch: 0.35, armL: [0.9, 0.3], armR: [-0.9, -0.3], squash: 0.3, face: 'wink' })),
      kf(4, ready({ turn: -2 * Math.PI, face: 'grin' })),
    ],
  },
  {
    code: 'M', name: 'Heel & Toe Right', beats: 2, dx: 0, taps: [0.5, 1.5],
    keys: [
      kf(0, ready()),
      kf(0.5, ready({ lean: 0.08, legR: [-0.46, 0.10, 0.62], armR: [-0.55, -0.15], armL: [0.15, 0.45], tail: 0.45 })),
      kf(1.0, ready({ legR: [-0.10, 0.05, 0], armR: [-0.3, -0.3], armL: [0.3, 0.3] })),
      kf(1.5, ready({ lean: -0.06, legR: [0.34, -0.30, -0.80], armR: [-0.1, -0.5], armL: [0.5, 0.1], tail: -0.5 })),
      kf(2, ready()),
    ],
  },
];

const SOLO = [
  {
    code: 'K', name: 'Squat', beats: 2, dx: 0, taps: [1.6],
    keys: [
      kf(0, ready()),
      kf(0.7, ready({ crouch: 1, lean: 0.02, legL: [0.85, -1.70, 0.35], legR: [-0.85, 1.70, -0.35], armL: [1.25, 0.45], armR: [-1.25, -0.45], head: 0.04, face: 'wow', tail: 1.1 })),
      kf(1.3, ready({ crouch: 0.95, legL: [0.80, -1.62, 0.32], legR: [-0.80, 1.62, -0.32], armL: [1.3, 0.4], armR: [-1.3, -0.4], face: 'grin', tail: 0.9 })),
      kf(1.65, ready({ crouch: -0.1, squash: -0.15, armL: [0.2, 0.3], armR: [-0.2, -0.3] })),
      kf(2, ready()),
    ],
  },
  {
    code: 'L', name: 'Hop', beats: 2, dx: 0, taps: [1.5],
    keys: [
      kf(0, ready()),
      kf(0.4, ready({ crouch: 0.65, squash: 0.35, armL: [-0.2, 0.4], armR: [0.2, -0.4], lean: 0.04 })),
      kf(0.9, ready({ y: -14, crouch: -0.2, squash: -0.3, legL: [0.40, -0.80, 0.45], legR: [-0.40, 0.80, -0.45], armL: [1.6, 0.25], armR: [-1.6, -0.25], face: 'wow', tail: -0.6 })),
      kf(1.25, ready({ y: -7, legL: [0.24, -0.34, 0.22], legR: [-0.24, 0.34, -0.22], armL: [1.2, 0.3], armR: [-1.2, -0.3], tail: 0.3 })),
      kf(1.5, ready({ crouch: 0.6, squash: 0.5, armL: [0.5, 0.4], armR: [-0.5, -0.4] })),
      kf(1.75, ready({ crouch: 0.12, squash: 0.1 })),
      kf(2, ready()),
    ],
  },
  {
    code: 'O', name: 'Shimmy', beats: 2, dx: 0, taps: [0.5, 1.0, 1.5],
    keys: [
      kf(0, ready()),
      kf(0.35, ready({ x: -2, lean: -0.14, head: 0.1, armL: [1.5, 0.5], armR: [-0.4, -0.9], tail: -0.8, face: 'wink' })),
      kf(0.75, ready({ x: 2, lean: 0.14, head: -0.1, armL: [0.4, 0.9], armR: [-1.5, -0.5], tail: 0.8 })),
      kf(1.15, ready({ x: -2, lean: -0.14, head: 0.1, armL: [1.5, 0.5], armR: [-0.4, -0.9], tail: -0.8, face: 'wink' })),
      kf(1.55, ready({ x: 2, lean: 0.14, head: -0.1, armL: [0.4, 0.9], armR: [-1.5, -0.5], tail: 0.8 })),
      kf(2, ready()),
    ],
  },
  {
    code: 'P', name: 'Slide Left', beats: 2, dx: -10, taps: [0.25, 1.25],
    keys: [
      kf(0, ready({ face: 'cool' })),
      kf(0.4, ready({ x: -3, crouch: 0.3, lean: 0.16, legL: [0.55, 0.1, -0.35], legR: [-0.25, -0.35, 0.25], armL: [0.9, 0.2], armR: [-0.6, -0.5], face: 'cool' })),
      kf(1.0, ready({ x: -6, crouch: 0.2, lean: 0.14, legL: [0.35, 0.05, -0.2], legR: [-0.4, -0.5, 0.4], armL: [1.0, 0.15], armR: [-0.5, -0.6], face: 'cool' })),
      kf(1.6, ready({ x: -9, crouch: 0.25, lean: 0.12, legL: [0.5, 0.1, -0.3], legR: [-0.2, -0.3, 0.2], armL: [0.8, 0.25], armR: [-0.7, -0.4], face: 'cool' })),
      kf(2, ready({ x: -10 })),
    ],
  },
  {
    code: 'Q', name: 'Take a Bow', beats: 4, dx: 0, taps: [],
    keys: [
      kf(0, ready()),
      kf(0.8, ready({ armL: [1.9, 0.3], armR: [-1.9, -0.3], head: -0.1, lean: -0.05, face: 'wow' })),
      kf(1.8, ready({ lean: 0.95, head: 0.35, crouch: 0.35, armL: [-0.9, -0.4], armR: [-1.5, 0.4], legR: [-0.35, 0.1, 0], tail: -1.3 })),
      kf(2.8, ready({ lean: 0.95, head: 0.3, crouch: 0.35, armL: [-0.8, -0.5], armR: [-1.4, 0.5], legR: [-0.35, 0.1, 0], tail: -1.1 })),
      kf(3.5, ready({ armL: [1.2, 0.3], armR: [-1.2, -0.3], face: 'wink' })),
      kf(4, ready()),
    ],
  },
  {
    code: 'R', name: 'Strike a Pose', beats: 2, dx: 0, taps: [0.45],
    keys: [
      kf(0, ready()),
      kf(0.45, ready({ lean: -0.2, head: 0.12, armL: [-0.45, -0.55], armR: [-2.0, -0.5], legR: [0.45, -0.15, -0.35], legL: [0.05, 0.05, 0], tail: -1.2, face: 'cool' })),
      kf(1.6, ready({ lean: -0.18, head: 0.1, armL: [-0.4, -0.6], armR: [-1.95, -0.45], legR: [0.42, -0.12, -0.32], tail: -1.0, face: 'wink' })),
      kf(2, ready()),
    ],
  },
];

// Mirrored partners, named the way the manual paired them up.
const MIRRORS = {
  A: { code: 'B', name: 'Step Left' },
  C: { code: 'D', name: 'Shuffle Left' },
  E: { code: 'F', name: 'Stomp Left' },
  G: { code: 'H', name: 'Kick Left' },
  I: { code: 'J', name: 'Spin Left' },
  M: { code: 'N', name: 'Heel & Toe Left' },
};

function mirrorMove(m, meta) {
  return {
    code: meta.code,
    name: meta.name,
    beats: m.beats,
    dx: -m.dx,
    taps: m.taps.slice(),
    keys: m.keys.map((k) => ({ t: k.t, p: mirrorPose(k.p) })),
  };
}

const ALL = [];
for (const m of BASE) {
  ALL.push(m);
  if (MIRRORS[m.code]) ALL.push(mirrorMove(m, MIRRORS[m.code]));
}
ALL.push(...SOLO);
ALL.sort((a, b) => a.code.localeCompare(b.code));

export const MOVES = ALL;
export const MOVE_BY_CODE = Object.fromEntries(ALL.map((m) => [m.code, m]));

/** Smoothstep keeps the in-betweens from looking robotic. */
function ease(t) {
  return t * t * (3 - 2 * t);
}

/** Sample a move at local beat time t (0..beats). */
export function sampleMove(move, t) {
  const keys = move.keys;
  if (t <= keys[0].t) return keys[0].p;
  for (let i = 0; i + 1 < keys.length; i++) {
    if (t <= keys[i + 1].t) {
      const a = keys[i];
      const b = keys[i + 1];
      const span = b.t - a.t || 1;
      return lerpPose(a.p, b.p, ease((t - a.t) / span));
    }
  }
  return keys[keys.length - 1].p;
}

/** Total beats for a routine string like "AABCK". */
export function routineBeats(codes) {
  let n = 0;
  for (const c of codes) {
    const m = MOVE_BY_CODE[c];
    if (m) n += m.beats;
  }
  return n;
}

/**
 * Resolve an absolute beat position inside a looping routine.
 * Returns { move, local, anchorDx } where anchorDx is how far the demon has
 * travelled from the start of the current loop.
 */
export function routineAt(codes, beat) {
  const list = codes.split('').map((c) => MOVE_BY_CODE[c]).filter(Boolean);
  if (!list.length) return null;
  const total = list.reduce((n, m) => n + m.beats, 0);
  if (total <= 0) return null;
  const loops = Math.floor(beat / total);
  let t = beat - loops * total;
  let anchor = 0;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (t < m.beats) return { move: m, local: t, anchor, index: i, loops };
    t -= m.beats;
    anchor += m.dx;
  }
  const last = list[list.length - 1];
  return { move: last, local: last.beats, anchor: anchor - last.dx, index: list.length - 1, loops };
}

/** All tap timestamps in absolute beats for the first `beats` of a routine. */
export function routineTaps(codes, beats) {
  const list = codes.split('').map((c) => MOVE_BY_CODE[c]).filter(Boolean);
  const out = [];
  if (!list.length) return out;
  const total = list.reduce((n, m) => n + m.beats, 0);
  let base = 0;
  while (base < beats) {
    for (const m of list) {
      for (const tp of m.taps) {
        const at = base + tp;
        if (at >= 0 && at < beats) out.push(at);
      }
      base += m.beats;
      if (base >= beats) break;
    }
    if (total <= 0) break;
  }
  return out;
}
