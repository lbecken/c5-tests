/**
 * Geodetic <-> scene-space conversions and orbital propagation helpers.
 *
 * SCENE FRAME
 * -----------
 * The Earth mesh is a default THREE.SphereGeometry carrying an equirectangular
 * texture, and it never rotates -- so scene space *is* the Earth-fixed (ECEF)
 * frame, with +Y through the geographic north pole.
 *
 * three.js builds sphere vertices as
 *     x = -R * cos(phi) * sin(theta),  y = R * cos(theta),  z = R * sin(phi) * sin(theta)
 * with uv = (u, 1 - v), phi = 2*PI*u and theta = PI*v. An equirectangular map
 * puts longitude -180 at u = 0 and +180 at u = 1, so phi = lon + PI, which
 * reduces to the mapping below. Getting this exactly right is what makes the
 * ISS marker sit over the correct pixel of the Blue Marble texture.
 *
 * NOTE ON LATITUDE: the API reports geodetic (WGS84) latitude, and
 * equirectangular Blue Marble maps are themselves plotted in geodetic latitude.
 * So the geodetic value is used directly -- converting it to geocentric would
 * introduce up to ~21 km of error *relative to the map underneath it*.
 */

import * as THREE from 'three';

const DEG = Math.PI / 180;

/** Mean Earth radius, km. One scene unit == one Earth radius. */
export const EARTH_RADIUS_KM = 6371.0088;
/** Earth's gravitational parameter, km^3/s^2. */
export const MU_EARTH = 398600.4418;
/** Earth's sidereal rotation rate, rad/s. */
export const EARTH_ROTATION_RATE = 7.292115e-5;

export const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/** Geodetic latitude/longitude (degrees) -> scene-space position. */
export function geoToVector(latDeg, lonDeg, radius = 1, target = new THREE.Vector3()) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const cosLat = Math.cos(lat);
  return target.set(
    radius * cosLat * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * cosLat * Math.sin(lon)
  );
}

/** Scene-space position -> geodetic latitude/longitude in degrees. */
export function vectorToGeo(v) {
  const r = v.length() || 1;
  return {
    lat: Math.asin(THREE.MathUtils.clamp(v.y / r, -1, 1)) / DEG,
    lon: Math.atan2(-v.z, v.x) / DEG,
  };
}

/** Angle between two vectors, in radians, numerically stable for small angles. */
export function angleBetween(a, b) {
  const cross = new THREE.Vector3().crossVectors(a, b).length();
  return Math.atan2(cross, a.dot(b));
}

/**
 * Angular velocity of a body in the Earth-fixed frame, derived from two
 * position fixes. Returns an axis/rate pair, or null if the samples are
 * degenerate (identical positions, or zero elapsed time).
 */
export function angularVelocity(fromUnit, toUnit, dtSeconds) {
  if (!(dtSeconds > 0)) return null;
  const axis = new THREE.Vector3().crossVectors(fromUnit, toUnit);
  if (axis.lengthSq() < 1e-18) return null;
  axis.normalize();
  const rate = angleBetween(fromUnit, toUnit) / dtSeconds;
  if (!(rate > 0)) return null;
  return { axis, rate };
}

/**
 * Ground-track propagator.
 *
 * The ISS travels a great circle in the *inertial* frame, but the scene is
 * Earth-fixed, so a naive great circle through the current position would drift
 * away from the truth within minutes. This converts the observed Earth-fixed
 * motion into inertial motion (by adding back Earth's spin about +Y), advances
 * along the inertial great circle, then de-rotates by Earth's spin to land back
 * in scene space. That reproduces the characteristic westward walk of each
 * successive ground track.
 */
export class GroundTrackPropagator {
  constructor() {
    /** @type {THREE.Vector3|null} unit position at the epoch */
    this.origin = null;
    /** @type {THREE.Vector3|null} inertial rotation axis */
    this.inertialAxis = null;
    /** inertial angular rate, rad/s */
    this.inertialRate = 0;
    /** epoch, ms since Unix epoch */
    this.epochMs = 0;
    this._q = new THREE.Quaternion();
    this._spin = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  get ready() {
    return this.origin !== null && this.inertialRate > 0;
  }

  /**
   * @param {THREE.Vector3} unitPosition Earth-fixed unit position at `epochMs`.
   * @param {{axis: THREE.Vector3, rate: number}|null} ecefOmega Earth-fixed angular velocity.
   */
  update(unitPosition, epochMs, ecefOmega) {
    this.origin = unitPosition.clone().normalize();
    this.epochMs = epochMs;
    if (!ecefOmega) {
      this.inertialAxis = null;
      this.inertialRate = 0;
      return;
    }
    // omega_inertial = omega_earthfixed + omega_earth * yhat
    const omega = ecefOmega.axis.clone().multiplyScalar(ecefOmega.rate);
    omega.y += EARTH_ROTATION_RATE;
    this.inertialRate = omega.length();
    this.inertialAxis = this.inertialRate > 0 ? omega.divideScalar(this.inertialRate) : null;
  }

  /** Earth-fixed unit position `seconds` after the epoch. */
  positionAt(seconds, target = new THREE.Vector3()) {
    if (!this.origin) return target.set(0, 0, 0);
    target.copy(this.origin);
    if (!this.inertialAxis) return target;
    // Advance along the inertial great circle (frames coincide at the epoch)...
    this._q.setFromAxisAngle(this.inertialAxis, this.inertialRate * seconds);
    target.applyQuaternion(this._q);
    // ...then undo Earth's rotation to return to the Earth-fixed frame.
    this._spin.setFromAxisAngle(this._up, -EARTH_ROTATION_RATE * seconds);
    return target.applyQuaternion(this._spin);
  }

  /** Inertial orbital speed at a given orbital radius, km/s. */
  inertialSpeed(radiusKm) {
    return this.inertialRate * radiusKm;
  }

  /** Orbital period implied by the inertial rate, seconds. */
  get periodSeconds() {
    return this.inertialRate > 0 ? (2 * Math.PI) / this.inertialRate : 0;
  }
}

/** Circular-orbit speed at radius r, km/s. Used as a sanity reference. */
export function circularOrbitSpeed(radiusKm) {
  return Math.sqrt(MU_EARTH / radiusKm);
}

/**
 * Half-angle of the ISS's visibility footprint, in radians -- the Earth-central
 * angle to the horizon as seen from orbital altitude.
 */
export function footprintAngle(altitudeKm) {
  return Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm));
}

/** Format a signed decimal degree as degrees/minutes/seconds with a hemisphere. */
export function formatDMS(value, positive, negative) {
  const hemi = value >= 0 ? positive : negative;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  return `${deg}° ${String(min).padStart(2, '0')}' ${sec.toFixed(1).padStart(4, '0')}" ${hemi}`;
}
