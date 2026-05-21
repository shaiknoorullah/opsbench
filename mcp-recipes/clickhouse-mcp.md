# MCP Recipe — clickhouse-mcp

ClickHouse MCP server. Defaults to read-only via the `readonly=1` setting profile.

## Source

- Repo: https://github.com/ClickHouse/mcp-clickhouse
- License: Apache-2.0
- Maintainer: ClickHouse Inc (official)

## Install

```bash
pip install mcp-clickhouse
# OR
uv tool install mcp-clickhouse
```

## Configuration

```jsonc
{
  "mcpServers": {
    "clickhouse-audit": {
      "command": "uv",
      "args": ["tool", "run", "mcp-clickhouse"],
      "env": {
        "CLICKHOUSE_HOST": "chi-audit-audit-0-0.chi-audit.svc",
        "CLICKHOUSE_PORT": "9000",
        "CLICKHOUSE_USER": "incident_readonly",
        "CLICKHOUSE_PASSWORD": "${CLICKHOUSE_READONLY_PASSWORD}",
        "CLICKHOUSE_DATABASE": "audit",
        "CLICKHOUSE_SECURE": "false",
        "CLICKHOUSE_READONLY": "1"
      }
    }
  }
}
```

## Auth setup

1. Create the read-only user in ClickHouse:
   ```sql
   CREATE USER incident_readonly IDENTIFIED WITH sha256_password BY '<pw>';
   GRANT SELECT, SHOW TABLES, SHOW COLUMNS ON audit.* TO incident_readonly;
   ALTER USER incident_readonly SETTINGS readonly = 1, max_execution_time = 60;
   ```
2. Store the password in Azure Key Vault: `clickhouse-incident-readonly-pw`.
3. The user has access only to `system.*` and `audit.*` (no `INSERT`, no `ALTER`,
   no `DROP`).

## Read-only verification

`CLICKHOUSE_READONLY=1` + `readonly=1` setting on the user means:
- No `INSERT`, `UPDATE`, `ALTER`, `DROP`, `TRUNCATE`, `OPTIMIZE`.
- No DDL of any kind.
- `SELECT` plus `SHOW`/`DESCRIBE` only.
- Even read-only queries are capped at `max_execution_time=60s` to prevent runaway scans.

## Caveats

- ClickHouse system tables (e.g., `system.query_log`, `system.parts`, `system.replicas`)
  are the primary forensic source. Sample queries the analysis agents will issue:
  - `SELECT * FROM system.query_log WHERE event_time > now() - INTERVAL 1 HOUR AND type='ExceptionWhileProcessing'`
  - `SELECT table, partition, name, bytes_on_disk FROM system.parts WHERE active = 0`
  - `SELECT * FROM system.replicas WHERE is_readonly = 1 OR is_session_expired = 1`
- For chi-audit the operator is Altinity — the operator-managed CHI is the source of truth;
  do not modify configs via raw client.
- `max_memory_usage` is enforced per query; large `GROUP BY` may OOM the readonly session
  with default settings. Use `LIMIT` and time-bounded `WHERE`.
