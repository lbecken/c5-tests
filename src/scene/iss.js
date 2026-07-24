/**
 * The ISS beacon and its associated track geometry.
 *
 * SCALE NOTE: the station is ~109 m across -- roughly 1/60000th of an Earth
 * radius, so a true-to-scale model would be sub-pixel at any usable zoom. The
 * beacon is therefore a deliberately symbolic marker. Its *position* and
 * *altitude* are true to scale (altitude = 420 km against a 6371 km radius),
 * which is what the readouts claim; only the marker's own size is stylised.
 */

import * as THREE from 'three';
import { EARTH_RADIUS_KM, footprintAngle } from '../astro/geo.js';

const BEACON_RADIUS = 0.014;
const HALO_RATIO = 9;
const TRAIL_MAX_POINTS = 2200;
const PREDICT_SEGMENTS = 320;

/**
 * Apparent-size control. The marker is scaled with camera distance so it holds
 * a roughly constant size on screen: at true scale it would be sub-pixel when
 * zoomed out and would swallow the viewport when zoomed in. The clamps stop it
 * shrinking to nothing at maximum zoom-out or flaring at maximum zoom-in.
 */
const SCALE_PER_UNIT_DISTANCE = 1 / 3.7; // 1.0 at the default camera distance
const SCALE_MIN = 0.06;
const SCALE_MAX = 1.6;

function makeHaloTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0.0, 'rgba(200,244,255,0.95)');
  gradient.addColorStop(0.12, 'rgba(120,214,255,0.55)');
  gradient.addColorStop(0.34, 'rgba(70,160,255,0.16)');
  gradient.addColorStop(1.0, 'rgba(40,110,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class IssBeacon {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'iss';

    this.marker = new THREE.Group();

    // Faceted glass shell. Transmission + iridescence gives the refractive,
    // thin-film "glass-morphic" read; flat shading keeps the facets legible at
    // the small on-screen size the beacon actually occupies.
    this.shellMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xd6f2ff,
      metalness: 0.0,
      roughness: 0.06,
      transmission: 1.0,
      thickness: 0.9,
      ior: 1.48,
      iridescence: 1.0,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [120, 680],
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      specularIntensity: 1.0,
      transparent: true,
      flatShading: true,
    });
    this.shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(BEACON_RADIUS, 1),
      this.shellMaterial
    );

    // Emissive core, pushed well above 1.0 so the bloom threshold catches the
    // beacon while leaving the Earth's own highlights alone.
    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(1.6, 4.4, 7.0, THREE.LinearSRGBColorSpace),
      toneMapped: false,
    });
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(BEACON_RADIUS * 0.46, 24, 16),
      this.coreMaterial
    );

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeHaloTexture(),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      })
    );
    this.halo.scale.setScalar(BEACON_RADIUS * HALO_RATIO);
    this.halo.renderOrder = 5;

    this.marker.add(this.shell, this.core, this.halo);
    this.group.add(this.marker);

    this.nadirLine = this._buildNadirLine();
    this.footprint = this._buildFootprint();
    this.trail = this._buildTrail();
    this.predicted = this._buildPredicted();

    this.group.add(this.nadirLine, this.footprint, this.trail, this.predicted);

    this._trailPositions = this.trail.geometry.attributes.position.array;
    this._trailColors = this.trail.geometry.attributes.color.array;
    this._trailCount = 0;
    this._scratch = new THREE.Vector3();
    this._basisU = new THREE.Vector3();
    this._basisV = new THREE.Vector3();
  }

  _buildNadirLine() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Array(6).fill(0), 3));
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute([0.35, 0.85, 1.0, 0.02, 0.10, 0.22], 3)
    );
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.name = 'iss-nadir';
    return line;
  }

  _buildFootprint() {
    const segments = 180;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Array((segments + 1) * 3).fill(0), 3)
    );
    const material = new THREE.LineBasicMaterial({
      color: 0x3fd8ff,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const loop = new THREE.Line(geometry, material);
    loop.name = 'iss-footprint';
    loop.userData.segments = segments;
    return loop;
  }

  _buildTrail() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(TRAIL_MAX_POINTS * 3), 3)
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(TRAIL_MAX_POINTS * 3), 3)
    );
    geometry.setDrawRange(0, 0);
    // Additive blending makes the fade-to-black tail read as a glow that
    // disappears cleanly, without needing per-vertex alpha.
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.name = 'iss-trail';
    line.frustumCulled = false;
    return line;
  }

  _buildPredicted() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array((PREDICT_SEGMENTS + 1) * 3), 3)
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array((PREDICT_SEGMENTS + 1) * 3), 3)
    );
    geometry.setDrawRange(0, 0);
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.name = 'iss-predicted';
    line.frustumCulled = false;
    return line;
  }

  /** Place the beacon. `unitPosition` is an Earth-fixed unit vector. */
  setPosition(unitPosition, altitudeKm) {
    const orbitRadius = 1 + altitudeKm / EARTH_RADIUS_KM;
    this.marker.position.copy(unitPosition).multiplyScalar(orbitRadius);

    // Nadir line from the station down to its sub-satellite point.
    const nadir = this.nadirLine.geometry.attributes.position;
    nadir.setXYZ(0, this.marker.position.x, this.marker.position.y, this.marker.position.z);
    this._scratch.copy(unitPosition).multiplyScalar(1.001);
    nadir.setXYZ(1, this._scratch.x, this._scratch.y, this._scratch.z);
    nadir.needsUpdate = true;

    this._updateFootprint(unitPosition, altitudeKm);
  }

  _updateFootprint(unitPosition, altitudeKm) {
    const angle = footprintAngle(altitudeKm);
    const R = 1.003;
    const ringRadius = Math.sin(angle) * R;
    const ringHeight = Math.cos(angle) * R;

    // Any two vectors orthogonal to the nadir direction span the ring's plane.
    this._basisU
      .set(0, 1, 0)
      .cross(unitPosition);
    if (this._basisU.lengthSq() < 1e-8) this._basisU.set(1, 0, 0).cross(unitPosition);
    this._basisU.normalize();
    this._basisV.crossVectors(unitPosition, this._basisU).normalize();

    const attribute = this.footprint.geometry.attributes.position;
    const segments = this.footprint.userData.segments;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const c = Math.cos(t) * ringRadius;
      const s = Math.sin(t) * ringRadius;
      attribute.setXYZ(
        i,
        unitPosition.x * ringHeight + this._basisU.x * c + this._basisV.x * s,
        unitPosition.y * ringHeight + this._basisU.y * c + this._basisV.y * s,
        unitPosition.z * ringHeight + this._basisU.z * c + this._basisV.z * s
      );
    }
    attribute.needsUpdate = true;
  }

  /** Append a point to the historical ground track. */
  pushTrailPoint(unitPosition) {
    const R = 1.004;
    if (this._trailCount >= TRAIL_MAX_POINTS) {
      // Drop the oldest sample and shift the buffer down.
      this._trailPositions.copyWithin(0, 3);
      this._trailCount = TRAIL_MAX_POINTS - 1;
    }
    const i = this._trailCount * 3;
    this._trailPositions[i] = unitPosition.x * R;
    this._trailPositions[i + 1] = unitPosition.y * R;
    this._trailPositions[i + 2] = unitPosition.z * R;
    this._trailCount++;

    // Recolour so brightness fades with age.
    for (let k = 0; k < this._trailCount; k++) {
      const age = k / Math.max(1, this._trailCount - 1);
      const level = Math.pow(age, 1.8);
      this._trailColors[k * 3] = 0.10 * level;
      this._trailColors[k * 3 + 1] = 0.72 * level;
      this._trailColors[k * 3 + 2] = 1.0 * level;
    }

    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.color.needsUpdate = true;
    this.trail.geometry.setDrawRange(0, this._trailCount);
  }

  clearTrail() {
    this._trailCount = 0;
    this.trail.geometry.setDrawRange(0, 0);
  }

  /**
   * Redraw the forward ground-track prediction.
   * @param {import('../astro/geo.js').GroundTrackPropagator} propagator
   * @param {number} secondsAhead
   * @param {number} offsetSeconds seconds already elapsed past the propagator epoch
   */
  updatePrediction(propagator, secondsAhead, offsetSeconds) {
    if (!propagator.ready) {
      this.predicted.geometry.setDrawRange(0, 0);
      return;
    }
    const positions = this.predicted.geometry.attributes.position;
    const colors = this.predicted.geometry.attributes.color;
    const R = 1.004;
    for (let i = 0; i <= PREDICT_SEGMENTS; i++) {
      const t = offsetSeconds + (i / PREDICT_SEGMENTS) * secondsAhead;
      propagator.positionAt(t, this._scratch).multiplyScalar(R);
      positions.setXYZ(i, this._scratch.x, this._scratch.y, this._scratch.z);
      const level = 0.55 * (1 - i / PREDICT_SEGMENTS);
      colors.setXYZ(i, level * 0.55, level * 0.30, level * 0.95);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    this.predicted.geometry.setDrawRange(0, PREDICT_SEGMENTS + 1);
  }

  /** Idle animation: slow tumble plus a gentle pulse on the halo. */
  animate(elapsed, delta) {
    this.shell.rotation.y += delta * 0.55;
    this.shell.rotation.x += delta * 0.23;
    const pulse = 1 + Math.sin(elapsed * 2.1) * 0.07;
    this.halo.scale.setScalar(BEACON_RADIUS * HALO_RATIO * pulse);
  }

  /** Keep the marker legible at every zoom level. Call after the camera moves. */
  updateApparentSize(camera) {
    const distance = camera.position.distanceTo(this.marker.position);
    this.marker.scale.setScalar(
      THREE.MathUtils.clamp(distance * SCALE_PER_UNIT_DISTANCE, SCALE_MIN, SCALE_MAX)
    );
  }

  setSignalDegraded(degraded) {
    // Amber core while the feed is stale, cyan when the fix is live.
    this.coreMaterial.color.setRGB(
      degraded ? 7.0 : 1.6,
      degraded ? 3.4 : 4.4,
      degraded ? 0.9 : 7.0,
      THREE.LinearSRGBColorSpace
    );
  }
}
