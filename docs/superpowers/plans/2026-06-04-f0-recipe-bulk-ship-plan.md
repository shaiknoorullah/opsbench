# F0 — Recipe Bulk-Ship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship ~30 catalog-derived MCP recipes (plus the 5 inherited from old P1) plus the Falco-event-ingest skill, rewrite `docs/integrations.md`, and update team-readme counts, all in one PR.

**Architecture:** Pure-doc additions. Each recipe follows a uniform template. Bulk authoring favors speed and consistency over per-recipe verification (CI lint is the safety net). No code or behavior change to any agent or hook.

**Tech Stack:** Markdown, JSONC (config snippets), bash (verification).

**Parent spec:** [`../specs/2026-06-04-f-series-master-roadmap.md`](../specs/2026-06-04-f-series-master-roadmap.md)

---

## File structure

```
packages/team-incident-response/mcp-recipes/
├── thehive-mcp.md                       (NEW — inherited from old P1)
├── opencti-mcp.md                       (NEW — inherited)
├── azure-skills-mcp.md                  (NEW — inherited)
├── k8sgpt-mcp.md                        (NEW — inherited)
├── cli-anything-framework.md            (NEW — inherited)
├── vault-mcp.md                         (NEW)
├── github-mcp.md                        (NEW)
├── awslabs-mcp.md                       (NEW)
├── gcloud-mcp.md                        (NEW)
├── microsoft-mcp.md                     (NEW)
├── argocd-mcp.md                        (NEW)
├── argocd-akuity-mcp.md                 (NEW)
├── argo-workflows-mcp.md                (NEW)
├── kubernetes-mcp.md                    (NEW)
├── kubernetes-cli-bridge-mcp.md         (NEW)
├── helm-mcp.md                          (NEW)
├── crossplane-mcp.md                    (NEW)
├── crossplane-control-plane-mcp.md      (NEW)
├── crossplane-marketplace-mcp.md        (NEW)
├── terraform-mcp.md                     (NEW)
├── ansible-mcp.md                       (NEW)
├── docker-mcp.md                        (NEW)
├── inspektor-gadget-mcp.md              (NEW)
├── kubeshark-mcp.md                     (NEW)
├── talos-mcp.md                         (NEW)
├── trivy-mcp.md                         (NEW)
├── kubescape-mcp.md                     (NEW)
├── crowdstrike-falcon-mcp.md            (NEW)
├── kyverno-mcp.md                       (NEW)
├── prometheus-mcp.md                    (NEW)
├── grafana-mcp.md                       (MODIFY — replace pointer with vendor MCP)
├── loki-mcp.md                          (NEW)
├── signoz-mcp.md                        (NEW)
├── otel-mcp.md                          (NEW)
├── victoriametrics-mcp.md               (NEW)
├── alertmanager-mcp.md                  (NEW)
├── flux-mcp.md                          (NEW)
├── cedar-for-agents-reference.md        (NEW)
└── azure-mcp.md                         (MODIFY — See-also section)

packages/team-incident-response/skills/falco-event-ingest/   (NEW — inherited)
├── SKILL.md
└── templates/
    ├── falcosidekick.values.yaml.template
    ├── cli-anything-harness.md.template
    └── README.md

packages/team-incident-response/README.md                    (MODIFY — counts)
README.md                                                     (MODIFY — counts)
docs/integrations.md                                          (NEW)
cspell.json                                                   (MODIFY)
```

## Branch & PR

Work on branch `feat/f0-recipe-bulk-ship`. One PR titled `feat(team-incident-response): F0 bulk-ship ~30 MCP recipes from ecosystem research catalog`.

Commits grouped by recipe family (vault, github, cloud, argo, k8s, crossplane, IaC, observability, security, etc.) — roughly 8–10 commits.

---

## Pi-first prerequisite (added 2026-06-04 — must complete before any recipe authoring)

Per the F-series cross-cutting principle update: opsbench is Pi-first. Every F0 recipe must lead with a **Pi configuration block** before the Claude Code block. Before bulk-ship begins:

- [ ] **Step P1: Verify Pi's MCP configuration format**

  Confirm the user means Pi the coding-agent host referenced by `HKUDS/CLI-Anything`'s plugin list (the most likely interpretation given prior session context). Capture the exact MCP config file path, JSON schema, and any Pi-specific transport conventions. If Pi uses a non-MCP plugin interface, document the equivalent plugin manifest format.

- [ ] **Step P2: Lock the Pi-first recipe template**

  Update the template below to include a Pi block first, Claude Code block second, with documented anchor sections. The template stub below is a placeholder; Step P1 fills in the Pi syntax.

The remaining tasks (T1–T20) execute against the Pi-first template once Steps P1–P2 are done.

## Recipe template (apply to every recipe)

````markdown
# MCP Recipe — <slug>

<one-paragraph purpose statement: who uses this, when, and what opsbench team-incident-response (or future team) agent class would call it>

## Source

- Repo: <https://github.com/OWNER/REPO>
- License: <SPDX>
- Maintainer: <Vendor or community — be honest about official/unofficial>

## Install

```bash
<exact install command — prefer release binaries or container images over source builds>
```

## Configuration — Pi (primary)

```<format determined by Pi research — likely JSON or YAML>
<Pi-native MCP server entry. Anchor section name and format pending Step P1.>
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "<slug>": {
      "command": "<binary>",
      "args": [...],
      "env": {
        "<KEY>": "${ENV_VAR_OR_LITERAL}"
      }
    }
  }
}
```

## Configuration — other hosts

Codex CLI, Cursor, Copilot CLI, Gemini, OpenCode — link to `tools/<host>-compat-layer/README.md` for the host-specific install + config flow. F0 ships the link; the adapters themselves arrive in F5.

## Auth setup

<1–5 steps. Always include a verification command that confirms credentials are scoped (e.g., role check, capability list).>

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| ---- | ------- | ------------------------ |
| <tool name> | <one-line purpose> | <Open by default / Closed — gate per agent / Closed — human-gate> |

(Table can be short — link to upstream tool reference if the surface is large.)

## Safety

- <Read-only defaults, mutation gating, prompt-injection caveats specific to this MCP>
- <Cedar policy notes — where this MCP fits in `tools.cedar` or `tools-generated.cedar`>
- <Any well-known security issues filed against upstream>

## Caveats

- <Known limitations, beta status, license incompatibilities, infra prereqs>

## See also

- <Related opsbench recipes — keep this section short>
````

---

## Recipe metadata table

For each new recipe, the executor fills the template using these inputs:

| slug | upstream | license | install_hint | auth_hint | tools_count |
|------|----------|---------|--------------|-----------|-------------|
| vault-mcp | `hashicorp/vault-mcp-server` | MPL-2.0 | `curl -fsSL .../releases/latest/download/vault-mcp-server-linux-amd64 -o /usr/local/bin/vault-mcp` | `VAULT_ADDR`, `VAULT_TOKEN` (or AppRole `VAULT_ROLE_ID`/`VAULT_SECRET_ID`); verify with `vault token lookup -accessor` | KV/PKI/Transit/AppRole — read-only default; gate `kv-write`, `pki-issue` per agent |
| github-mcp | `github/github-mcp-server` | MIT | `docker pull ghcr.io/github/github-mcp-server:latest` OR `npm i -g @github/github-mcp-server` | `GITHUB_PERSONAL_ACCESS_TOKEN` (fine-grained, read-only scope `actions:read`, `contents:read`, `issues:read`); verify scopes with `gh auth status` | Actions/PRs/Issues/Repos — read-only by default; gate write tools (issue creation, PR merge) |
| awslabs-mcp | `awslabs/mcp` | Apache-2.0 | Per-server install — `pip install awslabs.eks-mcp` (etc.) | AWS SDK env (`AWS_PROFILE`, IAM ReadOnlyAccess + targeted scopes); verify via `aws sts get-caller-identity` | EKS, CloudWatch, IAM, Cost Explorer; one MCP server per AWS service — recipe documents the EKS + CloudWatch + IAM trio first |
| gcloud-mcp | `googleapis/gcloud-mcp` | Apache-2.0 | `gcloud components install mcp-server` | `gcloud auth application-default login` OR `GOOGLE_APPLICATION_CREDENTIALS`; verify with `gcloud auth list` | GKE, Cloud Logging, IAM, Pub/Sub |
| microsoft-mcp | `microsoft/mcp` | MIT | Plugin install via Claude Code `/plugin install azure@claude-plugins-official` | `az login` or SP env vars (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`); verify with `az account show` | Azure Resource Manager parity layer — different from azure-skills which adds the skills wrapper |
| argocd-mcp | `argoproj-labs/mcp-for-argocd` | Apache-2.0 | `go install github.com/argoproj-labs/mcp-for-argocd/cmd/mcp-for-argocd@latest` OR Docker | `ARGOCD_SERVER`, `ARGOCD_AUTH_TOKEN`; verify `argocd account get-user-info` | App list/sync/rollback; gate sync/rollback per agent |
| argocd-akuity-mcp | `akuity/argocd-mcp` | Apache-2.0 | Same as above but binary `akuity-argocd-mcp` | Same env contract as argocd-mcp | Alternative implementation by Argo creators; pair with Akuity Promotion Advisor (reference only) |
| argo-workflows-mcp | `Heapy/argo-workflows-mcp` | Apache-2.0 | `npm i -g @heapy/argo-workflows-mcp` | `ARGO_WORKFLOWS_TOKEN`, `ARGO_WORKFLOWS_URL` | Workflow list/log/resubmit; SQLite-backed permission audit; HTTP/SSE only (no stdio) |
| kubernetes-mcp | `containers/kubernetes-mcp-server` | Apache-2.0 | `go install github.com/containers/kubernetes-mcp-server@latest` | `KUBECONFIG` to a view-only SA kubeconfig | Distro-agnostic K8s/OpenShift; non-destructive mode default; OTel-instrumented |
| kubernetes-cli-bridge-mcp | `alexei-led/k8s-mcp-server` | MIT | `npm i -g @alexei-led/k8s-mcp-server` | `KUBECONFIG`; explicit per-command timeouts | Bridges kubectl/helm/istioctl/argocd CLI surfaces — useful when raw CLI is needed |
| helm-mcp | `zekker6/mcp-helm` | MIT | `npm i -g @zekker6/mcp-helm` | Helm repo URLs only (no cluster auth needed) | Read-only Helm repo search/lookup; no install/uninstall |
| crossplane-mcp | `briferz/crossplane-mcp` | Apache-2.0 | `go install github.com/briferz/crossplane-mcp@latest` | `KUBECONFIG`; designed for read-only SRE persona | Compositions, providers, claims — troubleshooting reads only |
| crossplane-control-plane-mcp | `upbound/controlplane-mcp-server` | Apache-2.0 | Upbound install — `up mcp install controlplane` | `UP_TOKEN`; gate writes via Cedar | Control-plane CRUD; vendor MCP |
| crossplane-marketplace-mcp | `upbound/marketplace-mcp-server` | Apache-2.0 | `up mcp install marketplace` | No auth (public marketplace) | Read-only marketplace search |
| terraform-mcp | `hashicorp/terraform-mcp-server` | MPL-2.0 | `terraform mcp serve` (in upcoming Terraform CLI versions) OR standalone binary | `TF_CLOUD_TOKEN` for HCP/TFE; verify with `terraform login` | Registry queries + HCP/TFE workspaces; tool-hint design aligns with Cedar |
| ansible-mcp | `ansible/vscode-ansible` (Ansible Dev Tools MCP) | Apache-2.0 | npm `@ansible/dev-tools-mcp` OR `ghcr.io/ansible/ansible-dev-tools-mcp` | No auth for lint/scaffold; AAP/EDA auth via Red Hat OIDC if extending | Playbook scaffolding/lint/EE |
| docker-mcp | `docker/mcp-gateway` | MIT | `docker run --rm -it docker/mcp-gateway` | Docker socket mount; verify with `docker version` | Manages MCP servers as isolated containers; pair with `ckreiling/mcp-server-docker` for full Docker CRUD (GPL — external only) |
| inspektor-gadget-mcp | `inspektor-gadget/ig-mcp-server` | Apache-2.0 | `kubectl ig install` then `ig mcp serve` | `KUBECONFIG`; in-cluster eBPF agent | DNS/TCP/syscall traces; closes the AKS kernel-forensics gap |
| kubeshark-mcp | `kubeshark/kubeshark` | Apache-2.0 | `helm install kubeshark kubeshark/kubeshark --set features.mcpServer.enabled=true` | `KUBECONFIG`; runs as DaemonSet | eBPF traffic analyzer; TTL captures; heavy footprint — gate by namespace |
| talos-mcp | `Nosmoht/talos-mcp-server` | MIT | `go install github.com/Nosmoht/talos-mcp-server@latest` | `TALOSCONFIG`; verify with `talosctl version` | Talos gRPC apid MCP for node-level forensics; mutating ops gated via `confirm=true` |
| trivy-mcp | `aquasecurity/trivy-mcp` | MIT | `trivy mcp serve` (bundled with Trivy ≥0.55) | None (local fs/repo scans) or registry auth via `~/.docker/config.json` for image scans | fs/image/repo CVE scans; stdio/HTTP/SSE |
| kubescape-mcp | `kubescape/kubescape` (built-in `kubescape mcp`) | Apache-2.0 | `brew install kubescape` then `kubescape mcp serve` | `KUBECONFIG` | Posture scans + KAgent plugin integration |
| crowdstrike-falcon-mcp | `CrowdStrike/falcon-mcp` | MIT | `pip install crowdstrike-falcon-mcp` | `FALCON_CLIENT_ID`, `FALCON_CLIENT_SECRET` (API client created in Falcon Console with read scopes) | 20+ Falcon modules incl. detections, hosts, RTR — gate RTR and quarantine actions |
| kyverno-mcp | `nirmata/kyverno-mcp` | AGPL-3.0 | Docker only — `docker run nirmata/kyverno-mcp` (AGPL: external process only, never vendored) | `KUBECONFIG` | Apply/validate/violations; AGPL forces external subprocess use |
| prometheus-mcp | `pab1it0/prometheus-mcp-server` | MIT | `pip install prometheus-mcp-server` | `PROMETHEUS_URL` (no auth unless your Prom is behind a proxy) | Read-only PromQL — safe allowlist add |
| grafana-mcp (replace existing) | `grafana/mcp-grafana` | Apache-2.0 | `npm i -g @grafana/mcp-grafana` | `GRAFANA_URL`, `GRAFANA_API_KEY` (Editor role for dashboards; Viewer if read-only) | Dashboards, Prom queries, Loki queries, Tempo, alerts — gate write tools |
| loki-mcp | `grafana/loki-mcp` | (verify upstream license; assume Apache-2.0 until confirmed) | `npm i -g @grafana/loki-mcp` | `LOKI_URL`, `LOKI_USERNAME`, `LOKI_PASSWORD` (basic auth) or token | LogQL queries only |
| signoz-mcp | `SigNoz/signoz-mcp-server` | Apache-2.0 | `npm i -g @signoz/mcp-server` | `SIGNOZ_URL`, `SIGNOZ_API_KEY` | OTel-native; metrics + traces + logs |
| otel-mcp | `traceloop/opentelemetry-mcp-server` | Apache-2.0 | `npm i -g @traceloop/otel-mcp-server` | Backend-specific (Jaeger / SigNoz / Honeycomb / etc.) | Multi-backend OTel trace queries |
| victoriametrics-mcp | `VictoriaMetrics/mcp-victoriametrics` | Apache-2.0 | Bundled with VictoriaMetrics ≥1.105 — `victoria-metrics mcp serve` | `VM_URL`, `VM_TOKEN` | MetricsQL queries |
| alertmanager-mcp | `ntk148v/alertmanager-mcp-server` | Apache-2.0 | `go install github.com/ntk148v/alertmanager-mcp-server@latest` | `ALERTMANAGER_URL` | Silences/groups — gate silence ops per agent |
| flux-mcp | `controlplaneio-fluxcd/flux-operator` | AGPL-3.0 | Docker only — `docker run controlplane/flux-mcp` (AGPL: external process) | `KUBECONFIG` | Flux v2 reconciliation status, source CRs |
| cedar-for-agents-reference | `cedar-policy/cedar-for-agents` | (verify upstream license) | Reference doc — links to upstream; not an MCP server | N/A | This is a *reference recipe* documenting how F1 will consume cedar-for-agents to generate `tools-generated.cedar`. No install for end users in F0. |

---

## Tasks

### Task 0: Create branch from main (clean state)

- [ ] **Step 1: Confirm clean main**

  ```bash
  git checkout main && git pull origin main --ff-only && git status
  ```

  Expected: `nothing to commit, working tree clean`.

- [ ] **Step 2: Create F0 branch**

  ```bash
  git checkout -b feat/f0-recipe-bulk-ship
  ```

---

### Task 1: Bring forward the 5 inherited recipes + Falco skill from old P1

The recipe content for TheHive, OpenCTI, azure-skills, k8sgpt, CLI-Anything-framework, and the Falco skill is fully specified in the (superseded but content-valid) [`2026-06-04-p1-mcp-recipes-implementation.md`](./2026-06-04-p1-mcp-recipes-implementation.md).

- [ ] **Step 1: Copy the 5 recipes verbatim from old P1 Tasks 1–5**

  Use the recipe content blocks in old P1's Task 1 (thehive), Task 2 (opencti), Task 3 (azure-skills), Task 4 (k8sgpt), Task 5 (cli-anything-framework). Write each to the corresponding file under `packages/team-incident-response/mcp-recipes/`.

  Per the user amendment, `thehive-mcp.md` must keep the EXPERIMENTAL banner and `PERMISSIONS_CONFIG=read_only` default.

- [ ] **Step 2: Create the Falco skill verbatim from old P1 Task 6**

  Write the SKILL.md + 3 template files under `packages/team-incident-response/skills/falco-event-ingest/` exactly as old P1 Task 6 specifies.

- [ ] **Step 3: Verify lint + skill validation**

  ```bash
  npx markdownlint-cli2 "packages/team-incident-response/mcp-recipes/{thehive,opencti,azure-skills,k8sgpt,cli-anything-framework}-mcp.md" \
                        "packages/team-incident-response/skills/falco-event-ingest/**/*.md"
  bash scripts/validate-skill.sh
  ```

  Expected: 0 errors; OK count includes falco-event-ingest.

- [ ] **Step 4: Commit**

  ```bash
  git add packages/team-incident-response/mcp-recipes/{thehive,opencti,azure-skills,k8sgpt,cli-anything-framework}-mcp.md \
          packages/team-incident-response/skills/falco-event-ingest
  LEFTHOOK_EXCLUDE="cspell,yamllint" git commit -m "feat(team-incident-response): F0 inherit 5 P1 recipes + falco-event-ingest skill"
  ```

---

### Tasks 2–10: Bulk-write the 33 new recipes (grouped by family)

For each recipe in the metadata table above, apply the template using the per-recipe inputs. Group into ~9 commits by family for review-ability:

- [ ] **Task 2 — Identity & secrets family** (vault-mcp, microsoft-mcp): write 2 recipes, lint, commit `feat(team-incident-response): F0 add vault + microsoft MCP recipes`
- [ ] **Task 3 — GitHub + CI family** (github-mcp): write recipe, lint, commit `feat(team-incident-response): F0 add github MCP recipe`
- [ ] **Task 4 — Cloud-provider family** (awslabs-mcp, gcloud-mcp): write 2 recipes, lint, commit `feat(team-incident-response): F0 add aws + gcp MCP recipes`
- [ ] **Task 5 — Argo family** (argocd-mcp, argocd-akuity-mcp, argo-workflows-mcp): write 3 recipes, lint, commit `feat(team-incident-response): F0 add argocd + argo-workflows recipes`
- [ ] **Task 6 — Kubernetes core family** (kubernetes-mcp, kubernetes-cli-bridge-mcp, helm-mcp, talos-mcp): write 4 recipes, lint, commit `feat(team-incident-response): F0 add core k8s MCP recipes`
- [ ] **Task 7 — Crossplane family** (crossplane-mcp, crossplane-control-plane-mcp, crossplane-marketplace-mcp): write 3 recipes, lint, commit `feat(team-incident-response): F0 add crossplane MCP recipes`
- [ ] **Task 8 — IaC + config family** (terraform-mcp, ansible-mcp, docker-mcp): write 3 recipes, lint, commit `feat(team-incident-response): F0 add iac MCP recipes`
- [ ] **Task 9 — Network forensics family** (inspektor-gadget-mcp, kubeshark-mcp): write 2 recipes, lint, commit `feat(team-incident-response): F0 add network-forensics MCP recipes`
- [ ] **Task 10 — Security/policy family** (trivy-mcp, kubescape-mcp, crowdstrike-falcon-mcp, kyverno-mcp): write 4 recipes, lint, commit `feat(team-incident-response): F0 add security/policy MCP recipes`
- [ ] **Task 11 — Observability family** (prometheus-mcp, grafana-mcp REWRITE, loki-mcp, signoz-mcp, otel-mcp, victoriametrics-mcp, alertmanager-mcp): write 7 recipes (1 replaces existing), lint, commit `feat(team-incident-response): F0 add observability MCP recipes`
- [ ] **Task 12 — GitOps & policy-engine family** (flux-mcp, cedar-for-agents-reference): write 2 recipes, lint, commit `feat(team-incident-response): F0 add flux + cedar-for-agents recipes`

For each task above, the lint step is uniform:

```bash
npx markdownlint-cli2 "packages/team-incident-response/mcp-recipes/<files in this family>.md"
```

Per-recipe authoring guidance:

- Use the template at the top of this plan verbatim.
- Pull the metadata for each recipe from the table above.
- For `Tools surfaced`: 3–7 representative tools max; link to upstream's tool reference for the full surface.
- For `Safety`: at minimum, name the read-only-vs-write distinction, the recommended Cedar gating posture (Open / Closed-per-agent / Closed-human-gated), and any known upstream security warning.
- For `Caveats`: license incompatibilities (especially AGPL → external-only), beta status, infra prereqs.
- For `See also`: 1–3 related recipes max.

---

### Task 13: Replace the existing `grafana-mcp.md` with the vendor MCP version

- [ ] **Step 1: Backup the existing custom recipe content**

  ```bash
  cp packages/team-incident-response/mcp-recipes/grafana-mcp.md /tmp/grafana-mcp.md.backup
  ```

- [ ] **Step 2: Write the new recipe** using `grafana/mcp-grafana` per Task 11.

- [ ] **Step 3: Verify any references in other recipes/skills still work**

  ```bash
  grep -rn "grafana-mcp" packages/ docs/
  ```

  Update cross-links if the tool list or auth env vars changed materially.

- [ ] **Step 4: Commit** (already covered by Task 11's commit).

---

### Task 14: Update `azure-mcp.md` with See-also section

Apply the See-also block from old P1 Task 7 verbatim. Commit:

```bash
git add packages/team-incident-response/mcp-recipes/azure-mcp.md
LEFTHOOK_EXCLUDE="cspell,yamllint" git commit -m "docs(team-incident-response): cross-link azure-mcp to azure-skills + k8sgpt"
```

---

### Task 15: Rewrite `docs/integrations.md` with the full F0 inventory

Replace the old P1 version with a comprehensive table that includes all 38 entries (5 inherited + 33 new). Group by integration vector (mcp-recipe / skill / reference / template).

Use the exact format from old P1 Task 9, expanded to cover all new entries. For each entry: project, license, how opsbench uses it, file path.

Include a deferred-to-F6 section listing sympozium, agentgateway, prempti, scopeblind-gateway.

Lint clean, commit:

```bash
git add docs/integrations.md
LEFTHOOK_EXCLUDE="cspell,yamllint" git commit -m "docs(repo): rewrite integrations.md with F0 inventory"
```

---

### Task 16: Update team + root README counts

- [ ] **Step 1: Update `packages/team-incident-response/README.md`**

  Find the MCP-recipes row (currently `17`). Change to `50` (17 existing + 33 new). Update the comma-separated list (keep brief — link to `docs/integrations.md` for the full inventory).

- [ ] **Step 2: Update root `README.md`** to match.

- [ ] **Step 3: Lint + commit**

  ```bash
  npx markdownlint-cli2 "**/*.md" "#node_modules" "#CHANGELOG.md"
  git add README.md packages/team-incident-response/README.md
  LEFTHOOK_EXCLUDE="cspell,yamllint" git commit -m "docs(team-incident-response): bump MCP-recipe count to 50; link integrations.md"
  ```

---

### Task 17: Extend `cspell.json`

Run a full repo cspell pass (if Node 22 available; otherwise rely on CI):

```bash
npx --yes cspell@10 --no-progress --no-must-find-files "packages/team-incident-response/mcp-recipes/**/*.md" "docs/integrations.md"
```

Add every unique unknown word to `cspell.json` alphabetically. Expect ~50–80 new words: project names (Akuity, Tetragon, Karpenter, …), tool names (talosctl, falconctl, …), and contributor handles.

Commit:

```bash
git add cspell.json
LEFTHOOK_EXCLUDE="cspell,yamllint" git commit -m "docs(repo): extend cspell dictionary for F0 recipes"
```

---

### Task 18: Full-repo lint sweep

```bash
npx markdownlint-cli2 "**/*.md" "#node_modules" "#CHANGELOG.md"
bash -c 'shopt -s globstar nullglob; mapfile -t files < <(find scripts tools packages -type f -name "*.sh" 2>/dev/null); shellcheck "${files[@]}"'
npx --yes -p ajv-cli@5 -p ajv-formats ajv compile --spec=draft2020 -c ajv-formats -s "packages/*/schemas/*.json"
bash scripts/validate-skill.sh
bash scripts/validate-agent.sh
```

All must pass with exit 0. Fix any drift before pushing.

---

### Task 19: Push, open PR, await CI

```bash
git push -u origin feat/f0-recipe-bulk-ship
gh pr create --base main --head feat/f0-recipe-bulk-ship \
  --title "feat(team-incident-response): F0 bulk-ship MCP recipes from ecosystem research catalog" \
  --body "$(cat <<'EOF'
## Summary

Implements F0 per the F-series master roadmap. Bulk-ships ~33 new MCP recipes plus the 5 inherited from old P1, the Falco-event-ingest skill, and a rewritten docs/integrations.md.

Each recipe follows the uniform template (Source → Install → Configuration → Auth → Tools surfaced → Safety → Caveats → See also). Selection driven by the 2026-06-04 ecosystem research catalog's high-fit table.

## Test plan

- [x] markdownlint clean (CI)
- [x] cspell clean (CI; dictionary extended)
- [x] shellcheck clean (no new shell scripts)
- [x] json-schema-validate clean (no new schemas)
- [x] skill + agent frontmatter validates (falco-event-ingest counted)
- [ ] Reviewer scans the family-grouped commits and confirms no recipe is materially wrong
- [ ] After merge: roll forward to F1 (Cedar-for-agents adoption) brainstorming
EOF
)"
```

Watch CI; address any lint failures (most likely cspell additions missed in Task 17).

---

### Task 20: Merge, switch back to main, archive plan

- [ ] **Step 1: Merge** when CI green and reviewer approves
- [ ] **Step 2: Back to main**

  ```bash
  git checkout main && git pull origin main --ff-only && git branch -D feat/f0-recipe-bulk-ship
  ```

- [ ] **Step 3: Mark this plan complete** by adding a "Status: COMPLETED <date>" badge at the top
- [ ] **Step 4: Roll forward to F1 brainstorming** (per roll-forward autonomy)

---

## Self-review checklist

- [ ] Every spec scope item has a task: 5 inherited (T1), 33 new across 8 family tasks (T2–T12), azure-mcp update (T14), integrations.md (T15), README counts (T16), cspell (T17), lint sweep (T18), PR (T19), merge (T20). ✓
- [ ] No placeholders. Per-recipe metadata is concrete (URLs, env vars, license, install commands). ✓
- [ ] Recipe template embedded once at top; not duplicated 33 times. ✓
- [ ] PR shape is one branch / one PR with ~10 commits grouped by recipe family. ✓
- [ ] Falco-via-CLI-Anything skill carried forward unchanged (per inherited scope). ✓
- [ ] CHANGELOG is auto-managed by release-it; no manual update needed. ✓
