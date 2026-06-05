# External integrations

Standing inventory of every external project opsbench references — recipe, skill,
custom-spec, vendored, or pure cross-link — with license and integration status.

**Last reviewed:** 2026-06-04
**Parent spec:** [`superpowers/specs/2026-06-04-f-series-master-roadmap.md`](superpowers/specs/2026-06-04-f-series-master-roadmap.md)

opsbench's posture (per F-series cross-cutting principles):

1. **Pi-first** — every recipe ships a Pi configuration block before the Claude
   Code block; other hosts (Codex CLI, Cursor, Copilot CLI, Gemini, OpenCode)
   follow via `tools/<host>-compat-layer/` adapters.
2. **Vendor MCPs > custom code** — when a vendor ships a real MCP, we point at it.
3. **Read-only by default; writes are Cedar-gated.**
4. **AGPL-licensed servers are external-only** — they run as subprocess; opsbench
   never vendors AGPL code.

---

## Index

- [Recipes (50)](#recipes-50)
  - [Identity / secrets](#identity--secrets)
  - [Cloud-provider control planes](#cloud-provider-control-planes)
  - [GitHub / collaboration / ticketing](#github--collaboration--ticketing)
  - [Kubernetes core + node forensics](#kubernetes-core--node-forensics)
  - [GitOps / Argo / Flux](#gitops--argo--flux)
  - [Infrastructure-as-Code + Crossplane](#infrastructure-as-code--crossplane)
  - [Container + Docker](#container--docker)
  - [Observability / metrics / logs / traces](#observability--metrics--logs--traces)
  - [Security / posture / runtime](#security--posture--runtime)
  - [Threat-intel + case management](#threat-intel--case-management)
  - [Databases](#databases)
  - [Comms / paging](#comms--paging)
  - [Policy / agent-frameworks](#policy--agent-frameworks)
  - [Custom-built MCPs (opsbench-authored specs)](#custom-built-mcps-opsbench-authored-specs)
- [Skills with external dependencies (1)](#skills-with-external-dependencies-1)
- [Templates / blueprints (used in design, not vendored)](#templates--blueprints-used-in-design-not-vendored)
- [Cross-reference only (not integrated)](#cross-reference-only-not-integrated)
- [Deferred to F6 (separate evaluation)](#deferred-to-f6-separate-evaluation)
- [How this list is maintained](#how-this-list-is-maintained)

---

## Recipes (50)

50 MCP recipes live under `packages/team-incident-response/mcp-recipes/`. Counts:
17 baseline (pre-F0) + 5 inherited from old P1 + 28 new from the F0 catalog =
50 total. (The old-P1 5 are "inherited" — recipe content was specified in the
superseded P1 plan, content-valid and re-applied here.)

### Identity / secrets

| Project | License | How opsbench uses it | File |
| ------- | ------- | -------------------- | ---- |
| [`hashicorp/vault-mcp-server`](https://github.com/hashicorp/vault-mcp-server) | MPL-2.0 | Recipe — Vault KV/PKI/Transit/AppRole MCP; read-only default, write tools Cedar-gated | `packages/team-incident-response/mcp-recipes/vault-mcp.md` |

### Cloud-provider control planes

| Project | License | How opsbench uses it | File |
| ------- | ------- | -------------------- | ---- |
| [`Azure/azure-mcp`](https://github.com/Azure/azure-mcp) | MIT | Recipe — raw ARM/Monitor/Key Vault MCP; `--read-only` default | `packages/team-incident-response/mcp-recipes/azure-mcp.md` |
| [`microsoft/azure-skills`](https://github.com/microsoft/azure-skills) | MIT | Recipe (inherited from old P1) — Azure plugin layer (skills + Azure MCP + Foundry MCP, ~200 tools) | `packages/team-incident-response/mcp-recipes/azure-skills-mcp.md` |
| [`microsoft/mcp`](https://github.com/microsoft/mcp) | MIT | Recipe — Microsoft MCP monorepo (Azure parity layer distinct from azure-skills) | `packages/team-incident-response/mcp-recipes/microsoft-mcp.md` |
| [`awslabs/mcp`](https://github.com/awslabs/mcp) | Apache-2.0 | Recipe — AWS labs MCP monorepo (EKS, CloudWatch, IAM, Cost Explorer per-server) | `packages/team-incident-response/mcp-recipes/awslabs-mcp.md` |
| [`awslabs/mcp`](https://github.com/awslabs/mcp) | Apache-2.0 | Recipe (baseline) — AWS forensic surface (CloudTrail, CloudWatch, EC2/EBS, EKS) | `packages/team-incident-response/mcp-recipes/aws-mcp.md` |
| [`googleapis/gcloud-mcp`](https://github.com/googleapis/gcloud-mcp) | Apache-2.0 | Recipe — GKE, Cloud Logging, IAM, Pub/Sub | `packages/team-incident-response/mcp-recipes/gcloud-mcp.md` |

### GitHub / collaboration / ticketing

| Project | License | How opsbench uses it | File |
| ------- | ------- | -------------------- | ---- |
| [`github/github-mcp-server`](https://github.com/github/github-mcp-server) | MIT | Recipe — canonical GitHub MCP (Actions, Issues, PRs, Repos) | `packages/team-incident-response/mcp-recipes/github-mcp.md` |
| [`linear/mcp-server-linear`](https://github.com/linear/mcp-server-linear) | MIT | Recipe (baseline) — Linear ticketing MCP | `packages/team-incident-response/mcp-recipes/linear-mcp.md` |
| [`modelcontextprotocol/servers#slack`](https://github.com/modelcontextprotocol/servers/tree/main/src/slack) | MIT | Recipe (baseline) — Slack reference MCP server | `packages/team-incident-response/mcp-recipes/slack-mcp.md` |

### Kubernetes core + node forensics

| Project | License | How opsbench uses it | File |
| ------- | ------- | -------------------- | ---- |
| [`alexei-led/k8s-mcp-server`](https://github.com/alexei-led/k8s-mcp-server) | Apache-2.0 | Recipe (baseline) — generic K8s MCP via kubectl bridge | `packages/team-incident-response/mcp-recipes/k8s-mcp.md` |
| [`containers/kubernetes-mcp-server`](https://github.com/containers/kubernetes-mcp-server) | Apache-2.0 | Recipe — distro-agnostic K8s/OpenShift MCP; non-destructive mode default; OTel-instrumented | `packages/team-incident-response/mcp-recipes/kubernetes-mcp.md` |
| [`alexei-led/k8s-mcp-server`](https://github.com/alexei-led/k8s-mcp-server) | MIT | Recipe — bridges kubectl/helm/istioctl/argocd CLI surfaces | `packages/team-incident-response/mcp-recipes/kubernetes-cli-bridge-mcp.md` |
| [`k8sgpt-ai/k8sgpt`](https://github.com/k8sgpt-ai/k8sgpt) | Apache-2.0 | Recipe (inherited) — K8s analyzers via built-in `serve --mcp`; recommend `--anonymize` | `packages/team-incident-response/mcp-recipes/k8sgpt-mcp.md` |
| [`zekker6/mcp-helm`](https://github.com/zekker6/mcp-helm) | MIT | Recipe — read-only Helm repo search/lookup | `packages/team-incident-response/mcp-recipes/helm-mcp.md` |
| [`Nosmoht/talos-mcp-server`](https://github.com/Nosmoht/talos-mcp-server) | MIT | Recipe — Talos gRPC apid MCP for node-level forensics; mutating ops gated via `confirm=true` | `packages/team-incident-response/mcp-recipes/talos-mcp.md` |
| [`inspektor-gadget/ig-mcp-server`](https://github.com/inspektor-gadget/ig-mcp-server) | Apache-2.0 | Recipe — DNS/TCP/syscall traces; closes AKS kernel-forensics gap | `packages/team-incident-response/mcp-recipes/inspektor-gadget-mcp.md` |
| [`kubeshark/kubeshark`](https://github.com/kubeshark/kubeshark) | Apache-2.0 | Recipe — eBPF traffic analyzer with built-in MCP; gate by namespace | `packages/team-incident-response/mcp-recipes/kubeshark-mcp.md` |
| [`cilium/cilium`](https://github.com/cilium/cilium) (Hubble) | Apache-2.0 | Recipe (baseline) — Cilium Hubble eBPF observability bridge | `packages/team-incident-response/mcp-recipes/ebpf-observability-mcp.md` |

### GitOps / Argo / Flux

| Project | License | How opsbench uses it | File |
| ------- | ------- | -------------------- | ---- |
| [`argoproj-labs/mcp-for-argocd`](https://github.com/argoproj-labs/mcp-for-argocd) | Apache-2.0 | Recipe — Argo Labs Argo CD MCP; sync/rollback Cedar-gated per agent | `packages/team-incident-response/mcp-recipes/argocd-mcp.md` |
| [`akuity/argocd-mcp`](https://github.com/akuity/argocd-mcp) | Apache-2.0 | Recipe — Argo creators' alternative implementation; pair with Akuity Promotion Advisor | `packages/team-incident-response/mcp-recipes/argocd-akuity-mcp.md` |
| [`Heapy/argo-workflows-mcp`](https://github.com/Heapy/argo-workflows-mcp) | Apache-2.0 | Recipe — Argo Workflows MCP (HTTP/SSE only); SQLite-backed permission audit | `packages/team-incident-response/mcp-recipes/argo-workflows-mcp.md` |
| [`controlplaneio-fluxcd/flux-operator`](https://github.com/controlplaneio-fluxcd/flux-operator) | AGPL-3.0 | Recipe — Flux v2 reconciliation status MCP. **AGPL → external subprocess only, never vendored.** | `packages/team-incident-response/mcp-recipes/flux-mcp.md` |

### Infrastructure-as-Code + Crossplane

| Project | License | How opsbench uses it | File |
| ------- | ------- | -------------------- | ---- |
| [`hashicorp/terraform-mcp-server`](https://github.com/hashicorp/terraform-mcp-server) | MPL-2.0 | Recipe — Terraform Registry + HCP/TFE MCP; `create_run`/`apply_run` human-gated | `packages/team-incident-response/mcp-recipes/terraform-mcp.md` |
| [`ansible/vscode-ansible`](https://github.com/ansible/vscode-ansible) (Dev Tools MCP) | Apache-2.0 | Recipe — Red Hat Ansible Dev Tools MCP for playbook scaffolding/lint/EE | `packages/team-incident-response/mcp-recipes/ansible-mcp.md` |
| [`briferz/crossplane-mcp`](https://github.com/briferz/crossplane-mcp) | Apache-2.0 | Recipe — community read-only Crossplane troubleshooting MCP | `packages/team-incident-response/mcp-recipes/crossplane-mcp.md` |
| [`upbound/controlplane-mcp-server`](https://github.com/upbound/controlplane-mcp-server) | Apache-2.0 | Recipe — Upbound vendor Crossplane control-plane CRUD; writes Cedar-gated | `packages/team-incident-response/mcp-recipes/crossplane-control-plane-mcp.md` |
| [`upbound/marketplace-mcp-server`](https://github.com/upbound/marketplace-mcp-server) | Apache-2.0 | Recipe — Upbound public-marketplace search (no auth) | `packages/team-incident-response/mcp-recipes/crossplane-marketplace-mcp.md` |

### Container + Docker

| Project | License | How opsbench uses it | File |
| ------- | ------- | -------------------- | ---- |
| [`docker/mcp-gateway`](https://github.com/docker/mcp-gateway) | MIT | Recipe — Docker MCP toolkit; isolates MCP servers as containers | `packages/team-incident-response/mcp-recipes/docker-mcp.md` |

### Observability / metrics / logs / traces

| Project | License | How opsbench uses it | File |
| ------- | ------- | -------------------- | ---- |
| [`grafana/mcp-grafana`](https://github.com/grafana/mcp-grafana) | Apache-2.0 | Recipe (rewritten) — Grafana dashboards, Prom/Loki/Tempo queries, alerts; gate write tools | `packages/team-incident-response/mcp-recipes/grafana-mcp.md` |
| [`pab1it0/prometheus-mcp-server`](https://github.com/pab1it0/prometheus-mcp-server) | MIT | Recipe — read-only PromQL MCP; safe allowlist add | `packages/team-incident-response/mcp-recipes/prometheus-mcp.md` |
| [`grafana/loki-mcp`](https://github.com/grafana/loki-mcp) | AGPL-3.0 | Recipe — Loki LogQL MCP. **AGPL → external subprocess only.** | `packages/team-incident-response/mcp-recipes/loki-mcp.md` |
| [`VictoriaMetrics/mcp-victoriametrics`](https://github.com/VictoriaMetrics/mcp-victoriametrics) | Apache-2.0 | Recipe — MetricsQL queries; bundled with VM ≥ 1.105 | `packages/team-incident-response/mcp-recipes/victoriametrics-mcp.md` |
| [`SigNoz/signoz-mcp-server`](https://github.com/SigNoz/signoz-mcp-server) | Apache-2.0 | Recipe — OTel-native metrics + traces + logs MCP | `packages/team-incident-response/mcp-recipes/signoz-mcp.md` |
| [`traceloop/opentelemetry-mcp-server`](https://github.com/traceloop/opentelemetry-mcp-server) | Apache-2.0 | Recipe — multi-backend OTel trace queries | `packages/team-incident-response/mcp-recipes/otel-mcp.md` |
| [`open-telemetry/community`](https://github.com/open-telemetry/community/issues) | MIT | Recipe (baseline) — placeholder pointer until upstream ships canonical MCP | `packages/team-incident-response/mcp-recipes/opentelemetry-mcp.md` |
| [`ntk148v/alertmanager-mcp-server`](https://github.com/ntk148v/alertmanager-mcp-server) | Apache-2.0 | Recipe — Alertmanager silences/groups MCP; silence ops Cedar-gated | `packages/team-incident-response/mcp-recipes/alertmanager-mcp.md` |

### Security / posture / runtime

| Project | License | How opsbench uses it | File |
| ------- | ------- | -------------------- | ---- |
| [`aquasecurity/trivy-mcp`](https://github.com/aquasecurity/trivy-mcp) | MIT | Recipe — Trivy fs/image/repo CVE scans MCP; stdio/HTTP/SSE | `packages/team-incident-response/mcp-recipes/trivy-mcp.md` |
| [`kubescape/kubescape`](https://github.com/kubescape/kubescape) | Apache-2.0 | Recipe — Kubescape posture scans + KAgent plugin integration | `packages/team-incident-response/mcp-recipes/kubescape-mcp.md` |
| [`CrowdStrike/falcon-mcp`](https://github.com/CrowdStrike/falcon-mcp) | MIT | Recipe — Falcon detections/hosts/RTR MCP; RTR and quarantine actions Cedar-gated | `packages/team-incident-response/mcp-recipes/crowdstrike-falcon-mcp.md` |
| [`nirmata/kyverno-mcp`](https://github.com/nirmata/kyverno-mcp) | AGPL-3.0 | Recipe — Kyverno policy MCP. **AGPL → Docker-only external subprocess.** | `packages/team-incident-response/mcp-recipes/kyverno-mcp.md` |
| [Velociraptor](https://docs.velociraptor.app/) | AGPL-3.0 | Recipe (baseline) — Velociraptor DFIR pointer (optional, external subprocess) | `packages/team-incident-response/mcp-recipes/velociraptor-mcp.md` |

### Threat-intel + case management

| Project | License | How opsbench uses it | File |
| ------- | ------- | -------------------- | ---- |
| [`StrangeBeeCorp/TheHiveMCP`](https://github.com/StrangeBeeCorp/TheHiveMCP) | MIT | Recipe (inherited) — TheHive case-management MCP; **EXPERIMENTAL** beta upstream, `PERMISSIONS_CONFIG=read_only` default | `packages/team-incident-response/mcp-recipes/thehive-mcp.md` |
| [`jhuntinfosec/mcp-opencti`](https://github.com/jhuntinfosec/mcp-opencti) | MIT | Recipe (inherited) — OpenCTI threat-intel MCP (community); `zxzinn/opencti-mcp` documented as fallback | `packages/team-incident-response/mcp-recipes/opencti-mcp.md` |

### Databases

| Project | License | How opsbench uses it | File |
| ------- | ------- | -------------------- | ---- |
| [`ClickHouse/mcp-clickhouse`](https://github.com/ClickHouse/mcp-clickhouse) | Apache-2.0 | Recipe (baseline) — ClickHouse query MCP (official) | `packages/team-incident-response/mcp-recipes/clickhouse-mcp.md` |
| [`crystaldba/postgres-mcp`](https://github.com/crystaldba/postgres-mcp) | MIT | Recipe (baseline) — Postgres MCP | `packages/team-incident-response/mcp-recipes/postgres-mcp.md` |

### Comms / paging

| Project | License | How opsbench uses it | File |
| ------- | ------- | -------------------- | ---- |
| [`PagerDuty/pagerduty-mcp-server`](https://github.com/PagerDuty/pagerduty-mcp-server) | MIT | Recipe (baseline) — PagerDuty MCP (official) | `packages/team-incident-response/mcp-recipes/pagerduty-mcp.md` |

### Policy / agent-frameworks

| Project | License | How opsbench uses it | File |
| ------- | ------- | -------------------- | ---- |
| [`cedar-policy/cedar-for-agents`](https://github.com/cedar-policy/cedar-for-agents) | Apache-2.0 (verify at pin) | **Reference recipe** — documents how F1 will consume cedar-for-agents to generate `tools-generated.cedar`. Not an MCP server. | `packages/team-incident-response/mcp-recipes/cedar-for-agents-reference.md` |
| [`HKUDS/CLI-Anything`](https://github.com/HKUDS/CLI-Anything) | Apache-2.0 | Recipe (inherited) — framework for wrapping tools that lack MCP servers; backbone of Pi-first via CLI-Anything-wrap pattern | `packages/team-incident-response/mcp-recipes/cli-anything-framework.md` |

### Custom-built MCPs (opsbench-authored specs)

These are "build-this-mcp" specs — the upstream tool has no MCP server, and
opsbench documents the target tool surface as a custom recipe.

| Project | License | How opsbench uses it | File |
| ------- | ------- | -------------------- | ---- |
| Contabo (custom MCP spec) | N/A (spec only) | Custom recipe — Contabo cloud forensic surface | `packages/team-incident-response/mcp-recipes/CUSTOM-contabo-mcp.md` |
| Longhorn (custom MCP spec) | N/A (spec only) | Custom recipe — Longhorn storage forensic surface | `packages/team-incident-response/mcp-recipes/CUSTOM-longhorn-mcp.md` |
| WireGuard (custom MCP spec) | N/A (spec only) | Custom recipe — WireGuard mesh forensic surface | `packages/team-incident-response/mcp-recipes/CUSTOM-wireguard-mcp.md` |

---

## Skills with external dependencies (1)

| Skill | External deps | Why a SKILL, not a recipe | File |
| ----- | ------------- | ------------------------- | ---- |
| `falco-event-ingest` | [`falcosecurity/falcosidekick`](https://github.com/falcosecurity/falcosidekick) (Apache-2.0) + [`HKUDS/CLI-Anything`](https://github.com/HKUDS/CLI-Anything) (Apache-2.0) | Falco has no canonical MCP upstream. Skill orchestrates a CLI-Anything-generated wrapper around falcosidekick's event sink. Retires once upstream ships a canonical Falco MCP. | `packages/team-incident-response/skills/falco-event-ingest/` |

---

## Templates / blueprints (used in design, not vendored)

| Project | License | Influence on opsbench |
| ------- | ------- | --------------------- |
| [`Azure/git-ape`](https://github.com/Azure/git-ape) | MIT | Structural template for `team-platform-engineering` (F4) — `.github/agents/`, `.github/skills/`, `.github/workflows/` layout informs the team's directory shape. No code vendored. |
| [`stacklok/toolhive`](https://github.com/stacklok/toolhive) | Apache-2.0 | F2 fork target — opsbench-gateway will be a fork of toolhive with Cedar evaluation + custody.log emission added. Tracked in F-series roadmap. |

---

## Cross-reference only (not integrated)

These projects are intentionally out of scope today; documented here so future
contributors don't re-litigate the decision.

| Project | Why not integrated | Revisit when… |
| ------- | ------------------ | -------------- |
| [`microsoft/hve-core`](https://github.com/microsoft/hve-core) | GitHub Copilot Chat surface; prompt format differs from Claude Code SKILL.md. Methodology (RPI) overlaps with opsbench's hypothesis loop. | A clean Copilot ↔ Claude Code prompt-format converter exists, OR upstream ships a Claude Code variant. |
| [`AgentOps-AI/agentops`](https://github.com/AgentOps-AI/agentops) | Python SDK for agent observability (CrewAI/AG2/OpenAI Agents/LangChain). No Claude Code or Codex CLI integration upstream. Would require a Claude-Code-hook shim build. | A Claude Code observability hook shim is in scope (currently tracked as a potential side-quest). |

---

## Deferred to F6 (separate evaluation)

The F-series master roadmap defers four high-overlap projects to **F6 —
Architectural evaluations & integrations** because each deserves its own
brainstorming pass rather than a quick recipe drop.

| Project | License | Why it deserves its own pass |
| ------- | ------- | ------------------------------ |
| [`sympozium-ai/sympozium`](https://github.com/sympozium-ai/sympozium) | MIT | Kubernetes multi-agent coordination layer by the k8sgpt author. Skill-sidecar + RBAC + shared-memory model overlaps load-bearing pieces of opsbench (Cedar policies + custody ledger), but it is a K8s-deployed operator, not a file-install. F6 evaluates depth of overlap and whether opsbench-gateway should pull pieces in. |
| [`agentgateway/agentgateway`](https://github.com/agentgateway/agentgateway) | Apache-2.0 (verify) | MCP gateway with policy enforcement. Converges with `stacklok/toolhive` and `scopeblind-gateway` on the same architectural primitive that F2's `opsbench-gateway` is targeting. F6 reconciles design choices across all four. |
| [`falcosecurity/prempti`](https://github.com/falcosecurity/prempti) | Apache-2.0 (verify) | Per-tool runtime enforcement at the syscall level beneath Cedar. Defense-in-depth complement to F2's opsbench-gateway. F6 decides whether to bundle, point at, or require it. |
| `scopeblind-gateway` (project URL pending) | TBD | Third MCP-gateway convergence point; F6 evaluates alongside agentgateway and toolhive. |

---

## How this list is maintained

- Any PR that adds, replaces, or removes an MCP recipe or external dependency
  MUST update this file in the same commit. The PR template's checklist enforces
  this; the markdownlint CI job is the formatting safety net; semantic accuracy
  is the author's responsibility.
- Re-review at least quarterly — upstream activity, license changes, and
  security posture all drift.
- When upstream changes license (e.g., MIT → AGPL), the recipe's `Safety` and
  `Caveats` sections, and this inventory's row, both need updating.
- F-series phases that add new external integrations (F1 Cedar-for-agents
  adoption, F2 opsbench-gateway, F3 signed receipts, F4 team packages) will
  each ship an integrations.md update in their respective PRs.

---

## Counts

| Bucket | Count |
| ------ | ----- |
| MCP recipes | 50 |
| Skills with external deps | 1 |
| Templates / blueprints | 2 |
| Cross-reference only | 2 |
| Deferred to F6 | 4 |
| **Total external projects referenced** | **59** |
