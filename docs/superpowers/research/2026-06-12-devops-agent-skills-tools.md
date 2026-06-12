# DevOps Agent Skills, MCPs, Sub-agents, and Plugins

> Part 1 of 4 of the "Agent Ecosystems for DevOps & Security/Networking" practitioner reference (input corpus for the enterprise AgentOps platform research on branch `research/enterprise-agentops-platform`). Current as of May 2026.

## DevSecOps (SAST, DAST, supply chain, SBOM, policy-as-code)

| Name | Source | Ecosystem | Description / Adoption |
|---|---|---|---|
| Trail of Bits `skills` marketplace | [trailofbits/skills](https://github.com/trailofbits/skills) | Claude Code plugin marketplace + Codex sidecar (`.codex/skills/`) | 30 plugins across 10 categories. Includes CodeQL skill, Semgrep rule authoring, `constant-time-analysis`, `building-secure-contracts`, `entry-point-analyzer`. Every PR code-reviewed. Production-grade. |
| Trail of Bits `skills-curated` | [trailofbits/skills-curated](https://github.com/trailofbits/skills-curated) | Claude Code marketplace | Vetted approved external skills/marketplaces. README states: *"Published skills have been found with backdoors and malicious hooks, and the ecosystem has no built-in quality gate. This repo is how we solve that problem internally. Everything here has been code-reviewed by Trail of Bits staff."* |
| `security-scanning` plugin | [wshobson/agents `plugins/security-scanning`](https://github.com/wshobson/agents/tree/main/plugins/security-scanning/agents) | Claude Code plugin | Multi-agent SAST + dependency-scan + code-review orchestration. |
| `bug-bounty-hunter` agent | [Eyadkelleh/awesome-claude-skills-security](https://github.com/Eyadkelleh/awesome-claude-skills-security) | Claude Code | SecLists wordlists, OWASP payloads, LLM testing prompts. Scope-aware. |
| OWASP Top-10:2025 + ASVS 5.0 skill | listed in [BehiSecc/awesome-claude-skills](https://github.com/BehiSecc/awesome-claude-skills) | Claude Code | Compliance checking against current OWASP/ASVS/Agentic-AI 2026 lists. |
| Snyk MCP Server | community, listed in [WagnerAgent/awesome-mcp-servers-devops](https://github.com/WagnerAgent/awesome-mcp-servers-devops) | MCP server | Vulnerability scanning via natural language from any MCP client. |
| Kyverno / OPA Gatekeeper | not yet Claude-native; orchestrate via `kubernetes-mcp-server` policy CRDs | MCP server | Sparse first-class skill coverage. |
| Sigstore / Cosign | Sparse — no notable purpose-built agent skill found. | — | — |
| `security-fuzzing`, `security-payloads`, `security-patterns` plugins | [Eyadkelleh/awesome-claude-skills-security](https://github.com/Eyadkelleh/awesome-claude-skills-security) | Claude plugin marketplace | Curated SecLists for fuzzing, XSS, XXE, secret patterns, web shells. Install: `/plugin install security-fuzzing@awesome-security-skills`. |

## GitOps (ArgoCD, Flux, Argo Rollouts, ApplicationSets)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| ArgoCD MCP Server | listed in [WagnerAgent/awesome-mcp-servers-devops](https://github.com/WagnerAgent/awesome-mcp-servers-devops) | MCP server | Application listing, sync operations, resource trees, logs. |
| `gitops-workflows` plugin | [ahmedasmar/devops-claude-skills](https://github.com/ahmedasmar/devops-claude-skills) | Claude Code marketplace | Argo CD application bootstrap, ApplicationSet generation, App-of-apps. Install: `/plugin install gitops-workflows@devops-skills`. |
| `argo-rollouts` / `flagger` | Sparse — no production-grade dedicated skill. Best path: `kubernetes-mcp-server` CRD operations + manual prompt. | — | — |

## Infrastructure (general IaC patterns)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| `cloud-infrastructure`, `infrastructure-devops` collections | [wshobson/agents](https://github.com/wshobson/agents) | Claude Code (80 plugins, 153 skills, 185 agents) | The largest general-purpose pack. Install: `/plugin install cloud-infrastructure`. |
| `terraform-engineer` agent | [rohitg00/awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit/blob/main/agents/infrastructure/terraform-engineer.md) | Claude Code subagent | Three-layer module pattern (root / composition / resource), state safety. |
| `senior-devops`, `aws-solution-architect` skills | [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) | Cross-agent (Claude Code, Codex, Cursor, Aider, Windsurf, Kilo Code, OpenCode, Augment, Antigravity, Hermes, Gemini CLI) | 313-skill cross-tool library. Install via `npx ai-agent-skills install`. |

## Baremetal (PXE, MAAS, Tinkerbell, Metal3, iDRAC/iLO)

Sparse — no notable purpose-built Claude/agent skills. Usable via:

- `kubernetes-mcp-server` for Metal3 BareMetalHost CRD operations.
- Generic SSH MCP for iDRAC/iLO `racadm`/`ipmitool` sessions.

## On-prem (VMware, OpenStack, Proxmox, Nutanix)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| `bright8192/esxi-mcp-server` | listed in [rohitg00/awesome-devops-mcp-servers](https://github.com/rohitg00/awesome-devops-mcp-servers) | Python MCP | VMware ESXi/vCenter VM lifecycle via REST. |
| `thunderboltsid/mcp-nutanix` | listed in [agenticdevops/awesome-devops-mcp](https://github.com/agenticdevops/awesome-devops-mcp) | Go MCP | Nutanix Prism Central integration. |
| KubeVirt toolset in `kubernetes-mcp-server` | [docs/kubevirt.md](https://github.com/containers/kubernetes-mcp-server/blob/main/docs/kubevirt.md) | MCP | VM creation with auto-resolved instance types (small/medium/large) and container disks (Fedora/Ubuntu/CentOS/RHEL/openSUSE). |
| OpenStack / Proxmox | Sparse — no production-grade dedicated agent skill. | — | — |

## Clusters (multi-cluster, Cluster API, Rancher, Karmada)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| **`containers/kubernetes-mcp-server`** | [GitHub](https://github.com/containers/kubernetes-mcp-server) | Native Go MCP | 1.5k stars, native Kubernetes API (not kubectl wrapper); multi-cluster via kubeconfig contexts; Apache 2.0. Strongest production-grade entry. |
| `weibaohui/k8m` / `weibaohui/kom` | listed in [rohitg00/awesome-devops-mcp-servers](https://github.com/rohitg00/awesome-devops-mcp-servers) | Go MCP | Multi-cluster K8s, ~50 built-in tools. |
| `Flux159/mcp-server-kubernetes` | [GitHub](https://github.com/Flux159/mcp-server-kubernetes) | TypeScript MCP | kubectl + helm via natural language, multi-context support. |
| Cluster API / Karmada | Sparse — manage via generic MCP CRD operations. | — | — |

## Multi-zone failover / topology spread

Sparse — no purpose-built skills. Use `kubernetes-operations` plugin in [wshobson/agents](https://github.com/wshobson/agents) with explicit prompts for `topologySpreadConstraints`, anti-affinity, and zone-aware `Service` routing.

## DR / Disaster Recovery (Velero, backup orchestration, RTO/RPO)

Sparse first-class skills. Practitioners report driving Velero through generic shell MCP servers; `senior-sre` skill in [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills/tree/main/engineering-team) includes DR pattern references.

## Database deployments (Postgres operators, Vitess, Mongo, schema migrations)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| `database-optimizer`, `postgres-pro`, `sql-pro` | [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills/tree/main/skills) | Cross-agent | Postgres query/index optimization, migration patterns. |
| `database-architect` | [wshobson/agents](https://github.com/wshobson/agents) | Claude Code | Operator selection, multi-region replication patterns. |
| Zalando Postgres Operator / CrunchyData | Sparse — manage via CRDs through `kubernetes-mcp-server`. | — | — |

## Operators (Operator SDK, Kubebuilder, custom controllers)

Sparse. Pattern: use `wshobson/agents` `voltagent-infra` plugin + `kubernetes-mcp-server` for CRD lifecycle and scaffolding.

## Containerization (Docker, Podman, Buildah, distroless)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| Docker MCP Server | listed in [globalping.io top-10 DevOps MCPs](https://blog.globalping.io/top-10-mcp-servers-devops-developers/) | MCP | Natural-language container management, Docker Hub integration. |
| `containers/kubernetes-mcp-server` | [GitHub](https://github.com/containers/kubernetes-mcp-server) | MCP | Also covers Podman / OpenShift contexts. |
| `stakpak/mcp` | listed in [rohitg00/awesome-devops-mcp-servers](https://github.com/rohitg00/awesome-devops-mcp-servers) | Rust MCP | Generates Dockerfiles, Terraform, K8s manifests, GitHub Actions. |
| Hadolint / dive | Sparse — wrap via shell MCP. | — | — |

## Infrastructure as Code (Terraform, OpenTofu, Pulumi, Crossplane, CDK)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| **`hashicorp/terraform-mcp-server`** | [Official](https://github.com/hashicorp/terraform-mcp-server) | Official HashiCorp MCP | Registry search, module/provider docs, Sentinel policies, HCP Terraform workspace CRUD (Stacks support added in v0.5+). Stdio + Streamable HTTP transports. |
| HashiCorp `agent-skills` | linked in [awesomeclaude.ai directory](https://awesomeclaude.ai/awesome-claude-skills) | Claude Code | HashiCorp-maintained Claude skills for Terraform workflows. |
| **`pulumi/agent-skills`** | [GitHub](https://github.com/pulumi/agent-skills) | Cross-tool (Claude Code, Cursor, Copilot, Codex, Junie, Gemini CLI) | Migration (Terraform / CDK / ARM / CloudFormation → Pulumi), authoring (components, ESC, best-practices, provider-upgrade), delegation (Neo handoff). Install: `claude plugin marketplace add pulumi/agent-skills`. |
| Pulumi MCP Server | [Docs](https://www.pulumi.com/docs/ai/mcp-server/) | Remote MCP at `https://mcp.ai.pulumi.com/mcp` | Stack queries, resource search, Pulumi Cloud integration, OAuth. |
| `tjun/terraform-doc-mcp` / `nwiizo/tfmcp` | community MCPs | MCP | Provider docs + CLI-driven workflows. |
| OpenTofu MCP server | Cloudflare Workers-hosted; described in [InfoWorld 10 DevOps MCPs](https://www.infoworld.com/article/4096223/10-mcp-servers-for-devops.html) | MCP | Globally distributed, 100% open source. |
| Crossplane / CDK | Sparse — Crossplane via Kubernetes MCP CRDs; CDK via AWS MCP. | — | — |

## Config as Code (Ansible, Chef, Puppet, SaltStack)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| `ansible-mcp-server` | listed in [derisk-ai/awesome-devops-mcp-servers](https://github.com/derisk-ai/awesome-devops-mcp-servers) | Python MCP | Ansible playbook execution via natural language. |
| Chef / Puppet / Salt | Sparse — no dedicated production-grade agent skill. | — | — |

## Packer / Image baking

Sparse — no notable agent skills found. Practitioners drive Packer via shell MCPs.

## L4–L7 Networking (Istio, Linkerd, Envoy, HAProxy, NGINX, Cilium SM)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| Cilium / Hubble | [cilium/cilium](https://github.com/cilium/cilium) | Native eBPF tooling | Kube-proxy replacement, L7 policies via embedded Envoy. Drive via K8s MCP CRDs. |
| Istio / Linkerd / NGINX / HAProxy | Sparse — no dedicated production-grade MCP. | — | — |

## VPN (WireGuard, IPsec, OpenVPN, Tailscale, ZeroTier)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| `meshpop/wire` | [mcpmarket.com/server/wire-1](https://mcpmarket.com/server/wire-1) | MCP | Self-hosted WireGuard mesh, NAT traversal, AI-managed topology. |
| `doxx.net Tunnel Manager` | [mcpmarket.com](https://mcpmarket.com/tools/skills/doxx-net-tunnel-manager-1) | Claude Code skill | WireGuard tunnel lifecycle, QR-code mobile setup. |
| `jschmid6/ha-wireguard-client-addon-wireguard-config` | [LobeHub Skills](https://lobehub.com/skills/jschmid6-ha-wireguard-client-addon-wireguard-config) | LobeHub skill | Home Assistant add-on, per-target iptables FORWARD/DNAT rule generation. |
| URnetwork MCP | [docs.ur.io/mcp/skill](https://docs.ur.io/mcp/skill) | MCP skill | Search locations, create HTTPS/SOCKS/WireGuard proxies via API. |
| Tailscale / Headscale / Netbird / Innernet | Sparse first-party MCPs. Wrap CLIs via `mcp-shell`. | — | — |

## VPC (AWS VPC, Azure VNet, GCP VPC, Transit Gateway)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| AWS Official MCP suite | listed in [WagnerAgent/awesome-mcp-servers-devops](https://github.com/WagnerAgent/awesome-mcp-servers-devops) | Official AWS MCP | EC2, VPC, Transit Gateway resource discovery & codification. |
| `alexei-led/aws-mcp-server` | community [GitHub](https://github.com/derisk-ai/awesome-devops-mcp-servers) | Python MCP | Secure AWS CLI execution in Docker, templates for common AWS tasks. |
| `aws-cost-optimization` plugin | [ahmedasmar/devops-claude-skills](https://github.com/ahmedasmar/devops-claude-skills) | Claude Code | Find unused VPC endpoints/IPs, NAT gateway anomalies. |

## Azure-specific (ARM, Bicep, ADO Pipelines, AKS, Azure Policy)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| Azure DevOps MCP Server | Microsoft-maintained, listed in [k8slens 18 best DevOps MCPs](https://medium.com/k8slens/18-best-devops-mcp-servers-for-2026-the-definitive-guide-bfde04654a35) | Official MCP | Work items, PRs, builds, releases; multi-project support. |
| Azure CLI MCP (`jdubois/azure-cli-mcp`) | [derisk-ai/awesome-devops-mcp-servers](https://github.com/derisk-ai/awesome-devops-mcp-servers) | Python MCP | Direct `az` CLI wrapper. |
| `pulumi-arm-to-pulumi` migration skill | [pulumi/agent-skills](https://github.com/pulumi/agent-skills) | Cross-agent | ARM/Bicep → Pulumi conversion. |

## AWS-specific (CDK, CloudFormation, EKS, IAM, SCPs)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| AWS Official MCP servers | install pattern in [AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-v7liwliuew3f4) | Official MCP | Lambda, ECS, EKS, S3, EC2, RDS coverage. |
| AWS Knowledge MCP Server, AWS IaC MCP Server, CloudFormation MCP Server | listed by [InfoWorld](https://www.infoworld.com/article/4096223/10-mcp-servers-for-devops.html) | Official MCP | CloudFormation/IaC integrations. |
| `lishenxydlgzs/aws-athena-mcp` | community MCP | MCP | Athena SQL queries against Glue Catalog. |
| `aarora79/aws-cost-explorer-mcp-server` | community MCP | MCP | Spend analysis. |
| `aws-solution-architect` skill | [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills/tree/main/engineering-team) | Cross-agent | IAM Identity Center, SCPs, Organizations patterns. |

## GCP-specific (Anthos, GKE, Cloud Build)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| GCP MCP | listed in [Cloudshipai 2026 MCP guide](https://www.cloudshipai.com/blog/mcp-servers-devops-complete-guide-2026) | MCP | Compute Engine, Cloud Run, GKE; service-account auth. |
| Google GenAI Toolbox | listed at [mcp.directory](https://mcp.directory/servers/hashicorp-terraform) | Official Google MCP | DB connectors, AI database agent. |

## Container registries (Harbor, ECR, ACR, GCR, Quay, Cosign, Sigstore)

Sparse purpose-built skills. Use cloud-provider MCPs for ECR/ACR/GCR; Cosign/Sigstore via shell MCP wrappers.

## Patterns & Practices (12-factor, blue-green, canary, feature flags)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| `devops-engineer` skill | [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills/tree/main/skills) | Cross-agent | Blue-green, canary, feature-flag patterns; "no deploy to prod without approval, no secrets in code, no unversioned images." |
| `pulumi-best-practices` skill | [pulumi/agent-skills](https://github.com/pulumi/agent-skills) | Cross-agent | Dependency tracking, ComponentResource patterns, encrypted secrets. |

## Platform Engineering (Backstage, IDPs, Humanitec, Score, Crossplane)

- **Backstage**: Sparse first-class MCP. Wrappable via custom MCP against software-catalog APIs.
- **Crossplane compositions**: drive via `kubernetes-mcp-server` CRDs.
- **Humanitec / Score**: Sparse — no notable entries.

## Developer Platform (golden paths, scaffolding, self-service)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| `developing-claude-code-plugins` | [obra/superpowers-developing-for-claude-code](https://github.com/obra/superpowers-developing-for-claude-code) | Claude Code | Templates, validation workflows, 42+ doc references. |
| `plugin-authoring` skill | [ivan-magda/claude-code-plugin-template](https://awesomeclaude.ai/awesome-claude-skills) | Claude Code | Scaffolding for new plugins. |
| Conductor `/conductor:setup` | [wshobson/agents](https://github.com/wshobson/agents) | Claude Code | Product vision → tech stack → workflow rules → style guides. |

## CI/CD (GitHub Actions, GitLab CI, Jenkins, CircleCI, Tekton, Argo Workflows)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| GitHub MCP Server | listed by [k8slens 18 best DevOps MCPs](https://medium.com/k8slens/18-best-devops-mcp-servers-for-2026-the-definitive-guide-bfde04654a35) | Official MCP | PRs, issues, Actions, code review. "The most widely deployed DevOps MCP in the ecosystem." |
| GitHub Agentic Workflows | preview described in [tldrsec.com #316](https://tldrsec.com/p/tldr-sec-316) | GitHub Actions + Copilot CLI / Claude Code / Codex | Markdown-frontmatter natural-language repo automation. |
| GitLab MCP Server | GitLab Premium/Ultimate (beta) | Official MCP | Issues, MRs, pipelines (mostly read). |
| `ci-cd` plugin | [ahmedasmar/devops-claude-skills](https://github.com/ahmedasmar/devops-claude-skills) | Claude Code | GitHub Actions / GitLab CI / Jenkins generation, debug failing workflows. |
| `Cognitive-Stack/ares-devops-mcp` | listed in [TensorBlock/awesome-mcp-servers infrastructure](https://github.com/TensorBlock/awesome-mcp-servers/blob/main/docs/infrastructure.md) | MCP | Azure DevOps Git + secure pipeline ops. |
| `grafana/mcp-k6` | [Official](https://github.com/grafana/mcp-k6) | Official MCP | k6 load-test validation + execution; Homebrew, deb/rpm, Docker. |

## Monitoring & Observability (Prometheus, Grafana, OTel, Jaeger, Tempo, Loki, Datadog, Honeycomb, Pixie, eBPF)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| **`grafana/mcp-grafana`** | [GitHub](https://github.com/grafana/mcp-grafana) | Official MCP | Flagship observability MCP — dashboards, PromQL, LogQL, Loki, Tempo, Alerting, Incident, Sift, OnCall. `--disable-write` mode, token-efficient response shaping. |
| `grafana/loki-mcp` | [GitHub](https://github.com/grafana/loki-mcp) | Official MCP | Standalone Loki MCP, multi-tenant org-ID support. |
| `grafana/tempo-mcp-server` | [GitHub](https://github.com/grafana/tempo-mcp-server) | Official MCP | Distributed tracing queries. |
| `grafana/grafana-ui-mcp-server` | [GitHub](https://github.com/grafana/grafana-ui-mcp-server) | Official MCP | Grafana UI component library for dashboard authoring. |
| **Datadog Official MCP (Bits AI MCP)** | [datadog-labs/mcp-server](https://github.com/datadog-labs/mcp-server) | Official managed MCP at `https://mcp.datadoghq.com/api/unstable/mcp-server/mcp` | OAuth, GA 2026-03-09. Read-only by default. |
| `us-all/datadog-mcp-server` | [GitHub](https://github.com/us-all/datadog-mcp-server) | Community MCP | 159 tools, full SLO CRUD, Fleet Automation, Status Pages, token-efficient projection. |
| `shelfio/datadog-mcp` | [GitHub](https://github.com/shelfio/datadog-mcp) | Community MCP | SLO listing, multi-tenant filtering. |
| `GeLi2001/datadog-mcp-server` | [GitHub](https://github.com/GeLi2001/datadog-mcp-server) | Community MCP | Scoped-application-key support. |
| `sushilti80/datadog-mcp` | [GitHub](https://github.com/sushilti80/datadog-mcp) | Community MCP | Multi-key rotation for rate-limit handling, FastMCP. |
| `monitoring-observability` plugin | [ahmedasmar/devops-claude-skills](https://github.com/ahmedasmar/devops-claude-skills) | Claude Code | Prometheus/Grafana stack scaffolding. |
| `monitoring-expert` skill | [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) | Cross-agent | Prometheus + Grafana + Datadog patterns; prompts for thresholds before deploy. |
| Pixie / Honeycomb / New Relic | Sparse first-party MCPs at production-grade. | — | — |
| ELK / OpenSearch | community MCPs only. | — | — |
| Sentry `getsentry/skills` | referenced in [trailofbits/skills CLAUDE.md](https://github.com/trailofbits/skills/blob/main/CLAUDE.md) | Claude Code | "Production Sentry skills; security-review is a standout routing + progressive disclosure example." |

## Kubernetes (kubectl plugins, k9s, manifests, Helm, Kustomize)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| **`containers/kubernetes-mcp-server`** | [GitHub](https://github.com/containers/kubernetes-mcp-server) | Native Go MCP | The flagship K8s MCP. 1.5k stars, native API (no kubectl shell-out), multi-cluster, OpenShift, KubeVirt, Kiali, Helm integration. Read-only mode + RBAC scope. |
| `Flux159/mcp-server-kubernetes` | [GitHub](https://github.com/Flux159/mcp-server-kubernetes) | TypeScript MCP | kubectl + helm wrapper, OTel tracing built in. |
| `rohitg00/kubectl-mcp-server` | community MCP | Python MCP | Natural-language kubectl. |
| `alexei-led/k8s-mcp-server` | community MCP | Python MCP | Secure pipe-based kubectl/helm/istioctl/argocd in Docker. |
| `k8s-troubleshooter` plugin | [ahmedasmar/devops-claude-skills](https://github.com/ahmedasmar/devops-claude-skills) | Claude Code | Pod-failure / cluster-issue runbooks, structured incident playbooks. |
| `kubernetes-specialist` skill | [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) | Cross-agent | Production-grade configs: `runAsNonRoot`, resource limits, PDBs, probes. |
| `kubernetes-operations` plugin | [wshobson/agents](https://github.com/wshobson/agents) | Claude Code | K8s with 4 deployment skills, Helm + GitOps. |

## Secret management (Vault, External Secrets, Sealed Secrets, SOPS, age, AWS SM, Azure KV, GCP SM, 1Password, Doppler, Infisical)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| HashiCorp Vault MCP | [hashicorp.com blog](https://www.hashicorp.com/en/blog/terraform-mcp-server-updates-stacks-support-new-tools-and-tips) | Official MCP | Spots hard-coded secrets, mount management, KV ops. |
| HCP Vault Radar MCP | same | Official MCP | Cross-source secret-leak prioritization (GitHub, AWS, Azure). |
| `pulumi-esc` skill | [pulumi/agent-skills](https://github.com/pulumi/agent-skills) | Cross-agent | Pulumi ESC: short-term OIDC creds for AWS/Azure/GCP; AWS SM/Azure KV/Vault/1Password. |
| `varlock-claude-skill` | listed in [BehiSecc/awesome-claude-skills](https://github.com/BehiSecc/awesome-claude-skills) | Claude skill | Secret-leak prevention. |
| External Secrets Operator | Sparse — drive via `kubernetes-mcp-server` CRDs. | — | — |

## Failover / Cross-site replication / Environment segregation / Maintenance

Sparse first-class dedicated skills across these layers. Practitioners report combining `senior-sre`/`senior-devops` ([alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)) with `chaos-engineer` ([Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills)) for failover validation and manual prompts for namespace/account isolation.

## FinOps / Cost optimization (Kubecost, OpenCost, AWS Cost Explorer)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| `aws-cost-optimization` plugin | [ahmedasmar/devops-claude-skills](https://github.com/ahmedasmar/devops-claude-skills) | Claude Code | 6 automated scripts: find waste, RI analysis, generation age, Spot eval, rightsize, anomaly detect. |
| `aarora79/aws-cost-explorer-mcp-server` | community MCP | MCP | Cost analysis across regions/services. |
| Kubecost / OpenCost | Sparse — no notable Claude-native skill. | — | — |

## Incident response & SRE workflows (postmortems, SLO/SLI, on-call, PagerDuty)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| **Anthropic Cookbook SRE Incident Responder** | [`claude_agent_sdk/03_The_site_reliability_agent.ipynb`](https://github.com/anthropics/claude-cookbooks/blob/main/claude_agent_sdk/03_The_site_reliability_agent.ipynb) and [`managed_agents/sre_incident_responder.ipynb`](https://github.com/anthropics/claude-cookbooks/tree/main/managed_agents) | Reference implementation | The canonical PagerDuty → MCP → PR → approval → merge pattern. PagerDuty, GitHub, Datadog mocked in fixtures, swappable for real services. |
| `sre-engineer` skill | [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) | Cross-agent | SLO/SLI definitions, error-budget math, golden signals, runbooks. |
| `incident-responder` agent | [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) | Claude Code subagent | Triage + postmortem generation. |
| Grafana OnCall toolset in `mcp-grafana` | [GitHub](https://github.com/grafana/mcp-grafana) | Official MCP | On-call schedule lookup, incident creation. |
| PagerDuty / Opsgenie | Use the Anthropic cookbook fixture pattern or a custom webhook handler. | — | — |
