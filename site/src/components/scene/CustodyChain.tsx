/* The chain of custody: a verlet-integrated catenary of clearcoat evidence
   blocks, each stamped with a SHA-256 plate. Real gravity, damping, anchor
   sway, and pointer repulsion — physical weight, not keyframes. */

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';

const N = 14;
const CHAIN_Z = -34;
const REST = 1.02;

let seed = 1234567;
function fakeHash(len = 16) {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < len; i++) {
    seed = (seed * 16807) % 2147483647;
    out += chars[seed % 16];
  }
  return out;
}

function plateTexture(label: string) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 192;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, 512, 192);
  g.font = '500 34px "IBM Plex Mono", monospace';
  g.fillStyle = 'rgba(255,180,84,0.95)';
  g.fillText(`sha256:${label.slice(0, 8)}…`, 28, 78);
  g.font = '400 22px "IBM Plex Mono", monospace';
  g.fillStyle = 'rgba(236,233,226,0.6)';
  g.fillText('SEALED · custody.log', 28, 128);
  g.strokeStyle = 'rgba(255,180,84,0.5)';
  g.lineWidth = 2;
  g.strokeRect(10, 10, 492, 172);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const blockMat = new THREE.MeshPhysicalMaterial({
  color: 0x101218,
  roughness: 0.16,
  metalness: 0.55,
  clearcoat: 1,
  clearcoatRoughness: 0.2,
  envMapIntensity: 1.0,
});
const linkMatShared = new THREE.MeshStandardMaterial({
  color: 0x3a3f4a, roughness: 0.35, metalness: 1, envMapIntensity: 1,
});

export function CustodyChain() {
  const { camera, pointer } = useThree();

  const sim = useMemo(() => {
    const anchorA = new THREE.Vector3(-7.4, 4.3, CHAIN_Z);
    const anchorB = new THREE.Vector3(7.4, 4.3, CHAIN_Z);
    const pos: THREE.Vector3[] = [];
    const prev: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const p = new THREE.Vector3().lerpVectors(anchorA, anchorB, t);
      p.y -= Math.sin(t * Math.PI) * 1.4;
      pos.push(p);
      prev.push(p.clone());
    }
    return { pos, prev, anchorA, anchorB, acc: 0 };
  }, []);

  const plates = useMemo(() => Array.from({ length: N - 2 }, () => plateTexture(fakeHash())), []);
  const blocks = useRef<(THREE.Group | null)[]>([]);
  const links = useRef<(THREE.Mesh | null)[]>([]);

  const tmp = useMemo(
    () => ({
      v1: new THREE.Vector3(),
      v2: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      right: new THREE.Vector3(1, 0, 0),
      q: new THREE.Quaternion(),
      ray: new THREE.Raycaster(),
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -CHAIN_Z),
      hit: new THREE.Vector3(),
      ndc: new THREE.Vector2(),
    }),
    [],
  );

  function step(dt: number, t: number, hit: THREE.Vector3 | null) {
    const { pos, prev, anchorA, anchorB } = sim;
    anchorA.y = 4.3 + Math.sin(t * 0.4) * 0.18;
    anchorB.y = 4.3 + Math.cos(t * 0.33) * 0.18;
    anchorA.z = CHAIN_Z + Math.sin(t * 0.21) * 0.35;
    anchorB.z = CHAIN_Z - Math.sin(t * 0.26) * 0.35;

    const damping = 0.985;
    const g = -3.6 * dt * dt;
    for (let i = 1; i < N - 1; i++) {
      const p = pos[i];
      const pr = prev[i];
      const vx = (p.x - pr.x) * damping;
      const vy = (p.y - pr.y) * damping;
      const vz = (p.z - pr.z) * damping;
      pr.copy(p);
      p.x += vx;
      p.y += vy + g;
      p.z += vz + Math.sin(t * 0.6 + i) * 0.00035;
      if (hit) {
        const dx = p.x - hit.x;
        const dy = p.y - hit.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 7 && d2 > 1e-4) {
          const f = (1 - Math.sqrt(d2) / 2.65) * 0.012;
          if (f > 0) {
            p.x += dx * f;
            p.y += dy * f;
          }
        }
      }
    }
    pos[0].copy(anchorA);
    pos[N - 1].copy(anchorB);

    for (let iter = 0; iter < 4; iter++) {
      for (let i = 0; i < N - 1; i++) {
        const a = pos[i];
        const b = pos[i + 1];
        tmp.v1.subVectors(b, a);
        const d = tmp.v1.length() || 1e-4;
        const diff = (d - REST) / d;
        const w0 = i === 0 ? 0 : 0.5;
        const w1 = i + 1 === N - 1 ? 0 : 0.5;
        const wSum = w0 + w1;
        if (!wSum) continue;
        a.addScaledVector(tmp.v1, diff * (w0 / wSum));
        b.addScaledVector(tmp.v1, -diff * (w1 / wSum));
      }
    }
  }

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;

    let hit: THREE.Vector3 | null = null;
    tmp.ndc.set(pointer.x, pointer.y);
    tmp.ray.setFromCamera(tmp.ndc, camera);
    if (tmp.ray.ray.intersectPlane(tmp.plane, tmp.hit)) hit = tmp.hit;

    sim.acc += Math.min(dt, 0.05);
    let steps = 0;
    while (sim.acc >= 1 / 60 && steps < 4) {
      step(1 / 60, t, hit);
      sim.acc -= 1 / 60;
      steps++;
    }
    if (steps === 4) sim.acc = 0;

    for (let i = 0; i < N - 2; i++) {
      const b = blocks.current[i];
      if (!b) continue;
      b.position.copy(sim.pos[i + 1]);
      tmp.v1.subVectors(sim.pos[i + 2], sim.pos[i]).normalize();
      tmp.q.setFromUnitVectors(tmp.right, tmp.v1);
      b.quaternion.slerp(tmp.q, 0.35);
    }
    for (let i = 0; i < N - 1; i++) {
      const l = links.current[i];
      if (!l) continue;
      const a = sim.pos[i];
      const b = sim.pos[i + 1];
      tmp.v1.addVectors(a, b).multiplyScalar(0.5);
      l.position.copy(tmp.v1);
      tmp.v2.subVectors(b, a);
      const len = tmp.v2.length();
      l.scale.set(1, len, 1);
      tmp.q.setFromUnitVectors(tmp.up, tmp.v2.normalize());
      l.quaternion.copy(tmp.q);
    }
  });

  return (
    <group>
      {/* cool practical over the ledger */}
      <pointLight position={[0, 6.5, -33]} color={0xd8dce6} intensity={3} distance={14} decay={2} />
      {plates.map((tex, i) => (
        <group key={i} ref={(el) => (blocks.current[i] = el)}>
          <RoundedBox args={[0.92, 0.56, 0.36]} radius={0.05} smoothness={3} material={blockMat} />
          <mesh position={[0, 0, 0.185]}>
            <planeGeometry args={[0.8, 0.3]} />
            <meshBasicMaterial map={tex} transparent depthWrite={false} />
          </mesh>
          <mesh position={[0, 0, -0.185]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[0.8, 0.3]} />
            <meshBasicMaterial map={tex} transparent depthWrite={false} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: N - 1 }, (_, i) => (
        <mesh key={i} ref={(el) => (links.current[i] = el)} material={linkMatShared}>
          <cylinderGeometry args={[0.022, 0.022, 1, 8]} />
        </mesh>
      ))}
    </group>
  );
}
