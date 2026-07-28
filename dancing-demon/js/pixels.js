// pixels.js — a tiny indexed-colour framebuffer with a CRT presenter.
//
// The TRS-80 Model I drew the original Dancing Demon with 2x3 block glyphs,
// giving a 128x48 "graphics" screen. We use a slightly roomier 192x120 buffer
// so the demon can actually emote, but keep every pixel square and integer
// scaled so it still reads as 1980 hardware.

export const W = 192;
export const H = 120;

// Semantic colour slots. Themes remap these, so all drawing code is written
// once and works in monochrome phosphor as well as full colour.
export const C = {
  BG: 0,
  DARK: 1,
  MID: 2,
  LIGHT: 3,
  WHITE: 4,
  SKIN: 5,
  SKIN_D: 6,
  SKIN_L: 7,
  HORN: 8,
  EYE: 9,
  PUPIL: 10,
  CURTAIN: 11,
  CURTAIN_D: 12,
  FLOOR: 13,
  FLOOR_D: 14,
  GLOW: 15,
};

const SLOTS = 16;

// Build a monochrome theme by picking a brightness ramp of one phosphor colour.
function mono(r, g, b) {
  const s = (f) => [Math.round(r * f), Math.round(g * f), Math.round(b * f)];
  const p = new Array(SLOTS);
  p[C.BG] = [0, 0, 0];
  p[C.DARK] = s(0.16);
  p[C.MID] = s(0.40);
  p[C.LIGHT] = s(0.66);
  p[C.WHITE] = s(1.0);
  p[C.SKIN] = s(0.72);
  p[C.SKIN_D] = s(0.34);
  p[C.SKIN_L] = s(1.0);
  p[C.HORN] = s(1.0);
  p[C.EYE] = s(1.0);
  p[C.PUPIL] = s(0.04);
  p[C.CURTAIN] = s(0.36);
  p[C.CURTAIN_D] = s(0.15);
  p[C.FLOOR] = s(0.30);
  p[C.FLOOR_D] = s(0.15);
  p[C.GLOW] = s(0.92);
  return p;
}

export const THEMES = {
  phosphor: { name: 'Phosphor (TRS-80)', crt: true, pal: mono(214, 226, 235) },
  green: { name: 'Green screen', crt: true, pal: mono(120, 255, 140) },
  amber: { name: 'Amber', crt: true, pal: mono(255, 178, 60) },
  colour: {
    name: 'Colourised',
    crt: true,
    pal: (() => {
      const p = new Array(SLOTS);
      p[C.BG] = [8, 4, 14];
      p[C.DARK] = [30, 20, 44];
      p[C.MID] = [96, 72, 122];
      p[C.LIGHT] = [176, 158, 200];
      p[C.WHITE] = [255, 246, 230];
      p[C.SKIN] = [222, 74, 78];
      p[C.SKIN_D] = [116, 26, 46];
      p[C.SKIN_L] = [255, 138, 118];
      p[C.HORN] = [248, 226, 178];
      p[C.EYE] = [255, 250, 236];
      p[C.PUPIL] = [16, 6, 16];
      p[C.CURTAIN] = [138, 26, 52];
      p[C.CURTAIN_D] = [78, 12, 34];
      p[C.FLOOR] = [138, 96, 58];
      p[C.FLOOR_D] = [78, 50, 30];
      p[C.GLOW] = [255, 216, 128];
      return p;
    })(),
  },
};

export class Screen {
  constructor() {
    this.buf = new Uint8Array(W * H);
    this.clipTop = 0;
    this.clipBottom = H;
  }

  clear(c = C.BG) {
    this.buf.fill(c);
  }

  /** Restrict drawing to a horizontal band (used to hide the demon behind the curtain). */
  clip(top, bottom) {
    this.clipTop = top;
    this.clipBottom = bottom;
  }

  noClip() {
    this.clipTop = 0;
    this.clipBottom = H;
  }

  px(x, y, c) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (y < this.clipTop || y >= this.clipBottom) return;
    this.buf[y * W + x] = c;
  }

  get(x, y) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return C.BG;
    return this.buf[y * W + x];
  }

  hline(x0, x1, y, c) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    for (let x = x0; x <= x1; x++) this.px(x, y, c);
  }

  vline(x, y0, y1, c) {
    if (y1 < y0) [y0, y1] = [y1, y0];
    for (let y = y0; y <= y1; y++) this.px(x, y, c);
  }

  fillRect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) this.hline(x, x + w - 1, y + j, c);
  }

  rect(x, y, w, h, c) {
    this.hline(x, x + w - 1, y, c);
    this.hline(x, x + w - 1, y + h - 1, c);
    this.vline(x, y, y + h - 1, c);
    this.vline(x + w - 1, y, y + h - 1, c);
  }

  disc(cx, cy, r, c) {
    if (r <= 0.5) {
      this.px(Math.round(cx), Math.round(cy), c);
      return;
    }
    const r2 = r * r;
    const y0 = Math.floor(cy - r);
    const y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      const t = r2 - dy * dy;
      if (t < 0) continue;
      const dx = Math.sqrt(t);
      this.hline(Math.round(cx - dx), Math.round(cx + dx), y, c);
    }
  }

  ellipse(cx, cy, rx, ry, c) {
    const y0 = Math.floor(cy - ry);
    const y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) {
      const dy = (y - cy) / ry;
      const t = 1 - dy * dy;
      if (t < 0) continue;
      const dx = rx * Math.sqrt(t);
      this.hline(Math.round(cx - dx), Math.round(cx + dx), y, c);
    }
  }

  ellipseOutline(cx, cy, rx, ry, c) {
    for (let a = 0; a < 360; a += 3) {
      const r = (a * Math.PI) / 180;
      this.px(Math.round(cx + Math.cos(r) * rx), Math.round(cy + Math.sin(r) * ry), c);
    }
  }

  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Tapered capsule — the workhorse for limbs. */
  taper(x0, y0, r0, x1, y1, r1, c) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(2, Math.ceil(d * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t, c);
    }
  }

  /** Convex/concave polygon fill by scanline. */
  poly(pts, c) {
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
        this.hline(Math.round(xs[i]), Math.round(xs[i + 1]), y, c);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3x5 pixel font, enough for the marquee and stage titles.
// ---------------------------------------------------------------------------
const FONT = {
  A: '111101111101101', B: '110101110101110', C: '011100100100011',
  D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111',
  J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '101111111111101', O: '010101101101010',
  P: '110101110100100', Q: '010101101111011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101011',
  V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111',
  3: '111001011001111', 4: '101101111001001', 5: '111100110001110',
  6: '011100110101010', 7: '111001010010010', 8: '010101010101010',
  9: '010101011001110',
  ' ': '000000000000000', '.': '000000000000010', ',': '000000000010100',
  '!': '010010010000010', "'": '010010000000000', '-': '000000111000000',
  '?': '110001010000010', ':': '000010000010000', '*': '101010101000000',
  '/': '001001010100100', '&': '110101010101011', '+': '000010111010000',
};

export function textWidth(str, scale = 1, tracking = 1) {
  return str.length * (3 * scale + tracking) - tracking;
}

export function text(scr, str, x, y, c, scale = 1, tracking = 1) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const g = FONT[ch] || FONT['?'];
    for (let r = 0; r < 5; r++) {
      for (let col = 0; col < 3; col++) {
        if (g[r * 3 + col] === '1') {
          scr.fillRect(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += 3 * scale + tracking;
  }
  return cx;
}

export function textCentred(scr, str, cx, y, c, scale = 1, tracking = 1) {
  text(scr, str, Math.round(cx - textWidth(str, scale, tracking) / 2), y, c, scale, tracking);
}

// ---------------------------------------------------------------------------
// Presenter: index buffer -> RGBA -> integer upscale -> optional CRT pass.
// ---------------------------------------------------------------------------
export class Presenter {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.low = document.createElement('canvas');
    this.low.width = W;
    this.low.height = H;
    this.lowCtx = this.low.getContext('2d');
    this.img = this.lowCtx.createImageData(W, H);
    this.themeKey = 'phosphor';
    this.crt = true;
  }

  setTheme(key) {
    if (THEMES[key]) this.themeKey = key;
  }

  resize() {
    const host = this.canvas.parentElement;
    const availW = Math.max(160, host.clientWidth - 20);
    const availH = Math.max(200, Math.min(window.innerHeight * 0.62, 620));
    let scale = Math.min(availW / W, availH / H);
    scale = Math.max(1, Math.floor(scale * 2) / 2); // half-steps still look crisp
    this.canvas.width = Math.round(W * scale);
    this.canvas.height = Math.round(H * scale);
    this.canvas.style.width = this.canvas.width + 'px';
    this.canvas.style.height = this.canvas.height + 'px';
  }

  draw(scr) {
    const pal = THEMES[this.themeKey].pal;
    const d = this.img.data;
    const buf = scr.buf;
    for (let i = 0, p = 0; i < buf.length; i++, p += 4) {
      const col = pal[buf[i]] || pal[0];
      d[p] = col[0];
      d[p + 1] = col[1];
      d[p + 2] = col[2];
      d[p + 3] = 255;
    }
    this.lowCtx.putImageData(this.img, 0, 0);

    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(this.low, 0, 0, cw, ch);

    if (!this.crt) return;

    // Phosphor bloom.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.28;
    ctx.filter = 'blur(3px)';
    ctx.drawImage(this.low, 0, 0, cw, ch);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Scanlines, scaled so they never alias into a moire pattern.
    const step = Math.max(2, Math.round(ch / H));
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    for (let y = 0; y < ch; y += step) ctx.fillRect(0, y, cw, 1);

    // Vignette.
    const g = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.25, cw / 2, ch / 2, ch * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }
}
