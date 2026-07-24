/**
 * ISS Orbital Tracker — application entry point.
 *
 * Wires together the Earth, the beacon, the solar ephemeris and the telemetry
 * feed, and drives them from a single render loop.
 *
 * The scene is the Earth-fixed frame: the globe is stationary and the Sun moves.
 * That is what lets the terminator and the station share one coordinate system
 * with no accumulating drift between them.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Earth, loadEarthTextures } from './scene/earth.js';
import { createStarfield } from './scene/stars.js';
import { IssBeacon } from './scene/iss.js';
import { IssFeed } from './data/issFeed.js';
import { subsolarPoint, solarElevation } from './astro/solar.js';
import {
  geoToVector,
  vectorToGeo,
  GroundTrackPropagator,
  circularOrbitSpeed,
  footprintAngle,
  EARTH_RADIUS_KM,
} from './astro/geo.js';
import { Hud, showFatal } from './ui/hud.js';

const DEFAULT_CAMERA = new THREE.Vector3(2.35, 1.25, 2.6);
const TRAIL_SAMPLE_MS = 900;
const TRAIL_SEED_SECONDS = 1800;
const PREDICT_SECONDS = 5800; // a little over one orbit
const PREDICT_REFRESH_MS = 1500;
const HUD_REFRESH_MS = 100;
const STALE_AFTER_S = 12;
const LOST_AFTER_S = 45;

const hud = new Hud();

boot().catch((error) => {
  console.error(error);
  showFatal(error?.message ?? String(error));
});

async function boot() {
  const canvas = document.getElementById('viewport');

  const renderer = createRenderer(canvas);
  hud.setBootProgress(0.05, 'Compiling shaders…');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    38,
    window.innerWidth / window.innerHeight,
    0.01,
    400
  );
  camera.position.copy(DEFAULT_CAMERA);

  const controls = createControls(camera, renderer.domElement);

  // --- lighting -----------------------------------------------------------
  // A single key light standing in for the Sun, aimed at the real sub-solar
  // point each frame. Ambient is deliberately near-zero: on the night side the
  // only illumination should be the city lights baked into the emissive map.
  const sunLight = new THREE.DirectionalLight(0xfff4e6, 3.5);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x101d33, 0.5));

  const sun = createSunBillboard();
  scene.add(sun);
  scene.add(createStarfield());

  // --- textures -----------------------------------------------------------
  const textures = await loadEarthTextures(renderer, (fraction, file) => {
    hud.setBootProgress(0.05 + fraction * 0.8, `Loading ${file}…`);
  });

  hud.setBootProgress(0.9, 'Building globe…');
  const earth = new Earth(textures);
  scene.add(earth.group);

  const beacon = new IssBeacon();
  scene.add(beacon.group);

  const composer = createComposer(renderer, scene, camera);

  // --- telemetry ----------------------------------------------------------
  const feed = new IssFeed({ intervalMs: 5000 });
  const propagator = new GroundTrackPropagator();

  const state = {
    hasFix: false,
    altitudeKm: 420,
    visibility: 'unknown',
    reportedVelocityKmh: NaN,
    footprintRadiusKm: null,
    solarLat: NaN,
    solarLon: NaN,
    rttMs: NaN,
    omega: null,
    trailSeeded: false,
    lastTrailAt: 0,
    lastPredictAt: 0,
    lastHudAt: 0,
    follow: false,
  };

  const rendered = new THREE.Vector3(1, 0, 0); // smoothed unit position
  const target = new THREE.Vector3(1, 0, 0);
  const sunDir = new THREE.Vector3(1, 0, 0);
  const projected = new THREE.Vector3();

  feed.on('fix', ({ fix, omega, stale }) => {
    if (stale) return;

    // Snap on acquisition; every later fix is eased in by the render loop.
    if (!state.hasFix) {
      rendered.copy(fix.unit);
      target.copy(fix.unit);
    }
    state.hasFix = true;
    state.altitudeKm = fix.altitudeKm;
    state.visibility = fix.visibility;
    state.reportedVelocityKmh = fix.reportedVelocityKmh;
    state.footprintRadiusKm = fix.footprintRadiusKm;
    state.solarLat = fix.solarLat;
    state.solarLon = fix.solarLon;
    state.rttMs = fix.roundTripMs;
    state.omega = omega;

    propagator.update(fix.unit, fix.epochMs, omega);

    // Once the angular velocity has converged, back-propagate to draw the half
    // hour of ground track that already happened, rather than starting blank.
    if (!state.trailSeeded && omega?.converged) {
      seedTrail(beacon, propagator, feed.now(), fix.epochMs);
      state.trailSeeded = true;
    }
  });

  feed.on('status', ({ ok, failures, error }) => {
    if (!ok) console.warn(`ISS telemetry fetch failed (${failures}):`, error);
  });

  feed.start();

  wireControls({ earth, beacon, composer, camera, controls, state, rendered });

  hud.setBootProgress(1, 'Acquiring telemetry…');
  hud.hideBoot();

  // --- render loop --------------------------------------------------------
  const clock = new THREE.Clock();
  let paused = false;
  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (!paused) clock.getDelta(); // discard the gap so nothing lurches
  });

  // Inspection handle for the browser console and for automated visual checks:
  // lets you drive the camera, toggle objects, or read scene state without
  // reaching through the UI. Read-only as far as the app is concerned.
  window.issTracker = { scene, camera, controls, renderer, composer, earth, beacon, sun, sunLight, feed };

  renderer.setAnimationLoop(() => {
    if (paused) return;

    const delta = Math.min(clock.getDelta(), 0.1);
    const elapsed = clock.elapsedTime;
    const nowMs = feed.now();
    const nowDate = new Date(nowMs);

    // --- Sun ---
    const subsolar = subsolarPoint(nowDate);
    geoToVector(subsolar.lat, subsolar.lon, 1, sunDir);
    sunLight.position.copy(sunDir).multiplyScalar(60);
    sun.position.copy(sunDir).multiplyScalar(80);
    // Apparent size tracks the true Earth–Sun distance, which swings ~3.4%
    // between perihelion and aphelion.
    sun.scale.setScalar(0.92 / subsolar.distanceAu);

    // --- Station ---
    if (state.hasFix) {
      if (propagator.ready) {
        propagator.positionAt((nowMs - propagator.epochMs) / 1000, target);
      } else if (propagator.origin) {
        target.copy(propagator.origin);
      }
      // Ease onto the propagated solution so a corrected fix never pops.
      rendered.lerp(target, 1 - Math.pow(0.0015, delta)).normalize();

      beacon.setPosition(rendered, state.altitudeKm);
      beacon.animate(elapsed, delta);

      if (nowMs - state.lastTrailAt > TRAIL_SAMPLE_MS) {
        state.lastTrailAt = nowMs;
        beacon.pushTrailPoint(rendered);
      }
      if (nowMs - state.lastPredictAt > PREDICT_REFRESH_MS) {
        state.lastPredictAt = nowMs;
        beacon.updatePrediction(
          propagator,
          PREDICT_SECONDS,
          (nowMs - propagator.epochMs) / 1000
        );
      }
    }

    if (state.follow && state.hasFix) {
      // Swing the camera around the globe to hold the station on screen,
      // preserving whatever zoom level the user has chosen.
      const distance = camera.position.length();
      projected.copy(rendered).multiplyScalar(distance);
      camera.position.lerp(projected, 1 - Math.pow(0.12, delta));
    }

    controls.update();

    // Refresh the camera matrices now that controls have moved it: the Earth's
    // day/night shading needs the sun direction in *this* frame's view space,
    // and the reticle projection below needs the same up-to-date matrices.
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    earth.update(sunDir, camera);
    if (state.hasFix) beacon.updateApparentSize(camera);

    if (nowMs - state.lastHudAt > HUD_REFRESH_MS) {
      state.lastHudAt = nowMs;
      updateHud({ feed, state, beacon, propagator, rendered, subsolar, nowDate, camera, renderer });
    }

    composer.render();
  });

  window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
  });

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    feed.stop();
    showFatal('The WebGL context was lost. Reload the page to restart the tracker.');
  });
}

/* ------------------------------------------------------------------------ */

function createRenderer(canvas) {
  if (!canvas) throw new Error('Viewport canvas is missing from the document.');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
  } catch (error) {
    throw new Error('WebGL could not be initialised. This tracker requires a WebGL2 browser.');
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Materials skip tone mapping when rendering into a render target, so the
  // composer's OutputPass is what actually applies ACES — set here for it to read.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

function createControls(camera, domElement) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.rotateSpeed = 0.42;
  controls.zoomSpeed = 0.72;
  controls.enablePan = false;
  controls.minDistance = 1.18;
  controls.maxDistance = 14;
  controls.target.set(0, 0, 0);
  return controls;
}

function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));

  // Threshold sits just above 1.0 so only genuinely over-bright pixels bloom:
  // the beacon core, the Sun, and ocean sun-glint. The lit Earth stays crisp.
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.82,
    0.58,
    1.02
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.userData = { bloom };
  return composer;
}

function createSunBillboard() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0.0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.30, 'rgba(255,246,224,1)');
  gradient.addColorStop(0.42, 'rgba(255,214,140,0.5)');
  gradient.addColorStop(1.0, 'rgba(255,180,80,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
      // Well above 1.0 so the Sun clears the bloom threshold.
      color: new THREE.Color().setRGB(6.0, 5.2, 3.8, THREE.LinearSRGBColorSpace),
    })
  );
  sprite.name = 'sun';
  return sprite;
}

/** Draw the ground track that occurred before the page was opened. */
function seedTrail(beacon, propagator, nowMs, epochMs) {
  const point = new THREE.Vector3();
  const offset = (nowMs - epochMs) / 1000;
  const step = 6;
  beacon.clearTrail();
  for (let t = -TRAIL_SEED_SECONDS; t <= offset; t += step) {
    propagator.positionAt(t, point);
    beacon.pushTrailPoint(point);
  }
}

function wireControls({ earth, beacon, composer, camera, controls, state, rendered }) {
  const bind = (id, handler) => {
    const node = document.getElementById(id);
    node?.addEventListener('change', () => handler(node.checked));
  };

  bind('tg-clouds', (on) => (earth.clouds.visible = on));
  bind('tg-atmos', (on) => (earth.atmosphere.visible = on));
  bind('tg-grid', (on) => (earth.graticule.visible = on));
  bind('tg-track', (on) => (beacon.trail.visible = on));
  bind('tg-predict', (on) => (beacon.predicted.visible = on));
  bind('tg-footprint', (on) => {
    beacon.footprint.visible = on;
    beacon.nadirLine.visible = on;
  });
  bind('tg-bloom', (on) => (composer.userData.bloom.enabled = on));
  bind('tg-follow', (on) => {
    state.follow = on;
    controls.autoRotate = false;
  });

  document.getElementById('btn-goto')?.addEventListener('click', () => {
    if (!state.hasFix) return;
    const distance = THREE.MathUtils.clamp(camera.position.length(), 1.8, 4.5);
    camera.position.copy(rendered).multiplyScalar(distance);
    controls.update();
  });

  const panelsButton = document.getElementById('btn-panels');
  panelsButton?.addEventListener('click', () => {
    const collapsed = document.getElementById('hud')?.classList.toggle('is-collapsed');
    panelsButton.setAttribute('aria-expanded', String(!collapsed));
    panelsButton.title = collapsed ? 'Show panels' : 'Hide panels';
  });

  document.getElementById('btn-reset')?.addEventListener('click', () => {
    camera.position.copy(DEFAULT_CAMERA);
    controls.target.set(0, 0, 0);
    const follow = document.getElementById('tg-follow');
    if (follow) follow.checked = false;
    state.follow = false;
    controls.update();
  });
}

function updateHud({ feed, state, beacon, propagator, rendered, subsolar, nowDate, camera, renderer }) {
  const latest = feed.latest;

  // Read the coordinates back off the rendered position so the panel and the
  // beacon can never disagree — including between fetches, while dead-reckoning.
  const geo = state.hasFix ? vectorToGeo(rendered) : null;
  if (geo) hud.setPosition(geo.lat, geo.lon);

  const orbitRadiusKm = EARTH_RADIUS_KM + state.altitudeKm;
  const converged = Boolean(state.omega?.converged);
  const velocityKms = propagator.ready ? propagator.inertialSpeed(orbitRadiusKm) : NaN;
  const groundSpeedKms = state.omega ? state.omega.rate * orbitRadiusKm : NaN;

  hud.setOrbital({
    altitudeKm: state.altitudeKm,
    // Prefer the locally derived speed once converged; fall back to the API's.
    velocityKmh: converged ? velocityKms * 3600 : state.reportedVelocityKmh,
    velocityKms: converged ? velocityKms : state.reportedVelocityKmh / 3600,
    groundSpeedKms,
    periodSeconds: propagator.periodSeconds,
    orbitRadiusKm,
    footprintRadiusKm:
      state.footprintRadiusKm ?? footprintAngle(state.altitudeKm) * EARTH_RADIUS_KM,
    circularSpeedKms: circularOrbitSpeed(orbitRadiusKm),
    converged,
    baselineSeconds: state.omega?.baselineSeconds ?? 0,
    reportedVelocityKmh: state.reportedVelocityKmh,
  });

  hud.setSolar({
    utc: nowDate.toISOString().slice(11, 19),
    lat: subsolar.lat,
    lon: subsolar.lon,
    declination: subsolar.declination,
    eqTime: subsolar.eqTime,
    distanceAu: subsolar.distanceAu,
    elevation: geo ? solarElevation(geo.lat, geo.lon, subsolar) : NaN,
    apiLat: state.solarLat,
    apiLon: state.solarLon,
  });

  hud.setIllumination(state.visibility);

  // Link health is judged on fix age, not on request success: a dead-reckoned
  // position stays trustworthy for a while after the feed drops.
  const age = feed.ageSeconds;
  if (!state.hasFix) {
    const failing = feed.consecutiveFailures > 0;
    hud.setLink(failing ? 'lost' : 'init', failing ? 'NO SIGNAL' : 'ACQUIRING');
  } else if (age > LOST_AFTER_S) {
    hud.setLink('lost', `SIGNAL LOST · ${Math.round(age)}s`);
  } else if (age > STALE_AFTER_S) {
    hud.setLink('stale', `DEAD RECKONING · ${Math.round(age)}s`);
  } else {
    hud.setLink('live', 'LIVE TELEMETRY');
  }

  hud.setStatus({
    nextFetchSeconds: (feed.nextPollAt - Date.now()) / 1000,
    rttMs: state.rttMs,
    clockOffsetMs: latest ? feed.clockOffsetMs : NaN,
  });

  beacon.setSignalDegraded(age > STALE_AFTER_S);

  updateReticle(state, rendered, camera, renderer);
}

const reticleWorld = new THREE.Vector3();
const reticleClosest = new THREE.Vector3();
const reticleRay = new THREE.Vector3();

function updateReticle(state, rendered, camera, renderer) {
  if (!state.hasFix) {
    hud.setReticle(false);
    return;
  }

  reticleWorld.copy(rendered).multiplyScalar(1 + state.altitudeKm / EARTH_RADIUS_KM);

  // Hide the reticle when the globe occludes the station: find the closest
  // approach of the camera→station segment to the Earth's centre and test it
  // against the surface.
  reticleRay.subVectors(reticleWorld, camera.position);
  const t = THREE.MathUtils.clamp(
    -camera.position.dot(reticleRay) / reticleRay.lengthSq(),
    0,
    1
  );
  reticleClosest.copy(camera.position).addScaledVector(reticleRay, t);
  if (reticleClosest.length() < 0.999) {
    hud.setReticle(false);
    return;
  }

  reticleWorld.project(camera);
  if (reticleWorld.z > 1) {
    hud.setReticle(false);
    return;
  }

  const { width, height } = renderer.domElement.getBoundingClientRect();
  hud.setReticle(
    true,
    (reticleWorld.x * 0.5 + 0.5) * width,
    (-reticleWorld.y * 0.5 + 0.5) * height
  );
}
