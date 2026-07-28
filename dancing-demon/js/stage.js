// stage.js — the little theatre the demon works in.

import { C, W, H, textCentred, textWidth, text } from './pixels.js';

export const FLOOR_Y = 96;

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Ordered-dither fill — cheap translucency on an indexed buffer. */
function ditherPoly(scr, pts, colour, level) {
  const threshold = Math.round(level * 16);
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (a[1] === b[1]) continue;
      const lo = Math.min(a[1], b[1]);
      const hi = Math.max(a[1], b[1]);
      if (y + 0.5 < lo || y + 0.5 >= hi) continue;
      xs.push(a[0] + ((y + 0.5 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) {
        if (BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4] < threshold) scr.px(x, y, colour);
      }
    }
  }
}

export class Stage {
  constructor() {
    this.curtain = 1;      // 1 = fully closed, 0 = flown out
    this.curtainTarget = 1;
    this.t = 0;
    this.marquee = 'THE DANCING DEMON';
    this.subtitle = '';
    this.cheer = 0;        // 0..1, audience excitement
    this.confetti = [];
    this.audience = [];
    for (let i = 0; i < 26; i++) {
      this.audience.push({
        x: 4 + (i % 13) * 15 + (i > 12 ? 7 : 0),
        row: i > 12 ? 1 : 0,
        r: 2 + ((i * 7) % 3),
        phase: Math.random() * Math.PI * 2,
        bob: 0.4 + Math.random() * 0.8,
      });
    }
  }

  open() { this.curtainTarget = 0; }
  close() { this.curtainTarget = 1; }

  burst(n = 40) {
    for (let i = 0; i < n; i++) {
      this.confetti.push({
        x: 20 + Math.random() * (W - 40),
        y: 6 + Math.random() * 20,
        vx: (Math.random() - 0.5) * 14,
        vy: 8 + Math.random() * 22,
        life: 1.6 + Math.random(),
        c: [C.GLOW, C.WHITE, C.SKIN_L, C.LIGHT][(Math.random() * 4) | 0],
      });
    }
  }

  update(dt) {
    this.t += dt;
    const speed = 0.65;
    if (this.curtain < this.curtainTarget) this.curtain = Math.min(this.curtainTarget, this.curtain + dt * speed);
    else if (this.curtain > this.curtainTarget) this.curtain = Math.max(this.curtainTarget, this.curtain - dt * speed);
    this.cheer = Math.max(0, this.cheer - dt * 0.5);

    for (const p of this.confetti) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 26 * dt;
      p.vx *= 0.99;
      p.life -= dt;
    }
    this.confetti = this.confetti.filter((p) => p.life > 0 && p.y < H);
  }

  /** Everything behind the performer. */
  drawBack(scr) {
    scr.clear(C.BG);

    // Backdrop: solid bands rather than dither, so the noise budget can all
    // go on the light.
    scr.fillRect(8, 6, W - 16, FLOOR_Y - 6, C.DARK);
    ditherPoly(scr, [[8, 6], [W - 8, 6], [W - 8, 22], [8, 22]], C.MID, 0.24);
    ditherPoly(scr, [[8, 22], [W - 8, 22], [W - 8, 34], [8, 34]], C.MID, 0.09);

    // Spotlight cones from the wings.
    const flick = 0.9 + Math.sin(this.t * 11) * 0.05 + Math.sin(this.t * 4.3) * 0.05;
    ditherPoly(scr, [[30, 6], [44, 6], [W / 2 + 22, FLOOR_Y], [W / 2 - 16, FLOOR_Y]], C.MID, 0.30 * flick);
    ditherPoly(scr, [[W - 44, 6], [W - 30, 6], [W / 2 + 16, FLOOR_Y], [W / 2 - 22, FLOOR_Y]], C.MID, 0.30 * flick);

    // Pool of light on the boards.
    for (let y = FLOOR_Y - 14; y < FLOOR_Y; y++) {
      const k = 1 - (FLOOR_Y - y) / 14;
      ditherPoly(scr, [[W / 2 - 36 * k - 14, y], [W / 2 + 36 * k + 14, y],
                       [W / 2 + 36 * k + 14, y + 1], [W / 2 - 36 * k - 14, y + 1]], C.LIGHT, 0.30 * k);
    }

    // Boards.
    scr.fillRect(4, FLOOR_Y, W - 8, 8, C.FLOOR);
    for (let x = 4; x < W - 4; x += 13) scr.vline(x, FLOOR_Y + 1, FLOOR_Y + 7, C.FLOOR_D);
    scr.hline(4, W - 5, FLOOR_Y, C.FLOOR_D);
    scr.hline(4, W - 5, FLOOR_Y + 7, C.DARK);

    // Footlights along the lip of the stage.
    scr.fillRect(0, FLOOR_Y + 8, W, 3, C.DARK);
    for (let x = 9; x < W - 4; x += 13) {
      const on = 0.75 + Math.sin(this.t * 5 + x) * 0.25;
      ditherPoly(scr, [[x - 8, FLOOR_Y + 7], [x + 8, FLOOR_Y + 7], [x + 3, FLOOR_Y - 8], [x - 3, FLOOR_Y - 8]], C.GLOW, 0.08 * on);
      scr.disc(x, FLOOR_Y + 8, 1.3, on > 0.9 ? C.GLOW : C.LIGHT);
    }

    this.drawAudience(scr);
  }

  drawAudience(scr) {
    scr.fillRect(0, FLOOR_Y + 11, W, H - FLOOR_Y - 11, C.BG);
    for (const a of this.audience) {
      const bob = Math.sin(this.t * (2 + a.bob * 3) + a.phase) * (0.7 + this.cheer * 2.4) * a.bob;
      const y = H - 2 - a.row * 6 + bob;
      scr.ellipse(a.x, y + a.r + 3, a.r + 3, a.r + 1, C.DARK);
      scr.disc(a.x, y, a.r, C.DARK);
      scr.ellipseOutline(a.x, y, a.r + 0.6, a.r + 0.6, C.FLOOR_D);
      if (this.cheer > 0.3 && a.r > 3) {
        const w = Math.sin(this.t * 9 + a.phase) * 2;
        scr.line(a.x - a.r, y + 2, a.x - a.r - 3, y - 4 + w, C.DARK);
        scr.line(a.x + a.r, y + 2, a.x + a.r + 3, y - 4 - w, C.DARK);
      }
    }
  }

  /** Proscenium, curtain and marquee — everything in front of the performer. */
  drawFront(scr) {
    for (const p of this.confetti) scr.px(p.x, p.y, p.c);

    // Side legs.
    this.curtainPanel(scr, 0, 12, 8, FLOOR_Y + 10, 1);
    this.curtainPanel(scr, W - 12, 12, 8, FLOOR_Y + 10, -1);

    // The main curtain, flown in and out from above.
    const bottom = 8 + this.curtain * (FLOOR_Y + 4);
    if (bottom > 9) {
      const top = 0;
      for (let x = 0; x < W; x++) {
        const fold = Math.sin(x * 0.5) * 0.5 + Math.sin(x * 0.19 + 1.3) * 0.5;
        const hem = bottom + Math.sin(x * 0.22 + this.t * 0.8) * 2.2 * this.curtain;
        const shade = fold > 0.25 ? C.CURTAIN : C.CURTAIN_D;
        scr.vline(x, top, hem, shade);
        if (fold > 0.85) scr.vline(x, top, hem - 2, C.CURTAIN);
        // Gold hem.
        scr.px(x, hem, C.GLOW);
        scr.px(x, hem - 1, C.GLOW);
        if ((x + Math.round(this.t * 3)) % 8 === 0) scr.px(x, hem - 2, C.WHITE);
      }
    }

    // Valance and arch.
    scr.fillRect(0, 0, W, 8, C.CURTAIN_D);
    for (let x = 0; x < W; x++) {
      const s = Math.abs(Math.sin(x * 0.26));
      scr.vline(x, 0, 6 + s * 3, C.CURTAIN);
      scr.px(x, 6 + s * 3, C.GLOW);
    }
    scr.fillRect(0, 0, W, 2, C.CURTAIN_D);

    // Marquee bulbs around the top.
    for (let x = 3; x < W; x += 9) {
      const on = Math.sin(this.t * 4 + x * 0.4) > -0.3;
      scr.px(x, 1, on ? C.GLOW : C.CURTAIN_D);
      if (on) {
        scr.px(x - 1, 1, C.GLOW);
        scr.px(x + 1, 1, C.GLOW);
        scr.px(x, 0, C.GLOW);
        scr.px(x, 2, C.GLOW);
      }
    }
  }

  curtainPanel(scr, x, y, w, h, dir) {
    for (let i = 0; i < w; i++) {
      const fold = Math.sin(i * 0.9) > 0 ? C.CURTAIN : C.CURTAIN_D;
      scr.vline(x + i, y - 12, y + h, fold);
    }
    // Swagged inner edge.
    const ex = dir > 0 ? x + w : x - 1;
    for (let j = 0; j < h; j++) {
      const bulge = Math.sin((j / h) * Math.PI) * 5;
      for (let k = 0; k < bulge; k++) scr.px(ex + dir * k, y + j, k > bulge - 2 ? C.CURTAIN_D : C.CURTAIN);
      scr.px(ex + dir * Math.round(bulge), y + j, C.GLOW);
    }
  }

  /** The house marquee: a hanging sign, so it never fights the performer. */
  drawTitle(scr, line1, line2) {
    const x0 = 14;
    const x1 = W - 14;
    const y0 = 7;
    const y1 = line2 ? 31 : 25;
    // Hanger wires.
    scr.vline(x0 + 12, 2, y0, C.CURTAIN_D);
    scr.vline(x1 - 12, 2, y0, C.CURTAIN_D);
    scr.fillRect(x0, y0, x1 - x0, y1 - y0, C.BG);
    scr.rect(x0, y0, x1 - x0, y1 - y0, C.GLOW);
    scr.rect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4, C.CURTAIN_D);
    for (let x = x0 + 4; x < x1 - 3; x += 6) {
      const on = Math.sin(this.t * 5 + x * 0.5) > -0.2;
      scr.px(x, y0 + 1, on ? C.WHITE : C.CURTAIN_D);
      scr.px(x, y1 - 2, on ? C.WHITE : C.CURTAIN_D);
    }
    const glow = Math.sin(this.t * 3) > 0 ? C.GLOW : C.WHITE;
    textCentred(scr, line1, W / 2, y0 + 6, glow, 2, 2);
    if (line2) textCentred(scr, line2, W / 2, y0 + 18, C.LIGHT, 1, 1);
  }

  /** A ticket-style banner used to caption editors. */
  drawBanner(scr, str, y = 12) {
    const w = textWidth(str, 1, 1) + 10;
    const x = Math.round((W - w) / 2);
    scr.fillRect(x, y, w, 11, C.CURTAIN_D);
    scr.rect(x, y, w, 11, C.GLOW);
    text(scr, str, x + 5, y + 3, C.WHITE, 1, 1);
  }
}
