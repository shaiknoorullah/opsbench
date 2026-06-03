---
name: team-6-authoring
description: Post-incident artifact suite — 5 parallel authors produce NIST 800-61r2 Incident Report, 5-Whys RCA, CAPA Mitigations, NIST 800-86 Investigation Report, and customer/internal comms. Each routes through team-5 enforcement before persistence. Invoked only after recovery is verified.
---

# Team 6 — Authoring (post-incident artifact suite)

## Composition

| Subagent | Role | Output |
|---|---|---|
| `incident-report-author` | NIST SP 800-61r2 cover document | `final/incident-report.md` |
| `rca-author` | 5-Whys + Apollo cause-effect chain | `final/rca.md` |
| `mitigations-author` | CAPA Mitigations & Action Plan | `final/mitigations.md` + `final/action-items.md` |
| `investigation-report-author` | NIST SP 800-86 investigation methodology | `final/investigation.md` |
| `customer-comms-author` | Plain-English customer comm + internal Slack post | `final/customer-comm.md` + `final/internal-comm.md` |

## Sequencing (parallel)

```
incident-commander fans out 5 authors IN PARALLEL (Phase 7):
  ├── incident-report-author (reads timeline, all verdicts, recovery-log)
  ├── rca-author (reads verdict-final, cited evidence)
  ├── mitigations-author (reads verdict-final, recovery-plan, recovery-verification)
  ├── investigation-report-author (reads all rounds, all gaps, all governor decisions)
  └── customer-comms-author (reads severity, impact assessment, recovery summary)

Each author's output routes through team-5-enforcement:
  schema-validator → tone-reviewer → evidence-citation-checker → redaction-checker
```

## Inputs

- `<incident_dir>/timeline.md`
- `<incident_dir>/round-*/verdict.md`
- `<incident_dir>/recovery-log.md`
- `<incident_dir>/recovery-verification.md`
- Incident metadata: severity, SLO breach details, customer impact, people involved

## Outputs

All under `<incident_dir>/final/`:

- `incident-report.md`
- `rca.md`
- `mitigations.md`
- `investigation.md`
- `customer-comm.md`
- `internal-comm.md`
- `action-items.md`
- `attestation.md` (people who worked the incident)
- `sla-breach.md` (if applicable)

## Hooks involved

- `PostToolUse` → fires team-5-enforcement on every artifact write
- After all artifacts pass enforcement: optional `html-to-pdf` skill renders leadership PDFs

## Schemas enforced

- Incident Report: `schemas/incident-report.schema.json`
- RCA: `schemas/rca.schema.json`
- Mitigations: `schemas/mitigations.schema.json`
- Investigation: `schemas/investigation-report.schema.json`

## Hard rules

- **DOES NOT RUN until recovery-verifier returns PASS.** Premature post-mortems are storytelling.
- **Every claim cites a sha256-sealed evidence file.** No exception.
- **Customer comm has NO internal hostnames, IPs, or engineer names.** Enforced by redaction-checker.
- **Forbidden words apply.** No "probable" without explicit permission.
- **Action items must link to real tracker URLs** (Linear / Jira / GitHub Issues), not free text.

## Standards referenced

- NIST SP 800-61r2 — Computer Security Incident Handling Guide (incident-report format)
- NIST SP 800-86 — Forensic Techniques (investigation-report format)
- Google SRE Workbook — blameless post-mortem culture
- Atlassian Incident Management Handbook — role taxonomy

## Related

- Previous team: `team-7-recovery` (verifier must PASS)
- Concurrent: `team-5-enforcement` (gates every artifact)
- Wraps: `incident-report-suite` (existing skill providing canonical templates)
- Output rendered by: `html-to-pdf` skill for leadership PDFs
