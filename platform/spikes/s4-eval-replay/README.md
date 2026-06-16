# S4 — Time-Travel Eval Replay (design spike)

**Question.** Can a closed incident be replayed with *temporal isolation* and
graded meaningfully against the human resolution, producing evidence suitable
for an `AutonomyCertificate`?

This is a standalone, runnable TypeScript prototype. It does **not** require an
LLM API key — it ships a deterministic stub investigator so the harness is fully
reproducible. Real-LLM accuracy/variance is explicitly out of scope (see below).

## Run it

```bash
cd platform/spikes/s4-eval-replay
npm install
npm test     # 19 tests incl. temporal-isolation + 3-rerun stability
npm run demo # prints grades, variance, the emitted evidence block, validation
```

## What it builds

| Piece | File | Role |
|---|---|---|
| Closed-incident fixture | `src/fixture.ts` | Ledger-shaped incident + evidence store spanning **before and after** the window cutoff. Post-cutoff items are deliberate "hindsight leaks". |
| Temporal evidence provider | `src/evidence-provider.ts` | **The core mechanism.** Exposes evidence only as-of `cutoff` (`ts <= cutoff`). Filters post-cutoff items out of `list`/`query`, and on direct `getById` **blocks + logs a denial + throws** `PostCutoffAccessError`. |
| Investigator interface + stub | `src/investigator.ts` | Pluggable `InvestigatorAgent`. Ships `DeterministicInvestigator` (rule-based, no clock, no randomness). A real LLM plugs in here and is subject to the *same* gate. |
| Grader | `src/grader.ts` | Per-dimension scores (detection / localization / RCA / mitigation) + weighted aggregate, scored against the human-confirmed resolution. Pure + deterministic. |
| Harness + emitter | `src/harness.ts` | Runs one/many replays, computes variance, emits the `AutonomyCertificate.evidence` block, and wraps it in a full certificate. |
| Schema bridge | `src/schema.ts` | Compiles the **committed** `autonomy-certificate.json` / `common.json` from `packages/schemas` with this spike's local ajv and validates. |

## The temporal-isolation mechanism (criterion 1)

The agent receives *only* a `TemporalEvidenceProvider`. There is no other path
to evidence. The provider enforces `Date.parse(item.ts) <= Date.parse(cutoff)`:

- `list()` / `query()` — post-cutoff items are never returned; each is logged as
  a `deny` even though it was never surfaced.
- `getById(postCutoffId)` — logs a `deny` and **throws** `PostCutoffAccessError`.
  Even a hostile agent that guesses a hidden id cannot read it.

`test/temporal-isolation.test.ts` seeds a fresh post-cutoff item
(`ev_seeded_leak`, ts `12:00` vs cutoff `10:45`) that names the root cause and
fix, then asserts it is invisible across every surface, that the block is logged,
and that the replayed agent's `consulted_evidence_ids` contain **zero**
post-cutoff ids — while still solving the incident from pre-cutoff evidence alone.

## Reproducibility & where a real model plugs in

The stub derives conclusions from visible evidence via fixed, ordered rules.
Same gated evidence → identical `Investigation` → identical grades → **zero
variance** across reruns. Eval-run ids come from a *seeded* id factory
(`src/ids.ts`), so the emitted evidence block is byte-stable too.

To plug in a real agent, implement `InvestigatorAgent.investigate(ctx)` and call
your model, handing it `ctx.evidence` (e.g. as a tool). The temporal gate still
holds because the model can only read through the provider. **Real-model accuracy
and run-to-run variance are a separate question and are out of scope for this
spike** — the spike proves the *mechanism* (isolation + grading + evidence
emission), not model quality.

## Notes on schema consumption

The spike consumes the real JSON Schemas from `packages/schemas/json/*` and the
`AutonomyCertificate` TypeScript type from `packages/schemas/src/types.ts`
(type-only, erased at runtime). It does **not** import the package's `index.ts`
at runtime, because that module resolves `ajv` relative to its own location
(no `node_modules` there in a standalone checkout). Loading the JSON + compiling
with the spike's own ajv keeps the prototype self-contained while still
validating against the normative contract.
