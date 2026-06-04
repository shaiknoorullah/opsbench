# MCP Recipe — victoriametrics-mcp

VictoriaMetrics' built-in MCP server exposes MetricsQL queries, series cardinality
introspection, and admin status verbs against a single-node `victoria-metrics`
binary or `vmselect` cluster endpoint. The opsbench `metrics-analyst` agent class
calls this during incident triage to run MetricsQL against long-term storage,
and the `cardinality-investigator` class uses it to chase label-explosion
incidents via the TSDB stats API. The `change-correlator` joins MetricsQL
results with Loki/Grafana timelines.

## Source

- Repo: <https://github.com/VictoriaMetrics/mcp-victoriametrics>
- License: Apache-2.0
- Maintainer: VictoriaMetrics (official, bundled into `victoria-metrics` >= 1.105)

## Install

```bash
# Vendor-recommended: install the official victoria-metrics binary (>=1.105 ships the MCP)
VM_VERSION=v1.106.1
curl -L -o /tmp/vm.tar.gz \
  https://github.com/VictoriaMetrics/VictoriaMetrics/releases/download/${VM_VERSION}/victoria-metrics-linux-amd64-${VM_VERSION}.tar.gz
sudo tar -xzf /tmp/vm.tar.gz -C /usr/local/bin/ victoria-metrics-prod
sudo mv /usr/local/bin/victoria-metrics-prod /usr/local/bin/victoria-metrics

# Verify the mcp subcommand is present
victoria-metrics mcp --help
```

## Configuration — Pi (primary)

Pi (pi.dev) intentionally ships without built-in MCP. Wrap the
`victoria-metrics mcp serve` entrypoint as a Pi-callable CLI via
HKUDS/CLI-Anything, then install as a Pi skill:

```bash
# 1. Fork VictoriaMetrics/mcp-victoriametrics and run CLI-Anything against the
#    MCP server module to generate a flat CLI surface (one subcommand per
#    MCP tool, JSON in/out, VM_URL/VM_TOKEN env-passthrough preserved).
# 2. Publish the wrapper as a git-installable Pi skill:
pi install git:github.com/<your-fork>/victoriametrics-mcp-pi-skill
```

Add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```md
## victoriametrics

For MetricsQL queries against long-term metrics storage, call the
`vm-mcp` wrapper CLI installed under
`~/.pi/skills/victoriametrics-mcp-pi-skill/bin/vm-mcp`:

- Query (instant): `vm-mcp query --expr 'rate(http_requests_total[5m])' --output json`
- Query (range): `vm-mcp query-range --expr '<metricsql>' --start <ts> --end <ts> --step 30s --output json`
- Label values: `vm-mcp label-values --label instance --match '{job="api"}' --output json`
- TSDB status: `vm-mcp tsdb-status --topN 20 --output json` (cardinality investigation)
- Series count: `vm-mcp series-count --match '{__name__=~".+"}' --output json`
- All verbs are READ-ONLY. Never call admin endpoints (delete-series,
  snapshot-create) from incident-response sessions — those require the
  `metrics-admin` Cedar role and go through a separate skill.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "victoriametrics": {
      "command": "victoria-metrics",
      "args": ["mcp", "serve", "--transport", "stdio", "--read-only"],
      "env": {
        "VM_URL": "https://vmselect.metrics.ap-south-1.pnats.cloud",
        "VM_TOKEN": "${VM_READONLY_TOKEN}",
        "VM_QUERY_TIMEOUT": "60s",
        "VM_MAX_POINTS_PER_SERIES": "30000"
      }
    }
  }
}
```

For cardinality-investigation sessions (TSDB stats + label-values can be slow on
large clusters), use a separate entry with a longer timeout and a dedicated
service account:

```jsonc
{
  "mcpServers": {
    "victoriametrics-cardinality": {
      "command": "victoria-metrics",
      "args": ["mcp", "serve", "--transport", "stdio", "--read-only",
               "--enable-tsdb-status"],
      "env": {
        "VM_URL": "https://vmselect.metrics.ap-south-1.pnats.cloud",
        "VM_TOKEN": "${VM_CARDINALITY_TOKEN}",
        "VM_QUERY_TIMEOUT": "300s"
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

1. Create a read-only token in your auth proxy (vmauth, vmgateway, or upstream
   reverse proxy) scoped to `/api/v1/query*`, `/api/v1/series`,
   `/api/v1/labels`, `/api/v1/label/*/values`, and `/api/v1/status/tsdb`.
   Deny `/api/v1/admin/*` and `/api/v1/import*` paths at the proxy.
2. Store the token in Azure Key Vault as `vm-mcp-readonly-token` (and
   `vm-mcp-cardinality-token` for the longer-timeout profile).
3. Export for local Claude Code runs:

   ```bash
   export VM_READONLY_TOKEN="$(az keyvault secret show \
     --vault-name opsbench-kv --name vm-mcp-readonly-token \
     --query value -o tsv)"
   ```

4. Verify connectivity and read-only scope:

   ```bash
   curl -sS -H "Authorization: Bearer ${VM_READONLY_TOKEN}" \
     "${VM_URL}/api/v1/query?query=vm_app_version" | jq '.status'
   # expect "success"

   # Confirm admin paths are blocked at the proxy:
   curl -sS -o /dev/null -w "%{http_code}\n" \
     -H "Authorization: Bearer ${VM_READONLY_TOKEN}" \
     "${VM_URL}/api/v1/admin/tsdb/delete_series?match[]=up"
   # expect 403
   ```

5. Verify the MCP starts and lists tools:
   `victoria-metrics mcp serve --transport stdio --read-only --list-tools | jq '.tools[].name'`.

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
| --- | --- | --- |
| `query` | MetricsQL instant query at a single timestamp | Allow read-only for all agent classes |
| `query_range` | MetricsQL range query with start/end/step | Allow read-only for all agent classes |
| `series` | Enumerate series matching a label selector | Allow for metrics-analyst, change-correlator |
| `labels` | List all label names visible to the token | Allow for metrics-analyst, cardinality-investigator |
| `label_values` | List values for a given label, optionally filtered by selector | Allow for metrics-analyst, cardinality-investigator |
| `tsdb_status` | Top-N series, label-value churn, cardinality stats | Allow for cardinality-investigator only (expensive) |
| `metadata` | Metric type/help/unit metadata if scraped via OpenMetrics | Allow read-only for all agent classes |

## Safety

- Read-only by default — `--read-only` flag plus proxy-level path allowlist
  means the agent cannot reach `admin/tsdb/delete_series`, snapshot create, or
  the `/api/v1/import*` ingest endpoints. Mutation tools are intentionally
  absent from the MCP surface in this configuration.
- Cedar policy should gate `tsdb_status` separately — it can scan the full
  inverted index and has caused vmselect OOMs in the past. Restrict to the
  `cardinality-investigator` role with a per-session call budget.
- `query_range` over multi-month ranges with low `step` returns huge payloads;
  enforce `VM_MAX_POINTS_PER_SERIES` (default 30k here) and require explicit
  `step` ≥ `15s` for incident-window queries, ≥ `5m` for > 24h.
- Prompt-injection caveat: metric `help` text and label values are
  user-controllable (scraped from app exposition). Treat strings returned by
  `metadata` and `label_values` as untrusted data, not directives.
- Token scope: the proxy-issued token must be cluster-scoped, not user-scoped
  — user tokens disappear on offboarding and break the agent silently.

## Caveats

- The bundled MCP server is new (>=1.105, late-2024) — verb names and JSON
  shapes may shift between minor releases. Pin `victoria-metrics` to an exact
  patch version in CI and bump deliberately.
- Apache-2.0, so vendoring/forking is fine; retain `LICENSE` and `NOTICE` on
  the fork used for the CLI-Anything Pi wrapper.
- Cluster vs single-node: against a cluster, point `VM_URL` at `vmselect`
  (port 8481, `/select/<accountID>/prometheus/`). Against single-node, the
  default `/` prefix is correct. The MCP does not auto-detect — set the URL
  prefix explicitly.
- MetricsQL is a superset of PromQL: features like `keep_last_value`,
  `histogram_quantiles`, and rollup functions are VM-only. Queries authored
  against this MCP may not be portable to a Prometheus MCP — note the
  datasource in any generated runbook.
- High-cardinality `tsdb_status` calls can take 30-300s on multi-million-series
  clusters; the dedicated `victoriametrics-cardinality` entry exists for this
  reason. Do not raise `VM_QUERY_TIMEOUT` on the default entry.
- vmauth/vmgateway is recommended in front of vmselect; without it, scoping a
  token to read-only paths requires fronting with a reverse proxy
  (nginx/Envoy) and an external authz layer.

## See also

- `grafana-mcp.md` — same datasource via Grafana's MetricsQL wrapper for
  dashboard-context queries; prefer this recipe for raw MetricsQL.
- `clickhouse-mcp.md` — pair MetricsQL findings with audit/query log
  forensics in ClickHouse for full root-cause timelines.
