# MCP Recipe — loki-mcp

Direct LogQL access to a Grafana Loki backend. Called by the `triage-analyst`,
`log-forensics`, and `recovery-planner` opsbench agent classes when an incident
needs raw log evidence (errors, panics, audit trails) outside the Grafana
datasource indirection. Use this recipe when the upstream `grafana-mcp` Loki
datasource hop adds latency or hides label cardinality the forensics agent
needs to see directly.

## Source

- Repo: <https://github.com/grafana/loki-mcp>
- License: AGPL-3.0 (verify upstream — Grafana org default is AGPL for server code)
- Maintainer: Grafana Labs (official; treat as external-only — AGPL prohibits
  vendoring into opsbench distribution bundles)

## Install

```bash
# Go binary (vendor-recommended)
go install github.com/grafana/loki-mcp/cmd/loki-mcp@latest

# Or pre-built release
curl -L -o /usr/local/bin/loki-mcp \
  https://github.com/grafana/loki-mcp/releases/latest/download/loki-mcp-linux-amd64
chmod +x /usr/local/bin/loki-mcp
```

## Configuration — Pi (primary)

Pi has no built-in MCP runtime, so the loki-mcp surface is exposed to Pi via the
CLI-Anything wrap path. The wrapper translates each MCP tool into a discrete
CLI subcommand the Pi agent invokes via Bash, with `--json` output the agent
can parse.

```bash
# Install the CLI-Anything-generated Pi skill
pi install git:github.com/<your-fork>/loki-mcp-pi-skill
```

Then add to `~/.pi/agent/AGENTS.md` (or per-project `SYSTEM.md`):

```markdown
## Loki log forensics

When the user reports an error spike, panic, 5xx surge, or audit-trail gap,
call the `loki-pi` wrapper before issuing raw `kubectl logs`:

- `loki-pi query --logql '<query>' --since 15m --json` — instant query
- `loki-pi query-range --logql '<query>' --start <ts> --end <ts> --step 30s --json`
- `loki-pi labels --json` — discover available label dimensions
- `loki-pi label-values --label <name> --json` — enumerate label values

Always cap range queries to <= 1h on first pass — Loki returns up to 5000
lines per stream and aggressive ranges truncate silently. Use `--limit` and
narrow `{namespace=...,app=...}` selectors before broadening. Never run
`loki-pi delete` (mutation surface) from incident-response agents.
```

## Configuration — Claude Code (secondary)

```jsonc
{
  "mcpServers": {
    "loki": {
      "command": "loki-mcp",
      "args": ["--transport", "stdio", "--read-only"],
      "env": {
        "LOKI_URL": "https://loki.ap-south-1.pnats.cloud",
        "LOKI_USERNAME": "incident_readonly",
        "LOKI_PASSWORD": "${LOKI_READONLY_PASSWORD}",
        "LOKI_TENANT_ID": "pnats-prod",
        "LOKI_MAX_QUERY_LENGTH": "1h",
        "LOKI_MAX_ENTRIES_LIMIT": "5000"
      }
    }
  }
}
```

For bearer-token auth (Grafana Cloud / OIDC-fronted Loki), drop `LOKI_USERNAME`
and `LOKI_PASSWORD` and set `LOKI_BEARER_TOKEN` instead.

## Configuration — other hosts

Codex, Copilot, Cursor, Gemini, and OpenCode all consume loki-mcp via the same
CLI-Anything wrapper used for Pi, or via native MCP for hosts that support it.
Per-host config snippets ship in `tools/<host>-compat-layer/` in F5.

## Auth setup

1. Provision a Loki read-only user (or service account on Grafana Cloud) scoped
   to the incident tenant. For self-hosted Loki, basic auth is gated by the
   gateway (nginx/Envoy):

   ```bash
   htpasswd -B -c /etc/loki/htpasswd incident_readonly
   ```

2. Store the credential in Azure Key Vault (`loki-incident-readonly-pw`) and
   export at shell init:

   ```bash
   export LOKI_READONLY_PASSWORD="$(az keyvault secret show \
     --vault-name pn-cluster-keyvault \
     --name loki-incident-readonly-pw \
     --query value -o tsv)"
   ```

3. Confirm the tenant header is set — multi-tenant Loki returns empty results
   without `X-Scope-OrgID` (the MCP injects this from `LOKI_TENANT_ID`).

4. Verify reachability and tool list:

   ```bash
   curl -u "incident_readonly:$LOKI_READONLY_PASSWORD" \
     -H "X-Scope-OrgID: pnats-prod" \
     "$LOKI_URL/loki/api/v1/labels" | jq '.status'
   # → "success"

   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
     | loki-mcp --transport stdio --read-only \
     | jq '.result.tools[].name'
   ```

5. Pin the loki-mcp binary version in CI — the tool schema is still pre-1.0.

## Tools surfaced

| Tool | Purpose | Recommended Cedar gating |
|------|---------|--------------------------|
| `query` | Instant LogQL query at a single timestamp | `action == "loki:query"` — open for incident-response; pin `resource.tenant` |
| `query_range` | Range LogQL query over a time window | `action == "loki:query_range"` — open; enforce `max_range <= 1h` for triage |
| `labels` | List available label names for the tenant | open (read-only metadata) |
| `label_values` | Enumerate values for a given label | open (read-only metadata) |
| `series` | List series matching a selector | `action == "loki:series"` — open; high-cardinality selectors should warn |
| `stats` | Index/chunk stats for a query (cost preview) | open (read-only); use before broad queries |
| `delete` | Delete logs matching a selector (compactor) | DENY for incident-response; `recovery-planner` only with human approval |

## Safety

- Read-only by default: `--read-only` disables the `delete` and `cancel_delete`
  tools entirely — only query and metadata surfaces are exposed to the agent.
- Cedar gating MUST pin `resource.tenant` to the incident scope — Loki's
  multi-tenant model is enforced solely by the `X-Scope-OrgID` header, and a
  misconfigured policy lets agents read other tenants' logs.
- Query-cost gating: enforce `LOKI_MAX_QUERY_LENGTH=1h` and require explicit
  override for longer ranges — unbounded `{job=~".+"}` selectors can DoS the
  Loki querier and bill heavily on Grafana Cloud.
- Prompt-injection caveat: log lines are attacker-controllable. The agent
  feeds raw log content into the LLM context — a hostile workload can embed
  prompt-injection payloads in stdout. Treat log content as untrusted text;
  never auto-execute remediations derived from log strings without human review.
- The `delete` tool (when not disabled) is an asynchronous deletion request
  against the Loki compactor; a deletion cannot be reversed once processed.
  Gate behind `recovery-planner` agent class plus human approval.

## Caveats

- **AGPL-3.0 license** — verify upstream; if confirmed AGPL, this MCP is
  external-only and MUST NOT be vendored into opsbench distribution bundles.
  Distribute installation instructions only; users install from upstream.
- Loki LogQL responses are capped at 5000 lines per stream by default —
  long incident windows silently truncate. Split time ranges or narrow
  selectors before broadening.
- High-cardinality label selectors (e.g., `{pod=~".+"}`) trigger Loki's
  `max_streams_per_user` limit and return partial results without warning.
  Use `stats` first to preview query cost.
- Beta/pre-1.0: tool schemas may change between minor releases. Pin the
  loki-mcp binary version in CI and re-test agent prompts after upgrades.
- Multi-tenant tenant isolation depends entirely on `X-Scope-OrgID` — if the
  Loki gateway strips or rewrites this header (common on misconfigured
  Envoy/nginx fronts), tenant separation breaks.
- Requires network reachability to the Loki query frontend; for air-gapped
  on-prem clusters, port-forward via `kubectl port-forward -n loki svc/loki-query-frontend 3100`.

## See also

- `grafana-mcp.md` — broader datasource surface (Prometheus + Loki + Tempo);
  prefer when correlation across signals is needed.
- `clickhouse-mcp.md` — long-term audit log storage; pair with Loki for
  incidents that cross the Loki retention window.
- `opentelemetry-mcp.md` — trace context for log lines containing `traceID`.
