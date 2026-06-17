# S2 — Hierarchical Memory RBAC Proxy — VERDICT

**Spike:** SPEC-OPSBENCH-001 Part 2 §1 S2 · **Consumes:** Part 1 §5 (namespace grammar + scope RBAC matrix), `@opsbench/schemas` `memory-scope.json`.
**Date:** 2026-06-16 · **Environment:** Node v22.12.0, `tsx`, in-memory backend. No live Redis / agent-memory-server available.

**Overall: the proxy design HOLDS.** Claims→namespace compilation, the scope-RBAC matrix, and the recall fan-out are sound and provably prevent cross-tenant and cross-scope leakage **at the proxy layer**, which is exactly where the spec places enforcement ("enforced in memory-proxy, never engine-side"). All three exit criteria are met against the runnable in-memory backend. Live-engine integration is the documented residual risk.

| # | Exit criterion | Verdict |
|---|---|---|
| 1 | Adversarial isolation (NF-006 class): sibling/descendant denial, cross-tenant recall empty, default-namespace fallback unreachable | **PASS** |
| 2 | Forgetting/compaction of pinned agent-memory-server documented; divergences listed; forgetting off by default | **PARTIAL** (documented from official docs; not exercised against a live engine — no Redis here) |
| 3 | Recall fan-out P95 ≤ 500 ms across 4 tiers at 100k corpus; partial-degradation path verified | **PASS** |

---

## Criterion 1 — Adversarial isolation — PASS

Suite: `test/isolation.adversarial.test.ts` (plus `test/rbac.test.ts`, `test/namespace.test.ts`, `test/adapter.test.ts`). **37/37 tests pass.** Canary (`npm run canary`) passes: backend received **0** writes for any blank/default namespace.

Evidence per sub-requirement:

- **Sibling-scope read denied.** `proxy.read(sreAgent, ".../team/oncall", …)` → `AccessDenied` ("sibling"). A sibling team's memory written to its own scope never surfaces in the SRE agent's recall (asserted item-by-item).
- **Descendant-scope read denied.** A team-tier human reading `.../team/sre/agent/inv1` → `AccessDenied` ("descendant"). A child agent's memory never appears in the parent's recall — the read-authority set is `own + ancestors` only, and the backend matches namespaces by **exact equality** (no prefix scan), so descendants are in disjoint buckets.
- **Cross-tenant recall returns nothing.** Two principals with **identical** logical namespace `org/acme/dept/eng/team/sre/agent/inv1` in tenants `t_a` and `t_b`: `t_b` writes a secret, `t_a` recalls the exact query → **0 items**. Tenant isolation is structural (the proxy folds `t/<tenant>/…` into the backend key).
- **Default-namespace fallback unreachable (MEM-002).** Blank, whitespace, `org/default`, `org/.../dept/default`, `org/default-user`, and `*` are all rejected — at `compileCallerNamespace` time, at the `assertCompiled` boundary, and again at the proxy before any backend call. A present-but-blank `targetNamespace` is **rejected**, not silently coerced to own scope (a bug found and fixed during the spike). The canary asserts 0 backend writes escaped.
- **Scope-widening attacks blocked.** An agent that supplies `targetNamespace: "org/acme"` (ancestor) or a sibling agent path is denied; the backend count is unchanged. The request body cannot override claims-derived scope.

RBAC matrix coverage (`decide()`), one assertion per cell:

| Operation | Rule (spec §5) | Implemented |
|---|---|---|
| write | own deepest scope only; team-shared needs explicit grant | ✅ own permit; ancestor/sibling/descendant deny; grant permit |
| read / recall | own + ancestors; sibling **and** descendant denied | ✅ |
| promote | human-only; within own authority; ledgered | ✅ NHI denied; human-in-authority permit; out-of-authority deny |
| delete / correct | scope owner **or** P-ADM; human-only; prior content retained | ✅ owner permit; NHI deny; non-owner deny; P-ADM permit |

---

## Criterion 2 — Forgetting / compaction on the pinned engine — PARTIAL

**Pinned version: `redis/agent-memory-server` v0.15.2 (released 2026-04-10).** Documented from the official docs site (fetched 2026-06-16): `memory-lifecycle/`, `configuration/`, `api/`, and the project README. **Not exercised against a live engine** — no Redis/Python service is available in this environment; hence PARTIAL. Captured in code as `AMS_PINNED` in `src/backend-agent-memory-server.ts` and asserted in `test/adapter.test.ts`.

### Documented defaults (v0.15.2)

| Setting | Default | Note |
|---|---|---|
| `FORGETTING_ENABLED` | **`false`** | **Forgetting is OFF by default** — must be explicitly enabled. |
| `FORGETTING_EVERY_MINUTES` | `60` | Frequency of forgetting checks. |
| `FORGETTING_MAX_AGE_DAYS` | `90.0` | Age threshold for deletion eligibility. |
| `FORGETTING_MAX_INACTIVE_DAYS` | `30.0` | Inactivity threshold. |
| `FORGETTING_BUDGET_KEEP_TOP_N` | `10000` | Retention budget. |
| `COMPACTION_EVERY_MINUTES` | `10` | Compaction (dedup/hash-merge) frequency. |
| Working-memory TTL | `1h` | **No documented env var name** to change it. |
| `DEFAULT_MCP_NAMESPACE` | `"default"` | **Hazard** — silent cross-tenant merge if a call omits namespace. |
| `DEFAULT_MCP_USER_ID` | `"default-user"` | **Hazard** — same. |
| `AUTH_MODE` | `"disabled"` | **Hazard** — open by default. (`DISABLE_AUTH`/`TOKEN_AUTH_ENABLED` legacy flags also present.) |
| `LONG_TERM_MEMORY` | `true` | Persistent memory on. |
| `ENABLE_DISCRETE_MEMORY_EXTRACTION` | `true` | LLM extracts structured memories from messages. |
| `INDEX_ALL_MESSAGES_IN_LONG_TERM_MEMORY` | `false` | Not every message is indexed. |
| `REDISVL_VECTOR_DIMENSIONS` | `1536` | Embedding dims. |

### Divergences from the engine's documented defaults / behavior (the list the spec asked for)

1. **Forgetting requires a separate task-worker (docket).** Setting `FORGETTING_ENABLED=true` is inert without a running `agent-memory task-worker`. The platform must run and health-check that worker, or retention/erasure attestations (MEM-005) will silently never fire. **Spike posture:** forgetting/retention is a **platform-side ledgered action**, not delegated to the engine's worker as the source of truth.
2. **`DEFAULT_MCP_NAMESPACE`/`DEFAULT_MCP_USER_ID` silent-merge hazard.** If any call omits namespace/user, the engine routes to a shared `default` namespace, merging tenants. **Diverge:** the proxy never omits these — namespace is required and `assertCompiled`; the adapter also derives an explicit per-tenant `user_id` so the default-user fallback is unreachable too.
3. **`AUTH_MODE=disabled` by default.** **Diverge:** the adapter constructor refuses to instantiate without an `authToken` unless `{insecure:true}` is passed explicitly (and logs a warning). Production config must set `AUTH_MODE=oauth2|token`.
4. **No native org/dept/team/agent/account hierarchy.** The engine scopes only by `session_id`/`user_id`/`namespace`; there is no hierarchy or namespace-level RBAC primitive. **Diverge:** the entire hierarchy + RBAC is enforced **above** the engine (this proxy); engine-side scoping for vector recall is query-time metadata (`namespace {eq}`) filters, per the research addendum.
5. **Engine-side dedup is on by default and is NOT an isolation mechanism.** The adapter passes `deduplicate:true` but never relies on it for tenant/scope isolation; isolation is the proxy's exact-namespace + tenant-fold.
6. **Compaction may mutate/merge memories every 10 min.** Provenance/`trust_label` annotations the proxy attaches are **proxy-side** and must be re-derivable; the platform must not assume engine-side records preserve them across compaction. (Unverified against live — flagged.)
7. **Working-memory 1h TTL has no documented env var.** Per-tier governed retention (MEM-005, compliance-driven TTL per department) therefore cannot be expressed through working-memory config and must be applied at the long-term layer + proxy. **Suggested spec amendment below.**

### Adapter status

`AgentMemoryServerBackend` is implemented against the documented REST contract (`POST /v1/long-term-memory/`, `POST /v1/long-term-memory/search` with `namespace:{eq}`) and unit-tested with a mock `fetch` for request-shape + isolation behavior. It is marked **UNVERIFIED-against-live** in every method doc-comment with the reason (no live server). It is drop-in ready for a live integration test.

---

## Criterion 3 — Recall fan-out P95 ≤ 500 ms — PASS

Script: `bench/fanout.bench.ts`. Through the real `MemoryRbacProxy.recall` path (compile claims → RBAC filter → 4-tier fan-out → recency×relevance merge).

**Methodology.** Seed exactly **100,000** permitted memories spread across the caller's 4 tiers (agent/team/dept/org, 25k each), **plus an equal 100,000 decoys** in sibling and cross-tenant buckets that must be ignored (total store ≈ **200,000**). Ages span 0–89 days for a real recency axis. 30 warmup + 300 measured recalls over 50 distinct queries; per-tier fetch limit 50, final limit 25; per-tier timeout 1000 ms.

**Measured (Node v22.12.0, in-memory backend):**

| metric | ms |
|---|---|
| min | 162.06 |
| p50 | 181.01 |
| **p95** | **204.70**  (budget ≤ 500) |
| p99 | 222.68 |
| max | 249.32 |

**Isolation under load: 0 leaked items** (no `DECOY`/`SECRET` item ever surfaced) across all 300 iterations. Partial recalls: 0.

**Caveats.** This is a deliberately **pessimistic** model: the in-memory backend does a full linear scan + sort of each 25k-item tier per query (no vector index). A real agent-memory-server uses RedisVL/HNSW, which the research addendum benchmarks at ~200 ms median at 90% precision under 50 concurrent top-100 queries on 1B vectors — i.e. the engine is unlikely to be the bottleneck. The fan-out fans 4 tiers concurrently (`Promise.all`), so wall-clock ≈ slowest tier, not the sum. **Engine round-trip latency is UNVERIFIED here** (no live server); the 500 ms budget has comfortable headroom (≈300 ms) for network + HNSW query time.

**Partial-degradation path verified** separately in `test/fanout.test.ts`: a tier exceeding its per-tier timeout is flagged `status:"timeout"`, the result is marked `partial:true`, and the fast tiers' results are still returned (not dropped).

---

## Suggested spec amendments (Part 1 §5)

1. **Mandate the auth posture explicitly.** §5 says enforcement is proxy-side but doesn't address that the engine ships `AUTH_MODE=disabled`. Add a provisioning invariant: "the memory engine MUST run with authentication enabled; the proxy refuses to start against an unauthenticated engine." (Implemented here as a constructor guard.)
2. **Name the default-token denylist.** Make `{default, default-user, "", *}` a normative forbidden-segment set in the namespace grammar, not just an implication of the pattern, so every implementation rejects `org/default` even though it is grammar-shaped.
3. **Retention cannot ride on working-memory TTL.** §5 MEM-005 ("retention TTLs per scope tier") should state that per-tier TTL/erasure is applied at the long-term layer + proxy with ledgered attestations, because the engine's working-memory 1h TTL is fixed/undocumented and forgetting requires an independently-health-checked task-worker.
4. **Provenance/trust labels are proxy-owned.** Note that `{scope_tier, provenance_ref, trust_label}` annotations are re-derivable proxy-side and must not be assumed preserved across engine compaction.
5. **Clarify "scope owner" for delete/correct.** The matrix row "scope owners + P-ADM" was read here as **exact-scope** ownership (an ancestor is not an owner). If ancestors should be able to delete descendant memories, §5 should say so; the spike implements the stricter exact-scope reading.

---

## Blocked / residual (UNVERIFIED) items

| Item | Reason |
|---|---|
| Live agent-memory-server REST/MCP round-trip | No Redis or Python service available in this environment. Adapter is documented-contract-only. |
| Real forgetting/compaction worker behavior | Same; documented from official docs, not observed. |
| RedisVL/HNSW recall latency at 100k–1B vectors | Same; relied on vendor benchmark in the research addendum (MEDIUM confidence). |
| Engine-side `namespace {eq}` filter actually preventing descendant leakage on a live index | Same; adapter adds a belt-and-suspenders post-filter (tested with mock) so a contract regression still cannot leak. |

**Bottom line:** the proxy's enforcement and fan-out logic are PROVEN against a runnable backend (criteria 1 and 3 PASS). The engine-specific behavior is documented against pinned v0.15.2 with a concrete divergence list (criterion 2 PARTIAL, blocked only on live integration). Recommend promoting the compiler + RBAC enforcer to `services/`; gate promotion of the adapter on a live integration test that re-runs the adversarial suite against a real engine.
