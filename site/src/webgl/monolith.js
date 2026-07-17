import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/**
 * The Ledger Monolith — the hero focal object.
 *
 * A tall obsidian slab (physically-based, clearcoated) with an internal
 * emissive "spine" that reads as the tamper-evident audit ledger. The spine
 * brightens and its scanline sweeps as the story advances (driven by uniforms
 * from the scroll timeline).
 */
export function createMonolith(envMap) {
  const group = new THREE.Group()

  // --- The slab -------------------------------------------------------------
  const geo = new RoundedBoxGeometry(1.15, 3.4, 0.42, 8, 0.09)
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#05070e'),
    metalness: 0.55,
    roughness: 0.22,
    clearcoat: 1.0,
    clearcoatRoughness: 0.14,
    reflectivity: 0.6,
    envMap,
    envMapIntensity: 1.35,
    sheen: 0.4,
    sheenColor: new THREE.Color('#3a6cff'),
    sheenRoughness: 0.6,
  })
  const slab = new THREE.Mesh(geo, mat)
  slab.castShadow = true
  group.add(slab)

  // --- Internal spine (emissive channel) -----------------------------------
  // A thin bar embedded slightly proud of the front face, lit from within.
  const spineUniforms = {
    uTime: { value: 0 },
    uProgress: { value: 0 },   // 0..1 how "alive" the ledger is
    uSweep: { value: 0 },      // scanline position
    uSeal: { value: 0 },       // 0..1 seal/lock intensity
    uColorA: { value: new THREE.Color('#4ff0d0') },
    uColorB: { value: new THREE.Color('#5b8cff') },
  }

  const spineGeo = new THREE.PlaneGeometry(0.14, 3.1, 1, 240)
  const spineMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: spineUniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uProgress;
      uniform float uSweep;
      uniform float uSeal;
      uniform vec3 uColorA;
      uniform vec3 uColorB;

      // hash for subtle ledger "blocks"
      float hash(float n){ return fract(sin(n)*43758.5453123); }

      void main() {
        // vertical build: ledger fills from the base up with uProgress
        float fill = smoothstep(0.0, 1.0, uProgress * 1.15 - (1.0 - vUv.y) * 0.15);

        // discrete ledger blocks along the spine
        float blocks = floor(vUv.y * 34.0);
        float blockGlow = 0.55 + 0.45 * hash(blocks + floor(uTime * 0.6));
        // seam darkening between blocks
        float seam = smoothstep(0.02, 0.06, fract(vUv.y * 34.0)) *
                     smoothstep(0.02, 0.06, 1.0 - fract(vUv.y * 34.0));

        // horizontal core falloff
        float core = smoothstep(0.5, 0.0, abs(vUv.x - 0.5));

        // scanline sweep (the "sealing" pass)
        float scan = smoothstep(0.035, 0.0, abs(vUv.y - uSweep));
        scan *= step(0.001, uSweep);

        vec3 col = mix(uColorB, uColorA, vUv.y);
        float intensity = core * blockGlow * seam * fill;
        intensity += scan * core * 1.6;

        // seal pulse — the whole spine flashes teal when a block is sealed
        intensity += uSeal * core * (0.4 + 0.3 * sin(uTime * 6.0));

        col = mix(col, uColorA, scan);
        gl_FragColor = vec4(col * intensity * 2.2, intensity);
      }
    `,
  })
  const spine = new THREE.Mesh(spineGeo, spineMat)
  spine.position.z = 0.212
  group.add(spine)

  // Back glow so the slab reads as lit from within on the reverse too
  const backSpine = spine.clone()
  backSpine.material = spineMat
  backSpine.position.z = -0.212
  backSpine.rotation.y = Math.PI
  group.add(backSpine)

  // --- Edge fresnel halo ----------------------------------------------------
  const haloUniforms = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uColor: { value: new THREE.Color('#5b8cff') },
  }
  const haloGeo = new RoundedBoxGeometry(1.2, 3.46, 0.47, 6, 0.1)
  const haloMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    uniforms: haloUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      uniform float uTime;
      uniform float uProgress;
      uniform vec3 uColor;
      void main() {
        float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.5);
        float pulse = 0.6 + 0.4 * sin(uTime * 1.5);
        float a = fres * (0.25 + 0.55 * uProgress) * pulse;
        gl_FragColor = vec4(uColor * a * 1.6, a);
      }
    `,
  })
  const halo = new THREE.Mesh(haloGeo, haloMat)
  group.add(halo)

  group.userData.update = (t, state) => {
    spineUniforms.uTime.value = t
    haloUniforms.uTime.value = t
    spineUniforms.uProgress.value = state.progress
    haloUniforms.uProgress.value = state.progress
    spineUniforms.uSweep.value = state.sweep
    spineUniforms.uSeal.value = state.seal
  }

  return group
}
