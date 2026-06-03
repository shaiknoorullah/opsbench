---
name: post-incident-artifact-generator
description: Use after recovery is complete to produce the full post-incident document suite from the round-by-round evidence and verdicts. Calls the existing incident-report-suite skill (NIST 800-61 Incident Report + 5-Whys/Apollo RCA + CAPA Mitigations + NIST 800-86 Investigation) and adds SLA/SLO breach calc, customer-facing comm, internal Slack post, action-items tracker, and people/role attestations. Wires raw evidence files into the report as references with sha256 citations.
---

# Post-Incident Artifact Generator

## When to invoke

- `storage-incident-response` calls this as the final phase, after recovery is complete and verified
- A user asks for "post-mortem", "RCA", "MIR", "leadership write-up", "SLA breach report" for a completed incident
- Need a leadership-facing package from cataloged forensic evidence

## The principle

```
EVERY CLAIM IN THE POST-MORTEM CITES A SHA-256-SEALED EVIDENCE FILE
```

The artifacts produced here are durable. They will be read by leadership, customers, auditors, possibly regulators. Every causal claim must trace back to a cataloged evidence file via its sha256, so anyone challenging the report can verify the chain.

## Documents produced

### 1. Incident Report (NIST SP 800-61r2 cover document)

Header, chronology, impact, response actions. Calls `incident-report-suite` skill for the canonical template.

### 2. RCA (5-Whys + Apollo cause-effect chain)

The why-chain MUST trace back to specific evidence files with sha256 citations.

```markdown
## Why 1: Why did chi-audit-0-1's filesystem go read-only?
Because JBD2 journal aborted at 2026-05-21T12:11:19Z.
Evidence: round-1/evidence/nodes/s.01/journalctl-kernel.log (sha256=4f7d2a1b...)

## Why 2: Why did JBD2 abort?
Because ext4 received EIO on write to inodes 4459778-4459785 from /dev/sdd.
Evidence: same file, lines <range>.

## Why 3: Why did /dev/sdd return EIO?
Because the Longhorn engine returned synthetic SCSI Medium Error sense codes for in-flight WRITE(10) aged 23s (matches --request_timeout).
Evidence: round-1/evidence/storage/longhorn/instance-manager-logs/s.01.log (sha256=...)

## Why 4: Why did the engine return Medium Error?
Because the --engine-replica-timeout 8s expired against l.01's replica r-9837dfce, which was unresponsive.
Evidence: same file, lines <range>.

## Why 5: Why was l.01's replica unresponsive?
Because l.01 host was saturated (load1 56-86) with a stuck jbd2/sdb-8 kernel thread for 19h+ pre-incident.
Evidence: round-1/evidence/observability/prometheus/load1-l.01.json (sha256=...)
```

### 3. Mitigations & Action Plan (CAPA — Corrective and Preventive Action)

| Action | Owner | Due | Status | Tracking issue |
|---|---|---|---|---|
| Increase --engine-replica-timeout 8→30 on longhorn-cnt | <owner> | <date> | open | <link> |
| Add SPOF-per-host audit to Longhorn SC | <owner> | <date> | open | <link> |
| Alert on volume.status.lastDegradedAt > 1h | <owner> | <date> | open | <link> |

### 4. Investigation Report (NIST SP 800-86)

Chronological methodology — quarantine timeline, evidence rounds, hypothesis verdicts, forensic synthesis. Cite each round's bundle sha256.

### 5. SLA/SLO breach report (if applicable)

```markdown
## SLO breach calculation

| SLO | Target | Window | Burn during incident | Status |
|---|---|---|---|---|
| chi-audit availability | 99.9% | 30d | <calc> | <breach? %> |
| chi-audit write success rate | 99.5% | 30d | <calc> | <breach? %> |

## Error budget burn
- Pre-incident error budget remaining: <X>
- Burn during incident: <Y>
- Post-incident remaining: <Z>

## Customer credits owed (if SLA-backed)
- Customer A: <credit amount>
- ...
```

### 6. Customer-facing comm (statuspage post)

Short, plain English, no jargon, no internal hostnames. References public statuspage entry.

### 7. Internal Slack post

```
@here Incident <id> closed.
- Impact: <one-line>
- Root cause: <one-line>
- Recovery: <one-line>
- Follow-up: <link to action items>
- Full RCA: <link>
```

### 8. Action items tracker

Export action items to whatever the team uses (Linear, Jira, GitHub Issues). Each item has an evidence-file citation if applicable.

### 9. People involved (attestation page)

| Role | Person | Activities |
|---|---|---|
| Incident Commander | <name> | Declared incident, coordinated response |
| Subject Matter Expert (storage) | <name> | Analyzed Longhorn engine logs round 1 |
| Subject Matter Expert (network) | <name> | Falsified H3 round 1 |
| Scribe | <name> | Maintained timeline |
| Customer Liaison | <name> | Drafted customer comm |
| Approver | <name> | Approved each evidence-request round boundary |

## Workflow

### Step 1: Verify recovery is actually complete

```bash
test -f <handoff>/<id>/round-<final-N>/verdict.md
grep -q 'status: CONFIRMED' <handoff>/<id>/round-<final-N>/verdict.md || { echo "No CONFIRMED verdict; cannot generate post-incident artifacts."; exit 1; }
# Also confirm recovery step happened (e.g., write a recovery.md after recovery)
```

### Step 2: Gather metadata

Collect from operator (or pre-populated YAML):

- Incident severity / priority
- Customer-facing impact
- Detected by (alert? customer report? proactive?)
- Status page entry URL (if any)
- People in each role
- Affected SLOs

### Step 3: Call existing `incident-report-suite`

Pass the metadata + cataloged evidence directories. That skill produces the 4 NIST-standard HTML/PDF documents.

### Step 4: Generate the extras (SLA, comms, action items, attestation)

These are NOT covered by `incident-report-suite` — they're added here.

### Step 5: Compute and seal final bundle

```bash
FINAL_DIR=<handoff>/<id>/final
mkdir -p $FINAL_DIR
# Place all generated artifacts
# Recompute manifest including all rounds + final
find <handoff>/<id> -type f ! -name 'manifest.sha256' ! -name 'custody.log' -print0 \
  | xargs -0 sha256sum > $FINAL_DIR/manifest-final.sha256
sort $FINAL_DIR/manifest-final.sha256 | sha256sum | awk '{print $1}' > $FINAL_DIR/bundle-final.sha256.txt
```

### Step 6: Distribute

- Internal copy: this repo's `docs/incidents/<YYYY-MM-DD>-<workload>/` (per existing project convention)
- Leadership PDF: render via existing `html-to-pdf` skill
- Memory rule: write a feedback memory entry summarizing the pattern, link to `[[INC-<id>]]`

## Hard rules

- **No claim without a sha256 citation** for the evidence backing it.
- **No SLA breach calculation without explicit operator-provided SLO targets.** Don't guess.
- **Customer-facing comm must not contain internal hostnames, internal IPs, or engineer names.**
- **Attestation page lists people who actually did the work** — not aspirational owners.
- **Do not generate this skill's outputs if the incident is still open** (no CONFIRMED verdict yet).
- **Action items must link to a real tracker** (Linear/Jira/GitHub Issue), not be free text.

## Related

- Parent: `storage-incident-response` (final phase)
- Reuses: `incident-report-suite` (NIST canonical 4-doc), `html-to-pdf` (PDF rendering)
- Memory: write [[INC-<id>]] entry on completion
