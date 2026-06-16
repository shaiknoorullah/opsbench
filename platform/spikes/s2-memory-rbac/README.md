# Spike S2 — Hierarchical Memory RBAC Proxy

Throwaway prototype for **SPEC-OPSBENCH-001** Part 1 §5 (memory namespace grammar +
scope RBAC matrix) and Part 2 §1 S2. Standalone npm project; not a workspace member.

**Question.** Does the memory-proxy design (claims→namespace compiler, scope RBAC,
recall fan-out) hold against the pinned `redis/agent-memory-server` behavior, and
does it provably prevent cross-tenant / cross-scope leakage?

See **[VERDICT.md](./VERDICT.md)** for the per-criterion answer.

## Run

```bash
npm install          # local node_modules; do NOT run at repo root
npm test             # node:test — 37 tests incl. the adversarial isolation suite
npm run canary       # MEM-002 default-namespace canary (boot/CI probe)
npm run bench        # recall fan-out P95 @ 100k corpus (CORPUS_SIZE=… to override)
```

Runtime: Node 22 + `tsx`. The proxy/enforcement code has **zero runtime deps**;
`ajv`/`ajv-formats` are dev-only, pulled in because the tests cross-check compiled
namespaces against the normative `@opsbench/schemas` `memory-scope.json` via a
relative `tsx` import (`../../../packages/schemas/src/index.ts`).

## Architecture

```
JWT claims (org/dept[]/team[]/agent/account)   <- identity registry, NEVER agent-supplied
      │
      ▼
compileCallerNamespace ──► assertCompiled (THE GATE: blank/default/malformed blocked, MEM-002)
      │
      ▼
RBAC decide()  (write own deepest · read own+ancestors · sibling/descendant denied
      │         · promote & delete/correct human-only)   ── emits audit decision
      ▼  (permit only)
MemoryRbacProxy ──► tenant-fold namespace ──► MemoryBackend.{write,search}
                         (t/<tenant>/org/…)        │
                                                    ├── InMemoryBackend       (tests/bench, runnable)
                                                    └── AgentMemoryServerBackend (UNVERIFIED-against-live)
recall = fan-out over (own + ancestors) ──► merge by recency × relevance
                         ──► annotate {scope_tier, provenance_ref, trust_label}
                         ──► per-tier timeout → partial flag
```

### Files

| File | Role |
|---|---|
| `src/claims.ts` | Trusted identity claims (the only scope source). |
| `src/namespace.ts` | Claims→namespace **compiler**, grammar regex, ancestor algebra, `assertCompiled` gate. |
| `src/rbac.ts` | Scope-RBAC **enforcer** — the §5 access matrix as a pure `decide()`. |
| `src/backend.ts` | `MemoryBackend` interface (never sees free-form namespaces). |
| `src/backend-inmemory.ts` | Runnable backend; bucket = `(tenant, exact-namespace)`. |
| `src/backend-agent-memory-server.ts` | Thin REST adapter for pinned v0.15.2, **UNVERIFIED-against-live**. |
| `src/fanout.ts` | Multi-tier recall, recency×relevance merge, per-tier timeout → partial. |
| `src/proxy.ts` | The proxy: compile → enforce → (permit) → backend. Tenant-fold isolation. |
| `src/canary.ts` | MEM-002 default-namespace unreachability probe (boot/CI). |
| `test/*.test.ts` | namespace, rbac, **isolation.adversarial**, fanout, adapter suites. |
| `bench/fanout.bench.ts` | Criterion-3 P95 benchmark. |

## Key design decisions

- **Trust boundary.** Scope is derived ONLY from claims. A request body may carry a
  `targetNamespace`, but it is treated as untrusted: it must resolve to the caller's
  own scope (or an explicit grant) or it is denied. A present-but-blank target is
  rejected (not coerced to own scope).
- **Tenant isolation is structural.** The proxy folds `tenant_id` into the namespace
  it hands the backend (`t/<tenant>/org/…`), so two tenants with identical logical
  namespaces occupy disjoint buckets even against a tenant-naive backend.
- **Exact-match recall.** Backends match namespaces by exact equality, never prefix.
  Descendant scopes live in different buckets and cannot leak into a parent's recall.
- **Default-namespace defense in depth.** `default`, `default-user`, blank, and `*`
  are forbidden segments at compile time AND at the `assertCompiled` boundary.
