# MCP Recipe — microsoft-mcp

Microsoft official MCP servers (microsoft/mcp). Used by the opsbench
incident-response forensic-investigator and infra-auditor agent classes when they need
an ARM parity layer that is distinct from azure-skills — for example, Azure RBAC checks,
Resource Graph queries, and cross-tenant resource inventory during a multi-subscription
incident.

## Source

- Repo: <https://github.com/microsoft/mcp>
- License: MIT
- Maintainer: Microsoft (official, monorepo of Microsoft MCP servers)

## Install

```bash
# Node-based ARM server (recommended for incident response)
npm install -g @microsoft/mcp-server-arm

# OR build from source
git clone https://github.com/microsoft/mcp.git
cd mcp/servers/arm && npm install && npm run build
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally ships without built-in MCP. The supported path is a
CLI-Anything wrapper that exposes `microsoft/mcp` as a Pi-callable CLI; the agent
shells out via Bash.

```bash
# Wrap the upstream microsoft/mcp ARM server with HKUDS/CLI-Anything,
# then install the generated extension into Pi.
pi install git:github.com/<your-fork>/microsoft-mcp-pi-skill
```

Add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```markdown
## microsoft-mcp (Azure ARM parity)

When you need ARM resource lookups, RBAC assignment audits, or Azure Resource Graph
queries during an incident, call the wrapper CLI:

    microsoft-mcp arm get-resource --id <resource-id>
    microsoft-mcp arm list-role-assignments --scope <scope>
    microsoft-mcp graph query --kql "<kql>"

The wrapper enforces `--read-only` by default. Mutating subcommands require
`--confirm` and are Cedar-gated upstream of Pi.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "microsoft": {
      "command": "mcp-server-arm",
      "args": ["--read-only", "--toolsets", "arm,graph,rbac"],
      "env": {
        "AZURE_SUBSCRIPTION_ID": "${AZURE_INCIDENT_SUB_ID}",
        "AZURE_TENANT_ID":       "${AZURE_INCIDENT_TENANT_ID}",
        "AZURE_CLIENT_ID":       "${AZURE_INCIDENT_SP_CLIENT_ID}",
        "AZURE_CLIENT_SECRET":   "${AZURE_INCIDENT_SP_SECRET}"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode each get a thin compatibility shim
that translates their respective MCP/extension formats onto the same wrapper CLI.
See `tools/codex-compat-layer/`, `tools/copilot-compat-layer/`,
`tools/cursor-compat-layer/`, `tools/gemini-compat-layer/`, and
`tools/opencode-compat-layer/`. Full configs ship in F5.

## Auth setup

1. Authenticate the workstation or runner once:

   ```bash
   az login --tenant ${AZURE_INCIDENT_TENANT_ID}
   ```

2. OR (preferred for CI / unattended agents) create a Service Principal scoped to
   `Reader` on the incident-response subscription:

   ```bash
   az ad sp create-for-rbac \
     --name opsbench-microsoft-mcp-ro \
     --role Reader \
     --scopes /subscriptions/${AZURE_INCIDENT_SUB_ID}
   ```

3. Export SP env vars (`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`,
   `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`) or rely on `DefaultAzureCredential`.
4. Grant `Reader` on any additional subscriptions the agent must inspect.
5. Verify:

   ```bash
   mcp-server-arm --probe
   az account show --query '{sub:id,tenant:tenantId}' -o table
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|------|---------|--------------------------|
| `arm.get_resource` | Fetch a single ARM resource by ID | read-only, no gating |
| `arm.list_resources` | List resources in a subscription/RG | read-only, no gating |
| `graph.query` | Run Azure Resource Graph KQL | read-only, no gating |
| `rbac.list_role_assignments` | Audit role bindings at a scope | read-only, no gating |
| `arm.deploy_template` | Deploy an ARM/Bicep template | gate: `IncidentMitigator`, require ticket + dual-approve |
| `arm.delete_resource` | Delete a resource | gate: `IncidentCommander` only, require change-window |
| `rbac.create_role_assignment` | Grant a role | gate: `IdentityAdmin`, require ticket + JIT window |

## Safety

- Ship with `--read-only` by default; mutating toolsets must be opted-in per agent class.
- Cedar policies gate every mutation tool above; the read-only toolset is freely
  callable by forensic-investigator and infra-auditor.
- The SP credential is `Reader`-only — even if the read-only flag is bypassed, ARM
  rejects writes at the API layer (defense in depth).
- Resource Graph KQL is user-supplied; sanitize before logging to avoid leaking
  resource IDs into incident transcripts.
- Prompt-injection: ARM tag values and resource descriptions are attacker-influenceable
  in shared subscriptions — never feed raw tag content into a tool-call planner without
  string-only treatment.

## Caveats

- `microsoft/mcp` is a monorepo; the ARM server is the only one in scope here.
  Other servers (Teams, Graph, Purview) ship as separate recipes when needed.
- Some endpoints (Azure Connected Machine / Arc node SSH) are NOT exposed here;
  use `az ssh arc` via Bash for those.
- Azure Resource Graph has a 1000-row default page size; paginate via `$skipToken`
  for large tenants.
- The MIT license permits vendoring, but we keep it external-only to track upstream
  security patches.
- Requires `az` CLI v2.60+ for the `arm.deploy_template` tool to honor `--what-if`.
- Distinct from `azure-skills`: this recipe is the ARM/Graph/RBAC parity surface; the
  `azure-skills` plugin focuses on best-practice guidance and code generation.

## See also

- [azure-mcp](./azure-mcp.md) — Azure Monitor + Key Vault MCP for log queries and secrets.
- [k8s-mcp](./k8s-mcp.md) — companion for AKS workload inspection.
