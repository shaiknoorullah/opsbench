# opsbench — landing site

A cinematic, WebGL-driven marketing site for **opsbench**, the governance and
orchestration plane for AI operations agents.

## Concept — "The Spine of Trust"

The page is one continuous scroll-driven film. A photorealistic obsidian
**ledger monolith** hangs in a volumetric void; as you descend, a Merkle chain
of audit blocks assembles around it, a deterministic gatekeeper seal clamps
shut, and the internal ledger-spine seals block by block. Each act maps to one
of the four disciplines that make an agent safe to grant production
write-access:

1. **Gatekeeper** — authorization outside the model
2. **Ledger** — a tamper-evident, signed spine of every action
3. **Autonomy** — earned through replay evaluation, never assumed
4. **Escalation** — a human is always reachable

## Stack

| Concern | Library |
|---|---|
| 3D / photorealism | [three.js](https://threejs.org) — PBR `MeshPhysicalMaterial`, procedural PMREM environment for image-based lighting, `RectAreaLight` cinematography |
| Post-processing | [postprocessing](https://github.com/pmndrs/postprocessing) — depth-of-field (rack focus), selective bloom, chromatic aberration, film grain, vignette, ACES tone mapping, SMAA |
| Smooth scroll | [Lenis](https://github.com/darkroomengineering/lenis) |
| Scroll cinematography | [GSAP](https://gsap.com) + ScrollTrigger — camera "stations" per act, scrubbed chain assembly, reveal choreography |
| Type | Space Grotesk (display) + Inter (body), self-hosted via Fontsource |
| Build | [Vite](https://vitejs.dev) |

Everything is self-contained: no external asset fetches, no CDNs. The HDR
environment is painted procedurally at runtime and pre-filtered with the PMREM
generator, so reflections and lighting need zero image downloads.

## Develop

```bash
cd site
npm install
npm run dev      # http://localhost:5173
```

## Build

```bash
npm run build    # -> dist/
npm run preview  # serve the production build
```

## Accessibility & performance

- Honors `prefers-reduced-motion`: disables smooth scroll, parallax, grain, and
  reveal transforms; the scene renders static.
- Graceful WebGL fallback: if the context can't be created, the canvas is hidden
  and a static gradient backdrop is used while all content stays readable.
- Pixel ratio is capped at 2 and the render loop pauses when the tab is hidden.
