/* The static evidence-hall set: geometry from Blender, lighting path-traced
   offline by Cycles into lightmaps + AO, environment from the baked HDR probe.
   This is why the scene reads "raytraced" at runtime for the cost of textures. */

import { useEffect } from 'react';
import * as THREE from 'three';
import { useGLTF, useTexture } from '@react-three/drei';
import { useLoader, useThree } from '@react-three/fiber';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const BAKED = '/assets/baked';

/** name -> runtime material recipe layered over the baked light */
const RECIPES: Record<string, () => THREE.MeshPhysicalMaterial> = {
  Floor: () =>
    new THREE.MeshPhysicalMaterial({
      color: 0x191a1f, roughness: 0.46, metalness: 0.5, envMapIntensity: 0.08,
    }),
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
    }),
  SlabL: () =>
    new THREE.MeshPhysicalMaterial({
      color: 0x101216, roughness: 0.4, metalness: 0.5, envMapIntensity: 0.4,
    }),
  SlabR: () =>
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
