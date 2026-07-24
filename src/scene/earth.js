/**
 * The Earth: a Blue Marble globe, a cloud deck, and an atmospheric shell.
 *
 * The globe never rotates -- scene space is the Earth-fixed frame (see geo.js),
 * so day/night motion comes entirely from moving the key light to the real
 * sub-solar direction. That keeps the terminator on the correct meridian
 * instead of merely looking plausible.
 */

import * as THREE from 'three';

const TEXTURE_PATH = 'assets/textures/';

/** Load the texture set, tagging colour spaces correctly for a linear pipeline. */
export function loadEarthTextures(renderer, onProgress) {
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const files = {
    day: ['earth_daymap_4k.jpg', THREE.SRGBColorSpace],
    night: ['earth_night_2k.png', THREE.SRGBColorSpace],
    normal: ['earth_normal_2k.jpg', THREE.NoColorSpace],
    specular: ['earth_specular_2k.jpg', THREE.NoColorSpace],
    clouds: ['earth_clouds_2k.png', THREE.NoColorSpace],
  };

  const entries = Object.entries(files);
  let done = 0;

  return Promise.all(
    entries.map(
      ([key, [file, colorSpace]]) =>
        new Promise((resolve, reject) => {
          loader.load(
            TEXTURE_PATH + file,
            (texture) => {
              texture.colorSpace = colorSpace;
              texture.anisotropy = maxAniso;
              texture.wrapS = THREE.RepeatWrapping;
              texture.wrapT = THREE.ClampToEdgeWrapping;
              onProgress?.(++done / entries.length, file);
              resolve([key, texture]);
            },
            undefined,
            () => reject(new Error(`Failed to load texture: ${file}`))
          );
        })
    )
  ).then(Object.fromEntries);
}

export class Earth {
  /**
   * @param {Record<string, THREE.Texture>} textures
   */
  constructor(textures) {
    this.group = new THREE.Group();

    // Shared with the injected shader code; updated once per frame from main.js.
    this.uniforms = {
      uSunDirView: { value: new THREE.Vector3(1, 0, 0) },
      uNightIntensity: { value: 2.6 },
      uNightTint: { value: new THREE.Color(1.0, 0.83, 0.55) },
      uTwilight: { value: new THREE.Vector2(-0.10, 0.16) },
      uRoughLand: { value: 0.93 },
      uRoughOcean: { value: 0.42 },
    };

    this.surface = this._buildSurface(textures);
    this.clouds = this._buildClouds(textures.clouds);
    this.atmosphere = this._buildAtmosphere();
    this.graticule = this._buildGraticule();

    this.group.add(this.surface, this.clouds, this.atmosphere, this.graticule);
    this.graticule.visible = false;
  }

  _buildSurface(textures) {
    const material = new THREE.MeshStandardMaterial({
      map: textures.day,
      normalMap: textures.normal,
      normalScale: new THREE.Vector2(0.72, 0.72),
      roughnessMap: textures.specular,
      metalness: 0.0,
      roughness: 1.0,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: textures.night,
      emissiveIntensity: 1.0,
    });

    const u = this.uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          uniform vec3  uSunDirView;
          uniform float uNightIntensity;
          uniform vec3  uNightTint;
          uniform vec2  uTwilight;
          uniform float uRoughLand;
          uniform float uRoughOcean;
        `
        )
        // The bundled specular map is bright over water. Invert it so oceans are
        // smooth enough to throw a real specular sun-glint and land stays matte.
        .replace(
          '#include <roughnessmap_fragment>',
          /* glsl */ `
          float roughnessFactor = roughness;
          #ifdef USE_ROUGHNESSMAP
            vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
            roughnessFactor = mix( uRoughLand, uRoughOcean, texelRoughness.g );
          #endif
        `
        )
        // City lights, revealed across the twilight band rather than snapping on
        // at the geometric terminator.
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `
          #ifdef USE_EMISSIVEMAP
            vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
            float sunDot = dot( normalize( nonPerturbedNormal ), normalize( uSunDirView ) );
            float night = smoothstep( uTwilight.x, uTwilight.y, -sunDot );
            totalEmissiveRadiance = emissiveColor.rgb * uNightTint * uNightIntensity * night;
          #endif
        `
        )
        // Grazing-angle specular across the near-mirror ocean spikes by orders
        // of magnitude at the sunlit limb. Unclamped it overflows the bloom
        // pass's half-float targets, and the resulting non-finite texel poisons
        // every level of the mip pyramid -- which shows up as hard nested
        // squares. The cap sits well above the bloom threshold, so sun-glint
        // still blooms; it just stays finite.
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `
          #ifdef OPAQUE
            diffuseColor.a = 1.0;
          #endif
          #ifdef USE_TRANSMISSION
            diffuseColor.a *= material.transmissionAlpha;
          #endif
          gl_FragColor = vec4( min( outgoingLight, vec3( 6.0 ) ), diffuseColor.a );
        `
        );
    };

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), material);
    mesh.name = 'earth-surface';
    return mesh;
  }

  _buildClouds(cloudTexture) {
    // The source PNG was collapsed to a single coverage channel; three.js reads
    // alphaMap from .g, and a greyscale PNG uploads as r == g == b.
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      alphaMap: cloudTexture,
      transparent: true,
      opacity: 0.86,
      roughness: 0.95,
      metalness: 0.0,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.006, 128, 64), material);
    mesh.name = 'earth-clouds';
    return mesh;
  }

  _buildAtmosphere() {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      uniforms: {
        uSunDirWorld: { value: new THREE.Vector3(1, 0, 0) },
        uDayColor: { value: new THREE.Color(0x4ea8ff) },
        uNightColor: { value: new THREE.Color(0x0a1a3a) },
        uTwilightColor: { value: new THREE.Color(0xff7a3c) },
        uIntensity: { value: 1.15 },
        uBaseScatter: { value: 0.13 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
          vWorldPosition = worldPosition.xyz;
          vWorldNormal = normalize( mat3( modelMatrix ) * normal );
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3  uSunDirWorld;
        uniform vec3  uDayColor;
        uniform vec3  uNightColor;
        uniform vec3  uTwilightColor;
        uniform float uIntensity;
        uniform float uBaseScatter;

        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
          vec3 N = normalize( vWorldNormal );
          vec3 V = normalize( cameraPosition - vWorldPosition );

          // Fresnel-style limb brightening: thin overhead, thick at the edge.
          // The base is clamped because pow() is undefined for a negative base,
          // and rounding can push (1 - dot) a hair below zero head-on. A single
          // NaN here would poison every level of the bloom mip chain.
          float facing = clamp( dot( N, V ), 0.0, 1.0 );

          // Optical depth through the shell: shallow looking straight down,
          // deep at the limb. The base term matters as much as the rim -- open
          // ocean has an albedo of only a few percent, and it is Rayleigh
          // scattering above it, not the water itself, that makes Earth read
          // blue from orbit. Without it the seas render almost black.
          float rim = pow( 1.0 - facing, 2.6 );
          float depth = uBaseScatter + rim;

          float sun = dot( N, normalize( uSunDirWorld ) );
          float lit = smoothstep( -0.35, 0.30, sun );

          // Warm band hugging the terminator, where sunlight grazes the deepest
          // slice of atmosphere -- the orange arc seen from the ISS at dawn.
          // Squared directly rather than via pow(), whose base goes negative
          // across the entire night side.
          float band = sun / 0.115;
          float twilight = exp( -( band * band ) );

          // Blend the twilight in rather than adding it, so the warm band does
          // not stack on top of the blue and read as magenta.
          vec3 color = mix( uNightColor, uDayColor, lit );
          color = mix( color, uTwilightColor, twilight * 0.55 );
          float strength = depth * uIntensity * ( 0.10 + 0.90 * max( lit, twilight * 0.65 ) );

          gl_FragColor = vec4( color * strength, 1.0 );
        }
      `,
    });

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.028, 128, 64), material);
    mesh.name = 'earth-atmosphere';
    return mesh;
  }

  /** Optional 15-degree lat/lon grid, for reading positions off the globe. */
  _buildGraticule() {
    const points = [];
    const R = 1.0025;
    const push = (lat, lon) => {
      const latR = (lat * Math.PI) / 180;
      const lonR = (lon * Math.PI) / 180;
      points.push(
        R * Math.cos(latR) * Math.cos(lonR),
        R * Math.sin(latR),
        -R * Math.cos(latR) * Math.sin(lonR)
      );
    };

    for (let lat = -75; lat <= 75; lat += 15) {
      for (let lon = -180; lon < 180; lon += 2) {
        push(lat, lon);
        push(lat, lon + 2);
      }
    }
    for (let lon = -180; lon < 180; lon += 15) {
      for (let lat = -90; lat < 90; lat += 2) {
        push(lat, lon);
        push(lat + 2, lon);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0x5ad1ff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = 'earth-graticule';
    return lines;
  }

  /**
   * @param {THREE.Vector3} sunDirWorld Unit vector toward the Sun, scene space.
   * @param {THREE.Camera} camera
   */
  update(sunDirWorld, camera) {
    this.uniforms.uSunDirView.value
      .copy(sunDirWorld)
      .transformDirection(camera.matrixWorldInverse);
    this.atmosphere.material.uniforms.uSunDirWorld.value.copy(sunDirWorld);
  }

  dispose() {
    this.group.traverse((obj) => {
      obj.geometry?.dispose();
      obj.material?.dispose();
    });
  }
}
