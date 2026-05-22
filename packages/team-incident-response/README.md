# team-incident-response

> The bootstrap team of opsbench — a forensic-grade Kubernetes / SRE incident-response workflow grounded in NIST SP 800-86 and NIST SP 800-61r2.

This package was formerly the entire `k8s-incident-response-skills` repository (v1.0 and v2.0). It ships unchanged in content under opsbench v3.x — only the path layout moved.

## What's here

| Resource | Count | Path |
| -------- | ----- | ---- |
| Skills (chained)         | 11 | [`skills/`](skills/) |
| Subagents (8 sub-teams)  | 33 | [`agents/`](agents/) |
| Team orchestration docs  | 8  | [`teams/`](teams/) |
| JSON Schemas             | 9  | [`schemas/`](schemas/) |
| Cedar policies           | 2  | [`policies/`](policies/) |
| Hook scripts             | 4  | [`hooks/`](hooks/) |
| MCP recipes              | 17 | [`mcp-recipes/`](mcp-recipes/) |

## Architecture

A DAG-of-DAGs. The outer DAG is the 8 sub-teams; each sub-team contains an inner DAG of specialized subagents.

```
Phase 0:   Team 1 — Command           (incident-commander, timeline-keeper, quarantine-coordinator)
Phase 1:   Team 1 (quarantine-coordinator)
Phase 2:   Team 2 — Evidence Collection (evidence-source-discoverer)
Phase 3.N: Team 2 (7 parallel collectors)
Phase 4.N: Team 3 — Cataloging          (evidence-cataloger, evidence-witness)
Phase 5.N: Team 4 — Analysis             (hypothesis-generator -> 4 parallel investigators -> forensic-synthesizer)
           Team 5 — Enforcement gates every artifact (schema -> tone -> citation -> redaction)
           Team 8 — Loop Control          (verdict-arbiter, evidence-requester, human-escalation)
Phase 6:   Team 7 — Recovery             (planner -> human gate -> executor with Cedar gating -> verifier)
Phase 7:   Team 6 — Authoring            (5 parallel authors: incident-report, RCA, mitigations, investigation, customer-comms)
```

## The 33 subagents

### Sub-team 1 — Command / coordination (3)

- `incident-commander` — outer-DAG orchestrator; never mutates
- `timeline-keeper` — append-only UTC timeline with sha256 evidence
- `quarantine-coordinator` — Phase 1 isolation

### Sub-team 2 — Evidence collection (7)

- `evidence-source-discoverer`
- `controlplane-collector`, `node-collector`, `observability-collector`,
  `storage-collector`, `network-collector`, `app-layer-collector`

### Sub-team 3 — Cataloging / chain of custody (2)

- `evidence-cataloger` — SHA-256 manifest + custody.log per NIST SP 800-86
- `evidence-witness` — independent git witness + RFC 3161 timestamp

### Sub-team 4 — Analysis / hypothesis (6)

- `hypothesis-generator`
- `hypothesis-storage`, `hypothesis-network`, `hypothesis-control-plane`, `hypothesis-app`
- `forensic-synthesizer`

### Sub-team 5 — Schema + tone enforcement (4)

- `schema-validator`, `tone-reviewer`, `evidence-citation-checker`, `redaction-checker`

### Sub-team 6 — Authoring (post-incident suite) (5)

- `incident-report-author` — NIST SP 800-61r2
- `rca-author` — 5-Whys + Apollo cause-effect
- `mitigations-author` — CAPA
- `investigation-report-author` — NIST SP 800-86
- `customer-comms-author`

### Sub-team 7 — Recovery (3)

- `recovery-planner`, `recovery-executor`, `recovery-verifier`

### Sub-team 8 — Loop control (3)

- `verdict-arbiter`, `evidence-requester`, `human-escalation`

## The 11 chained skills

| Skill | Purpose |
| ----- | ------- |
| [`storage-incident-response`](skills/storage-incident-response/SKILL.md) | Master orchestrator |
| [`incident-timeline`](skills/incident-timeline/SKILL.md) | Append-only chronology |
| [`incident-quarantine`](skills/incident-quarantine/SKILL.md) | Workload isolation |
| [`evidence-source-discovery`](skills/evidence-source-discovery/SKILL.md) | 9-layer source enumeration |
| [`evidence-collection-orchestrator`](skills/evidence-collection-orchestrator/SKILL.md) | Parallel collector dispatch |
| [`evidence-cataloger`](skills/evidence-cataloger/SKILL.md) | SHA-256 sealing |
| [`evidence-analyze`](skills/evidence-analyze/SKILL.md) | Verdict-blind round analysis |
| [`evidence-request`](skills/evidence-request/SKILL.md) | Loop trigger with governors |
| [`forensic-synthesis`](skills/forensic-synthesis/SKILL.md) | NIST 800-86 narrative |
| [`parallel-hypothesis-debug`](skills/parallel-hypothesis-debug/SKILL.md) | One subagent per hypothesis |
| [`post-incident-artifact-generator`](skills/post-incident-artifact-generator/SKILL.md) | NIST 4-doc suite |

## Design principles

Baked into the chain, from real-world forensic methodology:

1. **No recovery before forensic synthesis returns CONFIRMED.**
2. **Evidence has chain of custody.** SHA-256 only (MD5/SHA-1 are NIST-deprecated for forensic use).
3. **Verdict-blind per round.** Anti-confirmation-bias.
4. **One hypothesis per agent.** Parallel investigation with explicit CONFIRM/FALSIFY upfront.
5. **Falsification quota.** Every round must include >=1 falsification artifact.
6. **Human approval at every round boundary.** No autonomous round 2+.
7. **Loop governors are hard caps.** Max 5 rounds. Decreasing artifact budget. 24h wall-clock.
8. **The word "probable" is forbidden** in forensic reports without explicit user permission.
9. **Timeline is mandatory at every action.** No silent operations during an incident.
10. **Schema-validated artifacts.** Every output validates against committed JSON Schema.
11. **Tone-enforced artifacts.** Forbidden words denied at write time.
12. **Cedar-policy gated mutations.** No agent mutates without explicit per-action allow.
13. **Per-subagent least privilege.** Each agent's tools/MCPs are an allowlist.

## Install

From the opsbench root:

```bash
bash scripts/install.sh --teams team-incident-response
```

Or as part of a full install:

```bash
bash scripts/install.sh
```

## Standards

- **NIST SP 800-86** — Forensic Techniques for Incident Response
- **NIST SP 800-61r2** — Computer Security Incident Handling Guide
- **ISO/IEC 27037** — Digital evidence handling
- **NTSB party-process** — multi-party iterative investigation
- **MITRE ATT&CK**, **SANS DFIR**, **Anthropic Constitutional AI**, **Google SRE Workbook**, **Atlassian Incident Management Handbook**

## License

MIT (inherits from repo root).
