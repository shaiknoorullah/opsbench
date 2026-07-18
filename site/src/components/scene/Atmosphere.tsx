/* Air: drifting dust motes (size-clamped so a mote crossing the lens never
   blows out), gradient light shafts, fog, and the dynamic key/rim layer that
   plays over the baked base. */

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { quality } from './store';

function softCircleTexture() {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,214,160,1)');
  grad.addColorStop(1, 'rgba(255,214,160,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* Three depth layers of motes: fine haze, mid dust, sparse large near-lens
   particles that the DOF turns into bokeh. Sizes clamped so nothing blows out. */
function DustLayer({ count, size, opacity, spread }: { count: number; size: number; opacity: number; spread: number }) {
  const { geo, vel, mat } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel: { x: number; y: number; z: number; p: number }[] = [];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = Math.random() * 9;
      pos[i * 3 + 2] = 12 - Math.random() * 90;
      vel.push({
        x: (Math.random() - 0.5) * 0.06,
        y: (Math.random() - 0.5) * 0.04,
        z: (Math.random() - 0.5) * 0.05,
        p: Math.random() * Math.PI * 2,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, -32), 70);
    const mat = new THREE.PointsMaterial({
      size,
      map: softCircleTexture(),
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: 0xffd9a0,
      sizeAttenuation: true,
    });
    mat.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace(
        '#include <fog_vertex>',
        '#include <fog_vertex>\n\tgl_PointSize = min(gl_PointSize, 13.0);',
      );
    };
    return { geo, vel, mat };
  }, [count, size, opacity, spread]);

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    const pos = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const v = vel[i];
      pos[i * 3] += (v.x + Math.sin(t * 0.4 + v.p) * 0.02) * dt;
      pos[i * 3 + 1] += (v.y + Math.cos(t * 0.3 + v.p) * 0.015) * dt;
      pos[i * 3 + 2] += v.z * dt;
      if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 9;
      if (pos[i * 3 + 1] > 9.2) pos[i * 3 + 1] = 0.1;
    }
    geo.attributes.position.needsUpdate = true;
  });

  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

function Dust() {
  const low = quality.tier === 'low';
  return (
    <>
      <DustLayer count={low ? 300 : 900} size={0.035} opacity={0.22} spread={22} />
      <DustLayer count={low ? 140 : 380} size={0.06} opacity={0.3} spread={19} />
      <DustLayer count={low ? 60 : 160} size={0.12} opacity={0.24} spread={15} />
    </>
  );
}

const SHAFTS: { pos: [number, number, number]; tilt: number; h: number; r: number; o: number }[] = [
  { pos: [-2.6, 6.5, -1.2], tilt: 0.12, h: 13, r: 1.9, o: 0.55 },
  { pos: [2.2, 6, 0.8], tilt: -0.08, h: 12, r: 1.5, o: 0.45 },
  { pos: [0.4, 7, -2.2], tilt: 0.05, h: 14, r: 2.4, o: 0.4 },
  { pos: [0, 6.5, -34], tilt: 0.03, h: 13, r: 2.2, o: 0.35 },
];

/* Volumetric-reading shafts: view-angle softness (thin at the silhouette),
   vertical falloff, and drifting noise so the "air" inside the beam moves. */
const shaftMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.5 },
      uColor: { value: new THREE.Color(0xffd9a0) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vSoft;
      void main() {
        vUv = uv;
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 v = normalize(-mv.xyz);
        vSoft = pow(abs(dot(n, v)), 1.6);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vSoft;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float vert = smoothstep(0.0, 0.25, vUv.y) * (0.25 + 0.75 * vUv.y);
        float drift = noise(vec2(vUv.x * 5.0, vUv.y * 2.4 - uTime * 0.06))
                    * noise(vec2(vUv.x * 11.0 + 3.7, vUv.y * 5.0 - uTime * 0.11));
        float a = vSoft * vert * (0.35 + drift * 0.9) * uOpacity * 0.14;
        gl_FragColor = vec4(uColor, a);
      }`,
  });

function Shafts() {
  const mats = useMemo(() => SHAFTS.map(() => shaftMaterial()), []);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    mats.forEach((m, i) => {
      m.uniforms.uTime.value = t;
      m.uniforms.uOpacity.value = SHAFTS[i].o * (1 + Math.sin(t * 0.5 + i * 2.1) * 0.18);
    });
  });
  return (
    <>
      {SHAFTS.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={[0, 0, s.tilt]} material={mats[i]}>
          <coneGeometry args={[s.r, s.h, 48, 1, true]} />
        </mesh>
      ))}
    </>
  );
}

/* EXHIBIT 01 staging: scattered "uncited claim" shards drifting in the fog */
function Shards() {
  const group = useRef<THREE.Group>(null!);
  const items = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        pos: [
          Math.cos((i / 14) * Math.PI * 2) * (2.6 + (i % 4) * 0.8),
          1.9 + (i % 5) * 0.75,
          -8.5 - (i % 7) * 1.4,
        ] as [number, number, number],
        rot: [Math.sin(i) * 0.7, (i / 14) * Math.PI * 2, Math.cos(i * 2) * 0.5] as [number, number, number],
        size: [0.4 + Math.sin(i * 7.3) * 0.15, 0.025, 0.55 + Math.cos(i * 3.1) * 0.2] as [number, number, number],
        phase: i * 1.7,
        baseY: 1.9 + (i % 5) * 0.75,
      })),
    [],
  );

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    group.current?.children.forEach((c, i) => {
      const it = items[i];
      c.position.y = it.baseY + Math.sin(t * 0.5 + it.phase) * 0.22;
      c.rotation.y += dt * 0.06;
    });
  });

  return (
    <group ref={group}>
      {items.map((it, i) => (
        <mesh key={i} position={it.pos} rotation={it.rot} scale={it.size}>
          <boxGeometry args={[1, 1, 1]} />
          <meshPhysicalMaterial color={0x11131a} roughness={0.3} metalness={0.6} envMapIntensity={0.5} clearcoat={0.6} clearcoatRoughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

export function Atmosphere({ onSun }: { onSun?: (m: THREE.Mesh) => void }) {
  const seal = useRef<THREE.PointLight>(null!);
  const sealRing = useRef<THREE.MeshStandardMaterial>(null!);

  useFrame((st) => {
    const t = st.clock.elapsedTime;
    if (seal.current) seal.current.intensity = 13 + Math.sin(t * 1.7) * 2.2;
    if (sealRing.current) sealRing.current.emissiveIntensity = 2.4 + Math.sin(t * 1.7) * 0.35;
  });

  return (
    <group>
      <fogExp2 attach="fog" args={[0x0a0b0e, 0.03]} />
      <color attach="background" args={[0x0a0b0e]} />

      {/* dynamic layer over the baked base — speculars, motion, pulse */}
      <hemisphereLight args={[0x222833, 0x000000, 0.3]} />
      <directionalLight position={[6, 12, 8]} color={0xffd9a0} intensity={0.9} />
      <directionalLight position={[-8, 5, -14]} color={0x9ab8ff} intensity={0.4} />

      {/* live wax seal — aligned to the baked glow recess on the monolith face */}
      <pointLight ref={seal} position={[0, 2.9, 1.7]} color={0xffb454} intensity={14} distance={10} decay={2} />
      <mesh position={[0, 3.05, 0.46]}>
        <torusGeometry args={[0.5, 0.035, 24, 96]} />
        <meshStandardMaterial ref={sealRing} color={0x1a1206} emissive={0xffb454} emissiveIntensity={2.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 3.05, 0.465]} ref={(m) => m && onSun?.(m)}>
        <circleGeometry args={[0.16, 48]} />
        <meshStandardMaterial color={0x1a1206} emissive={0xffb454} emissiveIntensity={3.2} roughness={0.4} />
      </mesh>

      <Shafts />
      <Shards />
      <Dust />
    </group>
  );
}
