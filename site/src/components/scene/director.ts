/* The Director: cinematography as data.
   Shot keyframes are anchored to real DOM section offsets at runtime, sampled
   by scroll progress with smoothstep easing, then chased by critically damped
   springs. Scroll velocity drives the speed-ramp (FOV kick + aperture + grain).

   This module is deliberately framework-agnostic: it is the adapter seam where
   a Theatre.js sequence can replace the keyframe table without touching the
   scene components. */

import * as THREE from 'three';

type ShotAnchor = ['sec', number, number] | ['mid', number, number] | ['end'];

interface Shot {
  at: ShotAnchor;
  pos: [number, number, number];
  tgt: [number, number, number];
  bloom: number;
  /** aperture scale — 1 = act default, >1 = shallower focus */
  ap: number;
  p?: number;
}

/* Same storyboard as the vanilla build — every shot faces down the corridor,
   finale is a pull-back crane. */
const SHOTS: Shot[] = [
  // hero: closer and lower — monolith large in the right third, the nearest
  // pilaster pair breaks the left frame edge as a defocused foreground mass
  { at: ['sec', 0, 0.0], pos: [-2.1, 1.9, 9.4], tgt: [-3.6, 2.75, 0.0], bloom: 0.5, ap: 1.0 },
  { at: ['mid', 0, 0.5], pos: [1.5, 1.95, 8.4], tgt: [-1.6, 2.55, -0.5], bloom: 0.5, ap: 1.0 },
  { at: ['sec', 1, 0.0], pos: [5.0, 2.35, 3.0], tgt: [-2.4, 2.3, -7.5], bloom: 0.42, ap: 1.8 },
  { at: ['mid', 1, 0.55], pos: [2.4, 2.3, -4.0], tgt: [-1.2, 2.3, -16.0], bloom: 0.52, ap: 1.2 },
  { at: ['sec', 2, 0.0], pos: [1.7, 2.3, -8.6], tgt: [-1.3, 2.35, -16.0], bloom: 0.58, ap: 1.0 },
  { at: ['mid', 2, 0.62], pos: [0.4, 2.42, -15.3], tgt: [0.15, 2.5, -24.0], bloom: 0.68, ap: 0.8 },
  { at: ['sec', 3, 0.0], pos: [5.4, 2.7, -27.6], tgt: [-2.6, 3.1, -34.5], bloom: 0.55, ap: 1.15 },
  { at: ['mid', 3, 0.55], pos: [0.6, 3.1, -30.2], tgt: [-5.2, 3.3, -36.0], bloom: 0.55, ap: 1.2 },
  { at: ['sec', 4, 0.0], pos: [1.2, 3.4, -46.5], tgt: [-2.2, 3.2, -56.0], bloom: 0.6, ap: 1.0 },
  { at: ['mid', 4, 0.5], pos: [-3.8, 4.1, -49.0], tgt: [-1.0, 3.2, -56.0], bloom: 0.62, ap: 0.95 },
  { at: ['sec', 5, 0.0], pos: [-5.8, 3.1, -52.5], tgt: [0.0, 3.4, -56.5], bloom: 0.62, ap: 0.9 },
  { at: ['mid', 5, 0.5], pos: [-2.0, 5.6, -45.5], tgt: [0.0, 3.0, -56.0], bloom: 0.58, ap: 0.8 },
  { at: ['sec', 6, 0.0], pos: [0.0, 8.0, -42.0], tgt: [0.0, 2.6, -56.0], bloom: 0.55, ap: 0.7 },
  { at: ['end'], pos: [0.0, 9.6, -40.0], tgt: [0.0, 2.4, -56.0], bloom: 0.52, ap: 0.65 },
];

const easeIO = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export class Director {
  private keys: Required<Shot>[] = [];

  readonly shot = {
    pos: new THREE.Vector3(-1.8, 2.05, 12.8),
    tgt: new THREE.Vector3(-3.4, 2.65, 0),
    bloom: 0.5,
    ap: 1,
  };

  /* spring-smoothed camera state */
  readonly pos = new THREE.Vector3(-1.8, 2.75, 19.3);
  readonly tgt = new THREE.Vector3(-3.4, 2.65, 0);
  readonly look = new THREE.Vector3();

  bloom = 0.5;
  aperture = 1;
  /** 0..1 speed-ramp intensity, from smoothed scroll velocity */
  ramp = 0;
  focusDist = 12;

  private introT = 0;
  private ptr = { x: 0, y: 0, sx: 0, sy: 0 };
  private drift = 0;

  constructor(reduced: boolean) {
    if (reduced) this.introT = 1;
  }

  buildKeys() {
    const secs = Array.from(document.querySelectorAll<HTMLElement>('.exhibit'));
    if (!secs.length) return;
    const scrollable = Math.max(1, document.body.scrollHeight - innerHeight);
    const P = secs.map((s) => clamp01(s.offsetTop / scrollable));
    const resolve = (at: ShotAnchor): number => {
      if (at[0] === 'end') return 1;
      if (at[0] === 'sec') return P[at[1]] ?? 1;
      const a = P[at[1]] ?? 0;
      const b = at[1] + 1 < P.length ? (P[at[1] + 1] ?? 1) : 1;
      return a + (b - a) * at[2];
    };
    this.keys = SHOTS.map((s) => ({ ...s, p: resolve(s.at) })) as Required<Shot>[];
    this.keys.sort((a, b) => a.p - b.p);
  }

  setPointer(x: number, y: number) {
    this.ptr.x = x;
    this.ptr.y = y;
  }

  private sample(p: number) {
    const K = this.keys;
    if (!K.length) return;
    let i = 0;
    while (i < K.length - 2 && p > K[i + 1].p) i++;
    const a = K[i];
    const b = K[i + 1];
    const t = easeIO(clamp01((p - a.p) / Math.max(1e-5, b.p - a.p)));
    this.shot.pos.set(
      THREE.MathUtils.lerp(a.pos[0], b.pos[0], t),
      THREE.MathUtils.lerp(a.pos[1], b.pos[1], t),
      THREE.MathUtils.lerp(a.pos[2], b.pos[2], t),
    );
    this.shot.tgt.set(
      THREE.MathUtils.lerp(a.tgt[0], b.tgt[0], t),
      THREE.MathUtils.lerp(a.tgt[1], b.tgt[1], t),
      THREE.MathUtils.lerp(a.tgt[2], b.tgt[2], t),
    );
    this.shot.bloom = THREE.MathUtils.lerp(a.bloom, b.bloom, t);
    this.shot.ap = THREE.MathUtils.lerp(a.ap, b.ap, t);
  }

  /** Advance springs; apply to camera. Returns nothing — read fields. */
  update(camera: THREE.PerspectiveCamera, p: number, v: number, dt: number, t: number, reduced: boolean) {
    this.sample(p);

    // intro dolly on first load
    if (this.introT < 1) {
      this.introT = Math.min(1, this.introT + dt * 0.36);
      const k = 1 - easeIO(this.introT);
      this.shot.pos.z += k * 6.5;
      this.shot.pos.y += k * 0.7;
    }

    const kPos = reduced ? 1 : 1 - Math.exp(-dt * 4.2);
    const kTgt = reduced ? 1 : 1 - Math.exp(-dt * 5.0);
    this.pos.lerp(this.shot.pos, kPos);
    this.tgt.lerp(this.shot.tgt, kTgt);

    // pointer parallax with inertia
    const kPtr = 1 - Math.exp(-dt * 2.6);
    this.ptr.sx += (this.ptr.x - this.ptr.sx) * kPtr;
    this.ptr.sy += (this.ptr.y - this.ptr.sy) * kPtr;

    // speed ramp: smoothed |velocity| -> 0..1
    const target = clamp01(Math.abs(v) / 55);
    this.ramp += (target - this.ramp) * (1 - Math.exp(-dt * 5));

    // handheld micro-drift so held shots never freeze
    this.drift = t;
    const dx = Math.sin(t * 0.31) * 0.045 + Math.sin(t * 0.83) * 0.02;
    const dy = Math.cos(t * 0.27) * 0.03 + Math.sin(t * 0.63) * 0.016;

    camera.position.copy(this.pos);
    camera.position.x += this.ptr.sx * 0.35 + dx;
    camera.position.y += this.ptr.sy * 0.22 + dy;
    this.look.copy(this.tgt);
    this.look.x += this.ptr.sx * 0.12;
    this.look.y += this.ptr.sy * 0.08;
    camera.lookAt(this.look);

    // FOV kick on speed ramps — the "whip" through transitions
    const fov = 42 + this.ramp * 9;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    this.bloom += (this.shot.bloom - this.bloom) * (1 - Math.exp(-dt * 3));
    this.aperture = this.shot.ap * (1 + this.ramp * 0.6);
    const fd = camera.position.distanceTo(this.tgt);
    this.focusDist += (fd - this.focusDist) * (1 - Math.exp(-dt * 3.5));
  }
}
