/* 33 agents — one per subagent in team-incident-response — orbiting the
   orchestrator core in three tilted rings. Reviewers run amber. */

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const CENTER = new THREE.Vector3(0, 3.2, -56);

const RINGS = [
  { n: 8, r: 2.1, speed: 0.22, tiltX: 0.45, tiltZ: 0.1 },
  { n: 12, r: 3.3, speed: -0.15, tiltX: -0.2, tiltZ: 0.55 },
  { n: 13, r: 4.5, speed: 0.1, tiltX: -0.65, tiltZ: -0.25 },
];
const COUNT = 33;

const STEEL = new THREE.Color(0x8b93a3);
const BONE = new THREE.Color(0xece9e2);
const AMBER = new THREE.Color(0xffb454);

export function Constellation() {
  const inst = useRef<THREE.InstancedMesh>(null!);
  const lines = useRef<THREE.LineSegments>(null!);
  const core = useRef<THREE.Mesh>(null!);
  const shell = useRef<THREE.Mesh>(null!);

  const data = useMemo(() => {
    const agents: { q: THREE.Quaternion; phase: number; r: number; speed: number; bob: number; color: THREE.Color }[] = [];
    let idx = 0;
    for (const ring of RINGS) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(ring.tiltX, 0, ring.tiltZ));
      for (let i = 0; i < ring.n; i++) {
        const reviewer = idx % 7 === 3;
        agents.push({
          q,
          phase: (i / ring.n) * Math.PI * 2,
          r: ring.r,
          speed: ring.speed,
          bob: Math.random() * Math.PI * 2,
          color: reviewer ? AMBER.clone() : STEEL.clone().lerp(BONE, Math.random() * 0.6),
        });
        idx++;
      }
    }
    const world = agents.map(() => new THREE.Vector3());
    const linePos = new Float32Array(COUNT * 2 * 3);
    return { agents, world, linePos };
  }, []);

  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.linePos, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
    return g;
  }, [data]);

  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const v1 = useMemo(() => new THREE.Vector3(), []);

  useMemo(() => {
    // static per-instance colors, set once on first commit via onUpdate below
  }, []);

  useFrame((st) => {
    const t = st.clock.elapsedTime;
    const im = inst.current;
    if (!im) return;

    let idx = 0;
    let ringStart = 0;
    for (const ring of RINGS) {
      for (let i = 0; i < ring.n; i++) {
        const d = data.agents[idx];
        const a = d.phase + t * d.speed;
        v1.set(Math.cos(a) * d.r, Math.sin(d.bob + t * 0.6) * 0.12, Math.sin(a) * d.r);
        v1.applyQuaternion(d.q);
        data.world[idx].copy(v1);
        m4.makeTranslation(v1.x, v1.y, v1.z);
        im.setMatrixAt(idx, m4);
        if (!im.instanceColor) im.setColorAt(idx, d.color);
        idx++;
      }
      for (let i = 0; i < ring.n; i++) {
        const a = data.world[ringStart + i];
        const b = data.world[ringStart + ((i + 1) % ring.n)];
        const o = (ringStart + i) * 6;
        data.linePos[o] = a.x;
        data.linePos[o + 1] = a.y;
        data.linePos[o + 2] = a.z;
        data.linePos[o + 3] = b.x;
        data.linePos[o + 4] = b.y;
        data.linePos[o + 5] = b.z;
      }
      ringStart += ring.n;
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    lineGeo.attributes.position.needsUpdate = true;

    if (core.current) {
      core.current.rotation.y = t * 0.18;
      core.current.rotation.x = Math.sin(t * 0.1) * 0.2;
    }
    if (shell.current) {
      shell.current.rotation.y = -t * 0.12;
      shell.current.rotation.z = t * 0.07;
    }
  });

  return (
    <group position={CENTER}>
      <pointLight color={0xffb454} intensity={14} distance={16} decay={2} />
      <mesh ref={core}>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshPhysicalMaterial color={0x241708} roughness={0.25} metalness={0.6} emissive={0xffb454} emissiveIntensity={2.2} envMapIntensity={1} />
      </mesh>
      <mesh ref={shell}>
        <icosahedronGeometry args={[0.72, 1]} />
        <meshBasicMaterial color={0xffb454} wireframe transparent opacity={0.16} fog={false} />
      </mesh>
      <instancedMesh ref={inst} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.085, 12, 12]} />
        <meshStandardMaterial emissive={0xffffff} emissiveIntensity={0.65} roughness={0.4} />
      </instancedMesh>
      <lineSegments ref={lines} geometry={lineGeo}>
        <lineBasicMaterial color={0x8b93a3} transparent opacity={0.18} />
      </lineSegments>
    </group>
  );
}
