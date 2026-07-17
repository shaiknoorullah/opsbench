import * as THREE from 'three'

/**
 * Volumetric dust / evidence motes.
 * GPU points with a soft radial sprite, slow buoyant drift, depth fade, and
 * mild parallax. Reads as atmosphere in the god-rays and gives the DOF
 * something to bokeh against.
 */
export function createParticles(count = 2600) {
  const positions = new Float32Array(count * 3)
  const scales = new Float32Array(count)
  const seeds = new Float32Array(count)
  const tint = new Float32Array(count)

  const R = 16
  for (let i = 0; i < count; i++) {
    // biased toward a tall column around the monolith
    positions[i * 3 + 0] = (Math.random() - 0.5) * R
    positions[i * 3 + 1] = (Math.random() - 0.5) * R * 1.3
    positions[i * 3 + 2] = (Math.random() - 0.5) * R
    scales[i] = Math.random() * 0.8 + 0.2
    seeds[i] = Math.random() * 100
    tint[i] = Math.random()
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 1))

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 34 * (window.devicePixelRatio || 1) },
      uColorA: { value: new THREE.Color('#4ff0d0') },
      uColorB: { value: new THREE.Color('#5b8cff') },
    },
    vertexShader: /* glsl */ `
      attribute float aScale;
      attribute float aSeed;
      attribute float aTint;
      uniform float uTime;
      uniform float uSize;
      varying float vAlpha;
      varying float vTint;
      void main() {
        vec3 p = position;
        float t = uTime * 0.12 + aSeed;
        p.y += sin(t) * 0.6 + uTime * 0.06 * (0.4 + aScale);
        p.y = mod(p.y + 10.4, 20.8) - 10.4;
        p.x += sin(t * 0.7) * 0.4;
        p.z += cos(t * 0.6) * 0.4;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        gl_PointSize = uSize * aScale / max(dist, 0.5);
        gl_Position = projectionMatrix * mv;

        // fade with distance + gentle twinkle
        vAlpha = smoothstep(28.0, 4.0, dist) * (0.35 + 0.65 * (0.5 + 0.5 * sin(t * 2.0)));
        vTint = aTint;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying float vAlpha;
      varying float vTint;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float a = smoothstep(0.5, 0.0, d);
        a *= a;
        vec3 col = mix(uColorB, uColorA, vTint);
        gl_FragColor = vec4(col, a * vAlpha * 0.6);
      }
    `,
  })

  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.userData.update = (t) => { mat.uniforms.uTime.value = t }
  return points
}
