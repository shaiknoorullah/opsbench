# Team: incident-response

> Forensic-grade Kubernetes / SRE incident response grounded in NIST SP 800-86 and NIST SP 800-61r2.

Source: [`packages/team-incident-response/`](../../../packages/team-incident-response/)

Full team docs live alongside the package — see [packages/team-incident-response/README.md](../../../packages/team-incident-response/README.md). This page is the doc-site landing page that links into it.

## At a glance

- **11** chained skills
- **33** specialized subagents organized into 8 sub-teams
- **9** JSON schemas
- **2** Cedar policies
- **4** hook scripts
- **17** MCP recipes

## When to use it

You're operating a production cluster (or fleet of clusters) and one of the following is happening:

- EIO / ext4 journal abort / JBD2 D-state cascade
- Longhorn `FailedRebuilding` or volume corruption
- Postgres or ClickHouse on-disk corruption
- An incident where the *cause* is unclear and the team is being pulled into "let's just restart it" debates

## Skills (chained)

| Skill | Purpose |
| ----- | ------- |
| `storage-incident-response` | Master orchestrator |
| `incident-timeline` | Append-only chronology |
| `incident-quarantine` | Workload isolation |
| `evidence-source-discovery` | 9-layer source enumeration |
| `evidence-collection-orchestrator` | Parallel collector dispatch |
| `evidence-cataloger` | SHA-256 sealing |
| `evidence-analyze` | Verdict-blind round analysis |
| `evidence-request` | Loop trigger with governors |
| `forensic-synthesis` | NIST 800-86 narrative |
| `parallel-hypothesis-debug` | One subagent per hypothesis |
| `post-incident-artifact-generator` | NIST 4-doc suite |

See [the team package README](../../../packages/team-incident-response/README.md) for the full subagent inventory and design principles.
