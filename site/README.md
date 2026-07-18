# opsbench site

The opsbench marketing site: Astro 5 + React islands, with the WebGL
experience built on React Three Fiber and lit by an offline Cycles bake.

## Commands

```bash
npm install
npm run dev        # local dev server
npm run build      # static build into dist/
npm run preview    # serve the build
```

## Asset pipeline (Blender, headless)

The 3D set (floor, plinth, monolith, gate, slabs) is authored and lit in
`assets/blender/build_scene.py`, path-traced by Cycles into per-object
lightmaps, AO maps, and an HDR environment probe, then exported as
`public/assets/baked/set.glb`:

```bash
pip install bpy numpy
python3 assets/blender/build_scene.py        # full-quality bake
FAST_BAKE=1 python3 assets/blender/build_scene.py  # quick preview bake
python3 assets/blender/postprocess_maps.py   # denoise + downscale + webp
```

The source `.blend` is saved next to the script after each run for
interactive look-dev.

## Architecture

- `src/pages/index.astro` — static exhibit copy (zero client JS)
- `src/components/scene/` — the R3F island: `Stage` (canvas, tiers, Lenis),
  `director` (camera keyframes + springs; Theatre.js adapter seam),
  `BakedSet` (glb + lightmaps), `Gate`, `CustodyChain` (verlet physics),
  `Constellation`, `Atmosphere`, `Effects` (SMAA / DOF / bloom / AgX grade)
- `src/lib/choreography.ts` — DOM reveals, counters, rail, copy buttons

Deploy: static output (`dist/`) — Vercel with no adapter, or any static host.
