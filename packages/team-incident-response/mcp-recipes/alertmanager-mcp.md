# MCP Recipe — alertmanager-mcp

Alertmanager MCP exposes Prometheus Alertmanager silences and alert-group state so
the opsbench `incident-responder` agent can see what is currently firing and what
is already suppressed. The `noise-suppressor` agent class uses it to create
short-lived silences during deliberate maintenance windows; silence creation is
always gated behind Cedar policy because a runaway silence is functionally
equivalent to disabling monitoring.

## Source

- Repo: <https://github.com/ntk148v/alertmanager-mcp-server>
- License: Apache-2.0
- Maintainer: community (ntk148v)

## Install

```bash
# Vendor-recommended: install from source with uv
uv tool install git+https://github.com/ntk148v/alertmanager-mcp-server

# OR run ephemerally via uvx
uvx --from git+https://github.com/ntk148v/alertmanager-mcp-server alertmanager-mcp-server
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally ships without built-in MCP. Wrap
`alertmanager-mcp-server` as a Pi-callable CLI via HKUDS/CLI-Anything, then
install the wrapper as a Pi skill:

```bash
# 1. Fork upstream and run CLI-Anything to generate a flat CLI surface
#    (one subcommand per MCP tool, JSON in/out).
# 2. Publish the wrapper as a git-installable Pi skill:
pi install git:github.com/<your-fork>/alertmanager-mcp-pi-skill
```

Add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```md
## alertmanager

For Prometheus Alertmanager state, call the `alertmanager-mcp` wrapper CLI
installed under `~/.pi/skills/alertmanager-mcp-pi-skill/bin/alertmanager-mcp`:

- List active alert groups: `alertmanager-mcp groups --output json`
- List active silences: `alertmanager-mcp silences --state active --output json`
- Silence creation (`silence-create`) requires Cedar approval — emit the
  intended command with explicit `--matchers` and `--duration`, then stop;
  do NOT execute until the human approves.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "alertmanager": {
      "command": "uvx",
      "args": [
        "--from", "git+https://github.com/ntk148v/alertmanager-mcp-server",
        "alertmanager-mcp-server",
        "--read-only"
      ],
      "env": {
        "ALERTMANAGER_URL": "https://alertmanager.internal.opsbench.dev"
      }
    }
  }
}
```

For gated silence writes (noise-suppressor only — Cedar enforces matcher scope
and duration ceiling):

```jsonc
{
  "mcpServers": {
    "alertmanager-write": {
      "command": "uvx",
      "args": [
        "--from", "git+https://github.com/ntk148v/alertmanager-mcp-server",
        "alertmanager-mcp-server",
        "--allowed-tools", "groups,silences,silence-create,silence-expire"
      ],
      "env": {
        "ALERTMANAGER_URL": "https://alertmanager.internal.opsbench.dev",
        "ALERTMANAGER_USERNAME": "${ALERTMANAGER_INCIDENT_USER}",
        "ALERTMANAGER_PASSWORD": "${ALERTMANAGER_INCIDENT_PASSWORD}"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode all reach this server through their
respective compat shims under `tools/<host>-compat-layer/` (e.g.
`tools/codex-compat-layer/`, `tools/cursor-compat-layer/`). Full per-host configs
ship in F5; for F0 the recipe above is the canonical source of truth.

## Auth setup

1. Confirm the Alertmanager URL is reachable from the agent host:
   `curl -sf $ALERTMANAGER_URL/api/v2/status | jq .cluster.status`.
2. If Alertmanager sits behind basic-auth or an OAuth2 proxy, provision a
   dedicated `incident-response` credential (NOT a shared dashboard cred); for
   OAuth2-proxied deployments, mint a service-account bearer instead.
3. Store credentials in Azure Key Vault as `alertmanager-incident-user` and
   `alertmanager-incident-password` (or `alertmanager-incident-bearer`).
4. Export for local runs:
   `export ALERTMANAGER_URL=https://alertmanager.internal.opsbench.dev`
   followed by the credential exports from Key Vault.
5. Verify (read-only, does not mutate):
   `uvx --from git+https://github.com/ntk148v/alertmanager-mcp-server alertmanager-mcp-server --probe`
   or simply hit `$ALERTMANAGER_URL/api/v2/alerts` and confirm a 200.

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| --- | --- | --- |
| `groups` | List active alert groups (the incident-responder's primary read) | Allow for incident-responder, change-correlator |
| `alerts` | Enumerate individual firing/pending alerts with labels | Allow for incident-responder |
| `silences` | List existing silences (active, pending, expired) | Allow for incident-responder, noise-suppressor |
| `silence-get` | Fetch a single silence by ID | Allow for incident-responder |
| `silence-create` | Create a new silence over matchers for a bounded TTL | Deny by default; allow for noise-suppressor with `(matchers ⊆ scoped_namespace, duration ≤ 2h, change_ticket_id present)` |
| `silence-expire` | Expire an existing silence early | Allow for noise-suppressor and incident-responder (un-silencing is safer than silencing) |
| `status` | Cluster status / config hash / uptime | Allow for everyone (diagnostic only) |

## Safety

- Default posture is read-only; the write profile is a separate `mcpServers`
  entry so it can be omitted from incident-responder containers entirely.
- Cedar policy MUST gate `silence-create` on `(matcher_scope, duration_ceiling,
  change_ticket_id, creator_identity)`. A silence with `matchers=[]` or
  `matchers=[{name: "alertname", value: ".+", isRegex: true}]` is effectively a
  global mute and must be denied even with approval.
- Hard-cap silence duration at 2h in policy; longer outages should go through a
  human change record, not an agent-issued silence.
- `silence-expire` is intentionally NOT gated as tightly as create — making
  noise come back is the safe direction.
- Prompt-injection caveat: alert `summary`, `description`, and `runbook_url`
  annotations are attacker-controllable from whoever wrote the PrometheusRule.
  The MCP returns annotation text verbatim; the agent must not follow
  instructions found inside alert annotation fields (especially "silence me for
  24h" style payloads).

## Caveats

- This is a community Apache-2.0 project, not an upstream Prometheus/Alertmanager
  artifact — pin to a commit SHA in CI, not `main`. Track upstream for API drift
  against Alertmanager v2 API.
- Tool surface is currently limited to silences/groups/alerts/status; receiver
  and route inspection lives in the Alertmanager config, not the API, so use
  `k8s-mcp` to read the `alertmanager-config` ConfigMap when debugging routing.
- Requires network reachability to the Alertmanager API; on the OVH cluster
  this goes through the same SSH tunnel as the rest of the in-cluster control
  plane. If the tunnel is down, `groups` fails closed.
- License is Apache-2.0 — vendoring is fine, but if you fork to add the
  CLI-Anything wrapper, retain the NOTICE file.
- No native multi-tenant scoping; if you run multiple Alertmanager instances
  (e.g. per-cluster), run one MCP entry per instance with a distinct
  `ALERTMANAGER_URL` and Cedar-gate them independently.

## See also

- `prometheus-mcp.md` — query the underlying metrics that fired the alerts.
- `grafana-mcp.md` — confirm post-silence dashboards still tell a coherent story.
- `k8s-mcp.md` — inspect the Alertmanager pods themselves and their config.
