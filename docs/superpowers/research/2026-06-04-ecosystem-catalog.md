# opsbench Ecosystem Research Catalog
>
> Generated 2026-06-04 by a 25-team parallel research workflow.

## Executive summary

Twenty-five domain teams surveyed 367 candidates spanning MCP servers, Claude Code skills, CLIs, operators, agent runtimes, and reference architectures across the DevOps/SRE/Platform-Engineering/Security stack to identify integration-ready pieces for opsbench's Cedar-gated, SHA-256-evidence-sealed agent model.

**Top 10 "should integrate" picks:**

1. **hashicorp/vault-mcp-server** — Vendor-official Vault MCP (KV/PKI) drops straight into a Cedar-gated rotation/cert-mint recipe.
2. **github/github-mcp-server** — Battle-tested (30.4k stars) MCP for Actions/PRs; canonical CI surface for incident-response correlation.
3. **awslabs/mcp + microsoft/mcp + googleapis/gcloud-mcp** — Vendor-official cloud MCPs; EKS/AKS/GKE parity with opsbench's existing AKS forensic recipes.
4. **grafana/mcp-grafana** — De-facto observability MCP covering Prometheus/Loki/Tempo/alerting/incidents.
5. **argoproj-labs/mcp-for-argocd** — Vendor-blessed Argo CD MCP enabling guarded sync/rollback in GitOps incident flows.
6. **containers/kubernetes-mcp-server** — Distro-agnostic, native-Go K8s/OpenShift MCP with non-destructive mode + OTel; perfect baseline.
7. **inspektor-gadget/ig-mcp-server** — Official CNCF eBPF MCP for kernel-level network forensics; closes the AKS network gap.
8. **aquasecurity/trivy-mcp** — Vendor-published Trivy MCP; CVE triage during forensics with evidence-friendly outputs.
9. **cedar-policy/cedar-for-agents** — Official Cedar schema generator that auto-derives per-agent allowlists from MCP tool descriptions — extends opsbench's existing gating engine.
10. **fluxcd/agent-skills** — Three production-ready GitOps skills already structured for `.agents/skills/`; direct template for opsbench skill packaging.

**Watch list (high promise, immature):**

- **agentgateway/agentgateway** — Rust/Envoy AI-native dataplane natively speaking MCP/A2A; pre-GA but the right shape for opsbench MCP fan-out.
- **scopeblind-gateway (tomjwxf)** — Cedar-evaluated MCP proxy with Ed25519-signed receipts; near-exact analog to opsbench's evidence sealing.
- **vectimus/vectimus** — Cedar-based deterministic tool-call policy engine across multiple agent hosts; 78 policies / 369 rules already mapped to CVEs/SOC2/NIST.
- **briferz/crossplane-mcp** — Explicitly read-only Crossplane troubleshooting MCP designed for the SRE persona opsbench targets.
- **falcosecurity/prempti** — Runtime-syscall enforcement boundary for Claude Code tool calls; the natural defense-in-depth layer beneath Cedar.

**Skip picks (popular but bad fit — don't relitigate):**

- **rohitg00/kubectl-mcp-server** — 253 tools + 107 integrations in one server directly clashes with opsbench's tight per-agent allowlist philosophy.
- **Pulumi Neo delegation tool (inside pulumi/mcp-server)** — Autonomous remediation without policy hooks; cannot be Cedar-gated cleanly.
- **Closed-source vendor SaaS (Akuity Intelligence, Red Hat Lightspeed, Permit MCP Gateway SaaS)** — Useful references, but opsbench should position as the policy/evidence layer that *consumes* their output, not depend on them.
- **AGPL-3.0 MCP servers for vendoring (itunified-io/mcp-vault, Bitwarden MCP, trufflehog source vendoring)** — Fine as external subprocesses, never as vendored source. Don't attempt to merge.
- **maroffo/claude-forge & similar generic "Claude skill template" repos** — Layout references only; nothing operationally load-bearing.

## High-fit recommendations by integration vector

### mcp-recipe

| name | domain | url | license | stars | last_activity | fit_reason | notes |
|---|---|---|---|---|---|---|---|
| argoproj-labs/mcp-for-argocd | argocd | <https://github.com/argoproj-labs/mcp-for-argocd> | Apache-2.0 | 481 | 2026-05-03 | Vendor-blessed ArgoCD MCP for guarded sync/rollback | Pair with Cedar gates + Kargo evidence |
| seatgeek/argocd-mcp | argocd | <https://github.com/seatgeek/argocd-mcp> |  | 0 |  | Production-hardened alternate ArgoCD MCP | Confirm license/activity before vendoring |
| docker/mcp-gateway | docker | <https://github.com/docker/mcp-gateway> | MIT | 1400 | 2026-05 | Routes/manages MCP servers as isolated containers | Pairs with Docker MCP Toolkit |
| ckreiling/mcp-server-docker | docker | <https://github.com/ckreiling/mcp-server-docker> | GPL-3.0 | 720 | 2025-06-05 | Full Docker CRUD for IR forensics | GPL — external only, not vendored |
| ansible/vscode-ansible (Ansible Dev Tools MCP) | ansible | <https://github.com/ansible/vscode-ansible> | Apache-2.0 | 0 | 2026-05-01 | Official Red Hat Ansible MCP for playbook scaffolding/lint/EE | npm + ghcr distributions |
| sibilleb/AAP-Enterprise-MCP-Server | ansible | <https://github.com/sibilleb/AAP-Enterprise-MCP-Server> | MIT | 30 | 2025-07-18 | Cleanest community AAP + EDA MCP | Borderline-stale but well factored |
| hashicorp/terraform-mcp-server | terraform | <https://github.com/hashicorp/terraform-mcp-server> | MPL-2.0 | 1394 | 2026-06-02 | Official Registry + HCP/TFE MCP | Tool-hint design already aligns with Cedar |
| warpgate-mcp-server (CowDogMoo) | packer | <https://github.com/CowDogMoo/warpgate-mcp-server> | MIT | 0 | 2026-06-03 | 26-tool MCP for multi-arch image + AMI builds | New; vet supply chain |
| hashicorp/vault-mcp-server | vault | <https://github.com/hashicorp/vault-mcp-server> | MPL-2.0 | 49 | 2026-06-03 | Official KV/PKI MCP, stdio + HTTP | Local-use only — fits opsbench allowlists |
| upbound/marketplace-mcp-server | crossplane | <https://github.com/upbound/marketplace-mcp-server> | Apache-2.0 | 6 | 2026-04-21 | Vendor-official Crossplane Marketplace MCP | Pair with controlplane-mcp-server |
| upbound/controlplane-mcp-server | crossplane | <https://github.com/upbound/controlplane-mcp-server> | Apache-2.0 | 3 | 2025-08-12 | Vendor MCP for control-plane CRUD | Gate writes via Cedar |
| briferz/crossplane-mcp | crossplane | <https://github.com/briferz/crossplane-mcp> | Apache-2.0 | 0 | 2026-05-29 | Read-only troubleshooting MCP for SRE | Fresh; perfect read-only posture |
| agentgateway/agentgateway | ingress-and-gateway | <https://github.com/agentgateway/agentgateway> | Apache-2.0 | 3000 | 2026-05-23 | Rust/Envoy AI-native MCP/A2A dataplane | Pre-GA; LF/CNCF orbit |
| kagent-dev/tools | ingress-and-gateway | <https://github.com/kagent-dev/tools> | Apache-2.0 | 31 | 2026-05-01 | Single Go MCP for K8s/Helm/Istio/Cilium/Prom/Grafana/Argo | Mutating calls need Cedar |
| krutsko/istio-mcp-server | ingress-and-gateway | <https://github.com/krutsko/istio-mcp-server> | MIT | 1 | 2025-09-08 | Read-only Istio CRD + Envoy config MCP | Stale-ish; consider forking |
| inspektor-gadget/ig-mcp-server | network-diag | <https://github.com/inspektor-gadget/ig-mcp-server> | Apache-2.0 | 25 | 2026-05-22 | Vendor MCP for eBPF DNS/TCP/syscall traces | HolmesGPT already integrates it |
| kubeshark/kubeshark | network-diag | <https://github.com/kubeshark/kubeshark> | Apache-2.0 | 11917 | 2026-06-03 | eBPF traffic analyzer with built-in MCP | Heavy footprint; TTL captures |
| 0xKoda/WireMCP | network-diag | <https://github.com/0xKoda/WireMCP> | MIT | 489 | 2025-07-09 | tshark MCP for capture + PCAP analysis | Borderline stale; live fork candidates |
| Nosmoht/talos-mcp-server | k8s-distros | <https://github.com/Nosmoht/talos-mcp-server> | MIT | 0 | 2026-06-03 | Talos gRPC apid MCP for node-level forensics | Mutating ops gated via confirm=true |
| awslabs/mcp (EKS MCP) | k8s-distros | <https://github.com/awslabs/mcp> | Apache-2.0 | 9200 | 2026-06-01 | Official AWS EKS + CloudWatch + IAM MCP monorepo | Per-server scoping required |
| akuity/argocd-mcp | progressive-delivery | <https://github.com/akuity/argocd-mcp> | Apache-2.0 | 0 | 2026-05-15 | Vendor MCP from original Argo creators | Pairs with Akuity Promotion Advisor |
| Heapy/argo-workflows-mcp | progressive-delivery | <https://github.com/Heapy/argo-workflows-mcp> | Apache-2.0 | 45 | 2026-04-22 | Workflows MCP with SQLite-backed permission audit | HTTP/SSE only (no stdio) |
| open-feature/mcp | progressive-delivery | <https://github.com/open-feature/mcp> | Apache-2.0 | 120 | 2026-05-01 | OpenFeature OFREP MCP for in-incident flag flips | CNCF, vendor-neutral |
| pab1it0/prometheus-mcp-server | observability | <https://github.com/pab1it0/prometheus-mcp-server> | MIT | 451 | 2026-05-19 | Lightweight PromQL MCP, read-only | Safe allowlist add |
| controlplaneio-fluxcd/flux-operator (Flux MCP) | operators | <https://github.com/controlplaneio-fluxcd/flux-operator> | AGPL-3.0 | 645 | 2026-05-31 | Production-grade Flux MCP, SLSA-3 | AGPL — run as external server |
| kubernetes-sigs/mcp-lifecycle-operator | operators | <https://github.com/kubernetes-sigs/mcp-lifecycle-operator> | Apache-2.0 | 27 | 2026-06-03 | K8s operator for deploying MCP server fleets | Strong governance signal |
| zekker6/mcp-helm | config-mgmt | <https://github.com/zekker6/mcp-helm> | MIT | 25 | 2026-05-28 | Read-only Helm-repo MCP, no Helm install needed | Small attack surface |
| alexei-led/k8s-mcp-server | config-mgmt | <https://github.com/alexei-led/k8s-mcp-server> | MIT | 210 | 2026-02-27 | kubectl/helm/istioctl/argocd CLI bridge | Per-command timeouts + context allowlist |
| manusa/kubernetes-mcp-server | service-mesh | <https://github.com/manusa/kubernetes-mcp-server> | Apache-2.0 | 1200 | 2026-06-03 | K8s + Helm MCP exposing mesh CRDs via generic ops | Base for mesh recipes |
| grafana/mcp-grafana | observability | <https://github.com/grafana/mcp-grafana> | Apache-2.0 | 3098 | 2026-06-03 | Vendor MCP for dashboards/Prom/Loki/Tempo/alerts | Cedar-gate write tools |
| grafana/loki-mcp | observability | <https://github.com/grafana/loki-mcp> |  | 146 | 2026-06-02 | Dedicated Loki MCP | License needs verification |
| SigNoz/signoz-mcp-server | observability | <https://github.com/SigNoz/signoz-mcp-server> | Apache-2.0 | 97 | 2026-05-21 | OTel-native SigNoz MCP | Active, vendor |
| traceloop/opentelemetry-mcp-server | observability | <https://github.com/traceloop/opentelemetry-mcp-server> | Apache-2.0 | 188 | 2026-04-20 | Multi-backend OTel trace MCP | Rare cross-backend abstraction |
| VictoriaMetrics/mcp-victoriametrics | observability | <https://github.com/VictoriaMetrics/mcp-victoriametrics> | Apache-2.0 | 176 | 2026-05-31 | Official VM MetricsQL MCP | Cedar-gate writes |
| ntk148v/alertmanager-mcp-server | observability | <https://github.com/ntk148v/alertmanager-mcp-server> | Apache-2.0 | 20 | 2026-05-26 | Alertmanager silences/groups MCP | Cedar-gate silence ops |
| aquasecurity/trivy-mcp | security-scanners | <https://github.com/aquasecurity/trivy-mcp> | MIT | 42 | 2025-12-17 | Vendor Trivy MCP for fs/image/repo CVE scans | Stable, stdio/HTTP/SSE |
| kubescape/kubescape (mcpserver) | security-scanners | <https://github.com/kubescape/kubescape> | Apache-2.0 | 11500 | 2026-05-29 | Kubescape 4.0 built-in MCP + KAgent plugin | CNCF incubating |
| CrowdStrike/falcon-mcp | security-scanners | <https://github.com/CrowdStrike/falcon-mcp> | MIT | 171 | 2026-06-03 | 20+ Falcon modules incl. RTR + quarantine | Cedar-gate destructive actions |
| cloudshipai/ship | security-scanners | <https://github.com/cloudshipai/ship> | Apache-2.0 | 51 | 2025-12-09 | Bundles Trivy/Grype/Kubescape/Falco/etc. via Dagger | Reproducible containerized scans |
| nirmata/kyverno-mcp | policy-engines | <https://github.com/nirmata/kyverno-mcp> | AGPL-3.0 | 19 | 2026-05-15 | Vendor MCP for Kyverno apply/validate/violations | AGPL — external only |
| stacklok/toolhive | policy-engines | <https://github.com/stacklok/toolhive> | Apache-2.0 | 1800 | 2026-06-03 | Enterprise MCP gateway with per-tool policy | Hardened MCP host for opsbench |
| Infisical/infisical-mcp-server | secrets-mgmt | <https://github.com/Infisical/infisical-mcp-server> | Apache-2.0 | 47 | 2026-04-14 | Official Infisical MCP w/ Machine Identity auth | Self-hostable |
| DopplerHQ/mcp-server | secrets-mgmt | <https://github.com/DopplerHQ/mcp-server> | Apache-2.0 | 3 | 2026-02-24 | OpenAPI-derived Doppler MCP with scope flags | Scope-flag pattern worth porting |
| HCP Vault Radar MCP | secrets-mgmt | <https://developer.hashicorp.com/hcp/docs/vault-radar/mcp-server/overview> |  | 0 | 2026-05-01 | Read-only leaked-secret evidence MCP | Vendor-hosted; metadata only |
| github/github-mcp-server | ci-cd | <https://github.com/github/github-mcp-server> | MIT | 30400 | 2026-06-01 | Official GH MCP for Actions/logs/artifacts | First-party Anthropic/GitHub |
| buildkite/buildkite-mcp-server | ci-cd | <https://github.com/buildkite/buildkite-mcp-server> | MIT | 49 | 2026-06-03 | Vendor Buildkite pipelines MCP | Go binary, easy recipe |
| tektoncd/mcp-server | ci-cd | <https://github.com/tektoncd/mcp-server> | Apache-2.0 | 21 | 2026-05-25 | Official Tekton PipelineRun/TaskRun MCP | Early stage |
| pipekit/mcp-for-argo-workflows | ci-cd | <https://github.com/pipekit/mcp-for-argo-workflows> | Apache-2.0 | 5 | 2026-06-03 | Argo Workflows lifecycle MCP + visualization | Vendor-maintained |
| awslabs/iam-policy-autopilot | cloud-providers | <https://github.com/awslabs/iam-policy-autopilot> | Apache-2.0 | 370 | 2026-06-02 | IAM least-privilege generator + MCP | Pairs with Cedar |
| microsoft/mcp (Azure MCP) | cloud-providers | <https://github.com/microsoft/mcp> | MIT | 0 | 2026-06-03 | Official Azure MCP for AKS/Cosmos/KV/Monitor | Built into VS 2026 |
| googleapis/gcloud-mcp | cloud-providers | <https://github.com/googleapis/gcloud-mcp> | Apache-2.0 | 0 |  | Official GCP gcloud MCP | ADC auth |
| Cloudflare official MCP servers | cloud-providers | <https://github.com/cloudflare/mcp-server-cloudflare> | Apache-2.0 | 0 | 2026-04-15 | Workers/R2/D1/DNS/observability MCPs + Code Mode | Remote OAuth required |
| digitalocean/digitalocean-mcp | cloud-providers | <https://github.com/digitalocean/digitalocean-mcp> | Apache-2.0 | 0 | 2026-05-01 | Official DO MCP across 9 services | Remote, PAT auth |
| cloudquery/cloudquery (CQ MCP) | cloud-providers | <https://github.com/cloudquery/cloudquery> | MPL-2.0 | 0 | 2026-05-01 | Cross-cloud asset inventory MCP | Postgres/ClickHouse backed |
| velero-mcp (benzaidfoued) | backup-dr | <https://github.com/benzaidfoued/velero-mcp> | MIT | 2 | 2025-11-15 | Read-only Velero CRD MCP | Only Velero-specific MCP |
| restic-mcp (mohsenil85) | backup-dr | <https://github.com/mohsenil85/restic-mcp> | MIT | 1 |  | Restic CLI MCP for full DR verify/restore | Cedar-gate write tools |
| nomagicln/mcp-harbor | registries | <https://github.com/nomagicln/mcp-harbor> | MIT | 7 | 2025-04-01 | Harbor 2.x API MCP | Light maintenance |
| mshegolev/harbor-registry-mcp | registries | <https://github.com/mshegolev/harbor-registry-mcp> | MIT | 0 | 2026-05-02 | Newer Harbor MCP with cleanup tools | Eval candidate |
| quay/quay-mcp-server | registries | <https://github.com/quay/quay-mcp-server> | Apache-2.0 | 2 | 2025-06-16 | Official Quay MCP | Slightly stale, vendor-blessed |
| shizhMSFT/oras-mcp | registries | <https://github.com/shizhMSFT/oras-mcp> | Apache-2.0 | 0 |  | Multi-registry OCI inspection MCP | Microsoft-employee maintained |
| okta/okta-mcp-server | identity-sso | <https://github.com/okta/okta-mcp-server> | Apache-2.0 | 42 | 2026-06-03 | Official Okta MCP w/ OAuth2 device flow | Pairs with Cedar |
| sshaaf/keycloak-mcp-server | identity-sso | <https://github.com/sshaaf/keycloak-mcp-server> |  | 42 | 2026-05-19 | Most comprehensive Keycloak MCP | License needs clarification |
| Samik081/mcp-authentik | identity-sso | <https://github.com/Samik081/mcp-authentik> | MIT | 3 | 2026-05-25 | goauthentik MCP | Vendor-endorsed pattern |
| agentic-community/mcp-gateway-registry | identity-sso | <https://github.com/agentic-community/mcp-gateway-registry> | Apache-2.0 | 678 | 2026-06-04 | Enterprise MCP gateway w/ OAuth + Keycloak/Entra | Strongest gateway reference |
| gensecaihq/Wazuh-MCP-Server | cybersec-soc | <https://github.com/gensecaihq/Wazuh-MCP-Server> | MIT | 180 | 2026-03-31 | Production Wazuh SIEM MCP w/ MITRE mapping | Active |
| socfortress/velociraptor-mcp-server | cybersec-soc | <https://github.com/socfortress/velociraptor-mcp-server> | AGPL-3.0 | 39 | 2026-04-15 | Velociraptor DFIR MCP | AGPL — external only |
| solomonneas/thehive-mcp | cybersec-soc | <https://github.com/solomonneas/thehive-mcp> | MIT | 1 | 2026-06-03 | TheHive cases/alerts/observables MCP | Part of 7-MCP suite |
| solomonneas/misp-mcp | cybersec-soc | <https://github.com/solomonneas/misp-mcp> | MIT | 0 | 2026-06-03 | MISP threat intel MCP | Companion to thehive-mcp |
| containers/kubernetes-mcp-server | sre-tooling | <https://github.com/containers/kubernetes-mcp-server> | Apache-2.0 | 1652 | 2026-06-03 | Distro-agnostic K8s/OpenShift MCP w/ non-destructive mode | Strongest baseline pick |
| giantswarm/mcp-prometheus | sre-tooling | <https://github.com/giantswarm/mcp-prometheus> | Apache-2.0 | 220 | 2026-04-22 | 18 read-only Prom/Mimir tools | Bare-Prom fallback |
| HolmesGPT | sre-tooling | <https://github.com/HolmesGPT/holmesgpt> | Apache-2.0 | 3030 | 2026-06-03 | CNCF Sandbox SRE agent, native MCP server support | Token-heavy; budget via Cedar |
| k8sgpt-ai/k8sgpt | sre-tooling | <https://github.com/k8sgpt-ai/k8sgpt> | Apache-2.0 | 7500 | 2026-05-20 | CNCF K8s diagnostician w/ embedded MCP | Read-only by default |
| PagerDuty/pagerduty-mcp-server | sre-tooling | <https://github.com/PagerDuty/pagerduty-mcp-server> | Apache-2.0 | 380 | 2026-05-28 | Official PD MCP + Claude Code plugin | Companion plugin worth mining |

### skill

| name | domain | url | license | stars | last_activity | fit_reason | notes |
|---|---|---|---|---|---|---|---|
| qwedsazxc78/devops-ai-skill | argocd | <https://github.com/qwedsazxc78/devops-ai-skill> |  | 2 | 2026-06-01 | Cross-CLI DevOps AI Skill Pack w/ Zeus GitOps agent | Multi-host packaging reference |
| sigridjineth/hello-ansible-skills | ansible | <https://github.com/sigridjineth/hello-ansible-skills> | MIT | 62 | 2026-01-17 | Most-starred Ansible Claude Code skills | MIT-friendly to vendor |
| leogallego/claude-ansible-skills | ansible | <https://github.com/leogallego/claude-ansible-skills> | GPL-3.0 | 9 | 2026-05-03 | CoP-aligned Ansible skills, severity-classified | GPL — re-implement, do not vendor |
| 3A2DEV/ansible-designer | ansible | <https://github.com/3A2DEV/ansible-designer> | Apache-2.0 | 5 | 2026-04-01 | FQCN/secret-masking/diff-before-write skill | Strong policy posture match |
| antonbabenko/terraform-skill | terraform | <https://github.com/antonbabenko/terraform-skill> | NOASSERTION | 1980 | 2026-06-03 | Largest community Terraform/OpenTofu skill | Port patterns, verify license |
| LukasNiessen/terrashark | terraform | <https://github.com/LukasNiessen/terrashark> | MIT | 394 | 2026-05-24 | Anti-hallucination Terraform skill | Pair with official MCP |
| terramate-io/agent-skills | terraform | <https://github.com/terramate-io/agent-skills> | MIT | 32 | 2026-02-02 | Vendor skills for stacks, drift, modules, CI/CD | Drift recipes mirror IR surface |
| hashi-demo-lab/claude-skill-hcp-terraform | terraform | <https://github.com/hashi-demo-lab/claude-skill-hcp-terraform> |  | 0 |  | HCP Terraform Stacks skill | Verify license/activity |
| hashicorp/agent-skills (packer) | packer | <https://github.com/hashicorp/agent-skills> | MPL-2.0 | 650 | 2026-05-28 | Official Packer Builders + HCP skills | MPL-2.0; vendor or symlink |
| fluxcd/agent-skills | config-mgmt | <https://github.com/fluxcd/agent-skills> | Apache-2.0 | 163 | 2026-04-19 | Three GitOps skills (knowledge/audit/debug) | Multi-agent compatible |
| LukasNiessen/kubernetes-skill | config-mgmt | <https://github.com/LukasNiessen/kubernetes-skill> | MIT | 328 | 2026-05-01 | Failure-mode-first Helm/Kustomize skill | Portable safe-manifest-authoring |
| etcd Claude Code skill | backup-dr | <https://claudskills.com/skills/etcd/> |  | 0 | 2026-03-01 | etcd backup/restore + TLS skill | Verify SKILL.md license |
| mukul975/Anthropic-Cybersecurity-Skills | cybersec-soc | <https://github.com/mukul975/Anthropic-Cybersecurity-Skills> | Apache-2.0 | 13890 | 2026-06-01 | 754 skills mapped to MITRE/NIST/D3FEND | Cherry-pick ~30 |
| trufflesecurity/trufflehog (.claude/skills) | secrets-mgmt | <https://github.com/trufflesecurity/trufflehog> | AGPL-3.0 | 26600 | 2026-06-02 | Upstream-shipped IR scanner skills | Shell out, never vendor source |
| Scoutflo/Scoutflo-SRE-Playbooks | sre-tooling | <https://github.com/Scoutflo/Scoutflo-SRE-Playbooks> | MIT | 150 | 2026-04-10 | AWS+K8s SRE runbooks as markdown | Import as skills |
| prowler-cloud/prowler (Claude Code plugin) | cloud-providers | <https://github.com/prowler-cloud/prowler> | Apache-2.0 | 0 | 2026-05-30 | Plugin: Prowler MCP + framework-compliance-triage skill | Plugin layout mirrors opsbench |

### agent

| name | domain | url | license | stars | last_activity | fit_reason | notes |
|---|---|---|---|---|---|---|---|
| docker/cagent | docker | <https://github.com/docker/cagent> | Apache-2.0 | 3000 | 2026-06-03 | YAML-declarative multi-agent runtime, OCI-packaged | Provider-agnostic |
| kagent-dev/kagent | docker, crossplane, k8s-distros, ingress, operators, sre-tooling | <https://github.com/kagent-dev/kagent> | Apache-2.0 | 2500-2900 | 2026-06-02 | CNCF Sandbox K8s-native agent framework w/ CRDs + ToolServers | Reference architecture |
| HolmesGPT | service-mesh, observability, cybersec-soc, sre-tooling | <https://github.com/HolmesGPT/holmesgpt> | Apache-2.0 | 2554-3030 | 2026-06-03 | Agentic SRE investigator across Prom/Loki/Tempo/K8s | Toolset YAML = great prior art |
| k8sgpt-ai/k8sgpt | service-mesh, sre-tooling | <https://github.com/k8sgpt-ai/k8sgpt> | Apache-2.0 | 6800-7836 | 2026-05-31/2026-06-03 | K8s analyzer with structured findings + Istio coverage | Pair with Cedar/evidence |

### template-blueprint

| name | domain | url | license | stars | last_activity | fit_reason | notes |
|---|---|---|---|---|---|---|---|
| akuity/kargo | argocd | <https://github.com/akuity/kargo> | Apache-2.0 | 3335 | 2026-06-03 | ArgoCD-native promotion orchestrator w/ Custom Steps | Maps 1:1 onto evidence producers |
| argoproj-labs/argocd-image-updater | argocd, operators | <https://github.com/argoproj-labs/argocd-image-updater> | Apache-2.0 | 1681-2300 | 2026-06-03 | Auto image promotion w/ Git write-back | Blueprint for Cedar-policy-gated image bumps |
| compose-spec/compose-go | docker | <https://github.com/compose-spec/compose-go> | Apache-2.0 | 2200 | 2026-05-20 | Reference compose YAML parser/validator | Deterministic pre-apply gate |
| docker/cagent-action | docker | <https://github.com/docker/cagent-action> | Apache-2.0 | 0 | 2026-05 | GitHub Action running cagent in CI | Composable agents-as-actions |
| redhat-cop/ansible.mcp_builder | ansible | <https://github.com/redhat-cop/ansible.mcp_builder> | GPL-3.0 | 2 | 2026-01-16 | Ansible collection that installs MCPs into EEs | GPL — copy architecture |
| ric03uec/clawrium | ansible | <https://github.com/ric03uec/clawrium> | Apache-2.0 | 24 | 2026-06-03 | CLI for deploying/upgrading AI-agent fleets via Ansible | Fleet rollout pattern |
| ansible/event-driven-ansible | ansible | <https://github.com/ansible/event-driven-ansible> | Apache-2.0 | 0 | 2026-05-11 | EDA collection — rulebook activations | Pair w/ AAP MCP |
| SecKatie/ansible-agents | ansible | <https://github.com/SecKatie/ansible-agents> | Apache-2.0 | 3 | 2026-04-01 | Pydantic-AI Ansible collection w/ whitelisting | Mirrors opsbench security model |
| terrateamio/terrateam | terraform | <https://github.com/terrateamio/terrateam> |  | 0 |  | GitOps orchestrator w/ cost/drift/RBAC/policy-override | Apply-gating pattern |
| agentopology/agentopology | terraform | <https://github.com/agentopology/agentopology> | Apache-2.0 | 86 | 2026-05-30 | Declarative .at files for cross-host agent teams | Multi-host portability blueprint |
| docker/mcp-registry | docker | <https://github.com/docker/mcp-registry> | MIT | 497 | 2026-05 | Curated catalog of signed MCP servers with SBOMs | Source MCPs from here |
| upbound/up | crossplane | <https://github.com/upbound/up> | Apache-2.0 | 0 | 2026-06-03 | Upbound control-plane CLI/project scaffolding | Wrap subcommands |
| kgateway-dev/kgateway | ingress-and-gateway | <https://github.com/kgateway-dev/kgateway> | Apache-2.0 | 5500 | 2026-05-21 | CNCF Envoy Gateway-API impl w/ AI policies | Skill target for ingress fixes |
| envoyproxy/ai-gateway | ingress-and-gateway | <https://github.com/envoyproxy/ai-gateway> | Apache-2.0 | 1700 | 2026-05-05 | Envoy AI gateway brokering 16+ LLM providers | LLM egress reference |
| alibaba/higress | ingress-and-gateway | <https://github.com/alibaba/higress> | Apache-2.0 | 8500 | 2026-05-26 | Istio+Envoy gateway w/ MCP hosting, openapi-to-mcp | Migration skill pattern |
| ksail (devantler-tech) | k8s-distros | <https://github.com/devantler-tech/ksail> | NOASSERTION | 147 | 2026-06-03 | Provision Kind/K3d/Talos/VCluster/KWOK/EKS + MCP | PolyForm Shield — flag in SBOM |
| kagent-dev/kmcp | ingress-and-gateway, sre-tooling | <https://github.com/kagent-dev/kmcp> | Apache-2.0 | 464 | 2026-05-05 | Toolkit for productionizing MCP servers on K8s | Devloop for opsbench MCPs |
| keptn/lifecycle-toolkit | progressive-delivery | <https://github.com/keptn/lifecycle-toolkit> | Apache-2.0 | 1400 | 2026-04-30 | CNCF SLO-driven quality gates | KeptnApp/Eval CRDs as patterns |
| njayp/ophis | config-mgmt | <https://github.com/njayp/ophis> | Apache-2.0 | 87 | 2026-02-18 | Converts any Cobra CLI to MCP server | Wrap kustomize/kapp/ytt etc. |
| open-telemetry/opentelemetry-collector-contrib | observability | <https://github.com/open-telemetry/opentelemetry-collector-contrib> | Apache-2.0 | 4709 | 2026-06-04 | Receiver/processor/exporter catalog | Generate Collector configs |
| cedar-policy/cedar-for-agents | policy-engines | <https://github.com/cedar-policy/cedar-for-agents> | Apache-2.0 | 30 | 2026-05-26 | Schema generator from MCP tool descriptions | Direct extension of opsbench Cedar |
| vectimus/vectimus | policy-engines | <https://github.com/vectimus/vectimus> | Apache-2.0 | 33 | 2026-06-02 | Cedar deterministic agent policy engine, 78 policies/369 rules | Importable policy catalog |
| sondera-ai/sondera-coding-agent-hooks | policy-engines | <https://github.com/sondera-ai/sondera-coding-agent-hooks> | MIT | 211 | 2026-05-01 | Per-agent Cedar hook adapters across hosts | Portable hook-normalization layer |
| tomjwxf/scopeblind-gateway | policy-engines | <https://github.com/tomjwxf/scopeblind-gateway> | MIT | 8 | 2026-04-11 | Cedar-evaluating MCP proxy w/ Ed25519-signed receipts | Near-exact opsbench analog |
| falcosecurity/prempti | security-scanners | <https://github.com/falcosecurity/prempti> | Apache-2.0 | 143 | 2026-05-01 | Falco-powered policy boundary on tool calls | Dual-layer w/ Cedar |
| kanisterio/kanister | backup-dr | <https://github.com/kanisterio/kanister> | Apache-2.0 | 876 | 2026-05-13 | App-aware backup operator w/ Blueprint/ActionSet CRDs | App-consistent DR gap |
| k8up-io/k8up | backup-dr | <https://github.com/k8up-io/k8up> | BSD-3-Clause | 978 | 2026-03-25 | Restic-based K8s backup operator | CRD pattern blueprint |
| stashed/stash (KubeStash) | backup-dr | <https://github.com/stashed/stash> | Apache-2.0 | 1400 | 2025-10-24 | Mature backup operator | Successor moving to KubeStash |
| aws/agent-toolkit-for-aws | cloud-providers | <https://github.com/aws/agent-toolkit-for-aws> | Apache-2.0 | 779 | 2026-06-03 | Official AWS successor toolkit for agents | Skill manifest format reference |
| FunnyWolf/agentic-soc-platform | cybersec-soc | <https://github.com/FunnyWolf/agentic-soc-platform> | MIT | 841 | 2026-06-03 | Open-source agentic SOC platform plugin | Blueprint for team-soc-analyst |
| harness/harness-skills | ci-cd | <https://github.com/harness/harness-skills> | Apache-2.0 | 27 | 2026-06-03 | 70+ vendor skills across modes | Reference for skill taxonomy |
| anthropics/claude-code-action | ci-cd | <https://github.com/anthropics/claude-code-action> | MIT | 7900 | 2026-05-15 | Official Claude Code Action runner | Host opsbench as a runner |
| anthropics/claude-cookbooks SRE | sre-tooling | <https://github.com/anthropics/claude-cookbooks> | MIT | 14000 | 2026-05-22 | Canonical SRE agent + sre_mcp_server.py | Reference for team-IR alignment |
| microsoft/mcp-gateway | sre-tooling | <https://github.com/microsoft/mcp-gateway> | MIT | 663 | 2026-05-28 | Reverse-proxy + lifecycle for MCP servers in K8s | Production deploy story |

### cli-anything-wrap

| name | domain | url | license | stars | last_activity | fit_reason | notes |
|---|---|---|---|---|---|---|---|
| argocd CLI | argocd | <https://github.com/argoproj/argo-cd> | Apache-2.0 | 0 |  | Canonical CLI fallback for air-gapped | Universal fallback |
| docker (Scout CLI) | docker | <https://docs.docker.com/scout/> |  | 0 | 2026-04 | Built-in SBOM + CVE + policy CLI | Closed-source, but evidence-friendly |
| aquasecurity/trivy | docker, terraform | <https://github.com/aquasecurity/trivy> | Apache-2.0 | 35400 | 2026-06 | FOSS image/IaC/secret/K8s scanner | SARIF/CycloneDX outputs |
| docker/docker-language-server | docker | <https://github.com/docker/docker-language-server> | Apache-2.0 | 173 | 2025-10-14 | LSP w/ Scout CVE hovers | Deterministic Dockerfile review |
| docker/buildx | docker | <https://github.com/docker/buildx> | Apache-2.0 | 4000 | 2026-06 | Multi-arch builds w/ provenance/SBOM flags | Evidence-friendly |
| wagoodman/dive | docker | <https://github.com/wagoodman/dive> | MIT | 47000 | 2025-12 | Layer-by-layer image explorer | CI mode |
| ansible/ansible-lint | ansible | <https://github.com/ansible/ansible-lint> | GPL-3.0 | 0 | 2026-04-01 | Canonical Ansible linter w/ --fix | Shell out only |
| infracost/infracost | terraform | <https://github.com/infracost/infracost> | Apache-2.0 | 12327 | 2026-06-03 | Terraform plan cost intel | Pre-Cedar annotation |
| bridgecrewio/checkov | terraform | <https://github.com/bridgecrewio/checkov> | Apache-2.0 | 0 |  | Graph IaC scanner w/ 1000+ TF policies | SARIF for Cedar |
| terraform-linters/tflint | terraform | <https://github.com/terraform-linters/tflint> | MPL-2.0 | 0 |  | Provider-aware TF linter | Pair w/ Checkov/Trivy |
| gruntwork-io/terragrunt | terraform | <https://github.com/gruntwork-io/terragrunt> | MIT | 0 |  | DRY TF/Tofu w/ dep graphs | Limit subcommand surface |
| opentofu/opentofu | terraform | <https://github.com/opentofu/opentofu> | MPL-2.0 | 0 |  | OSS Terraform fork | Branch tofu vs terraform |
| ops0-ai/ops0-cli | terraform | <https://github.com/ops0-ai/ops0-cli> | NOASSERTION | 68 | 2026-05-16 | Guardrail CLI between agents and cloud | Verify license |
| hashicorp/packer + plugins | packer | <https://github.com/hashicorp/packer> | BUSL-1.1 | 15696 | 2026-06-03 | Canonical Packer CLI + AWS/Azure plugins | BUSL — wrap only |
| mondoohq/packer-plugin-cnspec | packer | <https://github.com/mondoohq/packer-plugin-cnspec> | BUSL-1.1 | 27 | 2026-06-03 | CVE+misconfig scans during image builds | Shell out, not vendor |
| bank-vaults/bank-vaults | vault | <https://github.com/bank-vaults/bank-vaults> | Apache-2.0 | 2300 | 2026-05-25 | CNCF Sandbox unseal/rekey/init CLI | Fills MCP Transit/HSM gaps |
| FalcoSuessgott/vkv | vault | <https://github.com/FalcoSuessgott/vkv> | MIT | 109 | 2026-05-19 | Single-purpose KV CLI w/ encrypted export | Pairs w/ evidence sealing |
| crossplane/crossplane (crank CLI) | crossplane | <https://github.com/crossplane/crossplane> | Apache-2.0 | 11737 | 2026-06-03 | Render/validate/beam/trace subcommands | Local composition simulation |
| swisscom/crossplane-composition-tester | crossplane | <https://github.com/swisscom/crossplane-composition-tester> | Apache-2.0 | 13 | 2025-12-04 | BDD test framework for compositions | Evidence-producer |
| cilium/pwru | network-diag | <https://github.com/cilium/pwru> | Apache-2.0 | 3761 | 2026-05-28 | eBPF kernel packet tracer | Cap-restrict via Cedar |
| microsoft/retina | network-diag | <https://github.com/microsoft/retina> | MIT | 3143 | 2026-06-02 | MS eBPF observability for AKS w/ blob captures | AKS-native, evidence-friendly |
| eldadru/ksniff | network-diag | <https://github.com/eldadru/ksniff> | Apache-2.0 | 3471 | 2024-08-02 | kubectl plugin for in-pod tcpdump | Canonical pod sniffing |
| inspektor-gadget/inspektor-gadget | network-diag | <https://github.com/inspektor-gadget/inspektor-gadget> | Apache-2.0 | 2825 | 2026-06-03 | CNCF eBPF data collection framework | Security audited |
| nicolaka/netshoot | network-diag | <https://github.com/nicolaka/netshoot> | Apache-2.0 | 10737 | 2026-04-16 | Reference debug-container image | Standard ephemeral-container image |
| k0sproject/k0sctl | k8s-distros | <https://github.com/k0sproject/k0sctl> | Apache-2.0 | 561 | 2026-05-20 | YAML-driven k0s lifecycle CLI w/ AGENTS.md | Cedar-gated upgrade skill |
| kubernetes-sigs/kubespray | k8s-distros | <https://github.com/kubernetes-sigs/kubespray> | Apache-2.0 | 17500 | 2026-05-25 | Battle-tested Ansible cluster lifecycle | Wrap curated subset |
| canonical/microk8s | k8s-distros | <https://github.com/canonical/microk8s> | Apache-2.0 | 8600 | 2026-06-01 | Snap distro for edge | Snap-only install constraint |
| siderolabs/talos | k8s-distros | <https://github.com/siderolabs/talos> | MPL-2.0 | 7800 | 2026-06-03 | Immutable OS + talosctl | Pair w/ Nosmoht MCP |
| akuity/kargo | progressive-delivery | <https://github.com/akuity/kargo> | Apache-2.0 | 2400 | 2026-05-28 | GitOps promotion engine | Wrap CLI surface |
| argoproj/argo-rollouts | progressive-delivery | <https://github.com/argoproj/argo-rollouts> | Apache-2.0 | 3100 | 2026-03-20 | Canonical canary/blue-green controller + kubectl plugin | Tight allowlist |
| operator-framework/operator-sdk | operators | <https://github.com/operator-framework/operator-sdk> | Apache-2.0 | 7651 | 2026-05-26 | Scaffolding + bundle build/validate | Deterministic, evidence-friendly |
| operator-framework/kubectl-operator | operators | <https://github.com/operator-framework/kubectl-operator> | Apache-2.0 | 140 | 2025-12-10 | OLM package manager kubectl plugin | Small predictable surface |
| getsops/sops | secrets-mgmt | <https://github.com/getsops/sops> | MPL-2.0 | 22000 | 2026-05-16 | CNCF Sandbox encrypted-in-git secrets | No upstream MCP — wrap |
| bitnami-labs/sealed-secrets | secrets-mgmt | <https://github.com/bitnami-labs/sealed-secrets> | Apache-2.0 | 9100 | 2026-05-21 | Kubeseal controller for K8s-native sealed secrets | Pairs w/ Cedar gating |
| trufflesecurity/trufflehog | secrets-mgmt | <https://github.com/trufflesecurity/trufflehog> | AGPL-3.0 | 26600 | 2026-06-02 | 800+ secret types + live verification | AGPL — shell out only |
| gitleaks/gitleaks | secrets-mgmt | <https://github.com/gitleaks/gitleaks> | MIT | 27500 | 2026-03-21 | Fastest pre-commit secret scanner | Evidence-sealable SARIF |
| sigstore/cosign | registries | <https://github.com/sigstore/cosign> | Apache-2.0 | 5997 | 2026-06-03 | Image signing/verification CLI | Sign forensic bundles |
| anchore/syft | registries | <https://github.com/anchore/syft> | Apache-2.0 | 9064 | 2026-06-02 | SBOM generator | Seal SBOMs in evidence |
| anchore/grype | registries, security-scanners | <https://github.com/anchore/grype> | Apache-2.0 | 11500-12331 | 2026-06-03 | Second-source CVE scanner | Cross-check w/ Trivy |
| containers/skopeo | registries | <https://github.com/containers/skopeo> | Apache-2.0 | 10939 | 2026-06-01 | Daemonless registry CLI for inspect/copy | Air-gapped IR sandbox |
| google/go-containerregistry (crane) | registries | <https://github.com/google/go-containerregistry> | Apache-2.0 | 3900 | 2026-06-02 | Fast registry CLI | Read-only metadata workflows |
| oras-project/oras | registries | <https://github.com/oras-project/oras> | Apache-2.0 | 2289 | 2026-06-01 | OCI Artifact CLI | Push sealed evidence as artifacts |
| int128/kubelogin | identity-sso | <https://github.com/int128/kubelogin> | Apache-2.0 | 2286 | 2026-05-31 | Canonical kubectl OIDC plugin | SSO-backed kubeconfig for agents |
| k8sgpt-ai/k8sgpt (CLI) | observability, cloud-providers | <https://github.com/k8sgpt-ai/k8sgpt> | Apache-2.0 | 7836 | 2026-05-31 | Structured K8s findings via CLI | JSON output evidence-friendly |
| open-policy-agent/conftest | policy-engines | <https://github.com/open-policy-agent/conftest> | Apache-2.0 | 3200 | 2026-04-15 | Rego CLI vs manifests/IaC/SBOM | No MCP — opportunity |
| open-policy-agent/opa | policy-engines | <https://github.com/open-policy-agent/opa> | Apache-2.0 | 11800 | 2026-05-28 | CNCF graduated OPA core | Bedrock CLI |
| open-policy-agent/gatekeeper (gator) | policy-engines | <https://github.com/open-policy-agent/gatekeeper> | Apache-2.0 | 4200 | 2026-04-27 | OPA admission controller + gator offline tester | Sealed-evidence replay |
| kyverno/kyverno | policy-engines | <https://github.com/kyverno/kyverno> | Apache-2.0 | 7800 | 2026-05-18 | Kyverno CLI for validate/apply/mutate | LLM-friendly JSON |
| sigmaHQ/sigma-cli | cybersec-soc | <https://github.com/SigmaHQ/sigma-cli> |  | 192 | 2026-05-10 | Sigma -> SIEM rule converter | License verify needed |
| Velocidex/velociraptor | cybersec-soc | <https://github.com/Velocidex/velociraptor> | NOASSERTION | 3995 | 2026-06-03 | DFIR binary, VQL + hunts | Velocidex license — wrap only |
| armyknife-social/kryptonclaw | ci-cd | <https://github.com/armyknife-social/kryptonclaw> | MIT | 15 | 2026-03-01 | 30+ CI/CD attack-pattern Rust scanner + MCP | SARIF for evidence sealing |
| GoogleCloudPlatform/kubectl-ai | sre-tooling | <https://github.com/GoogleCloudPlatform/kubectl-ai> | Apache-2.0 | 8500 | 2026-05-20 | NL kubectl wrapper w/ multi-LLM + MCP | --dry-run first |
| affaan-m/agentshield | ci-cd | <https://github.com/affaan-m/agentshield> | MIT | 787 | 2026-06-01 | .claude config scanner + MCP w/ 102 rules | Pre-flight for opsbench configs |

### cross-reference

| name | domain | url | license | stars | last_activity | fit_reason | notes |
|---|---|---|---|---|---|---|---|
| argoproj-labs/argocd-agent | argocd | <https://github.com/argoproj-labs/argocd-agent> | Apache-2.0 | 535 | 2026-06-03 | Multi-cluster ArgoCD control plane | Pair w/ MCP for multi-cluster IR |
| devopssessionsjvr/agentic-ai-demo | argocd | <https://github.com/devopssessionsjvr/agentic-ai-demo> |  | 305 | 2026-05-12 | AI-driven CI/CD + canary + MTTR dashboards | Mine auto-fix PR pattern |
| ajeetraina/docker-mcp-toolkit | docker | <https://github.com/ajeetraina/docker-mcp-toolkit> |  | 0 | 2026-05 | Community-curated MCP catalog index | Discovery |
| ansible/awx | ansible | <https://github.com/ansible/awx> | Apache-2.0 | 0 | 2026-05-30 | Upstream OSS of AAP controller | API overlap with AAP MCP |
| Red Hat Ansible Lightspeed | ansible | <https://developers.redhat.com/products/ansible/lightspeed> |  | 0 | 2026-05-01 | Closed AI assistant + AAP Interactive Assistant | Position opsbench as policy layer |
| BagelHole/DevOps-Security-Agent-Skills | terraform | <https://github.com/BagelHole/DevOps-Security-Agent-Skills> | MIT | 28 | 2026-05-22 | 80+ agent-ready DevOps skill bundle | Mine TF subskills |
| hammadhaqqani/awesome-devops-ai | terraform | <https://github.com/hammadhaqqani/awesome-devops-ai> | CC0-1.0 | 10 | 2026-05-29 | Curated 459-tool DevOps AI list | Feed for watch skill |
| hashicorp-education/learn-packer-hcp-golden-image | packer | <https://github.com/hashicorp-education/learn-packer-hcp-golden-image> | MPL-2.0 | 0 |  | Reference golden-image pipeline | Structural template |
| osbuild/osbuild | packer | <https://github.com/osbuild/osbuild> | Apache-2.0 | 269 | 2026-06-03 | RHEL/Fedora image-build alternative | Air-gapped scenarios |
| rlopez133/mcp (Ansible+K8s MCP bundle) | ansible | <https://github.com/rlopez133/mcp> |  | 0 | 2025-12-01 | Red Hat-employee Claude Desktop bundle | Reference only |
| kguardian-dev/kguardian | ingress-and-gateway, k8s-distros | <https://github.com/kguardian-dev/kguardian> | Apache-2.0 | 250 | 2026-04-10 | eBPF runtime profile generator + MCP | Post-incident hardening |
| Kubernetes AI Gateway Working Group | ingress-and-gateway | <https://www.kubernetes.dev/blog/2026/03/09/announcing-ai-gateway-wg/> |  | 0 | 2026-03-09 | Upstream WG defining AI gateway CRDs | Spec source |
| meshery/meshery | service-mesh | <https://github.com/meshery/meshery> | Apache-2.0 | 5500 | 2026-06-03 | CNCF multi-mesh manager + MeshMate AI | Adapter pattern blueprint |
| solo-io/gloo | service-mesh | <https://github.com/solo-io/gloo> | Apache-2.0 | 4100 | 2026-06-03 | glooctl debug/inspect | Solo enterprise users |
| ahmedasmar/devops-claude-skills | config-mgmt | <https://github.com/ahmedasmar/devops-claude-skills> |  | 0 | 2026-05-01 | DevOps Claude Code skills marketplace | Patterns only |
| anthropics/skills (official) | config-mgmt | <https://github.com/anthropics/skills> | MIT | 0 | 2026-05-01 | Anthropic's canonical skill conventions | Format reference |
| robusta-dev/holmesgpt (toolsets) | service-mesh | <https://github.com/robusta-dev/holmesgpt> | MIT | 3500 | 2026-06-03 | Built-in Istio runbooks + toolset YAML schema | Toolset prior art |
| pixie-io/pixie | observability | <https://github.com/pixie-io/pixie> | Apache-2.0 | 5600 | 2026-05-20 | eBPF auto-decoding observability | Verify project health |
| opendatahub-io/rhoai-observability-mcp | observability | <https://github.com/opendatahub-io/rhoai-observability-mcp> | MIT | 4 | 2026-05-19 | Reference unifying Prom+AM+Loki+Grafana per workload | Architecture |
| hackersatyamrastogi/pentesting-cyber-mcp | security-scanners | <https://github.com/hackersatyamrastogi/pentesting-cyber-mcp> | MIT | 16 | 2026-01-27 | Catalog of 50+ MCP security servers | Discovery |
| Horizon-Digital-Engineering/security-mcp | security-scanners | <https://github.com/Horizon-Digital-Engineering/security-mcp> | MIT | 0 | 2026-04-21 | Unified MCP w/ normalized finding schema | Schema concept |
| FuzzingLabs/mcp-security-hub | network-diag | <https://github.com/FuzzingLabs/mcp-security-hub> | MIT | 567 | 2026-04-08 | Bundled MCPs including Nmap | Restrict to passive scans |
| open-feature/mcp | progressive-delivery | <https://github.com/open-feature/mcp> | Apache-2.0 | 120 | 2026-05-01 | Cross-ref above as well |  |
| Akuity Intelligence | progressive-delivery | <https://docs.akuity.io/intelligence/akuity-agents/on-call-agent/> |  | 0 | 2026-05-20 | Closed SRE loop on Argo CD/Kargo | Architecture only |
| open-telemetry/opentelemetry-operator | observability | <https://github.com/open-telemetry/opentelemetry-operator> | Apache-2.0 | 1706 | 2026-06-03 | Operator for managing OTel Collector | Shell out via kubectl |
| Permit MCP Gateway | policy-engines | <https://docs.permit.io/permit-mcp-gateway/overview> |  | 0 | 2026-05-01 | OPA+ReBAC MCP authz proxy | Closed SaaS, OSS middleware exists |
| agentic-contract (agentralabs) | policy-engines | <https://github.com/agentralabs/agentic-contract> | MIT | 7 | 2026-03-14 | Rust policy engine, 22 governance tools, BLAKE3-sealed | Core 22 tools reasonable |
| IBM/mcp-context-forge | policy-engines | <https://github.com/IBM/mcp-context-forge> | Apache-2.0 | 3800 | 2026-05-26 | MCP/A2A/REST federation registry w/ RBAC | v1.0 GA |
| external-secrets/external-secrets | secrets-mgmt, vault | <https://github.com/external-secrets/external-secrets> | Apache-2.0 | 6646 | 2026-06-03 | Multi-backend K8s secrets sync | Already in MCP Registry |
| kubeshop/botkube | cloud-providers | <https://github.com/kubeshop/botkube> | MIT | 0 |  | Slack/Teams ChatOps bridge for K8s | Approval delivery surface |
| distribution/distribution | registries | <https://github.com/distribution/distribution> | Apache-2.0 | 10456 | 2026-05-31 | CNCF OCI registry reference impl | Protocol-level forensic recipes |
| project-zot/zot | registries | <https://github.com/project-zot/zot> | Apache-2.0 | 2300 | 2026-06-02 | Vendor-neutral OCI registry w/ mirror sync | Air-gapped IR replay |
| kyverno/kyverno (verifyImages) | registries | <https://github.com/kyverno/kyverno> | Apache-2.0 | 7803 | 2026-06-03 | Admission posture audit | Cosign enforcement check |
| sse-secure-systems/connaisseur | registries | <https://github.com/sse-secure-systems/connaisseur> | Apache-2.0 | 473 | 2026-06-03 | Lighter image-signature admission controller | Verification-only posture |
| quay/clair | registries | <https://github.com/quay/clair> | Apache-2.0 | 10994 | 2026-06-02 | CVE static analysis for Quay | Pair w/ Quay MCP |
| agentic-community/mcp-gateway-registry | registries | <https://github.com/agentic-community/mcp-gateway-registry> |  | 0 | 2026-05-01 | Enterprise MCP gateway w/ OAuth + audit | Verify license |
| casdoor/casdoor | identity-sso | <https://github.com/casdoor/casdoor> | Apache-2.0 | 13720 | 2026-06-03 | Agent-first IAM w/ MCP gateway | Reference recipe |
| tailscale/tsidp | identity-sso | <https://github.com/tailscale/tsidp> | BSD-3-Clause | 595 | 2026-05-25 | OIDC/OAuth IdP per tailnet | Network-anchored SSO ref |
| pomerium/pomerium | identity-sso | <https://github.com/pomerium/pomerium> | Apache-2.0 | 0 |  | Identity-aware proxy w/ Agentic Access Gateway | Cedar-compatible pattern |
| RunbookAI (Runbook-Agent) | backup-dr | <https://github.com/Runbook-Agent/RunbookAI> |  | 0 | 2026-04-01 | Hypothesis-driven IR agent w/ approval gating | Architectural fit |
| seriohub/vui-ui (Velero UI) | backup-dr | <https://github.com/seriohub/vui-ui> | Apache-2.0 | 100 | 2026-04-15 | Multi-cluster Velero dashboard | Data-shape ref |
| Agent-Threat-Rule/agent-threat-rules | cybersec-soc | <https://github.com/Agent-Threat-Rule/agent-threat-rules> | MIT | 244 | 2026-06-03 | Sigma-style detection for AI agent threats | Self-monitoring pack |
| RefractionPOINT/dfir-iris-mcp | cybersec-soc | <https://github.com/refractionpoint/dfir-iris-mcp> |  | 0 |  | 88 tools for DFIR-IRIS | Verify license/freshness |
| dagger/container-use | ci-cd | <https://github.com/dagger/container-use> | Apache-2.0 | 3800 | 2025-08-19 | Per-branch agent containers via Dagger | Verify maintenance |
| yoda-digital/mcp-gitlab-server | ci-cd | <https://github.com/yoda-digital/mcp-gitlab-server> | MIT | 53 | 2026-06-01 | 86-tool GitLab MCP | Watch for official GL MCP |
| raye-deng/open-code-review | ci-cd | <https://github.com/raye-deng/open-code-review> | BSL-1.1 | 24 | 2026-04-16 | AI code-quality gate + MCP | BSL — wrap only |
| WagnerAgent/awesome-mcp-servers-devops | sre-tooling | <https://github.com/WagnerAgent/awesome-mcp-servers-devops> | CC0-1.0 | 95 | 2026-05-11 | Production-biased DevOps MCP index | Weekly discovery feed |
| alibabacloud/ack-mcp-server | sre-tooling | <https://github.com/aliyun/alibabacloud-ack-mcp-server> | Apache-2.0 | 112 | 2026-04-29 | Container Service MCP | Tool-taxonomy mirror |
| headlamp-k8s/plugins (ai-assistant) | sre-tooling | <https://github.com/headlamp-k8s/plugins/tree/main/ai-assistant> | Apache-2.0 | 600 | 2026-05-12 | Headlamp AI Assistant w/ MCP wiring | UI/UX patterns |
| stacklok/toolhive | sre-tooling | <https://github.com/stacklok/toolhive> | Apache-2.0 | 1849 | 2026-06-03 | Cross-ref above |  |

### vendored

| name | domain | url | license | stars | last_activity | fit_reason | notes |
|---|---|---|---|---|---|---|---|
| compose-spec/compose-go | docker | <https://github.com/compose-spec/compose-go> | Apache-2.0 | 2200 | 2026-05-20 | Maintained by Docker for compose YAML validation | Library-callable |
| cedar-policy/cedar-for-agents | policy-engines | <https://github.com/cedar-policy/cedar-for-agents> | Apache-2.0 | 30 | 2026-05-26 | Multi-crate Cedar tooling for MCP schemas | Apache-2.0; vendor schema generator |
| babs/mcp-auth-proxy | identity-sso | <https://github.com/babs/mcp-auth-proxy> | Apache-2.0 | 10 | 2026-05-28 | OAuth 2.1 + OIDC bridge for MCP servers | Small enough to vendor |
| mcp-auth/python | identity-sso | <https://github.com/mcp-auth/python> | MIT | 57 | 2025-08-11 | Plug-and-play OAuth/OIDC lib for Python MCP servers | Mild staleness |
| mukul975/Anthropic-Cybersecurity-Skills | cybersec-soc | <https://github.com/mukul975/Anthropic-Cybersecurity-Skills> | Apache-2.0 | 13890 | 2026-06-01 | 754 NIST/MITRE skills | Cherry-pick |

## Per-domain findings

### argocd

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| argoproj-labs/mcp-for-argocd | <https://github.com/argoproj-labs/mcp-for-argocd> | mcp-server | high | mcp-recipe | Apache-2.0 | 481 | 2026-05-03 |
| akuity/kargo | <https://github.com/akuity/kargo> | operator | high | template-blueprint | Apache-2.0 | 3335 | 2026-06-03 |
| seatgeek/argocd-mcp | <https://github.com/seatgeek/argocd-mcp> | mcp-server | high | mcp-recipe |  | 0 |  |
| argoproj-labs/argocd-agent | <https://github.com/argoproj-labs/argocd-agent> | operator | high | cross-reference | Apache-2.0 | 535 | 2026-06-03 |
| qwedsazxc78/devops-ai-skill | <https://github.com/qwedsazxc78/devops-ai-skill> | claude-skill | high | template-blueprint |  | 2 | 2026-06-01 |
| argocd CLI | <https://github.com/argoproj/argo-cd> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 0 |  |
| matthisholleville/argocd-mcp | <https://github.com/matthisholleville/argocd-mcp> | mcp-server | high | mcp-recipe | Apache-2.0 | 9 | 2026-03-30 |
| argoproj-labs/argocd-image-updater | <https://github.com/argoproj-labs/argocd-image-updater> | operator | medium | template-blueprint | Apache-2.0 | 1681 | 2026-06-03 |
| severity1/argocd-mcp | <https://github.com/severity1/argocd-mcp> | mcp-server | medium | cross-reference |  | 12 | 2025-04-23 |
| alexei-led/k8s-mcp-server | <https://github.com/alexei-led/k8s-mcp-server> | mcp-server | medium | mcp-recipe |  | 210 | 2026-02-27 |
| xchangeee/claudernetes | <https://github.com/xchangeee/claudernetes> | pattern | medium | template-blueprint |  | 0 | 2026-02-03 |
| devopssessionsjvr/agentic-ai-demo | <https://github.com/devopssessionsjvr/agentic-ai-demo> | reference | medium | cross-reference |  | 305 | 2026-05-12 |

ArgoCD MCP is a crowded, fast-moving 2026 space: argoproj-labs/mcp-for-argocd is the de-facto official server but six competing implementations exist, with the most innovative reading ArgoCD's OpenAPI at startup and exposing 2 meta-tools instead of hardcoded handlers. The ecosystem is pivoting toward distributed multi-cluster control planes (argocd-agent) and policy-gated promotion (Kargo Custom Steps), both mirroring opsbench's Cedar + evidence-sealed action model.

### docker

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| docker/mcp-gateway | <https://github.com/docker/mcp-gateway> | mcp-server | high | mcp-recipe | MIT | 1400 | 2026-05 |
| docker/mcp-registry | <https://github.com/docker/mcp-registry> | reference | high | cross-reference | MIT | 497 | 2026-05 |
| docker/cagent | <https://github.com/docker/cagent> | agent | high | template-blueprint | Apache-2.0 | 3000 | 2026-06-03 |
| ckreiling/mcp-server-docker | <https://github.com/ckreiling/mcp-server-docker> | mcp-server | high | mcp-recipe | GPL-3.0 | 720 | 2025-06-05 |
| docker/docker-language-server | <https://github.com/docker/docker-language-server> | sdk | high | cli-anything-wrap | Apache-2.0 | 173 | 2025-10-14 |
| compose-spec/compose-go | <https://github.com/compose-spec/compose-go> | sdk | high | vendored | Apache-2.0 | 2200 | 2026-05-20 |
| docker (Docker Scout CLI) | <https://docs.docker.com/scout/> | cli-tool | high | cli-anything-wrap |  | 0 | 2026-04 |
| aquasecurity/trivy | <https://github.com/aquasecurity/trivy> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 35400 | 2026-06 |
| docker/buildx | <https://github.com/docker/buildx> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 4000 | 2026-06 |
| wagoodman/dive | <https://github.com/wagoodman/dive> | cli-tool | medium | cli-anything-wrap | MIT | 47000 | 2025-12 |
| QuantGeekDev/docker-mcp | <https://github.com/QuantGeekDev/docker-mcp> | mcp-server | medium | template-blueprint | MIT | 480 | 2024-12-14 |
| Automata-Labs-team/code-sandbox-mcp | <https://github.com/Automata-Labs-team/code-sandbox-mcp> | mcp-server | medium | template-blueprint | MIT | 322 | 2025-03-23 |
| elusznik/mcp-server-code-execution-mode | <https://github.com/elusznik/mcp-server-code-execution-mode> | mcp-server | medium | mcp-recipe | GPL-3.0 | 334 | 2025-12-05 |
| ajeetraina/docker-mcp-toolkit | <https://github.com/ajeetraina/docker-mcp-toolkit> | reference | medium | cross-reference |  | 0 | 2026-05 |
| docker/cagent-action | <https://github.com/docker/cagent-action> | automation-library | medium | template-blueprint | Apache-2.0 | 0 | 2026-05 |

Docker has fully embraced MCP: a 300+-server signed catalog, mcp-gateway as routing/auth, cagent as YAML-declarative multi-agent runtime distributed via OCI, plus container-isolated sandboxes for agents converging on "one container per agent." Deterministic dev-time tooling (LSP + compose-go) is being pulled into agent loops to stop YAML hallucinations.

### ansible

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| ansible/vscode-ansible | <https://github.com/ansible/vscode-ansible> | mcp-server | high | mcp-recipe | Apache-2.0 | 0 | 2026-05-01 |
| Red Hat AAP MCP Server | <https://www.redhat.com/en/blog/it-automation-agentic-ai-introducing-mcp-server-red-hat-ansible-automation-platform> | mcp-server | high | mcp-recipe |  | 0 | 2026-05-15 |
| sibilleb/AAP-Enterprise-MCP-Server | <https://github.com/sibilleb/AAP-Enterprise-MCP-Server> | mcp-server | high | mcp-recipe | MIT | 30 | 2025-07-18 |
| rlopez133/mcp | <https://github.com/rlopez133/mcp> | mcp-server | high | template-blueprint |  | 0 | 2025-12-01 |
| sigridjineth/hello-ansible-skills | <https://github.com/sigridjineth/hello-ansible-skills> | claude-skill | high | skill | MIT | 62 | 2026-01-17 |
| leogallego/claude-ansible-skills | <https://github.com/leogallego/claude-ansible-skills> | claude-skill | high | skill | GPL-3.0 | 9 | 2026-05-03 |
| ansible/ansible-lint | <https://github.com/ansible/ansible-lint> | cli-tool | high | cli-anything-wrap | GPL-3.0 | 0 | 2026-04-01 |
| ansible/event-driven-ansible | <https://github.com/ansible/event-driven-ansible> | automation-library | high | cross-reference | Apache-2.0 | 0 | 2026-05-11 |
| redhat-cop/ansible.mcp_builder | <https://github.com/redhat-cop/ansible.mcp_builder> | automation-library | medium | template-blueprint | GPL-3.0 | 2 | 2026-01-16 |
| 3A2DEV/ansible-designer | <https://github.com/3A2DEV/ansible-designer> | claude-skill | medium | skill | Apache-2.0 | 5 | 2026-04-01 |
| olandodeflexy/ansible-skill | <https://github.com/olandodeflexy/ansible-skill> | claude-skill | medium | skill |  | 7 | 2026-05-08 |
| SecKatie/ansible-agents | <https://github.com/SecKatie/ansible-agents> | automation-library | medium | template-blueprint | Apache-2.0 | 3 | 2026-04-01 |
| kpeacocke/souschef | <https://github.com/kpeacocke/souschef> | mcp-server | medium | mcp-recipe | MIT | 6 | 2026-06-02 |
| ric03uec/clawrium | <https://github.com/ric03uec/clawrium> | cli-tool | medium | template-blueprint | Apache-2.0 | 24 | 2026-06-03 |
| ansible/awx | <https://github.com/ansible/awx> | automation-library | medium | cross-reference | Apache-2.0 | 0 | 2026-05-30 |
| Red Hat Ansible Lightspeed | <https://developers.redhat.com/products/ansible/lightspeed> | reference | low | cross-reference |  | 0 | 2026-05-01 |

Red Hat has shipped both an official Ansible Dev Tools MCP and an AAP tech-preview MCP, while a tier of community servers covers AAP/AWX and Event-Driven Ansible. A Claude Code skills subculture (hello-ansible-skills 62 stars, claude-ansible-skills, ansible-designer) is converging on Red Hat CoP good-practice rules. Ansible is repositioning as the trusted execution layer for agentic AI.

### terraform

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| hashicorp/terraform-mcp-server | <https://github.com/hashicorp/terraform-mcp-server> | mcp-server | high | mcp-recipe | MPL-2.0 | 1394 | 2026-06-02 |
| antonbabenko/terraform-skill | <https://github.com/antonbabenko/terraform-skill> | claude-skill | high | skill | NOASSERTION | 1980 | 2026-06-03 |
| LukasNiessen/terrashark | <https://github.com/LukasNiessen/terrashark> | claude-skill | high | skill | MIT | 394 | 2026-05-24 |
| terramate-io/agent-skills | <https://github.com/terramate-io/agent-skills> | claude-skill | high | skill | MIT | 32 | 2026-02-02 |
| hashi-demo-lab/claude-skill-hcp-terraform | <https://github.com/hashi-demo-lab/claude-skill-hcp-terraform> | claude-skill | high | skill |  | 0 |  |
| infracost/infracost | <https://github.com/infracost/infracost> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 12327 | 2026-06-03 |
| aquasecurity/trivy | <https://github.com/aquasecurity/trivy> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 0 |  |
| bridgecrewio/checkov | <https://github.com/bridgecrewio/checkov> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 0 |  |
| opentofu/opentofu | <https://github.com/opentofu/opentofu> | cli-tool | high | cli-anything-wrap | MPL-2.0 | 0 |  |
| ops0-ai/ops0-cli | <https://github.com/ops0-ai/ops0-cli> | cli-tool | high | cli-anything-wrap | NOASSERTION | 68 | 2026-05-16 |
| severity1/terraform-cloud-mcp | <https://github.com/severity1/terraform-cloud-mcp> | mcp-server | medium | mcp-recipe | MIT | 23 | 2025-11-02 |
| aj-geddes/terry-form-mcp | <https://github.com/aj-geddes/terry-form-mcp> | mcp-server | medium | mcp-recipe | MIT | 9 | 2026-03-22 |
| terraform-linters/tflint | <https://github.com/terraform-linters/tflint> | cli-tool | medium | cli-anything-wrap | MPL-2.0 | 0 |  |
| gruntwork-io/terragrunt | <https://github.com/gruntwork-io/terragrunt> | cli-tool | medium | cli-anything-wrap | MIT | 0 |  |
| terrateamio/terrateam | <https://github.com/terrateamio/terrateam> | reference | medium | template-blueprint |  | 0 |  |
| hashicorp/terraform-cdk | <https://github.com/hashicorp/terraform-cdk> | sdk | medium | cross-reference | MPL-2.0 | 0 |  |
| agentopology/agentopology | <https://github.com/agentopology/agentopology> | pattern | medium | template-blueprint | Apache-2.0 | 86 | 2026-05-30 |
| BagelHole/DevOps-Security-Agent-Skills | <https://github.com/BagelHole/DevOps-Security-Agent-Skills> | claude-skill | medium | cross-reference | MIT | 28 | 2026-05-22 |
| hammadhaqqani/awesome-devops-ai | <https://github.com/hammadhaqqani/awesome-devops-ai> | reference | medium | cross-reference | CC0-1.0 | 10 | 2026-05-29 |
| maroffo/claude-forge | <https://github.com/maroffo/claude-forge> | pattern | low | cross-reference | MIT | 13 | 2026-05-30 |

The 2026 ecosystem has bifurcated: an official MCP layer for Registry/HCP access and a fast-growing skill layer focused on eliminating LLM hallucinations and enforcing HashiCorp best practices in agent-emitted HCL. HCP free-tier cap (Mar 2026) is driving migration to OpenTofu plus self-hosted orchestrators, and "guardrails between agent and cloud" tools are becoming a category mirroring opsbench's Cedar gating.

### packer

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| hashicorp/agent-skills | <https://github.com/hashicorp/agent-skills> | claude-skill | high | skill | MPL-2.0 | 650 | 2026-05-28 |
| CowDogMoo/warpgate-mcp-server | <https://github.com/CowDogMoo/warpgate-mcp-server> | mcp-server | high | mcp-recipe | MIT | 0 | 2026-06-03 |
| mondoohq/packer-plugin-cnspec | <https://github.com/mondoohq/packer-plugin-cnspec> | plugin | high | cli-anything-wrap | BUSL-1.1 | 27 | 2026-06-03 |
| hashicorp/packer | <https://github.com/hashicorp/packer> | cli-tool | high | cli-anything-wrap | BUSL-1.1 | 15696 | 2026-06-03 |
| hashicorp/packer-plugin-amazon | <https://github.com/hashicorp/packer-plugin-amazon> | plugin | high | cli-anything-wrap | MPL-2.0 | 91 | 2026-06-01 |
| hashicorp/packer-plugin-azure | <https://github.com/hashicorp/packer-plugin-azure> | plugin | high | cli-anything-wrap | MPL-2.0 | 65 | 2026-05-25 |
| hashicorp/setup-packer | <https://github.com/hashicorp/setup-packer> | automation-library | medium | template-blueprint | Apache-2.0 | 162 | 2026-06-03 |
| hashicorp/terraform-mcp-server | <https://github.com/hashicorp/terraform-mcp-server> | mcp-server | medium | template-blueprint | MPL-2.0 | 1400 | 2026-04-28 |
| hashicorp-education/learn-packer-hcp-golden-image | <https://github.com/hashicorp-education/learn-packer-hcp-golden-image> | reference | medium | template-blueprint | MPL-2.0 | 0 |  |
| osbuild/osbuild | <https://github.com/osbuild/osbuild> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 269 | 2026-06-03 |
| mcpmarket.com/hashicorp-packer-image-builder | <https://mcpmarket.com/tools/skills/hashicorp-packer-image-builder> | claude-skill | low | cross-reference |  | 0 |  |

Two patterns: HashiCorp's Agent Skills package (650 stars, weekly commits) is becoming the canonical way agents learn Packer/HCP semantics, but there is no official HashiCorp Packer MCP server yet. Security-first image builds (cnspec/Trivy/Qualys as Packer provisioners + SLSA/cosign-signed attestations) are now table stakes for golden-image pipelines.

### vault

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| hashicorp/vault-mcp-server | <https://github.com/hashicorp/vault-mcp-server> | mcp-server | high | mcp-recipe | MPL-2.0 | 49 | 2026-06-03 |
| hashicorp/vault-secrets-operator | <https://github.com/hashicorp/vault-secrets-operator> | operator | high | template-blueprint | MPL-2.0 | 583 | 2026-06-03 |
| external-secrets/external-secrets | <https://github.com/external-secrets/external-secrets> | operator | high | template-blueprint | Apache-2.0 | 6646 | 2026-06-03 |
| bank-vaults/bank-vaults | <https://github.com/bank-vaults/bank-vaults> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 2300 | 2026-05-25 |
| FalcoSuessgott/vkv | <https://github.com/FalcoSuessgott/vkv> | cli-tool | high | cli-anything-wrap | MIT | 109 | 2026-05-19 |
| soerenschneider/vault-pki-cli | <https://github.com/soerenschneider/vault-pki-cli> | cli-tool | medium | cli-anything-wrap | GPL-3.0 | 4 | 2024-09-09 |
| itunified-io/mcp-vault | <https://github.com/itunified-io/mcp-vault> | mcp-server | medium | cross-reference | AGPL-3.0 | 0 | 2026-03-16 |
| rccyx/vault-mcp | <https://github.com/rccyx/vault-mcp> | mcp-server | medium | cross-reference | MIT | 6 | 2025-12-23 |
| theagentattic/mcp-vault | <https://github.com/theagentattic/mcp-vault> | mcp-server | medium | template-blueprint | MIT | 0 | 2025-12-26 |
| William-Hashicorp/hashicorp-drawio-skills | <https://github.com/William-Hashicorp/hashicorp-drawio-skills> | claude-skill | medium | skill | Apache-2.0 | 1 | 2026-05-26 |
| ricoberger/vault-secrets-operator | <https://github.com/ricoberger/vault-secrets-operator> | operator | low | cross-reference | Apache-2.0 | 0 |  |
| claude-vault-mcp (PyPI) | <https://pypi.org/project/claude-vault-mcp/> | mcp-server | medium | mcp-recipe |  | 0 |  |

Vault went from zero MCP servers to an official HashiCorp server + long tail of community variants in six months, with most deliberately constraining themselves to KV + policy + PKI. Kubernetes-side is dominated by declarative reconciliation operators, and tokenization/broker patterns are emerging in response to early-2026 supply-chain attacks.

### crossplane

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| upbound/marketplace-mcp-server | <https://github.com/upbound/marketplace-mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 6 | 2026-04-21 |
| upbound/controlplane-mcp-server | <https://github.com/upbound/controlplane-mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 3 | 2025-08-12 |
| briferz/crossplane-mcp | <https://github.com/briferz/crossplane-mcp> | mcp-server | high | mcp-recipe | Apache-2.0 | 0 | 2026-05-29 |
| crossplane/crossplane (crank CLI) | <https://github.com/crossplane/crossplane> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 11737 | 2026-06-03 |
| upbound/up | <https://github.com/upbound/up> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 0 | 2026-06-03 |
| crossplane-contrib/function-kcl | <https://github.com/crossplane-contrib/function-kcl> | reference | medium | template-blueprint | Apache-2.0 | 83 | 2026-06-03 |
| crossplane-contrib/function-python | <https://github.com/crossplane-contrib/function-python> | reference | medium | template-blueprint | Apache-2.0 | 18 | 2026-06-01 |
| swisscom/crossplane-composition-tester | <https://github.com/swisscom/crossplane-composition-tester> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 13 | 2025-12-04 |
| gympass/function-aws-importer | <https://github.com/gympass/function-aws-importer> | reference | medium | template-blueprint | Apache-2.0 | 13 | 2026-04-22 |
| kagent-dev/kagent | <https://github.com/kagent-dev/kagent> | agent | medium | template-blueprint | Apache-2.0 | 2909 | 2026-06-03 |
| shilucloud/crossplane-agent | <https://github.com/shilucloud/crossplane-agent> | reference | medium | template-blueprint |  | 0 | 2026-04-03 |
| shilucloud/crossplane-mcp-server | <https://github.com/shilucloud/crossplane-mcp-server> | mcp-server | medium | mcp-recipe |  | 1 | 2026-04-03 |
| hops-ops/skill-crossplane-xr-go-template | <https://github.com/hops-ops/skill-crossplane-xr-go-template> | claude-skill | medium | skill |  | 0 | 2026-01-31 |
| crossplane-contrib/function-kro | <https://github.com/crossplane-contrib/function-kro> | reference | low | cross-reference | Apache-2.0 | 18 | 2026-06-03 |

Crossplane v2 + Upbound 2.0 went "AI-native" in early 2026 with vendor MCP servers (marketplace + control plane) and the wider ecosystem converged on composition functions in real languages (KCL/Python/CEL). Read-only troubleshooting MCPs and BDD test frameworks are emerging specifically to support agent workflows that must prove safety before applying.

### ingress-and-gateway

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| agentgateway/agentgateway | <https://github.com/agentgateway/agentgateway> | mcp-server | high | mcp-recipe | Apache-2.0 | 3000 | 2026-05-23 |
| kagent-dev/kagent | <https://github.com/kagent-dev/kagent> | agent | high | template-blueprint | Apache-2.0 | 2900 | 2026-06-02 |
| kagent-dev/tools | <https://github.com/kagent-dev/tools> | mcp-server | high | mcp-recipe | Apache-2.0 | 31 | 2026-05-01 |
| kgateway-dev/kgateway | <https://github.com/kgateway-dev/kgateway> | operator | high | template-blueprint | Apache-2.0 | 5500 | 2026-05-21 |
| krutsko/istio-mcp-server | <https://github.com/krutsko/istio-mcp-server> | mcp-server | high | mcp-recipe | MIT | 1 | 2025-09-08 |
| containers/kubernetes-mcp-server | <https://github.com/containers/kubernetes-mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 1700 | 2026-05-05 |
| envoyproxy/ai-gateway | <https://github.com/envoyproxy/ai-gateway> | operator | medium | template-blueprint | Apache-2.0 | 1700 | 2026-05-05 |
| ffelicissimo/servicemesh-mcp-server | <https://github.com/ffelicissimo/servicemesh-mcp-server> | mcp-server | medium | mcp-recipe | Apache-2.0 | 0 | 2026-04-14 |
| alibaba/higress | <https://github.com/alibaba/higress> | operator | medium | template-blueprint | Apache-2.0 | 8500 | 2026-05-26 |
| katanemo/archgw | <https://github.com/katanemo/archgw> | operator | medium | template-blueprint | Apache-2.0 | 6600 | 2026-05-15 |
| kagent-dev/kmcp | <https://github.com/kagent-dev/kmcp> | sdk | medium | template-blueprint | Apache-2.0 | 464 | 2026-05-01 |
| traefik | <https://traefik.io/blog/the-triple-ai-security-gap> | reference | medium | cross-reference |  | 0 | 2026-05-06 |
| kguardian-dev/kguardian | <https://github.com/kguardian-dev/kguardian> | mcp-server | medium | mcp-recipe |  | 4 | 2026-04-01 |
| Kubernetes AI Gateway Working Group | <https://www.kubernetes.dev/blog/2026/03/09/announcing-ai-gateway-wg/> | reference | medium | cross-reference |  | 0 | 2026-03-09 |

The ingress/gateway space pivoted hard toward "AI-native gateways" in 2026: Envoy-backed Rust dataplanes (agentgateway, archgw) and Go control planes (kgateway, Envoy AI Gateway) now treat MCP/A2A as first-class. CNCF Kubernetes AI Gateway WG formalized the CRD surface. Traefik shipped MCP/TBAC controls as the Ingress-NGINX replacement.

### network-diag

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| inspektor-gadget/ig-mcp-server | <https://github.com/inspektor-gadget/ig-mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 25 | 2026-05-22 |
| kubeshark/kubeshark | <https://github.com/kubeshark/kubeshark> | mcp-server | high | mcp-recipe | Apache-2.0 | 11917 | 2026-06-03 |
| cilium/pwru | <https://github.com/cilium/pwru> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 3761 | 2026-05-28 |
| microsoft/retina | <https://github.com/microsoft/retina> | cli-tool | high | cli-anything-wrap | MIT | 3143 | 2026-06-02 |
| nicolaka/netshoot | <https://github.com/nicolaka/netshoot> | reference | high | template-blueprint | Apache-2.0 | 10737 | 2026-04-16 |
| 0xKoda/WireMCP | <https://github.com/0xKoda/WireMCP> | mcp-server | high | mcp-recipe | MIT | 489 | 2025-07-09 |
| eldadru/ksniff | <https://github.com/eldadru/ksniff> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 3471 | 2024-08-02 |
| inspektor-gadget/inspektor-gadget | <https://github.com/inspektor-gadget/inspektor-gadget> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 2825 | 2026-06-03 |
| mixelpixx/Wireshark-MCP | <https://github.com/mixelpixx/Wireshark-MCP> | mcp-server | medium | mcp-recipe | MIT | 9 | 2026-02-07 |
| FuzzingLabs/mcp-security-hub | <https://github.com/FuzzingLabs/mcp-security-hub> | mcp-server | medium | template-blueprint | MIT | 567 | 2026-04-08 |
| PhialsBasement/nmap-mcp-server | <https://github.com/PhialsBasement/nmap-mcp-server> | mcp-server | medium | mcp-recipe | MIT | 47 | 2026-06-01 |
| eunomia-bpf/MCPtrace | <https://github.com/eunomia-bpf/MCPtrace> | mcp-server | medium | template-blueprint | MIT | 70 | 2026-02-12 |
| vedevpatel/mcp-network-diagnostics | <https://github.com/vedevpatel/mcp-network-diagnostics> | mcp-server | medium | template-blueprint | Apache-2.0 | 4 | 2026-03-06 |
| tcpiplab/Instability | <https://github.com/tcpiplab/Instability> | mcp-server | medium | cross-reference |  | 5 | 2026-04-06 |
| cyanheads/toolkit-mcp-server | <https://github.com/cyanheads/toolkit-mcp-server> | mcp-server | medium | mcp-recipe | Apache-2.0 | 18 | 2025-12-02 |
| marilynceo/netdiag-mcp | <https://github.com/marilynceo/netdiag-mcp> | mcp-server | medium | template-blueprint |  | 0 | 2026-05-19 |

eBPF is the dominant net-diag substrate (Inspektor Gadget, Kubeshark, Retina, pwru, Cilium/Hubble). MCP coverage exploded late 2025/early 2026 with vendor servers and tshark/nmap wrappers; HolmesGPT integrating Inspektor Gadget shows LLM-driven IR picking gadgets autonomously. "All-in-one" net-diag MCP archetypes are emerging.

### k8s-distros

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| containers/kubernetes-mcp-server | <https://github.com/containers/kubernetes-mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 1700 | 2026-05-05 |
| Nosmoht/talos-mcp-server | <https://github.com/Nosmoht/talos-mcp-server> | mcp-server | high | mcp-recipe | MIT | 0 | 2026-06-03 |
| devantler-tech/ksail | <https://github.com/devantler-tech/ksail> | cli-tool | high | mcp-recipe | NOASSERTION | 147 | 2026-06-03 |
| awslabs/mcp (EKS) | <https://github.com/awslabs/mcp> | mcp-server | high | mcp-recipe | Apache-2.0 | 9200 | 2026-06-01 |
| kagent-dev/kagent | <https://github.com/kagent-dev/kagent> | agent | high | template-blueprint | Apache-2.0 | 2900 | 2026-06-02 |
| siderolabs/talos | <https://github.com/siderolabs/talos> | cli-tool | high | cli-anything-wrap | MPL-2.0 | 7800 | 2026-06-03 |
| ry-ops/k3s-mcp-server | <https://github.com/ry-ops/k3s-mcp-server> | mcp-server | medium | mcp-recipe | MIT | 3 | 2026-05-09 |
| rohitg00/kubectl-mcp-server | <https://github.com/rohitg00/kubectl-mcp-server> | mcp-server | medium | cross-reference | MIT | 906 | 2026-04-15 |
| k0sproject/k0sctl | <https://github.com/k0sproject/k0sctl> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 561 | 2026-05-20 |
| kubernetes-sigs/kubespray | <https://github.com/kubernetes-sigs/kubespray> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 17500 | 2026-05-25 |
| canonical/microk8s | <https://github.com/canonical/microk8s> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 8600 | 2026-06-01 |
| kguardian-dev/kguardian | <https://github.com/kguardian-dev/kguardian> | mcp-server | medium | mcp-recipe | Apache-2.0 | 250 | 2026-04-10 |

MCP converging on two layers: distro-agnostic K8s API servers and distro-native gRPC/CLI servers (Talos, k3s, microk8s) for node-level forensics. K8s-native agent runtimes (kagent, Agent Sandbox) graduating from research to production. Cluster bootstrap tools shipping AGENTS.md and built-in MCP — upstreams are courting LLMs directly.

### progressive-delivery

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| argoproj-labs/mcp-for-argocd | <https://github.com/argoproj-labs/mcp-for-argocd> | mcp-server | high | mcp-recipe | Apache-2.0 | 481 | 2026-05-02 |
| akuity/argocd-mcp | <https://github.com/akuity/argocd-mcp> | mcp-server | high | mcp-recipe | Apache-2.0 | 0 | 2026-05-15 |
| akuity/kargo | <https://github.com/akuity/kargo> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 2400 | 2026-05-28 |
| argoproj/argo-rollouts | <https://github.com/argoproj/argo-rollouts> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 3100 | 2026-03-20 |
| fluxcd/flagger | <https://github.com/fluxcd/flagger> | operator | high | skill | Apache-2.0 | 5300 | 2026-04-10 |
| Heapy/argo-workflows-mcp | <https://github.com/Heapy/argo-workflows-mcp> | mcp-server | medium | mcp-recipe | Apache-2.0 | 45 | 2026-04-22 |
| open-feature/mcp | <https://github.com/open-feature/mcp> | mcp-server | medium | mcp-recipe | Apache-2.0 | 120 | 2026-05-01 |
| argoproj-labs/argocd-image-updater | <https://github.com/argoproj-labs/argocd-image-updater> | operator | medium | template-blueprint | Apache-2.0 | 2300 | 2026-04-18 |
| pab1it0/prometheus-mcp-server | <https://github.com/pab1it0/prometheus-mcp-server> | mcp-server | medium | mcp-recipe | MIT | 380 | 2026-05-05 |
| keptn/lifecycle-toolkit | <https://github.com/keptn/lifecycle-toolkit> | operator | medium | template-blueprint | Apache-2.0 | 1400 | 2026-04-30 |
| rohitg00/awesome-claude-code-toolkit | <https://github.com/rohitg00/awesome-claude-code-toolkit> | claude-skill | medium | skill | MIT | 850 | 2026-05-12 |
| Akuity Intelligence | <https://docs.akuity.io/intelligence/akuity-agents/on-call-agent/> | reference | medium | cross-reference |  | 0 | 2026-05-20 |

Argo CD MCP coverage matured in 2025-2026; Akuity productized an On-Call Agent + Promotion Advisor with reported 50-70% faster MTTR. Kargo v1.9 brought infra-aware multi-stage promotions including Terraform steps. Feature-flag platforms shipped MCPs (OpenFeature). Verification consolidating on Prometheus/Datadog via metric MCPs.

### operators

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| controlplaneio-fluxcd/flux-operator | <https://github.com/controlplaneio-fluxcd/flux-operator> | mcp-server | high | mcp-recipe | AGPL-3.0 | 0 | 2026-05-31 |
| kagent-dev/kagent | <https://github.com/kagent-dev/kagent> | agent | high | template-blueprint | Apache-2.0 | 0 | 2026-06-01 |
| containers/kubernetes-mcp-server | <https://github.com/containers/kubernetes-mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 0 | 2026-05-01 |
| operator-framework/operator-sdk | <https://github.com/operator-framework/operator-sdk> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 7651 | 2026-05-26 |
| operator-framework/kubectl-operator | <https://github.com/operator-framework/kubectl-operator> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 140 | 2025-12-10 |
| operator-framework/operator-controller | <https://github.com/operator-framework/operator-controller> | operator | high | cross-reference | Apache-2.0 | 204 | 2026-06-03 |
| kubernetes-sigs/mcp-lifecycle-operator | <https://github.com/kubernetes-sigs/mcp-lifecycle-operator> | operator | high | mcp-recipe | Apache-2.0 | 27 | 2026-06-03 |
| argoproj-labs/mcp-for-argocd | <https://github.com/argoproj-labs/mcp-for-argocd> | mcp-server | high | mcp-recipe | Apache-2.0 | 0 |  |
| rashmigottipati/operator-sdk-mcp-server | <https://github.com/rashmigottipati/operator-sdk-mcp-server> | mcp-server | medium | mcp-recipe |  | 0 | 2026-04-26 |
| anik120/olmv0-mcp-server | <https://github.com/anik120/olmv0-mcp-server> | mcp-server | medium | mcp-recipe |  | 0 | 2025-10-30 |
| vfarcic/crossplane-mcp | <https://github.com/vfarcic/crossplane-mcp> | mcp-server | medium | mcp-recipe |  | 0 |  |
| kubernetes-sigs/kubebuilder | <https://github.com/kubernetes-sigs/kubebuilder> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 0 |  |
| rohitg00/awesome-claude-code-toolkit (kubernetes-specialist) | <https://github.com/rohitg00/awesome-claude-code-toolkit/blob/main/agents/infrastructure/kubernetes-specialist.md> | claude-skill | medium | skill |  | 0 |  |
| authzed/controller-idioms | <https://github.com/authzed/controller-idioms> | reference | low | cross-reference | Apache-2.0 | 201 | 2026-05-08 |

Every major control plane (Flux, Argo CD, Crossplane, OLM, kagent) now ships or hosts an MCP server. kagent is CNCF Sandbox with Agent/MCPServer as first-class CRDs. Operator Framework splitting along OLMv0/OLMv1; OLMv1 is the future surface. Kubebuilder issue #5551 signals AGENTS.md/.claude scaffolds will ship with future operators.

### config-mgmt

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| controlplaneio-fluxcd/flux-operator (Flux MCP) | <https://github.com/controlplaneio-fluxcd/flux-operator> | mcp-server | high | mcp-recipe | AGPL-3.0 | 645 | 2026-05-20 |
| fluxcd/agent-skills | <https://github.com/fluxcd/agent-skills> | claude-skill | high | skill | Apache-2.0 | 163 | 2026-04-19 |
| argoproj-labs/mcp-for-argocd | <https://github.com/argoproj-labs/mcp-for-argocd> | mcp-server | high | mcp-recipe | Apache-2.0 | 481 | 2026-05-02 |
| hashicorp/terraform-mcp-server | <https://github.com/hashicorp/terraform-mcp-server> | mcp-server | high | mcp-recipe | MPL-2.0 | 1400 | 2026-04-28 |
| pulumi/mcp-server | <https://github.com/pulumi/mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 58 | 2026-05-01 |
| ansible/vscode-ansible (Ansible Dev Tools MCP) | <https://github.com/ansible/vscode-ansible> | mcp-server | high | mcp-recipe | Apache-2.0 | 0 | 2026-05-01 |
| zekker6/mcp-helm | <https://github.com/zekker6/mcp-helm> | mcp-server | high | mcp-recipe | MIT | 25 | 2026-05-28 |
| rohitg00/kubectl-mcp-server | <https://github.com/rohitg00/kubectl-mcp-server> | mcp-server | high | mcp-recipe | MIT | 906 | 2026-02-20 |
| alexei-led/k8s-mcp-server | <https://github.com/alexei-led/k8s-mcp-server> | mcp-server | high | mcp-recipe | MIT | 210 | 2026-02-27 |
| LukasNiessen/kubernetes-skill | <https://github.com/LukasNiessen/kubernetes-skill> | claude-skill | high | skill | MIT | 328 | 2026-05-01 |
| njayp/ophis | <https://github.com/njayp/ophis> | automation-library | high | cli-anything-wrap | Apache-2.0 | 87 | 2026-02-18 |
| opentofu/opentofu-mcp-server | <https://github.com/opentofu/opentofu-mcp-server> | mcp-server | medium | mcp-recipe | MIT | 98 | 2025-06-06 |
| qwedsazxc78/devops-ai-skill | <https://github.com/qwedsazxc78/devops-ai-skill> | claude-skill | medium | template-blueprint | MIT | 2 | 2026-05-01 |
| ahmedasmar/devops-claude-skills | <https://github.com/ahmedasmar/devops-claude-skills> | claude-skill | medium | cross-reference |  | 0 | 2026-05-01 |
| raghavkhokale/gitops-mcp | <https://github.com/raghavkhokale/gitops-mcp> | mcp-server | medium | template-blueprint | Apache-2.0 | 0 | 2026-05-03 |
| vfarcic/crossplane-mcp | <https://github.com/vfarcic/crossplane-mcp> | mcp-server | medium | template-blueprint | MIT | 1 | 2026-05-01 |
| anthropics/skills | <https://github.com/anthropics/skills> | claude-skill | medium | cross-reference | MIT | 0 | 2026-05-01 |

By mid-2026 config-mgmt MCP consolidated around vendor-blessed servers (HashiCorp, Pulumi, Red Hat, OpenTofu, Argo, Flux); Anthropic merged slash-commands into Skills so the skill format is lingua franca across hosts. Hot pattern: "Skill on top of MCP" rather than monolithic agents. Wide kubectl+helm+gitops MCPs are convenient but pushing teams to layer policy on top.

### service-mesh

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| istio/istio | <https://github.com/istio/istio> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 37500 | 2026-06-03 |
| cilium/cilium-cli | <https://github.com/cilium/cilium-cli> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 700 | 2026-06-03 |
| linkerd/linkerd2 | <https://github.com/linkerd/linkerd2> | cli-tool | high | skill | Apache-2.0 | 11000 | 2026-06-03 |
| kiali/kiali | <https://github.com/kiali/kiali> | reference | high | mcp-recipe | Apache-2.0 | 3500 | 2026-06-03 |
| cilium/hubble | <https://github.com/cilium/hubble> | cli-tool | high | skill | Apache-2.0 | 3500 | 2026-06-03 |
| cilium/tetragon | <https://github.com/cilium/tetragon> | cli-tool | high | skill | Apache-2.0 | 4000 | 2026-06-03 |
| kubeshark/kubeshark | <https://github.com/kubeshark/kubeshark> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 11500 | 2026-06-03 |
| k8sgpt-ai/k8sgpt | <https://github.com/k8sgpt-ai/k8sgpt> | agent | high | template-blueprint | Apache-2.0 | 6800 | 2026-06-03 |
| robusta-dev/holmesgpt | <https://github.com/robusta-dev/holmesgpt> | agent | high | cross-reference | MIT | 3500 | 2026-06-03 |
| manusa/kubernetes-mcp-server | <https://github.com/manusa/kubernetes-mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 1200 | 2026-06-03 |
| pab1it0/prometheus-mcp-server | <https://github.com/pab1it0/prometheus-mcp-server> | mcp-server | high | mcp-recipe | MIT | 350 | 2026-06-02 |
| kumahq/kuma | <https://github.com/kumahq/kuma> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 3900 | 2026-06-03 |
| hashicorp/consul | <https://github.com/hashicorp/consul> | cli-tool | medium | cli-anything-wrap | BUSL-1.1 | 28800 | 2026-06-03 |
| meshery/meshery | <https://github.com/meshery/meshery> | reference | medium | template-blueprint | Apache-2.0 | 5500 | 2026-06-03 |
| solo-io/gloo | <https://github.com/solo-io/gloo> | cli-tool | medium | cross-reference | Apache-2.0 | 4100 | 2026-06-03 |
| pixie-io/pixie | <https://github.com/pixie-io/pixie> | reference | medium | template-blueprint | Apache-2.0 | 5600 | 2026-05-20 |

Service-mesh in 2026 consolidating around two narratives: ambient/sidecarless meshes (Istio Ambient + ztunnel, Cilium Service Mesh on eBPF) shifting forensics to identity + eBPF flow; and LLM-driven SRE assistants (k8sgpt, HolmesGPT, MeshMate inside Meshery) shipping Istio analyzers and racing to expose themselves as MCPs. Mesh vendors still have not shipped first-party MCPs.

### observability

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| grafana/mcp-grafana | <https://github.com/grafana/mcp-grafana> | mcp-server | high | mcp-recipe | Apache-2.0 | 3098 | 2026-06-03 |
| HolmesGPT/holmesgpt | <https://github.com/HolmesGPT/holmesgpt> | agent | high | template-blueprint | Apache-2.0 | 2554 | 2026-06-03 |
| pab1it0/prometheus-mcp-server | <https://github.com/pab1it0/prometheus-mcp-server> | mcp-server | high | mcp-recipe | MIT | 451 | 2026-05-19 |
| SigNoz/signoz-mcp-server | <https://github.com/SigNoz/signoz-mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 97 | 2026-05-21 |
| traceloop/opentelemetry-mcp-server | <https://github.com/traceloop/opentelemetry-mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 188 | 2026-04-20 |
| grafana/loki-mcp | <https://github.com/grafana/loki-mcp> | mcp-server | high | mcp-recipe |  | 146 | 2026-06-02 |
| ntk148v/alertmanager-mcp-server | <https://github.com/ntk148v/alertmanager-mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 20 | 2026-05-26 |
| k8sgpt-ai/k8sgpt | <https://github.com/k8sgpt-ai/k8sgpt> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 7836 | 2026-05-31 |
| VictoriaMetrics/mcp-victoriametrics | <https://github.com/VictoriaMetrics/mcp-victoriametrics> | mcp-server | medium | mcp-recipe | Apache-2.0 | 176 | 2026-05-31 |
| open-telemetry/opentelemetry-collector-contrib | <https://github.com/open-telemetry/opentelemetry-collector-contrib> | reference | medium | template-blueprint | Apache-2.0 | 4709 | 2026-06-04 |
| open-telemetry/opentelemetry-operator | <https://github.com/open-telemetry/opentelemetry-operator> | operator | medium | cli-anything-wrap | Apache-2.0 | 1706 | 2026-06-03 |
| vectordotdev/vector | <https://github.com/vectordotdev/vector> | cli-tool | medium | cli-anything-wrap | MPL-2.0 | 21978 | 2026-06-03 |
| opendatahub-io/rhoai-observability-mcp | <https://github.com/opendatahub-io/rhoai-observability-mcp> | reference | medium | template-blueprint | MIT | 4 | 2026-05-19 |
| ThoTischner/observability-mcp | <https://github.com/ThoTischner/observability-mcp> | mcp-server | medium | mcp-recipe | Apache-2.0 | 5 | 2026-06-03 |
| grafana/pyroscope | <https://github.com/grafana/pyroscope> | cli-tool | medium | cli-anything-wrap | AGPL-3.0 | 11463 | 2026-06-03 |

MCP became the de-facto agent interface for observability — every major vendor (Grafana, SigNoz, VictoriaMetrics, Dynatrace, Zabbix, Loki, Alertmanager) ships official or community MCPs. Azure SRE Agent / AWS DevOps Agent treat MCP as primary investigation surface. Agentic SRE loops (HolmesGPT, Metoro, Klaudia, k8sgpt) iteratively pull Prom + Loki + Tempo + K8s for root cause. Multi-backend "unified observability MCPs" emerging.

### security-scanners

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| aquasecurity/trivy-mcp | <https://github.com/aquasecurity/trivy-mcp> | mcp-server | high | mcp-recipe | MIT | 42 | 2025-12-17 |
| kubescape/kubescape | <https://github.com/kubescape/kubescape> | mcp-server | high | mcp-recipe | Apache-2.0 | 11500 | 2026-05-29 |
| falcosecurity/prempti | <https://github.com/falcosecurity/prempti> | claude-skill | high | skill | Apache-2.0 | 143 | 2026-05-01 |
| CrowdStrike/falcon-mcp | <https://github.com/CrowdStrike/falcon-mcp> | mcp-server | high | mcp-recipe | MIT | 171 | 2026-06-03 |
| cloudshipai/ship | <https://github.com/cloudshipai/ship> | mcp-server | high | mcp-recipe | Apache-2.0 | 51 | 2025-12-09 |
| thnkbig/FalcoClaw | <https://github.com/thnkbig/falcoclaw> | automation-library | medium | template-blueprint | Apache-2.0 | 0 | 2026-05-01 |
| cilium/tetragon | <https://github.com/cilium/tetragon> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 4000 | 2026-06-01 |
| aquasecurity/kube-bench | <https://github.com/aquasecurity/kube-bench> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 7600 | 2026-05-01 |
| anchore/grype | <https://github.com/anchore/grype> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 11500 | 2026-05-01 |
| hackersatyamrastogi/pentesting-cyber-mcp | <https://github.com/hackersatyamrastogi/pentesting-cyber-mcp> | reference | low | cross-reference | MIT | 16 | 2026-01-27 |
| Horizon-Digital-Engineering/security-mcp | <https://github.com/Horizon-Digital-Engineering/security-mcp> | reference | low | template-blueprint | MIT | 0 | 2026-04-21 |
| kagent-dev/kagent | <https://github.com/kagent-dev/kagent> | agent | medium | template-blueprint | Apache-2.0 | 2900 | 2026-06-02 |

Security scanners are rapidly shipping first-party MCP servers (Aqua trivy-mcp, Kubescape 4.0 mcpserver, CrowdStrike falcon-mcp) and the KAgent/in-cluster agent pattern is becoming the canonical deployment model. Agent-runtime guardrails like Prempti and FalcoClaw treat the AI agent itself as a workload to police at syscall/tool-call boundary. Aggregator MCPs like Ship are bundling 50+ scanners.

### policy-engines

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| nirmata/kyverno-mcp | <https://github.com/nirmata/kyverno-mcp> | mcp-server | high | mcp-recipe | AGPL-3.0 | 19 | 2026-05-15 |
| cedar-policy/cedar-for-agents | <https://github.com/cedar-policy/cedar-for-agents> | sdk | high | vendored | Apache-2.0 | 30 | 2026-05-26 |
| open-policy-agent/gatekeeper | <https://github.com/open-policy-agent/gatekeeper> | operator | high | cli-anything-wrap | Apache-2.0 | 4200 | 2026-04-27 |
| open-policy-agent/conftest | <https://github.com/open-policy-agent/conftest> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 3200 | 2026-04-15 |
| vectimus/vectimus | <https://github.com/vectimus/vectimus> | agent | high | template-blueprint | Apache-2.0 | 33 | 2026-06-02 |
| sondera-ai/sondera-coding-agent-hooks | <https://github.com/sondera-ai/sondera-coding-agent-hooks> | pattern | high | template-blueprint | MIT | 211 | 2026-05-01 |
| stacklok/toolhive | <https://github.com/stacklok/toolhive> | mcp-server | high | mcp-recipe | Apache-2.0 | 1800 | 2026-06-03 |
| kyverno/kyverno | <https://github.com/kyverno/kyverno> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 7800 | 2026-05-18 |
| open-policy-agent/opa | <https://github.com/open-policy-agent/opa> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 11800 | 2026-05-28 |
| styrainc/regal | <https://github.com/styrainc/regal> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 384 | 2026-06-02 |
| IBM/mcp-context-forge | <https://github.com/IBM/mcp-context-forge> | mcp-server | medium | template-blueprint | Apache-2.0 | 3800 | 2026-05-26 |
| tomjwxf/scopeblind-gateway | <https://github.com/tomjwxf/scopeblind-gateway> | pattern | high | template-blueprint | MIT | 8 | 2026-04-11 |
| permitio/permit-mcp-gateway | <https://docs.permit.io/permit-mcp-gateway/overview> | mcp-server | medium | cross-reference |  | 0 | 2026-05-01 |
| clawdreyhepburn/carapace | <https://github.com/clawdreyhepburn/carapace> | pattern | medium | template-blueprint | Apache-2.0 | 4 | 2026-04-19 |
| agentralabs/agentic-contract | <https://github.com/agentralabs/agentic-contract> | mcp-server | medium | cross-reference | MIT | 7 | 2026-03-14 |

Cedar is winning the agent-authorization layer (cedar-for-agents, AWS Bedrock AgentCore Policy GA, ScopeBlind, Vectimus, Carapace, Sondera) while OPA/Rego retains K8s admission + IaC dominance. New "MCP gateway" category (ToolHive, ContextForge, ScopeBlind, Permit) is sitting between agents and MCP servers, often cryptographically signing decisions as offline-verifiable receipts.

### secrets-mgmt

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| hashicorp/vault-mcp-server | <https://github.com/hashicorp/vault-mcp-server> | mcp-server | high | mcp-recipe | MPL-2.0 | 49 | 2025-09-24 |
| hashicorp/hcp-vault-radar-mcp | <https://developer.hashicorp.com/hcp/docs/vault-radar/mcp-server/overview> | mcp-server | high | mcp-recipe |  | 0 | 2026-05-01 |
| external-secrets/external-secrets | <https://github.com/external-secrets/external-secrets> | operator | high | skill | Apache-2.0 | 6600 | 2026-06-01 |
| Infisical/infisical-mcp-server | <https://github.com/Infisical/infisical-mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 47 | 2026-04-14 |
| getsops/sops | <https://github.com/getsops/sops> | cli-tool | high | cli-anything-wrap | MPL-2.0 | 22000 | 2026-05-16 |
| bitnami-labs/sealed-secrets | <https://github.com/bitnami-labs/sealed-secrets> | operator | high | cli-anything-wrap | Apache-2.0 | 9100 | 2026-05-21 |
| trufflesecurity/trufflehog | <https://github.com/trufflesecurity/trufflehog> | cli-tool | high | skill | AGPL-3.0 | 26600 | 2026-06-02 |
| gitleaks/gitleaks | <https://github.com/gitleaks/gitleaks> | cli-tool | high | cli-anything-wrap | MIT | 27500 | 2026-03-21 |
| DopplerHQ/mcp-server | <https://github.com/DopplerHQ/mcp-server> | mcp-server | medium | mcp-recipe | Apache-2.0 | 3 | 2026-02-24 |
| bitwarden/mcp-server | <https://github.com/bitwarden/mcp-server> | mcp-server | medium | mcp-recipe | GPL-3.0 | 181 | 2026-05-27 |
| FiloSottile/age | <https://github.com/FiloSottile/age> | cli-tool | medium | cli-anything-wrap | BSD-3-Clause | 22500 | 2025-12-28 |
| sops-age-secret-management (mcpmarket) | <https://mcpmarket.com/tools/skills/sops-age-secret-management> | claude-skill | medium | template-blueprint |  | 0 |  |
| mohshomis/AIVault | <https://github.com/mohshomis/AIVault> | mcp-server | medium | template-blueprint | MIT | 7 | 2026-02-23 |
| Keeper-Security/keeper-mcp-golang-docker | <https://github.com/Keeper-Security/keeper-mcp-golang-docker> | mcp-server | low | cross-reference | MIT | 10 | 2026-05-20 |
| gecochief/id.wispera | <https://github.com/gecochief/id.wispera> | mcp-server | medium | template-blueprint | MIT | 4 | 2026-02-12 |
| external-secrets/kubernetes-external-secrets | <https://external-secrets.io/> | reference | medium | cross-reference | Apache-2.0 | 0 | 2026-06-01 |

Every major secrets-mgmt vendor ships an official MCP server in 2026, with HashiCorp bundling Vault MCP + Terraform MCP on AWS Marketplace. GitOps converging on SOPS + age (Flux-native) over Sealed Secrets for new deploys; ESO is the universal multi-cloud sync layer. Secret-scanning bifurcating: gitleaks for speed/pre-commit, trufflehog for verified-active/IR — and trufflehog ships native .claude/.codex/.cursor folders.

### cloud-providers

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| awslabs/mcp | <https://github.com/awslabs/mcp> | mcp-server | high | mcp-recipe | Apache-2.0 | 9191 | 2026-06-03 |
| aws/agent-toolkit-for-aws | <https://github.com/aws/agent-toolkit-for-aws> | agent | high | template-blueprint | Apache-2.0 | 779 | 2026-06-03 |
| microsoft/mcp (Azure MCP) | <https://github.com/microsoft/mcp> | mcp-server | high | mcp-recipe | MIT | 0 | 2026-06-03 |
| googleapis/gcloud-mcp | <https://github.com/googleapis/gcloud-mcp> | mcp-server | high | mcp-recipe | Apache-2.0 | 0 |  |
| Cloudflare official MCP servers | <https://github.com/cloudflare/mcp-server-cloudflare> | mcp-server | high | mcp-recipe | Apache-2.0 | 0 | 2026-04-15 |
| digitalocean/digitalocean-mcp | <https://github.com/digitalocean/digitalocean-mcp> | mcp-server | high | mcp-recipe | Apache-2.0 | 0 | 2026-05-01 |
| hashicorp/terraform-mcp-server | <https://github.com/hashicorp/terraform-mcp-server> | mcp-server | high | mcp-recipe | MPL-2.0 | 0 | 2026-06-02 |
| awslabs/iam-policy-autopilot | <https://github.com/awslabs/iam-policy-autopilot> | mcp-server | high | mcp-recipe | Apache-2.0 | 370 | 2026-06-02 |
| prowler-cloud/prowler | <https://github.com/prowler-cloud/prowler> | plugin | high | skill | Apache-2.0 | 0 | 2026-05-30 |
| k8sgpt-ai/k8sgpt | <https://github.com/k8sgpt-ai/k8sgpt> | cli-tool | high | mcp-recipe | Apache-2.0 | 0 |  |
| cloudquery/cloudquery | <https://github.com/cloudquery/cloudquery> | mcp-server | high | mcp-recipe | MPL-2.0 | 0 | 2026-05-01 |
| turbot/steampipe | <https://github.com/turbot/steampipe> | cli-tool | high | mcp-recipe | AGPL-3.0 | 0 | 2026-02-15 |
| robusta-dev/robusta + HolmesGPT | <https://github.com/robusta-dev/holmesgpt> | agent | high | template-blueprint | MIT | 0 |  |
| nityeshaga/hetzner-mcp-server | <https://github.com/nityeshaga/hetzner-mcp-server> | mcp-server | medium | mcp-recipe | MIT | 0 |  |
| kagent-dev/kagent | <https://github.com/kagent-dev/kagent> | agent | medium | template-blueprint | Apache-2.0 | 0 |  |
| kubeshop/botkube | <https://github.com/kubeshop/botkube> | cli-tool | medium | cross-reference | MIT | 0 |  |

Hyperscalers and infra vendors all shipped first-party MCP servers in 2025-2026; MCP is the de-facto agent control plane for cloud ops. Pattern: fat catalog server per vendor with per-service scoping, remote/OAuth over stdio, and bundling skills + MCP + policy as one Claude Code/Copilot plugin. CNCF-side, k8sgpt, kagent, HolmesGPT are graduating from "AI explains kubectl" to autonomous investigators with their own MCP surfaces.

### backup-dr

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| velero-mcp (benzaidfoued) | <https://github.com/benzaidfoued/velero-mcp> | mcp-server | high | mcp-recipe | MIT | 2 | 2025-11-15 |
| restic-mcp (mohsenil85) | <https://github.com/mohsenil85/restic-mcp> | mcp-server | high | mcp-recipe | MIT | 1 |  |
| velero-io/velero | <https://github.com/velero-io/velero> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 10000 | 2026-05-30 |
| kanisterio/kanister | <https://github.com/kanisterio/kanister> | operator | high | template-blueprint | Apache-2.0 | 876 | 2026-05-13 |
| etcd Claude Code skill | <https://claudskills.com/skills/etcd/> | claude-skill | high | skill |  | 0 | 2026-03-01 |
| k8up-io/k8up | <https://github.com/k8up-io/k8up> | operator | medium | template-blueprint | BSD-3-Clause | 978 | 2026-03-25 |
| stashed/stash (KubeStash) | <https://github.com/stashed/stash> | operator | medium | template-blueprint | Apache-2.0 | 1400 | 2025-10-24 |
| garethgeorge/backrest | <https://github.com/garethgeorge/backrest> | cli-tool | medium | template-blueprint | GPL-3.0 | 6500 | 2026-05-04 |
| Runbook-Agent/RunbookAI | <https://github.com/Runbook-Agent/RunbookAI> | agent | medium | cross-reference |  | 0 | 2026-04-01 |
| seriohub/vui-ui | <https://github.com/seriohub/vui-ui> | reference | low | cross-reference | Apache-2.0 | 100 | 2026-04-15 |
| longhorn/longhorn | <https://github.com/longhorn/longhorn> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 6700 | 2026-05-25 |
| kopia/kopia | <https://github.com/kopia/kopia> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 9500 | 2026-05-20 |

Backup/DR is shifting from cron + UI tools to declarative K8s operators (Velero, Kanister, K8up, Stash) whose CRDs are agent-friendly — Broadcom's 2026 donation of Velero to CNCF accelerates that. MCP layer is just emerging: a few single-author read-mostly MCP servers exist (velero-mcp, restic-mcp). Restic remains the de-facto data plane under nearly every operator.

### registries

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| nomagicln/mcp-harbor | <https://github.com/nomagicln/mcp-harbor> | mcp-server | high | mcp-recipe | MIT | 7 | 2025-04-01 |
| mshegolev/harbor-registry-mcp | <https://github.com/mshegolev/harbor-registry-mcp> | mcp-server | high | mcp-recipe | MIT | 0 | 2026-05-02 |
| quay/quay-mcp-server | <https://github.com/quay/quay-mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 2 | 2025-06-16 |
| shizhMSFT/oras-mcp | <https://github.com/shizhMSFT/oras-mcp> | mcp-server | high | mcp-recipe | Apache-2.0 | 0 |  |
| awslabs/mcp | <https://github.com/awslabs/mcp> | mcp-server | high | mcp-recipe | Apache-2.0 | 9200 | 2026-06-03 |
| sigstore/cosign | <https://github.com/sigstore/cosign> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 5997 | 2026-06-03 |
| aquasecurity/trivy | <https://github.com/aquasecurity/trivy> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 35392 | 2026-06-03 |
| anchore/grype | <https://github.com/anchore/grype> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 12331 | 2026-06-03 |
| anchore/syft | <https://github.com/anchore/syft> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 9064 | 2026-06-02 |
| containers/skopeo | <https://github.com/containers/skopeo> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 10939 | 2026-06-01 |
| google/go-containerregistry (crane) | <https://github.com/google/go-containerregistry> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 3900 | 2026-06-02 |
| oras-project/oras | <https://github.com/oras-project/oras> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 2289 | 2026-06-01 |
| CSOAI-ORG/sigstore-cosign-mcp | <https://github.com/CSOAI-ORG/sigstore-cosign-mcp> | mcp-server | medium | mcp-recipe | MIT | 0 | 2026-05-31 |
| goharbor/harbor-cli | <https://github.com/goharbor/harbor-cli> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 140 | 2026-06-02 |
| goharbor/terraform-provider-harbor | <https://github.com/goharbor/terraform-provider-harbor> | reference | medium | template-blueprint | MIT | 150 | 2026-06-01 |
| distribution/distribution | <https://github.com/distribution/distribution> | reference | medium | cross-reference | Apache-2.0 | 10456 | 2026-05-31 |
| project-zot/zot | <https://github.com/project-zot/zot> | reference | medium | template-blueprint | Apache-2.0 | 2300 | 2026-06-02 |
| kyverno/kyverno (verifyImages) | <https://github.com/kyverno/kyverno> | operator | high | cross-reference | Apache-2.0 | 7803 | 2026-06-03 |
| sse-secure-systems/connaisseur | <https://github.com/sse-secure-systems/connaisseur> | operator | medium | cross-reference | Apache-2.0 | 473 | 2026-06-03 |
| quay/clair | <https://github.com/quay/clair> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 10994 | 2026-06-02 |
| agentic-community/mcp-gateway-registry | <https://github.com/agentic-community/mcp-gateway-registry> | pattern | medium | template-blueprint |  | 0 | 2026-05-01 |

Registry tooling converging on three layers: vendor-published MCP servers wrapping registry APIs, cosign/sigstore + Rekor becoming the de-facto signature substrate that Kyverno-style admission controllers and Trivy/Grype evidence pipelines depend on, and OCI Artifacts (via ORAS) emerging as carrier format for non-image payloads (SBOMs, attestations, even agent skills). Multi-scanner cross-checking (Trivy + Grype with Syft SBOMs, CSAF VEX) is standard for high-assurance.

### ci-cd

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| github/github-mcp-server | <https://github.com/github/github-mcp-server> | mcp-server | high | mcp-recipe | MIT | 30400 | 2026-06-01 |
| argoproj-labs/mcp-for-argocd | <https://github.com/argoproj-labs/mcp-for-argocd> | mcp-server | high | mcp-recipe | Apache-2.0 | 481 | 2026-05-03 |
| fluxcd/agent-skills | <https://github.com/fluxcd/agent-skills> | claude-skill | high | skill | Apache-2.0 | 163 | 2026-04-19 |
| harness/harness-skills | <https://github.com/harness/harness-skills> | claude-skill | high | template-blueprint | Apache-2.0 | 27 | 2026-06-03 |
| tektoncd/mcp-server | <https://github.com/tektoncd/mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 21 | 2026-05-25 |
| pipekit/mcp-for-argo-workflows | <https://github.com/pipekit/mcp-for-argo-workflows> | mcp-server | high | mcp-recipe | Apache-2.0 | 5 | 2026-06-03 |
| armyknife-social/kryptonclaw | <https://github.com/armyknife-social/kryptonclaw> | cli-tool | high | mcp-recipe | MIT | 15 | 2026-03-01 |
| affaan-m/agentshield | <https://github.com/affaan-m/agentshield> | cli-tool | high | cli-anything-wrap | MIT | 787 | 2026-06-01 |
| anthropics/claude-code-action | <https://github.com/anthropics/claude-code-action> | reference | high | template-blueprint | MIT | 7900 | 2026-05-15 |
| buildkite/buildkite-mcp-server | <https://github.com/buildkite/buildkite-mcp-server> | mcp-server | medium | mcp-recipe | MIT | 49 | 2026-06-03 |
| Jordan-Jarvis/jenkins-mcp-enterprise | <https://github.com/Jordan-Jarvis/jenkins-mcp-enterprise> | mcp-server | medium | mcp-recipe | GPL-3.0 | 29 | 2026-05-04 |
| delimit-ai/delimit-mcp-server | <https://github.com/delimit-ai/delimit-mcp-server> | mcp-server | medium | template-blueprint | MIT | 18 | 2026-05-27 |
| lipingtababa/agents-zone-skillset | <https://github.com/lipingtababa/agents-zone-skillset> | claude-skill | medium | skill | MIT | 20 | 2026-04-24 |
| dagger/container-use | <https://github.com/dagger/container-use> | mcp-server | medium | mcp-recipe | Apache-2.0 | 3800 | 2025-08-19 |
| yoda-digital/mcp-gitlab-server | <https://github.com/yoda-digital/mcp-gitlab-server> | mcp-server | medium | mcp-recipe | MIT | 53 | 2026-06-01 |
| raye-deng/open-code-review | <https://github.com/raye-deng/open-code-review> | cli-tool | medium | cli-anything-wrap | BSL-1.1 | 24 | 2026-04-16 |

CI/CD MCP servers consolidating around official vendor implementations (GitHub, Buildkite, Argo CD/Workflows, Tekton, Harness) displacing the 2025 wave of single-author servers. Two new shapes: "skill bundles" shipped as Markdown to multiple agent hosts, and governance MCP servers (Delimit, AgentShield, Kryptonclaw, Open Code Review) gating AI-written code with deterministic checks + SARIF-emitting security scans. GitOps + AI is the most active narrative.

### identity-sso

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| okta/okta-mcp-server | <https://github.com/okta/okta-mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 42 | 2026-06-03 |
| sshaaf/keycloak-mcp-server | <https://github.com/sshaaf/keycloak-mcp-server> | mcp-server | high | mcp-recipe |  | 42 | 2026-05-19 |
| Samik081/mcp-authentik | <https://github.com/Samik081/mcp-authentik> | mcp-server | high | mcp-recipe | MIT | 3 | 2026-05-25 |
| agentic-community/mcp-gateway-registry | <https://github.com/agentic-community/mcp-gateway-registry> | mcp-server | high | template-blueprint | Apache-2.0 | 678 | 2026-06-04 |
| babs/mcp-auth-proxy | <https://github.com/babs/mcp-auth-proxy> | mcp-server | high | vendored | Apache-2.0 | 10 | 2026-05-28 |
| int128/kubelogin | <https://github.com/int128/kubelogin> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 2286 | 2026-05-31 |
| casdoor/casdoor | <https://github.com/casdoor/casdoor> | sdk | medium | cross-reference | Apache-2.0 | 13720 | 2026-06-03 |
| feedback-loop-ai/mcp-ory-kratos | <https://github.com/feedback-loop-ai/mcp-ory-kratos> | mcp-server | medium | mcp-recipe |  | 1 | 2026-01-19 |
| ChristophEnglisch/keycloak-model-context-protocol | <https://github.com/ChristophEnglisch/keycloak-model-context-protocol> | mcp-server | medium | template-blueprint |  | 45 | 2025-02-09 |
| tailscale/tsidp | <https://github.com/tailscale/tsidp> | sdk | medium | cross-reference | BSD-3-Clause | 595 | 2026-05-25 |
| pomerium/pomerium | <https://github.com/pomerium/pomerium> | sdk | medium | cross-reference | Apache-2.0 | 0 |  |
| mcp-auth/python | <https://github.com/mcp-auth/python> | sdk | medium | vendored | MIT | 57 | 2025-08-11 |

Identity vendors racing to ship first-party MCP servers in 2026 — Okta, Authentik (via official blog endorsement), Casdoor (marketed as "agent-first IAM") all have native or sanctioned MCP surfaces. Parallel pattern: OAuth-2.1-gated MCP gateways (agentic-community/mcp-gateway-registry, babs/mcp-auth-proxy, mcp-auth) sit in front of arbitrary MCPs and federate from existing IdPs. kubelogin and Pomerium-style identity-aware proxies are being repositioned as "agentic access gateways."

### cybersec-soc

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| gensecaihq/Wazuh-MCP-Server | <https://github.com/gensecaihq/Wazuh-MCP-Server> | mcp-server | high | mcp-recipe | MIT | 180 | 2026-03-31 |
| socfortress/velociraptor-mcp-server | <https://github.com/socfortress/velociraptor-mcp-server> | mcp-server | high | mcp-recipe | AGPL-3.0 | 39 | 2026-04-15 |
| solomonneas/thehive-mcp | <https://github.com/solomonneas/thehive-mcp> | mcp-server | high | mcp-recipe | MIT | 1 | 2026-06-03 |
| solomonneas/misp-mcp | <https://github.com/solomonneas/misp-mcp> | mcp-server | high | mcp-recipe | MIT | 0 | 2026-06-03 |
| FunnyWolf/agentic-soc-platform | <https://github.com/FunnyWolf/agentic-soc-platform> | plugin | high | template-blueprint | MIT | 841 | 2026-06-03 |
| mukul975/Anthropic-Cybersecurity-Skills | <https://github.com/mukul975/Anthropic-Cybersecurity-Skills> | claude-skill | high | vendored | Apache-2.0 | 13890 | 2026-06-01 |
| SigmaHQ/sigma-cli | <https://github.com/SigmaHQ/sigma-cli> | cli-tool | high | cli-anything-wrap |  | 192 | 2026-05-10 |
| Velocidex/velociraptor | <https://github.com/Velocidex/velociraptor> | cli-tool | high | cli-anything-wrap | NOASSERTION | 3995 | 2026-06-03 |
| socfortress/wazuh-mcp-server | <https://github.com/socfortress/wazuh-mcp-server> | mcp-server | medium | template-blueprint | AGPL-3.0 | 83 | 2026-04-15 |
| M507/AI-SOC-Agent | <https://github.com/M507/AI-SOC-Agent> | mcp-server | medium | template-blueprint | MIT | 34 | 2025-12-28 |
| jhuntinfosec/mcp-opencti | <https://github.com/jhuntinfosec/mcp-opencti> | mcp-server | medium | mcp-recipe | MIT | 3 | 2026-01-07 |
| Agent-Threat-Rule/agent-threat-rules | <https://github.com/Agent-Threat-Rule/agent-threat-rules> | reference | medium | cross-reference | MIT | 244 | 2026-06-03 |
| RefractionPOINT/dfir-iris-mcp | <https://github.com/refractionpoint/dfir-iris-mcp> | mcp-server | medium | mcp-recipe |  | 0 |  |

The open SOC stack (Wazuh, TheHive/Cortex, MISP, Velociraptor, OpenCTI, Suricata/Zeek) is rapidly standardizing on MCP as the glue to Claude Code/Cursor, with multiple competing implementations per tool already mature in mid-2026. Composability is the headline: solomonneas's 7-MCP suite, FunnyWolf's platform, SOCFortress all converge on the same Wazuh -> intel -> ATT&CK -> IR pivot chain. Sigma-for-agents (Agent Threat Rules, sigma-ai) is bringing detection-as-code to agent-runtime threats.

### sre-tooling

| name | url | category | fit | integration_vector | license | stars | last_activity |
|---|---|---|---|---|---|---|---|
| HolmesGPT (robusta-dev/holmesgpt) | <https://github.com/HolmesGPT/holmesgpt> | agent | high | mcp-recipe | Apache-2.0 | 3030 | 2026-06-03 |
| k8sgpt-ai/k8sgpt | <https://github.com/k8sgpt-ai/k8sgpt> | mcp-server | high | mcp-recipe | Apache-2.0 | 7500 | 2026-05-20 |
| containers/kubernetes-mcp-server | <https://github.com/containers/kubernetes-mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 1652 | 2026-06-03 |
| kagent-dev/kagent | <https://github.com/kagent-dev/kagent> | reference | high | template-blueprint | Apache-2.0 | 2500 | 2026-06-02 |
| kagent-dev/kmcp | <https://github.com/kagent-dev/kmcp> | cli-tool | high | cli-anything-wrap | Apache-2.0 | 464 | 2026-05-05 |
| grafana/mcp-grafana | <https://github.com/grafana/mcp-grafana> | mcp-server | high | mcp-recipe | Apache-2.0 | 1900 | 2026-05-30 |
| giantswarm/mcp-prometheus | <https://github.com/giantswarm/mcp-prometheus> | mcp-server | high | mcp-recipe | Apache-2.0 | 220 | 2026-04-22 |
| argoproj-labs/mcp-for-argocd | <https://github.com/argoproj-labs/mcp-for-argocd> | mcp-server | high | mcp-recipe | Apache-2.0 | 481 | 2026-05-03 |
| PagerDuty/pagerduty-mcp-server | <https://github.com/PagerDuty/pagerduty-mcp-server> | mcp-server | high | mcp-recipe | Apache-2.0 | 380 | 2026-05-28 |
| anthropics/claude-cookbooks (SRE agent) | <https://github.com/anthropics/claude-cookbooks/blob/main/claude_agent_sdk/site_reliability_agent/sre_mcp_server.py> | reference | high | cross-reference | MIT | 14000 | 2026-05-22 |
| stacklok/toolhive | <https://github.com/stacklok/toolhive> | operator | high | template-blueprint | Apache-2.0 | 1849 | 2026-06-03 |
| Scoutflo/Scoutflo-SRE-Playbooks | <https://github.com/Scoutflo/Scoutflo-SRE-Playbooks> | reference | medium | skill | MIT | 150 | 2026-04-10 |
| rootly-ai-labs | <https://github.com/rootly-ai-labs> | mcp-server | medium | mcp-recipe | MIT | 200 | 2026-05-15 |
| GoogleCloudPlatform/kubectl-ai | <https://github.com/GoogleCloudPlatform/kubectl-ai> | cli-tool | medium | cli-anything-wrap | Apache-2.0 | 8500 | 2026-05-20 |
| headlamp-k8s/plugins (ai-assistant) | <https://github.com/headlamp-k8s/plugins/tree/main/ai-assistant> | reference | medium | template-blueprint | Apache-2.0 | 600 | 2026-05-12 |
| alibabacloud/ack-mcp-server | <https://github.com/aliyun/alibabacloud-ack-mcp-server> | mcp-server | medium | template-blueprint | Apache-2.0 | 112 | 2026-04-29 |
| WagnerAgent/awesome-mcp-servers-devops | <https://github.com/WagnerAgent/awesome-mcp-servers-devops> | reference | medium | cross-reference | CC0-1.0 | 95 | 2026-05-11 |
| microsoft/mcp-gateway | <https://github.com/microsoft/mcp-gateway> | operator | medium | template-blueprint | MIT | 663 | 2026-05-28 |

SRE-tooling consolidated around MCP as the universal tool-surface protocol: every incumbent (HolmesGPT, K8sGPT, Grafana, ArgoCD, PagerDuty, Rootly, Komodor, Headlamp) ships first-party MCP servers; CNCF Sandbox-blessed both HolmesGPT and kagent as reference agent runtimes. Frontier moving from single-tool MCPs to multi-agent orchestration (Komodor Klaudia, Azure SRE Agent GA, AWS DevOps Agent GA) and gateway/lifecycle layers (ToolHive, microsoft/mcp-gateway, kmcp). Read-only-by-default + explicit write-gate is the consensus security model.

## Cross-cutting trends

1. **MCP is now the universal agent control plane for DevOps.** Every major vendor across 25 surveyed domains shipped first-party MCP servers in 2025-2026: HashiCorp (Vault, Terraform, Packer Skills), AWS (30+ servers + Agent Toolkit), Microsoft (Azure MCP built into VS 2026), Google (gcloud-mcp), Cloudflare, DigitalOcean, GitHub, Argo, Flux, Tekton, Buildkite, Harness, PagerDuty, Rootly, Grafana, SigNoz, VictoriaMetrics, Trivy, Kubescape, CrowdStrike, Okta, Authentik. The vendor MCP wave has displaced the 2025 single-author servers in most domains.

2. **Cedar is winning the agent-authorization layer; OPA/Rego still owns K8s admission + IaC.** cedar-for-agents (with schema generation from MCP tool descriptions), AWS Bedrock AgentCore Policy GA (Mar 2026), and a cluster of Cedar-using projects (ScopeBlind, Vectimus, Carapace, Sondera, AgenticContract) converged on Cedar as the authorization model for AI tool calls — opsbench's existing Cedar gating is squarely in this lane. OPA/Rego remains dominant for K8s admission (Gatekeeper, Kyverno) and IaC testing (Conftest, Regal).

3. **A new "MCP gateway" category has emerged.** ToolHive, microsoft/mcp-gateway, agentic-community/mcp-gateway-registry, ScopeBlind, IBM mcp-context-forge, Permit MCP Gateway, kmcp, kubernetes-sigs/mcp-lifecycle-operator all sit between agents and MCP servers, federate auth from existing IdPs, and increasingly sign decisions as cryptographically-verifiable receipts. This is the same evidence-sealing pattern opsbench implements with SHA-256.

4. **K8s-native agent runtimes graduated from research to production.** kagent went to CNCF Sandbox, HolmesGPT followed, and both treat Agent/MCPServer/ToolServer as first-class CRDs. The "agents as CRDs with MCP tool servers" pattern is being copied across security (Kubescape KAgent plugin), SRE (kagent toolset), and policy (kmcp). Kubebuilder issue #5551 signals future operators will ship AGENTS.md + .claude scaffolds by default.

5. **eBPF is now the default substrate for network/runtime forensics.** Inspektor Gadget, Kubeshark, Microsoft Retina, Cilium pwru/Hubble/Tetragon, Pixie, kguardian dominate the L3-L7 observability and security space, and HolmesGPT's autonomous picking of Inspektor Gadget gadgets is the canonical LLM-driven incident pattern. opsbench's AKS forensic recipe sits cleanly on this substrate.

6. **License heterogeneity is a real constraint for vendoring.** AGPL-3.0 (Flux MCP, Velociraptor MCP, trufflehog, Kyverno MCP, Steampipe, Pyroscope), GPL-3.0 (mcp-server-docker, Jenkins MCP, sealed-secrets-derived tools), BUSL-1.1 (Packer, Consul, Open Code Review), MPL-2.0 (Terraform MCP, Vault MCP, SOPS, kubectl-operator, Vector), and NOASSERTION (ksail PolyForm, Velocidex, Velero CLI) require opsbench to treat most of these as external subprocesses rather than vendored code. Apache-2.0 / MIT / BSD remain the safe-to-vendor set.

## Build opportunities (gaps to fill)

1. **Cedar-gated, evidence-sealing MCP gateway for opsbench** — *Effort: M.* Problem: every MCP server today exposes tools without policy gating or cryptographic chain-of-custody; scopeblind-gateway and agentic-community/mcp-gateway-registry come close but none combine Cedar + SHA-256 evidence sealing + per-agent allowlist + Ed25519-signed receipts in one production-ready package. Proposed shape: new package wrapping mcp-auth-proxy + cedar-for-agents schema generator + opsbench's existing evidence pipeline. Supporting evidence: argocd, vault, crossplane, security-scanners, policy-engines, secrets-mgmt, sre-tooling, registries domains all flagged this as the central gap.

2. **GitOps incident-response skill (drift → diff → guarded rollback → sealed evidence)** — *Effort: M.* Problem: no published Claude Code skill codifies the full GitOps incident-response runbook end-to-end with evidence sealing. Proposed shape: opsbench team-incident-response skill targeting Flux MCP + ArgoCD MCP + kubectl with Cedar gates on sync/rollback. Supporting evidence: argocd, operators, config-mgmt, progressive-delivery, ci-cd.

3. **Multi-distro K8s incident-triage skill** — *Effort: M.* Problem: every existing MCP is one server per distro (Talos, k3s, microk8s, EKS, k0s); no unified triage skill fans out across distros behind one agent. Proposed shape: opsbench team-incident-response recipe composing containers/kubernetes-mcp-server + Talos MCP + k0sctl wrap + EKS MCP behind a single Cedar-gated agent. Supporting evidence: k8s-distros, sre-tooling, operators.

4. **Forensic-grade scanner orchestrator** — *Effort: M.* Problem: nothing chains Trivy/Kubescape/Grype scans + Tetragon/Falco timeline + SHA-256 evidence sealing into one Cedar-gated workflow with normalized findings. Proposed shape: opsbench team-security recipe wrapping cloudshipai/ship + Prempti + Tetragon CLI under unified finding schema (lift Horizon-Digital-Engineering pattern). Supporting evidence: security-scanners, network-diag, registries, docker.

5. **Packer MCP server (vendor-quality, evidence-sealing)** — *Effort: L.* Problem: HashiCorp ships official Terraform MCP but no Packer MCP yet; CowDogMoo/warpgate is the only credible community attempt. Proposed shape: opsbench Packer MCP recipe mirroring terraform-mcp-server architecture, adding HCP Packer channel-promote/delete tools behind Cedar gates and cosign-signing built artifacts. Supporting evidence: packer (primary), cloud-providers, ci-cd.

6. **OLMv1-aware ClusterExtension MCP** — *Effort: M.* Problem: only legacy OLMv0 MCP exists; OLMv1 (operator-controller + catalogd) has no MCP. Proposed shape: opsbench MCP recipe wrapping ClusterCatalog/ClusterExtension APIs with Cedar-gated install/upgrade. Supporting evidence: operators.

7. **Service-mesh forensics MCPs (Istio/Hubble/Kiali)** — *Effort: M.* Problem: no maintained service-mesh-dedicated MCP server exists despite the 2026 ambient-mesh shift. Proposed shape: three thin Cedar-gated MCPs (a) istioctl proxy-config wrapper with JSON output, (b) Kiali graph + validations REST shim, (c) hubble observe with policy-filtered scopes. Supporting evidence: service-mesh, network-diag, ingress-and-gateway.

8. **Kubernetes-DR Recovery skill (etcd + Velero + Longhorn + Kanister)** — *Effort: L.* Problem: no agent-callable "cross-layer DR" tool composes etcd snapshot + Velero restore + Longhorn failover + Kanister Blueprint into a single policy-gated, evidence-sealed restore plan. Proposed shape: opsbench team-incident-response skill orchestrating the layer-by-layer recovery with per-step Cedar approval. Supporting evidence: backup-dr, k8s-distros, operators.

9. **Cross-cloud incident-response agent (AKS + EKS + GKE + DOKS)** — *Effort: M.* Problem: every cloud MCP gives raw tool surface with no policy/provenance discipline. Proposed shape: opsbench team-incident-response recipe binding awslabs/mcp (EKS) + Azure MCP + gcloud-mcp + DigitalOcean MCP under single Cedar policy with cross-cloud evidence bundle output (a candidate reference forensic-bundle format). Supporting evidence: cloud-providers, k8s-distros, sre-tooling.

10. **Multi-registry forensic MCP + IR replay skill** — *Effort: M.* Problem: every existing registry MCP is single-vendor with no policy gating; no skill combines skopeo/crane copy-to-sandbox + Syft+Grype+Trivy triple-attest + cosign verify into one workflow. Proposed shape: opsbench team-incident-response skill unifying Harbor/Quay/ECR/ACR/GHCR behind sealed-evidence output. Supporting evidence: registries, security-scanners, secrets-mgmt.

11. **Ansible IR + EDA + ansible-lint MCP** — *Effort: M.* Problem: no MCP exposes EDA + AAP + ansible-lint + evidence-sealing as one forensic-grade surface. Proposed shape: opsbench Cedar-gated Ansible MCP mirroring the K8s/AKS forensic shape; pair with team-incident-response Cedar policies. Supporting evidence: ansible, config-mgmt.

12. **Cedar-policy-gated OPA/Gatekeeper/Conftest MCP recipe** — *Effort: S.* Problem: no mature MCP wraps OPA/Gatekeeper/Conftest; only an auto-generated 1-star REST shim exists. Proposed shape: thin opsbench team-platform-engineering MCP recipe wrapping `opa eval` / `conftest test` / `gator` with Cedar gating + SHA-256-sealed Rego decision logs. Supporting evidence: policy-engines, terraform, ci-cd.

13. **Cloud-agnostic observability evidence bundle MCP** — *Effort: M.* Problem: no MCP bundles hash-chained metrics+logs+traces windows around an incident; vendor MCPs each cover one slice. Proposed shape: opsbench team-incident-response recipe wrapping Grafana/Loki/Tempo/Prom MCPs and emitting a single SHA-256-sealed forensic capture. Supporting evidence: observability, sre-tooling, network-diag.

14. **OpenTofu-native skill** — *Effort: S.* Problem: most existing Terraform skills treat tofu as an alias; nothing handles state encryption and module registries differently. Proposed shape: opsbench team-platform-engineering skill branching on tofu vs terraform binary with first-class tofu state-encryption guidance. Supporting evidence: terraform.

15. **Incident-response for leaked secrets (scan → verify-active → rotate-via-Vault → seal evidence)** — *Effort: M.* Problem: no opinionated skill chains trufflehog + vault-mcp + opsbench evidence sealing into a single Cedar-gated remediation. Proposed shape: opsbench team-incident-response skill combining gitleaks/trufflehog detection + Infisical/Vault MCP rotation + evidence bundle. Supporting evidence: secrets-mgmt, cybersec-soc, vault.

16. **Cross-IdP "team-iam-forensics" recipe** — *Effort: M.* Problem: no skill unifies Keycloak/Okta/Authentik/Ory into one IR investigation that correlates sessions with K8s audit logs. Proposed shape: opsbench team-incident-response skill bridging the four IdP MCPs + kubectl audit-log queries under a single Cedar policy. Supporting evidence: identity-sso, cybersec-soc, secrets-mgmt.

17. **Team-soc-analyst skill bundle** — *Effort: M.* Problem: SOC MCPs (Wazuh, MISP, TheHive, Velociraptor, OpenCTI) exist as singletons; no curated, Cedar-policed multi-tool investigation loop with auditable transcripts. Proposed shape: opsbench team-soc-analyst pack orchestrating solomonneas's 7-MCP suite + Velociraptor + Sigma rule authoring. Supporting evidence: cybersec-soc, security-scanners.

18. **Progressive-delivery atomic skill (rollout + PromQL verify + flag flip)** — *Effort: S.* Problem: no MCP wraps Argo Rollouts CRD or Kargo promotion API directly; no evidence-sealed workflow combines rollout + verify + flag in one Cedar-gated step. Proposed shape: argo-rollouts-mcp + kargo-mcp opsbench recipes plus a team-platform-engineering skill that ties them to a Prometheus MCP verification gate and OpenFeature flag flip. Supporting evidence: progressive-delivery, observability, ci-cd.

19. **Crossplane "safe-write" MCP + evidence-sealed forensic skill** — *Effort: M.* Problem: existing Crossplane MCPs are either marketplace or read-only; no Cedar-gated write MCP with dry-run preview, no skill capturing compositionrevision diffs + MR drift + providerconfig deltas as SHA-256 evidence. Proposed shape: opsbench Crossplane MCP + team-platform-engineering skill chaining crank render -> swisscom tester -> trace inside one agent session. Supporting evidence: crossplane, operators.

20. **"Migrate-off-ingress-nginx" template-blueprint skill** — *Effort: S.* Problem: Ingress-NGINX EOL pressure with no opinionated migration skill despite CNCF-blessed paths (Higress, kgateway, Traefik). Proposed shape: opsbench team-platform-engineering skill that audits current ingress-nginx state, emits a guided migration PR series targeting one of the three replacements. Supporting evidence: ingress-and-gateway, service-mesh.
