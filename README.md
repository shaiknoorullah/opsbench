# Kubernetes Incident Response Skills

> **v2.0** — DAG-of-DAGs multi-agent architecture: **11 chained skills** + **33 specialized subagents** across **8 teams** + JSON Schema enforcement + Cedar policy gating + per-subagent tool/MCP scoping + 4 hook scripts + 13 MCP install recipes.
>
> Looking for the simpler v1? See the [`v1.0`](https://github.com/shaiknoorullah/k8s-incident-response-skills/tree/v1.0) tag — same incident response philosophy, flat skill chain, no specialized agents.

A complete, evidence-driven, multi-agent incident response framework for Claude Code — for K8s / SRE / DevOps / infrastructure operators who need their AI assistant to behave like a real forensic investigator instead of guessing.

Built and battle-tested against a real production incident: a Longhorn-backed PostgreSQL/ClickHouse cluster on OVH + Contabo, hit by ext4 journal abort + JBD2 D-state cascade. Resolved via the chain documented here.

## Why this exists

Most AI-assisted infrastructure debugging falls into the same traps:

- **"Probable" root cause.** Surface-level pattern matching that picks a winner before evidence is complete.
- **Single-agent megaprompt.** One agent investigating "the storage issue" — wanders, gets biased, produces shallow work.
- **No quarantine.** New writes contaminate the evidence while you're still trying to understand it.
- **No chain of custody.** Claims have no traceable backing files.
- **No iteration discipline.** Either gives up after the first pass or loops forever.
- **No tool gating.** Every agent can do everything — least-privilege violated.
- **No schema/tone enforcement.** Artifacts are inconsistent; "probable" leaks into RCAs.
- **No post-incident artifacts.** No RCA, no SLA breach report, no customer comm.

v2 fixes all of that with a DAG-of-DAGs of specialized agents — each with a single goal, scoped tool/MCP access, schema-validated output, and tone-reviewed for the forbidden words.

## Architecture: DAG-of-DAGs

The outer DAG is **8 teams**. Each team contains an inner DAG of **specialized subagents** (33 total). Every subagent has narrow tools, narrow MCP access, and schema-validated output. Cedar policy gates every mutation via PreToolUse hook.

```
Phase 0:   Team 1 — Command           (incident-commander, timeline-keeper, quarantine-coordinator)
Phase 1:   Team 1 (quarantine-coordinator)
Phase 2:   Team 2 — Evidence Collection (evidence-source-discoverer)
Phase 3.N: Team 2 (7 parallel collectors)
Phase 4.N: Team 3 — Cataloging          (evidence-cataloger, evidence-witness)
Phase 5.N: Team 4 — Analysis             (hypothesis-generator → 4 parallel investigators → forensic-synthesizer)
           Team 5 — Enforcement gates every artifact (schema → tone → citation → redaction)
           Team 8 — Loop Control          (verdict-arbiter, evidence-requester, human-escalation)
Phase 6:   Team 7 — Recovery             (planner → human gate → executor with Cedar gating → verifier)
Phase 7:   Team 6 — Authoring            (5 parallel authors: incident-report, RCA, mitigations, investigation, customer-comms)
```

### Parallelism — typical incident wall-time

- 7-way parallel evidence collection (Phase 3)
- 4-way parallel hypothesis investigation (Phase 5)
- 5-way parallel artifact authoring (Phase 7)
- **~30 min total vs ~2h sequential**

## The 33 subagents

### Team 1 — Command / coordination (3)
- `incident-commander` — Outer-DAG orchestrator; never mutates
- `timeline-keeper` — Append-only UTC timeline with sha256 evidence
- `quarantine-coordinator` — Phase 1 isolation (scale clients, delete agg Service, default-deny NetPol)

### Team 2 — Evidence collection (7)
- `evidence-source-discoverer` — read-only inventory; emits collection-plan.yaml
- `controlplane-collector` — etcd, kube-apiserver audit
- `node-collector` — dmesg, journalctl, /proc, smartctl per node
- `observability-collector` — Prometheus TSDB, Loki LogQL, Tempo traces
- `storage-collector` — Longhorn engine/replica, volume CRDs, ceph-mgr
- `network-collector` — Calico/Cilium, NetworkPolicy, WireGuard, tcpdump
- `app-layer-collector` — pg_stat_*, ClickHouse system.*

### Team 3 — Cataloging / chain of custody (2)
- `evidence-cataloger` — SHA-256 manifest + custody.log per NIST SP 800-86
- `evidence-witness` — independent git witness + RFC 3161 timestamp

### Team 4 — Analysis / hypothesis (6)
- `hypothesis-generator` — emits 3-5 ranked hypotheses with CONFIRM/FALSIFY
- `hypothesis-storage` — storage-layer investigator
- `hypothesis-network` — network-layer investigator
- `hypothesis-control-plane` — etcd/apiserver investigator
- `hypothesis-app` — Postgres/ClickHouse/Patroni/Keeper investigator
- `forensic-synthesizer` — single NIST 800-86 narrative per round

### Team 5 — Schema + tone enforcement (4)
- `schema-validator` — Pydantic + JSON Schema against committed schemas
- `tone-reviewer` — Constitutional review (forbids "probable", emojis, etc.)
- `evidence-citation-checker` — verifies sha256 + file ref resolves in catalog
- `redaction-checker` — PII / secrets / internal hostnames scanner

### Team 6 — Authoring (post-incident suite) (5)
- `incident-report-author` — NIST SP 800-61r2 cover
- `rca-author` — 5-Whys + Apollo cause-effect
- `mitigations-author` — CAPA action plan
- `investigation-report-author` — NIST SP 800-86 methodology
- `customer-comms-author` — plain English customer + internal Slack

### Team 7 — Recovery (3)
- `recovery-planner` — drafts plan; requires human approval
- `recovery-executor` — runs approved plan with Cedar gating every mutation
- `recovery-verifier` — SLO / replication / backup health post-recovery

### Team 8 — Loop control (3)
- `verdict-arbiter` — verdict-blind per round: CONFIRMED / NEED_MORE / INCONCLUSIVE
- `evidence-requester` — round-(N+1) request with per-artifact justification
- `human-escalation` — opens PagerDuty + Slack + Linear; awaits decision

## The 11 chained skills (carries forward from v1)

| Skill | Purpose |
|---|---|
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

## Installation

### Full v2 install

```bash
git clone https://github.com/shaiknoorullah/k8s-incident-response-skills.git
cd k8s-incident-response-skills

# Install skills (v1 carry-over)
mkdir -p ~/.claude/skills
cp -r skills/* ~/.claude/skills/

# Install team-skills (v2)
cp teams/*.md ~/.claude/skills/  # team skills are also Claude skills

# Install subagents (v2)
mkdir -p ~/.claude/agents
cp -r agents/team-*/*.md ~/.claude/agents/

# Install schemas
mkdir -p ~/.claude/schemas
cp schemas/*.json ~/.claude/schemas/

# Install Cedar policies
mkdir -p ~/.claude/policies
cp policies/*.cedar ~/.claude/policies/
cp policies/constitution.md ~/.claude/policies/

# Install hooks (review hooks/*.sh first; then add to ~/.claude/settings.json — see hooks/README.md)
cp hooks/*.sh ~/.claude/hooks/
# Then patch settings.json per hooks/README.md
```

### MCP servers (recommended)

See `mcp-recipes/` for install instructions for each. Recommended baseline:

```bash
# Install per recipe in mcp-recipes/
# Then patch ~/.claude/settings.json under mcpServers
```

### v1-only install (no agents/teams/schemas)

```bash
git clone -b v1.0 https://github.com/shaiknoorullah/k8s-incident-response-skills.git
mkdir -p ~/.claude/skills
cp -r k8s-incident-response-skills/skills/* ~/.claude/skills/
```

## Quick start

For any storage / EIO / data-corruption signal:

```
/storage-incident-response
```

This invokes the master skill, which now dispatches the Team-1 `incident-commander` agent, which orchestrates the full 8-team DAG.

## Design principles

These are the rules baked into the chain. They come from real-world forensic methodology — not internet folklore.

1. **No recovery before forensic synthesis returns CONFIRMED.** Recovery on a wrong root cause compounds the damage.
2. **Evidence has chain of custody.** SHA-256 only. MD5 and SHA-1 are NIST-deprecated for forensic use.
3. **Verdict-blind per round.** Anti-confirmation-bias.
4. **One hypothesis per agent.** Parallel investigation with explicit CONFIRM/FALSIFY upfront.
5. **Falsification quota.** Every round must include ≥1 falsification artifact.
6. **Human approval at every round boundary.** No autonomous round 2+.
7. **Loop governors are hard caps.** Max 5 rounds. Decreasing artifact budget. 24h wall-clock.
8. **The word "probable" is forbidden** in forensic reports without explicit user permission.
9. **Timeline is mandatory at every action.** No silent operations during an incident.
10. **Schema-validated artifacts.** Every output validates against committed JSON Schema.
11. **Tone-enforced artifacts.** Forbidden words denied at write time via tone-reviewer + PostToolUse hook.
12. **Cedar-policy gated mutations.** No agent mutates without explicit per-action allow.
13. **Per-subagent least privilege.** Each agent's tools/MCPs are an allowlist, not "give everything."

## Standards and citations

The framework is grounded in:

- **NIST SP 800-86** — Forensic Techniques for Incident Response (SHA-256 mandate, chain of custody)
- **NIST SP 800-61r2** — Computer Security Incident Handling Guide (report structure)
- **ISO/IEC 27037** — Digital evidence handling
- **NTSB party-process** — multi-party iterative investigation (round-N+1 model)
- **MITRE ATT&CK** — pivot-from-indicator flow
- **SANS DFIR** — Tier 1 / Tier 2 / Tier 3 evidence pivoting
- **Anthropic Constitutional AI** — for tone-reviewer self-revision against principles
- **Anthropic published multi-agent patterns** — orchestrator-worker (90.2% better than single-agent)
- **Google SRE Workbook** — blameless post-mortem culture
- **Atlassian Incident Management Handbook** — role definitions

## Tools this framework wraps or composes

- **[`replicatedhq/troubleshoot`](https://troubleshoot.sh)** — K8s + DB evidence collection (used by `storage-collector` + `app-layer-collector`)
- **[`agent-teams:team-debugger`](https://github.com/anthropic/claude-plugins)** — hypothesis subagent pattern
- **[`grafana/mcp-grafana`](https://github.com/grafana/mcp-grafana)** — unified Prometheus + Loki + Elasticsearch MCP
- **[`alexei-led/k8s-mcp-server`](https://github.com/alexei-led/k8s-mcp-server)** — kubectl/helm/argocd MCP
- **[`ClickHouse/mcp-clickhouse`](https://github.com/ClickHouse/mcp-clickhouse)** — ClickHouse MCP (read-only default)
- **[`awslabs/mcp`](https://github.com/awslabs/mcp)** — 60+ AWS MCP servers
- **[Cedar Policy](https://www.cedarpolicy.com/)** — tool gating + governor enforcement

## Repository structure

```
k8s-incident-response-skills/
├── README.md                      ← this file
├── LICENSE                        ← MIT
├── skills/                        ← 11 chained skills (v1 carry-over)
├── teams/                         ← 8 team-orchestration skills (v2)
├── agents/                        ← 33 specialized subagents (v2)
│   ├── team-1-command/            (3)
│   ├── team-2-evidence-collection/ (7)
│   ├── team-3-cataloging/         (2)
│   ├── team-4-analysis/           (6)
│   ├── team-5-enforcement/        (4)
│   ├── team-6-authoring/          (5)
│   ├── team-7-recovery/           (3)
│   └── team-8-loop-control/       (3)
├── schemas/                       ← JSON Schema for every artifact type
├── policies/                      ← Cedar policy + constitution
│   ├── constitution.md
│   ├── cedar/tools.cedar
│   └── cedar/governors.cedar
├── hooks/                         ← PreToolUse / PostToolUse / SessionStart / SubagentStop bash scripts
└── mcp-recipes/                   ← MCP install instructions per server
```

## Version history

- **v2.0** (2026-05-22) — DAG-of-DAGs: 33 subagents, 8 teams, schema/tone enforcement, Cedar gating, MCP integration
- **v1.0** (2026-05-22) — 11 chained skills with iterative loops

## Status

Production-ready. v1.0 used in active incident response on a real K8s cluster (OVH Mumbai + Contabo + on-prem Proxmox + Azure Arc). v2.0 architecture forged from the same incident's re-analysis (which produced [`forensic-report-chi-audit-0-1.md`](https://github.com/shaiknoorullah/k8s-incident-response-skills/blob/main/docs/forensic-report-chi-audit-0-1.md) — to be added).

## Contributing

PRs welcome. Especially valuable:

- Custom MCP wrappers for the gaps (Longhorn, Contabo/OVH, WireGuard, Falco-standalone)
- Additional evidence-source-discoverer probes for EKS / GKE / AKS / OpenShift
- Industry-specific post-incident templates (HIPAA, SOC 2, PCI DSS, FedRAMP)
- Adapters for other agent runtimes (LangChain, Vercel AI SDK, OpenAI Assistants)
- Cedar policy contributions for least-privilege patterns

## License

[MIT](LICENSE) — use it, fork it, ship it.

## Author

[Shaik Noorullah](https://github.com/shaiknoorullah) — built while running production K8s + designing infrastructure for ProficientNow.
