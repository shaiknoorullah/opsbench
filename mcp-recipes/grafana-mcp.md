# MCP Recipe — grafana-mcp

Single MCP that wraps Grafana datasources: Prometheus, Loki, Tempo, Elasticsearch, CloudWatch.
Read-only API access is the default; mutation tools (annotations, alert rules) are explicit.

## Source

- Repo: https://github.com/grafana/mcp-grafana
- License: AGPL-3.0
- Maintainer: Grafana Labs (official)

## Install

```bash
# Go binary (recommended)
go install github.com/grafana/mcp-grafana/cmd/mcp-grafana@latest

# Or pre-built release
curl -L -o /usr/local/bin/mcp-grafana \
  https://github.com/grafana/mcp-grafana/releases/latest/download/mcp-grafana-linux-amd64
chmod +x /usr/local/bin/mcp-grafana
```

## Configuration (`~/.claude/settings.json`)

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

## Auth setup

1. Create a Grafana service account with role `Viewer` (read-only).
2. Generate an API key for the service account (NOT a user token — service accounts persist
   beyond user offboarding).
3. Store the key in 1Password or Azure Key Vault. Reference via env var in shell init:
   ```bash
   export GRAFANA_API_KEY="$(az keyvault secret show \
     --vault-name pn-cluster-keyvault \
     --name grafana-mcp-readonly-token \
     --query value -o tsv)"
   ```

## Read-only default verification

`--read-only` flag disables: `create_annotation`, `update_annotation`, `delete_annotation`,
`create_alert_rule`, `update_alert_rule`, `delete_alert_rule`, `create_dashboard`,
`update_dashboard`, `delete_dashboard`. The agent receives only query tools.

To verify after launch:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | mcp-grafana --transport stdio --read-only \
  | jq '.result.tools[].name' | grep -v -E '(create|update|delete)' | wc -l
# Should equal total tools — i.e., zero mutation tools present.
```

## Caveats

- Loki LogQL has a 5000-line response cap per query — split time ranges for long incidents.
- Tempo trace lookup requires the trace ID; for service-based discovery use Loki on
  `traceID` log fields first.
- Prometheus query_range step granularity: for incident windows < 1h use `step=15s`; for
  > 24h use `step=5m` to avoid response truncation.
- Datasource UIDs must be exact — list them once via `list_datasources` and pin in the env.
