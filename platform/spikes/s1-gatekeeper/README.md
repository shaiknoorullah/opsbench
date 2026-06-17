# S1 — Gatekeeper & Policy Spine (design spike)

Standalone, runnable prototype that de-risks the governed-mutation path of the
Opsbench platform (spec `00-architecture.md` §5.1, spike `02-spikes-and-mvp.md`
§1 S1). It proves the mechanism end to end:

```
MCP tool call
  -> Cedar decision  (phase a: tool-list filtering · phase b: per-call invocation)
  -> forced dry-run
  -> ApprovalObject  {payload_hash, idempotency_key, ttl, diff, dry_run_ref}
  -> hash-revalidated execution against a MOCK target (no real Kubernetes)
  -> chained AuditRecords (sha256 hash chain) + one Merkle checkpoint
  -> offline verification (chain continuity + checkpoint root)
```

It consumes the **real** schemas from `platform/packages/schemas` (the source of
truth) via a relative import; it does not copy or redefine them. Every artifact
the gatekeeper emits is validated against those schemas at runtime.

The real Cedar engine is used via `@cedar-policy/cedar-wasm` (official AWS Cedar
WASM binding, Apache-2.0). The `nodejs` build is synchronous, so no async init.

## This is a standalone npm project

It is **not** a workspace member. Install and run with this directory as cwd so
`node_modules` lands locally:

```bash
cd platform/spikes/s1-gatekeeper
npm install
```

## Commands

| command | what it does |
|---|---|
| `npm run flow` | runs the §5.1 vertical slice end to end and prints every stage (happy path, tamper block, policy deny, schema validation, ledger verify, tamper detection) |
| `npm run bench` | prints the Cedar + ledger latency numbers (the EC1/EC2 evidence) |
| `npm test` | runs the test suite: payload-hash invalidation, ledger verification, Cedar both phases, schema conformance |

## Layout

```
src/
  canonical.ts       deterministic canonical-JSON + sha256 helpers (RFC 8785-style key sort)
  ids.ts             Crockford-base32 ULID generation matching the schema id patterns
  cedar-engine.ts    PolicyEngine wrapper over cedar-wasm; preparsed pset + entity slicing
  reference-set.ts   programmatic >=200-policy / >=5000-entity reference set
  ledger.ts          append-only sha256 hash chain + Merkle checkpoint + inclusion proof
  verify.ts          offline verifier (chain continuity + checkpoint root re-derivation)
  gatekeeper.ts      the §5.1 orchestration + in-process MockExecutor
  demo-flow.ts       `npm run flow`
  bench.ts           `npm run bench`
test/
  payload-hash-invalidation.test.ts   EC4 (GOV-004 invariant)
  ledger-verification.test.ts         EC2 mechanism (tamper-evidence + Merkle proof)
  cedar-engine.test.ts                EC1 mechanism (both phases, default-deny, determinism)
  schema-conformance.test.ts          every emitted artifact validates against @opsbench/schemas
```

See `VERDICT.md` for the per-exit-criterion result, measured numbers, and the
agentgateway embed-vs-build recommendation.

## Key performance finding (one-liner)

`cedar.isAuthorized()` re-parses the policy set **and** the entity store on every
call (~140 ms P99 at reference scale — over budget). The production hot path must
(1) preparse the policy set once (`preparsePolicySet` + `statefulIsAuthorized`)
and (2) pass only the request-relevant **entity slice**. With both, per-call P99
is sub-1 ms. The bench prints the worst-case anti-patterns alongside the fast
path so the difference is explicit.
