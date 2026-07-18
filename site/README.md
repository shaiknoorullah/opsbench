# opsbench site

The opsbench marketing site: Astro 5 + React islands, with the WebGL
experience built on React Three Fiber and lit by an offline Cycles bake.

## Commands

```bash
npm install
npm run dev        # local dev server
npm run cms        # dev server + Keystatic editor at /keystatic
npm run build      # build into .vercel/output (static + api functions)
```

## Asset pipeline (Blender, headless)

The 3D set (floor, plinth, monolith, gate, colonnade, steles) is authored and
lit in `assets/blender/build_scene.py`, path-traced by Cycles into per-object
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
  `director` (50mm camera keyframes, focus pulls, per-act grades; Theatre.js
  adapter seam), `BakedSet` (glb + lightmaps), `Gate`, `CustodyChain` (verlet
  physics), `Constellation`, `Atmosphere`, `Effects` (SMAA / god rays / DOF /
  bloom / grade / AgX)
- `src/lib/choreography.ts` — DOM reveals, counters, rail, copy buttons
- `src/content/case-files/` — the blog, MDX content collection; edited via
  Keystatic (`npm run cms`), so every revision is a commit
- `src/pages/api/` — `subscribe` (listmonk) and `contact` (Postgres)
  endpoints; zod-validated on both sides with honeypot + time-trap
- `src/lib/analytics.ts` — Umami wrapper + scroll-depth events (no-ops when
  analytics is unconfigured)
- `infra/` — k8s manifests for self-hosted Umami and listmonk

## Environment variables

All optional — every feature degrades gracefully when unconfigured.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `PUBLIC_UMAMI_SRC` | layout | Umami `script.js` URL |
| `PUBLIC_UMAMI_WEBSITE_ID` | layout | Umami website id |
| `LISTMONK_URL` | `/api/subscribe` | listmonk base URL |
| `LISTMONK_USER` | `/api/subscribe` | listmonk API user |
| `LISTMONK_TOKEN` | `/api/subscribe` | listmonk API token |
| `LISTMONK_LIST_ID` | `/api/subscribe` | numeric list id |
| `DATABASE_URL` | `/api/contact` | Postgres connection string |

## Analytics event taxonomy

`copy_install_command` (primary conversion), `github_click`,
`exhibit_view` (per exhibit), `reached_cta`, `newsletter_subscribe`,
`newsletter_prompt_shown`, `contact_submit`. First-touch `utm_*` params are
persisted client-side and attached to form submissions.

## Deploy (Vercel, free tier)

1. Import the repo; set the project **Root Directory to `site/`**.
2. Framework preset: Astro (auto-detected; the Vercel adapter is configured).
3. Add the environment variables above as needed.
4. Every PR gets a preview deployment; `main` deploys to production.

CI: `.github/workflows/site-ci.yml` builds the site on PRs touching `site/`.
