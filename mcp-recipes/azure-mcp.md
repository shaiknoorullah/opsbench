# MCP Recipe — azure-mcp

Azure Resource Manager + Azure Monitor + Key Vault MCP. Use for Arc-onboarded node state,
Key Vault secrets retrieval, Azure Monitor logs, and SP auth checks.

## Source

- Repo: https://github.com/Azure/azure-mcp
- License: MIT
- Maintainer: Microsoft Azure (official)

## Install

```bash
npm install -g @azure/mcp-server
# OR
docker pull mcr.microsoft.com/azure/azure-mcp-server:latest
```

## Configuration

```jsonc
{
  "mcpServers": {
    "azure": {
      "command": "azure-mcp-server",
      "args": ["--read-only"],
      "env": {
        "AZURE_SUBSCRIPTION_ID": "2428f345-68e3-44bb-a4f0-1d600a03caa5",
        "AZURE_TENANT_ID":       "a0318cee-1ae4-49e3-b611-7a6cf6c48ab0",
        "AZURE_CLIENT_ID":       "${AZURE_INCIDENT_SP_CLIENT_ID}",
        "AZURE_CLIENT_SECRET":   "${AZURE_INCIDENT_SP_SECRET}",
        "AZURE_DEFAULT_RG":      "pn-cluster-ap-south-1"
      }
    }
  }
}
```

## Auth setup

1. Create a dedicated SP with `Reader` on the subscription:
   ```bash
   az ad sp create-for-rbac \
     --name incident-response-readonly \
     --role Reader \
     --scopes /subscriptions/2428f345-68e3-44bb-a4f0-1d600a03caa5
   ```
2. Grant `Key Vault Secrets User` on `pn-cluster-keyvault` (read-only to specific secrets).
3. Grant `Azure Connected Machine Onboarding` is NOT needed — read-only Arc state via
   `Reader` is sufficient.
4. Store the secret in 1Password; export to env at shell init:
   ```bash
   export AZURE_INCIDENT_SP_CLIENT_ID="..."
   export AZURE_INCIDENT_SP_SECRET="$(op read 'op://Private/azure-incident-sp/credential')"
   ```

## Read-only verification

`--read-only` blocks all `create`, `update`, `delete`, `restart`, `deallocate`, `extension`
mutations. The SP itself has only `Reader` role — even without the flag, ARM rejects writes.

To confirm:
```bash
az role assignment list --assignee $AZURE_INCIDENT_SP_CLIENT_ID --output table
# Should show ONLY Reader (or Key Vault Secrets User) — never Contributor.
```

## Caveats

- Azure Arc SSH (`az ssh arc`) is NOT exposed via this MCP — it's a separate `az` CLI
  surface. The agent must shell out via Bash for Arc SSH (see CLAUDE.md SSH Access section).
- Azure Monitor log queries (KQL) have a 500K row cap per query; for high-volume incidents,
  paginate via `take`.
- The Azure MCP does not handle Entra ID (use Graph MCP separately if needed).
- Two RGs in scope: `pn-cluster-ap-south-1` (infra) and `pn-terraform-state` (TF state).
  Pin via `AZURE_DEFAULT_RG`.
