// demon.js — the star of the show.
//
// Rather than a fixed sprite sheet, the demon is a small skeleton posed from
// interpolated keyframes and rasterised into the pixel buffer as tapered
// capsules. That buys us fluid in-between frames (the thing Christopherson's
// original was famous for) and secondary motion on the tail and ears, from a
// budget of a few hundred lines.
//
// Angle convention: every joint angle is measured from "straight down" (or
// "straight up" for the torso and head), and a POSITIVE angle rotates towards
// screen-left. `legL`/`armL` hang off the screen-left side of the body, so
// their resting angles are positive — i.e. splayed outwards — and the mirror
// operation is a plain negate-and-swap.

import { C } from './pixels.js';

// Every shape gets a dark ink edge, so overlapping limbs stay legible.
const INK = C.PUPIL;

// Proportions, in framebuffer pixels, measured from the soles of the shoes.
const P = {
  hipHeight: 32,
  torso: 17,
  neck: 3,
  headR: 8.5,
  upperArm: 11,
  foreArm: 10,
  thigh: 15,
  shin: 15,
  foot: 8,
};

// Positive angle => screen-left.
const sn = (a) => -Math.sin(a);
const cs = (a) => Math.cos(a);

export function neutralPose() {
  return {
    x: 0,           // horizontal offset from the anchor
    y: 0,           // vertical offset (negative = airborne)
    crouch: 0,      // 0..1, lowers the hips
    lean: 0,        // torso lean, + = towards screen-left
    turn: 0,        // rotation about the body's vertical axis, radians
    head: 0,        // head tilt
    armL: [0.30, 0.28],   // [shoulder, elbow]
    armR: [-0.30, -0.28],
    legL: [0.14, -0.05, 0],   // [hip, knee, ankle]
    legR: [-0.14, 0.05, 0],
    tail: 0.5,      // tail base angle
    face: 'grin',
    squash: 0,      // + = squashed by a landing, - = stretched in the air
  };
}

const NUM_KEYS = ['x', 'y', 'crouch', 'lean', 'turn', 'head', 'tail', 'squash'];
const ARM_KEYS = ['armL', 'armR'];
const LEG_KEYS = ['legL', 'legR'];

export function lerpPose(a, b, t) {
  const o = {};
  for (const k of NUM_KEYS) o[k] = a[k] + (b[k] - a[k]) * t;
  for (const k of ARM_KEYS) o[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t];
  for (const k of LEG_KEYS) {
    o[k] = [
      a[k][0] + (b[k][0] - a[k][0]) * t,
      a[k][1] + (b[k][1] - a[k][1]) * t,
      a[k][2] + (b[k][2] - a[k][2]) * t,
    ];
  }
  o.face = t < 0.5 ? a.face : b.face;
  return o;
}

/** Mirror a pose left<->right. */
export function mirrorPose(p) {
  const o = { ...p };
  o.x = -p.x;
  o.lean = -p.lean;
  o.turn = -p.turn;
  o.head = -p.head;
  o.tail = -p.tail;
  o.armL = [-p.armR[0], -p.armR[1]];
  o.armR = [-p.armL[0], -p.armL[1]];
  o.legL = [-p.legR[0], -p.legR[1], -p.legR[2]];
  o.legR = [-p.legL[0], -p.legL[1], -p.legL[2]];
  return o;
}

/** Merge a sparse keyframe over the neutral pose. */
export function pose(partial) {
  return { ...neutralPose(), ...partial };
}

// ---------------------------------------------------------------------------
// Secondary motion: the tail and ears lag behind the body, which is most of
// what makes the little guy feel alive.
// ---------------------------------------------------------------------------
export class Wobble {
  constructor(n, stiffness, damping) {
    this.a = new Float32Array(n);
    this.v = new Float32Array(n);
    this.k = stiffness;
    this.d = damping;
  }

  update(dt, target) {
    for (let i = 0; i < this.a.length; i++) {
      const goal = i === 0 ? target : this.a[i - 1];
      this.v[i] += (goal - this.a[i]) * this.k * dt;
      this.v[i] *= Math.exp(-this.d * dt);
      this.a[i] += this.v[i] * dt;
    }
  }
}

export class Demon {
  constructor() {
    this.tail = new Wobble(7, 110, 8);
    this.ear = new Wobble(2, 130, 9);
    this.blink = 0;
    this.blinkTimer = 1 + Math.random() * 3;
    this.prevX = 0;
    this.sway = 0;
  }

  update(dt, p) {
    this.tail.update(dt, p.tail);
    this.ear.update(dt, p.lean * 1.1 + p.head * 0.7);
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 0.14;
      this.blinkTimer = 1.6 + Math.random() * 3.4;
    }
    if (this.blink > 0) this.blink -= dt;
    const vx = (p.x - this.prevX) / Math.max(dt, 1e-4);
    this.prevX = p.x;
    this.sway += (Math.max(-1, Math.min(1, vx / 70)) - this.sway) * Math.min(1, dt * 8);
  }

  /** Draw the demon standing on the floor line `ay`, centred on `ax`. */
  draw(scr, p, ax, ay, scale = 1) {
    const s = scale;
    const face = Math.cos(p.turn);      // +1 facing us, -1 back to us
    const side = Math.sin(p.turn);
    const wide = Math.abs(face);        // body flattens as he turns
    const facingUs = face > -0.02;

    const vScale = 1 - p.squash * 0.16;
    const hScale = 1 + p.squash * 0.14;

    const bx = ax + p.x * s;
    const groundY = ay + p.y * s;
    const hipY = groundY - (P.hipHeight - p.crouch * 12) * vScale * s;
    const hipX = bx + this.sway * 1.4 * s;

    const torsoLen = P.torso * vScale * s;
    const ta = p.lean;
    const shX = hipX + sn(ta) * torsoLen;
    const shY = hipY - cs(ta) * torsoLen;

    const headA = ta + p.head;
    const headDist = P.neck * s + P.headR * s * 0.8;
    const hx = shX + sn(headA) * headDist;
    const hy = shY - cs(headA) * headDist;

    const shoulderSpread = 10.5 * (0.3 + 0.7 * wide) * hScale * s;
    const hipSpread = 11 * (0.3 + 0.7 * wide) * hScale * s;
    const shLx = shX - shoulderSpread * 0.5;
    const shRx = shX + shoulderSpread * 0.5;
    const hipLx = hipX - hipSpread * 0.5;
    const hipRx = hipX + hipSpread * 0.5;

    // Forward kinematics for each leg, then an IK pass that plants the foot
    // on the boards whenever he is meant to be standing on them.
    const grounded = p.y > -2;
    const l1 = P.thigh * s;
    const l2 = P.shin * s;
    const solveLeg = (anchorX, [hipA, kneeA, ankleA]) => {
      const a1 = ta * 0.25 + hipA;
      let kx = anchorX + sn(a1) * l1;
      let ky = hipY + cs(a1) * l1;
      const a2 = a1 + kneeA;
      let fx = kx + sn(a2) * l2;
      let fy = ky + cs(a2) * l2;
      if (grounded && fy > ay) {
        const bend = Math.sign((kx - anchorX) * (fy - ky) - (ky - hipY) * (fx - kx)) || 1;
        const dx = fx - anchorX;
        const dy = ay - hipY;
        let d = Math.hypot(dx, dy);
        d = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(l1 + l2 - 0.01, d));
        const base = Math.atan2(dy, dx);
        const cosA = (d * d + l1 * l1 - l2 * l2) / (2 * d * l1);
        const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
        const ka = base - bend * alpha;
        kx = anchorX + Math.cos(ka) * l1;
        ky = hipY + Math.sin(ka) * l1;
        fx = anchorX + Math.cos(base) * d;
        fy = hipY + Math.sin(base) * d;
      }
      return { kx, ky, fx, fy, ankle: ankleA + kneeA * 0.15 };
    };

    // Depth ordering: when he turns his back the limbs swap over.
    const nearIsRight = side <= 0;
    const legFar = nearIsRight
      ? { k: solveLeg(hipLx, p.legL), sg: -1 }
      : { k: solveLeg(hipRx, p.legR), sg: 1 };
    const legNear = nearIsRight
      ? { k: solveLeg(hipRx, p.legR), sg: 1 }
      : { k: solveLeg(hipLx, p.legL), sg: -1 };
    const armFar = nearIsRight ? { a: p.armL, x: shLx } : { a: p.armR, x: shRx };
    const armNear = nearIsRight ? { a: p.armR, x: shRx } : { a: p.armL, x: shLx };

    // Shadow, tightening as he lands.
    const air = Math.max(0, -p.y);
    const shR = (11 - air * 0.28) * s;
    if (shR > 1.5) scr.ellipse(bx, ay + 1, shR, Math.max(1, 2 * s), C.FLOOR_D);

    this.drawTail(scr, hipX - side * 4 * s, hipY + 1 * s, s, side, wide);

    this.drawLeg(scr, hipX, hipY, legFar.k, s, C.SKIN_D, INK, wide, legFar.sg, true);
    this.drawArm(scr, armFar.x, shY + 1.5 * s, armFar.a, s, ta, C.SKIN_D, INK);

    this.drawTorso(scr, hipX, hipY, shX, shY, s, wide, hScale);

    this.drawLeg(scr, hipX, hipY, legNear.k, s, C.SKIN, INK, wide, legNear.sg, false);
    this.drawHead(scr, hx, hy, headA, s, face, wide, facingUs, p.face);
    this.drawArm(scr, armNear.x, shY + 1.5 * s, armNear.a, s, ta, C.SKIN, INK);
  }

  drawTorso(scr, hipX, hipY, shX, shY, s, wide, hScale) {
    const narrow = 0.35 + 0.65 * wide;
    const wHip = 4.9 * narrow * hScale * s;
    const wChest = 7.2 * narrow * hScale * s;
    const mx = (hipX + shX) / 2;
    const my = (hipY + shY) / 2;
    // Outline pass, then the fill, for a clean pixel-art edge.
    scr.taper(hipX, hipY + 1.5 * s, wHip + s, mx, my, wChest + s, INK);
    scr.taper(mx, my, wChest + s, shX, shY - s, wChest * 0.85 + s, INK);
    scr.taper(hipX, hipY + 1.5 * s, wHip, mx, my, wChest, C.SKIN);
    scr.taper(mx, my, wChest, shX, shY - s, wChest * 0.85, C.SKIN);
    if (wide > 0.3) {
      // Rim light down one side of the body, catching the wing spotlight.
      scr.taper(hipX - wHip * 0.45, hipY, 1.0 * s, mx - wChest * 0.5, my, 1.2 * s, C.SKIN_L);
      scr.taper(mx - wChest * 0.5, my, 1.2 * s, shX - wChest * 0.45, shY, 1.0 * s, C.SKIN_L);
      // Chest tuft.
      scr.poly([[shX, shY + 1 * s], [shX - 2.4 * s * wide, shY + 6 * s], [shX + 2.4 * s * wide, shY + 6 * s]], C.SKIN_D);
    }
  }

  drawArm(scr, sx, sy, [sh, el], s, lean, col, shade) {
    const a1 = lean * 0.35 + sh;
    const ex = sx + sn(a1) * P.upperArm * s;
    const ey = sy + cs(a1) * P.upperArm * s;
    const a2 = a1 + el;
    const wx = ex + sn(a2) * P.foreArm * s;
    const wy = ey + cs(a2) * P.foreArm * s;
    scr.taper(sx, sy, 3.0 * s, ex, ey, 2.4 * s, shade);
    scr.taper(ex, ey, 2.4 * s, wx, wy, 2.0 * s, shade);
    scr.taper(sx, sy, 2.1 * s, ex, ey, 1.6 * s, col);
    scr.taper(ex, ey, 1.6 * s, wx, wy, 1.25 * s, col);
    // Three-fingered hand.
    scr.disc(wx, wy, 2.6 * s, shade);
    for (let i = -1; i <= 1; i++) {
      const fa = a2 + i * 0.6;
      scr.taper(wx, wy, 1.5 * s, wx + sn(fa) * 3.6 * s, wy + cs(fa) * 3.6 * s, 0.9 * s, shade);
    }
    scr.disc(wx, wy, 1.9 * s, col);
    for (let i = -1; i <= 1; i++) {
      const fa = a2 + i * 0.6;
      scr.taper(wx, wy, 1.0 * s, wx + sn(fa) * 2.9 * s, wy + cs(fa) * 2.9 * s, 0.5 * s, col);
    }
  }

  drawLeg(scr, hipCentreX, hy, k, s, col, ink, wide, sideSign, far) {
    const { kx, ky, fx, fy } = k;
    const hx = hipCentreX + (kx - hipCentreX) * 0.18;
    scr.taper(hx, hy, 3.9 * s, kx, ky, 3.0 * s, ink);
    scr.taper(kx, ky, 3.0 * s, fx, fy, 2.4 * s, ink);
    scr.taper(hx, hy, 3.0 * s, kx, ky, 2.1 * s, col);
    scr.taper(kx, ky, 2.1 * s, fx, fy, 1.6 * s, col);
    this.drawShoe(scr, fx, fy, k.ankle, s, wide, sideSign, far);
  }

  /** A chunky tap shoe — the loudest thing he owns. */
  drawShoe(scr, fx, fy, ankle, s, wide, sideSign, far) {
    const t = -ankle * sideSign;
    const dx = sideSign * Math.cos(t);
    const dy = Math.sin(t);
    const nx = -dy;
    const ny = dx * sideSign;
    const len = P.foot * s * (0.5 + wide * 0.5);
    const back = 3.0 * s;
    const up = 2.6 * s;

    const heelX = fx - dx * back;
    const heelY = fy - dy * back;
    const toeX = fx + dx * len;
    const toeY = fy + dy * len;
    const shell = [
      [heelX + nx * up, heelY + ny * up],
      [toeX + nx * up * 0.5, toeY + ny * up * 0.5],
      [toeX + dx * 0.5 * s, toeY + dy * 0.5 * s + 1.6 * s],
      [heelX, heelY + 2.0 * s],
    ];
    scr.poly(shell, C.DARK);
    // Highlight along the top of the shoe and a bright metal tap at the toe.
    scr.line(heelX + nx * up, heelY + ny * up - 1, toeX + nx * up * 0.5, toeY + ny * up * 0.5 - 1, far ? C.DARK : C.MID);
    if (!far) {
      scr.disc(toeX, toeY + 0.8 * s, 1.1 * s, C.MID);
      scr.disc(heelX, heelY + 1.2 * s, 1.0 * s, C.MID);
    }
  }

  drawTail(scr, x, y, s, side, wide) {
    // Hangs behind him, sweeping out and curling up at the tip.
    const dir = side >= 0 ? -1 : 1;
    const reach = 0.5 + 0.5 * wide;
    let px = x + dir * 2.5 * s;
    let py = y;
    let ang = 1.45 + this.tail.a[0] * 0.22;
    const pts = [[px, py]];
    const segLen = 5.6 * s;
    for (let i = 0; i < this.tail.a.length; i++) {
      ang += -0.36 + this.tail.a[i] * 0.22;
      px += dir * Math.cos(ang) * segLen * reach;
      py += Math.sin(ang) * segLen;
      pts.push([px, py]);
    }
    for (const [pass, grow] of [[INK, 0.9], [C.SKIN, 0]]) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const r0 = (2.8 - i * 0.28) * s + grow * s;
        const r1 = (2.8 - (i + 1) * 0.28) * s + grow * s;
        scr.taper(pts[i][0], pts[i][1], r0, pts[i + 1][0], pts[i + 1][1], r1, pass);
      }
    }
    // Spade tip.
    const tip = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const a = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const vx = -uy * 3.6 * s;
    const vy = ux * 3.6 * s;
    const spade = (k) => [
      [tip[0] - ux * 1.0 * s, tip[1] - uy * 1.0 * s],
      [tip[0] + vx * k + ux * 2.2 * s, tip[1] + vy * k + uy * 2.2 * s],
      [tip[0] + ux * 5.4 * s, tip[1] + uy * 5.4 * s],
      [tip[0] - vx * k + ux * 2.2 * s, tip[1] - vy * k + uy * 2.2 * s],
    ];
    scr.poly(spade(1.0), INK);
    scr.poly(spade(0.62), C.SKIN);
  }

  drawHead(scr, hx, hy, ang, s, face, wide, facingUs, expr) {
    const rx = P.headR * s * (0.58 + 0.42 * Math.max(0.3, wide));
    const ry = P.headR * s * 0.95;

    // Ears: modest triangles that flick with a lag.
    const earLag = this.ear.a[1];
    for (const dir of [-1, 1]) {
      const showing = 0.45 + 0.55 * wide;
      const ex = hx + dir * rx * 0.8;
      const ey = hy + ry * 0.08;
      const tipX = ex + dir * 5.2 * s * showing;
      const tipY = ey - (1.6 + earLag * 2.2) * s;
      scr.poly([[ex, ey - 3.0 * s], [tipX, tipY], [ex, ey + 3.0 * s]], INK);
      scr.poly([[ex, ey - 2.0 * s], [tipX - dir * 1.3 * s, tipY + 0.3 * s], [ex, ey + 2.0 * s]], C.SKIN);
    }

    // Head.
    scr.ellipse(hx, hy, rx + s * 0.9, ry + s * 0.9, INK);
    scr.ellipse(hx, hy, rx, ry, C.SKIN);

    // Horns, curving up and out from the brow.
    for (const dir of [-1, 1]) {
      const showing = 0.5 + 0.5 * wide;
      const bxp = hx + dir * rx * 0.52;
      const byp = hy - ry * 0.72;
      for (const [col, grow, len] of [[INK, 0.7, 1.0], [C.HORN, 0, 0.94]]) {
        let cx = bxp;
        let cy = byp;
        let a = -Math.PI / 2 + dir * 0.55 - ang * 0.6;
        for (let i = 0; i < 4; i++) {
          const r0 = (2.3 - i * 0.45) * s * len + grow * s;
          const r1 = (2.3 - (i + 1) * 0.45) * s * len + grow * s;
          const nx2 = cx + Math.cos(a) * 1.5 * s * showing;
          const ny2 = cy + Math.sin(a) * 1.5 * s;
          scr.taper(cx, cy, Math.max(0.4, r0), nx2, ny2, Math.max(0.4, r1), col);
          cx = nx2; cy = ny2;
          a -= dir * 0.30;
        }
      }
    }

    if (!facingUs) {
      scr.ellipse(hx, hy + ry * 0.2, rx * 0.5, ry * 0.35, C.SKIN_D);
      return;
    }

    const eyeDX = rx * 0.44;
    const eyeY = hy - ry * 0.16;
    const blinking = this.blink > 0;

    for (const dir of [-1, 1]) {
      const ex = hx + dir * eyeDX;
      const shut = blinking || (expr === 'wink' && dir === 1);
      const big = expr === 'wow' ? 1.2 : 1;
      if (shut) {
        scr.taper(ex - 2.2 * s, eyeY, 0.8 * s, ex + 2.2 * s, eyeY, 0.8 * s, C.PUPIL);
      } else {
        scr.ellipse(ex, eyeY, 2.6 * s * big, 3.1 * s * big, C.PUPIL);
        scr.ellipse(ex, eyeY, 2.1 * s * big, 2.6 * s * big, C.EYE);
        const look = expr === 'cool' ? -0.9 * dir : 0;
        scr.ellipse(ex + look * s, eyeY + 0.5 * s, 1.15 * s, 1.5 * s, C.PUPIL);
        scr.px(Math.round(ex - s), Math.round(eyeY - s), C.EYE);
      }
      const browY = eyeY - 4.2 * s - (expr === 'wow' ? 1.2 * s : 0);
      const tiltA = expr === 'wow' ? 0 : dir * 0.9 * s;
      scr.taper(ex - 2.8 * s, browY + tiltA, 0.9 * s, ex + 2.4 * s, browY - tiltA, 0.7 * s, C.SKIN_D);
    }

    // Snout and grin.
    const mY = hy + ry * 0.44;
    scr.ellipse(hx, mY - 1.6 * s, 1.7 * s, 1.2 * s, C.SKIN_D);
    if (expr === 'wow') {
      scr.ellipse(hx, mY + 1.8 * s, 2.3 * s, 2.7 * s, C.PUPIL);
      scr.ellipse(hx, mY + 2.6 * s, 1.3 * s, 1.2 * s, C.SKIN_D);
    } else {
      const w = 4.4 * s * (0.55 + wide * 0.45);
      for (let i = -w; i <= w; i++) {
        const t = i / w;
        const yy = mY + 1.2 * s + (1 - t * t) * 1.9 * s;
        scr.px(hx + i, yy, C.PUPIL);
        scr.px(hx + i, yy - 1, C.PUPIL);
      }
      scr.px(Math.round(hx - w * 0.6), Math.round(mY + 1.4 * s), C.HORN);
      scr.px(Math.round(hx + w * 0.6), Math.round(mY + 1.4 * s), C.HORN);
    }
  }
}
