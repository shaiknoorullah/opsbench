/* The film grade: SMAA -> god rays (high tier) -> DOF -> bloom -> CA ->
   per-act parametric grade -> grain -> vignette -> AgX tone mapping.

   All simple effects are instantiated directly and driven imperatively in
   useFrame. Deliberately NOT using the wrapper components' ref props: with
   React 19 refs are plain props, and @react-three/postprocessing memoizes
   wrapped effects with JSON.stringify(props) — a ref to a live effect drags
   the scene graph into stringify and crashes on its circular references. */

import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from '@react-three/postprocessing';
import {
  BlendFunction,
  BloomEffect,
  ChromaticAberrationEffect,
  DepthOfFieldEffect,
  GodRaysEffect,
  KernelSize,
  NoiseEffect,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import type { Director } from './director';
import { GradeEffect } from './GradeEffect';
import { quality, REDUCED } from './store';

export function Effects({ director, sun }: { director: Director; sun: THREE.Mesh | null }) {
  const camera = useThree((s) => s.camera);
  const low = quality.tier === 'low';
  const high = quality.tier === 'high';

  const fx = useMemo(() => {
    const smaa = new SMAAEffect();
    const dof = low
      ? null
      : new DepthOfFieldEffect(camera as THREE.PerspectiveCamera, {
          worldFocusDistance: 9.3,
          worldFocusRange: 16,
          bokehScale: 3.6,
          height: 480,
        });
    const bloom = new BloomEffect({
      intensity: 0.5,
      luminanceThreshold: 0.72,
      luminanceSmoothing: 0.3,
      mipmapBlur: true,
    });
    const ca = new ChromaticAberrationEffect({
      blendFunction: BlendFunction.NORMAL,
      offset: new THREE.Vector2(0.00045, 0.00027),
      radialModulation: true,
      modulationOffset: 0.55,
    });
    const grade = new GradeEffect();
    const noise = new NoiseEffect({ premultiply: true });
    noise.blendMode.opacity.value = 0.55;
    const vignette = new VignetteEffect({ eskil: false, offset: 0.28, darkness: 0.72 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    return { smaa, dof, bloom, ca, grade, noise, vignette, tone };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, low]);

  const godRays = useMemo(() => {
    if (!high || !sun || REDUCED) return null;
    return new GodRaysEffect(camera, sun, {
      density: 0.92,
      decay: 0.93,
      weight: 0.3,
      exposure: 0.28,
      samples: 48,
      kernelSize: KernelSize.SMALL,
      blur: true,
    });
  }, [camera, sun, high]);

  useFrame(() => {
    fx.bloom.intensity = director.bloom;
    const k = 0.00045 + director.ramp * 0.002;
    fx.ca.offset.set(k, k * 0.6);
    fx.grade.temp = director.temp;
    fx.grade.sat = director.sat;
    if (fx.dof) {
      const coc = fx.dof.cocMaterial;
      coc.worldFocusDistance = director.focusDist;
      // CoC ramps from zero blur at the focus plane to full blur at
      // focusRange — a wide range keeps the subject zone crisp while
      // near-lens dust and the far hall still melt into bokeh
      coc.worldFocusRange = 16 / Math.max(0.35, director.aperture);
    }
  });

  if (REDUCED) {
    return (
      <EffectComposer multisampling={0}>
        <primitive object={fx.tone} dispose={null} />
      </EffectComposer>
    );
  }

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <primitive object={fx.smaa} dispose={null} />
      {godRays ? <primitive object={godRays} dispose={null} /> : <></>}
      {fx.dof ? <primitive object={fx.dof} dispose={null} /> : <></>}
      <primitive object={fx.bloom} dispose={null} />
      <primitive object={fx.ca} dispose={null} />
      <primitive object={fx.grade} dispose={null} />
      <primitive object={fx.noise} dispose={null} />
      <primitive object={fx.vignette} dispose={null} />
      <primitive object={fx.tone} dispose={null} />
    </EffectComposer>
  );
}
