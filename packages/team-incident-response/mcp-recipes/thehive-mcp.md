# MCP Recipe — thehive-mcp

> **EXPERIMENTAL — upstream is in beta** and explicitly states "not recommended for
> production use with real data". Known limitations: prompt-injection vulnerabilities,
> data-exposure paths, incomplete logging, no TTP support, limited responder
> functionality. Use against a **staging TheHive instance** with synthetic cases until
> upstream removes the beta warning, and keep `PERMISSIONS_CONFIG=read_only` unless a
> write path is explicitly required and Cedar-gated.

TheHive case-management MCP. Called by the opsbench `incident-commander` and
`evidence-analyst` agent classes during incident response to query existing
cases/alerts/observables, surface related tasks, and (under read-only default) feed
evidence into the timeline. Write operations are off by default and must be opened
individually via Cedar `tools.cedar`.

## Source

- Repo: <https://github.com/StrangeBeeCorp/TheHiveMCP>
- License: MIT
- Maintainer: StrangeBee (TheHive's commercial steward) — official, beta

## Install

```bash
# Pre-built binary from upstream releases
curl -fsSL -o /usr/local/bin/thehivemcp \
  https://github.com/StrangeBeeCorp/TheHiveMCP/releases/latest/download/thehivemcp-linux-amd64
chmod +x /usr/local/bin/thehivemcp
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally does not bundle MCP. Wrap the upstream MCP server as a
Pi-callable CLI via [HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything),
then install the generated skill:

```bash
# 1. Generate a Pi skill that shells out to thehivemcp
cli-anything wrap \
  --source github.com/StrangeBeeCorp/TheHiveMCP \
  --binary /usr/local/bin/thehivemcp \
  --out ./thehive-pi-skill

# 2. Install into Pi
pi install git:github.com/<your-fork>/thehive-pi-skill
```

Direct Pi (the agent) to the wrapper with a `~/.pi/agent/AGENTS.md` (or per-project
`SYSTEM.md`) snippet:

```markdown
## TheHive (incident response)

When investigating an incident, call the `thehive` CLI for case/alert/observable
lookups. Default behaviour is read-only (`PERMISSIONS_CONFIG=read_only`).

- List my open cases:        `thehive cases list --status Open`
- Get a case + observables:  `thehive cases get <CASE_ID> --with-observables`
- Search alerts by IoC:      `thehive alerts search --observable <ioc>`

Never invoke `thehive cases create|update|delete` or `thehive automation run` unless
the user has explicitly granted write permission for this session.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "thehive": {
      "command": "/usr/local/bin/thehivemcp",
      "args": ["--transport", "stdio"],
      "env": {
        "THEHIVE_URL":          "https://thehive-staging.example.com",
        "THEHIVE_API_KEY":      "${THEHIVE_INCIDENT_API_KEY}",
        "THEHIVE_ORGANISATION": "incident-response",
        "PERMISSIONS_CONFIG":   "read_only"
      }
    }
  }
}
```

## Configuration — other hosts

Codex CLI, Copilot CLI, Cursor, Gemini, and OpenCode each get a thin adapter under
`tools/<host>-compat-layer/` that translates this recipe's `mcpServers` block into the
host-native config. Adapters ship in **F5**; F0 only documents the pointer.

## Auth setup

1. In TheHive UI: **Settings → Organisations → Users**, create a service account
   named `opsbench-readonly`.
2. Assign role `analyst` (TheHive's read-mostly role); explicitly deny
   `manageCase/create`, `manageCase/delete`, `manageAlert/delete`.
3. Generate an API key under that user; store via 1Password (or Azure Key Vault):

   ```bash
   export THEHIVE_INCIDENT_API_KEY="$(op read 'op://Private/thehive-opsbench/api-key')"
   ```

4. Verify the token resolves to a non-admin profile:

   ```bash
   curl -s -H "Authorization: Bearer $THEHIVE_INCIDENT_API_KEY" \
     https://thehive-staging.example.com/api/v1/user/current | jq '.profile'
   # Expected: "analyst" — never "admin" or "org-admin".
   ```

5. Confirm `PERMISSIONS_CONFIG=read_only` is set in the running MCP env before any
   agent connects.

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| ---- | ------- | ------------------------ |
| `search-entities` | Query alerts, cases, tasks, observables | Open by default |
| `get-resource` | Browse schemas, docs, metadata | Open by default |
| `manage-entities` | Create/update/delete cases, comments, promote alerts | **Closed** — open per-agent only when needed |
| `execute-automation` | Run Cortex analyzers and responders | **Closed** — human-gate (incident-commander only) |

(See upstream [`README.md`](https://github.com/StrangeBeeCorp/TheHiveMCP) for the full
tool reference — the surface is small and stable.)

## Safety

- **Read-only by default.** Ship every recipe with `PERMISSIONS_CONFIG=read_only`;
  switching to `admin` or a custom YAML must be a deliberate, reviewed change.
- Cedar policy `packages/team-incident-response/policies/tools.cedar` denies
  `manage-entities` and `execute-automation` for every agent class except
  `incident-commander`, and even there gates them behind `human-approval`.
- **Treat all TheHive content as untrusted input.** Case descriptions, observable
  notes, and alert payloads can carry prompt-injection — sanitize before feeding to
  other tools (the upstream beta warning is explicit on this).
- Mutations (case create/update, alert promotion, automation runs) MUST flow through
  the per-agent Cedar gate; never grant the MCP env a write-capable token by default.
- Audit logging is incomplete upstream — supplement with opsbench's own
  request/response capture (`tools-generated.cedar` advisory mode) for any session
  that crosses into write mode.

## Caveats

- **Beta upstream.** File bugs at
  <https://github.com/StrangeBeeCorp/TheHiveMCP/issues> and pin the binary version
  once you have one that works for your stack.
- The `OPENAI_API_KEY` env var enables a natural-language fallback when the MCP
  client lacks sampling support; opsbench's recommended Claude Code + Pi setups do
  not need it.
- Cortex analyzers run with their own auth — TheHive MCP shells out to them; if you
  don't have Cortex provisioned, `execute-automation` is non-functional regardless
  of permissions.
- TTP/MITRE ATT&CK navigation is **not** in the current MCP — use
  [opencti-mcp](./opencti-mcp.md) for that surface.
- MIT-licensed, so vendoring is permitted, but the beta status argues for
  external-only deployment until GA.

## See also

- [opencti-mcp](./opencti-mcp.md) — threat-intel enrichment for observables surfaced
  by TheHive.
- [pagerduty-mcp](./pagerduty-mcp.md) — pair with TheHive cases to track on-call
  ownership of in-flight incidents.
