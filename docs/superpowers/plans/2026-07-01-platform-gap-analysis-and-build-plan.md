---
id: PLAN-OPSBENCH-GAP-001
title: "Opsbench Platform — Gap Analysis & Build Plan to MVP"
status: draft
author: "Generated with Claude Code (Shaik Noorullah, driver)"
created: 2026-07-01
consumes: "PRD-OPSBENCH-001 v1.0.0 (approved); SPEC-OPSBENCH-001 v0.2.1 (draft); spike verdicts (03-spike-verdicts.md)"
---

# Opsbench Platform — Gap Analysis & Build Plan to MVP

## 1. Purpose & method

This document maps the **approved platform plan** against **what is actually built today**, then lays out a dependency-ordered, effort-estimated path to the MVP exit criteria. It is a driving artifact, not a new design — every "designed" claim cites `SPEC-OPSBENCH-001` / `PRD-OPSBENCH-001`, and every "built" claim cites real files in `platform/`.

Sources verified for this analysis:

- PRD §6 (118 functional requirements; 51 P0) + the architecture component inventory (C1–C16) and component→requirement mapping.
- The MVP cut and delivery sequencing (`02-spikes-and-mvp.md`).
- The five spike verdicts and their apply-at-MVP amendments (`03-spike-verdicts.md`).
- Direct inspection of `platform/services/`, `platform/packages/schemas/`, and the component design docs.

Effort uses T-shirt sizes (S ≈ ≤1 wk, M ≈ 1–2 wk, L ≈ 2–4 wk, XL ≈ 4+ wk) for one focused engineer; they are planning estimates, not commitments.

## 2. TL;DR — where the platform stands

The platform is **early**: the *governed-action spine* is partially real, everything else is design or throwaway-spike.

- **1 of 16 components implemented** (C5 Audit Ledger, Go, tested).
- **2 partial libraries** (C2 Gatekeeper, C3 Approvals) — real logic + tests, but **in-memory stores, no network surface, key dependencies stubbed**.
- **4 validated as throwaway spikes** (C8/C10/C11/C13 via S2/S5/S3/S4, in TypeScript) — **not promoted** to `services/`.
- **9 design-only** (C1, C4, C6, C7, C9, C12, C14, C15, C16).
- **Requirement coverage:** of 118 reqs / 51 P0, roughly **8 P0 are partially implemented** (the C2/C3/C5 spine slice); **0 are fully shippable** end-to-end because the spine has no front door (C1), no credentials (C4), no identity (C7), and no event stream/surface (C6/C15).
- **The MVP demo cannot run** today: it needs C1→C2→C3→C4→C5 wired as services plus C11 (phone-ack) and C6/C15 (a surface).

The good news: the five load-bearing bets are **de-risked** (all spikes passed), the data contracts exist (`@opsbench/schemas`), and the hardest on-path component (C5) is done. The work ahead is mostly *promotion + service-ification + wiring*, not research.

## 3. Component status matrix (C1–C16)

State legend: **SHIPPED** (Go service, tested) · **LIB** (Go package, no service surface) · **SPIKE** (validated in TS, not promoted) · **DESIGN** (spec only).

| # | Component | State | Evidence | PRD coverage | In MVP? | Gap to MVP |
|---|---|---|---|---|---|---|
| C1 | Policy Gateway | **DESIGN** | — | GOV-002, GOV-009, GOV-012, INT-012 | ✅ | Build: Cedar PDP w/ preparse + entity-slicing (A1), tool-list filtering, decision records → C5, freeze-as-policy (GOV-009) |
| C2 | Actuation Gatekeeper | **LIB** | `services/gatekeeper/` (4 impl, 2 test, 872 loc) | GOV-001/003/008/015/017 | ✅ | Add HTTP/RPC surface; replace `FreezeChecker` placeholder (→C1) + `CredentialBroker` stub (→C4); tool registry + dry-run; populate `ApprovalRef` |
| C3 | Approval Service | **LIB** | `services/approvals/` (5 impl, 1 test, 993 loc) | GOV-004/005/011 | ✅ | Durable Postgres store; wire post-approval states (executing/executed/failed); cross-surface propagation (→C6); HTTP surface |
| C4 | Credential Broker | **DESIGN** | — | INT-009, IDN-004/006, NF-007 | ✅ | Build: OIDC issuer, cloud federation (STS/WIF/Entra), JIT minting, inventory, ≤NF-007 lifetimes |
| C5 | Audit Ledger | **SHIPPED** | `services/audit-ledger/` (11 impl, 3 test, 1382 loc): hash chain, Merkle checkpoints, verify CLI, mem+pg stores | IDN-001/002, NF-003 | ✅ | Measure durable Postgres insert vs NF-003 ≤25 ms (A3); confirm 1024-cadence in code; optional service surface |
| C6 | Event Stream | **DESIGN** | — | SUR-001, NF-008 | ✅ | Build: Redis Streams, tenant-scoped, consumer groups; the spine emits to it |
| C7 | Identity Registry | **DESIGN** | — | IDN-003/005/011 | ✅ | Build: NHI registry, SPIFFE IDs, delegation graph; unknown-identity-deny (TEAM-003) |
| C8 | Memory Proxy | **SPIKE** | `spikes/s2-memory-rbac/` (37/37) | MEM-001..005, MEM-012 | partial | Promote to Go; org/team write scopes only for MVP; live-Redis round-trip (S2's open item) |
| C9 | Knowledge/Context Store | **DESIGN** | — | MEM-006..008, NF-010 | ✅ | Build: incident ledger (MEM-006), fact layers, topology; fast local read path (NF-010) |
| C10 | Connector Hub | **SPIKE** | `spikes/s5-capability-schema/` (41/41) | INT-001..016 | ✅ (launch tier) | Promote `observability/1` (A4/A5/A6); 2 obs backends + 1 ITSM + 1 CRM; read-only profiles (INT-002) |
| C11 | Escalation Service | **SPIKE** | `spikes/s3-voice-escalation/` (14/14) | ESC-001..005 | ✅ | Promote to Go: ladder state machine, Slack + voice (flag) channels; schema additions (A8) |
| C12 | Agent Runtime | **DESIGN** (toolkit analog exists) | `packages/team-incident-response` is the closest live analog | TEAM-001..005, INV-*, RPT-002 | ✅ | Build/adapt: Claude Agent SDK teams, task ledger, budget breakers; investigation loop (INV-001/002/003) |
| C13 | Eval Harness | **SPIKE** | `spikes/s4-eval-replay/` (19/19) | EVAL-001..003 | ❌ (Phase 2) | Deferred; `EvalRun` schema (A7) lands now to unblock certificates later |
| C14 | Cost & Reporting | **DESIGN** | — | RPT-001..009, NF-009 | ✅ (floor) | Build cost floor: attribution ledger (RPT-001), budget breakers (RPT-002), basic SLOs (RPT-003) |
| C15 | Surfaces | **DESIGN** | — | SUR-002..008 | ✅ (floor) | Build: Go html/template + HTMX + SSE console (SUR-002/003 floor), Slack (SUR-004); TUI/Teams/mobile/tray deferred |
| C16 | Redaction Service | **DESIGN** | — | MEM-009 | ✅ | Build: inline pre-model scrubber; fail-closed on scrubber error |

`platform/apps/` (console/web/tui) and `platform/packages/{sdk,policies,channel-kit}` referenced in the spec layout **do not exist yet**.

## 4. Requirement coverage (118 total, 51 P0)

| Family | Count | P0 | MVP-relevant status |
|---|---|---|---|
| GOV (governance/actuation) | 19 | 8 | Spine P0s (001/002/003/004/006/008/012) partially via C2/C3; **002 blocked on C1**; 015/017 need C10/C2 |
| IDN (identity/audit) | 12 | ~7 | 001/002 ✅ (C5); 003/004/007/008 need C4/C7; 009 (self-host) is an MVP exit gate |
| INT (integrations) | 16 | 8 | All need C10/C4; 009 (cred broker) + 011 (ingest) are spine-adjacent P0s; none built |
| INV (investigation) | 17 | 8 | Need C12/C9/C16; toolkit covers the *pattern* but not the platform component |
| MEM (memory/knowledge) | 12 | 2 | 002 (cross-tenant guardrail) + 006 (incident ledger) are MVP P0s; C8 spike-only, C9 design |
| ESC (escalation) | 5 | 1 | 001 (ladder) MVP P0; C11 spike-only — **promote** |
| SUR (surfaces) | 8 | 1 | 001 (event stream) MVP P0 via C6; 002/003/004 floor; rest deferred |
| TEAM (orchestration) | 5 | 0 | Mostly P1; 001/003/004 inform C12 |
| RPT (cost/reporting) | 9 | 1 | 001/002/003 cost floor in MVP |
| EVAL | 3 | 0 | Deferred to Phase 2 (S4 validated) |
| NF (non-functional) | 12 | — | NF-001..008 are MVP exit gates; NF-003 partially proven (C5), NF-004 proven (S1), NF-006 isolation suite is a release gate |

**Honest coverage:** the only requirements with shippable code are IDN-001/002 + NF-003 (C5) and the *logic* of GOV-001/003/004 (C2/C3 libs). Everything else is design or spike.

## 5. Spikes & pending amendments

All five spikes **passed** (S2 partial only on a live-Redis item). Only **S1 was promoted** to the Go spine (C5; C2/C3 are the productized continuation). The other four remain throwaway TypeScript under `platform/spikes/`.

**Apply-at-MVP amendments not yet folded into code** (`03-spike-verdicts.md` §3): A1 (Cedar preparse+slicing normative → C1), A3 (NF-003 vs durable insert → C5 benchmark), A4/A5/A6 (`observability/1` schema → `@opsbench/schemas` + C10), A7 (`EvalRun` schema), A8 (escalation schema additions), A9 (state canonicalization rule in Part 1), A10 (budget windows on AuditRecord). A0 and A-mem are already applied.

These are small but **gating**: A1 defines C1's enforcement path; A4–A6 define C10's contract; A7/A8 define C11/C13 contracts. They should land as schema/spec edits at the start of each owning slice.

## 6. Cross-cutting / foundation gaps (cheap, do early)

- **NF-006 adversarial isolation suite** is a release gate "from the first MVP release" — it must exist in CI before slices land, not after.
- **Multi-tenancy plumbing** (tenant-id structural everywhere: APIs, Postgres RLS, Redis prefixes, Cedar partitions) is a foundation other slices assume.
- **`platform/packages/sdk`** (event-stream client, approval client, ledger writer) is shared by every service and the surfaces — build with C6.
- **Schema codegen** (JSON Schema → Go + TS types) is referenced as the neutral contract but the TS types are currently hand-authored (drift risk flagged in the original exploration). Add codegen + a drift test.
- **Identity propagation** (the toolkit's open `$OPSBENCH_AGENT_NAME` thread) is the same problem C7/C12 must solve for the platform — solve it once, coherently.

## 7. Critical path to MVP

Dependency-ordered per the spec's own sequencing (`spine → identity/creds → audit → stream/surfaces → connectors → investigation → escalation → impact/ITSM/IaC → cost → hardening`), annotated with current state and remaining work.

| Phase | Slice | Components | Current state | Remaining work | Size |
|---|---|---|---|---|---|
| 0 | Foundation | tenancy, isolation suite, SDK skeleton, schema codegen, amendments A1/A4/A7/A8/A9 | none | establish before slices | M |
| 1 | **Spine** | C1, C2, C3 | C2/C3 LIB; C1 none | C1 from scratch; service-ify + durable-store + wire C2/C3 | **L** |
| 2 | Identity & credentials | C4, C7 | DESIGN | build both (SPIFFE issuer, JIT broker, NHI registry) | **L** |
| 3 | Audit | C5 | SHIPPED | NF-003 durable-insert benchmark; optional service surface | S |
| 4 | Stream & surfaces | C6, C15 | DESIGN | Redis Streams + SDK; HTMX/SSE console floor + Slack | **L** |
| 5 | Connectors (launch tier) | C10, C16 | C10 SPIKE; C16 none | promote `observability/1`; 2 obs + 1 ITSM + 1 CRM; read-only profiles; inline redaction | **L** |
| 6 | Investigation loop | C12, C9 | DESIGN (toolkit analog) | incident ledger (MEM-006) + investigation team (INV-001/002/003) | **XL** |
| 7 | Escalation | C11 | SPIKE | promote ladder + Slack + flag-gated voice | M |
| 8 | Impact / ITSM / IaC | C2+C10 extensions | DESIGN | INV-013 impact (cache), GOV-015 (1 ITSM), INT-003 (1 IaC) | **L** |
| 9 | Cost floor | C14 | DESIGN | RPT-001/002/003 | M |
| 10 | Hardening | all | — | NF budgets in CI, isolation/escalation-hole suites, dual-target Helm, demo dry-runs | **L** |

This matches the spec's "weeks 4–12" MVP window — realistically **a quarter for a small team**, dominated by phases 1, 2, 4, 5, 6.

## 8. Recommended next 3 build slices (concrete)

If/when we move from planning to building, start here — each is independently valuable and verifiable:

1. **C1 Policy Gateway (Phase 1 front door).** The spine's missing piece. Cedar PDP with `preparsePolicySet` + `statefulIsAuthorized` + per-call entity slice (A1 — non-negotiable for NF-004), per-call authorization + tool-list filtering (N cheap stateful calls, cached per agent-scope × policy-version), `PolicyDecisionRecord` → C5, freeze-as-policy (GOV-009). Unblocks GOV-002 and gives C2 a real `FreezeChecker`. *Verifiable:* the S1 spike's reference policy set + the existing Cedar test harness already prove the approach.
2. **Service-ify C2 + C3 (Phase 1 spine).** HTTP/RPC over `Gatekeeper.Execute`; durable Postgres approvals store; wire `executing/executed/failed` + populate `ApprovalRef`; swap the `CredentialBroker` stub for an interface (C4 lands behind it). *Verifiable:* the existing `approval_integration_test.go` already asserts the C2→C3→C5 chain; extend it across the network boundary.
3. **C4 Credential Broker + C7 Identity Registry (Phase 2).** SPIFFE agent identities + JIT write-credential minting (intersection scope, attribution tags). This also resolves the **toolkit's agent-identity gap** (same problem) — solve identity once for both halves.

## 9. Risks & open decisions

- **Scope honesty.** The README/Teams table still implies a multi-team toolkit and a near platform; this plan should anchor external messaging to reality (1/16 components shipped).
- **C12 is the long pole.** The agent-runtime/investigation loop is XL and overlaps the existing toolkit. **Open decision:** build C12 fresh on the Claude Agent SDK, or evolve `team-incident-response` into it? They share DNA but differ in host (platform service vs Claude Code plugin).
- **Toolkit ↔ platform relationship.** The F-series (F1–F6) is largely subsumed by the platform; `opsbench-gateway` (F2 "fork toolhive") is superseded by C1+embedded agentgateway. **Open decision:** formally retire/redirect F1–F6 or keep the toolkit as a separate product line.
- **Durable-store latency (NF-003).** The ≤25 ms budget is restated against the Postgres insert but **never measured** (no DB in the spike env) — measure first thing in Phase 3.
- **Drift hazards** (from the earlier exploration, still open): team `package.json` at `version 3.0.0`; hand-authored TS schema types; CodeQL scans only JS (Go control plane has no SAST). Cheap to fix alongside Phase 0.

## 10. Appendix — evidence index

- Built: `platform/services/audit-ledger/` (C5), `platform/services/gatekeeper/` (C2), `platform/services/approvals/` (C3), `platform/packages/schemas/` (contracts).
- Spikes (validated, not promoted): `platform/spikes/s2-memory-rbac` (C8), `s3-voice-escalation` (C11), `s4-eval-replay` (C13), `s5-capability-schema` (C10); `s1-gatekeeper` (promoted → C5).
- Plan sources: `docs/superpowers/prd/opsbench-platform/`, `docs/superpowers/specs/opsbench-platform/{00-architecture,01-schemas,02-spikes-and-mvp,03-spike-verdicts}.md`, `components/{C2,C3,C5}-*.md`.
