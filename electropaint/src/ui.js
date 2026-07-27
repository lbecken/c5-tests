import { CHOREOGRAPHIES } from './choreography.js';

const $ = (id) => document.getElementById(id);

const IDLE_AFTER = 2800; // ms of stillness before the chrome fades away

/**
 * All DOM wiring. `app` supplies the state and the verbs; this file only knows
 * how to show them and how to turn clicks and keys back into calls.
 */
export function setupUI(app) {
  const s = app.settings;

  // ------------------------------------------------------------ boot gate --

  const boot = $('boot');
  const start = () => {
    if (boot.classList.contains('gone')) return;
    boot.classList.add('gone');
    setTimeout(() => { boot.hidden = true; }, 800);
    app.begin();
  };
  $('boot-start').addEventListener('click', start);

  // ---------------------------------------------------------------- toast --

  const toast = $('toast');
  let toastTimer = null;
  app.toast = (msg) => {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1700);
  };

  // ------------------------------------------------------- choreo readout --

  const nameOut = document.querySelector('#choreo-name .value');
  const chips = $('choreo-list');
  CHOREOGRAPHIES.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c.name;
    b.title = c.note;
    b.dataset.index = String(i);
    b.addEventListener('click', () => app.selectChoreography(i));
    chips.appendChild(b);
  });

  app.onChoreography = (index, choreo, announce) => {
    nameOut.textContent = choreo.name;
    [...chips.children].forEach((b, i) => b.classList.toggle('on', i === index));
    if (announce) app.toast(choreo.name);
  };

  // --------------------------------------------------------------- panel ---

  const panel = $('panel');
  const setPanel = (open) => {
    panel.hidden = !open;
    if (open) kick();
  };
  $('panel-close').addEventListener('click', () => setPanel(false));

  // Sliders: id -> [settings key, formatter]
  const RANGES = {
    count: ['count', (v) => v.toFixed(0)],
    size: ['size', (v) => v.toFixed(2)],
    speed: ['tempo', (v) => `${v.toFixed(2)}x`],
    bloom: ['bloom', (v) => v.toFixed(2)],
    trails: ['trails', (v) => (v < 0.03 ? 'off' : v.toFixed(2))],
    edge: ['edge', (v) => v.toFixed(2)],
    vol: ['volume', (v) => `${Math.round(v * 100)}%`],
    'cycle-len': ['cycleLen', (v) => `${v.toFixed(0)}s`],
  };

  const outs = {};
  for (const [id, [key, fmt]] of Object.entries(RANGES)) {
    const input = $(id);
    const out = $(`out-${id}`) || $('cycle-secs');
    outs[id] = { input, out, fmt, key };
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      app.set(key, v);
      if (out) out.textContent = fmt(v);
    });
  }

  $('fill').addEventListener('change', (e) => app.set('fill', e.target.checked));
  $('auto-cycle').addEventListener('change', (e) => app.set('autoCycle', e.target.checked));
  $('sound').addEventListener('change', (e) => app.set('sound', e.target.checked));

  const segClick = (rootId, dataKey, settingKey) => {
    const root = $(rootId);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      app.set(settingKey, b.dataset[dataKey]);
    });
  };
  segClick('shape-seg', 'shape', 'shape');
  segClick('cam-seg', 'cam', 'camera');

  $('btn-reset').addEventListener('click', () => app.reset());

  /** Push the whole settings object back into the widgets. */
  app.syncUI = () => {
    for (const o of Object.values(outs)) {
      o.input.value = String(s[o.key]);
      if (o.out) o.out.textContent = o.fmt(s[o.key]);
    }
    $('fill').checked = s.fill;
    $('auto-cycle').checked = s.autoCycle;
    $('sound').checked = s.sound;
    for (const b of $('shape-seg').children) b.classList.toggle('on', b.dataset.shape === s.shape);
    for (const b of $('cam-seg').children) b.classList.toggle('on', b.dataset.cam === s.camera);
  };
  app.syncUI();

  // ---------------------------------------------------------------- help ---

  const help = $('help');
  const setHelp = (open) => { help.hidden = !open; if (open) kick(); };
  $('help-close').addEventListener('click', () => setHelp(false));
  help.addEventListener('click', (e) => { if (e.target === help) setHelp(false); });

  // ------------------------------------------------------------- idleness --

  const fades = [...document.querySelectorAll('.idle-hide')];
  let idleTimer = null;
  function kick() {
    fades.forEach((el) => el.classList.remove('idle'));
    document.body.classList.remove('hide-cursor');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!panel.hidden || !help.hidden) return;
      fades.forEach((el) => el.classList.add('idle'));
      document.body.classList.add('hide-cursor');
    }, IDLE_AFTER);
  }
  ['pointermove', 'pointerdown', 'wheel', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, kick, { passive: true }));
  kick();

  // ------------------------------------------------------------- keyboard --

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' && e.key !== 'Escape') return;

    const k = e.key.toLowerCase();

    if (k >= '1' && k <= '9') {
      const i = Number(k) - 1;
      if (i < CHOREOGRAPHIES.length) { app.selectChoreography(i); e.preventDefault(); }
      return;
    }

    switch (k) {
      case ' ': app.nextChoreography(); e.preventDefault(); break;
      case 'a':
        app.set('autoCycle', !s.autoCycle);
        app.toast(`Auto-cycle ${s.autoCycle ? 'on' : 'off'}`);
        break;
      case 'c': {
        const order = ['drift', 'orbit', 'inside', 'manual'];
        const next = order[(order.indexOf(s.camera) + 1) % order.length];
        app.set('camera', next);
        app.toast(`Camera: ${next}`);
        break;
      }
      case 's':
        app.set('sound', !s.sound);
        app.toast(`Sound ${s.sound ? 'on' : 'off'}`);
        break;
      case 'o': setPanel(panel.hidden); break;
      case 'w':
        app.set('fill', !s.fill);
        app.toast(s.fill ? 'Filled' : 'Wireframe');
        break;
      case 't': {
        const next = s.shape === 'triangle' ? 'quad' : 'triangle';
        app.set('shape', next);
        app.toast(next === 'triangle' ? 'Triangles' : 'Quads');
        break;
      }
      case 'f': toggleFullscreen(); break;
      case 'p': app.togglePause(); break;
      case 'r': app.reseed(); app.toast('Reseeded'); break;
      case 'h': case '?': setHelp(help.hidden); break;
      case 'escape':
        if (!help.hidden) setHelp(false);
        else if (!panel.hidden) setPanel(false);
        break;
      case 'enter': start(); break;
      default: return;
    }
    e.preventDefault();
  });

  // -------------------------------------------------------- pointer / cam --

  const canvas = $('stage');
  let dragging = false;
  let last = { x: 0, y: 0 };

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    if (s.camera !== 'manual') app.set('camera', 'manual', { persist: false });
    app.orbitBy(dx * 0.006, dy * 0.005);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (s.camera === 'inside') app.set('camera', 'manual', { persist: false });
    app.zoomBy(Math.exp(e.deltaY * 0.0012));
  }, { passive: false });

  // Tapping the backdrop on touch devices should still get things going.
  canvas.addEventListener('dblclick', () => toggleFullscreen());

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  return { setPanel, setHelp, kick, start };
}
