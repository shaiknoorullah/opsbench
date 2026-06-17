# C3 — Approval Service

Owns the **ApprovalObject**: the hash-pinned, TTL-bounded, append-only human-in-the-loop
gate the gatekeeper (C2) blocks on for tiered actions. Design:
[`components/C3-approvals.md`](../../../docs/superpowers/specs/opsbench-platform/components/C3-approvals.md).

## What it enforces

- **GOV-004 (hash pinning).** Each decision attests the `payload_hash_seen`; a mismatch
  drives the object to `invalidated` — never approvable. The executed payload is
  byte-identical to what every approver saw.
- **Tier → quorum.** tier 2 = one approval; tier 3 = two **distinct** authenticated
  identities (`second_must_differ`). A duplicate approval from the same identity does not
  advance quorum.
- **Eligibility.** Exact `usr_` match, or membership in an eligible `grp_` via a pluggable
  `MembershipChecker` (C7 identity in the full system; v0.1 default denies groups).
- **TTL.** Per-tier expiry (24h / 72h). Expiry → `expired`; never auto-executes.
- **Evidence (DP-3).** Every accepted decision and transition is recorded on the C5
  ledger before the outcome is returned; a ledger failure fails the transition closed.

## Two faces over one object

- `Service.Request(ctx, CreateInput)` — the gate C2 blocks on; get-or-create per action
  ref, returns when the object is terminal or its TTL/ctx elapses.
- `Service.Decide(ctx, DecideInput)` — decision intake from any surface; advances the
  state machine; idempotent on an already-decided object.

## Wiring into C2

`gatekeeper.NewApprovalAdapter(c3Service, reviewerResolver)` returns the C2 `ApprovalGate`,
replacing the in-memory fake. `approvals.NewC5Ledger(appender)` records transitions on the
real C5 chain. `TestSpineC2ToC3ToC5` proves the C2 → C3 → C5 path end-to-end with a
verifiable shared chain.

## Test

```sh
cd platform && go test ./services/approvals/... && go test -race ./services/approvals/ ./services/gatekeeper/
```

## v0.1 deferrals

Durable Postgres `Store` (interface mirrors C5's `LedgerStore`); C7 identity for real
reviewer auth + group resolution; C15 surface rendering and C11 escalation laddering on
approaching TTL; `rejected_with_edits` re-proposal; CanonicalEvent emission on C6.
