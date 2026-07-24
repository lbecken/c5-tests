/**
 * Numerical verification for the tracker's astronomy and orbital mechanics.
 *
 * These are the parts that are easy to get subtly, invisibly wrong: a
 * terminator on the wrong meridian or a marker 20 km off still *looks* fine.
 * Every check below compares against an independently known value -- published
 * equinox/solstice instants, textbook equation-of-time extrema, the geometry
 * three.js actually builds, or a closed-form two-body orbit.
 *
 * Run with:  npm test
 */

import * as THREE from 'three';
import { subsolarPoint, solarPosition, solarElevation } from '../src/astro/solar.js';
import {
  geoToVector,
  vectorToGeo,
  angularVelocity,
  GroundTrackPropagator,
  circularOrbitSpeed,
  footprintAngle,
  EARTH_RADIUS_KM,
  EARTH_ROTATION_RATE,
} from '../src/astro/geo.js';

let failures = 0;
let checks = 0;

function ok(label, condition, detail = '') {
  checks++;
  if (!condition) failures++;
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

function near(label, actual, expected, tolerance, unit = '') {
  const delta = Math.abs(actual - expected);
  ok(
    label,
    delta <= tolerance,
    `got ${actual.toFixed(4)}${unit}, expected ${expected}${unit} ±${tolerance}${unit}`
  );
}

const section = (title) => console.log(`\n${title}\n${'-'.repeat(title.length)}`);

/* ------------------------------------------------------------------ */
section('Solar ephemeris');

// Published equinox/solstice instants for 2026 (UTC). Declination must pass
// through zero at the equinoxes and reach the obliquity at the solstices.
near('March equinox declination ~ 0', subsolarPoint(new Date('2026-03-20T14:46:00Z')).lat, 0, 0.01, '°');
near('September equinox declination ~ 0', subsolarPoint(new Date('2026-09-23T00:06:00Z')).lat, 0, 0.01, '°');
near('June solstice declination ~ +23.44', subsolarPoint(new Date('2026-06-21T08:25:00Z')).lat, 23.44, 0.01, '°');
near('December solstice declination ~ -23.44', subsolarPoint(new Date('2026-12-21T20:50:00Z')).lat, -23.44, 0.01, '°');

// Equation of time extrema, ~-14.2 min in mid-February and ~+16.4 min in early
// November. These bracket the correction that positions the sub-solar meridian.
near('EoT February minimum', subsolarPoint(new Date('2026-02-11T12:00:00Z')).eqTime, -14.2, 0.15, ' min');
near('EoT November maximum', subsolarPoint(new Date('2026-11-03T12:00:00Z')).eqTime, 16.4, 0.15, ' min');

// Earth's orbital distance must swing between perihelion and aphelion.
near('Perihelion distance (early Jan)', solarPosition(new Date('2026-01-03T12:00:00Z')).distanceAu, 0.9833, 0.0004, ' AU');
near('Aphelion distance (early Jul)', solarPosition(new Date('2026-07-06T12:00:00Z')).distanceAu, 1.0167, 0.0004, ' AU');

// The sub-solar meridian must sweep west at exactly 15°/hour.
{
  const base = subsolarPoint(new Date(Date.UTC(2026, 3, 16, 0)));
  const later = subsolarPoint(new Date(Date.UTC(2026, 3, 16, 6)));
  let drift = ((base.lon - later.lon + 540) % 360) - 180;
  near('Sub-solar longitude sweeps 15°/h', drift, 90, 0.15, '°');
}

// Self-consistency: the Sun is overhead at the sub-solar point by definition.
{
  const s = subsolarPoint(new Date('2026-07-24T12:00:00Z'));
  near('Solar elevation at sub-solar point', solarElevation(s.lat, s.lon, s), 90, 1e-6, '°');
  near('Solar elevation at antipode', solarElevation(-s.lat, s.lon + 180, s), -90, 1e-6, '°');
}

/* ------------------------------------------------------------------ */
section('Geodetic mapping');

// The marker must land on the same point of the sphere that the equirectangular
// texture puts that latitude/longitude on. Compare against the UVs three.js
// actually generates rather than against the same formula twice.
{
  const segments = 720;
  const geometry = new THREE.SphereGeometry(1, segments, segments / 2);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const quantisationKm = (2 * Math.PI * EARTH_RADIUS_KM) / segments;

  let worst = 0;
  for (const [lat, lon] of [
    [0, 0], [51.5, -0.13], [-33.87, 151.21], [40.71, -74.01],
    [35.68, 139.69], [-22.91, -43.17], [90, 0], [-90, 0],
    [0, 179.9], [0, -179.9], [-51.6, 120], [51.6, -120],
  ]) {
    const targetU = (lon + 180) / 360;
    const targetV = (90 - lat) / 180;
    let best = Infinity;
    let index = -1;
    for (let i = 0; i < uv.count; i++) {
      const du = uv.getX(i) - targetU;
      const dv = 1 - uv.getY(i) - targetV;
      const d = du * du + dv * dv;
      if (d < best) { best = d; index = i; }
    }
    const meshPoint = new THREE.Vector3().fromBufferAttribute(position, index);
    worst = Math.max(worst, geoToVector(lat, lon).distanceTo(meshPoint) * EARTH_RADIUS_KM);
  }
  ok(
    'geoToVector agrees with SphereGeometry UV layout',
    worst < quantisationKm,
    `worst ${worst.toFixed(1)} km, below the ${quantisationKm.toFixed(0)} km grid step`
  );
}

// Round trip through the scene and back must be lossless.
{
  let worst = 0;
  for (let i = 0; i < 20000; i++) {
    const lat = (Math.asin(Math.random() * 2 - 1) * 180) / Math.PI;
    const lon = Math.random() * 360 - 180;
    const back = vectorToGeo(geoToVector(lat, lon, 1.066));
    worst = Math.max(
      worst,
      Math.abs(back.lat - lat),
      Math.abs((((back.lon - lon + 540) % 360) - 180))
    );
  }
  ok('geo round trip is lossless', worst < 1e-9, `worst ${worst.toExponential(1)}°`);
}

near('Footprint radius at 420 km', footprintAngle(420) * EARTH_RADIUS_KM, 2250, 40, ' km');

/* ------------------------------------------------------------------ */
section('Orbital propagation');

// Closed-form two-body ISS-like orbit, de-spun into the Earth-fixed frame --
// the same transformation the propagator has to invert from sampled positions.
const INCLINATION = (51.64 * Math.PI) / 180;
const ALTITUDE_KM = 420;
const ORBIT_RADIUS = EARTH_RADIUS_KM + ALTITUDE_KM;
const MEAN_MOTION = Math.sqrt(398600.4418 / ORBIT_RADIUS ** 3);
const AXIS = new THREE.Vector3(Math.sin(INCLINATION), Math.cos(INCLINATION), 0).normalize();
const START = new THREE.Vector3().crossVectors(AXIS, new THREE.Vector3(0, 1, 0)).normalize();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const truthAt = (t) =>
  START.clone()
    .applyQuaternion(new THREE.Quaternion().setFromAxisAngle(AXIS, MEAN_MOTION * t))
    .applyQuaternion(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, -EARTH_ROTATION_RATE * t));

const BASELINE = 90; // must match BASELINE_TARGET_S in src/data/issFeed.js
const propagator = new GroundTrackPropagator();
propagator.update(
  truthAt(BASELINE),
  BASELINE * 1000,
  angularVelocity(truthAt(0), truthAt(BASELINE), BASELINE)
);

near('Recovered orbital period', propagator.periodSeconds / 60, (2 * Math.PI) / MEAN_MOTION / 60, 0.01, ' min');
near('Recovered inertial speed', propagator.inertialSpeed(ORBIT_RADIUS), circularOrbitSpeed(ORBIT_RADIUS), 0.001, ' km/s');

// Dead reckoning has to be essentially exact across a fetch interval (5 s) and
// stay usable if the feed drops. The long horizons are much looser on purpose:
// they only feed the seeded trail and the forward prediction line, which are
// visualisation aids, and the HUD flags the link as lost after 45 s regardless.
// A single Keplerian arc also ignores J2 and drag, so error grows with time.
for (const [ahead, tolerance] of [[5, 0.05], [60, 0.5], [300, 3], [1800, 80]]) {
  const error = propagator.positionAt(ahead).distanceTo(truthAt(BASELINE + ahead)) * EARTH_RADIUS_KM;
  ok(`Dead reckoning +${ahead}s within ${tolerance} km`, error <= tolerance, `${error.toFixed(3)} km`);
}

// The 90 s differencing baseline is a deliberate trade: the API stamps
// positions to whole seconds, so short baselines are swamped by quantisation,
// while long ones start to feel the curvature of the Earth-fixed track.
section('Differencing baseline trade-off (informational)');
console.log('  base(s)  speed err (exact)  speed err (±1 s epoch)  dead-reckon @5 s');
for (const base of [5, 10, 30, 60, 90, 180]) {
  const clean = new GroundTrackPropagator();
  clean.update(truthAt(base), 0, angularVelocity(truthAt(0), truthAt(base), base));
  const exact = Math.abs(clean.inertialSpeed(ORBIT_RADIUS) - circularOrbitSpeed(ORBIT_RADIUS)) / circularOrbitSpeed(ORBIT_RADIUS) * 100;

  let quantised = 0;
  for (const skew of [-1, 1]) {
    const p = new GroundTrackPropagator();
    p.update(truthAt(base + skew), 0, angularVelocity(truthAt(0), truthAt(base + skew), base));
    quantised = Math.max(quantised, Math.abs(p.inertialSpeed(ORBIT_RADIUS) - circularOrbitSpeed(ORBIT_RADIUS)) / circularOrbitSpeed(ORBIT_RADIUS) * 100);
  }
  const drift = clean.positionAt(5).distanceTo(truthAt(base + 5)) * EARTH_RADIUS_KM;
  console.log(
    `  ${String(base).padStart(7)}  ${exact.toFixed(4).padStart(16)}%  ${quantised.toFixed(4).padStart(21)}%  ${drift.toFixed(3).padStart(14)} km`
  );
}

/* ------------------------------------------------------------------ */
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} — ${checks} total\n`);
process.exit(failures === 0 ? 0 : 1);
