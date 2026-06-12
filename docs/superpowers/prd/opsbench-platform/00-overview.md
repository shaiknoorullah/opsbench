---
id: PRD-OPSBENCH-001
title: "Opsbench Platform"
version: 0.1.0
status: draft
part: 0
part_title: "Overview"
author: "Shaik Noorullah <shaiknooru247@gmail.com>"
created: 2026-06-13
last_updated: 2026-06-13
research_base: "docs/superpowers/research/2026-06-12-opsbench-*.md (5-doc research suite, 14 dimensions, 73-agent deep-research workflow) plus the 4-part practitioner reference (2026-06-12-devops-agent-skills-tools.md and siblings)"
---

# Opsbench Platform — PRD Part 0: Overview

## 1. Document Dependencies

| Document | Path | Relationship |
|---|---|---|
| PRD Part 1: Requirements | `docs/superpowers/prd/opsbench-platform/01-requirements.md` | Normative requirements consuming this overview |
| Master research synthesis | `docs/superpowers/research/2026-06-12-opsbench-master-synthesis.md` | Product thesis, five pillars, strategic bets |
| Feature catalog | `docs/superpowers/research/2026-06-12-opsbench-feature-catalog.md` | 122-feature persona-grounded catalog; requirements cite features as `F-NNN` |
| Architecture research | `docs/superpowers/research/2026-06-12-opsbench-architecture-research.md` | Evidence base for governance, memory, safety requirements |
| Integrations catalog | `docs/superpowers/research/2026-06-12-opsbench-integrations-catalog.md` | Vendor-by-vendor integration surfaces and tiers |
| Market landscape | `docs/superpowers/research/2026-06-12-opsbench-market-landscape.md` | Competitive positioning and whitespace |
| Practitioner references (4 docs) | `docs/superpowers/research/2026-06-12-{devops-agent-skills-tools, security-networking-agent-skills-tools, agentic-patterns-workflows, goldmine-repositories}.md` | Existing agent/MCP ecosystem the platform builds on |

## 2. How to Read This Document

**Audience.** Product, engineering, and design leads scoping the platform; AI coding agents implementing from the requirements in Part 1.

**Structure.** Part 0 (this document) defines the problem, goals, principles, personas, and use cases. Part 1 defines functional and non-functional requirements.

**ID scheme.**

```
GOV-NNN    governance, policy, and actuation control
TEAM-NNN   agent teams and orchestration
INV-NNN    investigation and incident response
MEM-NNN    memory, knowledge, and context
INT-NNN    integrations and connectivity
ESC-NNN    human escalation and communications
SUR-NNN    product surfaces (web, TUI, desktop, mobile, ChatOps)
IDN-NNN    identity, audit, and enterprise readiness
EVAL-NNN   evaluation and autonomy evidence
RPT-NNN    reporting, cost, and management
NF-NNN     non-functional requirements
G-N        goals · NG-N non-goals · SM-N success metrics
DP-N       design principles · P-XXX personas · UC-NNN use cases
```

**Priorities.** P0 = foundation (system does not function without it). P1 = core value (functional but incomplete without it). P2 = enhancement. P3 = future/architectural alignment only.

**RFC 2119.** MUST/SHALL = mandatory. SHOULD = recommended, deviation requires justification. MAY = optional.

**Traceability.** Requirements cite their research basis as feature IDs (`F-NNN`) from the feature catalog and/or named research documents. Claims flagged **(unverified)** in the research carry that flag into requirements; they inform priorities but acceptance criteria never depend on them.

## 3. Executive Summary

The Opsbench Platform is the **governance and orchestration plane for AI operations agents**: a disciplined team of investigation and remediation agents, plus the control plane that makes any agent — ours or a third party's — auditable, evaluable, and safe to grant write access to production systems.

Teams of agents investigate incidents, propose changes, and execute approved actions across enterprise cloud and on-prem estates. Every tool and skill is scoped to an agent through deterministic, default-deny policies evaluated outside the model's reasoning loop. Every action — including denials — lands on a signed, tamper-evident audit spine. Autonomy is earned per scenario through replay evaluations, certified, and revocable. Agents consult a past-incidents ledger, verified fact context, stack topology, live health context, and customer/CRM context before acting, and escalate to humans — ping, page, or an actual phone call to the on-call engineer — whenever confidence or policy requires. Memory is hierarchical (agent → team → department → workspace → organization) and governed.

The platform serves five personas — SRE/on-call, DevOps/platform engineering, IT operations, support/customer operations, and engineering management — through a web system of record, a keyboard-first TUI, ChatOps (Slack/Teams), mobile critical alerts, voice, and an optional desktop tray companion, all rendering one canonical event stream and one cross-surface approval object.

**Key metrics at maturity:**

| Metric | Target |
|---|---|
| Audit completeness (actions reconstructable from signed ledger) | 100% |
| Mutations executed without a recorded external policy decision | 0 |
| Approval ack propagation across all surfaces | ≤ 5 s |
| First evidence-cited investigation report after page | ≤ 2 min (P50) |
| Long-lived credentials held by agents | 0 |
| Cross-tenant memory/data leakage findings | 0 |
| Autonomy grants backed by queryable eval evidence | 100% |

## 4. Problem Statement

### 4.1 The problem

Enterprises are adopting AI operations agents faster than they can trust or control them. DORA 2025 measured 90% AI adoption against 24% trust; Catchpoint recorded the first rise in SRE toil in five years, partly from babysitting "mostly right" AI **(unverified figures; directionally consistent across sources)**. Meanwhile open benchmarks show state-of-the-art agents resolving only ~11% of realistic SRE scenarios while every vendor accuracy claim is self-reported. The result: agents are either locked to read-only (capability wasted) or granted write access on faith (risk unbounded). No shipping product makes agent write-access *provably safe*: deterministic external authorization, evidence-grade audit, earned autonomy, and guaranteed human reachability. And as enterprises accumulate multiple vendor agents (Datadog Bits, Resolve, Cleric, internal builds), nobody governs the fleet.

### 4.2 Who experiences it

| Stakeholder | Pain | Severity |
|---|---|---|
| SRE / on-call engineers | Paged at 3am, then forced to manually verify everything an agent claims; toil shifts from doing to checking | High |
| DevOps / platform engineers | Cannot grant agents cluster/cloud write access without unbounded blast radius; hand-rolled guardrails per team | High |
| IT operations | Agent actions bypass change management; no CAB-compatible evidence; audit findings | High |
| Support / customer operations | Cannot tell which customers an incident hurts, or which tickets are an undetected incident | Medium-High |
| Engineering management / executives | Cannot answer "what did agents do, what did it cost, was it safe, can I prove it to an auditor" | High |
| Security & compliance teams (buyers, not daily users) | Non-human identities outnumber humans; no lifecycle policy, no evidence-grade logs | High |

### 4.3 Current alternatives and limitations

| Alternative | Limitation |
|---|---|
| Read-only AI SRE products (Cleric, Traversal, Rootly AI) | Diagnose but never act; remediation toil remains human |
| Autonomous agents (Resolve.ai class) | Act with limited reasoning transparency; no independent gatekeeper; trust by faith |
| Observability-bundled agents (Datadog Bits AI) | Locked to vendor-resident data and vendor models; governs only itself |
| Incident-platform AI (incident.io, PagerDuty agents) | Workflow-scoped; no cross-vendor policy, identity, or audit plane |
| DIY: MCP servers + hand-rolled hooks/policies | No signed audit, no tenancy, no eval harness, no approval correctness (payload pinning, idempotency); every team rebuilds it |
| Agent observability tools (LangSmith, Langfuse) | Watch agents; cannot gate, approve, or revoke them |

### 4.4 Out of scope

- Building or hosting foundation models; the platform routes to customer-selected models (BYO-model is a constraint, see §5.4).
- Replacing observability storage (metrics/logs/traces stores), ITSM systems, CRM systems, or paging providers; the platform integrates with them.
- General-purpose agent development IDE or framework; the platform governs and orchestrates agents, including externally built ones.
- Physical-world operations (OT/ICS control systems).
- Fully autonomous remediation without an approval path in the initial release (graduated autonomy may reach bounded autonomy only via earned certificates).

## 5. Goals, Non-Goals, Success Metrics

### 5.1 Goals

| ID | Goal |
|---|---|
| G-1 | Make agent write access to production provably safe: every mutation passes a deterministic, default-deny authorization point outside the model, with forced dry-run and risk-tiered human approval |
| G-2 | Produce evidence, not claims: a signed, tamper-evident ledger of every agent action and decision, exportable as auditor-ready compliance evidence |
| G-3 | Earn autonomy instead of asserting it: replay-based evaluation on the customer's own incidents gates every autonomy promotion; certificates are queryable and revocable |
| G-4 | Give agents the context to be right: past-incidents ledger with decision-and-outcome records, trust-labeled fact/runbook/memory layers, declared-vs-observed topology, live health, and customer/CRM impact context |
| G-5 | Guarantee human reachability: a cross-channel escalation ladder (chat, push, SMS, voice call with keypad/spoken ack) owned by the platform as single source of truth |
| G-6 | Govern the heterogeneous fleet: third-party agents register as managed participants under the same policy, identity, audit, and cost planes |
| G-7 | Serve each persona on its winning surface from one canonical event stream and one cross-surface approval object |
| G-8 | Be enterprise-deployable: SSO/SCIM, multi-tenant RBAC, hierarchical governed memory, self-hosted and (later) air-gapped tiers, data residency, BYO-model |

### 5.2 Non-goals

| ID | Non-goal |
|---|---|
| NG-1 | Competing with observability vendors on telemetry storage or query languages |
| NG-2 | Shipping our own foundation model or requiring a specific model vendor |
| NG-3 | Replacing ITSM/CRM/paging systems of record |
| NG-4 | Unsupervised autonomous remediation as a launch capability |
| NG-5 | A marketplace open to unvetted third-party skills/tools (curation is mandatory; openness is not a goal) |
| NG-6 | Air-gapped deployment in the initial release (architecturally protected, delivered later) |
| NG-7 | Consumer or small-team self-serve product motion |

### 5.3 Success metrics

| ID | Metric | Target | Measured by |
|---|---|---|---|
| SM-1 | Mutations bypassing the authorization point | 0, structurally | Audit-ledger reconciliation against connector write logs |
| SM-2 | Actions reconstructable from the signed ledger | 100% | Independent verification tooling on ledger inclusion proofs |
| SM-3 | Approval ack propagation across surfaces | ≤ 5 s end-to-end | Surface instrumentation |
| SM-4 | First cited investigation report after page | ≤ 2 min P50, ≤ 5 min P95 | Event-stream timestamps |
| SM-5 | Long-lived credentials held by agents | 0 | Credential-broker inventory |
| SM-6 | Cross-tenant isolation findings (memory, data, audit) | 0 | Scheduled isolation test suite |
| SM-7 | Autonomy grants with queryable eval evidence | 100% | Certificate registry |
| SM-8 | Time from tenant provisioning to first governed read-only investigation | ≤ 1 business day | Onboarding telemetry |
| SM-9 | Surprise-invoice incidents (spend beyond configured caps without opt-in) | 0 | Billing reconciliation |

## 6. Design Principles

| ID | Principle | Description | Violation test (design-review heuristic, asked at design time) |
|---|---|---|---|
| DP-1 | Authorization outside the model | Every mutation is authorized by a deterministic policy point the agent cannot modify or bypass; the model's own judgment is never the enforcement mechanism | If a design lets an agent reach a write API with credentials it holds directly, or lets prompt content alter policy outcomes, it violates this principle |
| DP-2 | Read-only by structural default | New agents, connectors, and tools start without write capability; writes are enabled per scope through staged, evidenced promotion | If a connector ships with write enabled by default, or write enablement is a config flag without staged evidence, it violates this principle |
| DP-3 | Evidence or it didn't happen | Every action, decision, denial, and approval is recorded on a tamper-evident spine with enough fields to reconstruct who/what/why independently | If any user-visible platform behavior cannot be reconstructed from the ledger alone, it violates this principle |
| DP-4 | Autonomy is earned, never assumed | Autonomy levels are granted per agent/scenario/environment from eval evidence, decay under risk signals, and are revocable in minutes | If a design grants standing autonomy without an evidence artifact, or revocation requires redeployment, it violates this principle |
| DP-5 | One stream, many renderers | All surfaces render the same canonical event stream and the same approval object; no surface-private state about agent activity | If a surface shows approval or activity state that another surface cannot render from the shared stream, it violates this principle |
| DP-6 | Stack-neutral, exit-friendly | Integrations are capability-schema'd across vendors; learnings egress in open formats to customer-owned systems | If a feature only works with one vendor's backend where peers exist, or stores knowledge only in proprietary form, it violates this principle |
| DP-7 | Honest metrics | The platform reports validation toil, abstention correctness, and measured accuracy on the customer's own incidents; never self-reported benchmark claims | If a dashboard or sales artifact states accuracy without linking eval evidence, it violates this principle |
| DP-8 | A human is always reachable | Every uncertain, blocked, budget-exhausted, or high-risk state has a defined escalation path ending at a named human | If any agent state can persist indefinitely without a human being notified, it violates this principle |
| DP-9 | Tenant isolation everywhere | Tenant identity is present in every authorization decision, query, cache key, memory namespace, and audit record from day one | If any code path resolves data without a tenant scope, it violates this principle |
| DP-10 | Govern, don't compete | Third-party agents are participants to manage, not rivals to displace; the platform's value concentrates in the control plane | If a design privileges first-party agents with controls unavailable to registered third-party agents, it violates this principle |

### 5.4 Constraints (technology constraints accepted from research; not requirements text)

- **Memory engine:** Redis agent-memory-server (Apache-2.0) is the accepted engine; the platform builds the hierarchy/RBAC layer above it. Hierarchy on OSS Redis is convention (namespaces + ACL patterns + query-time filters), not enforcement — the platform's proxy layer is therefore mandatory, and engine versions are pinned (documented default-namespace and forgetting-default hazards).
- **Integration posture:** MCP-first against official vendor servers where they exist, with REST/webhook fallback; gateway layer embeds rather than rebuilds existing open-source MCP gateways where license fits.
- **Model layer:** BYO-model/BYO-key via customer cloud tenancy is a procurement-gating constraint; no feature may depend on a single model vendor.
- **Voice/recording legality:** voice escalation must support consent capture and metadata-only (no audio) recording modes (all-party-consent jurisdictions; GDPR lawful-basis documentation).

## 7. Personas and Use Cases

### 7.1 Personas

#### P-SRE — SRE / On-Call Engineer

- **Role.** Responds to pages, runs investigations, validates agent findings, approves or executes remediations, owns incident timelines.
- **Typical title.** Site Reliability Engineer, Production Engineer, On-Call Engineer.
- **Skills.** Technical. CAN read code, query observability backends, operate kubectl/terraform, work keyboard-first in terminals. CANNOT be assumed to know this platform's internals, the LLM stack, or policy languages.
- **Anti-persona (NOT this role).** NOT a platform administrator (does not configure tenancy, SSO, or policies); NOT a data scientist evaluating models.
- **Frequency.** Continuous during on-call rotations; daily otherwise.
- **What the product gives them.** Auto-started cited investigations, hypothesis trees, similar-incident recall, single-key approvals in TUI/ChatOps, escalation that finds them (push → SMS → voice), red-button access.

#### P-PLT — DevOps / Platform Engineer

- **Role.** Owns CI/CD, IaC, clusters, and golden paths; onboards connectors and agents; defines guardrails with the administrator; consumes plan-approve-apply flows.
- **Typical title.** Platform Engineer, DevOps Engineer, Infrastructure Engineer.
- **Skills.** Technical. CAN write IaC, operate Kubernetes/cloud APIs, review policies-as-code, integrate webhooks. CANNOT be assumed to know CRM/ITSM domain semantics.
- **Anti-persona (NOT this role).** NOT a security/compliance officer (consumes audit, does not define compliance scope); NOT the on-call incident responder by default.
- **Frequency.** Daily.
- **What the product gives them.** Read-only-first connector onboarding, IaC plan/approve/apply queues, agent-team composition with review gates, eval harness, drift reconciliation, budget caps.

#### P-ITO — IT Operations

- **Role.** Runs change management, asset/CMDB hygiene, ticket queues, patching, SaaS/identity housekeeping; routes agent changes through ITSM process.
- **Typical title.** IT Operations Manager, ITSM Process Owner, Service Desk Lead.
- **Skills.** Engineer-adjacent. CAN operate ServiceNow/Jira/MDM consoles, read structured tables and diffs, follow OAuth connect flows. CANNOT write code, policy languages, or queries; does NOT read API docs.
- **Anti-persona (NOT this role).** NOT a platform engineer; NOT the security team. Adjacent ITSM admins who customize ServiceNow workflows are a separate function.
- **External dependency (NOT a product persona).** Customer ITSM administrators configure change models/CAB rules inside ServiceNow/JSM; the platform consumes them.
- **Frequency.** Daily.
- **What the product gives them.** Chat-native approval queues, ITSM change autopilot with CAB evidence packs, asset context on every decision, patch-wave governance, license hygiene proposals.

#### P-SUP — Support / Customer Operations

- **Role.** Triage of inbound tickets, mapping incidents to affected customers, status communications, escalation to engineering, KB upkeep.
- **Typical title.** Support Engineer, Customer Operations Lead, Technical Support Manager.
- **Skills.** Non-technical-but-computer-literate. CAN operate Zendesk/Intercom/Salesforce, read impact tables and SLA clocks, approve drafted communications. CANNOT read logs/code, write queries, or assess infrastructure changes.
- **Anti-persona (NOT this role).** NOT a CSM or account executive (they are notified stakeholders, see below); NOT an SRE.
- **External dependency (NOT a product persona).** CSMs, account teams, and end customers receive notifications/communications produced via the platform but do not operate it.
- **Frequency.** Continuous during shifts.
- **What the product gives them.** "Is it us?" correlators, triage agent teams with reviewer gates, incident-to-account impact maps, SLA-aware queues, audience-tiered comms drafting, gated escalation bridges, KB gap drafts.

#### P-EXE — Engineering Management / Executive

- **Role.** Consumes fleet, cost, SLO, and compliance posture; second approver on irreversible actions; owns autonomy-promotion sign-off and vendor decisions.
- **Typical title.** Director/VP of Engineering, Head of SRE, CTO, CIO.
- **Skills.** Engineer-adjacent to technical (varies). CAN read dashboards, SLO/error-budget language, cost reports; approve from mobile. CANNOT be assumed to operate terminals or read raw traces.
- **Anti-persona (NOT this role).** NOT a finance controller (consumes exports only); NOT an auditor (external party served via evidence packs).
- **Frequency.** Weekly dashboards; sporadic approvals (including off-hours Tier-3).
- **What the product gives them.** Fleet command dashboard, ROI/cost attribution, agent SLO reports, toil/rubber-stamp analytics, compliance posture, autonomy certificates, vendor scorecards, mobile critical-alert approvals.

#### P-ADM — Tenant Administrator

- **Role.** Provisions the tenant: SSO/SCIM, role templates, policy authoring and attachment, connector credentials, memory governance, budget/capacity configuration, red-button custody.
- **Typical title.** Platform Owner, IT Security Administrator, Staff Engineer acting as tenant owner.
- **Skills.** Technical or strong engineer-adjacent. CAN follow OAuth/OIDC flows, author policies via guided/natural-language tooling, manage groups. CANNOT be assumed to write raw policy languages unaided.
- **Anti-persona (NOT this role).** NOT the customer's IdP team (external: prepares SAML/SCIM apps and credentials the administrator plugs in — NOT a product persona); NOT the daily incident responder.
- **Frequency.** Intensive at onboarding; weekly thereafter.
- **What the product gives them.** Tenant provisioning, identity baseline, policy lifecycle with verification, connector onboarding (read-only-first), autonomy/certificate administration, retention/residency controls, kill-switch custody.

### 7.2 Use Cases

#### UC-001 — Page triggers a governed investigation

- **Persona.** P-SRE.
- **Preconditions.** Tenant provisioned (UC-008 has run for at least one observability connector and the paging connector); investigation agents at autonomy ≥ L1 for the affected service scope.
- **Trigger.** A page/alert arrives via the alert ingestion fabric.
- **Flow.**
  1. The platform normalizes and deduplicates the alert and opens an investigation record on the event stream.
  2. The investigation team (orchestrator + executors + read-only reviewer) consults the past-incidents ledger, fact context, topology, and live health context.
  3. Executors query observability backends through read-only scoped connectors; every tool call passes the policy gateway and lands on the audit spine.
  4. The reviewer agent validates evidence quality; insufficient evidence triggers abstention with logged reasons instead of a low-confidence report.
  5. The platform posts a ranked, evidence-cited hypothesis report to the incident channel and all surfaces within the latency target (SM-4).
  6. P-SRE explores the hypothesis tree, marks branches wrong (redirecting investigation), or accepts a hypothesis.
- **Success criteria.** Cited report delivered within target; every tool call attributable in the ledger; human feedback recorded against hypotheses.
- **Failure criteria.** Observability backend unreachable → report states the gap explicitly and continues with remaining sources; rate limit exhausted → cached context serves and the report flags staleness; no hypothesis above confidence floor → explicit abstention posted with escalation to P-SRE (never silence); policy gateway unavailable → reads fail per fail-mode policy and P-SRE is paged with a platform-degraded notice.

#### UC-002 — Risk-tiered approval of an agent-proposed remediation

- **Persona.** P-SRE (Tier-2); P-EXE as second approver (Tier-3).
- **Preconditions.** UC-001 produced an accepted hypothesis; remediation tooling registered with a dry-run mode; agent at autonomy L2 for this scenario.
- **Trigger.** An agent proposes a mutation (e.g., scale-out, config rollback).
- **Flow.**
  1. The agent submits the proposed action to the actuation gatekeeper; the gatekeeper forces a dry-run and computes risk tier.
  2. An approval object is created: hash-pinned payload, pre-minted idempotency key, TTL, human-readable diff, dry-run output, named reviewer set.
  3. The object renders on the approver's surfaces (ChatOps button, TUI single-key, mobile); first response wins and propagates everywhere within SM-3.
  4. On approval, the gatekeeper re-validates the payload hash and freeze/conflict state, then executes with a just-in-time credential distinct from any read credential.
  5. Execution result, post-conditions, and rollback handle land on the event stream and ledger.
- **Success criteria.** Executed payload byte-identical to approved payload; full chain (proposal → dry-run → approval → execution → outcome) reconstructable from the ledger.
- **Failure criteria.** Payload changed after approval → execution refused, new approval required; TTL expiry → action re-proposed, never auto-executed; dry-run divergence at apply time → blocked and re-routed to approver; approver unresponsive → escalation ladder runs (UC-007); gatekeeper or policy engine unavailable → mutation denied (fail-closed) and surfaced.

#### UC-003 — IaC plan-approve-apply

- **Persona.** P-PLT.
- **Preconditions.** IaC connector onboarded (UC-008); plan/apply tooling registered with dry-run (plan) contract.
- **Trigger.** An agent (or P-PLT via agent) proposes an infrastructure change.
- **Flow.**
  1. The platform renders the plan diff with blast-radius summary and cost delta as an approval object.
  2. Non-destructive changes route as Tier-2 single approval; destroy operations require two-person approval (second approver P-PLT peer or P-EXE).
  3. On approval, apply executes through the gatekeeper; state and outcome recorded; drift reconciliation observes the result.
- **Success criteria.** No apply without an approved plan; destroy operations show two distinct named approvers in the ledger.
- **Failure criteria.** Plan-to-apply drift detected → apply blocked, re-plan forced; apply fails midway → failure state, partial-resource inventory, and rollback proposal posted to P-PLT; freeze window active → action queued with override path requiring two-person emergency approval.

#### UC-004 — Agent change routed through ITSM change management

- **Persona.** P-ITO.
- **Preconditions.** ITSM connector with bidirectional sync (UC-008); change models mapped by the customer's ITSM administrators (external dependency).
- **Trigger.** An agent action's computed risk classification requires a change request.
- **Flow.**
  1. The platform files a native change request with a machine-generated evidence pack (impacted CIs, similar-change history, dry-run output, rollback plan, schedule conflicts).
  2. Standard pre-approved changes proceed to gated execution; Normal changes block until the ITSM state reaches Implement.
  3. P-ITO reviews in chat or the ITSM console; decisions sync back; execution and closure update the change record.
- **Success criteria.** No platform mutation in ITSM-governed scopes without a linked change record in the correct state; CAB sees the evidence pack attached.
- **Failure criteria.** ITSM API down → changes queue, never bypass; sync conflict → provenance-marked merge with P-ITO notified; change rejected → action cancelled and proposer informed with reason.

#### UC-005 — Support triage with reviewer gate

- **Persona.** P-SUP.
- **Preconditions.** Ticketing and CRM connectors synced (UC-008); triage team configured.
- **Trigger.** Inbound ticket(s) arrive.
- **Flow.**
  1. Worker agents classify intent, dedup against open tickets/incidents, pull account context (tier, ARR, health, SLA clock), and search the ledger for similar cases.
  2. A reviewer agent must approve category, priority, routing, and any first-reply draft before any write lands in the ticketing system.
  3. Ticket clusters matching no known incident are flagged to P-SUP as a candidate undetected incident ("Is it us?"), optionally triggering UC-001.
- **Success criteria.** Zero unreviewed writes to customer-facing systems; SLA-at-risk tickets ranked above severity-only ordering.
- **Failure criteria.** Reviewer rejects → worker output discarded or revised, never silently written; CRM context unavailable → triage proceeds with explicit context-missing flag; bulk replies during an outage → Tier-2 approval enforced per message batch.

#### UC-006 — Incident-to-customer impact and stakeholder engagement

- **Persona.** P-SUP (primary), P-EXE (thresholds/notifications).
- **Preconditions.** UC-001 active incident; CRM/CS sync populated (cached, rate-budgeted).
- **Trigger.** Incident severity or affected-service set is established.
- **Flow.**
  1. The platform joins degraded services against entitlement/subscription data to render affected accounts with ARR, tier, health score, SLA breach risk, and owning CSM.
  2. Configured rules auto-engage the CSM with an account context card; ARR thresholds notify leadership; open renewals are flagged.
  3. P-SUP drafts audience-tiered communications (status page, premium-tier emails, exec summary) from one source of truth; every external message is approval-gated.
  4. Post-incident, impact records write back to CS platforms as queued idempotent jobs.
- **Success criteria.** Affected-account view available during the incident from cache (no live vendor fan-out); all external communications carry a named approver.
- **Failure criteria.** CRM cache stale beyond threshold → staleness displayed, not hidden; write-back rate-limited → queued with eventual delivery guaranteed and status visible; mapping ambiguous → marked "estimated impact" rather than asserted.

#### UC-007 — Escalation ladder ending in a voice call

- **Persona.** P-SRE (callee); any persona can be the ladder target per policy.
- **Preconditions.** Paging connector configured; on-call schedule resolvable; voice provider configured with consent-compliant recording mode.
- **Trigger.** An approval or incident notification exceeds its acknowledgment timeout.
- **Flow.**
  1. The ladder advances: chat → mobile push (critical alert) → SMS → voice call, with per-rung timeouts owned by the platform.
  2. The voice call delivers an incident/approval summary via TTS, offers keypad acknowledgment ("press 1") with a per-incident PIN where policy requires, and supports spoken Q&A where enabled.
  3. Any acknowledgment on any channel cancels all pending rungs everywhere within SM-3; the ack (channel, identity evidence, timestamp) lands on the ledger.
  4. If the final rung is exhausted, the total-escalation-failure detector engages the executive rung rather than parking silently.
- **Success criteria.** Exactly-once effective acknowledgment; full ladder history reconstructable; call metadata (and PIN verification result, where used) recorded without retaining audio unless consent was captured.
- **Failure criteria.** Voice provider down → ladder skips to alternate channels and flags the gap; wrong callee (schedule stale) → re-resolution and retry with discrepancy logged; no human reached → standing incident raised to tenant-configured fallback contacts (never silent termination, per DP-8).

#### UC-008 — Connector onboarding, read-only first

- **Persona.** P-ADM (primary), P-PLT (technical assist).
- **Preconditions.** Tenant exists with SSO; external system credentials prepared by the customer's system owners (external dependency).
- **Trigger.** P-ADM adds a connector (observability, ITSM, CRM, cloud, K8s, paging).
- **Flow.**
  1. P-ADM completes the vendor auth flow; the platform validates scopes and rejects over-privileged credentials with guidance.
  2. The connector activates read-only regardless of granted scopes; available toolsets are policy-filtered per agent.
  3. Write enablement is a separate staged action: scope-by-scope, requiring evidence (staging usage, eval results) and a named approver; until then write tools are absent from agent tool lists.
- **Success criteria.** New connector usable for reads immediately; zero write capability until staged promotion; every enablement recorded with approver and evidence link.
- **Failure criteria.** Credential validation fails → actionable error, nothing partially enabled; vendor scope model too coarse → platform-side restriction applied and disclosed; credential later found over-privileged → flagged for rotation, write paths suspended pending review.

#### UC-009 — Autonomy promotion through evaluation evidence

- **Persona.** P-PLT (initiates), P-EXE (signs off).
- **Preconditions.** Closed incidents accumulated in the ledger; eval harness configured; agent operating at current level ≥ 30 days or per policy.
- **Trigger.** P-PLT requests promotion of an agent from L2 (act-with-approval) toward L3 (bounded autonomy) for a specific scenario class and environment.
- **Flow.**
  1. The harness replays the relevant historical incident class against the agent (evidence-as-of investigation time), grading detection, localization, RCA, and proposed mitigation against the human-confirmed resolution.
  2. Results render as a scorecard; if thresholds pass, a certificate is drafted: agent, scenario class, environment, evidence links, expiry, revocation conditions.
  3. P-EXE reviews and signs; the policy plane begins honoring the new level; the certificate is queryable and exportable.
  4. Risk signals (error-budget burn, failed actions, eval regression) auto-downgrade the level; downgrade is logged and notified.
- **Success criteria.** No autonomy increase without a certificate; downgrade path demonstrably automatic.
- **Failure criteria.** Eval thresholds fail → promotion refused with a gap report; eval data insufficient → refusal with required-sample guidance; certificate expiry → automatic reversion to prior level, never silent continuation.

#### UC-010 — Red button: pause, quarantine, rollback

- **Persona.** P-SRE or P-ADM (any custodian per policy).
- **Preconditions.** Agents active; custodian roles configured.
- **Trigger.** A human judges agent behavior unsafe (or automated risk signals fire).
- **Flow.**
  1. The custodian invokes a graduated control from any surface: pause in-flight actions; block new actions for a scope; revoke autonomy globally; quarantine a specific agent.
  2. Enforcement happens in layers the agent cannot write to: policy plane, credential revocation (minutes-scale), execution-environment termination including child tasks.
  3. Quarantine assembles the agent's recent changes and proposes rollbacks through the standard approval queue.
  4. Every invocation and its blast radius lands on the ledger and notifies stakeholders.
- **Success criteria.** In-flight mutation halt within seconds; credential revocation within minutes; no new action under a revoked scope.
- **Failure criteria.** Partial enforcement (one layer fails) → remaining layers still bind and the gap is alarmed; rollback proposal rejected → state preserved and escalated; button misuse → fully audited and reversible by the same graduated path.

#### UC-011 — Auditor-ready evidence export

- **Persona.** P-EXE (requests), external auditor consumes (NOT a persona).
- **Preconditions.** Ledger and registry populated through normal operation.
- **Trigger.** Compliance cycle (SOC 2, ISO 42001, HIPAA audit) or customer security review.
- **Flow.**
  1. P-EXE selects a framework and period; the platform assembles the evidence pack from governance exhaust: action ledger extracts with inclusion proofs, identity registry with named owners, policy decisions, autonomy certificates, approval records, SIEM delivery attestations.
  2. The pack exports in auditor-consumable formats with an independent verification procedure for ledger integrity.
- **Success criteria.** Pack generation without engineering involvement; integrity independently verifiable without platform access.
- **Failure criteria.** Gap detected (e.g., agent without named owner) → surfaced in the posture dashboard before export, listed explicitly in the pack rather than omitted.

#### UC-012 — Governed memory: recall, provenance, correction

- **Persona.** P-SRE (consumes), P-ADM (governs), P-SUP (erasure requests).
- **Preconditions.** Memory hierarchy provisioned with tenant-safe namespace defaults; agents writing scoped memories during operations.
- **Trigger.** An agent recalls context during a task; or a human reviews/corrects memory; or an erasure obligation arrives.
- **Flow.**
  1. Recall fans out across the agent's permitted scope tiers (agent → team → department → workspace → org) and merges by recency/relevance; scope permissions are enforced at the proxy, not by agent convention.
  2. Each recalled memory carries provenance: source incident/feedback event, writing agent, scope tier, trust label.
  3. P-ADM (or scoped owners) inspect, correct, or delete memories from the governance console; corrections propagate to future recalls immediately.
  4. Erasure requests purge the target namespace with completion evidence on the ledger.
- **Success criteria.** No recall across unpermitted scopes (verified by isolation tests); every memory's provenance resolvable; erasure completion provable.
- **Failure criteria.** Memory engine unavailable → agents operate with explicit reduced-context flags, never fabricated context; namespace misconfiguration detected → writes blocked to unsafe defaults (per the documented default-namespace hazard), alarmed to P-ADM.
