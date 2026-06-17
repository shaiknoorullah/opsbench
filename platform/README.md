# Opsbench Platform

Implementation of the Opsbench Platform — the governance and orchestration plane for AI operations agents.

- **PRD:** `docs/superpowers/prd/opsbench-platform/` (PRD-OPSBENCH-001 v1.0.0, approved)
- **Technical spec:** `docs/superpowers/specs/opsbench-platform/` (SPEC-OPSBENCH-001 v0.1.0)

This directory is a self-contained set of npm workspaces inside the opsbench monorepo. It does not affect the existing skills/plugins tooling.

## Layout

```
platform/
  packages/
    schemas/        Normative data contracts (JSON Schema 2020-12) + TS types + validator.
                    Source of truth for ApprovalObject, AuditRecord, PolicyDecisionRecord,
                    AutonomyCertificate, memory scope, CanonicalEvent, EscalationLadder,
                    CapabilityEnvelope. See spec Part 1 (01-schemas.md).
  services/         Control-plane services (added during MVP build). See spec Part 0 §4.
  apps/             web (Next.js), api, tui (Rust/Ratatui). Added during MVP build.
  spikes/           Throwaway de-risking spikes (spec Part 2). Promoted to services/ only via review.
    s1-gatekeeper/        Cedar PDP + gateway + chained ledger, latency/embed verdict
    s2-memory-rbac/       agent-memory-server behind a claims->namespace RBAC proxy
    s3-voice-escalation/  ladder -> outbound call -> DTMF ack -> ladder cancel
    s4-eval-replay/        time-travel incident replay with temporal isolation + grading
    s5-capability-schema/  one observability capability schema across 3 backends
```

## Status

Phase: design spikes (spec Part 2, §3 weeks 1–3). Schemas package landed first as the shared
foundation every spike consumes. Each spike owns its own directory and toolchain.
