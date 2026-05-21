# MCP Recipe — slack-mcp

Slack MCP for comms-drafter (draft only; never send) and slack-summarizer (read incident
channel history). Mutation tools are explicitly disabled — drafts go to the local FS.

## Source

- Repo: https://github.com/modelcontextprotocol/servers/tree/main/src/slack
- License: MIT
- Maintainer: MCP team (reference impl)

## Install

```bash
npx -y @modelcontextprotocol/server-slack
```

## Configuration

```jsonc
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "${SLACK_INCIDENT_BOT_TOKEN}",
        "SLACK_TEAM_ID":   "${SLACK_TEAM_ID}",
        "SLACK_CHANNELS":  "C0123ABC,C0456DEF"
      }
    }
  }
}
```

## Auth setup

1. Create a Slack app `pnats-incident-bot` at https://api.slack.com/apps.
2. OAuth scopes (BOT token, NOT user token):
   - `channels:history`     — read public channel messages
   - `channels:read`        — list channels
   - `users:read`           — resolve user IDs
   - `chat:write`           — sending; DISABLED by Cedar policy unless explicitly invoked
3. Install the app to the workspace; grab the bot token (xoxb-...).
4. Restrict the bot to specific channels via Slack admin: only `#incidents`, `#infra-alerts`,
   `#pnats-eng-pn-cluster`.
5. Store the token in Azure Key Vault: `slack-incident-bot-token`.

## Read-only-default verification

In Cedar (`policies/cedar/tools.cedar`), the `comms-drafter` agent is FORBIDDEN from
`Action::"slack::post"`. Only `human-operator` may invoke `chat::write` after manual
confirmation. The MCP server still exposes the tool — Cedar enforcement is the gate.

## Caveats

- Slack rate limits: 1 message/sec per channel, 50 messages/minute total. For comms,
  this is non-binding (low volume).
- Threading: incident channel hygiene requires threaded responses, not new top-level posts.
  The drafter should always include `thread_ts` in its draft output.
- DM scope is NOT granted to this bot — incident comms are channel-only for audit reasons.
- For status pages (Statuspage.io, Atlas, etc.), use a separate MCP — Slack is for internal
  comms only.
