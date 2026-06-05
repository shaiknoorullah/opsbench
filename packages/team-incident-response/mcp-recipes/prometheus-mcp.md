# MCP Recipe — prometheus-mcp

Lightweight Prometheus MCP server exposing read-only PromQL against a Prometheus
HTTP API endpoint. The opsbench `incident-responder` and `change-correlator`
agent classes call this for time-bounded metric lookups (saturation, error
rates, RED/USE signals) when the heavier `grafana-mcp` is overkill or when a
cluster-local Prometheus needs to be queried directly without going through a
Grafana datasource proxy.

## Source

- Repo: <https://github.com/pab1it0/prometheus-mcp-server>
- License: MIT
- Maintainer: community (pab1it0)

## Install

```bash
# Vendor-recommended: uv tool install from PyPI mirror of the repo
uv tool install prometheus-mcp-server

# OR clone + run from source
git clone https://github.com/pab1it0/prometheus-mcp-server
cd prometheus-mcp-server && uv sync
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally ships without built-in MCP. Wrap the Prometheus MCP
server as a Pi-callable CLI via HKUDS/CLI-Anything, then install as a Pi skill:

```bash
# 1. Fork pab1it0/prometheus-mcp-server and run CLI-Anything against the
#    stdio MCP entrypoint to generate a flat CLI surface (one subcommand per
#    MCP tool, JSON in/out).
# 2. Publish the wrapper as a git-installable Pi skill:
pi install git:github.com/<your-fork>/prometheus-mcp-pi-skill
```

Add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```md
## prometheus

For PromQL queries against the cluster Prometheus, call the `prometheus-mcp`
wrapper CLI installed under
`~/.pi/skills/prometheus-mcp-pi-skill/bin/prometheus-mcp`:

- Instant query: `prometheus-mcp query --query 'up{job="kubelet"}' --output json`
- Range query: `prometheus-mcp query-range --query 'rate(http_requests_total[5m])' --start <ts> --end <ts> --step 30s --output json`
- Series metadata: `prometheus-mcp series --match '{__name__=~"kube_pod_.*"}' --output json`
- Targets: `prometheus-mcp targets --state active --output json`
- Read-only by construction — the wrapper exposes no admin or remote-write verbs.
- For dashboard-style multi-datasource queries, prefer the `grafana-mcp` wrapper.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "prometheus": {
      "command": "uv",
      "args": ["tool", "run", "prometheus-mcp-server"],
      "env": {
        "PROMETHEUS_URL": "http://prometheus-k8s.monitoring.svc:9090",
        "PROMETHEUS_USERNAME": "",
        "PROMETHEUS_PASSWORD": "",
        "PROMETHEUS_BEARER_TOKEN": "${PROMETHEUS_BEARER_TOKEN}",
        "PROMETHEUS_TIMEOUT_SECONDS": "30"
      }
    }
  }
}
```

For multi-cluster setups, register one `mcpServers` entry per Prometheus
endpoint (e.g., `prometheus-ap-south-1`, `prometheus-eu-west-1`) and let the
agent route by region tag.

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode all reach this server through their
respective compat shims under `tools/<host>-compat-layer/` (e.g.
`tools/codex-compat-layer/`, `tools/cursor-compat-layer/`). Full per-host configs
ship in F5; for F0 the recipe above is the canonical source of truth.

## Auth setup

1. If Prometheus sits behind cluster-internal auth (e.g., kube-prometheus-stack
   with an oauth2-proxy sidecar), mint a service-account JWT scoped to the
   `monitoring` namespace and `prometheus-k8s` SA:

   ```bash
   kubectl -n monitoring create token prometheus-k8s --duration=24h
   ```

2. Store the token in Azure Key Vault as `prometheus-mcp-readonly-token`.
3. Export for local Claude Code runs:

   ```bash
   export PROMETHEUS_BEARER_TOKEN=$(az keyvault secret show \
     --vault-name opsbench-kv --name prometheus-mcp-readonly-token \
     -o tsv --query value)
   ```

4. For unauthenticated cluster-internal use (NetworkPolicy-gated), leave
   `PROMETHEUS_BEARER_TOKEN` empty — only `PROMETHEUS_URL` is required.
5. Verify the MCP can reach Prometheus and list tools:

   ```bash
   PROMETHEUS_URL=http://prometheus-k8s.monitoring.svc:9090 \
     uv tool run prometheus-mcp-server --list-tools | jq '.tools[].name'
   ```

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| --- | --- | --- |
| `query` | Instant PromQL evaluation at a single timestamp | Allow for all agent classes (read-only) |
| `query_range` | Range PromQL evaluation over `[start, end, step]` | Allow for all agent classes; cap `step` >= 15s |
| `series` | List time series matching a selector | Allow for incident-responder, change-correlator |
| `labels` | List label names in the TSDB | Allow read-only for all agent classes |
| `label_values` | List values for a given label | Allow read-only for all agent classes |
| `targets` | List scrape targets and their up/down state | Allow for incident-responder (triage signal) |
| `metadata` | Fetch metric-type/help/unit metadata | Allow read-only for all agent classes |

## Safety

- Read-only by construction — the upstream MCP exposes only the Prometheus HTTP
  query API (`/api/v1/query`, `/api/v1/query_range`, `/api/v1/series`,
  `/api/v1/labels`, `/api/v1/label_values`, `/api/v1/targets`,
  `/api/v1/metadata`). No `/api/v1/admin/*` verbs, no remote-write.
- Cedar gating should still cap `query_range` time windows (e.g., reject
  `end - start > 7d` to prevent TSDB load spikes) and minimum `step` (15s
  default; 5s for high-res incident windows only).
- Mutation gating is N/A here — there are no mutating tools. If anyone proposes
  wiring `/api/v1/admin/tsdb/delete_series` into the MCP, that is a separate
  recipe behind `cluster-admin`-class Cedar.
- Prompt-injection caveat: label values (especially `instance`, `pod`, `job`)
  are user/operator-controllable and may contain crafted strings. Treat all
  label values as data, never as instructions to the LLM.
- For OOM safety on the MCP side: `PROMETHEUS_TIMEOUT_SECONDS=30` caps individual
  queries; the Prometheus server's `query.max-samples` (default 50M) is the
  ultimate backstop.

## Caveats

- This is a community-maintained MCP (not Prometheus-team-official). Pin to a
  specific commit/tag in CI rather than tracking `main`; surface area may
  change between minor versions.
- MIT-licensed, so vendoring/forking for the CLI-Anything Pi wrapper is fine
  with attribution preserved in `LICENSE`/`NOTICE`.
- No native Thanos/Cortex/Mimir-specific verbs — those endpoints expose extra
  APIs (stores, rulers, compactor) that this MCP does not surface. Use
  `grafana-mcp` for multi-tier observability fan-out, or ship a dedicated
  `thanos-mcp.md` recipe later.
- No federation-aware query planning — if the target Prometheus is a federation
  root, queries are evaluated there and downstream shards are opaque.
- Does not implement `/api/v1/rules` or `/api/v1/alerts`; for active-alert
  inspection during an incident, use `alertmanager-mcp` (if shipped) or query
  Grafana's Unified Alerting via `grafana-mcp`.
- No built-in TLS client-cert auth; if your Prometheus requires mTLS, run the
  MCP behind a local reverse proxy that terminates the client cert.

## See also

- `grafana-mcp.md` — multi-datasource fan-out (Prometheus + Loki + Tempo) when
  the incident needs cross-signal correlation.
- `k8s-mcp.md` — pair metric anomalies with live `kubectl` state for triage.
- `clickhouse-mcp.md` — long-horizon analytics over audit/event data when
  Prometheus retention is insufficient.
