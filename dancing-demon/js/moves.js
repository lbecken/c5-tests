// moves.js — the eighteen dance steps.
//
// The 1979 original gave you eighteen lettered steps of differing lengths,
// with left/right versions of the same step paired on one line of the manual.
// Same idea here: nine base steps, mirrored where a mirror makes sense.
//
// The steps are real tap vocabulary, and they are written the way a tap step
// actually works rather than as a shape that happens to look busy:
//
//   * A SHUFFLE is a brush out and a spank back with the ball of the foot, and
//     it carries NO weight — he stays planted on the other leg the whole time,
//     which is why `weight` never crosses over during one.
//   * A FLAP is a brush followed by a step onto that foot, so the weight DOES
//     transfer, and that transfer is what makes him travel.
//   * A STOMP puts the whole foot down with the weight behind it.
//
// Each step is written pose-to-pose in the cartoon way: a short ANTICIPATION
// against the direction of travel, a hard snap to the EXTREME on the beat,
// then a settle. The keyframe easings are deliberately abrupt, because the
// rig's springs (see demon.js) supply the cushioning and the overshoot.

import { pose, lerpPose, mirrorPose } from './demon.js';

// Easing curves, chosen per keyframe.
const EASE = {
  lin: (u) => u,
  ease: (u) => u * u * (3 - 2 * u),
  in: (u) => u * u,                    // anticipation: creep, then go
  snap: (u) => 1 - Math.pow(1 - u, 3), // fast out, settle
  pop: (u) => 1 - Math.pow(1 - u, 6),  // almost a step; the spring softens it
  hold: () => 0,                       // stay put until the next key lands
};

const kf = (t, p, e = 'snap') => ({ t, p: pose(p), e });

// A relaxed standing pose. Slightly off-centre on purpose — a dancer at rest
// is never symmetric.
const READY = {
  weight: -0.18,
  armL: [0.30, 0.28],
  armR: [-0.30, -0.28],
  legL: [0.14, -0.05, 0],
  legR: [-0.14, 0.05, 0],
  tail: 0.45,
};

const ready = (extra = {}) => ({ ...READY, ...extra });

const BASE = [
  {
    // Brush the ball of the right foot out, then step down onto it. The weight
    // transfer is what carries him sideways.
    code: 'A', name: 'Flap Right', beats: 1, dx: 5, taps: [0.30, 0.52],
    keys: [
      kf(0, ready({ weight: -0.55, legR: [-0.05, 0.35, -0.15] })),
      kf(0.14, ready({ weight: -0.75, crouch: 0.14, legR: [0.10, 0.30, -0.30], lean: 0.10,
                       armR: [-0.05, -0.50], armL: [0.50, 0.15], hipTilt: -0.08 }), 'in'),
      kf(0.30, ready({ x: 1.5, weight: -0.60, legR: [-0.62, 0.22, 0.50], lean: 0.08, twist: -0.18,
                       armR: [-0.70, -0.15], armL: [0.15, 0.50], head: -0.05 }), 'pop'),
      kf(0.52, ready({ x: 3.6, weight: 0.65, legR: [-0.30, 0.10, 0.05], legL: [0.34, -0.32, 0.18],
                       crouch: 0.16, squash: 0.25, lean: -0.06, twist: 0.12 }), 'pop'),
      kf(0.75, ready({ x: 4.6, weight: 0.55, crouch: 0.04, squash: -0.06, legL: [0.26, -0.16, 0.06] })),
      kf(1, ready({ x: 5, weight: 0.50 })),
    ],
  },
  {
    // Brush out, spank back, twice. No weight change — he is balanced on the
    // left leg for the whole bar.
    code: 'C', name: 'Shuffle Right', beats: 2, dx: 0, taps: [0.28, 0.55, 1.28, 1.55],
    keys: [
      kf(0, ready({ weight: -0.60, legR: [-0.02, 0.30, -0.10] })),
      kf(0.14, ready({ weight: -0.75, legR: [0.16, 0.26, -0.28], lean: 0.08, armR: [-0.08, -0.45] }), 'in'),
      kf(0.28, ready({ weight: -0.70, legR: [-0.64, 0.26, 0.48], twist: -0.20, hipTilt: -0.05,
                       armR: [-0.72, -0.10], armL: [0.20, 0.45], head: -0.04 }), 'pop'),
      kf(0.42, ready({ weight: -0.72, legR: [-0.35, 0.30, 0.20], twist: -0.08 })),
      kf(0.55, ready({ weight: -0.70, legR: [0.34, 0.20, -0.42], twist: 0.14,
                       armR: [0.00, -0.55], armL: [0.55, 0.10], head: 0.04 }), 'pop'),
      kf(0.80, ready({ weight: -0.62, legR: [0.05, 0.30, -0.15] })),
      kf(1.14, ready({ weight: -0.75, legR: [0.16, 0.26, -0.28], lean: 0.08, armR: [-0.08, -0.45] }), 'in'),
      kf(1.28, ready({ weight: -0.70, legR: [-0.64, 0.26, 0.48], twist: -0.20, hipTilt: -0.05,
                       armR: [-0.72, -0.10], armL: [0.20, 0.45], head: -0.04 }), 'pop'),
      kf(1.42, ready({ weight: -0.72, legR: [-0.35, 0.30, 0.20], twist: -0.08 })),
      kf(1.55, ready({ weight: -0.70, legR: [0.34, 0.20, -0.42], twist: 0.14,
                       armR: [0.00, -0.55], armL: [0.55, 0.10], head: 0.04 }), 'pop'),
      kf(2, ready({ weight: -0.55 })),
    ],
  },
  {
    // Knee up, then the whole foot down hard with the weight behind it.
    code: 'E', name: 'Stomp Right', beats: 1, dx: 0, taps: [0.42],
    keys: [
      kf(0, ready({ weight: -0.30 })),
      kf(0.20, ready({ y: -2.5, crouch: -0.18, squash: -0.22, weight: -0.60, hipTilt: -0.10, lean: 0.06,
                       legR: [-0.16, 0.95, -0.55], armL: [1.00, 0.35], armR: [-1.00, -0.35],
                       head: 0.06, face: 'wow' }), 'in'),
      kf(0.42, ready({ crouch: 0.50, squash: 0.55, weight: 0.70, hipTilt: 0.14, lean: -0.08,
                       legR: [-0.16, 0.12, 0], legL: [0.30, -0.12, 0],
                       armL: [1.30, 0.05], armR: [-1.30, -0.05], head: -0.05 }), 'pop'),
      kf(0.62, ready({ crouch: 0.12, squash: -0.12, weight: 0.50 })),
      kf(1, ready({ weight: 0.35 })),
    ],
  },
  {
    // A brush that keeps going — the leg swings up and the torso counters.
    code: 'G', name: 'Brush Kick Right', beats: 2, dx: 0, taps: [0.50, 1.62],
    keys: [
      kf(0, ready({ weight: -0.35 })),
      kf(0.28, ready({ crouch: 0.34, weight: -0.80, hipTilt: -0.12, lean: 0.14, twist: 0.20,
                       legR: [0.24, 0.34, -0.25], armR: [-0.05, -0.55], armL: [0.45, 0.20],
                       head: 0.08 }), 'in'),
      kf(0.50, ready({ crouch: 0.15, weight: -0.85, legR: [-0.55, 0.30, 0.45], twist: -0.10,
                       lean: 0.22, armR: [-0.90, -0.30], armL: [0.10, 0.40] }), 'pop'),
      kf(0.92, ready({ y: -1, crouch: -0.05, weight: -0.90, legR: [-1.15, 0.18, 0.55], lean: 0.34,
                       head: -0.14, twist: -0.28, tail: 1.10, armL: [-0.30, 0.35],
                       armR: [-1.35, -0.25], face: 'wow' }), 'pop'),
      kf(1.25, ready({ weight: -0.88, legR: [-1.05, 0.22, 0.50], lean: 0.30, tail: 1.0,
                       armL: [-0.25, 0.35], armR: [-1.30, -0.25], face: 'wow' }), 'lin'),
      kf(1.62, ready({ crouch: 0.34, squash: 0.40, weight: 0.35, legR: [-0.20, 0.16, 0], lean: -0.05,
                       armL: [0.40, 0.30], armR: [-0.40, -0.30] }), 'pop'),
      kf(1.85, ready({ crouch: 0.08, squash: -0.08, weight: 0.20 })),
      kf(2, ready({ weight: 0.10 })),
    ],
  },
  {
    // Wind up the wrong way, then whip round. The arms pull in to spin and
    // open out to stop — the same trick a skater uses.
    code: 'I', name: 'Spin Right', beats: 4, dx: 0, taps: [0.55, 1.5, 2.5, 3.55],
    keys: [
      kf(0, ready({ face: 'cool' })),
      kf(0.50, ready({ turn: 0.40, crouch: 0.35, weight: -0.50, twist: 0.45, lean: 0.10,
                       armL: [-0.15, 0.90], armR: [-1.35, -0.35], face: 'cool' }), 'in'),
      kf(0.85, ready({ turn: -0.90, y: -3, crouch: -0.10, squash: -0.18, twist: -0.30,
                       legR: [-0.25, 0.75, -0.35], armL: [0.55, 1.25], armR: [-0.55, -1.25] }), 'pop'),
      kf(1.60, ready({ turn: -2.6, y: -5, squash: -0.22, legR: [-0.22, 0.85, -0.40],
                       armL: [0.45, 1.35], armR: [-0.45, -1.35] }), 'lin'),
      kf(2.40, ready({ turn: -4.3, y: -5, squash: -0.22, legR: [-0.22, 0.85, -0.40],
                       armL: [0.45, 1.35], armR: [-0.45, -1.35] }), 'lin'),
      kf(3.05, ready({ turn: -5.6, y: -3, legR: [-0.24, 0.55, -0.25],
                       armL: [1.20, 0.50], armR: [-1.20, -0.50] }), 'lin'),
      kf(3.55, ready({ turn: -2 * Math.PI, crouch: 0.45, squash: 0.45, weight: -0.20,
                       armL: [1.40, 0.25], armR: [-1.40, -0.25], face: 'wink' }), 'pop'),
      kf(3.80, ready({ turn: -2 * Math.PI, crouch: 0.10, squash: -0.10 })),
      kf(4, ready({ turn: -2 * Math.PI })),
    ],
  },
  {
    // Heel dug out in front with the toe up, then the toe tapped in behind.
    code: 'M', name: 'Heel & Toe Right', beats: 2, dx: 0, taps: [0.42, 1.42],
    keys: [
      kf(0, ready({ weight: -0.55 })),
      kf(0.22, ready({ weight: -0.75, legR: [-0.10, 0.34, -0.20], lean: 0.08 }), 'in'),
      kf(0.42, ready({ weight: -0.72, legR: [-0.50, 0.16, 0.72], lean: 0.12, twist: -0.16,
                       hipTilt: -0.08, armR: [-0.65, -0.15], armL: [0.25, 0.45], head: -0.05 }), 'pop'),
      kf(0.72, ready({ weight: -0.70, legR: [-0.25, 0.28, 0.20], twist: -0.06 })),
      kf(0.98, ready({ weight: -0.62, legR: [0.00, 0.32, -0.10] })),
      kf(1.22, ready({ weight: -0.75, legR: [0.12, 0.30, -0.30], lean: -0.02 }), 'in'),
      kf(1.42, ready({ weight: -0.72, legR: [0.42, 0.22, -0.82], lean: -0.05, twist: 0.18,
                       armR: [0.05, -0.60], armL: [0.60, 0.10], head: 0.05 }), 'pop'),
      kf(1.75, ready({ weight: -0.60, legR: [0.05, 0.30, -0.10] })),
      kf(2, ready({ weight: -0.50 })),
    ],
  },
];

const SOLO = [
  {
    code: 'K', name: 'Squat', beats: 2, dx: 0, taps: [1.5],
    keys: [
      kf(0, ready()),
      kf(0.18, ready({ y: -2, crouch: -0.18, squash: -0.18,
                       armL: [0.05, 0.40], armR: [-0.05, -0.40], face: 'wow' }), 'in'),
      kf(0.50, ready({ crouch: 1.0, squash: 0.32, head: 0.05, lean: 0.03, tail: 1.10,
                       legL: [0.88, -1.72, 0.34], legR: [-0.88, 1.72, -0.34],
                       armL: [1.25, 0.50], armR: [-1.25, -0.50] }), 'pop'),
      kf(0.98, ready({ crouch: 0.96, tail: 0.85, legL: [0.84, -1.66, 0.32], legR: [-0.84, 1.66, -0.32],
                       armL: [1.30, 0.45], armR: [-1.30, -0.45] }), 'lin'),
      kf(1.30, ready({ crouch: -0.22, y: -3, squash: -0.32,
                       armL: [1.50, 0.20], armR: [-1.50, -0.20], face: 'wow' }), 'pop'),
      kf(1.50, ready({ crouch: 0.30, squash: 0.42, armL: [0.35, 0.35], armR: [-0.35, -0.35] }), 'pop'),
      kf(1.75, ready({ crouch: 0.06, squash: -0.10 })),
      kf(2, ready()),
    ],
  },
  {
    code: 'L', name: 'Hop', beats: 2, dx: 0, taps: [1.32],
    keys: [
      kf(0, ready()),
      kf(0.28, ready({ crouch: 0.72, squash: 0.42, lean: 0.03, head: 0.06,
                       armL: [-0.25, 0.42], armR: [0.25, -0.42] }), 'in'),
      kf(0.52, ready({ y: -6, crouch: -0.22, squash: -0.34, legL: [0.30, -0.50, 0.30],
                       legR: [-0.30, 0.50, -0.30], armL: [1.15, 0.50], armR: [-1.15, -0.50] }), 'pop'),
      kf(0.85, ready({ y: -15, squash: -0.25, tail: -0.70, legL: [0.42, -0.85, 0.50],
                       legR: [-0.42, 0.85, -0.50], armL: [1.65, 0.30], armR: [-1.65, -0.30],
                       face: 'wow' }), 'ease'),
      kf(1.12, ready({ y: -7, tail: 0.40, legL: [0.22, -0.32, 0.20], legR: [-0.22, 0.32, -0.20],
                       armL: [1.15, 0.35], armR: [-1.15, -0.35] }), 'ease'),
      kf(1.32, ready({ crouch: 0.68, squash: 0.55, armL: [0.45, 0.45], armR: [-0.45, -0.45] }), 'pop'),
      kf(1.58, ready({ crouch: 0.12, squash: -0.12 })),
      kf(2, ready()),
    ],
  },
  {
    // Pure isolation: shoulders swing one way, hips the other, and the head
    // tries to stay put. This is the step the `twist` channel exists for.
    code: 'O', name: 'Shimmy', beats: 2, dx: 0, taps: [0.5, 1.0, 1.5],
    keys: [
      kf(0, ready()),
      kf(0.25, ready({ x: -1.5, twist: 0.60, shTilt: 0.20, hipTilt: -0.14, weight: -0.50, lean: -0.06,
                       armL: [1.45, 0.55], armR: [-0.35, -0.95], head: 0.06, face: 'wink' }), 'pop'),
      kf(0.62, ready({ x: 1.5, twist: -0.60, shTilt: -0.20, hipTilt: 0.14, weight: 0.50, lean: 0.06,
                       armL: [0.35, 0.95], armR: [-1.45, -0.55], head: -0.06 }), 'pop'),
      kf(1.00, ready({ x: -1.5, twist: 0.60, shTilt: 0.20, hipTilt: -0.14, weight: -0.50, lean: -0.06,
                       armL: [1.45, 0.55], armR: [-0.35, -0.95], head: 0.06, face: 'wink' }), 'pop'),
      kf(1.38, ready({ x: 1.5, twist: -0.60, shTilt: -0.20, hipTilt: 0.14, weight: 0.50, lean: 0.06,
                       armL: [0.35, 0.95], armR: [-1.45, -0.55], head: -0.06 }), 'pop'),
      kf(1.72, ready({ x: -0.8, twist: 0.35, weight: -0.30 }), 'pop'),
      kf(2, ready()),
    ],
  },
  {
    // Lead foot slides flat, trailing foot rides up on the toe.
    code: 'P', name: 'Slide Left', beats: 2, dx: -11, taps: [0.22, 1.20],
    keys: [
      kf(0, ready({ weight: 0.20, face: 'cool' })),
      kf(0.22, ready({ x: -1.5, crouch: 0.28, weight: -0.35, lean: 0.16, twist: 0.20, head: -0.06,
                       legL: [0.42, 0.12, -0.28], legR: [-0.30, 0.55, -0.55],
                       armL: [0.85, 0.25], armR: [-0.55, -0.55], face: 'cool' }), 'pop'),
      kf(0.75, ready({ x: -5, crouch: 0.20, weight: -0.50, lean: 0.14, twist: 0.10,
                       legL: [0.30, 0.08, -0.15], legR: [-0.42, 0.62, -0.62],
                       armL: [0.85, 0.25], armR: [-0.55, -0.55], face: 'cool' }), 'lin'),
      kf(1.20, ready({ x: -8, crouch: 0.28, weight: -0.30, lean: 0.16, twist: 0.12,
                       legL: [0.45, 0.14, -0.30], legR: [-0.25, 0.45, -0.45],
                       armL: [0.85, 0.25], armR: [-0.55, -0.55], face: 'cool' }), 'pop'),
      kf(1.70, ready({ x: -10.4, crouch: 0.18, weight: -0.45, lean: 0.12,
                       legL: [0.28, 0.06, -0.12], legR: [-0.38, 0.55, -0.55], face: 'cool' }), 'lin'),
      kf(2, ready({ x: -11, weight: -0.20, face: 'cool' })),
    ],
  },
  {
    code: 'Q', name: 'Take a Bow', beats: 4, dx: 0, taps: [],
    keys: [
      kf(0, ready()),
      kf(0.55, ready({ y: -1, crouch: -0.08, lean: -0.06, head: -0.14,
                       armL: [1.85, 0.35], armR: [-1.85, -0.35], face: 'wow' }), 'pop'),
      kf(1.10, ready({ armL: [1.60, 0.40], armR: [-1.60, -0.40], head: -0.10, face: 'wow' })),
      kf(1.55, ready({ lean: 1.00, head: 0.42, crouch: 0.40, weight: -0.20, tail: -1.40,
                       legR: [-0.34, 0.20, 0], armL: [-0.85, -0.45], armR: [-1.45, 0.45] }), 'pop'),
      kf(2.45, ready({ lean: 0.96, head: 0.36, crouch: 0.38, weight: -0.15, tail: -1.20,
                       legR: [-0.34, 0.20, 0], armL: [-0.75, -0.50], armR: [-1.35, 0.50] }), 'lin'),
      kf(3.00, ready({ lean: -0.10, head: -0.10, crouch: -0.05, tail: 0.60,
                       armL: [1.30, 0.30], armR: [-1.30, -0.30], face: 'wink' }), 'pop'),
      kf(3.45, ready({ lean: 0.02, armL: [0.90, 0.35], armR: [-0.90, -0.35], face: 'wink' })),
      kf(4, ready()),
    ],
  },
  {
    // Hit it, hold it — but a held pose still breathes, so the hold drifts.
    code: 'R', name: 'Strike a Pose', beats: 2, dx: 0, taps: [0.42],
    keys: [
      kf(0, ready()),
      kf(0.22, ready({ crouch: 0.30, weight: 0.10, lean: -0.05,
                       armL: [0.05, 0.50], armR: [-0.05, -0.50] }), 'in'),
      kf(0.42, ready({ weight: 0.85, hipTilt: 0.18, shTilt: -0.12, twist: -0.25, lean: -0.22,
                       head: 0.14, crouch: 0.05, tail: -1.25, legR: [-0.30, 0.12, 0],
                       legL: [0.50, -0.35, 0.20], armL: [-0.50, -0.60], armR: [-2.05, -0.50],
                       face: 'cool' }), 'pop'),
      kf(1.15, ready({ weight: 0.80, hipTilt: 0.16, shTilt: -0.10, twist: -0.20, lean: -0.19,
                       head: 0.10, crouch: 0.05, tail: -1.10, legR: [-0.30, 0.12, 0],
                       legL: [0.50, -0.35, 0.20], armL: [-0.42, -0.66], armR: [-1.95, -0.42],
                       face: 'cool' }), 'ease'),
      kf(1.55, ready({ weight: -0.50, hipTilt: -0.15, twist: 0.22, lean: 0.16, head: -0.10,
                       tail: 1.10, legL: [0.30, 0.12, 0], legR: [-0.50, 0.35, -0.20],
                       armL: [-2.00, 0.50], armR: [-0.50, 0.60], face: 'wink' }), 'pop'),
      kf(2, ready()),
    ],
  },
];

// Mirrored partners, named the way the manual paired them up.
const MIRRORS = {
  A: { code: 'B', name: 'Flap Left' },
  C: { code: 'D', name: 'Shuffle Left' },
  E: { code: 'F', name: 'Stomp Left' },
  G: { code: 'H', name: 'Brush Kick Left' },
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
    keys: m.keys.map((k) => ({ t: k.t, p: mirrorPose(k.p), e: k.e })),
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

/** Sample a move at local beat time t (0..beats). */
export function sampleMove(move, t) {
  const keys = move.keys;
  if (t <= keys[0].t) return keys[0].p;
  for (let i = 0; i + 1 < keys.length; i++) {
    if (t <= keys[i + 1].t) {
      const a = keys[i];
      const b = keys[i + 1];
      const span = b.t - a.t || 1;
      const ease = EASE[b.e] || EASE.snap;
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
 * Returns { move, local, anchor, index, loops } where anchor is how far the
 * demon has travelled since the start of the current loop.
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

/** Every tap timestamp, in absolute beats, for one pass of a routine. */
export function routineTapOffsets(codes) {
  const list = codes.split('').map((c) => MOVE_BY_CODE[c]).filter(Boolean);
  const out = [];
  let base = 0;
  for (const m of list) {
    for (const tp of m.taps) out.push(base + tp);
    base += m.beats;
  }
  return out;
}
