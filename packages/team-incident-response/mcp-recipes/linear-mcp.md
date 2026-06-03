# MCP Recipe — linear-mcp

Linear MCP for follow-up action items, post-incident issue creation, and tracking.

## Source

- Repo: <https://github.com/linear/mcp-server-linear>
- Plugin: also available as Claude Code plugin (see `plugin_linear_linear__authenticate`)
- License: MIT
- Maintainer: Linear (official)

## Install

```bash
npm install -g @linear/mcp-server
# OR use the Claude Code plugin:
# Already available as plugin_linear_linear__authenticate in this harness
```

## Configuration

```jsonc
{
  "mcpServers": {
    "linear": {
      "command": "linear-mcp",
      "env": {
        "LINEAR_API_KEY": "${LINEAR_API_KEY}",
        "LINEAR_TEAM_ID": "INFRA"
      }
    }
  }
}
```

## Auth setup

1. Personal API key from <https://linear.app/settings/api> (NOT OAuth — OAuth requires
   per-user consent, not suitable for unattended agents).
2. Or via the plugin's OAuth flow: invoke `plugin_linear_linear__authenticate`.
3. Store: `linear-api-key` in Azure Key Vault.

## Mutation policy

Linear is one of the few MCPs where the incident response system DOES write — but only
the `mitigation-author` agent, and only to create action-item issues from the CAPA
mitigations document. Cedar permits:

```
permit (
  principal == User::"mitigation-author",
  action == Action::"linear::create_issue",
  resource
) when {
  resource.team == "INFRA" &&
  resource.label contains "post-incident"
};
```

## Caveats

- Linear issue keys are immutable; embed them in the final RCA's `lessons_learned[].owner`
  field for traceability.
- Rate limit: 1500 requests/hour per token — far above incident-response needs.
- The plugin form (`plugin_linear_linear__*`) is preferred over the standalone MCP for
  this harness — it integrates with the Claude Code auth flow.
