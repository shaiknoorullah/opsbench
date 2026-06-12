---
id: SPEC-OPSBENCH-001
title: "Opsbench Platform — Technical Specification"
version: 0.1.0
status: draft
part: 2
part_title: "Design Spikes & MVP Cut"
author: "Shaik Noorullah <shaiknooru247@gmail.com>"
created: 2026-06-13
last_updated: 2026-06-13
consumes: "PRD-OPSBENCH-001 v1.0.0 (approved)"
---

# Technical Spec Part 2: Design Spikes & MVP Cut

## 1. Design Spikes

Five spikes de-risk the architecture's load-bearing bets before MVP build. Each lives in `platform/spikes/<id>/`, is throwaway by default (promotion to `services/` only via review), and ends with a written verdict committed alongside the code. Spikes run in parallel; none blocks another.

### S1 — Gatekeeper & Policy Spine

**Question.** Can Cedar (in-process) + an embedded gateway + chained ledger writes meet the governed-mutation path budgets — and should we embed agentgateway-class OSS or build a thin proxy?

**Build.** A minimal vertical slice of flow §5.1 (Part 0): MCP tool call → Cedar decision (both phases: tool-list filtering via partial evaluation + per-call) → dry-run → ApprovalObject → hash-revalidated execution against a sandbox K8s namespace → chained AuditRecords with one Merkle checkpoint → offline verification CLI pass.

**Exit criteria (verdict must answer each):**
- Cedar P99 ≤ 100 ms (NF-004) at a reference policy set (≥ 200 policies, ≥ 5k entities); partial-eval tool filtering works for MCP tool listings.
- Ledger write on the mutation path adds ≤ 25 ms P99; checkpoint cadence chosen with proof-size data.
- agentgateway embed verdict: license compatible, extension points sufficient for decision-record injection — or documented fallback to custom proxy with cost estimate.
- Payload-hash invalidation demonstrably blocks a mutated payload (GOV-004 invariant).

### S2 — Hierarchical Memory RBAC Proxy

**Question.** Does the memory-proxy design (claims→namespace compiler, scope RBAC, recall fan-out) hold against the pinned agent-memory-server version's real behavior?

**Build.** memory-proxy prototype in front of pinned agent-memory-server: namespace grammar (Part 1 §5), JWT-claims enforcement, multi-tier recall fan-out with merge, adversarial isolation tests (sibling-scope denial, default-namespace canary, tenant-merge attempts).

**Exit criteria.**
- All adversarial isolation tests pass (NF-006 class); the engine's default-namespace fallback is provably unreachable.
- Forgetting/compaction behavior on the pinned version documented against its docs; divergences listed.
- Recall fan-out P95 ≤ 500 ms across 4 tiers at 100k-memory corpus; partial-degradation path verified.

### S3 — Voice Escalation Loop

**Question.** Does the full ladder→call→DTMF-ack→ladder-cancel loop close reliably, and what identity-assurance UX is acceptable?

**Build.** Escalation service prototype: ladder state machine, Slack + push rungs stubbed, real outbound call (TTS summary, DTMF ack, optional PIN), ack cancellation fan-out, ledger evidence record; consent-mode and metadata-only recording paths.

**Exit criteria.**
- Timed-out approval escalates to a real phone; DTMF ack cancels all pending rungs ≤ 5 s (NF-001) end-to-end.
- PIN flow works without PIN persistence; evidence record matches Part 1 §7.
- Unanswered/failed-call path advances the ladder; exhausted path fires fallback (ESC-003).
- Per-call cost measured against the ≤ $1 / 5-min research estimate.

### S4 — Time-Travel Eval Replay

**Question.** Can a closed incident be replayed with temporal isolation and graded meaningfully against the human resolution?

**Build.** Eval-harness prototype: ingest one real (or high-fidelity synthetic) closed incident into the incident-ledger schema; replay an investigation agent against evidence-as-of the incident window (post-incident evidence provably inaccessible); grade detection/localization/RCA/mitigation against the recorded resolution; emit an evidence record suitable for an AutonomyCertificate.

**Exit criteria.**
- Temporal isolation verified (attempted post-window reads fail and are logged).
- Grading rubric produces stable scores across 3 reruns (variance documented).
- The run's evidence record satisfies Part 1 §4's `evidence` block.

### S5 — Cross-Vendor Capability Schema

**Question.** Can `observability/1` express real investigation queries across three backends without lowest-common-denominator loss?

**Build.** Connector-hub prototype routing `query_metrics` / `search_logs` / `get_trace` to Datadog, Grafana(+Prometheus/Loki), and one more backend; the same scripted investigation runs against each; freshness/cache envelope honored.

**Exit criteria.**
- ≥ 90% of a sampled real investigation's queries expressible in the schema per backend; the inexpressible remainder catalogued with an escape-hatch design (vendor-native passthrough, policy-visible).
- Swapping backends requires zero agent-prompt changes (INT-001 acceptance).
- Vendor-quota budget accounting demonstrated on at least one backend.

## 2. MVP Cut (Quarter 1)

The MVP is the research's exit-criterion demo, productized: *an agent investigates, proposes a change, is blocked by policy, phones the on-call engineer, receives acknowledgment, executes through the gatekeeper with a dry-run — and produces a signed, independently verifiable evidence chain for the whole sequence.*

### 2.1 In scope (maps to PRD P0 set + the demo-critical P1s)

| Slice | PRD requirements | Components (Part 0 §2) |
|---|---|---|
| Governed-action spine | GOV-001, GOV-002, GOV-003, GOV-004, GOV-006, GOV-008, GOV-012 | C1, C2, C3 |
| Identity & credentials | IDN-003, IDN-004, IDN-007, IDN-008, INT-009, NF-007 | C4, C7 |
| Audit & evidence | IDN-001, IDN-002, NF-003 (+ verification CLI) | C5 |
| Investigation loop | INV-001, INV-002, INV-003, INT-011, MEM-006, MEM-002 | C12, C9, C16 (scrubbing on model-bound paths) |
| Connectors (launch tier) | INT-001 (two observability backends), INT-002 (read-only profile), INT-005/INT-006 (one ITSM), INT-007 (one CRM, cached) | C10 |
| Escalation | ESC-001 (full ladder), ESC-002 behind a feature flag (demo-critical P1) | C11 |
| Surfaces | SUR-001, SUR-002, SUR-003 (floor), SUR-004 (Slack) | C15, C6 |
| Impact context | INV-006, INV-011, INV-012, INV-013 (cache-served) | C9, C10 |
| ITSM gating | GOV-015 (one ITSM vendor) | C2, C10 |
| IaC queue | INT-003 (plan-approve-apply, one IaC tool) | C2, C3 |
| Cost floor | RPT-001, RPT-002, RPT-003, NF-009 | C14 |
| Deployment | IDN-009 self-hosted Helm path proven in CI (SaaS + self-hosted dual-target suite, NF-011) | all |

### 2.2 Explicitly out of MVP (deferred, not descoped)

Autonomous remediation above L2 (certificates ship Phase 2 with EVAL-001); third-party agent governance (GOV-013); marketplace (GOV-014); air-gapped tier; TUI (SUR-006), Teams (SUR-005), mobile (SUR-007), tray (SUR-008); memory hierarchy beyond org/team write scopes (full dept/account tiers Phase 2); knowledge egress; eval harness as product (S4 spike only); voice GA (flag-gated demo path only).

### 2.3 MVP exit criteria

1. The demo sequence above runs end-to-end on a customer-shaped sandbox with **zero manual backstage steps**, and its evidence chain passes the offline verification CLI.
2. NF-001/NF-002/NF-004/NF-005 budgets hold at the NF-008 load floor in CI perf runs.
3. The adversarial isolation suite (NF-006) and the read-only escalation-hole suite (INT-002) pass.
4. A second observability backend swap (INT-001) requires zero agent-prompt changes.
5. Self-hosted install passes the same acceptance suite as SaaS minus the documented exception list (NF-011).

## 3. Delivery Sequencing

```
Weeks 1–3   Spikes S1–S5 in parallel · schemas package (Part 1) lands as code · CI lanes (platform workspace, perf, isolation suites)
Weeks 3–4   Spike verdicts reviewed → Part 0 §3 selections confirmed or amended (spec v0.2) · service skeletons generated from schemas
Weeks 4–10  MVP slices in dependency order: spine → identity/credentials → audit → stream/surfaces → connectors → investigation → escalation → impact/ITSM/IaC → cost floor
Weeks 10–12 Hardening: NF budgets, isolation/escalation-hole suites, dual-target deploy, demo dry-runs
```

Phase 2 (trust accrual: eval harness → certificates, memory hierarchy GA, TUI/Teams/mobile, voice GA, postmortems, third-party governance) re-plans after MVP exit against the PRD P1 set.
