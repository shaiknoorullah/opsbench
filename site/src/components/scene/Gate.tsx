/* The policy gate's live layer: emissive inner ring, animated shader membrane,
   allow/deny particle stream, and the approved beam. The steel torus itself is
   baked geometry in BakedSet. */

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { quality } from './store';

const GATE = new THREE.Vector3(0, 2.3, -16);

const membraneMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xffb454) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec2 c = vUv - 0.5;
        float d = length(c) * 2.0;
        if (d > 1.0) discard;
        float rings = sin(d * 26.0 - uTime * 1.4) * 0.5 + 0.5;
        float n = noise(c * 9.0 + uTime * 0.22);
        float edge = smoothstep(1.0, 0.72, d) * smoothstep(0.0, 0.32, d);
        float a = edge * (0.05 + rings * 0.05 + n * 0.06);
        gl_FragColor = vec4(uColor, a);
      }`,
  });

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  allowed: boolean;
  state: 0 | 1 | 2;
  flash: number;
}

const STEEL = new THREE.Color(0x8b93a3);
const RED = new THREE.Color(0xf4485e);
const GREEN = new THREE.Color(0x4ade80);
const WARMC = new THREE.Color(0xffd9a0);

function resetParticle(p: Particle, initial = false) {
  const allowed = Math.random() < 0.22;
  const r = allowed ? Math.random() * 0.5 : 0.9 + Math.random() * 1.9;
  const a = Math.random() * Math.PI * 2;
  p.x = Math.cos(a) * r;
  p.y = GATE.y + Math.sin(a) * r * 0.8;
  p.z = GATE.z + 4.5 + Math.random() * (initial ? 6 : 3);
  p.vx = (Math.random() - 0.5) * 0.1;
  p.vy = (Math.random() - 0.5) * 0.1;
  p.vz = -(1.6 + Math.random() * 1.4);
  p.allowed = allowed;
  p.state = 0;
  p.flash = 0;
}

export function Gate() {
  const count = quality.tier === 'low' ? 22 : 40;
  const inst = useRef<THREE.InstancedMesh>(null!);
  const membrane = useRef<THREE.ShaderMaterial>(null!);
  const ringMat = useRef<THREE.MeshStandardMaterial>(null!);
  const beamMat = useRef<THREE.MeshBasicMaterial>(null!);

  const particles = useMemo(() => {
    const list: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const p = {} as Particle;
      resetParticle(p, true);
      list.push(p);
    }
    return list;
  }, [count]);

  const mat = useMemo(membraneMat, []);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const col = useMemo(() => new THREE.Color(), []);

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    mat.uniforms.uTime.value = t;
    if (ringMat.current) ringMat.current.emissiveIntensity = 1.5 + Math.sin(t * 1.9) * 0.25;
    if (beamMat.current) beamMat.current.opacity = 0.16 + (Math.sin(t * 2.3) * 0.5 + 0.5) * 0.12;

    const im = inst.current;
    if (!im) return;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.state === 0 && p.z <= GATE.z) {
        const dx = p.x;
        const dy = p.y - GATE.y;
        const rad = Math.hypot(dx, dy);
        if (p.allowed && rad < 1.9) {
          p.state = 2;
          p.flash = 1;
        } else {
          p.state = 1;
          p.flash = 1;
          p.vz = Math.abs(p.vz) * 0.45;
          p.vx += dx * 0.6;
          p.vy += dy * 0.6;
        }
      }
      p.flash = Math.max(0, p.flash - dt * 1.6);
      if ((p.state === 2 && p.z < GATE.z - 6.5) || (p.state === 1 && p.z > GATE.z + 6.5)) resetParticle(p);
      m4.makeTranslation(p.x, p.y, p.z);
      im.setMatrixAt(i, m4);
      if (p.state === 1) col.copy(RED).lerp(STEEL, 1 - p.flash);
      else if (p.state === 2) col.copy(GREEN).lerp(WARMC, 1 - p.flash);
      else col.copy(STEEL).multiplyScalar(0.8);
      im.setColorAt(i, col);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      {/* emissive inner ring */}
      <mesh position={GATE}>
        <torusGeometry args={[2.06, 0.02, 16, 128]} />
        <meshStandardMaterial ref={ringMat} color={0x1a1206} emissive={0xffb454} emissiveIntensity={1.6} roughness={0.4} />
      </mesh>
      {/* policy membrane */}
      <mesh position={GATE} material={mat}>
        <circleGeometry args={[2.06, 96]} />
      </mesh>
      {/* approved beam */}
      <mesh position={[0, 2.3, -15.5]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 9, 12, 1, true]} />
        <meshBasicMaterial ref={beamMat} color={0xffcf8a} transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
      </mesh>
      {/* gate practical light for the dynamic layer */}
      <pointLight position={[0, 2.3, -16]} color={0xffb454} intensity={8} distance={12} decay={2} />
      <instancedMesh ref={inst} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshStandardMaterial emissive={0xffffff} emissiveIntensity={1.4} roughness={0.5} />
      </instancedMesh>
    </group>
  );
}
