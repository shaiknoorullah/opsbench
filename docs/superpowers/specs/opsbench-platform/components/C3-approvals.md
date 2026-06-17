---
id: SPEC-OPSBENCH-001
title: "Opsbench Platform — Component Design: C3 Approval Service"
version: 0.1.0
status: draft
part: component
component: C3
component_title: "Approval Service"
author: "Shaik Noorullah <shaiknooru247@gmail.com>"
created: 2026-06-17
last_updated: 2026-06-17
consumes: "SPEC-OPSBENCH-001 Part 0 §2 (C3), Part 1 §1 (ApprovalObject); PRD GOV-004, GOV-005, GOV-003, ESC-*, NF-005, DP-3"
---

# Component Design: C3 — Approval Service

C3 owns the **ApprovalObject** — per the research, "the product." It is the human-in-the-loop
gate the gatekeeper (C2) blocks on whenever an action's tier requires sign-off. The object is a
hash-pinned, TTL-bounded, append-only record of who was asked, what they saw, and what they
decided — rendered identically across every surface (Slack, web, TUI, mobile, voice DTMF).

- Requirements: PRD `GOV-004` (payload-hash invariant), `GOV-005` (cross-surface approval),
  `GOV-003` (dry-run reference), `NF-005` (fail-closed), `DP-3` (evidence or it didn't happen).
- Depends on: C5 audit ledger (every transition is recorded); C7 identity (reviewer eligibility /
  group membership — stubbed in v0.1). Consumed by: C2 gatekeeper, C15 surfaces, C11 escalation.

## 1. The object and its two faces

C3 presents two faces over one `ApprovalObject`:

1. **The gate (what C2 calls).** `Request(action)` get-or-creates a pending approval keyed by the
   action ref and **blocks** until the object reaches a terminal state or its TTL expires, then
   returns the outcome `{state, approved, by, payload_hash_seen}`. Blocking matches C2's
   synchronous flow; the action ref is the idempotency key, so a retried `Request` rejoins the
   existing object rather than minting a second one.
2. **The decision intake (what surfaces call).** `Decide(approval_id, decision, by, surface,
   payload_hash_seen)` records one human decision and advances the state machine. Decisions arrive
   asynchronously from whichever surface the reviewer used.

## 2. State machine (normative — spec 01-schemas §1)

```text
pending ──approve (quorum met)──► approved ──(C2: revalidate hash+freeze)──► executing ──► executed
   │  │                              │                                          │
   │  └─reject──► rejected           └─hash_seen ≠ payload_hash──► invalidated   └─exec fail──► failed
   └─ttl──► expired ──► (re-proposal mints a new object + new idempotency_key)
```

`pending` is the only state that accepts decisions. `approved`/`rejected`/`invalidated`/`expired`
are terminal for C3; `executing`/`executed`/`failed` are driven by C2 *after* approval (C3 records
the transition C2 reports). A decision on an already-decided object is a **no-op that returns the
existing outcome** (idempotent).

## 3. Invariants

- **GOV-004 (hash pinning).** Each decision attests `payload_hash_seen`. If it differs from the
  object's pinned `payload_hash`, the object goes straight to `invalidated` — the approver did not
  see what would execute, so the approval is void. The executed payload is therefore byte-identical
  to what every approver saw.
- **Tier → quorum.** tier 0 auto-read (no object) · tier 1 notify · tier 2 single approval ·
  tier 3 two-person. Tier 3 sets `reviewers.required = 2` and `second_must_differ = true`: the two
  approvals **must come from two distinct authenticated identities**. A second approval from the
  same identity does not advance quorum.
- **Eligibility.** A decision counts only if `by` is eligible (an explicit `usr_` in
  `reviewers.eligible`, or a member of an eligible `grp_`). Group-membership resolution is C7's job;
  v0.1 ships a pluggable `MembershipChecker` that defaults to deny-on-group and is satisfied only by
  exact `usr_` matches in tests.
- **TTL.** `expires_at` is set per tier at creation (tier ≤ 2 → 24h, tier 3 → 72h by default).
  Expiry transitions `pending → expired`; it **never auto-executes**. Re-proposal mints a fresh
  object with a new `idempotency_key`.
- **Append-only.** `decisions[]` is never mutated — even a rejected-with-edits or a hash-mismatch is
  appended, then the state changes.
- **Evidence (DP-3).** Every transition emits a ledger record before the outcome is returned; a
  ledger-write failure fails the transition closed (NF-005).

## 4. v0.1 scope and deferrals

**In v0.1 (this build):** the full single-object lifecycle — create, the GOV-004 hash gate, tier
quorum incl. the tier-3 two-distinct-identity rule, eligibility (usr_ exact + pluggable group
checker), TTL/expiry, idempotent re-decision, append-only decision log, the blocking `Request`
gate, an in-memory `Store`, and **real C5 ledger integration** (a transition lands on the
tamper-evident chain and verifies). C2 is wired to the real C3 service via an adapter, replacing the
in-memory fake, proving the **C2 → C3 → C5** spine end-to-end.

**Deferred (seams left in place):** durable Postgres `Store` (interface mirrors C5's); C7 identity
for real group/role resolution and reviewer authentication; C15 surface rendering + C11 escalation
laddering (re-notify, reassign, page) on approaching TTL; `rejected_with_edits` re-proposal flow;
CanonicalEvent emission on the C6 stream (the ledger record is the v0.1 evidence).

## 5. Fail-closed matrix (NF-005)

| Failure | Behavior |
|---|---|
| Ledger cannot record a transition | Transition fails; object stays in its prior state (DP-3) |
| Decision by an ineligible identity | Rejected as not-eligible; no state change, no quorum credit |
| `payload_hash_seen` ≠ pinned hash | Object → `invalidated`; never approvable |
| Decision on a terminal object | No-op; returns the existing outcome (idempotent) |
| TTL elapses while pending | Object → `expired`; `Request` returns not-approved |
| Tier-3 second approval from same identity | Ignored for quorum; stays `pending` |
