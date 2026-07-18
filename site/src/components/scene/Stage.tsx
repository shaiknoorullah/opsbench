/* Stage — the island entry. Owns the Canvas, quality tiering, Lenis smooth
   scroll, the Director, and DOM choreography (reveals, counters, rail). */

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import Lenis from 'lenis';
import { Director } from './director';
import { BakedSet } from './BakedSet';
import { Gate } from './Gate';
import { CustodyChain } from './CustodyChain';
import { Constellation } from './Constellation';
import { Atmosphere } from './Atmosphere';
import { Effects } from './Effects';
import { quality, REDUCED, readScroll, scrollState } from './store';
import { initDomChoreography } from '../../lib/choreography';

function detectTier(): typeof quality.tier {
  if (typeof navigator === 'undefined') return 'mid';
  const forced = new URLSearchParams(location.search).get('tier');
  if (forced === 'low' || forced === 'mid' || forced === 'high') return forced;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mem = (navigator as any).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  if (coarse || mem <= 4 || cores <= 4) return 'low';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl!.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software/i.test(renderer)) return 'low';
    if (/intel(?!.*arc)|uhd|iris/i.test(renderer)) return 'mid';
  } catch {
    /* default */
  }
  return 'high';
}

function Rig({ director }: { director: Director }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene);
  const lastY = useRef(0);

  useFrame((st, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const y = window.scrollY || 0;
    scrollState.v = scrollState.v * 0.85 + (y - lastY.current) * 0.15;
    lastY.current = y;
    scrollState.p = readScroll();
    director.update(camera, scrollState.p, scrollState.v, dt, st.clock.elapsedTime, REDUCED);
    // per-act atmosphere density rides the grade spring
    if (scene.fog instanceof THREE.FogExp2) scene.fog.density = director.fogDensity;
  });
  return null;
}

export default function Stage() {
  const [ready, setReady] = useState(false);
  const [sun, setSun] = useState<THREE.Mesh | null>(null);
  const director = useMemo(() => new Director(REDUCED), []);

  useEffect(() => {
    quality.tier = detectTier();

    let lenis: Lenis | null = null;
    if (!REDUCED) {
      lenis = new Lenis({ duration: 1.25, smoothWheel: true });
      const raf = (time: number) => {
        lenis!.raf(time);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    }

    director.buildKeys();
    const rebuild = () => director.buildKeys();
    addEventListener('resize', rebuild);

    const onPointer = (e: PointerEvent) => {
      director.setPointer((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    };
    addEventListener('pointermove', onPointer);

    const teardownDom = initDomChoreography(lenis);
    // fonts affect layout -> key positions
    document.fonts?.ready.then(() => director.buildKeys());
    setReady(true);

    return () => {
      removeEventListener('resize', rebuild);
      removeEventListener('pointermove', onPointer);
      teardownDom();
      lenis?.destroy();
    };
  }, [director]);

  const low = quality.tier === 'low';

  return (
    <Canvas
      gl={{
        antialias: false,
        powerPreference: 'high-performance',
        toneMapping: THREE.NoToneMapping, // grade happens in the composer (AgX)
      }}
      dpr={low ? [1, 1.5] : [1, 1.75]}
      camera={{ fov: 27, near: 0.1, far: 200, position: [-1.2, 1.9, 24.0] }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        document.getElementById('loader')?.classList.add('done');
      }}
    >
      <Suspense fallback={null}>
        <Atmosphere onSun={setSun} />
        <BakedSet />
        <Gate />
        <CustodyChain />
        <Constellation />
        {ready && <Rig director={director} />}
        <Effects director={director} sun={sun} />
      </Suspense>
    </Canvas>
  );
}
