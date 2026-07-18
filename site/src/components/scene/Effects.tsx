/* The film grade: SMAA -> bloom -> DOF (focus-pulled by the Director) ->
   chromatic aberration -> grain -> vignette, AgX-style tone mapping.
   pmndrs/postprocessing merges these into minimal fullscreen passes. */

import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  Noise,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import type { Director } from './director';
import { quality, REDUCED } from './store';

export function Effects({ director }: { director: Director }) {
  const bloom = useRef<any>(null);
  const dof = useRef<any>(null);
  const ca = useRef<any>(null);

  const low = quality.tier === 'low';

  useFrame(() => {
    if (bloom.current) bloom.current.intensity = director.bloom;
    if (dof.current) {
      const cocMaterial = dof.current.cocMaterial ?? dof.current.circleOfConfusionMaterial;
      if (cocMaterial) {
        cocMaterial.focusDistance = 0; // we drive via worldFocusDistance
        cocMaterial.worldFocusDistance = director.focusDist;
        cocMaterial.worldFocusRange = 6 / Math.max(0.25, director.aperture);
      }
    }
    if (ca.current?.offset) {
      const k = 0.00045 + director.ramp * 0.002;
      ca.current.offset.set(k, k * 0.6);
    }
  });

  if (REDUCED) {
    return (
      <EffectComposer multisampling={0}>
        <ToneMapping mode={ToneMappingMode.AGX} />
      </EffectComposer>
    );
  }

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <SMAA />
      {low ? <></> : (
        <DepthOfField ref={dof} focusDistance={0.02} focalLength={0.05} bokehScale={4.5} height={480} />
      )}
      <Bloom ref={bloom} intensity={0.5} luminanceThreshold={0.72} luminanceSmoothing={0.3} mipmapBlur />
      <ChromaticAberration ref={ca} blendFunction={BlendFunction.NORMAL} offset={new THREE.Vector2(0.00045, 0.00027)} radialModulation modulationOffset={0.55} />
      <Noise premultiply opacity={0.55} />
      <Vignette eskil={false} offset={0.28} darkness={0.72} />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  );
}
