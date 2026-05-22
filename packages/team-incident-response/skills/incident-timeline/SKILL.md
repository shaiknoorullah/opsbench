---
name: incident-timeline
description: Maintain a single canonical, append-only timeline.md per incident — every event with a UTC timestamp, actor, action, and attached evidence file (with sha256). Updated continuously throughout the incident by every other skill in the storage-incident-response chain. The timeline is THE chronological record consumed by forensic-synthesis and post-incident-artifact-generator. Without a complete timeline, post-mortems are storytelling.
---

# Incident Timeline

## When to invoke

- At incident declaration (initialize timeline)
- After EVERY action by any skill in the chain (quarantine action, evidence collection start/end, hypothesis verdict, recovery step, comms sent)
- After observing an incident-relevant event from the live cluster (pod restart, replica failover, alert firing) during the response
- Read-only consumption: by `forensic-synthesis` and `post-incident-artifact-generator`

## The principle

```
EVERY MOVE WE MAKE OR WITNESS GETS ONE LINE WITH EVIDENCE
```

Industry post-mortems fail when the timeline is reconstructed from memory after the fact. This skill enforces real-time chronological logging — append-only, evidence-attached, immutable.

## File location and structure

Single file per incident:

```
<handoff>/<project>/<YYYY-MM-DD>/incident-<id>/timeline.md
```

Format:

```markdown
# Incident Timeline — <incident-id>

**Workload:** <name>
**Started UTC:** <ISO8601>
**Status:** OPEN | RECOVERED | CLOSED
**Incident Commander:** <name>
**Append-only:** YES — never edit prior lines

---

## Timeline entries

### 2026-05-21T12:11:19Z — DETECTED — alert
**Actor:** alertmanager
**Event:** ext4 journal abort on chi-audit-0-1 PVC; FS auto-remounted read-only
**Evidence:**
- `round-0/evidence/cluster-scoped/events.yaml` (sha256=e3b0c44298fc...) — K8s events at incident moment
- `round-0/evidence/nodes/n.cnt.ap-south-1a.s.01/journalctl-kernel.log` (sha256=4f7d2a1b...) — kernel log of EIO storm
**Notes:** Detection delay = 8 min from event time to first response action.

### 2026-05-21T19:42:44Z — RESPONSE_BEGAN — operator
**Actor:** snoorullah (Incident Commander)
**Event:** Declared incident <id>, opened handoff dir, invoked storage-incident-response skill chain
**Evidence:**
- `quarantine-backup/svc-clickhouse-audit.yaml` (sha256=...) — pre-quarantine Service backup

### 2026-05-21T19:42:55Z — QUARANTINE — incident-quarantine skill
**Actor:** claude/incident-quarantine
**Event:** Scaled audit-cdc-service to 0 in pnats namespace
**Evidence:**
- `quarantine-backup/replicas.txt` (sha256=...) — original replica counts
- `quarantine-backup/backup-pnats-audit-deploys.yaml` (sha256=...) — Deployment YAML pre-scale-down

### 2026-05-21T19:42:58Z — QUARANTINE — incident-quarantine skill
**Actor:** claude/incident-quarantine
**Event:** Deleted Service clickhouse-audit in pnats-data namespace
**Evidence:**
- `quarantine-backup/svc-clickhouse-audit.yaml` (sha256=...) — Service YAML pre-deletion

### 2026-05-21T19:43:14Z — QUARANTINE — incident-quarantine skill
**Actor:** claude/incident-quarantine
**Event:** Applied NetworkPolicy chi-audit-quarantine — default-deny ingress except intra-cluster + Keeper
**Evidence:**
- `evidence/networkpolicy/chi-audit-quarantine.yaml` (sha256=...) — NetPol applied

### 2026-05-21T19:50:00Z — DISCOVERY — evidence-source-discovery skill
**Actor:** claude/evidence-source-discovery
**Event:** Enumerated 9 evidence layers; emitted collection-plan.yaml with 184 artifacts across 7 source families
**Evidence:**
- `collection-plan.yaml` (sha256=...) — collection plan

### 2026-05-21T19:55:00Z — COLLECTION_STARTED — evidence-collection-orchestrator round 1
**Actor:** claude/evidence-collection-orchestrator
**Event:** Dispatched 7 parallel collectors per collection-plan; estimated 12min wall-clock
**Evidence:**
- `round-1/request.md` (sha256=null — initial round, no request) 

### 2026-05-21T20:07:00Z — COLLECTION_COMPLETED — round 1
**Actor:** claude/evidence-cataloger
**Event:** Round 1 sealed: 184 artifacts collected, 287 MB total, bundle SHA-256=<hash>. 2 sources flagged UNREACHABLE.
**Evidence:**
- `round-1/manifest.sha256` (sha256=<self>) — round bundle manifest
- `round-1/catalog.md` (sha256=...) — human-readable catalog
- `custody.log` — appended (per-line sha256 inline)

### 2026-05-21T20:08:00Z — ANALYSIS_STARTED — evidence-analyze round 1
**Actor:** claude/evidence-analyze
**Event:** Dispatched 4 parallel hypothesis investigators (H1 quorum, H2 disk, H3 network, H4 CPU)
**Evidence:** none yet — analysis runs against sealed round-1 corpus

### 2026-05-21T20:14:00Z — HYPOTHESIS_VERDICT — H1 falsified
**Actor:** team-debugger(H1)
**Event:** H1 FALSIFIED, confidence HIGH. Engine logs prove l.01 + s.05 were reachable; failure was in-engine.
**Evidence:**
- `round-1/hypotheses/H1-report.md` (sha256=...)
- `round-1/evidence/storage/longhorn/instance-manager-logs/s.01.log:12:11:17Z` — cited in verdict

### 2026-05-21T20:18:00Z — ROUND_VERDICT — evidence-analyze round 1
**Actor:** claude/forensic-synthesis (round 1)
**Event:** Status CONFIRMED. Root cause: l.01 host saturation → Longhorn engine replica-timeout → synthetic SCSI Medium Error.
**Evidence:**
- `round-1/verdict.md` (sha256=...) — full forensic report

### 2026-05-21T20:25:00Z — RECOVERY_BEGAN — Path A
**Actor:** snoorullah
**Event:** Began streaming export of 4.3M audit_logs rows from chi-audit-0-1 → local file
**Evidence:**
- `recovery-log.md:20:25` (sha256=...) — recovery action log

### 2026-05-22T03:14:00Z — RECOVERY_COMPLETED
**Actor:** snoorullah
**Event:** chi-audit-0-1 PVC destroyed and recreated; data restored from streamed export; row count parity confirmed (4,299,739)
**Evidence:**
- `recovery-log.md:03:14` (sha256=...) — recovery completion
- `round-final/post-recovery-row-count.txt` (sha256=...)

### 2026-05-22T03:20:00Z — CLOSED
**Actor:** snoorullah
**Event:** Incident closed. Status RECOVERED. Post-incident artifact generation begins.
**Evidence:**
- `final/rca.md` (sha256=...) — generated by post-incident-artifact-generator
```

## Event categories (use one per entry)

- `DETECTED` — initial detection
- `RESPONSE_BEGAN` — operator/IC engaged
- `QUARANTINE` — isolation action taken
- `DISCOVERY` — evidence sources enumerated
- `COLLECTION_STARTED` / `COLLECTION_COMPLETED` — per round
- `ANALYSIS_STARTED` / `ROUND_VERDICT` — per round
- `HYPOTHESIS_VERDICT` — individual hypothesis return (one entry per H<n>)
- `EVIDENCE_REQUESTED` — new round triggered
- `HUMAN_APPROVAL` — round boundary decision
- `RECOVERY_BEGAN` / `RECOVERY_STEP` / `RECOVERY_COMPLETED`
- `COMMS_SENT` — customer comm, statuspage update, internal Slack
- `EXTERNAL_EVENT` — something observed in the live cluster during the incident (replica failover, alert firing, secondary failure)
- `ROLE_ASSIGNED` — incident commander, scribe, SME identified
- `SLA_BREACH` — SLO error budget burned past threshold
- `CLOSED` — incident closed

## How to append (concrete commands)

Every skill in the chain calls:

```bash
TIMELINE=<handoff>/<incident-id>/timeline.md
cat >> $TIMELINE <<EOF

### $(date -u +%Y-%m-%dT%H:%M:%SZ) — <CATEGORY> — <skill-name>
**Actor:** <who/what>
**Event:** <one sentence>
**Evidence:**
- \`<relative-path-to-evidence>\` (sha256=$(sha256sum <evidence-file> | awk '{print $1}'))
**Notes:** <optional>
EOF
```

Or for events without a file artifact (e.g., a verbal decision), evidence can be `none` BUT must include who decided and the supporting context.

## Hard rules

- **Append-only.** Never edit prior entries. To correct a prior entry, append a `CORRECTION` entry referencing the line being corrected.
- **UTC ISO8601 only.** Never local time. `date -u +%Y-%m-%dT%H:%M:%SZ` is the canonical command.
- **Every entry has an Actor.** Even if it's "operator" or "alertmanager" or "cluster".
- **Every entry has Evidence.** Either a sha256-cited file or an explicit `Evidence: none — verbal decision by <name>`.
- **Categories are the closed set above.** New categories require updating this skill.
- **Don't redact in real time.** Capture original, redact for the leadership/customer artifacts later. The timeline itself stays raw.
- **Timestamps are observation times, not event times.** If you discover at 23:00 that an event happened at 17:41, append at 23:00 with notes referring to the 17:41 event time.

## Wire-up

Every other phase skill MUST emit timeline entries on every action:

- `incident-quarantine` → entry per scale, delete, NetworkPolicy
- `evidence-source-discovery` → entry per discovered source family
- `evidence-collection-orchestrator` → entries on start, on each collector start/finish, on completion
- `evidence-cataloger` → entry per round sealed
- `evidence-analyze` → entry per hypothesis verdict + entry for round verdict
- `evidence-request` → entry per round request submitted + per human approval/denial
- `forensic-synthesis` → entry for synthesis report sealed
- `post-incident-artifact-generator` → entries per generated document

## Consumption

- `forensic-synthesis` reads the timeline to construct the chronological Section 2 of the forensic report — every timeline entry is a citable evidence point.
- `post-incident-artifact-generator` reads the timeline to construct the NIST 800-61 Incident Report chronology, the NIST 800-86 Investigation Report methodology, and the RCA 5-Whys evidence chain.
- The final bundle's `manifest-final.sha256` includes `timeline.md` itself as a sealed artifact.

## Template

See `templates/timeline-init.md` — a 30-second initialization template invoked at incident declaration.

## Related

- Parent: `storage-incident-response`
- Read by: `forensic-synthesis`, `post-incident-artifact-generator`
- Written by: every skill in the chain
- Standards: NIST SP 800-61r2 chronological requirement, NIST SP 800-86 methodology section
