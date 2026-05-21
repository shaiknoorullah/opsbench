# MCP Recipe — opentelemetry-mcp

Wraps Tempo and Jaeger trace stores via the OTel collector's query API. Use when a Grafana
deployment is not available or when raw OTel access is needed (e.g., self-hosted collector).

## Source

- Repo: https://github.com/open-telemetry/community/issues — official MCP not yet
  released; community implementation: https://github.com/cyclotruc/otel-mcp-server
- License: MIT
- Status: COMMUNITY (not officially maintained by OTel project)

## Install

```bash
pip install otel-mcp-server
# OR
npx -y @cyclotruc/otel-mcp-server@latest
```

## Configuration

```jsonc
{
  "mcpServers": {
    "opentelemetry": {
      "command": "npx",
      "args": ["-y", "@cyclotruc/otel-mcp-server@latest", "--read-only"],
      "env": {
        "TEMPO_URL":  "https://tempo.ap-south-1.pnats.cloud",
        "JAEGER_URL": "http://jaeger-query.observability.svc:16686",
        "OTEL_AUTH_HEADER": "Bearer ${OTEL_BEARER_TOKEN}"
      }
    }
  }
}
```

## Auth setup

- Tempo: bearer token from Grafana Cloud or self-hosted basic-auth user.
- Jaeger: no auth in-cluster; via ingress, basic-auth (Caddy + bcrypt).
- Store secrets in Azure Key Vault: `tempo-mcp-token`, `jaeger-mcp-basic-auth`.

## Read-only verification

The community server exposes only `search_traces`, `get_trace`, `get_dependencies`,
`get_service_operations`. No mutation methods exist in the OTel query API.

## Caveats

- Trace retention: Tempo defaults to 30d; check your config before chasing old incidents.
- Jaeger UI shows sampled traces only; agents should query the raw `otel-collector` exporter
  for unsampled debugging traces.
- Service-name conventions: pnats uses `<app>.<namespace>.svc` — must match exactly.
