---
id: PRD-OPSBENCH-001
title: "Opsbench Platform"
version: 1.0.0
status: approved
part: 1
part_title: "Requirements"
author: "Shaik Noorullah <shaiknooru247@gmail.com>"
created: 2026-06-13
last_updated: 2026-06-13
research_base: "docs/superpowers/research/2026-06-12-opsbench-*.md; feature traceability via F-NNN IDs from 2026-06-12-opsbench-feature-catalog.md"
---

# Opsbench Platform — PRD Part 1: Requirements

Read Part 0 (`00-overview.md`) first for the ID scheme, priorities, personas (P-XXX), use cases (UC-NNN), design principles (DP-N), and accepted technology constraints (§5.4). "Research basis" cites feature IDs (`F-NNN`) from the feature catalog. Requirements use RFC 2119 language.

## 6. Functional Requirements

### 6.1 GOV — Governance, Policy & Actuation Control

#### GOV-001: Actuation Gatekeeper

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | GOV-002, IDN-003 |
| **Research basis** | F-030; architecture research (Google SRE gatekeeper pattern, unverified as public spec) |

**Description:** All mutations against external systems MUST route through an actuation control point that is architecturally outside every agent's write scope. The gatekeeper MUST force a dry-run where the tool contract provides one (GOV-003), verify the action's recorded justification, check freeze/conflict state, and MAY downgrade the acting agent's autonomy when risk signals are present. Agents MUST NOT hold direct credentials to mutable external systems.

**Acceptance Criteria:**

- A mutation attempted via any path that bypasses the gatekeeper fails and produces an audit event.
- Gatekeeper-executed actions record: proposal, dry-run output, policy decision, approval reference (if tiered), execution result, and rollback handle.
- When the gatekeeper is unavailable, all mutations are denied (fail-closed) and the degradation is surfaced to affected tenants.

#### GOV-002: Default-Deny Policy Decision Point

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | IDN-003 |
| **Research basis** | F-035; AWS AgentCore Cedar rationale; agentgateway-class OSS |

**Description:** Every tool invocation (read and write) MUST be evaluated by a deterministic policy engine outside the model's reasoning loop, default-deny. The platform MUST support policy evaluation at two points: filtering forbidden tools out of agent-visible tool lists, and per-call runtime authorization. Decision records MUST use one normalized schema regardless of policy engine. Policy engines SHOULD be pluggable.

**Acceptance Criteria:**

- An agent with no applicable allow policy can invoke zero tools; the denial is logged with the governing (absent) policy noted.
- A tool denied by policy does not appear in the agent's tool list AND is rejected if invoked directly.
- Policy decisions are reproducible: replaying the same principal/action/resource/context yields the same decision.
- Failure: policy engine unreachable → all evaluations deny; reads MAY follow a tenant-configured degraded-read mode that is itself a logged policy decision.

#### GOV-003: Mandatory Dry-Run Tool Contract

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | GOV-001 |
| **Research basis** | F-031 |

**Description:** Tool registration for mutating tools MUST declare a dry-run mode. Tools without a dry-run mode MUST auto-escalate to the highest approval tier. Dry-run output MUST attach to the approval object, and apply MUST be blocked if the apply-time effect diverges from the approved dry-run.

**Acceptance Criteria:**

- Registering a mutating tool without dry-run succeeds only with the highest-tier flag set automatically and visibly.
- An apply whose computed change set differs from the approved dry-run is blocked and re-routed for approval, with the divergence shown.
- Failure: dry-run itself errors → the action cannot proceed to approval; the error is shown to the proposer.

#### GOV-004: Risk-Tiered Approval Object and Queue

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | GOV-001, GOV-002, SUR-001 |
| **Research basis** | F-032; Truto HITL correctness set |

**Description:** The platform MUST implement a four-tier action classification (auto-execute reads → notify → single approval → two-person approval for irreversible actions) and an approval object carrying: hash-pinned payload, idempotency key minted before the human interrupt, TTL with re-proposal on expiry, human-readable diff, dry-run output, and named reviewer(s). Approvers MUST be able to reject with edits. Tier assignment MUST be derivable from policy, with irreversible-action classes governed by hard rules that no statistical classifier can override (see GOV-011).

**Acceptance Criteria:**

- Executed payload hash equals approved payload hash for 100% of tiered executions; mismatch blocks execution (UC-002 failure path).
- Expired approvals never execute; re-proposal creates a new object with a new idempotency key.
- Two-person tier requires two distinct authenticated humans; the same human approving twice is rejected.
- Failure: approver unresponsive past timeout → escalation ladder (ESC-001) engages; the object never silently auto-approves.

#### GOV-005: Cross-Surface Approval Propagation

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | GOV-004, SUR-001 |
| **Research basis** | F-033 |

**Description:** One approval object MUST follow the approver across all their surfaces (ChatOps, web, TUI, mobile, desktop); the first decision on any surface MUST cancel the pending prompt everywhere and record the deciding surface and identity on the audit spine.

**Acceptance Criteria:**

- A decision on one surface updates all other surfaces within the NF-001 latency budget; double-decisions are impossible (idempotency key).
- Failure: a surface unreachable at decision time reconciles on reconnect and never re-prompts for a decided object.

#### GOV-006: Graduated Autonomy Levels (L0–L4)

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | GOV-002 |
| **Research basis** | F-039 |

**Description:** The platform MUST model per-agent autonomy as discrete levels — L0 observe-only, L1 suggest, L2 act-with-approval, L3 bounded-autonomous within certified scenario classes, L4 reserved/disabled at launch — assignable per agent × scenario class × environment. Defaults MUST be L1/L2. The platform MUST auto-downgrade a level on configured risk signals and MUST require human handoff below a confidence threshold.

**Acceptance Criteria:**

- An L1 agent attempting a mutation is denied by policy with the level cited.
- A configured risk signal (e.g., failed-action streak) demonstrably downgrades L3→L2 without human action, with notification.
- Failure: ambiguous level resolution (overlapping scopes) resolves to the lowest applicable level.

#### GOV-007: Earned-Autonomy Certificates

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | GOV-006, EVAL-001 |
| **Research basis** | F-040; UC-009 |

**Description:** Every autonomy grant above L2 MUST be represented as a queryable, revocable certificate referencing eval evidence (EVAL-001), scope (agent, scenario class, environment), named approving human, expiry, and revocation conditions. Certificates MUST be exportable as compliance evidence (IDN-010).

**Acceptance Criteria:**

- No L3 grant exists without a certificate; certificate expiry reverts the level automatically (UC-009 failure path).
- Revocation takes effect at the policy plane within minutes and is itself audited.
- Failure: missing/corrupt evidence link renders the certificate invalid and reverts the grant.

#### GOV-008: Layered Kill Switch ("Red Button")

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | GOV-001, GOV-002, INT-009 |
| **Research basis** | F-038; UC-010 |

**Description:** The platform MUST provide graduated emergency controls — pause in-flight actions; block new actions per scope; revoke autonomy globally; quarantine an agent including termination of its child-task tree and assembly of rollback proposals — enforced in layers (policy plane, credential revocation, execution-environment termination) that no agent can modify. Custodianship MUST be role-configured, and every invocation MUST be audited.

**Acceptance Criteria:**

- Pause halts in-flight gated mutations within seconds; quarantine revokes the agent's credentials within minutes (UC-010).
- Enforcement holds even if one layer fails (verified by fault-injection test per layer); the failed layer is alarmed.
- Failure: rollback proposals route through the standard approval queue; rejected rollbacks preserve state and escalate.

#### GOV-009: Change Freezes and Maintenance Windows as Policy

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | GOV-002 |
| **Research basis** | F-037 |

**Description:** Freeze calendars and maintenance windows MUST be enforced as deny-override policies at the policy decision point, not as prompt conventions. During a freeze, mutation tools MUST disappear from agent tool lists for the frozen scope. Emergency override MUST require two-person approval and full audit.

**Acceptance Criteria:**

- During an active freeze, a mutation attempt is denied citing the freeze; the tool was also absent from discovery.
- Override executes only with two distinct approvers and appears in the ledger linked to the freeze record.
- Failure: calendar-source sync failure fails frozen (freeze persists until positively lifted).

#### GOV-010: Guided Policy Authoring with Pre-Deployment Verification

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | GOV-002 |
| **Research basis** | F-036 |

**Description:** The platform MUST let P-ADM author policies through guided/natural-language tooling and MUST run automated analysis before attachment, detecting conflicts, unreachable rules, and always-allow tautologies. Authored policy MUST be reviewable in its enforceable form before activation.

**Acceptance Criteria:**

- A policy that would allow all actions for all principals is blocked at attachment with the tautology identified.
- Conflicting policies are reported with the conflicting pairs named; attachment requires explicit resolution.
- Failure: analysis service unavailable → attachment is blocked (not silently skipped).

#### GOV-011: Approval Routing Classifier with Hard Deny Floor

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | GOV-004 |
| **Research basis** | F-043 |

**Description:** The platform SHOULD reduce approval fatigue with a two-stage classifier (fast block-biased filter, then deliberative review) that routes only genuinely risky actions to humans. Irreversible action classes MUST be governed by hard deny/tier rules that the classifier can never relax.

**Acceptance Criteria:**

- Classifier configuration cannot lower the tier of an action class marked irreversible (attempt is rejected and logged).
- Classifier decisions are logged with stage-level outcomes for tuning (RPT-005).
- Failure: classifier unavailable → all actions route at their full policy-derived tier (conservative fallback).

#### GOV-012: Read-Only-First Rollout Doctrine (Platform-Enforced)

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | INT-001..INT-007 (applies to all connectors), GOV-002 |
| **Research basis** | F-052; UC-008; practitioner consensus (read-only-first) |

**Description:** Connectors and agents MUST start read-only by structural default regardless of granted upstream scopes. Write enablement MUST be a separate, staged, per-scope action requiring recorded evidence and a named approver, and MUST be reversible.

**Acceptance Criteria:**

- A freshly onboarded connector exposes zero write tools to any agent even when the upstream credential permits writes (UC-008).
- Each write enablement records scope, evidence link, approver; disablement is one action.
- Failure: over-privileged credential detected post-onboarding → write paths suspend pending review.

#### GOV-013: Third-Party Agent Governance Plane

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | GOV-002, IDN-001, IDN-003, RPT-001 |
| **Research basis** | F-049; market research ("connective tissue" forecast, unverified) |

**Description:** The platform MUST allow external AI agents to register as managed participants: declared capabilities, routing rules, policy subjection at the gateway, and inclusion in the consolidated audit and cost views. Controls available to first-party agents MUST be available for registered third-party agents (DP-10).

**Acceptance Criteria:**

- A registered third-party agent's tool calls traverse the same policy decision point and appear on the same ledger as first-party agents.
- The fleet dashboard (SUR-002) shows third-party agents with status, autonomy, owner, and drill-down parity.
- Failure: unregistered agent traffic is rejected at the gateway and reported.

#### GOV-014: Curated, Vetted Skill and Tool Registry

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | GOV-002 |
| **Research basis** | F-051; trailofbits/skills-curated precedent (backdoored published skills) |

**Description:** Skills and tools available to tenant agents MUST come from a curated registry whose entries pass supply-chain review before availability. Tenants MAY add private entries through their own review workflow. Unvetted public marketplace content MUST NOT be installable directly.

**Acceptance Criteria:**

- Every registry entry carries review metadata (reviewer, date, version hash); installation of an unreviewed version is blocked.
- A registry entry version change re-requires review.
- Failure: review pipeline backlog does not bypass review; entries remain unavailable until reviewed.

#### GOV-015: ITSM Change-Request Autopilot

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | GOV-001, INT-006 |
| **Research basis** | F-054; UC-004 |

**Description:** For ITSM-governed scopes, agents MUST file native change requests as a precondition to mutation. Standard (pre-approved) changes MAY auto-proceed to gated execution; Normal changes MUST block until the ITSM record reaches its implement state. Computed risk MUST map to the customer's change model.

**Acceptance Criteria:**

- No mutation in an ITSM-governed scope without a linked change record in the correct state (UC-004).
- Change rejection in ITSM cancels the platform action with reason propagated to the proposer.
- Failure: ITSM unreachable → actions queue; emergency-change path requires two-person approval and retroactive record creation per tenant policy.

#### GOV-016: CAB Evidence Pack Builder

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | GOV-015, MEM-006, MEM-008 |
| **Research basis** | F-055 |

**Description:** The platform MUST attach machine-generated risk dossiers to change requests: impacted configuration items, historical failure rates of similar changes, scheduling conflicts, dry-run output, and rollback plan.

**Acceptance Criteria:**

- A Normal change carries the dossier at CAB review time; missing dossier sections are explicitly listed, not omitted.
- Failure: CMDB/topology data unavailable → dossier states the gap and the change defaults to a higher review tier.

#### GOV-017: Progressive Rollout Enforcement for Agent Changes

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | GOV-001, INT-002, INT-004 |
| **Research basis** | F-019 |

**Description:** In protected environments, agent-initiated workload changes MUST ship through metric-gated progressive delivery (canary/blue-green with automated analysis and auto-abort); direct unstaged applies MUST be blocked at the gateway.

**Acceptance Criteria:**

- An agent-proposed deployment to a protected environment produces a staged rollout with abort conditions; metric breach demonstrably auto-aborts and rolls back.
- Failure: analysis source unavailable mid-rollout → rollout pauses and pages the owner; it does not proceed blind.

#### GOV-018: Ephemeral Sandboxed Execution Environments

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Dependencies** | GOV-001, INT-009 |
| **Research basis** | F-053; dropkit pattern |

**Description:** The platform SHOULD execute agent tasks in disposable, network-scoped environments created per task and destroyed on completion; credentials MUST NOT persist beyond the task.

**Acceptance Criteria:**

- Post-task environment inspection finds no residual credentials or workload.
- Failure: environment teardown failure is alarmed and credentials are revoked independently of teardown.

#### GOV-019: Golden-Path Agent Blueprints

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Dependencies** | GOV-002, GOV-006, GOV-014, MEM-001 |
| **Research basis** | F-050 |

**Description:** The platform SHOULD offer versioned, org-approved agent blueprints bundling tools, policies, autonomy ceiling, memory scopes, and eval suite, instantiable self-serve within guardrails and centrally patchable.

**Acceptance Criteria:**

- Instantiating a blueprint produces an agent whose effective policy/autonomy matches the blueprint; central blueprint updates roll out to instances with notification.
- Failure: blueprint-instance drift is detected and reported, not silently retained.

### 6.2 TEAM — Agent Teams & Orchestration

#### TEAM-001: Agent Teams with Mandatory Review Gates

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | GOV-002, GOV-006 |
| **Research basis** | F-044; orchestrator-executor-reviewer pattern (practitioner corpus) |

**Description:** The platform MUST support composing agent teams (orchestrator + executors + reviewers) where executor plans require approval by a reviewer (agent or human) before execution, with rejection feedback loops. Spec-compliance review and quality review SHOULD be distinct passes. Reviewer roles MUST be read-only with respect to the work product's target systems.

**Acceptance Criteria:**

- An executor cannot transition a plan to execution without a recorded reviewer approval.
- Reviewer agents demonstrably lack write tools for target systems (policy-verified).
- Failure: reviewer unavailable → work queues or escalates to a human per team policy; it never self-approves.

#### TEAM-002: Durable Cross-Session Task Ledger

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | SUR-001 |
| **Research basis** | F-045 |

**Description:** Team work items MUST persist across sessions with dependency graphs, automatic unblocking when dependencies complete, stuck-task detection, and checkpointing sufficient to resume after interruption.

**Acceptance Criteria:**

- Killing and restarting a team resumes from the last checkpoint without re-executing completed gated actions (idempotency keys honored).
- A task stuck past its threshold is flagged to the owning human.
- Failure: corrupted checkpoint → task marked unresumable and routed to a human; never silently restarted from scratch against mutated external state.

#### TEAM-003: Per-Teammate Permission Scoping

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | GOV-002, IDN-003 |
| **Research basis** | F-046 (documented permission-inheritance hole, unverified) |

**Description:** Each team member MUST carry its own identity and policy; teammates MUST NOT inherit the orchestrator's permission mode or credentials.

**Acceptance Criteria:**

- Policy queries for orchestrator and teammate return independent decision sets; a teammate invoking a tool allowed only to the orchestrator is denied.
- Failure: identity resolution failure for a teammate denies all its calls (never falls back to the parent identity).

#### TEAM-004: Quality-Gate Hooks on Task Completion

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | TEAM-001 |
| **Research basis** | F-047; Stop-hook pattern (Trail of Bits) |

**Description:** The platform MUST support blocking hooks at task-completion boundaries so a reviewer (agent or rule) can reject completion until evidence-quality criteria pass; findings MUST NOT reach humans as "complete" without passing gates.

**Acceptance Criteria:**

- A gated task with failing quality checks remains open with the rejection reason recorded.
- Failure: hook execution error blocks completion (fail-closed) and alerts the team owner.

#### TEAM-005: Multi-Agent Failure Detection and Topology Linting

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Dependencies** | SUR-003, TEAM-001 |
| **Research basis** | F-048; MAST taxonomy (unverified) |

**Description:** The platform SHOULD detect recognized multi-agent failure modes (fragmented context, inter-agent misalignment, missing verification) over team traces and SHOULD lint team topologies, flagging parallel-write compositions and recommending serialization for write-heavy work.

**Acceptance Criteria:**

- A team composed with two executors writing to the same scope triggers a lint warning at composition time.
- Detected failure-mode incidents appear in team analytics with trace links.
- Failure: detector outage degrades to no-detection with status visible; it never blocks team operation.

### 6.3 INV — Investigation & Incident Response

#### INV-001: Auto-Started Investigation with Cited Evidence

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | INT-012, INT-001, MEM-006, TEAM-001 (team form MAY ship later; single-agent acceptable at launch) |
| **Research basis** | F-001; Anthropic SRE cookbook pattern; UC-001 |

**Description:** On alert/page receipt, the platform MUST start an investigation that gathers logs, metrics, traces, recent deploys, and ledger context, and post a ranked root-cause hypothesis report in which every claim links to its evidence. The report MUST reach the incident channel and surfaces within the NF-002 latency target.

**Acceptance Criteria:**

- Every hypothesis in the report carries at least one evidence link resolvable to a recorded tool call.
- Deduplicated alerts do not spawn duplicate investigations.
- Failure: source unreachable → the report names the missing source; no hypothesis presented as if that evidence existed (UC-001 failure paths).

#### INV-002: Hypothesis Tree with Verdicts and Human Redirection

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | INV-001, SUR-001 |
| **Research basis** | F-002, F-003 |

**Description:** Investigations MUST maintain a navigable hypothesis tree — per branch: the hypothesis, queries run, verdict (validated/invalidated/inconclusive), expandable to raw tool calls. Humans MUST be able to mark branches wrong, redirecting investigation. Confidence MUST be computed from compound evidence signals (independent source count, topological locality, recency), not raw model self-confidence.

**Acceptance Criteria:**

- Any displayed confidence value is traceable to its component signals.
- Marking a branch wrong demonstrably changes subsequent investigation behavior and is recorded.
- Failure: tree state loss → investigation continues append-only with the gap noted; never fabricated retroactively.

#### INV-003: Multi-Dimensional Similar-Incident Retrieval

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | MEM-006 |
| **Research basis** | F-007; incident.io / RCACopilot evidence (0.766 accuracy, unverified) |

**Description:** The platform MUST retrieve similar past incidents using independent per-dimension similarity (alert type, impacted services, symptoms) merged with recency weighting; retrieved incidents MUST carry their resolution actions and outcome flags.

**Acceptance Criteria:**

- Retrieval results display per-dimension match rationale; each result links to its ledger record including what was tried and whether it worked.
- Failure: empty/low-signal corpus → explicit "no similar incidents" rather than forced matches.

#### INV-004: Abstention and Healthy-System Recognition

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | INV-001, EVAL-001 |
| **Research basis** | F-006 |

**Description:** Agents MUST abstain — with logged reasons — rather than emit hypotheses below the confidence floor or investigate without sufficient context, and MUST be evaluated (EVAL-001) on correctly recognizing healthy systems.

**Acceptance Criteria:**

- Abstentions appear on the event stream with reasons and a human escalation, never as silence (DP-8).
- Eval suites include healthy-system scenarios; abstention correctness is a reported metric (RPT-003).
- Failure: forced-answer requests from users still display the confidence floor breach.

#### INV-005: Structured RCA Modes

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | INV-002 |
| **Research basis** | F-004 (causal-inference discipline), F-005 (5-Whys cheap first pass) |

**Description:** The platform SHOULD provide structured RCA modes: a cheap first-pass why-chain with a mandatory evidence column, and a rigorous causal mode testing competing explanations with confounder analysis and rubric-scored output. Hand-waved causal percentages MUST NOT be presented.

**Acceptance Criteria:**

- RCA outputs missing evidence links per step fail their rubric and are not publishable to postmortems.
- Failure: rigorous mode exceeding budget falls back to first-pass mode with the downgrade visible.

#### INV-006: Customer-Reported Incident Correlator ("Is It Us?")

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | INT-006, INT-007, INT-012 |
| **Research basis** | F-008; UC-005 |

**Description:** The platform MUST match inbound ticket clusters against active incidents, recent deploys, and firing monitors, and MUST flag ticket clusters with no matching alert as candidate undetected incidents.

**Acceptance Criteria:**

- A simulated ticket flood referencing a degraded service links to the active incident; a flood with no matching signal raises an undetected-incident candidate to P-SUP.
- Failure: correlation sources stale → candidate flags carry staleness annotations.

#### INV-007: Mega-Incident Ticket Clustering and Gated Bulk Response

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | INV-006, GOV-004 |
| **Research basis** | F-009 |

**Description:** During major incidents the platform MUST cluster related tickets under a parent, support approval-gated bulk replies with per-account personalization, and run auto-resolution sweeps after recovery. Bulk customer-facing writes MUST be at least single-approval tier.

**Acceptance Criteria:**

- No bulk reply lands without a recorded approval covering that batch.
- Failure: partial bulk-send failure reports exact per-ticket outcomes and retries idempotently.

#### INV-008: Support Triage Team with Reviewer Gate

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | TEAM-001 (pattern), INT-006, INT-007 |
| **Research basis** | F-016; UC-005 |

**Description:** Ticket triage MUST run as a supervisor-worker composition (intent, dedup, CRM context, ledger search) where a reviewer approves category, priority, routing, and first-reply drafts before any write reaches the ticketing system.

**Acceptance Criteria:**

- Zero unreviewed writes to ticketing/CRM systems from triage (ledger-verifiable).
- Failure: reviewer rejection discards or revises worker output with the rejection recorded (UC-005).

#### INV-009: Governed Runbook Execution and Runbook-as-Skill

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | GOV-001, GOV-003, GOV-015, GOV-014 |
| **Research basis** | F-017, F-018 |

**Description:** Customer runbooks MUST be encodable as versioned skills with trigger-focused descriptions, and MUST execute as plan → approve → apply with per-step dry-run output; ITSM routing applies per GOV-015.

**Acceptance Criteria:**

- A runbook step without dry-run support escalates that step's tier (GOV-003).
- Runbook skill versions are registry-reviewed (GOV-014) before agent availability.
- Failure: mid-runbook step failure halts the sequence, reports state, and proposes rollback; it never continues past a failed step.

#### INV-010: Citation-Anchored Postmortems, Multi-Audience

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | MEM-006, MEM-009 |
| **Research basis** | F-025, F-026, F-027 |

**Description:** The platform MUST draft postmortems where every claim anchors to a specific message, action, or query; secrets are scrubbed before model exposure; drafts carry visible AI-draft disclaimers and a mandatory named human owner. It MUST produce audience registers (engineering, customer-facing, leadership) from one record, and SHOULD generate ITSM problem records and follow-up tickets from accepted postmortems.

**Acceptance Criteria:**

- Published postmortems have zero unanchored claims (lint-enforced) and a named owner.
- The three registers derive from one record; divergence between registers is structural (sections), not factual.
- Failure: scrubber failure blocks drafting (fail-closed on secret exposure).

#### INV-011: Audience-Tiered Status Communications Composer

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | INV-001, GOV-004, INT-007 |
| **Research basis** | F-014; UC-006 |

**Description:** From one incident source of truth, the platform MUST draft public status updates, premium-tier proactive notifications, executive summaries, and CSM talking points; cadence reminders MUST be drivable by contractual update-frequency obligations; every external message MUST be approval-gated with a named approver.

**Acceptance Criteria:**

- No externally delivered message lacks an approval record (UC-006).
- Cadence breach (update overdue per contract clause) raises a visible reminder.
- Failure: delivery channel failure queues with retry and shows delivery state per audience.

#### INV-012: Gated Escalation-to-Engineering Bridge

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | INT-006 |
| **Research basis** | F-015 |

**Description:** One action MUST escalate a support case to engineering with a full evidence bundle (affected accounts, ARR, reproduction, related incidents, SLA deadline), creating a linked issue with bidirectional, provenance-marked status sync.

**Acceptance Criteria:**

- The created engineering issue contains the bundle and back-links the case; status changes propagate both ways without sync loops (provenance markers).
- Failure: target tracker down → escalation queues with visible state; nothing is lost.

#### INV-013: Incident-to-Account Impact Mapping and Stakeholder Engagement

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | INT-007, MEM-008 |
| **Research basis** | F-010, F-011; UC-006 |

**Description:** The platform MUST join degraded services against entitlement/asset/subscription data to render affected accounts (ARR, tier, health score, owning CSM) from cache during incidents, MUST auto-engage the assigned CSM with an account context card per configured rules, MUST notify leadership above configurable ARR thresholds, and SHOULD flag open renewal opportunities.

**Acceptance Criteria:**

- Impact view renders during a vendor-API outage from cache with staleness shown (UC-006 failure path).
- Ambiguous service-to-account mappings display as estimated, never asserted.
- Failure: notification rule misfire is reconstructable from the ledger (rule version, inputs, decision).

#### INV-014: SLA-Aware Prioritization and Breach Forecasting

| Field | Value |
|-------|-------|
| **Priority** | P1 (prioritization); P2 (forecaster) |
| **Dependencies** | INV-013, INT-007 |
| **Research basis** | F-012, F-013 |

**Description:** Incident and ticket queues MUST be rankable by machine-readable contractual breach risk (entitlement milestone clocks, SLA policy metrics) combined with ARR, not severity alone. The platform SHOULD forecast milestone breaches against estimated resolution time and surface a "breaches in the next N hours" view.

**Acceptance Criteria:**

- Two equal-severity incidents order by breach risk/ARR with the ranking factors displayed.
- Failure: SLA source data missing → affected items fall back to severity ordering with the fallback labeled.

#### INV-015: Post-Incident Customer Impact Reports and Credit Recommendations

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | INV-013, GOV-004 |
| **Research basis** | F-028 |

**Description:** The platform MUST produce per-account impact summaries (experience, duration, SLA outcome, remediation) and MAY recommend credits/refunds; financial recommendations MUST route through two-person approval.

**Acceptance Criteria:**

- A credit recommendation reaching the CRM shows two named approvers in the ledger.
- Failure: incomplete impact data renders explicit gaps; recommendations are blocked when SLA outcome is indeterminate.

#### INV-016: Chaos Validation of Proposed Fixes

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Dependencies** | GOV-017, EVAL-001 |
| **Research basis** | F-029 |

**Description:** The platform MAY generate fault-injection plans that validate proposed fixes in pre-production before merge approval, attaching results to the approval object.

**Acceptance Criteria:**

- A fix validated by chaos run shows the run's results on its approval object.
- Failure: chaos tooling unavailable → approval proceeds at a higher scrutiny tier with the absence noted.

#### INV-017: Governed Patch-Wave Orchestration

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Dependencies** | GOV-015, GOV-017, INT-006 |
| **Research basis** | F-020 |

**Description:** The platform MAY orchestrate patch waves: inventory from MDM/CMDB, change request, canary ring with health gates, human escalation on anomaly; sustained success MAY earn Standard-change pre-approval per GOV-007.

**Acceptance Criteria:**

- A wave halts on health-gate breach with the ring state preserved and the owner paged.
- Failure: inventory source conflict (MDM vs CMDB) blocks the wave until reconciled or overridden with approval.

### 6.4 MEM — Memory, Knowledge & Context

#### MEM-001: Hierarchical Memory Scopes with Access Control

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | MEM-002, IDN-008 |
| **Research basis** | F-056; Redis agent-memory-server gap analysis (constraint §5.4) |

**Description:** Agent memory MUST be organized in hierarchical scopes — agent → team → department → workspace → organization (plus account scope for support contexts) — compiled and enforced at write time, with claims-based access control enforced by the platform in front of every memory read/write (the engine's own scoping is insufficient per the research; enforcement is the platform's responsibility).

**Acceptance Criteria:**

- A write targeting a scope the caller lacks lands nowhere and is logged; isolation suite (NF-006) covers scope boundaries.
- Scope membership derives from the identity system (IDN-007/IDN-008), not agent-supplied claims.
- Failure: scope resolution failure denies the memory operation (fail-closed), with the agent operating under an explicit reduced-context flag (UC-012).

#### MEM-002: Cross-Tenant Leakage Guardrails

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | None |
| **Research basis** | F-061; documented default-namespace hazard (unverified specifics; hazard class verified) |

**Description:** Deployment defaults MUST make cross-tenant memory merging impossible: unsafe default-namespace fallbacks MUST be blocked at write time, tenant identity MUST be present in every memory operation, and configurations that would merge tenants MUST fail provisioning.

**Acceptance Criteria:**

- Provisioning with a missing/blank tenant namespace configuration fails with a hard error.
- The isolation suite includes adversarial recall attempts across tenants; any hit is a release blocker.
- Failure: detected unsafe configuration at runtime blocks writes and alarms P-ADM (UC-012).

#### MEM-003: Multi-Scope Recall with Merge

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | MEM-001 |
| **Research basis** | F-057 |

**Description:** Recall MUST fan out across the caller's permitted scope tiers and merge results by recency and relevance; hybrid lexical+semantic retrieval SHOULD be the default.

**Acceptance Criteria:**

- Recall results annotate each item with its source scope tier; permitted-scope enforcement is proxy-side.
- Failure: a tier's backend timeout degrades to partial results with the missing tier flagged.

#### MEM-004: Memory Governance Console with Provenance

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | MEM-001 |
| **Research basis** | F-059; UC-012 |

**Description:** Every learned memory MUST record which incident or feedback event taught it, which agent wrote it, and its scope tier; authorized humans MUST be able to inspect, correct, and delete memories, with corrections effective for subsequent recalls immediately.

**Acceptance Criteria:**

- Any recalled memory's provenance resolves to a ledger event (UC-012).
- A corrected memory's prior content remains in audit history; future recalls return the correction.
- Failure: provenance-less legacy memories are quarantined from recall until triaged.

#### MEM-005: Per-Scope Retention and Right-to-Erasure

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | MEM-001, IDN-001 |
| **Research basis** | F-060 |

**Description:** Retention policies MUST be configurable per scope tier (e.g., long-retention change memories in regulated departments, short-retention troubleshooting context), and erasure flows MUST purge a target namespace with completion evidence on the audit ledger.

**Acceptance Criteria:**

- Expired memories are unreadable post-TTL; erasure produces a ledger-recorded completion attestation (UC-012).
- Failure: partial purge reports exactly what remains and retries; it never reports false completion.

#### MEM-006: Past-Incident Ledger with Decision-and-Outcome Records

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | SUR-001 |
| **Research basis** | F-062; Cleric 12-of-200 postmortems finding (unverified) |

**Description:** The platform MUST capture, at incident time, structured records of hypotheses tested, actions taken, and whether each worked, plus links to evidence — and MUST serve them from a fast local store so investigations never fan out to rate-limited vendor APIs mid-incident.

**Acceptance Criteria:**

- A closed incident's record includes per-action outcome flags queryable by INV-003 and EVAL-001.
- Ledger reads during investigations hit local storage (verified by the absence of vendor API calls on the recall path).
- Failure: capture failure during an incident raises a data-quality flag on that record rather than fabricating completeness.

#### MEM-007: Trust-Labeled Context Layers

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | MEM-006 |
| **Research basis** | F-063; Datadog three-layer knowledge split |

**Description:** Agent-visible knowledge MUST be layered — verified organizational facts, procedural runbooks, feedback-derived memories — each with distinct governance and freshness policy, and every agent-visible fact MUST carry its layer's trust label.

**Acceptance Criteria:**

- Investigation reports distinguish verified facts from learned memories in their citations.
- Promotion of a memory to verified-fact status requires an authorized human action, logged.
- Failure: unlabeled context is treated as the lowest trust tier.

#### MEM-008: Stack Topology: Declared vs Observed Reconciliation

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | INT-001, INT-002 |
| **Research basis** | F-064, F-065, F-066; Backstage entity ontology as interchange schema (constraint) |

**Description:** The platform MUST ingest declared service catalogs and CMDB/asset data, continuously reconcile them against observed topology (traces, cluster state, cloud inventory), and expose the diff as both a data-quality score and live investigation context. Asset context (owner, environment, criticality) MUST attach to agent decisions and approval requests. Remediation drafts for drift MUST route through the approval queue.

**Acceptance Criteria:**

- An out-of-band infrastructure change appears in the drift view with its evidence; blast-radius estimates cite catalog relations.
- Approval objects for infrastructure actions display the affected assets' criticality and ownership.
- Failure: catalog source unavailable → observed-only mode with declared-data staleness labeled.

#### MEM-009: Pre-Model Secret and PII Redaction

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | None |
| **Research basis** | F-070 |

**Description:** Secret-shaped values and PII MUST be scrubbed from content before any model call (prompt or tool output) and restored as placeholders in displayed results; response-side redaction MUST also apply to tool outputs rendered to surfaces.

**Acceptance Criteria:**

- Seeded canary secrets in logs never appear in model-bound payloads (verified by interception tests).
- Failure: scrubber failure blocks the model call (fail-closed), with the block visible to the requesting flow (INV-010 dependency).

#### MEM-010: Knowledge Egress to Customer-Owned Systems

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Dependencies** | MEM-006, GOV-004, INT-004 |
| **Research basis** | F-067 |

**Description:** Agent learnings SHOULD propagate as proposals to customer-owned runbooks, alert tuning, and dashboard annotations in open formats, each citing motivating incidents and passing the customer's normal review process.

**Acceptance Criteria:**

- An egress proposal (e.g., runbook change) carries incident citations and lands as a reviewable change in the customer's system, never a direct write.
- Failure: rejected proposals record the rejection for the ROI report (RPT-009).

#### MEM-011: Knowledge-Base Gap Detection and Freshness

| Field | Value |
|-------|-------|
| **Priority** | P1 (gap detection); P2 (freshness auditing) |
| **Dependencies** | INT-006, MEM-006 |
| **Research basis** | F-068, F-069 |

**Description:** The platform MUST detect ticket classes resolved without a matching KB article and draft one with provenance citations through human review; it SHOULD periodically cross-reference KB articles against actual resolutions and deprecations, proposing redlined updates through the same gate.

**Acceptance Criteria:**

- A recurring resolved-without-article ticket class yields a draft with citations within the scheduled cycle.
- Failure: drafts never publish without human approval; failed drafts are logged for review.

#### MEM-012: Memory Recall Policy Dial

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Dependencies** | MEM-003, RPT-001 |
| **Research basis** | F-058 (selective-recall tradeoff figures unverified) |

**Description:** The platform MAY expose the recall accuracy-vs-latency/cost tradeoff as a governed per-team setting with cost surfacing.

**Acceptance Criteria:**

- Changing the dial measurably changes recall depth and cost attribution; the setting is audited.
- Failure: invalid configurations fall back to the tenant default with notice.

### 6.5 INT — Integrations & Connectivity

#### INT-001: Cross-Vendor Observability Connector Layer

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | GOV-002, GOV-012 |
| **Research basis** | F-071; integrations catalog (vendor MCP servers; "unstable" endpoint risk) |

**Description:** The platform MUST expose one normalized capability schema (query metrics, search logs, get traces, list monitors/alerts, write annotations) routed to vendor-native query languages per backend, with at least two major backends at launch and graceful REST/webhook fallback where vendor agent-endpoints are unavailable or unstable. Vendor churn MUST NOT change the agent-facing schema.

**Acceptance Criteria:**

- The same investigation logic runs against two different vendor backends without agent-prompt changes.
- A vendor endpoint deprecation is absorbed by the connector layer without schema change (verified by contract tests).
- Failure: backend outage degrades that capability with explicit gap reporting in investigations (UC-001).

#### INT-002: Kubernetes Connector with Hardened Read-Only Profiles

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | GOV-012, INT-009 |
| **Research basis** | F-072, F-081 ("read-only is a myth" RBAC holes) |

**Description:** Kubernetes access MUST use native-API integration with multi-cluster support, deployed read-only by default under dedicated service identities. Read-only profiles MUST close known escalation holes: no secret enumeration, no node-proxy/exec bypass, no escalate/bind/impersonate verbs; secret-shaped response content MUST be redacted (MEM-009).

**Acceptance Criteria:**

- The read-only profile fails a privilege-escalation test suite covering the enumerated holes.
- Write verbs require staged enablement per GOV-012 plus gatekeeper execution per GOV-001.
- Failure: cluster unreachable → investigations report the gap; no stale cluster state presented as live.

#### INT-003: IaC Connectors with Plan-Approve-Apply

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | GOV-001, GOV-003, GOV-004 |
| **Research basis** | F-073, F-034; UC-003 |

**Description:** IaC integrations MUST surface registry/docs/workspace operations read-only and route all state-changing operations through plan-approve-apply with blast-radius and cost-delta rendering; destroy-class operations MUST require two-person approval regardless of upstream tool flags.

**Acceptance Criteria:**

- An apply without a matching approved plan is impossible (UC-003); destroys show two approvers.
- Failure: plan/apply drift blocks apply (GOV-003); mid-apply failure posts partial-state inventory and rollback proposal.

#### INT-004: CI/CD and VCS Connectors

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | GOV-012 |
| **Research basis** | F-074 |

**Description:** The platform MUST integrate PR/issue/pipeline operations with the major VCS/CI providers and deployment-event feeds into the ledger; merge-class operations MUST honor the approval iron law (no merge without recorded approval).

**Acceptance Criteria:**

- Deploy events appear in investigation timelines correlated to incidents.
- A merge executed by an agent links to its approval record; absence blocks the merge.
- Failure: webhook delivery loss is detected by reconciliation polling within a bounded window.

#### INT-005: Systems-of-Record Connector Hub (ITSM/CRM/Comms vendors)

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | GOV-012 |
| **Research basis** | F-075 |

**Description:** The platform MUST consume official vendor agent endpoints where they exist (with per-connection toolset filtering) and REST/webhook fallback elsewhere, normalized behind one capability schema covering ticketing, CRM, paging, and chat vendors.

**Acceptance Criteria:**

- Connector capability matrices are introspectable per tenant (what we read, what we write, auth mode).
- Failure: vendor auth revocation suspends the connector with actionable re-auth guidance, preserving queued work.

#### INT-006: ITSM Bidirectional Sync

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | INT-005 |
| **Research basis** | F-077; Atlassian points-based limits (polling structurally unviable) |

**Description:** ITSM sync MUST be webhook-driven delta sync with per-vendor rate budgeting, provenance-marked loop prevention, conflict merge rules, and downtime queueing, serving one internal schema agents query without mid-task vendor fan-out.

**Acceptance Criteria:**

- Sync loops are absent under bidirectional update storms (provenance test); conflicts resolve per documented rules with audit.
- Vendor rate-limit exhaustion never blocks incident-time reads (cache serves).
- Failure: extended vendor downtime → queued mutations apply in order on recovery with idempotency.

#### INT-007: Rate-Budgeted CRM/CS Sync Layer

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | INT-005 |
| **Research basis** | F-078; CS-platform rate-limit asymmetry (vendor figures unverified) |

**Description:** CRM/Customer-Success data (accounts, ARR, tier, health, entitlements, SLA clocks, owning CSM) MUST sync via change-streams where available and budgeted polling elsewhere, served to agents as an eventually-consistent cache with explicit staleness so incident-time lookups never block on vendor APIs.

**Acceptance Criteria:**

- Incident-time impact views (INV-013) render entirely from cache; staleness is displayed (UC-006).
- Per-vendor budgets are configurable; exhaustion degrades sync frequency, never incident-time reads.
- Failure: schema drift in a vendor object quarantines affected fields with data-quality flags, not silent nulls.

#### INT-008: Customer-Success Write-Back

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | INT-007, GOV-004 |
| **Research basis** | F-079 |

**Description:** Structured post-incident impact records MUST write back to CS/CRM platforms as queued idempotent jobs within rate budgets, so account timelines and churn models see incident history.

**Acceptance Criteria:**

- Write-back jobs are exactly-once-effective (idempotency keys) with per-job delivery state visible.
- Failure: sustained rejection by the vendor parks the job with alerting; no partial duplicate records.

#### INT-009: Keyless Credential Broker with Per-Task Scoping

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | IDN-003 |
| **Research basis** | F-080 |

**Description:** All cloud and infrastructure access MUST use short-lived, per-task credentials minted by a broker federating the platform's identity into customer clouds; effective permissions MUST be the intersection of the agent's role and the task's session policy; credentials MUST carry attribution tags (agent, task, on-behalf-of human). Long-lived static keys MUST NOT exist anywhere in the agent path.

**Acceptance Criteria:**

- Credential inventory shows zero non-expiring agent credentials (SM-5); lifetimes respect NF-007.
- Downstream cloud audit logs show the attribution tags for agent actions (IDN-006).
- Failure: broker unavailable → no new task credentials (fail-closed); in-flight tasks complete on their existing short-lived tokens.

#### INT-010: Outbound-Only Relay for On-Prem and Restricted Networks

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | INT-009, IDN-003 |
| **Research basis** | F-082; "never internet-expose MCP" doctrine |

**Description:** Access to on-prem and firewalled estates MUST use a customer-deployed relay with workload identity that initiates only outbound connections; no inbound firewall rules and no internet-exposed tool servers. The relay SHOULD federate with existing infrastructure-access brokers rather than replace them.

**Acceptance Criteria:**

- A relay deployment requires zero inbound rules (validated install path); tool servers are reachable only via the relay.
- Failure: relay disconnect marks its estate unavailable with investigation-time gap reporting; reconnection is automatic with backoff.

#### INT-011: Alert and Webhook Ingestion Fabric

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | None |
| **Research basis** | F-085 |

**Description:** The platform MUST ingest alerts/webhooks from paging and monitoring vendors, normalize and deduplicate them, and emit triggers for investigations (INV-001) and escalation state (ESC-001). Ingestion MUST be at-least-once with idempotent downstream effects.

**Acceptance Criteria:**

- Duplicate vendor deliveries produce one investigation; distinct alerts correlate per dedup rules with the grouping inspectable.
- Failure: ingestion backlog degrades latency, never drops; backlog depth is monitored and alertable.

#### INT-012: Per-Connection Toolset Scoping and Context Budgeting

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | INT-001..INT-005 |
| **Research basis** | F-076; tool-sprawl token costs (Pulumi/Cursor evidence) |

**Description:** Every connection MUST support categorical toolset enablement (allowlists over denylists) and the platform SHOULD provide tool-search meta-capability for large suites, keeping per-agent tool-surface token cost within configured budgets.

**Acceptance Criteria:**

- An agent's effective tool list reflects allowlist configuration exactly; oversized tool surfaces trigger budget warnings.
- Failure: budget breach degrades to search-based tool discovery rather than silent truncation.

#### INT-013: Agent-Trace Interop (OTLP In/Out)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | SUR-003 |
| **Research basis** | F-086 |

**Description:** The platform MUST ingest and export agent traces in open telemetry formats with pluggable storage, so customers can keep traces in their existing observability estate.

**Acceptance Criteria:**

- Round-trip: an exported trace re-imports losslessly for replay/analysis.
- Failure: export destination outage buffers within retention limits with visible state.

#### INT-014: Cross-Vendor Query Budget Governance

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | INT-001, INT-005, RPT-001 |
| **Research basis** | F-112 (vendor quota figures unverified) |

**Description:** The platform MUST aggregate vendor-imposed agent/API quotas into managed, team-allocatable budgets with caching, chargeback attribution, and pre-exhaustion alerts.

**Acceptance Criteria:**

- A team approaching a vendor quota receives an alert before stall; consumption is attributable per team/agent.
- Failure: quota exhaustion degrades to cache with staleness labels (never partial silent results).

#### INT-015: Paging-Vendor Abstraction and Migration Tooling

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Dependencies** | ESC-001 |
| **Research basis** | F-083 (Opsgenie EOL April 2027) |

**Description:** Escalation integrations MUST be normalized across paging vendors, and the platform MAY ship import tooling for schedules/policies from vendors approaching end-of-life.

**Acceptance Criteria:**

- Switching paging vendors does not change ladder semantics (ESC-001 owns state).
- Failure: import validation rejects malformed schedules with a per-item report.

#### INT-016: SaaS License and Access Hygiene Proposals

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Dependencies** | GOV-004, INT-005 |
| **Research basis** | F-084 |

**Description:** The platform MAY reconcile IdP data against SaaS usage on a schedule, proposing license reclamation and dormant-account cleanup through the tiered approval queue; privileged-group changes MUST always be multi-party.

**Acceptance Criteria:**

- No identity/license mutation lands without its tier's approvals; privileged-group changes show two approvers.
- Failure: stale usage data blocks proposals for affected accounts rather than proposing on bad data.

### 6.6 ESC — Human Escalation & Communications

#### ESC-001: Cross-Channel Escalation Ladder with Unified Acknowledgment

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | INT-011, SUR-001 |
| **Research basis** | F-022; UC-007 |

**Description:** The platform MUST own escalation-ladder state as the single source of truth across chat, push, SMS, and voice channels, with per-rung acknowledgment timeouts; an acknowledgment from any channel MUST cancel pending rungs everywhere within the NF-001 budget. Vendors are delivery channels, never state owners.

**Acceptance Criteria:**

- Exactly-once effective acknowledgment under concurrent multi-channel responses (idempotent ack handling).
- The full ladder history (rungs fired, timeouts, ack channel/identity/time) reconstructs from the ledger (UC-007).
- Failure: a channel provider outage skips to the next rung with the gap recorded; exhausted ladders engage the failure detector (ESC-003), never silence (DP-8).

#### ESC-002: Voice-Call Escalation with Keypad/Spoken Acknowledgment

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | ESC-001 |
| **Research basis** | F-021; voice/DTMF gap-fill research (NIST PSTN restrictions; consent law) |

**Description:** The platform MUST be able to place an outbound call to the resolved on-call human, deliver an incident/approval summary, and capture acknowledgment via keypad or (where enabled) speech. Where policy requires identity assurance, a per-incident or per-user PIN MUST be layered on the keypad flow, and the platform MUST originate calls only to pre-registered roster numbers (never act on inbound calls). Recording MUST support consent-capture and metadata-only modes per the §5.4 legality constraint; keypad acknowledgments are evidence, not signatures.

**Acceptance Criteria:**

- A timed-out approval escalates to a call whose acknowledgment closes the ladder; call metadata, attestation/PIN result, digits, and timestamps land on the ledger.
- PIN values never appear in recordings or logs.
- Failure: unanswered call advances the ladder; PIN failure does not acknowledge and is flagged as an identity-assurance event.

#### ESC-003: Total-Escalation-Failure Detector

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | ESC-001 |
| **Research basis** | F-023 |

**Description:** The platform MUST detect ladders that exhaust without effective acknowledgment and engage tenant-configured fallback contacts (including an executive rung), never parking an unacknowledged critical state silently.

**Acceptance Criteria:**

- A fully unacknowledged ladder produces a standing incident with fallback notifications (UC-007 failure path).
- Failure: fallback contact list empty/invalid → loud platform-level alert to tenant admins.

#### ESC-004: War-Room Bridge Automation

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Dependencies** | ESC-001, ESC-002 |
| **Research basis** | F-024 |

**Description:** The platform MAY create conference bridges, attach one-touch join (including join-by-keypress during voice escalation calls), and feed scribe transcription into the incident timeline.

**Acceptance Criteria:**

- Bridge join artifacts and transcripts attach to the incident record with consent handling per §5.4.
- Failure: bridge provider failure falls back to chat-channel coordination with notice.

#### ESC-005: Fixed Response Codes on Non-Push Channels

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | ESC-001 |
| **Research basis** | F-096 |

**Description:** Non-push channels (keypad, SMS) MUST use fixed, documented response codes for ack/resolve/escalate, with notification bundling to limit noise.

**Acceptance Criteria:**

- Documented codes behave identically across channels; unknown responses prompt a help reply, not silent discard.
- Failure: ambiguous response (multiple codes) requests clarification and does not change state.

### 6.7 SUR — Product Surfaces

#### SUR-001: Canonical Event Stream, Many Renderers

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | None (foundation) |
| **Research basis** | F-087; "Terminal Is All You Need" premise |

**Description:** All agent activity, approvals, escalations, and decisions MUST publish to one ordered, tenant-scoped event stream with progressive disclosure; every surface MUST render from this stream with no surface-private activity state (DP-5). Scrollback MUST double as inspectable history consistent with the audit ledger.

**Acceptance Criteria:**

- For a sampled incident, web, TUI, and ChatOps render the same event sequence (allowing surface-appropriate formatting).
- Any displayed event resolves to a ledger record.
- Failure: stream consumer lag is visible per surface; surfaces never display fabricated interpolations.

#### SUR-002: Web Fleet Command Dashboard

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | SUR-001, GOV-013, IDN-003 |
| **Research basis** | F-088 |

**Description:** The web app MUST show every agent — first-party and registered third-party — with live status, current task, autonomy level, named owner, and drill-down to individual tool calls; it is the system of record for fleet state.

**Acceptance Criteria:**

- Drill-down from fleet view reaches a specific tool call's full record within three navigations.
- Failure: partial data sources render with explicit per-panel degradation, not blank panels.

#### SUR-003: Agent Observability Floor (Traces, Dashboards, Evals)

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | SUR-001, INT-013 |
| **Research basis** | F-089; F-090 (session replay, P1) |

**Description:** The web app MUST provide nested execution traces with timing/IO/cost, token/latency/error dashboards, and eval-result views; instrumentation MUST be non-blocking for agent execution. Session replay SHOULD be available (P1) without material runtime overhead.

**Acceptance Criteria:**

- A failed agent run is diagnosable from its trace (inputs, outputs, costs per step) without log spelunking.
- Failure: trace ingestion outage never blocks agent execution; gaps are marked in affected traces.

#### SUR-004: ChatOps Surface (Slack-Class)

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | SUR-001, GOV-004, ESC-001 |
| **Research basis** | F-094 |

**Description:** Approvals, cited findings, and incident channels MUST be chat-native: interactive approval messages honoring the vendor's interaction acknowledgment deadline, auto-created incident channels, and command entry points. Chat decisions are first-class audit events.

**Acceptance Criteria:**

- Approval interactions acknowledge within the vendor deadline under load (NF-001); the decided message updates to show the decider for all viewers.
- Failure: chat-vendor outage routes approvals to other surfaces (GOV-005) with the gap logged.

#### SUR-005: Microsoft Teams Surface

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | SUR-004 (pattern), GOV-004 |
| **Research basis** | F-095 |

**Description:** Teams MUST receive functional parity for approvals and notifications using its native card interaction model, including shared-view updates ("Approved by X") and per-user refresh views.

**Acceptance Criteria:**

- The UC-002 approval flow completes entirely in Teams with ledger parity to Slack.
- Failure: card delivery failure falls back to link-based web approval.

#### SUR-006: TUI Fleet Monitor and Approval Console

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | SUR-001, GOV-004 |
| **Research basis** | F-091; terminal-rendering security research (ANSI injection) |

**Description:** A keyboard-first terminal application MUST provide fleet watch views, single-key approve/deny with inline diffs, drill-down into live hypothesis trees, and red-button access, distributed as a single static binary suitable for jump hosts. Agent-derived content MUST be sanitized of terminal control sequences before rendering, and approval integrity MUST bind to the locally verified payload hash, not rendered text. Per the gap-fill security research, terminal approvals SHOULD be limited to lower-risk tiers or paired with a second factor on another surface, per tenant policy.

**Acceptance Criteria:**

- Injection test corpus (escape sequences in agent output) renders inert; approvals verify payload hash client-side.
- The binary runs without network egress beyond the platform API (air-gap-friendly).
- Failure: stream disconnect shows stale-state banner; approvals are disabled while stale.

#### SUR-007: Mobile Critical-Alert Approvals and Incident Brief

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | GOV-004, ESC-001 |
| **Research basis** | F-093; platform critical-alert entitlement risk (gap-fill research) |

**Description:** High-tier approvals and major pages MUST reach mobile with maximum-urgency notifications where platform entitlements permit, approve/deny with pinned diff summary, and push→SMS→voice fallback. Where OS-level critical-alert entitlements are not granted, the ladder MUST compensate via earlier SMS/voice rungs.

**Acceptance Criteria:**

- A Tier-3 approval is decidable from mobile with the same ledger record quality as web.
- Failure: push delivery failure demonstrably advances the ladder within timeout.

#### SUR-008: Desktop Tray Companion

| Field | Value |
|-------|-------|
| **Priority** | P3 |
| **Dependencies** | SUR-001, GOV-004 |
| **Research basis** | F-092 |

**Description:** A lightweight desktop tray client MAY provide fleet glance and lower-tier approval prompts; it MUST NOT embed the full web application.

**Acceptance Criteria:**

- Tray approvals share the cross-surface object semantics (GOV-005).
- Failure: tray offline state defers to other surfaces silently (it is never a required path).

### 6.8 IDN — Identity, Audit & Enterprise Readiness

#### IDN-001: Signed, Tamper-Evident Action Ledger

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | None (foundation) |
| **Research basis** | F-097; transparency-log pattern; six-field audit bar (unverified attribution) |

**Description:** Every agent action — including denied requests — MUST be recorded with at minimum: agent identity, human authorizer/delegation chain, data/resources touched, operation, policy decision with governing policy reference, and trusted timestamp; records MUST be cryptographically chained with inclusion proofs and independently verifiable without platform access.

**Acceptance Criteria:**

- Independent verification tooling validates ledger integrity for an exported range (UC-011).
- Record deletion/mutation attempts are detectable by proof failure.
- Failure: ledger write unavailability blocks gated mutations (fail-closed for writes; reads per tenant degraded-mode policy).

#### IDN-002: SIEM Streaming and Retention

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | IDN-001 |
| **Research basis** | F-098; GitHub Enterprise audit-streaming bar |

**Description:** Audit events MUST stream to customer SIEM/storage destinations (multiple destination classes) with at-least-once delivery, pause buffering, per-stream health checks, configurable multi-year retention, and a read-only query/export API.

**Acceptance Criteria:**

- Destination outage and recovery loses zero events (replay verified); stream health is visible per destination.
- Failure: sustained destination failure alerts tenant admins before buffer expiry.

#### IDN-003: Agent Identity Registry (Non-Human Identity Governance)

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | IDN-007 |
| **Research basis** | F-101; CSA NHI control set |

**Description:** Every agent MUST be a registered non-human identity with: named human owner, business purpose, short-lived attestation-bound workload credentials with automatic rotation, just-in-time task-scoped credentials (INT-009), minutes-scale revocation, and audit-preserving decommissioning. The registry SHOULD sync into customer inventory systems.

**Acceptance Criteria:**

- No agent operates without a registry entry and named owner (posture check IDN-011 enforces).
- Revoking an agent invalidates its credentials within minutes (UC-010).
- Failure: ownerless agents (owner departed) are auto-flagged and policy-restricted until reassigned.

#### IDN-004: Structural Read/Write Credential Split

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | IDN-003, INT-009 |
| **Research basis** | F-102 |

**Description:** Observer agents MUST hold read-only identities; mutation execution MUST use a distinct, JIT-minted credential issued only upon approval — a separation enforced by architecture, not policy convention.

**Acceptance Criteria:**

- A read-credentialed agent cannot mutate even if policy misconfigures an allow (the credential physically lacks the permission).
- Failure: mint-time scope inflation (requested > approved) is rejected by the broker and audited.

#### IDN-005: Delegation-Chain Authorization Graph

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | IDN-001, IDN-003 |
| **Research basis** | F-103 |

**Description:** User → agent → sub-agent → tool delegation chains MUST be recorded as a queryable graph answering "who authorized this agent to touch that resource."

**Acceptance Criteria:**

- For any ledger action, the full delegation chain resolves to a human origin.
- Failure: a broken chain (orphan delegation) is a posture finding (IDN-011) and restricts the orphan.

#### IDN-006: Agent-vs-Human Attribution in Downstream Systems

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | INT-009 |
| **Research basis** | F-104 |

**Description:** Every downstream action MUST carry attribution (agent ID, task ID, on-behalf-of human) into cloud/vendor audit trails via the brokered credential path; direct unbrokered access MUST be preventable by customer policy.

**Acceptance Criteria:**

- Customer cloud audit logs distinguish agent actions from human actions for brokered access.
- Failure: attribution-tag stripping attempts fail credential minting.

#### IDN-007: Enterprise Identity Baseline (SSO, SCIM)

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | None |
| **Research basis** | F-105; documented IdP asymmetries |

**Description:** The platform MUST support SAML 2.0 and OIDC SSO together, and SCIM 2.0 provisioning engineered for documented IdP behavioral differences (PATCH semantics, group-provisioning limits, rate backoff contracts). IdP groups MUST be membership sources only, never direct permission grants.

**Acceptance Criteria:**

- Provisioning/deprovisioning round-trips correctly against the two major IdPs' documented quirks (conformance suite).
- Deprovisioned users lose access within the sync cycle plus a bounded grace; their audit history is preserved.
- Failure: SCIM errors surface in an admin health view with per-operation retry state.

#### IDN-008: Multi-Tenant RBAC with Tenant-Scoped Everything

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | IDN-007 |
| **Research basis** | F-106 |

**Description:** Authorization MUST use global role templates with tenant-level customization; org → workspace → team hierarchy MUST be modeled internally; tenant identity MUST be present in every authorization decision, query, and cache key (DP-9). Relationship-based grants are reserved for agent/resource delegation (IDN-005).

**Acceptance Criteria:**

- The isolation suite (NF-006) passes across API, cache, memory, search, and audit paths.
- Role-template updates propagate to tenants without destroying tenant customizations.
- Failure: missing tenant context in any internal call is a hard error, never a default-tenant fallback.

#### IDN-009: Self-Hosted Deployment (and Air-Gapped Tier Path)

| Field | Value |
|-------|-------|
| **Priority** | P0 (self-hosted); P1 (air-gapped tier) |
| **Dependencies** | IDN-008 |
| **Research basis** | F-107, F-108; self-host survey (82% vendor support, unverified) |

**Description:** The platform MUST ship a first-class self-hosted deployment (standard container orchestration packaging, bundled dependencies, license key) with functional parity to SaaS except externally dependent channels; tool-server execution MUST be self-hostable inside the customer network with local-only transports for production mutations. An air-gapped tier MUST be architecturally protected (no hard SaaS dependencies in core paths) and delivered post-launch; SaaS-dependent features (e.g., PSTN voice) MUST degrade explicitly in restricted deployments.

**Acceptance Criteria:**

- Self-hosted install passes the same acceptance suite as SaaS minus documented exceptions.
- Core governed-action path (GOV-001..GOV-004, IDN-001) functions with zero egress to platform-operated services in self-hosted mode.
- Failure: feature requiring egress in a restricted deployment is visibly disabled with rationale, never silently broken.

#### IDN-010: Auditor-Ready Evidence Pack Exports

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | IDN-001, IDN-003, GOV-007 |
| **Research basis** | F-099; UC-011 |

**Description:** The platform MUST assemble framework-mapped evidence bundles (ledger extracts with proofs, identity registry, policy decisions, autonomy certificates, approval records, streaming attestations) for common compliance frameworks, generated without engineering involvement.

**Acceptance Criteria:**

- Pack generation completes self-serve; ledger extracts verify independently (UC-011).
- Failure: evidence gaps appear explicitly in the pack and in IDN-011 beforehand.

#### IDN-011: Compliance Posture Dashboard and Gap Detection

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | IDN-003, GOV-003, IDN-005 |
| **Research basis** | F-100 |

**Description:** The platform MUST continuously map control coverage (agents without owners, tools without dry-run, orphan delegations, unsynced streams) and surface gaps before audits.

**Acceptance Criteria:**

- Seeding a known gap (e.g., removing an agent owner) produces a finding within the scan cycle.
- Failure: scanner outage shows posture-staleness, never a false green.

#### IDN-012: Data Residency, No-Training Guarantees, and BYO-Model Routing

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | IDN-008 |
| **Research basis** | F-109; LLM-strategy gap-fill research (BYO-model as procurement gate) |

**Description:** The platform MUST support regional data residency selection, contractual no-training-on-customer-data posture, and routing of all model inference to customer-designated model endpoints (customer cloud tenancy), with per-policy-tier model allowlists. No feature may hard-depend on a single model vendor (§5.4).

**Acceptance Criteria:**

- A tenant configured for customer-tenancy inference sends zero model traffic to platform-default endpoints (egress audit).
- Model allowlist violations are policy denials with the governing tier cited.
- Failure: customer model endpoint outage degrades affected features with explicit notices; no silent fallback to non-allowlisted models.

### 6.9 EVAL — Evaluation & Autonomy Evidence

#### EVAL-001: Time-Travel Evaluation Harness on Closed Incidents

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | MEM-006 |
| **Research basis** | F-041; UC-009 |

**Description:** Every closed incident MUST be replayable as a regression test: the agent investigates against evidence as it existed during the incident window and is graded (detection, localization, root cause, proposed mitigation) against the human-confirmed resolution. Scheduled runs on the customer's own incident distribution MUST gate autonomy promotions (GOV-007) and SHOULD gate platform releases.

**Acceptance Criteria:**

- Replays cannot access post-incident evidence (temporal isolation verified).
- Grades persist per run with diffs across agent versions.
- Failure: insufficient replayable data refuses scoring with sample-size guidance (UC-009).

#### EVAL-002: Bring-Your-Own-Incident Agent Scorecard

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Dependencies** | EVAL-001, GOV-013 |
| **Research basis** | F-042 |

**Description:** The platform SHOULD score any agent — first- or third-party — against the customer's historical incident classes before write access, reporting detection/localization/RCA/mitigation separately.

**Acceptance Criteria:**

- A third-party agent's scorecard derives from the same harness and grading as first-party (DP-10).
- Failure: agents that cannot interface with the harness are reported as unscoreable, not unscored-but-trusted.

#### EVAL-003: Vendor Agent Comparative Scorecard

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Dependencies** | EVAL-002, RPT-001 |
| **Research basis** | F-118 |

**Description:** The platform MAY report side-by-side measured accuracy, cost per investigation, escalation rate, and override frequency across registered agents, and MAY route incident classes to the best measured performer.

**Acceptance Criteria:**

- Scorecard values link to their underlying runs (DP-7: no unevidenced accuracy claims).
- Failure: sparse data renders confidence intervals, not point claims.

### 6.10 RPT — Reporting, Cost & Management

#### RPT-001: Cost Attribution Ledger

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | SUR-001 |
| **Research basis** | F-110 |

**Description:** The platform MUST attribute cost (model tokens, vendor consumption units, voice/paging spend) per agent, task, team, and outcome, with cost-per-resolved-incident trendlines and finance-consumable exports.

**Acceptance Criteria:**

- Any completed task shows its full cost decomposition; totals reconcile against provider billing within a stated tolerance.
- Failure: missing provider billing data is shown as estimated with the basis stated.

#### RPT-002: Budget Caps and Runaway-Loop Circuit Breakers

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | RPT-001 |
| **Research basis** | F-111 |

**Description:** Per-agent and per-team hard budgets (tokens, tool calls, steps) MUST exist, with circuit breakers on repeated identical calls and context-flooding patterns; budget exhaustion MUST route to a human, never degrade silently.

**Acceptance Criteria:**

- A runaway loop (repeated identical tool calls) trips its breaker within the configured threshold and notifies the owner.
- Exhausted budgets stop the task with state preserved for human continuation (DP-8).
- Failure: breaker misfire is human-overridable with audit.

#### RPT-003: Agent SLOs and Error Budgets

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | SUR-003, GOV-006 |
| **Research basis** | F-113 |

**Description:** The platform MUST define and report SLOs on agents themselves — investigation latency, hypothesis acceptance rate, false-remediation rate, abstention correctness — with error budgets whose burn auto-downgrades autonomy (GOV-006).

**Acceptance Criteria:**

- Burned error budget demonstrably triggers the autonomy downgrade with notification.
- Failure: metric pipeline outage freezes autonomy changes (no promotion or data-blind downgrade) with status visible.

#### RPT-004: Validation-Toil Measurement

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | GOV-004, EVAL-001 |
| **Research basis** | F-115 (Catchpoint toil figures unverified) |

**Description:** The platform MUST instrument the human cost of supervising agents — hypothesis acceptance rate, draft edit distance, approval dwell time, false-remediation rate — per agent and category, reported alongside time-saved metrics (DP-7).

**Acceptance Criteria:**

- Toil metrics render per agent/category with trendlines; exports available.
- Failure: low-sample categories display sample sizes, not bare rates.

#### RPT-005: Approval-Fatigue and Rubber-Stamp Analytics

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | GOV-004, GOV-011 |
| **Research basis** | F-117 (93% approval-rate finding, unverified) |

**Description:** The platform MUST detect rubber-stamp patterns (e.g., sub-threshold decision dwell on consequential tiers) and recommend tier recalibration; consistently approved action classes MAY be proposed for earned auto-approval through the certificate path (GOV-007).

**Acceptance Criteria:**

- Dwell-time distributions per tier are reportable; recalibration proposals cite their evidence.
- Failure: auto-approval proposals never bypass the certificate process.

#### RPT-006: Escalation Load and Toil Heatmap

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | ESC-001 |
| **Research basis** | F-116 |

**Description:** The platform MUST report paging load, after-hours interruptions, and escalation depth per team against fleet baselines, with periodic exports for staffing decisions.

**Acceptance Criteria:**

- After-hours interruption counts reconcile with ladder history.
- Failure: timezone/schedule data gaps are flagged per affected team.

#### RPT-007: Capacity Tiers, Caps, and Spend Forecasting

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | RPT-001, RPT-002 |
| **Research basis** | F-120 |

**Description:** Per-team execution budgets MUST support hard caps, soft alerts at configurable thresholds, and burn-rate forecasting so anomalous weeks cannot produce surprise spend (SM-9).

**Acceptance Criteria:**

- Reaching a hard cap stops new consumption with the configured behavior (queue or refuse) and notification.
- Failure: forecast model unavailability does not affect cap enforcement.

#### RPT-008: Support Deflection and Cost-per-Resolution Reporting

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | RPT-001, INV-008 |
| **Research basis** | F-122 |

**Description:** The platform MUST report deflection rates and per-category resolution cost for support workflows, guiding which ticket classes earn more autonomy.

**Acceptance Criteria:**

- Per-category cost and deflection trendlines are exportable and link to their underlying tasks.
- Failure: category taxonomy changes preserve historical comparability via versioned mappings.

#### RPT-009: Executive Fusion Reports

| Field | Value |
|-------|-------|
| **Priority** | P2 |
| **Dependencies** | RPT-001, MEM-010, INV-013, RPT-003 |
| **Research basis** | F-114, F-119, F-121 |

**Description:** The platform MAY provide scheduled executive reports: weekly SLO reviews with auto-filed follow-ups, renewal-risk fusion (open renewals × incident exposure), and knowledge-propagation ROI (runbooks improved, alerts retired).

**Acceptance Criteria:**

- Scheduled reports generate without manual steps and cite source data.
- Failure: missing source sections render as gaps with reasons.

## 7. Non-Functional Requirements

### 7.1 NF — Cross-Cutting Requirements

#### NF-001: Cross-Surface Decision Propagation Latency

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | GOV-004, GOV-005, ESC-001, SUR-001..SUR-008 |

**Description:** Approval/acknowledgment decisions MUST propagate to all surfaces within 5 seconds end-to-end (P99); chat interaction acknowledgments MUST meet the chat vendor's interaction deadline (3 seconds for the primary vendor).

**Acceptance Criteria:**

- Load test at 10× expected peak approval volume meets both budgets.
- Failure: propagation breach alarms platform operations; affected objects display sync state.

#### NF-002: Investigation First-Report Latency

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | INV-001 |

**Description:** The first evidence-cited investigation report MUST land within 2 minutes (P50) and 5 minutes (P95) of alert receipt under reference connector conditions.

**Acceptance Criteria:**

- Synthetic page-to-report benchmarks meet targets per release.
- Failure: misses surface in RPT-003 SLO reporting (agents' own SLOs).

#### NF-003: Audit Completeness and Durability

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | IDN-001, IDN-002 |

**Description:** 100% of agent actions and policy decisions MUST be ledgered before their effects are acknowledged; SIEM delivery MUST be at-least-once with zero loss across destination outages within buffer retention.

**Acceptance Criteria:**

- Reconciliation between connector write logs and ledger shows zero unledgered mutations (SM-1, SM-2).
- Chaos test (ledger/stream outages) demonstrates fail-closed writes and zero-loss replay.

#### NF-004: Policy Decision Latency and Availability

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | GOV-002 |

**Description:** Per-call policy evaluation MUST complete within 100 ms (P99) at reference policy-set sizes, and the decision path MUST be highly available; unavailability behavior is fail-closed per GOV-002.

**Acceptance Criteria:**

- Benchmark at 10× expected call volume and reference policy size meets the budget.
- Failure injection confirms deny-on-unavailable without queue corruption.

#### NF-005: Fail-Closed Mutation Semantics

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | GOV-001, GOV-002, IDN-001, INT-009 |

**Description:** Any failure of the authorization, gatekeeping, ledgering, or credential-minting path MUST result in mutation denial — never best-effort execution.

**Acceptance Criteria:**

- Fault-injection across each component shows zero mutations during the fault window.
- Degradations are tenant-visible within one minute.

#### NF-006: Tenant Isolation Assurance

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | IDN-008, MEM-002 |

**Description:** A scheduled adversarial isolation suite MUST cover API, cache, memory, search, event-stream, and audit paths; any cross-tenant read is a release-blocking defect (SM-6).

**Acceptance Criteria:**

- Suite runs per release and on schedule in production-like environments with published internal results.
- Failure: a finding triggers incident process and feature freeze for the affected path.

#### NF-007: Credential Lifetime and Inventory

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | INT-009, IDN-003 |

**Description:** Agent-path credentials MUST be short-lived (≤ 1 hour standard, ≤ 8 hours absolute ceiling for long tasks with re-attestation), rotated automatically, and fully inventoried; revocation MUST take effect within 5 minutes.

**Acceptance Criteria:**

- Inventory scan finds zero credentials exceeding ceilings (SM-5); revocation drill meets the 5-minute bound (UC-010).

#### NF-008: Scalability Floor

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | SUR-001, GOV-002 |

**Description:** A single tenant MUST support at least 500 registered agents, 100 concurrent governed runs, 1,000 events/second sustained on the event stream, and 50 concurrent human approvers without breaching NF-001/NF-004; the platform MUST scale horizontally beyond the floor.

**Acceptance Criteria:**

- Load test at the floor sustains latency budgets for one hour with zero event loss.
- Failure: backpressure mechanisms shed read-only consumers before governance paths.

#### NF-009: Cost Predictability

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | RPT-002, RPT-007 |

**Description:** No tenant configuration may allow spend beyond configured caps without explicit opt-in; cap enforcement MUST be independent of billing-pipeline availability.

**Acceptance Criteria:**

- Simulated noisy week (10× alert volume) produces zero beyond-cap spend (SM-9).

#### NF-010: Incident-Time Independence from Vendor APIs

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | MEM-006, INT-006, INT-007 |

**Description:** Investigation-time and impact-mapping reads MUST be served from platform-local stores; vendor API outage or rate-limit exhaustion MUST NOT block incident response, only freshness.

**Acceptance Criteria:**

- Vendor-outage simulation during an active incident: UC-001 and UC-006 complete with staleness labels.

#### NF-011: Deployment Parity

| Field | Value |
|-------|-------|
| **Priority** | P0 |
| **Dependencies** | IDN-009 |

**Description:** Self-hosted and SaaS deployments MUST pass the same acceptance suite, with deviations limited to a documented exception list (e.g., PSTN-dependent features); the exception list MUST shrink, not grow, across releases absent explicit decision.

**Acceptance Criteria:**

- Release gates include the dual-target suite; the exception list is versioned and reviewed.

#### NF-012: Communications Compliance (Voice/Recording)

| Field | Value |
|-------|-------|
| **Priority** | P1 |
| **Dependencies** | ESC-002, ESC-004 |

**Description:** Voice features MUST support per-jurisdiction consent flows (pre-recording notice with explicit consent capture) and a metadata-only mode retaining no audio; recording configuration MUST be tenant-policy-driven and audited; lawful-basis documentation hooks MUST be available for data-protection review.

**Acceptance Criteria:**

- Consent-required configuration provably retains no audio absent captured consent; consent events are ledgered.
- Failure: consent flow failure falls back to metadata-only mode, never silent recording.

## 8. Requirement Summary

| Domain | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| GOV | 8 (001–004, 006, 008, 012, 015) | 7 (005, 007, 009–011, 013–014, 016–017 → 9 incl. split) | 2 (018, 019) | 0 | 19 |
| TEAM | 0 | 4 (001–004) | 1 (005) | 0 | 5 |
| INV | 6 (001–003, 006, 008, 011–013 per table) | 7 | 3 (016, 017, part of 014) | 0 | 17 |
| MEM | 2 (002, 006) | 8 | 2 (010, 012) | 0 | 12 |
| INT | 9 (001–007, 009, 011) | 5 (008, 010, 012–014) | 2 (015, 016) | 0 | 16 |
| ESC | 1 (001) | 3 (002, 003, 005) | 1 (004) | 0 | 5 |
| SUR | 4 (001–004) | 3 (005–007) | 0 | 1 (008) | 8 |
| IDN | 7 (001–004, 007–009) | 5 (005, 006, 010–012) | 0 | 0 | 12 |
| EVAL | 0 | 1 (001) | 2 (002, 003) | 0 | 3 |
| RPT | 3 (001–003) | 5 (004–008) | 1 (009) | 0 | 9 |
| NF | 9 | 3 | 0 | 0 | 12 |

Priorities in the table are indicative; the per-requirement field is normative. P0 set corresponds to the research's Phase-1 "governed-action spine plus investigation entry points"; P1 to Phase-2 trust accrual; P2/P3 to Phase-3 horizon (see feature catalog, Phased Delivery View).
