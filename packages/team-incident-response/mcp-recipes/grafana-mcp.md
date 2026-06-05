# MCP Recipe — grafana-mcp

Grafana MCP exposes dashboards, Prometheus/Loki/Tempo queries, and alert state
to opsbench incident-response agents. Called by the **observability-analyst**
(dashboard panels + Prom queries during a paging event), the
**log-correlator** (Loki queries scoped to the incident window), and the
**trace-walker** (Tempo span lookup). Read-only by default; alert-rule and
annotation mutations are explicit, Cedar-gated paths.

## Source

- Repo: <https://github.com/grafana/mcp-grafana>
- License: Apache-2.0
- Maintainer: Grafana Labs (official)

## Install

```bash
# Go binary (vendor-recommended)
go install github.com/grafana/mcp-grafana/cmd/mcp-grafana@latest

# Or pre-built release
curl -L -o /usr/local/bin/mcp-grafana \
  https://github.com/grafana/mcp-grafana/releases/latest/download/mcp-grafana-linux-amd64
chmod +x /usr/local/bin/mcp-grafana

# Or Docker
docker pull grafana/mcp-grafana:latest
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally avoids built-in MCP. Grafana ships no first-party Pi
extension, so wrap the upstream `mcp-grafana` binary with
[HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything) to expose each
tool as a discrete sub-command the Pi agent can shell out to. Install the
generated wrapper as a Pi skill:

```bash
# Generate a Pi-callable CLI from the upstream MCP via CLI-Anything
# (one-time, in your fork repo) — produces `grafana-mcp-skill` sub-commands
# that map 1:1 onto MCP tool names.

# Then install on the Pi host:
pi install git:github.com/<your-fork>/grafana-mcp-pi-skill
```

AGENTS.md snippet (place in `~/.pi/agent/AGENTS.md` or per-project root):

```markdown
## Grafana access

For incident triage, prefer the wrapped Grafana skill — never hit the HTTP
API directly:

- Dashboards:   `grafana-mcp-skill search-dashboards --query "<service>"`
- Prom queries: `grafana-mcp-skill query-prometheus --datasource <uid> \
                  --expr 'rate(http_5xx_total[5m])' --start <ts> --end <ts>`
- Loki:         `grafana-mcp-skill query-loki --datasource <uid> \
                  --expr '{app="checkout"} |= "error"' --limit 1000`
- Tempo:        `grafana-mcp-skill get-trace --datasource <uid> --trace-id <id>`
- Alerts:       `grafana-mcp-skill list-alert-rules --state firing`

Write paths (annotations, alert-rule edits) require a Cedar policy decision
and are not exposed by default. If you need to silence an alert, ask the
human on-call — never call `update_alert_rule` or `create_annotation`
autonomously.
```

## Configuration — Claude Code (secondary)

Read-only (default for incident triage):

```jsonc
{
  "mcpServers": {
    "grafana": {
      "command": "mcp-grafana",
      "args": ["--transport", "stdio", "--read-only"],
      "env": {
        "GRAFANA_URL": "https://grafana.ap-south-1.pnats.cloud",
        "GRAFANA_API_KEY": "${GRAFANA_API_KEY}",
        "GRAFANA_DATASOURCES_DEFAULT_PROMETHEUS": "prom-ap-south-1",
        "GRAFANA_DATASOURCES_DEFAULT_LOKI": "loki-ap-south-1",
        "GRAFANA_DATASOURCES_DEFAULT_TEMPO": "tempo-ap-south-1"
      }
    }
  }
}
```

Annotation/alert-rule write (gated, used only by remediation flows):

```jsonc
{
  "mcpServers": {
    "grafana-write": {
      "command": "mcp-grafana",
      "args": ["--transport", "stdio", "--require-confirmation"],
      "env": {
        "GRAFANA_URL": "https://grafana.ap-south-1.pnats.cloud",
        "GRAFANA_API_KEY": "${GRAFANA_EDITOR_API_KEY}"
      }
    }
  }
}
```

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini CLI, and OpenCode each need a thin shim that
maps their host-native tool config onto either the upstream `mcp-grafana`
binary or the CLI-Anything wrapper above. Full host configs ship in **F5**
under `tools/codex-compat-layer/`, `tools/copilot-compat-layer/`,
`tools/cursor-compat-layer/`, `tools/gemini-compat-layer/`, and
`tools/opencode-compat-layer/`.

## Auth setup

1. Create a Grafana **service account** (Administration → Service accounts)
   with role `Viewer` for read-only use, `Editor` only for the write server.
   Service accounts persist past user offboarding — never use a personal
   user token.
2. Generate a service-account token (no expiry for ops use, or rotate via
   your secret-manager schedule). Two tokens: `grafana-mcp-readonly-token`
   (Viewer) and `grafana-mcp-editor-token` (Editor).
3. Store both tokens in Azure Key Vault / 1Password / Vault. Reference via
   env var in shell init — never inline into `mcpServers.env`:

   ```bash
   export GRAFANA_API_KEY="$(az keyvault secret show \
     --vault-name pn-cluster-keyvault \
     --name grafana-mcp-readonly-token \
     --query value -o tsv)"
   ```

4. Pin datasource UIDs once — list them and store the resolved values in the
   recipe env block above (avoids ambiguity when multiple Prom/Loki sources
   exist):

   ```bash
   curl -sH "Authorization: Bearer $GRAFANA_API_KEY" \
     "$GRAFANA_URL/api/datasources" | jq '.[] | {uid, name, type}'
   ```

5. Verify the read-only token denies writes:

   ```bash
   curl -sX POST -H "Authorization: Bearer $GRAFANA_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"dashboard":{"title":"probe"}}' \
     "$GRAFANA_URL/api/dashboards/db" | jq .message
   # Expect: "Access denied" or "Permission denied" — never "success".
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|------|---------|--------------------------|
| `search_dashboards` / `get_dashboard_by_uid` | Find and load incident dashboards | None (read-only) |
| `query_prometheus` | Range/instant PromQL during paging events | None (read-only); cap series count |
| `query_loki_logs` / `query_loki_stats` | Log filtering scoped to incident window | None (read-only); cap line count |
| `get_trace` / `query_tempo` | Tempo span lookup by trace ID | None (read-only) |
| `list_alert_rules` / `get_alert_rule` | Surface current firing/pending alerts | None (read-only) |
| `create_annotation` | Mark deploy/incident boundaries on dashboards | `Action::"grafana:annotate"` + human-in-loop |
| `update_alert_rule` / `create_alert_rule` | Edit alerting thresholds post-incident | `Action::"grafana:editAlert"` + change-window check |

## Safety

- Default to `--read-only`; the flag blocks `create_*`, `update_*`,
  `delete_*` on top of token-level role restrictions.
- Token role enforces the boundary server-side — even if the agent attempts
  a mutation through the read-only server it 403s at Grafana.
- Mutations gated through Cedar: `Action::"grafana:annotate"`,
  `Action::"grafana:editAlert"`, `Action::"grafana:writeDashboard"` (deny by
  default; require human-in-loop approver).
- Prompt-injection surface: dashboard panel titles, annotation text, alert
  rule names, and Loki log lines are all attacker-controlled. Strip or
  sandbox log content before letting an agent reason on it; never let log
  text trigger tool calls without confirmation.
- Datasource UIDs must be exact — pin them in env, do not let the agent
  resolve by free-text name (avoids accidental cross-tenant queries when
  multiple environments share a Grafana stack).

## Caveats

- Loki LogQL has a 5000-line response cap per query — split time ranges for
  long incidents or use `query_loki_stats` first to size the result.
- Tempo trace lookup requires the trace ID; for service-based discovery,
  filter Loki on `traceID` log fields first to find candidate IDs.
- Prometheus `query_range` step granularity matters: for incident windows
  < 1h use `step=15s`; for > 24h use `step=5m` to avoid response truncation.
- Loki/Tempo/Prometheus datasource permissions are evaluated independently
  of the Grafana token role — a Viewer token can still 403 on a restricted
  datasource if dashboard permissions block it.
- License is Apache-2.0 — safe to vendor or fork without copyleft
  obligations. (Note: this corrects an earlier misattribution; mcp-grafana
  is Apache-2.0, not AGPL.)
- Requires Grafana ≥ 10.x for the unified alerting API surface; older
  legacy-alerting deployments expose a reduced toolset.

## See also

- `packages/team-incident-response/mcp-recipes/prometheus-mcp.md` — direct
  Prom query path when bypassing Grafana datasources.
- `packages/team-incident-response/mcp-recipes/ebpf-observability-mcp.md` —
  kernel-level signal correlation alongside Grafana metrics.
- `packages/team-incident-response/mcp-recipes/slack-mcp.md` — post dashboard
  snapshots into the incident channel.
