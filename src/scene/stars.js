/**
 * Procedural starfield.
 *
 * Generated rather than textured: an equirectangular sky photo would visibly
 * pinch at the poles, and a point cloud gives crisp stars at any zoom level.
 * Magnitudes follow a rough power law so a handful of bright stars dominate,
 * which reads far more like a real sky than a uniform sprinkle.
 */

import * as THREE from 'three';

/** Rough blackbody tints from hot blue-white through to cool red. */
const SPECTRAL_TINTS = [
  [0.62, 0.74, 1.0],
  [0.78, 0.85, 1.0],
  [1.0, 1.0, 1.0],
  [1.0, 0.96, 0.86],
  [1.0, 0.87, 0.68],
  [1.0, 0.74, 0.56],
];

function makeStarSprite() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0.0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createStarfield(count = 9000, radius = 90) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Uniform on the sphere: cos(theta) must be uniform, not theta itself.
    const u = Math.random() * 2 - 1;
    const phi = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = radius * s * Math.cos(phi);
    positions[i * 3 + 1] = radius * u;
    positions[i * 3 + 2] = radius * s * Math.sin(phi);

    // Power law: most stars faint, a few genuinely bright.
    const brightness = Math.pow(Math.random(), 3.2);
    const tint = SPECTRAL_TINTS[(Math.random() * SPECTRAL_TINTS.length) | 0];
    const level = 0.22 + brightness * 1.9;
    colors[i * 3] = tint[0] * level;
    colors[i * 3 + 1] = tint[1] * level;
    colors[i * 3 + 2] = tint[2] * level;

    sizes[i] = 0.10 + brightness * 0.68;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSprite: { value: makeStarSprite() },
      uScale: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      varying vec3 vColor;
      uniform float uScale;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        // Guard the divide: a star exactly on the camera plane would otherwise
        // produce an infinite point size.
        gl_PointSize = aSize * uScale * ( 300.0 / max( -mvPosition.z, 0.001 ) );
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSprite;
      varying vec3 vColor;
      void main() {
        vec4 sprite = texture2D( uSprite, gl_PointCoord );
        if ( sprite.a < 0.01 ) discard;
        gl_FragColor = vec4( vColor * sprite.a, sprite.a );
      }
    `,
    vertexColors: true,
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'starfield';
  points.frustumCulled = false;
  return points;
}
