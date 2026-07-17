/* ————————————————————————————————————————————————
   opsbench landing — cinematic scroll direction
   One continuous scene. The camera walks the case file:
   bench → deficit → gate → ledger → team → verdict.
   ———————————————————————————————————————————————— */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = window.matchMedia('(max-width: 860px)').matches;

gsap.registerPlugin(ScrollTrigger);

/* ————— smooth scroll ————— */

let lenis = null;
if (!REDUCED) {
  lenis = new Lenis({ duration: 1.25, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.8 });
    else target.scrollIntoView();
  });
});

/* ————— palette ————— */

const C = {
  obsidian: new THREE.Color(0x0a0b0e),
  carbon: new THREE.Color(0x14161c),
  bone: new THREE.Color(0xece9e2),
  steel: new THREE.Color(0x8b93a3),
  amber: new THREE.Color(0xffb454),
  warm: new THREE.Color(0xffd9a0),
  cool: new THREE.Color(0x9ab8ff),
  green: new THREE.Color(0x4ade80),
  red: new THREE.Color(0xf4485e),
};

/* ————— renderer / scene ————— */

const canvas = document.getElementById('stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.body.classList.add('no-webgl');
  canvas.style.display = 'none';
}

const scene = new THREE.Scene();
scene.background = C.obsidian.clone();
scene.fog = new THREE.FogExp2(0x0a0b0e, 0.03);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 2.6, 20);

let composer, bloomPass, bokehPass, gradePass;

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.06).texture;
  pmrem.dispose();
}

/* ————— helpers ————— */

function softCircleTexture(inner = 0.1, color = '255,214,160') {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, s * inner, s / 2, s / 2, s / 2);
  grad.addColorStop(0, `rgba(${color},1)`);
  grad.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shaftTexture() {
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,214,160,0.9)');
  grad.addColorStop(1, 'rgba(255,214,160,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(cv);
}

let hashSeed = 1234567;
function fakeHash(len = 12) {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < len; i++) {
    hashSeed = (hashSeed * 16807) % 2147483647;
    out += chars[hashSeed % 16];
  }
  return out;
}

function hashPlateTexture(label) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 192;
  const g = cv.getContext('2d');
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

/* ————— world: floor & atmosphere ————— */

const world = new THREE.Group();
scene.add(world);

const floorMat = new THREE.MeshStandardMaterial({
  color: 0x0c0d11, roughness: 0.44, metalness: 0.7, envMapIntensity: 0.16,
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), floorMat);
floor.rotation.x = -Math.PI / 2;
world.add(floor);

// warm pools of light on the floor under key subjects
const poolTex = softCircleTexture(0.05);
[[0, 0.01, 0, 9, 0.16], [0, 0.01, -16, 7, 0.1], [0, 0.01, -34, 12, 0.08], [0, 0.01, -56, 12, 0.1]].forEach(([x, y, z, s, o]) => {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(s, s),
    new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  world.add(m);
});

/* ————— lighting rig ————— */

scene.add(new THREE.HemisphereLight(0x222833, 0x000000, 0.35));

const keyLight = new THREE.DirectionalLight(C.warm, 1.35);
keyLight.position.set(6, 12, 8);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(C.cool, 0.55);
rimLight.position.set(-8, 5, -14);
scene.add(rimLight);

const sealLight = new THREE.PointLight(C.amber, 14, 10, 2);
sealLight.position.set(0, 2.7, 1.6);
scene.add(sealLight);

const gateLight = new THREE.PointLight(C.amber, 10, 12, 2);
gateLight.position.set(0, 2.3, -16);
scene.add(gateLight);

const ledgerLight = new THREE.PointLight(0xd8dce6, 3, 14, 2);
ledgerLight.position.set(0, 6.5, -33);
scene.add(ledgerLight);

const coreLight = new THREE.PointLight(C.amber, 16, 16, 2);
coreLight.position.set(0, 3.2, -56);
scene.add(coreLight);

/* ————— act I: the monolith ————— */

const monolith = new THREE.Group();
monolith.position.set(0, 0, 0);
world.add(monolith);

const slabMat = new THREE.MeshPhysicalMaterial({
  color: 0x0b0c10, roughness: 0.18, metalness: 0.4,
  clearcoat: 1, clearcoatRoughness: 0.22, envMapIntensity: 0.9,
});
const slab = new THREE.Mesh(new RoundedBoxGeometry(2.4, 5.2, 0.7, 4, 0.05), slabMat);
slab.position.y = 2.6;
monolith.add(slab);

// wax seal: emissive ring + pupil
const sealRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.5, 0.035, 24, 96),
  new THREE.MeshStandardMaterial({ color: 0x1a1206, emissive: 0xffb454, emissiveIntensity: 2.6, roughness: 0.4 })
);
sealRing.position.set(0, 2.9, 0.37);
monolith.add(sealRing);

const sealCore = new THREE.Mesh(
  new THREE.CircleGeometry(0.16, 48),
  new THREE.MeshStandardMaterial({ color: 0x1a1206, emissive: 0xffb454, emissiveIntensity: 3.2, roughness: 0.4 })
);
sealCore.position.set(0, 2.9, 0.371);
monolith.add(sealCore);

// volumetric-ish shafts
const shaftTex = shaftTexture();
function makeShaft(x, z, tilt, h = 13, r = 1.9, opacity = 0.05) {
  const geo = new THREE.ConeGeometry(r, h, 32, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    map: shaftTex, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const cone = new THREE.Mesh(geo, mat);
  cone.position.set(x, h / 2, z);
  cone.rotation.z = tilt;
  world.add(cone);
  return cone;
}
const shafts = [
  makeShaft(-2.6, -1.2, 0.12), makeShaft(2.2, 0.8, -0.08, 12, 1.5, 0.04),
  makeShaft(0.4, -2.2, 0.05, 14, 2.4, 0.035),
];

/* ————— act II: scattered uncited claims ————— */

const shards = new THREE.Group();
world.add(shards);
const shardMat = new THREE.MeshPhysicalMaterial({
  color: 0x11131a, roughness: 0.3, metalness: 0.6, envMapIntensity: 0.5,
  clearcoat: 0.6, clearcoatRoughness: 0.4,
});
for (let i = 0; i < 14; i++) {
  const s = new THREE.Mesh(new RoundedBoxGeometry(0.5 + Math.sin(i * 7.3) * 0.2, 0.03, 0.7 + Math.cos(i * 3.1) * 0.25, 2, 0.01), shardMat);
  const a = i / 14 * Math.PI * 2;
  s.position.set(Math.cos(a) * (3 + (i % 4)), 0.6 + (i % 5) * 0.9, -6 - (i % 7) * 1.1);
  s.rotation.set(Math.sin(i) * 0.7, a, Math.cos(i * 2) * 0.5);
  s.userData.baseY = s.position.y;
  s.userData.phase = i * 1.7;
  shards.add(s);
}

/* ————— act III: the gate ————— */

const gate = new THREE.Group();
gate.position.set(0, 2.3, -16);
world.add(gate);

const gateMat = new THREE.MeshPhysicalMaterial({
  color: 0x2a2d35, roughness: 0.35, metalness: 1, envMapIntensity: 1.1,
});
const gateRing = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.16, 32, 128), gateMat);
gate.add(gateRing);

const gateRingInner = new THREE.Mesh(
  new THREE.TorusGeometry(2.06, 0.02, 16, 128),
  new THREE.MeshStandardMaterial({ color: 0x1a1206, emissive: 0xffb454, emissiveIntensity: 1.6, roughness: 0.4 })
);
gate.add(gateRingInner);

// policy field — animated shader membrane
const fieldMat = new THREE.ShaderMaterial({
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0xffb454) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
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
const field = new THREE.Mesh(new THREE.CircleGeometry(2.06, 96), fieldMat);
gate.add(field);

// deny / allow particles
const DENY_N = 40;
const denyGeo = new THREE.SphereGeometry(0.045, 10, 10);
const denyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.4, roughness: 0.5 });
const denyMesh = new THREE.InstancedMesh(denyGeo, denyMat, DENY_N);
denyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
world.add(denyMesh);
const denies = [];
const _m4 = new THREE.Matrix4();
const _col = new THREE.Color();
function resetDeny(p, initial = false) {
  const allowed = Math.random() < 0.22;
  const r = allowed ? Math.random() * 0.5 : 0.9 + Math.random() * 1.9;
  const a = Math.random() * Math.PI * 2;
  p.x = Math.cos(a) * r;
  p.y = 2.3 + Math.sin(a) * r * 0.8;
  p.z = -16 + 4.5 + Math.random() * (initial ? 6 : 3);
  p.vx = (Math.random() - 0.5) * 0.1;
  p.vy = (Math.random() - 0.5) * 0.1;
  p.vz = -(1.6 + Math.random() * 1.4);
  p.allowed = allowed;
  p.state = 0; // 0 approaching, 1 bounced, 2 passed
  p.flash = 0;
}
for (let i = 0; i < DENY_N; i++) {
  const p = {};
  resetDeny(p, true);
  denies.push(p);
}

// the approved beam
const beam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.018, 0.018, 9, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
);
beam.rotation.x = Math.PI / 2;
beam.position.set(0, 2.3, -15.5);
world.add(beam);

/* ————— act IV: the custody chain (verlet physics) ————— */

const CHAIN_N = 14;
const chainZ = -34;
const chain = {
  pos: [], prev: [],
  restLen: 1.02,
  anchorA: new THREE.Vector3(-7.4, 4.3, chainZ),
  anchorB: new THREE.Vector3(7.4, 4.3, chainZ),
};
for (let i = 0; i < CHAIN_N; i++) {
  const t = i / (CHAIN_N - 1);
  const p = new THREE.Vector3().lerpVectors(chain.anchorA, chain.anchorB, t);
  p.y -= Math.sin(t * Math.PI) * 1.4; // start near catenary rest
  chain.pos.push(p);
  chain.prev.push(p.clone());
}

const blockGeo = new RoundedBoxGeometry(0.92, 0.56, 0.36, 3, 0.05);
const blockMat = new THREE.MeshPhysicalMaterial({
  color: 0x101218, roughness: 0.16, metalness: 0.55,
  clearcoat: 1, clearcoatRoughness: 0.2, envMapIntensity: 1.0,
});
const blocks = [];
for (let i = 1; i < CHAIN_N - 1; i++) {
  const b = new THREE.Mesh(blockGeo, blockMat);
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.3),
    new THREE.MeshBasicMaterial({ map: hashPlateTexture(fakeHash(16)), transparent: true, depthWrite: false })
  );
  plate.position.z = 0.185;
  b.add(plate);
  const plateBack = plate.clone();
  plateBack.rotation.y = Math.PI;
  plateBack.position.z = -0.185;
  b.add(plateBack);
  world.add(b);
  blocks.push(b);
}

const linkGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 8);
const linkMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.35, metalness: 1, envMapIntensity: 1 });
const links = [];
for (let i = 0; i < CHAIN_N - 1; i++) {
  const l = new THREE.Mesh(linkGeo, linkMat);
  world.add(l);
  links.push(l);
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

function stepChain(dt, t, pointerHit) {
  // animated anchors — slow structural sway
  chain.anchorA.y = 4.3 + Math.sin(t * 0.4) * 0.18;
  chain.anchorB.y = 4.3 + Math.cos(t * 0.33) * 0.18;
  chain.anchorA.z = chainZ + Math.sin(t * 0.21) * 0.35;
  chain.anchorB.z = chainZ - Math.sin(t * 0.26) * 0.35;

  const damping = 0.985;
  const g = -3.6 * dt * dt;
  for (let i = 1; i < CHAIN_N - 1; i++) {
    const p = chain.pos[i], pr = chain.prev[i];
    const vx = (p.x - pr.x) * damping;
    const vy = (p.y - pr.y) * damping;
    const vz = (p.z - pr.z) * damping;
    pr.copy(p);
    p.x += vx;
    p.y += vy + g;
    p.z += vz + Math.sin(t * 0.6 + i) * 0.00035; // faint air current
    if (pointerHit) {
      const dx = p.x - pointerHit.x, dy = p.y - pointerHit.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 7 && d2 > 0.0001) {
        const f = (1 - Math.sqrt(d2) / 2.65) * 0.012;
        if (f > 0) { p.x += dx * f; p.y += dy * f; }
      }
    }
  }
  chain.pos[0].copy(chain.anchorA);
  chain.pos[CHAIN_N - 1].copy(chain.anchorB);

  for (let iter = 0; iter < 4; iter++) {
    for (let i = 0; i < CHAIN_N - 1; i++) {
      const a = chain.pos[i], b = chain.pos[i + 1];
      _v1.subVectors(b, a);
      const d = _v1.length() || 0.0001;
      const diff = (d - chain.restLen) / d;
      const w0 = i === 0 ? 0 : 0.5, w1 = i + 1 === CHAIN_N - 1 ? 0 : 0.5;
      const wSum = w0 + w1;
      if (!wSum) continue;
      a.addScaledVector(_v1, diff * (w0 / wSum));
      b.addScaledVector(_v1, -diff * (w1 / wSum));
    }
  }

  // pose blocks & links
  for (let i = 0; i < blocks.length; i++) {
    const node = chain.pos[i + 1];
    blocks[i].position.copy(node);
    _v1.subVectors(chain.pos[i + 2], chain.pos[i]).normalize();
    _q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), _v1);
    blocks[i].quaternion.slerp(_q, 0.35);
  }
  for (let i = 0; i < links.length; i++) {
    const a = chain.pos[i], b = chain.pos[i + 1];
    _v1.addVectors(a, b).multiplyScalar(0.5);
    links[i].position.copy(_v1);
    _v2.subVectors(b, a);
    const len = _v2.length();
    links[i].scale.set(1, len, 1);
    _q.setFromUnitVectors(_up, _v2.normalize());
    links[i].quaternion.copy(_q);
  }
}

/* ————— act V: the agent constellation ————— */

const constellation = new THREE.Group();
constellation.position.set(0, 3.2, -56);
world.add(constellation);

const core = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.55, 1),
  new THREE.MeshPhysicalMaterial({
    color: 0x241708, roughness: 0.25, metalness: 0.6,
    emissive: 0xffb454, emissiveIntensity: 1.1, envMapIntensity: 1,
  })
);
constellation.add(core);
const coreShell = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.72, 1),
  new THREE.MeshBasicMaterial({ color: 0xffb454, wireframe: true, transparent: true, opacity: 0.16, fog: false })
);
constellation.add(coreShell);

const RINGS = [
  { n: 8, r: 2.1, speed: 0.22, tiltX: 0.45, tiltZ: 0.1 },
  { n: 12, r: 3.3, speed: -0.15, tiltX: -0.2, tiltZ: 0.55 },
  { n: 13, r: 4.5, speed: 0.1, tiltX: -0.65, tiltZ: -0.25 },
];
const AGENT_N = 33;
const agentGeo = new THREE.SphereGeometry(0.085, 12, 12);
const agentMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.4 });
const agents = new THREE.InstancedMesh(agentGeo, agentMat, AGENT_N);
agents.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
constellation.add(agents);

const agentData = [];
{
  let idx = 0;
  RINGS.forEach((ring, ri) => {
    const e = new THREE.Euler(ring.tiltX, 0, ring.tiltZ);
    const q = new THREE.Quaternion().setFromEuler(e);
    for (let i = 0; i < ring.n; i++) {
      const reviewer = idx % 7 === 3;
      agentData.push({
        ring: ri, phase: (i / ring.n) * Math.PI * 2, q,
        r: ring.r, speed: ring.speed, bob: Math.random() * Math.PI * 2,
        color: reviewer ? C.amber.clone() : C.steel.clone().lerp(C.bone, Math.random() * 0.6),
      });
      agents.setColorAt(idx, agentData[idx].color);
      idx++;
    }
  });
  agents.instanceColor.needsUpdate = true;
}

// ring connection lines
const lineGeo = new THREE.BufferGeometry();
const linePos = new Float32Array(AGENT_N * 2 * 3);
lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
const ringLines = new THREE.LineSegments(
  lineGeo,
  new THREE.LineBasicMaterial({ color: 0x8b93a3, transparent: true, opacity: 0.18 })
);
constellation.add(ringLines);

const agentWorld = [];
for (let i = 0; i < AGENT_N; i++) agentWorld.push(new THREE.Vector3());

function stepConstellation(t) {
  let idx = 0;
  let ringStart = 0;
  RINGS.forEach((ring) => {
    for (let i = 0; i < ring.n; i++) {
      const d = agentData[idx];
      const a = d.phase + t * d.speed;
      _v1.set(Math.cos(a) * d.r, Math.sin(d.bob + t * 0.6) * 0.12, Math.sin(a) * d.r);
      _v1.applyQuaternion(d.q);
      agentWorld[idx].copy(_v1);
      _m4.makeTranslation(_v1.x, _v1.y, _v1.z);
      agents.setMatrixAt(idx, _m4);
      idx++;
    }
    // connect ring neighbours
    for (let i = 0; i < ring.n; i++) {
      const a = agentWorld[ringStart + i];
      const b = agentWorld[ringStart + ((i + 1) % ring.n)];
      const o = (ringStart + i) * 6;
      linePos[o] = a.x; linePos[o + 1] = a.y; linePos[o + 2] = a.z;
      linePos[o + 3] = b.x; linePos[o + 4] = b.y; linePos[o + 5] = b.z;
    }
    ringStart += ring.n;
  });
  agents.instanceMatrix.needsUpdate = true;
  lineGeo.attributes.position.needsUpdate = true;
  core.rotation.y = t * 0.18;
  core.rotation.x = Math.sin(t * 0.1) * 0.2;
  coreShell.rotation.y = -t * 0.12;
  coreShell.rotation.z = t * 0.07;
}

/* ————— dust ————— */

const DUST_N = MOBILE ? 220 : 520;
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST_N * 3);
const dustVel = [];
for (let i = 0; i < DUST_N; i++) {
  dustPos[i * 3] = (Math.random() - 0.5) * 18;
  dustPos[i * 3 + 1] = Math.random() * 8;
  dustPos[i * 3 + 2] = 8 - Math.random() * 80;
  dustVel.push({
    x: (Math.random() - 0.5) * 0.06,
    y: (Math.random() - 0.5) * 0.04,
    z: (Math.random() - 0.5) * 0.05,
    p: Math.random() * Math.PI * 2,
  });
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dustMat = new THREE.PointsMaterial({
  size: 0.05, map: softCircleTexture(0.0), transparent: true, opacity: 0.3,
  blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffd9a0, sizeAttenuation: true,
});
// clamp sprite size so a mote drifting right past the lens never blows out the frame
dustMat.onBeforeCompile = (s) => {
  s.vertexShader = s.vertexShader.replace(
    '#include <fog_vertex>',
    '#include <fog_vertex>\n\tgl_PointSize = min(gl_PointSize, 11.0);'
  );
};
const dust = new THREE.Points(dustGeo, dustMat);
world.add(dust);

function stepDust(dt, t) {
  for (let i = 0; i < DUST_N; i++) {
    const v = dustVel[i];
    dustPos[i * 3] += (v.x + Math.sin(t * 0.4 + v.p) * 0.02) * dt;
    dustPos[i * 3 + 1] += (v.y + Math.cos(t * 0.3 + v.p) * 0.015) * dt;
    dustPos[i * 3 + 2] += v.z * dt;
    if (dustPos[i * 3 + 1] < 0) dustPos[i * 3 + 1] = 8;
    if (dustPos[i * 3 + 1] > 8.2) dustPos[i * 3 + 1] = 0.1;
  }
  dustGeo.attributes.position.needsUpdate = true;
}

/* ————— post-processing ————— */

if (renderer) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  bokehPass = new BokehPass(scene, camera, {
    focus: 12, aperture: MOBILE ? 0.0001 : 0.00022, maxblur: MOBILE ? 0.004 : 0.006,
  });
  composer.addPass(bokehPass);

  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.55, 0.78);
  composer.addPass(bloomPass);

  gradePass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uGrain: { value: 0.055 },
      uVignette: { value: 0.42 },
      uCA: { value: 0.0016 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform float uTime, uGrain, uVignette, uCA;
      varying vec2 vUv;
      float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
      void main() {
        vec2 c = vUv - 0.5;
        float d = length(c);
        vec2 dir = d > 0.0 ? c / d : vec2(0.0);
        float ca = uCA * smoothstep(0.1, 0.75, d);
        vec3 col;
        col.r = texture2D(tDiffuse, vUv + dir * ca).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - dir * ca).b;
        col += (rand(vUv) - 0.5) * uGrain;
        col *= 1.0 - smoothstep(0.35, 0.95, d) * uVignette;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());
}

/* ————— cinematography: keyframed camera path ————— */

// each key: scroll progress, camera position, look target, bloom, aperture scale.
// progress values are computed at runtime from the real DOM section offsets so
// the camera acts stay locked to the copy regardless of section heights.
// every shot faces down the corridor (-z); the finale is a pull-back crane.
const SHOTS = [
  { at: ['sec', 0, 0.0], pos: [-1.8, 2.05, 12.8], tgt: [-3.4, 2.65, 0.0], bloom: 0.50, ap: 1.0 },  // hero — monolith right of frame
  { at: ['mid', 0, 0.5], pos: [1.8, 2.00, 10.0], tgt: [-1.6, 2.50, 0.0], bloom: 0.50, ap: 1.0 },
  { at: ['sec', 1, 0.0], pos: [5.0, 2.35, 3.0], tgt: [-2.4, 2.30, -7.5], bloom: 0.42, ap: 1.8 },   // deficit — focus falls apart among shards
  { at: ['mid', 1, 0.55], pos: [2.4, 2.30, -4.0], tgt: [-1.2, 2.30, -16.0], bloom: 0.52, ap: 1.2 },
  { at: ['sec', 2, 0.0], pos: [1.7, 2.30, -8.6], tgt: [-1.3, 2.35, -16.0], bloom: 0.58, ap: 1.0 }, // gate right of frame
  { at: ['mid', 2, 0.62], pos: [0.4, 2.42, -15.3], tgt: [0.15, 2.5, -24.0], bloom: 0.68, ap: 0.8 }, // through the gate, just off the beam axis
  { at: ['sec', 3, 0.0], pos: [5.4, 2.70, -27.6], tgt: [-2.6, 3.10, -34.5], bloom: 0.55, ap: 1.15 }, // ledger — chain lower-left
  { at: ['mid', 3, 0.55], pos: [0.6, 3.10, -30.2], tgt: [-5.2, 3.30, -36.0], bloom: 0.55, ap: 1.2 }, // tracking along the chain
  { at: ['sec', 4, 0.0], pos: [1.2, 3.40, -46.5], tgt: [-2.2, 3.20, -56.0], bloom: 0.60, ap: 1.0 }, // team — constellation right of frame
  { at: ['mid', 4, 0.5], pos: [-3.8, 4.10, -49.0], tgt: [-1.0, 3.20, -56.0], bloom: 0.62, ap: 0.95 },
  { at: ['sec', 5, 0.0], pos: [-5.8, 3.10, -52.5], tgt: [0.0, 3.40, -56.5], bloom: 0.62, ap: 0.9 }, // human gate — eye level with the core
  { at: ['mid', 5, 0.5], pos: [-2.0, 5.60, -45.5], tgt: [0.0, 3.00, -56.0], bloom: 0.58, ap: 0.8 }, // pull-back reveal
  { at: ['sec', 6, 0.0], pos: [0.0, 8.00, -42.0], tgt: [0.0, 2.60, -56.0], bloom: 0.55, ap: 0.7 },  // case closed — crane over the whole system
  { at: ['end'], pos: [0.0, 9.60, -40.0], tgt: [0.0, 2.40, -56.0], bloom: 0.52, ap: 0.65 },
];

let KEYS = [];
function buildKeys() {
  const secs = [...document.querySelectorAll('.exhibit')];
  const scrollable = Math.max(1, document.body.scrollHeight - innerHeight);
  const P = secs.map((s) => THREE.MathUtils.clamp(s.offsetTop / scrollable, 0, 1));
  const resolve = (at) => {
    if (at[0] === 'end') return 1;
    if (at[0] === 'sec') return P[at[1]];
    const a = P[at[1]], b = at[1] + 1 < P.length ? P[at[1] + 1] : 1;
    return a + (b - a) * at[2];
  };
  KEYS = SHOTS.map((s) => ({ ...s, p: resolve(s.at) }));
  KEYS.sort((a, b) => a.p - b.p);
}
buildKeys();

const easeIO = (x) => x * x * (3 - 2 * x);

function sampleKeys(p, out) {
  let i = 0;
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = easeIO(THREE.MathUtils.clamp((p - a.p) / (b.p - a.p), 0, 1));
  out.pos.set(
    THREE.MathUtils.lerp(a.pos[0], b.pos[0], t),
    THREE.MathUtils.lerp(a.pos[1], b.pos[1], t),
    THREE.MathUtils.lerp(a.pos[2], b.pos[2], t)
  );
  out.tgt.set(
    THREE.MathUtils.lerp(a.tgt[0], b.tgt[0], t),
    THREE.MathUtils.lerp(a.tgt[1], b.tgt[1], t),
    THREE.MathUtils.lerp(a.tgt[2], b.tgt[2], t)
  );
  out.bloom = THREE.MathUtils.lerp(a.bloom, b.bloom, t);
  out.ap = THREE.MathUtils.lerp(a.ap, b.ap, t);
}

const shot = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), bloom: 0.55, ap: 1 };
const smooth = {
  pos: new THREE.Vector3(0, 2.1, 12.6),
  tgt: new THREE.Vector3(0, 2.7, 0.4),
};
let scrollP = 0;
function readScroll() {
  const max = Math.max(1, document.body.scrollHeight - innerHeight);
  scrollP = THREE.MathUtils.clamp((window.scrollY || 0) / max, 0, 1);
}

// Lenis only reports wheel-driven scrolls; keep ScrollTrigger honest on
// native scrolls too (scrollbar drags, keyboard, programmatic).
addEventListener('scroll', ScrollTrigger.update, { passive: true });

/* ————— pointer with inertia ————— */

const pointer = { x: 0, y: 0, sx: 0, sy: 0, active: false };
addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  pointer.active = true;
});

const raycaster = new THREE.Raycaster();
const chainPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -chainZ);
const chainHit = new THREE.Vector3();
const _ndc = new THREE.Vector2();

/* ————— render loop ————— */

let clock = new THREE.Clock();
let physAcc = 0;
const PHYS_DT = 1 / 60;
let introT = REDUCED ? 1 : 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // camera: sample shot, spring toward it
  readScroll();
  sampleKeys(scrollP, shot);
  if (introT < 1) {
    introT = Math.min(1, introT + dt * 0.36);
    const k = 1 - easeIO(introT);
    shot.pos.z += k * 6.5;
    shot.pos.y += k * 0.7;
  }

  const kPos = 1 - Math.exp(-dt * 4.2);
  const kTgt = 1 - Math.exp(-dt * 5.0);
  smooth.pos.lerp(shot.pos, REDUCED ? 1 : kPos);
  smooth.tgt.lerp(shot.tgt, REDUCED ? 1 : kTgt);

  // pointer parallax with inertia
  const kPtr = 1 - Math.exp(-dt * 2.6);
  pointer.sx += (pointer.x - pointer.sx) * kPtr;
  pointer.sy += (pointer.y - pointer.sy) * kPtr;

  camera.position.copy(smooth.pos);
  camera.position.x += pointer.sx * 0.35;
  camera.position.y += pointer.sy * 0.22;
  _v2.copy(smooth.tgt);
  _v2.x += pointer.sx * 0.12;
  _v2.y += pointer.sy * 0.08;
  camera.lookAt(_v2);

  // physics at fixed step
  let pointerOnChain = null;
  if (pointer.active && scrollP > 0.42 && scrollP < 0.78) {
    _ndc.set(pointer.x, pointer.y);
    raycaster.setFromCamera(_ndc, camera);
    if (raycaster.ray.intersectPlane(chainPlane, chainHit)) pointerOnChain = chainHit;
  }
  physAcc += dt;
  let steps = 0;
  while (physAcc >= PHYS_DT && steps < 4) {
    stepChain(PHYS_DT, t, pointerOnChain);
    physAcc -= PHYS_DT;
    steps++;
  }
  if (steps === 4) physAcc = 0;

  stepConstellation(t);
  stepDust(dt, t);

  // gate particles
  for (let i = 0; i < DENY_N; i++) {
    const p = denies[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.state === 0 && p.z <= -16) {
      const dx = p.x, dy = p.y - 2.3;
      const rad = Math.sqrt(dx * dx + dy * dy);
      if (p.allowed && rad < 1.9) {
        p.state = 2; p.flash = 1;
      } else {
        p.state = 1; p.flash = 1;
        p.vz = Math.abs(p.vz) * 0.45;
        p.vx += dx * 0.6; p.vy += dy * 0.6;
      }
    }
    p.flash = Math.max(0, p.flash - dt * 1.6);
    if ((p.state === 2 && p.z < -22.5) || (p.state === 1 && p.z > -9.5)) resetDeny(p);
    _m4.makeTranslation(p.x, p.y, p.z);
    denyMesh.setMatrixAt(i, _m4);
    if (p.state === 1) _col.copy(C.red).lerp(C.steel, 1 - p.flash);
    else if (p.state === 2) _col.copy(C.green).lerp(C.warm, 1 - p.flash);
    else _col.copy(C.steel).multiplyScalar(0.8);
    denyMesh.setColorAt(i, _col);
  }
  denyMesh.instanceMatrix.needsUpdate = true;
  if (denyMesh.instanceColor) denyMesh.instanceColor.needsUpdate = true;

  // ambient life
  fieldMat.uniforms.uTime.value = t;
  sealRing.material.emissiveIntensity = 2.4 + Math.sin(t * 1.7) * 0.35;
  sealLight.intensity = 13 + Math.sin(t * 1.7) * 2.2;
  beam.material.opacity = 0.16 + (Math.sin(t * 2.3) * 0.5 + 0.5) * 0.14;
  shafts.forEach((s, i) => { s.material.opacity = (0.032 + i * 0.008) + Math.sin(t * 0.5 + i * 2.1) * 0.008; });
  shards.children.forEach((s) => {
    s.position.y = s.userData.baseY + Math.sin(t * 0.5 + s.userData.phase) * 0.22;
    s.rotation.y += dt * 0.06;
  });

  // cinematography grading
  if (composer) {
    const focusDist = camera.position.distanceTo(smooth.tgt);
    bokehPass.uniforms.focus.value += (focusDist - bokehPass.uniforms.focus.value) * (1 - Math.exp(-dt * 3.5));
    bokehPass.uniforms.aperture.value = (MOBILE ? 0.0001 : 0.00022) * shot.ap;
    bloomPass.strength += (shot.bloom - bloomPass.strength) * (1 - Math.exp(-dt * 3));
    gradePass.uniforms.uTime.value = t % 100;
    composer.render();
  }
}

/* ————— DOM choreography ————— */

function splitWords() {
  document.querySelectorAll('.reveal-words').forEach((el) => {
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((piece) => {
            if (!piece) return;
            if (/^\s+$/.test(piece)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            w.className = 'w';
            const inner = document.createElement('i');
            inner.textContent = piece;
            w.appendChild(inner);
            frag.appendChild(w);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(el);
  });
}

function setupReveals() {
  document.querySelectorAll('.exhibit').forEach((section) => {
    const words = section.querySelectorAll('.reveal-words .w > i');
    const items = section.querySelectorAll('.reveal');
    const tl = gsap.timeline({
      scrollTrigger: { trigger: section, start: 'top 72%', once: true },
    });
    if (words.length) {
      tl.to(words, { y: 0, duration: 1.1, ease: 'power4.out', stagger: 0.045 }, 0.1);
    }
    if (items.length) {
      tl.to(items, { opacity: 1, y: 0, duration: 1.0, ease: 'power3.out', stagger: 0.12 }, 0.25);
    }
  });
}

function setupCounters() {
  document.querySelectorAll('[data-count]').forEach((el) => {
    const end = +el.dataset.count;
    ScrollTrigger.create({
      trigger: el, start: 'top 98%', once: true,
      onEnter: () => {
        const obj = { v: 0 };
        gsap.to(obj, {
          v: end, duration: 1.8, ease: 'power2.out',
          onUpdate: () => { el.textContent = Math.round(obj.v); },
        });
      },
    });
  });
}

function setupRail() {
  const fill = document.getElementById('rail-fill');
  ScrollTrigger.create({
    trigger: '#content', start: 'top top', end: 'bottom bottom', scrub: true,
    onUpdate: (self) => { fill.style.transform = `scaleY(${self.progress})`; },
  });
  const items = [...document.querySelectorAll('#rail li')];
  document.querySelectorAll('.exhibit').forEach((section, i) => {
    ScrollTrigger.create({
      trigger: section, start: 'top 50%', end: 'bottom 50%',
      onToggle: (self) => {
        if (self.isActive) items.forEach((li, j) => li.classList.toggle('active', j === i));
      },
    });
  });
}

function setupCopy() {
  const toast = document.getElementById('toast');
  let toastTimer;
  document.querySelectorAll('[data-cmd]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.cmd);
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
      } catch (e) { /* clipboard unavailable — ignore */ }
    });
  });
}

/* ————— loader & boot ————— */

const loaderEl = document.getElementById('loader');
const loaderFill = document.getElementById('loader-fill');
const loaderLine = document.getElementById('loader-line');
const bootLines = [
  'opening evidence file…',
  `sha256:${fakeHash(12)}… verified`,
  'custody chain intact',
  'verdict: CONFIRMED',
];

async function boot() {
  splitWords();

  let li = 0;
  const lineTimer = setInterval(() => {
    li = Math.min(li + 1, bootLines.length - 1);
    loaderLine.textContent = bootLines[li];
  }, 420);

  loaderFill.style.width = '30%';
  try { await document.fonts.ready; } catch (e) { /* ok */ }
  loaderFill.style.width = '65%';

  // pre-warm the pipeline so the first scrolled frame doesn't hitch
  if (composer) {
    sampleKeys(0, shot);
    smooth.pos.copy(shot.pos).add(new THREE.Vector3(0, 0.7, 6.5));
    smooth.tgt.copy(shot.tgt);
    camera.position.copy(smooth.pos);
    camera.lookAt(smooth.tgt);
    composer.render();
  }
  loaderFill.style.width = '100%';

  setTimeout(() => {
    clearInterval(lineTimer);
    loaderEl.classList.add('done');
    clock = new THREE.Clock();

    gsap.to('#nav', { opacity: 1, y: 0, duration: 1.2, ease: 'power3.out', delay: 0.35 });
    gsap.to('#rail', { opacity: 1, duration: 1.2, ease: 'power3.out', delay: 0.6 });

    setupReveals();
    setupCounters();
    setupRail();
    setupCopy();
    ScrollTrigger.refresh();
    buildKeys();

    gsap.ticker.add(tick);
  }, 650);
}

window.__dbg = () => ({
  p: scrollP, keys: KEYS.map((k) => +k.p.toFixed(3)),
  cam: camera.position.toArray().map((v) => +v.toFixed(2)),
  shotPos: [shot.pos.x, shot.pos.y, shot.pos.z].map((v) => +v.toFixed(2)),
});

/* ————— resize ————— */

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (renderer) {
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  }
  buildKeys();
});

boot();
