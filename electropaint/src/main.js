import { Stage } from './scene.js';
import { WingSystem } from './wings.js';
import { Score } from './audio.js';
import { setupUI } from './ui.js';
import { CHOREOGRAPHIES } from './choreography.js';

const STORE_KEY = 'electropaint.settings.v1';

const DEFAULTS = {
  count: 168,
  size: 1.15,
  tempo: 1.0,
  bloom: 0.4,
  trails: 0.45,
  edge: 0.62,
  fill: true,
  shape: 'triangle',
  camera: 'drift',
  autoCycle: true,
  cycleLen: 30,
  sound: false,
  volume: 0.55,
};

function loadSettings() {
  const s = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) Object.assign(s, JSON.parse(raw));
  } catch { /* private mode, corrupt value — defaults are fine */ }
  // Never trust what came out of storage.
  s.count = Math.min(420, Math.max(24, Number(s.count) || DEFAULTS.count));
  s.cycleLen = Math.min(120, Math.max(8, Number(s.cycleLen) || DEFAULTS.cycleLen));
  if (s.shape !== 'quad') s.shape = 'triangle';
  if (!['drift', 'orbit', 'inside', 'manual'].includes(s.camera)) s.camera = 'drift';
  return s;
}

function saveSettings(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function boot() {
  const canvas = document.getElementById('stage');

  // WebGL 2 is required — instanced attributes plus derivatives, with no
  // extension dance. Probe on a throwaway canvas so we do not accidentally
  // fix the real canvas's context attributes before three gets to it.
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) {
    document.getElementById('nogl').hidden = false;
    document.getElementById('boot').hidden = true;
    return;
  }

  const settings = loadSettings();
  const stage = new Stage(canvas);
  const system = new WingSystem(settings.count);
  const score = new Score();

  let paused = false;
  let started = false;
  let cycleClock = 0;
  let last = performance.now();

  const app = {
    settings,
    // Filled in by setupUI.
    toast: () => {},
    syncUI: () => {},
    onChoreography: () => {},

    begin() {
      if (started) return;
      started = true;
      // Audio can only be constructed inside a gesture, which is what this is.
      if (settings.sound) score.enable();
      app.toast(system.choreography.name);
    },

    /**
     * `persist: false` is for changes the user made by gesture rather than by
     * choice — dragging the view switches the camera to manual, but that should
     * not be what greets them next time they open the page.
     */
    set(key, value, { persist = true } = {}) {
      settings[key] = value;
      applySetting(key);
      if (persist) saveSettings(settings);
      app.syncUI();
    },

    reset() {
      Object.assign(settings, DEFAULTS);
      for (const k of Object.keys(DEFAULTS)) applySetting(k);
      saveSettings(settings);
      app.syncUI();
      app.toast('Defaults restored');
    },

    selectChoreography(index, announce = true) {
      const c = system.setChoreography(index, 5);
      stage.setChoreoLook(c);
      score.setChord(c.chord, system.choreoIndex);
      score.swell(Math.random() < 0.5);
      cycleClock = 0;
      app.onChoreography(system.choreoIndex, c, announce);
    },

    nextChoreography() {
      app.selectChoreography(system.choreoIndex + 1);
    },

    reseed() {
      system.reseed();
      stage._first = true;
    },

    togglePause() {
      paused = !paused;
      app.toast(paused ? 'Paused' : 'Resumed');
    },

    orbitBy(dYaw, dPitch) {
      const m = stage.manual.target;
      m.yaw -= dYaw;
      m.pitch = Math.max(-1.45, Math.min(1.45, m.pitch + dPitch));
    },

    zoomBy(factor) {
      stage.zoom = Math.max(0.25, Math.min(3.5, stage.zoom * factor));
    },
  };

  function applySetting(key) {
    const s = settings;
    switch (key) {
      case 'count': system.setCount(s.count); break;
      case 'size': system.sizeScale = s.size; break;
      case 'tempo': system.tempo = s.tempo; break;
      case 'bloom': stage.setBloom(s.bloom); break;
      case 'trails': stage.setTrails(s.trails); break;
      case 'edge': stage.setEdge(s.edge); break;
      case 'fill': stage.setFilled(s.fill); break;
      case 'shape': stage.setShape(s.shape); stage.setFilled(s.fill); break;
      case 'camera':
        stage.mode = s.camera;
        if (s.camera === 'manual') {
          // Hand over from wherever the automatic camera had got to.
          stage.manual.yaw = stage.manual.target.yaw;
          stage.manual.pitch = stage.manual.target.pitch;
        }
        break;
      case 'volume': score.setVolume(s.volume); break;
      case 'sound':
        if (s.sound) score.enable(); else score.disable();
        break;
      default: break; // autoCycle / cycleLen are read in the loop
    }
  }

  for (const k of Object.keys(DEFAULTS)) {
    if (k === 'sound') continue; // needs a gesture; handled by begin()
    applySetting(k);
  }

  setupUI(app);
  // A handle for poking at the running piece from the console.
  window.electropaint = { app, stage, system, score };

  // Start on a random choreography so two runs never open the same way.
  const opener = Math.floor(Math.random() * CHOREOGRAPHIES.length);
  system.setChoreography(opener, 0.001);
  stage.setChoreoLook(system.choreography);
  score.setChord(system.choreography.chord, opener);
  system.reseed();
  app.onChoreography(opener, system.choreography, false);

  // ------------------------------------------------------------------ loop --

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Cap the pixel ratio: bloom is fill-rate hungry and a 3x retina phone
    // gains nothing from it.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    stage.resize(w, h, dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) last = performance.now();
  });

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;

    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (!paused) {
      system.update(dt);

      if (settings.autoCycle) {
        cycleClock += dt;
        if (cycleClock >= settings.cycleLen) {
          // Never repeat the current one back to back.
          let next = system.choreoIndex;
          while (next === system.choreoIndex) {
            next = Math.floor(Math.random() * CHOREOGRAPHIES.length);
          }
          app.selectChoreography(next, true);
        }
      }

      score.observe(system.telemetry);
    }

    stage.update(system, paused ? 0.0001 : dt);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
