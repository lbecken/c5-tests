import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Rendering.
 *
 * One InstancedMesh carries the whole ribbon; the simulation hands over a flat
 * Float32Array of transforms and colours each frame and we blit them straight
 * into the instance attributes.
 *
 * The material is deliberately not a PBR one. IRIX-era hardware drew flat,
 * saturated, self-lit polygons, and that is most of the charm — so the shader
 * does exactly two things: shade by how square-on the polygon is to the camera
 * (which is what makes the ribbon flash as it turns), and draw a bright
 * analytic edge. Bloom then does the rest.
 */

const VERT = /* glsl */`
  attribute vec3 aEdge;

  varying vec3 vEdge;
  varying vec3 vNrm;
  varying vec3 vPos;
  varying vec3 vTint;
  varying float vDepth;

  void main() {
    vEdge = aEdge;
    vTint = instanceColor;

    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vPos = mv.xyz;
    vDepth = -mv.z;

    mat3 im = mat3(instanceMatrix);
    vNrm = normalize(normalMatrix * (im * normal));

    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  uniform float uEdge;        // edge glow strength
  uniform float uFill;        // face opacity: 0 gives wireframe
  uniform float uEdgeWidth;   // edge thickness in pixels
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3  uFogColor;

  varying vec3 vEdge;
  varying vec3 vNrm;
  varying vec3 vPos;
  varying vec3 vTint;
  varying float vDepth;

  void main() {
    vec3 N = normalize(vNrm);
    vec3 V = normalize(-vPos);
    float facing = abs(dot(N, V));            // two-sided: no dark back faces

    // Square-on polygons burn; edge-on ones fade. This is the flicker.
    float body = 0.16 + 0.84 * pow(facing, 0.9);
    vec3 col = vTint * body * uFill;

    #ifdef SHAPE_QUAD
      vec2 q = vEdge.xy;
      float d = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
    #else
      float d = min(min(vEdge.x, vEdge.y), vEdge.z);
    #endif

    // Screen-space constant edge width, so the outline stays crisp at any depth.
    float w = fwidth(d) * uEdgeWidth + 1e-6;
    float line = 1.0 - smoothstep(0.0, w, d);

    // Keep the edge tinted rather than white: white edges plus bloom just
    // bleaches the frame, and the colour is the whole point.
    vec3 hot = mix(vTint, vec3(1.0), 0.28) * 1.7;
    col += hot * line * uEdge;

    float alpha = clamp(max(uFill, line * uEdge * 1.6), 0.0, 1.0);
    if (alpha < 0.004) discard;

    float fog = 1.0 - clamp((vDepth - uFogNear) / max(0.001, uFogFar - uFogNear), 0.0, 1.0);
    col = mix(uFogColor, col, fog);

    gl_FragColor = vec4(col, alpha);
  }
`;

function triangleGeometry() {
  const g = new THREE.BufferGeometry();
  // Equilateral, circumradius 1, pointing up.
  const a = Math.PI / 2;
  const pts = [];
  for (let i = 0; i < 3; i++) {
    const t = a + (i * Math.PI * 2) / 3;
    pts.push(Math.cos(t), Math.sin(t), 0);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  // Barycentric coordinates give us the distance to the nearest edge for free.
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1], 3));
  return g;
}

function quadGeometry() {
  const g = new THREE.BufferGeometry();
  const s = 0.78;
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -s, -s, 0, s, -s, 0, s, s, 0,
    -s, -s, 0, s, s, 0, -s, s, 0,
  ], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  // For a quad the third component is unused; xy is the unit square.
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute([
    0, 0, 0, 1, 0, 0, 1, 1, 0,
    0, 0, 0, 1, 1, 0, 0, 1, 0,
  ], 3));
  return g;
}

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setClearColor(0x01030a, 1);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 4000);
    this.camera.position.set(0, 0, 60);

    this.model = new THREE.Group();
    this.scene.add(this.model);

    this.uniforms = {
      uEdge: { value: 0.62 },   // driven by setEdge/setFilled
      uFill: { value: 1.0 },
      uEdgeWidth: { value: 1.6 },
      uFogNear: { value: 120 },
      uFogFar: { value: 420 },
      uFogColor: { value: new THREE.Color(0x01030a) },
    };

    this.edgeBase = 0.62;
    this.filled = true;
    this.shape = 'triangle';
    this.mesh = null;
    this.capacity = 0;
    this._makeMesh(420, 'triangle');

    this._buildComposer();

    // Camera state
    this.mode = 'drift';
    this.spin = 0.09;
    this.tilt = [-0.35, 0.35];
    this.clock = 0;
    this.smoothCentre = new THREE.Vector3();
    this.smoothDist = 60;
    this.zoom = 1;
    this.manual = { yaw: 0.6, pitch: 0.25, target: { yaw: 0.6, pitch: 0.25 } };

    // Scratch vectors for the framing solver — it runs over every polygon
    // every frame, so it allocates nothing.
    this._look = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this._back = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._probe = new THREE.Vector3();
    this.lateral = new THREE.Vector3();
    this._first = true;
  }

  // -------------------------------------------------------------- geometry --

  _makeMesh(capacity, shape) {
    if (this.mesh) {
      this.model.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }

    const geo = shape === 'quad' ? quadGeometry() : triangleGeometry();
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      transparent: false,
      defines: shape === 'quad' ? { SHAPE_QUAD: '' } : {},
    });

    const mesh = new THREE.InstancedMesh(geo, mat, capacity);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3), 3,
    );
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    this.model.add(mesh);
    this.mesh = mesh;
    this.capacity = capacity;
    this.shape = shape;
  }

  setShape(shape) {
    if (shape === this.shape) return;
    this._makeMesh(this.capacity, shape);
  }

  setFilled(on) {
    this.filled = on;
    this.uniforms.uFill.value = on ? 1 : 0;
    // With the faces gone there is far less light in the frame, so the edges
    // have to carry it.
    this.uniforms.uEdge.value = this.edgeBase * (on ? 1 : 2.1);
    const m = this.mesh.material;
    m.transparent = !on;
    m.depthWrite = on;
    m.blending = on ? THREE.NormalBlending : THREE.AdditiveBlending;
    m.needsUpdate = true;
  }

  // ---------------------------------------------------------------- passes --

  _buildComposer() {
    const size = this.renderer.getSize(new THREE.Vector2());

    // The composer's default buffer has no MSAA, and with a screen full of thin
    // bright triangle edges that is very visible. Half-float keeps the edge
    // highlights above 1.0 so bloom has something to work with.
    const target = new THREE.WebGLRenderTarget(
      Math.max(1, size.x), Math.max(1, size.y),
      { type: THREE.HalfFloatType, samples: 4 },
    );

    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.afterimage = new AfterimagePass(0.5);
    this.afterimage.enabled = true;
    this.composer.addPass(this.afterimage);

    // Tight radius and a high threshold: only the edge highlights and the
    // brightest faces glow, which keeps the background properly black instead
    // of letting a wide bloom lift the whole frame into haze.
    this.bloom = new UnrealBloomPass(size, 0.55, 0.4, 0.8);
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());
  }

  setBloom(strength) {
    this.bloom.strength = strength;
    this.bloom.enabled = strength > 0.001;
  }

  setTrails(damp) {
    this.afterimage.enabled = damp > 0.02;
    this.afterimage.uniforms.damp.value = Math.min(0.965, damp);
  }

  setEdge(v) {
    this.edgeBase = v;
    this.uniforms.uEdge.value = v * (this.filled ? 1 : 2.1);
  }

  resize(w, h, dpr) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ----------------------------------------------------------------- frame --

  /** Push the simulation's output into the instance buffers. */
  sync(system) {
    if (system.count > this.capacity) {
      this._makeMesh(Math.ceil(system.count * 1.25), this.shape);
      this.setFilled(this.uniforms.uFill.value > 0.5);
    }
    const mesh = this.mesh;
    mesh.count = system.count;
    mesh.instanceMatrix.array.set(system.matrices);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.array.set(system.colors);
    mesh.instanceColor.needsUpdate = true;
  }

  /**
   * Centre the ribbon in frame and work out how far back the camera has to sit
   * to hold all of it.
   *
   * A bounding sphere around the centroid would be far simpler, but these
   * shapes are wildly anisotropic — Ribbon is a long flat band, Rosette a disc
   * — and their centre of mass is rarely their visual centre, so a sphere fit
   * both wastes most of the frame and hangs the subject off to one side. This
   * instead works in the camera's own basis: pass one finds the lateral offset
   * that centres the silhouette, pass two solves the exact distance at which
   * the furthest polygon lands on the edge of the frustum.
   *
   * `back` points from the subject toward the camera.
   */
  _fitAndCentre(system, back, dt) {
    const right = this._right.set(0, 1, 0).cross(back);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up = this._up.copy(back).cross(right).normalize();

    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5);
    const tanH = tanV * this.camera.aspect;

    const pos = system.positions;
    const count = system.count;
    const pad = system.maxSize;
    const q = this._probe;
    const rot = this.model.quaternion;

    const world = (k) => q
      .set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2])
      .applyQuaternion(rot)
      .add(this.model.position);

    // Pass one: where is the silhouette actually centred?
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let k = 0; k < count; k++) {
      world(k);
      const x = q.dot(right);
      const y = q.dot(up);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    // Nudge toward centred rather than snapping — this is a feedback loop that
    // runs every frame, so a partial correction still converges, and the lag is
    // what keeps the composition feeling hand-held instead of clamped.
    const alpha = this._first ? 1 : 1 - Math.exp(-dt * 1.2);
    const dx = -((minX + maxX) * 0.5) * alpha;
    const dy = -((minY + maxY) * 0.5) * alpha;
    this.lateral.addScaledVector(right, dx).addScaledVector(up, dy);
    this.model.position.addScaledVector(right, dx).addScaledVector(up, dy);
    this.model.updateMatrixWorld(true);

    // Pass two: for a camera at distance D looking at the origin, a point q is
    // inside the frustum when |q.right| <= tanH * (D - q.back). Solve for D and
    // take the worst offender.
    let need = 0;
    for (let k = 0; k < count; k++) {
      world(k);
      const z = q.dot(back);
      const x = Math.abs(q.dot(right)) + pad;
      const y = Math.abs(q.dot(up)) + pad;
      const d = Math.max(z + x / tanH, z + y / tanV);
      if (d > need) need = d;
    }
    return need;
  }

  update(system, dt) {
    this.clock += dt;
    this.sync(system);

    const t = this.clock;
    const settle = this._first ? 1 : 1 - Math.exp(-dt * 1.6);
    this.smoothCentre.lerp(system.centroid, settle);

    // Spin first, then slide the model so its own centre of mass lands on the
    // world origin. Without this the group would swivel about the origin and
    // sling the ribbon out of frame, because the simulation has no reason to
    // keep its centroid anywhere in particular.
    if (this.mode === 'inside') {
      this.model.rotation.y += dt * this.spin * 0.3;
    } else if (this.mode === 'manual') {
      this.model.rotation.y += dt * this.spin * 0.25;
    } else if (this.mode === 'orbit') {
      this.model.rotation.y += dt * this.spin;
    } else {
      this.model.rotation.y += dt * this.spin;
      this.model.rotation.x = Math.sin(t * 0.019) * 0.12;
    }
    this.model.position
      .copy(this.smoothCentre)
      .applyQuaternion(this.model.quaternion)
      .negate()
      .add(this.lateral);
    this.model.updateMatrixWorld(true);

    if (this.mode === 'inside') {
      // Ride the ribbon: sit on the spine and look back down it.
      const n = system.count;
      const pos = system.positions;
      const lead = Math.floor((t * 26) % n);
      const trail = (lead + Math.floor(n * 0.16)) % n;
      this._eye.set(pos[lead * 3], pos[lead * 3 + 1], pos[lead * 3 + 2])
        .applyMatrix4(this.model.matrixWorld);
      this._look.set(pos[trail * 3], pos[trail * 3 + 1], pos[trail * 3 + 2])
        .applyMatrix4(this.model.matrixWorld);
      // Back off along the eye->look line so we are not inside a polygon.
      this._eye.lerp(this._look, -0.35);
      this.camera.position.lerp(this._eye, 1 - Math.exp(-dt * 3.5));
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this._look);
      this.smoothDist = this.camera.position.length() || 1;
      this._first = false;
    } else {
      let yaw, pitch;
      if (this.mode === 'manual') {
        const s = 1 - Math.exp(-dt * 7);
        this.manual.yaw += (this.manual.target.yaw - this.manual.yaw) * s;
        this.manual.pitch += (this.manual.target.pitch - this.manual.pitch) * s;
        yaw = this.manual.yaw;
        pitch = this.manual.pitch;
      } else if (this.mode === 'orbit') {
        yaw = t * 0.13;
        pitch = 0.22 + Math.sin(t * 0.07) * 0.18;
      } else {
        // Drift: two slow incommensurate sinusoids, so the viewpoint never
        // repeats and never sits still.
        const [lo, hi] = this.tilt;
        yaw = t * 0.055 + Math.sin(t * 0.031) * 0.9;
        pitch = lo + (hi - lo) * (0.5 + 0.5 * Math.sin(t * 0.043 + 1.1));
      }

      const cp = Math.cos(pitch);
      const back = this._back.set(
        Math.sin(yaw) * cp,
        Math.sin(pitch),
        Math.cos(yaw) * cp,
      ).normalize();

      // Just under an exact fit, so the ribbon kisses the edges of the frame
      // rather than floating inside it. Smoothed hard on the way out: the shape
      // can change quickly, the camera must not.
      const want = this._fitAndCentre(system, back, dt) * this.zoom;
      this.smoothDist += (want - this.smoothDist)
        * (this._first ? 1 : 1 - Math.exp(-dt * 0.9));
      this._first = false;

      this._eye.copy(back).multiplyScalar(this.smoothDist);
      this.camera.up.set(0, 1, 0);
      this.camera.position.lerp(this._eye, 1 - Math.exp(-dt * 3.0));
      this.camera.lookAt(0, 0, 0);
    }

    const dist = this.smoothDist;

    // Depth cue scaled to whatever we are currently looking at.
    this.uniforms.uFogNear.value = dist * 0.9;
    this.uniforms.uFogFar.value = dist * 2.6;

    this.camera.far = Math.max(400, dist * 4);
    this.camera.near = Math.max(0.05, dist * 0.002);
    this.camera.updateProjectionMatrix();

    this.composer.render(dt);
  }

  setChoreoLook(choreo) {
    this.spin = choreo.spin;
    this.tilt = choreo.tilt;
  }
}
