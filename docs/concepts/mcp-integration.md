# MCP integration

opsbench teams compose third-party MCP (Model Context Protocol) servers rather than reimplementing tool surfaces. This keeps each team focused on workflow and decision logic; the tool plumbing is delegated.

## Where recipes live

```
packages/<team>/mcp-recipes/<server>-mcp.md
```

Each recipe is a self-contained markdown file with:

- What the server provides
- Install command
- `settings.json` snippet to register it
- Recommended scope (read-only / read-write)
- Cedar policy hints for agents that should access it

## Recipes shipped with team-incident-response

- `aws-mcp`, `azure-mcp` — cloud control planes
- `clickhouse-mcp`, `postgres-mcp` — DB introspection
- `grafana-mcp` — unified Prometheus/Loki/Tempo
- `github-mcp`, `linear-mcp`, `slack-mcp` — collaboration surfaces
- `k8s-mcp` — kubectl / helm / argocd
- `opentelemetry-mcp` — traces / OTel collector
- `pagerduty-mcp`, `velociraptor-mcp`, `ebpf-observability-mcp` — incident response specifics
- `CUSTOM-contabo-mcp`, `CUSTOM-longhorn-mcp`, `CUSTOM-wireguard-mcp` — recipes that wrap REST APIs the user can implement as a minimal MCP server

## Adding a recipe

Use the same file structure as the existing ones. PR-welcome additions:

- Cloud providers we don't cover yet (GCP, OCI, Hetzner, Vultr)
- Observability backends (Datadog, Honeycomb, Lightstep, New Relic)
- IR-specific tooling (TheHive, OpenCTI, MISP, Falco-standalone)
- Identity (Okta, Auth0, Entra ID)

## Tool naming

MCP tools are referenced as `mcp__<server>__<tool>`. Cedar policies use glob patterns: `Tool::"mcp__grafana__*"`.
