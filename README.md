# Kubernetes Incident Response Skills

A complete, evidence-driven, multi-agent incident response framework for Claude Code — for K8s / SRE / DevOps / infrastructure operators who need their AI assistant to behave like a real forensic investigator instead of guessing.

Built and battle-tested against a real production incident: a Longhorn-backed PostgreSQL/ClickHouse cluster on OVH + Contabo, hit by ext4 journal abort + JBD2 D-state cascade. Resolved via the chain documented here.

## Why this exists

Most AI-assisted infrastructure debugging falls into the same traps:

- **"Probable" root cause.** Surface-level pattern matching that picks a winner before evidence is complete.
- **Single-agent megaprompt.** One agent investigating "the storage issue" — wanders, gets biased, produces shallow work.
- **No quarantine.** New writes contaminate the evidence while you're still trying to understand it.
- **No chain of custody.** Claims have no traceable backing files.
- **No iteration discipline.** Either gives up after the first pass or loops forever.
- **No post-incident artifacts.** No RCA, no SLA breach report, no customer comm.

This framework fixes all of that.

## The chain

```
Phase 0:   incident-timeline                     ← append-only canonical chronology with sha256 evidence
Phase 1:   incident-quarantine                   ← stop bleeding (scale clients to 0, delete agg Service, default-deny NetPol)
Phase 2:   evidence-source-discovery             ← enumerate 9 evidence layers → collection-plan.yaml
Phase 3.N: evidence-collection-orchestrator      ← parallel collectors per source family (wraps replicatedhq/troubleshoot.sh)
Phase 4.N: evidence-cataloger                    ← SHA-256 manifest + custody.log (NIST SP 800-86 compliant)
Phase 5.N: evidence-analyze                      ← verdict-blind parallel-hypothesis-debug + forensic-synthesis
           ├ CONFIRMED          → Phase 6
           ├ NEED-MORE-EVIDENCE → evidence-request (human approval) → Phase 3 with N+1
           └ INCONCLUSIVE       → escalate human
Phase 6:   recovery (user-led)
Phase 7:   post-incident-artifact-generator      ← NIST 4-doc suite + SLA breach + comms + attestation
```

Iterative loops are first-class — up to 5 rounds, with decreasing artifact budgets, mandatory falsification per round, and human approval at every round boundary.

## The skills

| Skill | Purpose |
|---|---|
| [`storage-incident-response`](skills/storage-incident-response/SKILL.md) | Master orchestrator. Runs the full chain in strict order. |
| [`incident-timeline`](skills/incident-timeline/SKILL.md) | Append-only canonical chronology. Every action, every actor, every evidence file with sha256. |
| [`incident-quarantine`](skills/incident-quarantine/SKILL.md) | Isolate the workload before any analysis. Scales writers/readers, deletes aggregate Service, applies default-deny NetworkPolicy. Backs up state to handoff dir. |
| [`evidence-source-discovery`](skills/evidence-source-discovery/SKILL.md) | Read-only enumeration of every evidence source across 9 layers (K8s control plane, observability, nodes, storage, network, app-layer, security, platform). Emits `collection-plan.yaml`. |
| [`evidence-collection-orchestrator`](skills/evidence-collection-orchestrator/SKILL.md) | Dispatches one parallel collector per source family. Wraps [`replicatedhq/troubleshoot`](https://troubleshoot.sh) for K8s+DB; adds native collectors for node-level / CNI-specific / observability snapshots. |
| [`evidence-cataloger`](skills/evidence-cataloger/SKILL.md) | Computes SHA-256 (NIST SP 800-86 — MD5/SHA-1 forbidden) for every artifact. Writes `manifest.sha256`, `custody.log`, `catalog.md`. Optional RFC 3161 timestamping. |
| [`evidence-analyze`](skills/evidence-analyze/SKILL.md) | Verdict-blind per round (anti-confirmation-bias). Verifies bundle hash. Dispatches parallel hypothesis investigators against sealed evidence files. Emits round verdict. |
| [`evidence-request`](skills/evidence-request/SKILL.md) | Loop trigger when more evidence is needed. Enforces governors: max 5 rounds, decreasing budget, falsification quota, mandatory human approval at every round boundary. |
| [`forensic-synthesis`](skills/forensic-synthesis/SKILL.md) | NIST SP 800-86-style report. Forbids the word "probable". Names a root cause only when a hypothesis hit HIGH/CONFIRMED. INCONCLUSIVE is a valid output. |
| [`parallel-hypothesis-debug`](skills/parallel-hypothesis-debug/SKILL.md) | One subagent per hypothesis. CONFIRM/FALSIFY criteria upfront. FOR/AGAINST evidence with HIGH/MEDIUM/LOW confidence. |
| [`post-incident-artifact-generator`](skills/post-incident-artifact-generator/SKILL.md) | Generates NIST 4-doc suite (Incident Report, RCA, Mitigations, Investigation) + SLA breach calc + customer comm + internal Slack post + action items + attestation. Every claim cites a sha256-sealed file. |

## Installation

### Claude Code

Skills live in `~/.claude/skills/`. To install:

```bash
git clone https://github.com/shaiknoorullah/k8s-incident-response-skills.git
mkdir -p ~/.claude/skills
cp -r k8s-incident-response-skills/skills/* ~/.claude/skills/
```

Then in any Claude Code session, invoke:

```
/storage-incident-response
```

…to enter the master chain. Or invoke any individual skill by name (`/incident-quarantine`, `/evidence-source-discovery`, etc.).

### Claude API / Agent SDK

The skill files (`SKILL.md`) are plain markdown with YAML frontmatter. They can be loaded into any agent runtime by reading the frontmatter (`name`, `description`) for capability registration and the body as the prompt context when the skill is invoked.

## Design principles

These are the rules baked into the chain. They come from real-world forensic methodology — not internet folklore.

1. **No recovery before forensic synthesis returns CONFIRMED.** Recovery on a wrong root cause compounds the damage. (See [`INC-2026-05-14-001`](https://github.com/shaiknoorullah/k8s-incident-response-skills/issues/1) — pg-tenant Longhorn EIO incident this framework was forged in response to.)

2. **Evidence has chain of custody.** SHA-256 only. MD5 and SHA-1 are NIST-deprecated for forensic use. Every claim in the post-mortem cites a sealed file.

3. **Verdict-blind per round.** Anti-confirmation-bias. Each round re-evaluates from the sealed evidence corpus of THAT round, not from prior verdicts. Prior verdicts inform FALSIFICATION ATTEMPTS only.

4. **One hypothesis per agent.** Parallel investigation. CONFIRM and FALSIFY criteria stated upfront. Each agent reports FOR and AGAINST evidence. The orchestrator (you) synthesizes only after ALL reports return.

5. **Falsification quota.** Every round must include ≥1 falsification artifact. Without it, the loop becomes a yes-machine for the leading hypothesis.

6. **Human approval at every round boundary.** No autonomous round 2+. Stops rabbit-hole loops.

7. **Loop governors are hard caps.** Max 5 rounds. Decreasing artifact budget per round (round-2 ≤50, round-3 ≤25, round-4 ≤12, round-5 ≤6). Wall-clock budget 24h cumulative.

8. **The word "probable" is forbidden in forensic reports** without explicit user permission. Use CONFIRMED, LIKELY, UNLIKELY, FALSIFIED, INCONCLUSIVE.

9. **Timeline is mandatory at every action.** No silent operations during an incident. Every move you or any subagent makes appends one entry with UTC timestamp, actor, action, and sha256 evidence.

## Standards and citations

The framework is grounded in:

- **NIST SP 800-86** — Forensic Techniques for Incident Response. SHA-256 hashing, chain of custody, evidence handling.
- **NIST SP 800-61r2** — Computer Security Incident Handling Guide. Incident report structure, chronological discipline.
- **ISO/IEC 27037** — Guidelines for digital evidence identification, collection, acquisition, preservation.
- **NTSB party-process** — multi-party iterative investigation methodology. Why each round produces its own report.
- **MITRE ATT&CK** — pivot-from-indicator investigation flow.
- **SANS DFIR** — Tier 1 / Tier 2 / Tier 3 evidence pivoting.
- **Google SRE Workbook** — blameless post-mortem culture, action item discipline.
- **Atlassian Incident Management Handbook** — role definitions (IC, Scribe, Comms Lead, SME, Customer Liaison).
- **PagerDuty Incident Response** — severity tiers, communication patterns.
- **Stripe / Cloudflare / Shopify published post-mortems** — real-world iterative loop examples.

Plus 40+ additional sources documented in the design-research bundle.

## Tools this framework wraps or composes

- **[`replicatedhq/troubleshoot`](https://troubleshoot.sh)** (`troubleshoot.sh`) — CRD-driven K8s + DB evidence collection. Used by `evidence-collection-orchestrator` for the K8s+DB layer.
- **[`agent-teams:team-debugger`](https://github.com/anthropic/claude-plugins)** (Claude plugin) — used by `parallel-hypothesis-debug` for hypothesis-per-subagent dispatch.
- **`incident-report-suite`** (separate skill, not in this repo) — produces the NIST 4-document suite. `post-incident-artifact-generator` calls it.
- **`html-to-pdf`** (separate skill) — renders leadership PDFs.

## Provenance / The incident this came from

This framework was forged during the response to a production storage incident on a Longhorn-backed K8s cluster:

- **2026-05-21 12:11:19 UTC** — chi-audit-0-1 PVC ext4 journal abort + JBD2 D-state cascade
- 4 parallel hypotheses dispatched (quorum loss, local disk, network, CPU saturation)
- 3 falsified with HIGH confidence; the 4th's stated form falsified but converged with H1+H3 on the real root cause
- **Confirmed root cause:** l.01 host saturation propagated through Longhorn's `--engine-replica-timeout 8s` discipline as a kernel-visible SCSI Medium Error → ext4 EIO → JBD2 abort → forced RO mount
- INC-2026-05-14-001 pattern recurrence

The user (an operator) said: "I don't want probable. I need a full analysis, forensic report, investigation report with proper diagnosis and evidence." That sentence became the design constraint.

## Status

Production-ready. Used in active incident response on a real K8s cluster (OVH Mumbai + Contabo + on-prem Proxmox + Azure Arc). Iterating as new patterns emerge.

## Contributing

PRs welcome. Especially valuable:

- Additional evidence-source-discovery probes for cluster types not covered (EKS, GKE, AKS, OpenShift have different surface area)
- Vendor-specific collectors (Ceph, Portworx, OpenEBS — beyond Longhorn)
- Post-incident artifact templates for industries with regulatory requirements (HIPAA, SOC 2, PCI DSS)
- Translations to other agent runtimes (LangChain agents, Vercel AI SDK, OpenAI Assistants)

## License

[MIT](LICENSE) — use it, fork it, ship it. Attribution appreciated but not required.

## Author

[Shaik Noorullah](https://github.com/shaiknoorullah) — built while running production K8s + designing infrastructure for ProficientNow.
