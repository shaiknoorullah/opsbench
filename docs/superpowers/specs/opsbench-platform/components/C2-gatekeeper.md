---
id: SPEC-OPSBENCH-001
title: "Opsbench Platform — Component Design: C2 Actuation Gatekeeper"
version: 0.1.0
status: draft
part: component
component: C2
component_title: "Actuation Gatekeeper"
author: "Shaik Noorullah <shaiknooru247@gmail.com>"
created: 2026-06-17
last_updated: 2026-06-17
consumes: "SPEC-OPSBENCH-001 Part 0 §2 (C2), Part 1 (ApprovalObject, PolicyDecisionRecord, AuditRecord); PRD GOV-001, GOV-003, GOV-004, GOV-008, GOV-015, GOV-017, NF-005, DP-1, DP-3"
---

# Component Design: C2 — Actuation Gatekeeper

The gatekeeper is the single, deterministic chokepoint every mutation passes through.
It sits **outside the agent's write scope** (DP-1): agents propose actions; only the
gatekeeper executes them, and only after policy permits, a dry-run is forced, approvals
clear, the payload is re-validated, a just-in-time credential is minted, and the whole
sequence is recorded on the audit ledger.

- Requirements: PRD `GOV-001` (independent control point), `GOV-003` (dry-run contract),
  `GOV-004` (payload-hash invariant), `GOV-008` (kill switch), `GOV-015` (ITSM gate),
  `GOV-017` (progressive rollout), `NF-005` (fail-closed), `DP-1`/`DP-3`.
- Depends on: C1 policy engine, C3 approvals, C4 credential broker, C5 audit ledger.

## 1. The flow (normative order)

```text
Agent proposes Action{tool, payload, justification, on_behalf_of}
        │
        ▼
1. payload_hash = sha256(canonical(payload))           # the pinned artifact
2. PolicyEngine.Decide(...)  ── deny ──► record denial on ledger, return Denied
        │ permit (+ tier)
3. FreezeChecker.IsFrozen?    ── yes ──► record denial, return Denied (GOV-009)
4. Tool lookup; if !HasDryRun -> tier = max(tier, 3)   # GOV-003 auto-escalate
5. Tool.DryRun(payload) -> {diff, effect_hash}         # forced (GOV-003)
6. if tier >= 2: ApprovalGate.Request(payload_hash, diff)
        ── rejected ──► record, return Denied
        ── approved but hash_seen != payload_hash ──► Invalidated (GOV-004)
7. re-hash payload; if != pinned payload_hash ──► Invalidated   # GOV-004
   re-run DryRun; if effect_hash diverges ──► Blocked            # GOV-003 apply-time
8. CredentialBroker.MintWrite(agent, task, scope)      # JIT, distinct from read creds
9. Tool.Apply(payload, cred) -> {rollback_handle}
10. record outcome on ledger; return Executed{rollback_handle, ledger_id}
```

Every step that can fail is **fail-closed** (NF-005): policy/freeze/dry-run/approval/
broker/ledger errors all deny the mutation and (where reached) record the denial. The
decision is recorded *before* any irreversible effect; the outcome is recorded before
the caller is told "done" (C5 design §7).

## 2. Collaborator interfaces (the seams)

The gatekeeper owns the orchestration and depends only on interfaces, so C1/C3/C4 plug
in without changing C2:

- `PolicyEngine.Decide` → `{effect, tier, policy_refs, decision_record}` (C1).
- `ApprovalGate.Request` → `{approved, by, payload_hash_seen}` (C3).
- `CredentialBroker.MintWrite` → short-lived write `Credential` (C4).
- `FreezeChecker.IsFrozen` → freeze windows (GOV-009; becomes policy-as-code at C1).
- `Tool` → `HasDryRun()`, `DryRun(payload)`, `Apply(payload, cred)`.
- `Ledger.Record` → durable audit append; the C5 `LedgerAppender` satisfies this via an
  adapter (real integration, not a stub).

## 3. The GOV-004 payload-hash invariant

The payload is hashed (canonical JSON) before approval and pinned. The approver attests
the hash they saw (`payload_hash_seen`); if it differs, the action is `Invalidated`.
Before apply, the payload is re-hashed; any change between approval and execution →
`Invalidated`, never executed. The executed payload is therefore byte-identical to the
approved one.

## 4. v0.1 scope and deferrals

**In v0.1 (this build):** the flow above — GOV-001 chokepoint, the GOV-003 dry-run
contract (with auto-escalation and apply-time divergence blocking), GOV-004 hash pinning,
fail-closed, and **real C5 ledger integration** (decision + outcome records).
Collaborators (C1/C3/C4) are interfaces with in-memory fakes for tests.

**Deferred (later iterations, noted so the seams exist):** GOV-008 layered kill switch
(pause/quarantine/credential revocation), GOV-015 ITSM change-request precondition,
GOV-017 progressive rollout enforcement, and GOV-009 freeze-as-policy-code (the
`FreezeChecker` interface is the placeholder).

## 5. Fail-closed matrix (NF-005)

| Failure | Behavior |
|---|---|
| Policy engine error/unavailable | Deny; do not call the tool |
| Cannot record the decision on the ledger | Deny (DP-3: no evidence → no action) |
| Freeze check error | Deny (fail frozen) |
| Dry-run error, or no dry-run + unapproved | Deny / escalate |
| Approval rejected, timed out, or hash mismatch | Deny / Invalidated |
| Credential mint error | Deny; tool never applied |
| Apply error | Record error outcome; return Failed with any rollback handle |
