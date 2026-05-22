# MCP Recipe — pagerduty-mcp

PagerDuty MCP for incident-state lookup, on-call rotation queries, and incident updates.

## Source

- Repo: https://github.com/PagerDuty/pagerduty-mcp-server
- License: MIT
- Maintainer: PagerDuty (official)

## Install

```bash
npm install -g @pagerduty/mcp-server
# OR
pip install pagerduty-mcp
```

## Configuration

```jsonc
{
  "mcpServers": {
    "pagerduty": {
      "command": "pagerduty-mcp",
      "args": ["--read-only"],
      "env": {
        "PAGERDUTY_API_KEY": "${PAGERDUTY_READONLY_TOKEN}",
        "PAGERDUTY_USER_EMAIL": "incident-response@pnats.cloud"
      }
    }
  }
}
```

## Auth setup

1. Create a read-only API token at https://<subdomain>.pagerduty.com/api_keys.
2. The token must be tied to a service-account user with `Observer` role.
3. For write access (acknowledging incidents, posting notes), use a separate MCP instance
   with a `Responder` role token — Cedar gates which agent can use which.
4. Store: `pagerduty-readonly-token` in Azure Key Vault.

## Read-only verification

`--read-only` disables: `create_incident`, `update_incident`, `acknowledge_incident`,
`resolve_incident`, `snooze_incident`, `add_note`, `reassign`. Tools that remain:
`get_incident`, `list_incidents`, `get_oncall`, `list_users`, `list_services`,
`list_escalation_policies`.

## Caveats

- Currently not configured for pnats — no PagerDuty subscription. This recipe is documented
  for future deployment.
- If/when adopted: integration with Alertmanager via PD's Events API v2 (not via MCP).
- Incident ID format: `Q...` — the agent must extract this from PD URLs or alert metadata.
