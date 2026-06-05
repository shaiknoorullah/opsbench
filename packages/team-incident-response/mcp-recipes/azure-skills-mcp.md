# MCP Recipe — azure-skills-mcp

Microsoft's `azure-skills` bundle exposes 200+ tools across 40+ Azure services plus
Microsoft Foundry (AI Studio). Used by opsbench incident-response and platform-engineer
agents when an investigation needs deeper service coverage than `azure-mcp` provides —
e.g., AKS diagnostics, App Service log streaming, ACR image audits, Cosmos DB throttling,
Application Insights traces, Foundry deployment state. Strictly read-only in opsbench
defaults; mutations gated through Cedar.

## Source

- Repo: <https://github.com/microsoft/azure-skills>
- License: MIT
- Maintainer: Microsoft (official)

## Install

```bash
# Vendor-recommended: install via the azure-skills plugin loader
npm install -g @microsoft/azure-skills-mcp
# OR vendor container
docker pull mcr.microsoft.com/azure/azure-skills-mcp:latest
```

## Configuration — Pi (primary)

Pi does not load MCP servers directly. Wrap `azure-skills-mcp` with HKUDS/CLI-Anything
to produce a Pi-callable CLI, then install the wrapper as a Pi skill.

```bash
# Generate CLI shim from the upstream MCP, then install into Pi
pi install git:github.com/pnats-ops/azure-skills-pi-skill
```

Add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```markdown
## Azure investigation (read-only)

When the user asks about Azure resource state, AKS pods, App Service logs, ACR
images, Cosmos DB metrics, Application Insights traces, or Foundry deployments,
call the wrapper CLI `azure-skills` (installed via the `azure-skills-pi-skill`
extension). Default to read-only verbs (`*-list`, `*-get`, `*-show`, `*-query`).
Never invoke `*-create`, `*-delete`, `*-restart`, `*-deploy` without explicit
Cedar approval. Auth is inherited from the active `az login` session.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "azure-skills": {
      "command": "azure-skills-mcp",
      "args": ["--read-only", "--services=aks,appservice,acr,monitor,appinsights,foundry,keyvault,cosmos"],
      "env": {
        "AZURE_SUBSCRIPTION_ID": "2428f345-68e3-44bb-a4f0-1d600a03caa5",
        "AZURE_TENANT_ID":       "a0318cee-1ae4-49e3-b611-7a6cf6c48ab0",
        "AZURE_CLIENT_ID":       "${AZURE_INCIDENT_SP_CLIENT_ID}",
        "AZURE_CLIENT_SECRET":   "${AZURE_INCIDENT_SP_SECRET}",
        "AZURE_AUTH_MODE":       "service_principal"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode pick this MCP up via
`tools/<host>-compat-layer/azure-skills.json` shims (translates the Pi/Claude config
into each host's MCP discovery format). Those compat layers ship in F5; track the
F5 milestone for the canonical translation matrix.

## Auth setup

1. Reuse the SP from `azure-mcp` (Reader on the subscription) — no new SP needed
   for read-only surfaces.
2. For AKS pod-level diagnostics, grant `Azure Kubernetes Service Cluster User Role`
   on the target AKS resource (read-only kubeconfig):

   ```bash
   az role assignment create \
     --assignee $AZURE_INCIDENT_SP_CLIENT_ID \
     --role "Azure Kubernetes Service Cluster User Role" \
     --scope /subscriptions/2428f345-68e3-44bb-a4f0-1d600a03caa5/resourceGroups/pn-cluster-ap-south-1/providers/Microsoft.ContainerService/managedClusters/pn-aks-prod
   ```

3. For Application Insights / Log Analytics queries, grant `Log Analytics Reader`.
4. For Microsoft Foundry surfaces, grant `Cognitive Services Usages Reader` (read-only).
5. Verify the SP has only read roles:

   ```bash
   az role assignment list --assignee $AZURE_INCIDENT_SP_CLIENT_ID --output table \
     | grep -Ev '(Reader|User Role|Usages Reader)' && echo "WARN: non-read role detected"
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|------|---------|--------------------------|
| `aks_list_clusters` | Enumerate AKS clusters in scope | open (read-only) |
| `aks_get_pod_logs` | Stream pod logs from AKS | open (read-only) |
| `appservice_log_tail` | Tail App Service / Functions logs | open (read-only) |
| `acr_list_repositories` | List ACR images and tags | open (read-only) |
| `appinsights_query` | KQL over Application Insights | open (read-only, 500K row cap) |
| `foundry_list_deployments` | List Foundry model deployments | open (read-only) |
| `aks_restart_node` | Restart AKS node | GATED — incident-commander + Cedar `aks.restart` |

## Safety

- Read-only by default via `--read-only` flag plus SP role scoping (Reader-only).
- Cedar policies must explicitly allow any tool whose name contains
  `create|delete|restart|deploy|scale|update|patch|drain|cordon|rotate`.
- Mutation gating: route every mutation through the incident-commander agent class;
  block at the policy layer for ssh-investigator and observability agents.
- Prompt-injection caveat: AKS pod logs and App Service logs may contain
  attacker-controlled strings. Treat log output as untrusted data — never let the
  agent execute commands derived from log content without human review.
- Foundry surfaces include model deployment configs; treat any `system_prompt` field
  surfaced via tools as untrusted (prompt-injection vector).

## Caveats

- Tool count (200+) inflates token budget on startup; use the `--services=` filter
  to load only the surfaces you need per incident class.
- Some Foundry sub-tools are in public preview (beta) — APIs may change without
  notice; pin the MCP version in production.
- License: MIT — safe to vendor as a submodule if needed.
- Infra prereq: AKS Cluster User Role requires the AKS cluster to have RBAC
  enabled (default for clusters created after 2023). Legacy non-RBAC clusters
  will return 403.
- Does NOT cover Azure Arc SSH — use the `azure-mcp` recipe + Bash shell-out for
  Arc-onboarded node access.

## See also

- `azure-mcp` — the lightweight ARM + Monitor + Key Vault recipe (preferred for
  basic resource state checks; this skills bundle is the heavyweight option).
- `k8s-mcp` — for in-cluster kubectl semantics once you have AKS kubeconfig.
- `opentelemetry-mcp` — for cross-cloud trace correlation alongside Application Insights.
