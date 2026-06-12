---
id: SPEC-OPSBENCH-001
title: "Opsbench Platform — Technical Specification"
version: 0.1.0
status: draft
part: 0
part_title: "Architecture"
author: "Shaik Noorullah <shaiknooru247@gmail.com>"
created: 2026-06-13
last_updated: 2026-06-13
consumes: "PRD-OPSBENCH-001 v1.0.0 (approved) — docs/superpowers/prd/opsbench-platform/"
---

# Technical Spec Part 0: Architecture

This spec consumes the approved PRD (PRD-OPSBENCH-001). PRD requirement IDs (`GOV-NNN`, `NF-NNN`, …) are cited as the normative source; this document decides *how*. Part 1 (`01-schemas.md`) defines the normative data schemas. Part 2 (`02-spikes-and-mvp.md`) defines the validation spikes and MVP cut.

## 1. System Context

```
                        ┌─────────────────────────────────────────────────────┐
                        │                  CUSTOMER ESTATE                    │
                        │  Observability   ITSM/CRM    Clouds/K8s   Paging/   │
                        │  (Datadog,       (ServiceNow, (AWS/GCP/    Chat     │
                        │   Grafana, …)     Jira, SFDC)  Azure, K8s) (PD,     │
                        │                                            Slack)   │
                        └───────▲──────────────▲────────────▲──────────▲──────┘
                                │ read (scoped)│ sync       │ JIT creds │ deliver
                                │              │            │ (broker)  │
┌───────────────┐   tool calls ┌┴──────────────┴────────────┴───────────┴─────┐
│ REASONING ZONE│ ───────────► │              CONTROL PLANE (trusted)         │
│  (untrusted)  │ ◄─────────── │  Policy Gateway → Gatekeeper → Cred Broker   │
│  agent teams, │  filtered    │  Audit Ledger · Event Stream · Escalation    │
│  3rd-party    │  tools,      │  Memory Proxy · Connector Hub · Eval Harness │
│  agents (A2A) │  results     │  Identity Registry · Approval Service        │
└───────────────┘              └───────▲───────────────────────▲──────────────┘
                                       │ canonical events      │ approvals/acks
                               ┌───────┴───────────────────────┴──────────────┐
                               │            SURFACES (renderers)              │
                               │  Web · TUI · ChatOps · Mobile · Voice · Tray │
                               └──────────────────────────────────────────────┘
```

**Trust boundaries (normative):**

1. **Reasoning zone is untrusted.** Model output, agent plans, and tool-call arguments are untrusted input everywhere they cross into the control plane (PRD DP-1). Nothing in this zone holds credentials (GOV-001) or writes policy/audit state.
2. **Control plane is the trusted computing base.** Policy decisions, approvals, credential minting, and ledger writes happen here. Components in this zone never execute model output as code and sanitize it as data (SUR-006 terminal-injection posture generalizes: all agent-derived strings are sanitized per surface).
3. **Execution path is brokered.** Mutations exist only as gatekeeper executions using JIT credentials (IDN-004, INT-009). There is no SDK path from the reasoning zone to customer estates.
4. **Surfaces are renderers.** They render the canonical event stream and approval objects (SUR-001, DP-5); they hold no private agent state and submit decisions, not actions.

## 2. Component Inventory

| # | Component | PRD coverage | Zone | Failure mode (NF-005) |
|---|---|---|---|---|
| C1 | **Policy Gateway** | GOV-002, GOV-009, GOV-012, INT-012 | Control | Unavailable → deny all; reads per tenant degraded-read policy |
| C2 | **Actuation Gatekeeper** | GOV-001, GOV-003, GOV-008, GOV-015, GOV-017 | Control | Unavailable → all mutations denied |
| C3 | **Approval Service** | GOV-004, GOV-005, GOV-011 | Control | Unavailable → no tiered action proceeds; ladders pause with alert |
| C4 | **Credential Broker** | INT-009, IDN-004, IDN-006, NF-007 | Control | Unavailable → no new task credentials |
| C5 | **Audit Ledger** | IDN-001, IDN-002, NF-003 | Control | Write-unavailable → gated mutations blocked |
| C6 | **Event Stream** | SUR-001, NF-008 | Control | Lag visible per consumer; never interpolated |
| C7 | **Identity Registry** | IDN-003, IDN-005, IDN-011 | Control | Unknown identity → deny (TEAM-003) |
| C8 | **Memory Proxy + Engine** | MEM-001..MEM-005, MEM-012 | Control | Engine down → reduced-context flag (UC-012); unsafe config → writes blocked |
| C9 | **Knowledge & Context Store** (incident ledger, fact layers, topology) | MEM-006..MEM-008, NF-010 | Control | Local store serves; staleness labeled |
| C10 | **Connector Hub** | INT-001..INT-008, INT-010..INT-016 | Control | Per-connector degradation with gap reporting |
| C11 | **Escalation Service** | ESC-001..ESC-005, SUR-007 | Control | Channel outage → next rung; exhausted → failure detector |
| C12 | **Agent Runtime** (teams, task ledger) | TEAM-001..TEAM-005, INV-*, RPT-002 | Reasoning | Budget breakers stop tasks with state preserved |
| C13 | **Eval Harness** | EVAL-001..EVAL-003, GOV-007 | Control | No data → refuse scoring; never block ops |
| C14 | **Cost & Reporting** | RPT-001..RPT-009, NF-009 | Control | Cap enforcement independent of billing pipeline |
| C15 | **Surfaces** (web, TUI, ChatOps, Teams, mobile, tray, voice) | SUR-002..SUR-008 | Surface | Stale banner; approvals disabled while stale |
| C16 | **Redaction Service** | MEM-009 | Control (inline) | Scrubber failure blocks the model call |

## 3. Technology Selections

Selections honor PRD §5.4 constraints. Each carries rationale and the spike (Part 2) that de-risks it where applicable.

| Decision | Selection | Rationale | Risk / spike |
|---|---|---|---|
| Monorepo & primary language | TypeScript (Node ≥ 22) workspaces inside opsbench under `platform/` | Repo is already an npm monorepo; one toolchain for services + web; team velocity | Hot paths re-evaluated post-MVP; perf budget NF-004 enforced by benchmark CI |
| Policy engine | **Cedar** (in-process WASM bindings) behind a `PolicyEngine` interface; Rego/CEL pluggable later | Default-deny, deterministic, formal analysis, partial evaluation for tool-list filtering (GOV-002); AWS AgentCore precedent | S1 spike validates latency (NF-004) and partial-eval tool filtering |
| Tool-call gateway | Embed **agentgateway-class OSS** if license/roadmap fit; else thin custom MCP-aware proxy | Research: "do not rebuild the gateway layer"; we own the control plane above it | S1 spike includes license + extension-point evaluation; fallback path costed |
| Agent runtime | **Claude Agent SDK** for first-party teams; **MCP** for tools; **A2A** for third-party agent registration | Orchestrator-executor-reviewer support, hooks for TEAM-004 gates; MCP-first posture (PRD §5.4); DP-10 interop | A2A maturity watched; third-party governance works at gateway level regardless |
| System of record | **PostgreSQL** (approvals, certificates, registry, task ledger, incident ledger, policy metadata) | Transactional integrity for approval state machines and certificates | — |
| Event stream | **Redis Streams** (tenant-scoped streams, consumer groups) | Redis already mandated for memory; ordered, replayable, NF-008 floor is comfortably in range | Re-evaluate NATS/Kafka past 10× floor |
| Audit ledger | Append-only Postgres table with per-tenant **sha256 hash chain**; periodic **Merkle checkpoint roots** exported to customer object storage; offline verification CLI | IDN-001 independent verifiability without standing infra; Rekor-style pattern without operating Trillian | Checkpoint cadence vs. proof size tuned in S1 (ledger writes are on the gatekeeper path) |
| Memory engine | **redis/agent-memory-server, pinned version**, fronted by our **memory-rbac-proxy** | PRD §5.4 constraint; proxy is mandatory (engine lacks org-hierarchy RBAC; default-namespace hazard MEM-002) | S2 spike validates proxy enforcement + forgetting/compaction behavior on the pinned version |
| Agent identity | SPIFFE-style URIs (`spiffe://<tenant>/agent/<id>`), short-lived workload credentials; **platform as OIDC issuer** federated to AWS STS / GCP WIF / Azure Entra | IDN-003, INT-009; attribution tags via session tags / attribute mappings (IDN-006) | Broker is custom; cloud federation per provider tested in S1-adjacent integration tests |
| Web app | Next.js + SSE consumers of the event stream | Standard; SSE matches append-only stream rendering | — |
| TUI | **Rust + Ratatui**, single static binary | Research: Codex CLI's TS→Rust rewrite precedent; jump-host/air-gap distribution (SUR-006) | Separate toolchain accepted; schemas shared via JSON Schema codegen |
| ChatOps | Slack Block Kit (launch), Teams Adaptive Cards (P1) via a `Channel` interface | SUR-004/005; 3s ack via pre-ack + async update queue | — |
| Voice | Twilio (ConversationRelay + `<Gather>` DTMF) behind the same `Channel` interface | ESC-002 research; vendor-pluggable; consent modes per NF-012 | S3 spike closes the full call→ack→ladder loop |
| Telemetry | OpenTelemetry (GenAI semantic conventions), OTLP in/out, pluggable trace storage | INT-013; differentiate above the trace layer | — |
| Model access | LiteLLM-style routing layer to customer-designated endpoints; per-tier model allowlists | IDN-012, BYO-model constraint | — |
| Schemas | **JSON Schema 2020-12** as source of truth in `platform/packages/schemas`; TS types + Rust types generated | One schema set across web/TUI/services (DP-5) | — |

## 4. Monorepo Layout

```
platform/
  apps/
    web/                  # Next.js system of record (SUR-002, SUR-003)
    api/                  # Public platform API (REST + SSE), authn/z edge
    tui/                  # Rust/Ratatui fleet monitor (SUR-006) — own toolchain, schema-codegen consumer
  services/
    policy-gateway/       # C1 — Cedar PDP, tool-list filtering, decision records
    gatekeeper/           # C2 — dry-run, freeze/conflict checks, execution, rollback handles
    approvals/            # C3 — approval objects, tiers, TTL, cross-surface propagation
    credential-broker/    # C4 — OIDC issuer, cloud federation, JIT minting, inventory
    audit-ledger/         # C5 — hash chain, checkpoints, SIEM streaming, verification API
    identity-registry/    # C7 — NHI registry, delegation graph (ReBAC store), posture scans
    memory-proxy/         # C8 — claims→namespace compiler, scope RBAC, recall fan-out
    context-store/        # C9 — incident ledger, fact layers, topology reconciliation
    connector-hub/        # C10 — capability schema router, per-vendor adapters, sync workers, rate budgets
    escalation/           # C11 — ladder state machine, channel adapters (chat/push/SMS/voice)
    agent-runtime/        # C12 — team orchestration, task ledger, budget breakers
    eval-harness/         # C13 — time-travel replay, grading, certificate evidence
    reporting/            # C14 — cost attribution, SLOs, toil analytics
  packages/
    schemas/              # JSON Schemas (Part 1) + generated TS/Rust types
    sdk/                  # internal TS SDK: event stream client, approval client, ledger writer
    policies/             # Cedar policy templates, freeze-calendar compiler, analysis tooling
    channel-kit/          # shared Channel interface (Slack/Teams/Twilio/APNs/FCM adapters)
  spikes/
    s1-gatekeeper/ … s5-capability-schema/   # Part 2; throwaway by default, promoted only via review
```

Existing opsbench `packages/*` (plugin/skill content) are unaffected. CI adds a `platform` workspace lane; the Rust TUI builds in its own job.

## 5. Key Data Flows

### 5.1 Governed mutation (UC-002; GOV-001..GOV-004, IDN-004, NF-005)

```
Agent (reasoning zone)
  │ 1. propose(action, justification)
  ▼
Policy Gateway ──2. decide(principal, action, resource, ctx) → PERMIT(tier=2) ──► Decision Record → Ledger
  ▼
Gatekeeper ──3. force dry-run (tool contract) ──► dry-run output
  │ 4. create ApprovalObject {payload_hash, idempotency_key, ttl, diff, dry_run_ref}
  ▼
Approval Service ──5. render on approver surfaces (event stream) ──► first decision wins
  │ 6. on APPROVED: re-validate payload hash + freeze/conflict state
  ▼
Credential Broker ──7. mint JIT write credential (intersection scope, attribution tags)
  ▼
Gatekeeper ──8. execute → result + rollback handle ──► Ledger (chained) ──► Event Stream → all surfaces
```

Order is normative: **ledger write precedes effect acknowledgment** (NF-003); steps 2, 6, 7, 8 each fail closed.

### 5.2 Investigation (UC-001; INV-001..003, NF-002, NF-010)

Alert → ingestion fabric (dedup) → investigation record on stream → agent team (orchestrator + executors + read-only reviewer) reads from: context-store (ledger/facts/topology, local), connector-hub (live telemetry, read-scoped) → reviewer gate (TEAM-004) → cited report event → surfaces. Vendor outages degrade to cache + explicit gap statements; abstention is an event, never silence (INV-004, DP-8).

### 5.3 Red button (UC-010; GOV-008)

One command fans out to three independent enforcement layers, each sufficient alone: (a) policy plane inserts scope-deny (C1), (b) broker revokes credentials ≤ 5 min (C4, NF-007), (c) runtime terminates task trees (C12). Layer results are individually ledgered; any layer failure alarms while the others bind.

## 6. Multi-Tenancy

Tenant ID is structural in: every service API (typed, non-optional), Postgres row-level security policies, Redis key/stream prefixes, memory namespaces (MEM-002), Cedar entity store partitions, cache keys, and ledger chains (per-tenant chains; per-tenant checkpoint roots). A missing tenant context is a thrown error, never a default (IDN-008, NF-006). The adversarial isolation suite (NF-006) is a release gate in CI from the first MVP release.

## 7. Open Questions Carried to Spikes

1. agentgateway embed vs. custom proxy (license, extension points) — **S1**.
2. Cedar policy-set scale: P99 ≤ 100 ms at reference size with partial evaluation — **S1**.
3. agent-memory-server pinned-version behavior: forgetting defaults, compaction workers, namespace fallback — **S2**.
4. Voice identity assurance UX: PIN friction vs. assurance tiers — **S3**.
5. Capability-schema coverage: can one schema express Datadog/Grafana/Prometheus metric queries without lowest-common-denominator loss — **S5**.
6. Ledger checkpoint cadence vs. gatekeeper write latency — **S1** (measured alongside policy latency).
