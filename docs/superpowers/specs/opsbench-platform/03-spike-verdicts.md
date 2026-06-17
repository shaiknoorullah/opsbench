---
id: SPEC-OPSBENCH-001
title: "Opsbench Platform — Technical Specification"
version: 0.2.0
status: draft
part: 3
part_title: "Spike Verdicts & Resolved Decisions"
author: "Shaik Noorullah <shaiknooru247@gmail.com>"
created: 2026-06-16
last_updated: 2026-06-16
consumes: "PRD-OPSBENCH-001 v1.0.0; supersedes the open questions in 00-architecture §7"
---

# Technical Spec Part 3: Spike Verdicts & Resolved Decisions

The five design spikes (Part 2 §1) are complete. All five passed; one (S2) is PARTIAL only on an item that requires a live Redis the build environment lacked. This document records the measured verdicts, resolves the open questions from Part 0 §7, and dispositions every proposed amendment as **apply-now** (folded into the foundation already) or **apply-at-MVP** (accepted, scheduled for the MVP build). Spike code lives under `platform/spikes/s{1..5}-*` (standalone projects); each carries its own `VERDICT.md` with full evidence.

## 1. Verdict Summary

| Spike | Verdict | Tests | Headline measured result |
|---|---|---|---|
| S1 gatekeeper & policy spine | **GO** | 24/24 | Cedar per-call P99 **0.764 ms**; tool-list (200 tools) P99 **91.1 ms**; ledger append P99 **0.016 ms**; agentgateway = **EMBED** |
| S2 hierarchical memory RBAC | **PASS** (C2 PARTIAL) | 37/37 | Adversarial isolation 37/37; recall fan-out P95 **204 ms** (budget 500); forgetting documented vs pinned v0.15.2 (no live Redis) |
| S3 voice escalation | **PASS** | 14/14 | timeout→DTMF-ack→cancel-all closes; PIN never persisted; ~**$0.07–0.42** per 5-min call |
| S4 time-travel eval replay | **PASS** | 19/19 | temporal isolation proven; grading variance **0** (deterministic stub); evidence block validates |
| S5 capability schema | **PASS** | 41/41 | **92.3%** expressibility on each of Datadog/Grafana/New Relic; backend-swap byte-identical |

All numbers are reproducible via each spike's `npm test` / `npm run bench`. CPU-bound numbers (Cedar eval, ledger hashing, fan-out) are real; vendor-integration numbers are fixture/doc-validated (no live credentials in the build environment).

## 2. Resolved Open Questions (supersedes Part 0 §7)

1. **agentgateway embed vs. custom proxy → EMBED.** agentgateway is Apache-2.0 (MIT-compatible), Rust, MCP-native, and ships `ext_authz` + ExtProc + per-tool MCP authz + CEL RBAC + OTel audit — sufficient extension points to inject our `PolicyDecisionRecord` and keep decision/approval/ledger in our control plane. Custom proxy is the documented fallback (~2–3 eng-months) only if those extension points regress.
2. **Cedar policy-set scale → PASS, with a mandatory implementation constraint.** At 208 policies / 6002 entities, per-call invocation is P99 0.764 ms and a 200-tool listing is P99 91.1 ms — **but only** with a preparsed policy set (`preparsePolicySet` + `statefulIsAuthorized`) and a minimal per-call entity slice. Naive `isAuthorized` re-parses the policy set and entity store every call (~140 ms, FAIL). `isAuthorizedPartial` has **no** stateful variant (also re-parses), so tool-list filtering is implemented as N cheap per-tool stateful calls, not Cedar partial evaluation. **Decision: preparse + entity-slicing is normative for the enforcement path** (see §3 amendment A1).
3. **agent-memory-server pinned behavior → documented (v0.15.2).** Forgetting is OFF by default (`FORGETTING_ENABLED=false`, needs a task-worker); `DEFAULT_MCP_NAMESPACE`/`DEFAULT_MCP_USER_ID` silently merge tenants if a call omits them; working-memory TTL 1h has no documented env var. The proxy must make namespace required and force explicit per-tenant `user_id` (already enforced in the S2 prototype and in `memory-scope.json`). Live round-trip remains to be verified against a real engine at MVP.
4. **Voice identity assurance UX → per-incident DTMF PIN on top of phone possession.** Acceptable and buildable; PIN is never persisted (salted `digits_hash` + verification result only). A PIN-confirmed DTMF ack is strong attributable evidence, not a contractual signature (do not over-trust it for irreversible Tier-3 actions).
5. **Capability-schema coverage → 92.3% per backend, with a policy-visible escape hatch.** One `observability/1` schema expresses 12/13 sampled investigation queries on each of Datadog, Grafana(Prom/Loki), New Relic. The inexpressible remainder (PCRE-beyond-wildcard log regex on Datadog; live alert-state on Grafana/New Relic) routes through a vendor-native `passthrough` on the platform-internal translated request — never the agent-facing envelope — gated as `connector:<vendor>:passthrough`. Splitting `list_monitors` (definitions) from `get_alert_state` (live) lifts all backends to ~100%.
6. **Ledger checkpoint cadence → 1024 records.** Yields Merkle depth 10, a 320-byte inclusion proof, 7.2 ms checkpoint build (off the gatekeeper path). Proof grows `32·ceil(log2 N)` bytes. CPU hash-chaining is negligible (P99 0.016 ms/append); the NF-003 ≤25 ms budget must be restated against the **durable Postgres insert**, which the spike did not measure (no DB in environment) — ~24.9 ms headroom remains for it.

## 3. Amendment Dispositions

### Apply-now (already folded into the foundation)

- **A0 — Schemas entry type-checks without esModuleInterop (S3).** Done in `fix(platform): make @opsbench/schemas entry type-check without esModuleInterop`; `tsc --noEmit` clean under strict/`esModuleInterop:false`.
- **A-mem — namespace required, no default-namespace fallback (S2).** Already enforced in `memory-scope.json` (`namespace` non-blank, must begin `org/...`) and in the S2 proxy (blank `targetNamespace` is rejected, not coerced to caller scope).

### Apply-at-MVP (accepted; scheduled for the MVP build, not yet applied to `packages/schemas`)

- **A1 — Cedar enforcement path: preparse + entity-slicing normative (S1).** Make `preparsePolicySet` + `statefulIsAuthorized` + minimal entity slice a requirement of the policy-gateway component (NF-004), not a tuning note. Document the `isAuthorizedPartial` re-parse limitation; cache MCP `tools/list` per (agent-scope, policy-version); evaluate the native Cedar (Rust) crate for the gateway enforcement path. → architecture §3 (edited in v0.2) + gatekeeper service design.
- **A2 — Gateway resolved to EMBED agentgateway (S1).** → architecture §3 (edited in v0.2).
- **A3 — Ledger: adopt 1024/checkpoint; restate NF-003 against the DB insert (S1).** → architecture §3 (edited in v0.2) + audit-ledger service design; measure durable insert at MVP.
- **A4 — Promote `observability/1` verb-param schemas into `packages/schemas` (S5).** Add `json/observability-v1.json` (verbs: `query_metrics`, `search_logs`, `get_trace`, `list_monitors`, `write_annotation`; shared filter op set `eq|neq|regex|not_regex` — the intersection all four query languages express) and validate `CapabilityEnvelope.params` against the `$def` selected by the verb segment of `capability`. Add a normative `paramsVersion` const. The S5 prototype's `src/observability-v1.schema.json` is the draft to promote.
- **A5 — Split `list_monitors` (definitions) from `get_alert_state` (live) (S5).** Lifts expressibility to ~100%.
- **A6 — `passthrough` as a first-class connector-response field, gated as its own verb (S5).**
- **A7 — Add an `EvalRun` schema + `ledger_ref` (S4).** So `AutonomyCertificate.evidence.eval_runs` ids resolve to hash-addressable, independently verifiable records (closes the loop with IDN-001). Also: define `evidence.window.to` = cutoff (not incident-close), add `evidence.isolation{kind,cutoff}`, add `sample_kind: deterministic|model`, add measured per-metric values (not just thresholds).
- **A8 — Escalation schema (`escalation-ladder.json`) additions (S3):** require a *salted* `digits_hash` (an unsalted sha256 of a 4–6 digit PIN is trivially reversible); add `ack.evidence.consent_mode: metadata-only|recorded` (NF-012 audit); add optional `rungs[].failure_reason: no_answer|failed|timeout|outage` for the failure detector; keep rungs strictly sequential (NF-001 margin) and re-validate NF-001 if parallel blasts are ever introduced.
- **A9 — State the canonicalization rule explicitly (S1):** recursive key-sort canonical JSON is the basis for both `payload_hash` and the audit hash chain; state it in Part 1 so offline verification is byte-exact.
- **A10 — Budget charge windows on the AuditRecord (S5):** emit the per-window remaining + alert level on the `tool_call` AuditRecord so spend/throttling is independently verifiable (NF-003).

## 4. Net Effect on Architecture

No tech selection was reversed; the spikes **confirmed** the stack and converted three "if it works" bets into firm requirements: Cedar is viable but only with preparse+slicing (A1); agentgateway is the embed target (A2); the hash-chain ledger is effectively free on-path and the real cost is the DB insert (A3). The memory hierarchy, voice loop, eval harness, and capability schema all proved out. The MVP (Part 2 §2) proceeds unchanged in scope; the apply-at-MVP amendments are folded into the relevant component designs at build start.
