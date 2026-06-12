---
id: SPEC-AGENTOPS-001
title: "Enterprise AgentOps Platform — Technical Specification"
version: 0.1.0
status: draft
part: 1
part_title: "Normative Schemas"
author: "Shaik Noorullah <shaiknooru247@gmail.com>"
created: 2026-06-13
last_updated: 2026-06-13
consumes: "PRD-AGENTOPS-001 v1.0.0 (approved)"
---

# Technical Spec Part 1: Normative Schemas

These schemas are the contracts the PRD explicitly defers to the technical spec: the approval object, audit record, autonomy model, and memory namespace/RBAC design — plus the canonical event envelope, policy decision record, and escalation ladder state that everything else hangs on. Source of truth lives as JSON Schema 2020-12 in `platform/packages/schemas`; the snippets below are the normative shape (field-level JSON Schema follows in implementation). All timestamps are RFC 3339 UTC; all IDs are ULIDs unless stated; `tenant_id` is mandatory on every object (NF-006) and omitted from snippets for brevity.

## 1. ApprovalObject (GOV-004, GOV-005)

The cross-surface approval object — per the research, "the product."

```jsonc
{
  "id": "apr_01J...",
  "action_ref": "act_01J...",            // proposed action in the gatekeeper
  "tier": 2,                              // 0 auto-read · 1 notify · 2 single · 3 two-person
  "payload_hash": "sha256:...",          // canonical-JSON hash of the EXACT execution payload
  "idempotency_key": "idk_01J...",       // minted BEFORE first human interrupt; survives retries
  "diff": { "format": "unified|structured", "body": "..." },   // human-readable, surface-renderable
  "dry_run_ref": "dr_01J...",            // ledger ref to dry-run output (GOV-003); null only if tier forced max
  "risk": { "irreversible": false, "blast_radius": "...", "policy_refs": ["pol_..."] },
  "reviewers": { "required": 1, "eligible": ["usr_...", "grp_..."], "second_must_differ": true },
  "expires_at": "...",                    // TTL 24h–7d per tier policy; expiry → re-proposal, never auto-execute
  "state": "pending",                     // see state machine
  "decisions": [                          // append-only
    { "decision": "approved|rejected|rejected_with_edits", "by": "usr_...",
      "surface": "slack|web|tui|mobile|teams|voice_dtmf", "at": "...",
      "payload_hash_seen": "sha256:...",  // what the approver saw — MUST equal payload_hash
      "edits": null }
  ],
  "ledger_refs": ["led_..."]
}
```

**State machine (normative):**

```
pending ──approve──► approved ──hash+freeze revalidation ok──► executing ──► executed
   │  │                   │                                        │
   │  └─reject──► rejected └─revalidation fail──► invalidated ─────┴─exec fail──► failed (rollback handle attached)
   └─ttl──► expired ──► (new object via re-proposal, new idempotency_key)
```

Invariants: `executed.payload_hash == approved.payload_hash` (else `invalidated`); tier-3 requires two distinct authenticated `by` identities; a decision on a decided object is a no-op returning the existing decision (idempotent); every transition emits a CanonicalEvent and a ledger record.

## 2. AuditRecord (IDN-001, NF-003)

Six mandatory evidence fields + chaining. Per-tenant hash chain; periodic Merkle checkpoints.

```jsonc
{
  "seq": 184467,                          // per-tenant monotonic
  "id": "led_01J...",
  "ts": "...",                            // trusted time (NTP-disciplined; source recorded)
  "agent": { "id": "spiffe://t_x/agent/inv-7", "version": "..." },          // 1. agent identity
  "delegation_chain": ["usr_alice", "agent/orchestrator-2", "agent/inv-7"], // 2. human authorizer → chain (IDN-005)
  "resources": [{ "system": "k8s:prod-eu", "ref": "deploy/checkout", "data_class": "config" }], // 3. touched
  "operation": { "kind": "tool_call|approval|policy_decision|escalation|memory_op|admin", "name": "...", "payload_hash": "sha256:..." }, // 4. operation
  "decision": { "effect": "permit|deny", "policy_refs": ["pol_..."], "decision_record": "pdr_01J..." }, // 5. policy decision + governing policy
  "outcome": { "status": "ok|error|denied", "detail_ref": "blob_..." },
  "context": { "task_id": "tsk_...", "incident_id": "inc_...", "approval_ref": "apr_...", "on_behalf_of": "usr_..." },
  "prev_hash": "sha256:...",              // 6. tamper-evidence: chain
  "hash": "sha256:..."                    // sha256(canonical(record sans hash) || prev_hash)
}
```

**Checkpoint:** every N records or T minutes (tuned in S1), a Merkle root over the interval is written to customer object storage with an inclusion-proof index. The verification CLI validates: chain continuity, per-record hashes, checkpoint roots — offline, without platform access (UC-011). Denials are first-class records. SIEM streaming (IDN-002) ships these records verbatim on the EnterpriseReady-style envelope.

## 3. PolicyDecisionRecord (GOV-002)

One normalized schema regardless of engine:

```jsonc
{
  "id": "pdr_01J...",
  "principal": "spiffe://t_x/agent/inv-7",
  "action": "connector:datadog:query_metrics",   // capability-schema verb (Part 0 §3)
  "resource": "scope://t_x/env/prod/service/checkout",
  "context_hash": "sha256:...",                  // canonical hash of evaluated context (freeze state, tier, autonomy level)
  "effect": "permit|deny",
  "engine": { "kind": "cedar", "version": "..." },
  "policy_refs": ["pol_freeze-q3", "pol_sre-readonly"],   // empty + deny == default-deny
  "evaluated_at": "...", "latency_ms": 4,
  "phase": "tool_listing|invocation"             // dual enforcement points
}
```

Replays of identical `(principal, action, resource, context_hash)` MUST yield identical effects (GOV-002 determinism).

## 4. Autonomy Model & Certificate (GOV-006, GOV-007)

**Levels (normative):** `L0` observe-only · `L1` suggest · `L2` act-with-approval · `L3` bounded-autonomous within certified scenario classes (notify-after) · `L4` reserved, disabled at launch. Grants are tuples `(agent, scenario_class, environment) → level`; overlapping scopes resolve to the **lowest** applicable level.

```jsonc
{
  "id": "cert_01J...",
  "subject": { "agent": "spiffe://t_x/agent/remed-3", "scenario_class": "k8s.scale_out", "environment": "prod-eu" },
  "level": "L3",
  "evidence": {
    "eval_runs": ["evr_...", "evr_..."],        // EVAL-001 time-travel runs
    "thresholds": { "rca_accuracy": ">=0.85", "false_remediation": "<=0.02", "abstention_correctness": ">=0.9" },
    "window": { "from": "...", "to": "...", "sample_size": 47 }
  },
  "approved_by": "usr_em-vp",                   // named human (UC-009)
  "issued_at": "...", "expires_at": "...",      // expiry → automatic reversion to prior level
  "revocation": {
    "conditions": ["error_budget_burn>1.0", "eval_regression", "manual"],
    "status": "active|revoked|expired", "revoked_at": null, "revoked_reason": null
  },
  "ledger_refs": ["led_..."]
}
```

Invariants: no `L3` grant exists without an `active` certificate (policy gateway checks certificate status in context); invalid/missing evidence ⇒ certificate invalid ⇒ grant reverts; auto-downgrade (RPT-003 error-budget burn) sets `revoked` with reason and emits events.

## 5. Memory Namespace & Scope RBAC (MEM-001..MEM-005)

**Namespace grammar (compiled at write time; engine never sees free-form namespaces):**

```
ns := org/<org_id>
    | org/<org_id>/dept/<dept_id>
    | org/<org_id>/dept/<dept_id>/team/<team_id>
    | org/<org_id>/dept/<dept_id>/team/<team_id>/agent/<agent_id>
    | org/<org_id>/account/<crm_account_id>          # support-context scope
```

**Claims → scope mapping (enforced in memory-proxy, never engine-side):** the caller's JWT carries `org`, `dept[]`, `team[]`, `agent` (for NHIs) from the identity registry — never agent-supplied. Default access matrix:

| Operation | Rule |
|---|---|
| `write` | Only the caller's own deepest scope (an agent writes `…/agent/<self>`; team-shared writes require an explicit grant) |
| `read` / `recall` | Own scope + ancestors (team → dept → org), per policy; **sibling and descendant scopes denied by default** |
| `promote` (memory → higher tier or fact layer) | Human-authorized only; ledgered (MEM-007) |
| `delete` / `correct` | Scope owners + P-ADM; prior content retained in audit history (MEM-004) |

**Recall fan-out (MEM-003):** proxy queries each permitted tier, merges by recency × relevance, annotates each item `{scope_tier, provenance_ref, trust_label}`; per-tier timeouts degrade to partial results with the missing tier flagged.

**Safety invariants (MEM-002):** provisioning fails on blank/default namespace config; every engine call carries a compiled namespace; a runtime probe asserts the engine's default-namespace fallback is unreachable (write canary in CI and on boot); retention TTLs and erasure are applied per scope tier with ledgered completion attestations (MEM-005).

## 6. CanonicalEvent (SUR-001)

```jsonc
{
  "id": "evt_01J...",                      // ULID — stream-ordered
  "stream": "t_x/incident/inc_42",         // tenant-scoped stream key
  "ts": "...",
  "actor": { "type": "agent|human|system", "id": "..." },
  "kind": "investigation.hypothesis|approval.requested|approval.decided|escalation.rung|action.executed|abstention|...",
  "disclosure": 1,                          // progressive disclosure level: 0 headline · 1 detail · 2 raw tool I/O
  "payload": { /* kind-specific, schema-versioned */ },
  "ledger_ref": "led_...",                  // every displayed event resolves to the ledger (SUR-001)
  "schema": "agentops.event/1"
}
```

Surfaces render only from this envelope; agent-derived strings inside `payload` are sanitized per surface (HTML-escape, ANSI/OSC strip for TUI per SUR-006).

## 7. EscalationLadder (ESC-001..ESC-003)

```jsonc
{
  "id": "esc_01J...",
  "subject_ref": "apr_...|inc_...",
  "target": { "resolved_human": "usr_oncall", "roster_source": "pagerduty:schedule/P123", "resolved_at": "..." },
  "rungs": [
    { "n": 1, "channel": "slack",  "timeout_s": 120, "state": "acked|timeout|skipped_outage", "fired_at": "..." },
    { "n": 2, "channel": "push",   "timeout_s": 120 },
    { "n": 3, "channel": "sms",    "timeout_s": 180 },
    { "n": 4, "channel": "voice",  "timeout_s": 240, "identity_assurance": "pin|none" }
  ],
  "ack": { "by": "usr_oncall", "channel": "voice_dtmf", "evidence": { "call_sid": "...", "digits_hash": "...", "pin_verified": true, "attestation": "A" }, "at": "..." },
  "state": "running|acked|exhausted",
  "on_exhausted": ["usr_fallback1", "grp_exec"]   // ESC-003; empty list is a provisioning error
}
```

Invariants: ladder state lives only in the platform (vendors are delivery channels); first effective ack cancels all rungs everywhere ≤ NF-001 budget, idempotently; `exhausted` MUST trigger the failure detector — terminal silence is unrepresentable (no terminal state without ack or fallback notification); PIN values never persist (only verification results); audio retention only with ledgered consent (NF-012).

## 8. Capability Schema (INT-001, INT-005) — envelope

Connector-routed verbs share one envelope; per-domain verb sets are versioned separately (`observability/1`: `query_metrics`, `search_logs`, `get_trace`, `list_monitors`, `write_annotation`; `itsm/1`, `crm/1`, `paging/1` analogous):

```jsonc
{
  "capability": "observability/1:query_metrics",
  "scope": "scope://t_x/env/prod",
  "params": { /* schema-versioned, vendor-neutral */ },
  "routing": { "connector": "con_datadog_1", "fallback": ["con_grafana_1"] },
  "budget": { "vendor_quota_class": "datadog.mcp", "cost_attribution": "tsk_..." },
  "freshness": { "max_staleness_s": 300, "served_from": "live|cache", "as_of": "..." }
}
```

Adding a vendor adds an adapter, never a schema change visible to agents (INT-001 acceptance). S5 validates expressiveness across three metric backends.
