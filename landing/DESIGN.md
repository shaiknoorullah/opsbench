# opsbench — Landing Page Design, Brand & Tone

Design plan for the opsbench marketing site. The page lives at `landing/index.html`
and is fully self-contained (all libraries and fonts vendored under `landing/vendor/`).

---

## 1. Brand foundation

Everything below is derived from the repository itself — the toolkit's own
constitution is the brand voice:

| Source | What it gives the brand |
| --- | --- |
| `docs/concepts/tone-and-constitution.md` | "The word *probable* is banned." "A claim without a citation is a rumor." No emojis. Verdicts are CONFIRMED / FALSIFIED / NEED-MORE-EVIDENCE / INCONCLUSIVE. |
| PRD `00-overview.md` (DP-3) | "Evidence or it didn't happen" — the headline writes itself. |
| README | Hard numbers: 11 skills, 33 subagents, 9 schemas, 2 Cedar policies, 4 hooks, 50 MCP recipes. NIST SP 800-86 / 800-61r2 grounding. |
| Master research synthesis | The trust deficit: 90% AI adoption vs 24% trust (DORA 2025); ~11% SOTA resolution on ITBench; every vendor accuracy claim self-reported. |

### Positioning statement

> Most AI on infrastructure guesses. opsbench investigates. It is the agent
> toolkit that treats production incidents as forensic cases: evidence sealed,
> mutations gated, verdicts earned.

### Creative concept — "The Evidence File"

The landing page **is a sealed forensic artifact**. Scrolling is the
investigation. Each section is an *Exhibit* (EXHIBIT 00 … EXHIBIT 06), every
marketing claim carries a mono-type citation (to a real repo file or a named
external source), and the footer is a chain-of-custody log for the page itself.
The marketing practices what the product enforces.

## 2. Visual identity

### Palette

| Token | Hex | Role |
| --- | --- | --- |
| Obsidian | `#0a0b0e` | Ground. The dark of a sealed evidence room. |
| Carbon | `#111318` | Raised surfaces, cards. |
| Bone | `#ece9e2` | Primary text. Warm porcelain, not sterile white. |
| Steel | `#8b93a3` | Secondary text, hairlines. |
| Evidence Amber | `#ffb454` | The seal-wax accent: hashes, seals, key light. |
| Verdict Green | `#4ade80` | CONFIRMED states only. Used sparingly. |
| Denial Red | `#f4485e` | FALSIFIED / policy-deny states only. |

Amber is the single dominant accent — it reads as sodium work-lights,
seal wax, and terminal phosphor at once. Green/red appear only as verdict
semantics, never decoration.

### Typography

- **Space Grotesk (variable, 300–700)** — display and body. Technical but warm;
  its slightly odd grotesk forms keep the page from feeling like a bank.
- **IBM Plex Mono (400/500)** — the "evidence" voice: exhibit labels, hashes,
  citations, terminal blocks, stats. Anything that is a *fact* is set in mono.

Rule: prose persuades in Grotesk; facts testify in Plex Mono.

### Texture & finish

- Film grain + vignette (WebGL post-processing), subtle CSS noise on DOM.
- Hairline rules (`1px`, steel at 15%) — file-folder / ledger ruling.
- No drop shadows on DOM; depth comes from the 3D scene.

## 3. Tone of voice

1. **Declarative, zero hype.** Short sentences. No exclamation marks, no emojis
   (the constitution forbids them — so does the brand).
2. **Every claim cited.** Stats carry sources; product claims carry repo paths.
3. **Verdict language.** CONFIRMED / FALSIFIED framing wherever a binary exists.
4. **Forensic vocabulary.** Exhibits, custody, seals, verdicts, witnesses —
   used precisely, never as costume.

Example (hero): *"Evidence, or it didn't happen."* — not "Supercharge your
incident response with AI!".

## 4. The cinematic scroll — storyboard

One continuous WebGL scene; the camera travels a spline through five staged
environments as the user scrolls (Lenis smooth scroll → GSAP ScrollTrigger
scrub → damped camera spring). Depth-of-field focus is pulled to each act's
subject; bloom, ACES tone mapping, film grain and vignette grade the image.

| Act | Scroll | DOM exhibit | 3D staging | Camera / cinematography |
| --- | --- | --- | --- | --- |
| I — The Bench | 0.00–0.14 | EXHIBIT 00 · hero | Obsidian monolith with an amber wax seal, polished floor, volumetric shafts, drifting dust | Slow dolly-in from wide; DOF focused on the seal |
| II — The Deficit | 0.14–0.30 | EXHIBIT 01 · trust gap | Monolith recedes into fog; scattered "claim" shards without citations | Lateral track; focus falls off, the world literally gets less certain |
| III — The Gate | 0.30–0.50 | EXHIBIT 02 · Cedar gate | Brushed-steel torus gate with a translucent policy field; deny-particles bounce, one approved beam passes | Push-in and *through* the gate — the one moment of speed |
| IV — The Ledger | 0.50–0.70 | EXHIBIT 03 · custody chain | A physically simulated chain (verlet) of glass-and-steel blocks, each engraved with a SHA-256 stamp, swaying under gravity and cursor forces | Low, slow side track along the chain; shallow focus racks block-to-block |
| V — The Team | 0.70–0.88 | EXHIBIT 04/05 · 33 agents, human gate | Constellation of 33 agent nodes in ringed orbits around an orchestrator core | Rising crane shot; wide focus, the whole system visible |
| VI — Run It | 0.88–1.00 | EXHIBIT 06 · install CTA | Pull back above the whole path — bench, gate, chain, constellation aligned | High wide "case closed" shot; grain settles, seal glows |

### Physics & realism

- Custody chain: verlet integration with distance constraints, gravity,
  damping, anchor sway and pointer-repulsion — real catenary droop and inertia.
- Camera: critically-damped springs (no keyframe stiffness); pointer parallax
  with inertia.
- Materials: PBR (`MeshPhysicalMaterial`) with clearcoat obsidian, brushed
  metal, glass; image-based lighting from a PMREM room environment;
  `ACESFilmicToneMapping`.
- Post: UnrealBloom (seal/hash glow), Bokeh DOF with per-act focus pulls,
  custom grain + vignette + chromatic-aberration pass.

### Motion rules

- Nothing linear: springs and `power`/`expo` eases only.
- DOM text reveals: per-word masked rises, 40–60 ms stagger, once per section.
- `prefers-reduced-motion`: Lenis and scene animation disabled, static frame,
  all content readable.

## 5. Page architecture

```
landing/
  index.html      exhibits, copy, custody footer
  styles.css      identity system, layout, reveals
  main.js         scene, physics, scroll direction (ES module)
  vendor/         three.js r160 + addons, gsap + ScrollTrigger, lenis, fonts
```

No build step. Serve statically (`python3 -m http.server` from `landing/`).

## 6. Conversion design

- **Primary CTA:** the one-line `curl | bash` install — click-to-copy,
  repeated in nav ("Run it") and in EXHIBIT 06.
- **Secondary CTA:** GitHub repo link (nav + hero + footer).
- Proof strip in the hero (11 skills · 33 subagents · 9 schemas · 50 MCP
  recipes) so the "is it real?" question dies in the first viewport.
- The trust-deficit exhibit agitates with *cited* industry numbers, then each
  subsequent exhibit resolves one anxiety: unauthorized writes → the Gate;
  unverifiable claims → the Ledger; megaprompt fragility → the Team;
  runaway autonomy → the Human gate.
