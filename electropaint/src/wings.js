import * as THREE from 'three';
import { Bank } from './smooth.js';
import { CHOREOGRAPHIES, resolveBank } from './choreography.js';

/**
 * The ribbon.
 *
 * Conceptually there is exactly one flying polygon, and it leaves a trail of
 * ghosts behind it. Every simulation tick the parameter bank advances and its
 * current state is pushed into a ring buffer; polygon k is drawn from the state
 * as it was k ticks ago. So the shape you see is the recent history of a single
 * smoothly wandering point — which is why it always looks like a single
 * gesture, and why a change of choreography ripples down the ribbon instead of
 * teleporting it.
 *
 * The placement of polygon k is an accumulated chain, walking from the head of
 * the ribbon toward the tail:
 *
 *     spine  <- spine . rotX(spineX) . rotY(spineY) . translate(0, 0, zDelta)
 *     local  =  spine . rotZ(angle + k*deltaAngle) . translate(radius, 0, 0)
 *                     . rotZ(-yaw) . rotY(-pitch) . rotX(roll) . scale(size)
 *
 * With spineX and spineY at zero this is the original straight column. Let the
 * spine bend a little per step and the column curls into rings and knots.
 */

const TICK = 1 / 60;        // simulation step, seconds
const MAX_CATCHUP = 6;      // ticks per frame before we just drop time

/** One polygon's worth of state. Reused in place; never reallocated. */
function makeWing() {
  return {
    radius: 0, angle: 0, deltaAngle: 0, zDelta: 0,
    spineX: 0, spineY: 0,
    roll: 0, pitch: 0, yaw: 0, size: 1,
    hue: 0, hueDelta: 0, sat: 1, light: 0.5,
  };
}

const FIELDS = Object.keys(makeWing());

export class WingSystem {
  constructor(count = 168) {
    this.count = count;
    this.wings = Array.from({ length: count }, makeWing);
    this.head = 0;

    this.choreoIndex = 0;
    this.bank = new Bank(resolveBank(CHOREOGRAPHIES[0], count));

    this.tempo = 1;
    this.sizeScale = 1;
    this.accumulator = 0;
    this.warmed = false;

    // Per-instance output, consumed by the renderer and the score.
    this.matrices = new Float32Array(count * 16);
    this.colors = new Float32Array(count * 3);
    this.positions = new Float32Array(count * 3);

    this.centroid = new THREE.Vector3();
    this.extent = 10;
    this.maxSize = 1;

    this.telemetry = {
      energy: 0, radius: 0, spread: 0, hue: 0, twist: 0,
      headX: 0, headY: 0, headZ: 0,
    };

    // Scratch — allocated once.
    this._spine = new THREE.Matrix4();
    this._local = new THREE.Matrix4();
    this._tmp = new THREE.Matrix4();
    this._color = new THREE.Color();
    this._sum = new THREE.Vector3();

    this.reseed();
  }

  /** Resize the ribbon, keeping as much of the existing trail as we can. */
  setCount(count) {
    count = Math.max(8, Math.round(count));
    if (count === this.count) return;

    const old = this.wings;
    const oldCount = this.count;
    const oldHead = this.head;

    const next = Array.from({ length: count }, makeWing);
    for (let k = 0; k < count; k++) {
      // k counts from the head of the ribbon; if we grew, the tail repeats.
      const src = (((oldHead - (k % oldCount)) % oldCount) + oldCount) % oldCount;
      Object.assign(next[(count - k) % count], old[src]);
    }
    this.wings = next;
    this.head = 0;
    this.count = count;

    this.matrices = new Float32Array(count * 16);
    this.colors = new Float32Array(count * 3);
    this.positions = new Float32Array(count * 3);

    // Ribbon-relative specs (torus closure, knots) depend on the length.
    this.bank.retarget(resolveBank(CHOREOGRAPHIES[this.choreoIndex], count), 1.5);
  }

  get choreography() {
    return CHOREOGRAPHIES[this.choreoIndex];
  }

  setChoreography(index, blendSeconds = 5) {
    const n = CHOREOGRAPHIES.length;
    this.choreoIndex = ((index % n) + n) % n;
    this.bank.retarget(resolveBank(this.choreography, this.count), blendSeconds);
    return this.choreography;
  }

  /** Throw away the trail and refill it from a fresh parameter state. */
  reseed() {
    this.bank.reseed(resolveBank(this.choreography, this.count));
    this.head = 0;
    for (let i = 0; i < this.count; i++) this._tick();
    this.warmed = true;
  }

  /** Advance the bank one step and push the result onto the ribbon. */
  _tick() {
    const v = this.bank.step(TICK);
    this.head = (this.head + 1) % this.count;
    const w = this.wings[this.head];
    for (let i = 0; i < FIELDS.length; i++) {
      const f = FIELDS[i];
      w[f] = v[f];
    }
  }

  update(dt) {
    this.accumulator += Math.min(0.25, dt) * this.tempo;
    let ticks = 0;
    while (this.accumulator >= TICK && ticks < MAX_CATCHUP) {
      this.accumulator -= TICK;
      this._tick();
      ticks++;
    }
    if (ticks === MAX_CATCHUP) this.accumulator = 0;
    this._build();
  }

  /** Walk the ribbon and write out one transform + colour per polygon. */
  _build() {
    const { count, wings, matrices, colors, positions } = this;
    const spine = this._spine.identity();
    const local = this._local;
    const tmp = this._tmp;
    const col = this._color;

    this._sum.set(0, 0, 0);
    let maxSq = 0;
    let maxSize = 0;
    let radiusSum = 0;
    let twistSum = 0;

    for (let k = 0; k < count; k++) {
      const w = wings[(((this.head - k) % count) + count) % count];

      // Advance the spine one notch.
      spine.multiply(tmp.makeRotationX(w.spineX));
      spine.multiply(tmp.makeRotationY(w.spineY));
      spine.multiply(tmp.makeTranslation(0, 0, w.zDelta));

      // Step off the spine and orient the polygon.
      local.copy(spine);
      local.multiply(tmp.makeRotationZ(w.angle + k * w.deltaAngle));
      local.multiply(tmp.makeTranslation(w.radius, 0, 0));
      local.multiply(tmp.makeRotationZ(-w.yaw));
      local.multiply(tmp.makeRotationY(-w.pitch));
      local.multiply(tmp.makeRotationX(w.roll));
      const s = w.size * this.sizeScale;
      if (s > maxSize) maxSize = s;
      local.multiply(tmp.makeScale(s, s, s));

      local.toArray(matrices, k * 16);

      const e = local.elements;
      const x = e[12], y = e[13], z = e[14];
      positions[k * 3] = x;
      positions[k * 3 + 1] = y;
      positions[k * 3 + 2] = z;
      this._sum.x += x; this._sum.y += y; this._sum.z += z;

      // Hue runs along the ribbon as well as through time, so each polygon
      // sits a little further round the wheel than the one ahead of it. The
      // floor keeps a visible gradient even when the generator is passing
      // through zero — an all-one-colour ribbon is the dull case.
      const spread = (w.hueDelta < 0 ? -1 : 1) * (0.0018 + Math.abs(w.hueDelta));
      col.setHSL(((w.hue + k * spread) % 1 + 1) % 1, w.sat, w.light);
      colors[k * 3] = col.r;
      colors[k * 3 + 1] = col.g;
      colors[k * 3 + 2] = col.b;

      radiusSum += w.radius;
      twistSum += w.deltaAngle;
    }

    this.centroid.set(this._sum.x / count, this._sum.y / count, this._sum.z / count);

    for (let k = 0; k < count; k++) {
      const dx = positions[k * 3] - this.centroid.x;
      const dy = positions[k * 3 + 1] - this.centroid.y;
      const dz = positions[k * 3 + 2] - this.centroid.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d > maxSq) maxSq = d;
    }
    // Distances here are between polygon *centres*; the renderer's framing
    // solver adds the polygons themselves via `maxSize`.
    this.maxSize = maxSize;
    this.extent = Math.max(4, Math.sqrt(maxSq) * 1.04 + maxSize * 1.5);

    const headWing = this.wings[this.head];
    const t = this.telemetry;
    t.radius = radiusSum / count;
    t.twist = twistSum / count;
    t.spread = this.extent;
    t.hue = ((headWing.hue % 1) + 1) % 1;
    t.headX = positions[0];
    t.headY = positions[1];
    t.headZ = positions[2];

    // How hard the parameters are currently moving, 0..1-ish. The score reads
    // this to decide how busy to be.
    const gens = this.bank.gens;
    let e2 = 0, n = 0;
    for (const key of ['radius', 'deltaAngle', 'roll', 'pitch', 'size']) {
      const gg = gens[key];
      if (!gg || !gg.cur.speed) continue;
      e2 += Math.abs(gg.velocity) / gg.cur.speed;
      n++;
    }
    t.energy = n ? e2 / n : 0;
  }
}
