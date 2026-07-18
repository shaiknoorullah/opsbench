/* The static evidence-hall set: geometry from Blender, lighting path-traced
   offline by Cycles into lightmaps + AO, environment from the baked HDR probe.
   This is why the scene reads "raytraced" at runtime for the cost of textures. */

import { useEffect } from 'react';
import * as THREE from 'three';
import { useGLTF, useTexture } from '@react-three/drei';
import { useLoader, useThree } from '@react-three/fiber';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const BAKED = '/assets/baked';

/* Multi-octave value-noise detail map — breaks up uniform roughness, the
   single biggest "CG plastic" tell. Generated once at runtime (512px). */
function detailRoughnessTexture() {
  const s = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(s, s);
  const rand = (() => {
    let seed = 987654321;
    return () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
  })();
  // octave value-noise on coarse grids, bilinearly sampled
  const octave = (cells: number) => {
    const grid = Array.from({ length: (cells + 1) * (cells + 1) }, () => rand());
    return (x: number, y: number) => {
      const gx = (x / s) * cells;
      const gy = (y / s) * cells;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;
      const sm = (v: number) => v * v * (3 - 2 * v);
      const i = (xx: number, yy: number) => grid[(yy % cells) * (cells + 1) + (xx % cells)];
      return (
        i(x0, y0) * (1 - sm(fx)) * (1 - sm(fy)) +
        i(x0 + 1, y0) * sm(fx) * (1 - sm(fy)) +
        i(x0, y0 + 1) * (1 - sm(fx)) * sm(fy) +
        i(x0 + 1, y0 + 1) * sm(fx) * sm(fy)
      );
    };
  };
  const o1 = octave(6);
  const o2 = octave(23);
  const o3 = octave(89);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const n = o1(x, y) * 0.5 + o2(x, y) * 0.32 + o3(x, y) * 0.18;
      // centered on mid-gray: map multiplies material roughness
      const v = Math.round(160 + (n - 0.5) * 70);
      const idx = (y * s + x) * 4;
      img.data[idx] = img.data[idx + 1] = img.data[idx + 2] = v;
      img.data[idx + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** name -> runtime material recipe layered over the baked light */
const RECIPES: Record<string, () => THREE.MeshPhysicalMaterial> = {
  Floor: () => {
    const m = new THREE.MeshPhysicalMaterial({
      color: 0x191a1f, roughness: 0.62, metalness: 0.5, envMapIntensity: 0.08,
    });
    const detail = detailRoughnessTexture();
    detail.repeat.set(9, 9);
    m.roughnessMap = detail; // green channel; mid-gray-centered variation
    return m;
  },
  Plinth: () =>
    new THREE.MeshPhysicalMaterial({
      color: 0x0e0f13, roughness: 0.3, metalness: 0.4,
      clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 0.6,
    }),
  Monolith: () =>
    new THREE.MeshPhysicalMaterial({
      color: 0x0e0f13, roughness: 0.2, metalness: 0.4,
      clearcoat: 1, clearcoatRoughness: 0.22, envMapIntensity: 0.75,
    }),
  Gate: () =>
    new THREE.MeshPhysicalMaterial({
      color: 0x30343c, roughness: 0.34, metalness: 1, envMapIntensity: 1.0,
      anisotropy: 0.65, anisotropyRotation: Math.PI / 2, // brushed along the ring
    }),
  Colonnade: () =>
    new THREE.MeshPhysicalMaterial({
      color: 0x111318, roughness: 0.44, metalness: 0.45, envMapIntensity: 0.35,
    }),
  Steles: () =>
    new THREE.MeshPhysicalMaterial({
      color: 0x101216, roughness: 0.4, metalness: 0.5, envMapIntensity: 0.4,
    }),
};

const LM_INTENSITY = 2.8; // bake scales by 0.5 into LDR; extra headroom for the AgX grade

export function BakedSet() {
  const { scene: set } = useGLTF(`${BAKED}/set.glb`);
  const { scene, gl } = useThree();

  const env = useLoader(RGBELoader, `${BAKED}/env_hall.hdr`);

  const names = Object.keys(RECIPES);
  const maps = useTexture([
    ...names.map((n) => `${BAKED}/lm_${n.toLowerCase()}.webp`),
    ...names.map((n) => `${BAKED}/ao_${n.toLowerCase()}.webp`),
  ]);

  useEffect(() => {
    env.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = env;
    scene.environmentIntensity = 0.45;
  }, [env, scene]);

  useEffect(() => {
    const lm: Record<string, THREE.Texture> = {};
    const ao: Record<string, THREE.Texture> = {};
    names.forEach((n, i) => {
      lm[n] = maps[i];
      ao[n] = maps[i + names.length];
    });
    for (const tex of maps) {
      tex.colorSpace = THREE.NoColorSpace; // linear bake data
      tex.channel = 1; // TEXCOORD_1 = the Lightmap UV set
      tex.flipY = false; // glTF-style UVs
      tex.anisotropy = gl.capabilities.getMaxAnisotropy();
      tex.needsUpdate = true;
    }

    set.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.name === 'Strips') {
        obj.material = new THREE.MeshStandardMaterial({
          color: 0x1a1206,
          emissive: 0xffd9a0,
          emissiveIntensity: 2.6,
          roughness: 0.4,
        });
        return;
      }
      const recipe = RECIPES[obj.name];
      if (!recipe) return;
      const mat = recipe();
      if (lm[obj.name]) {
        mat.lightMap = lm[obj.name];
        mat.lightMapIntensity = LM_INTENSITY;
      }
      if (ao[obj.name]) {
        mat.aoMap = ao[obj.name];
        mat.aoMapIntensity = 1.0;
      }
      obj.material = mat;
      obj.frustumCulled = obj.name !== 'Floor';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, maps]);

  return <primitive object={set} />;
}

useGLTF.preload(`${BAKED}/set.glb`);
