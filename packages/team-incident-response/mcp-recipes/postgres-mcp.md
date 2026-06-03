# MCP Recipe — postgres-mcp

PostgreSQL MCP. Used for pg-tenant + pg-hyd inspection. Read-only by default, transaction-mode.

## Source

- Repo: <https://github.com/crystaldba/postgres-mcp>
- Alt: <https://github.com/modelcontextprotocol/servers/tree/main/src/postgres>
- License: MIT (both)
- Maintainer: Crystal DBA (community); MCP team (reference impl)

## Install

```bash
# Recommended (more features incl. pg_stat_*, EXPLAIN ANALYZE)
pip install postgres-mcp

# OR reference impl
npx -y @modelcontextprotocol/server-postgres
```

## Configuration

```jsonc
{
  "mcpServers": {
    "pg-tenant": {
      "command": "postgres-mcp",
      "args": ["--access-mode", "restricted"],
      "env": {
        "DATABASE_URI": "postgresql://incident_ro:${PG_TENANT_READONLY_PW}@pg-tenant-pooler.pnats-data.svc:5432/tenant?sslmode=require"
      }
    },
    "pg-hyd": {
      "command": "postgres-mcp",
      "args": ["--access-mode", "restricted"],
      "env": {
        "DATABASE_URI": "postgresql://incident_ro:${PG_HYD_READONLY_PW}@hyd-db.internal:5432/hyd?sslmode=require"
      }
    }
  }
}
```

## Auth setup

1. Create the role on EACH cluster (NEVER `ALL PRIVILEGES`):

   ```sql
   CREATE ROLE incident_ro WITH LOGIN PASSWORD '<pw>';
   GRANT USAGE ON SCHEMA public, pg_catalog TO incident_ro;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO incident_ro;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO incident_ro;
   GRANT pg_monitor TO incident_ro;  -- pg_stat_*, pg_stat_statements
   ALTER ROLE incident_ro SET statement_timeout = '30s';
   ALTER ROLE incident_ro SET lock_timeout = '5s';
   ALTER ROLE incident_ro SET idle_in_transaction_session_timeout = '60s';
   ```

2. Store passwords: `pg-tenant-incident-ro-pw`, `pg-hyd-incident-ro-pw` in Azure Key Vault.
3. Connection routing: through pg-tenant-pooler (pgbouncer transaction mode) for tenant,
   direct for hyd (it's read-only-replica safe but production-live — see PG_HYD_PRODUCTION
   note in CLAUDE.md).

## Read-only verification

`--access-mode restricted` blocks: INSERT, UPDATE, DELETE, TRUNCATE, ALTER, DROP, CREATE,
GRANT, REVOKE, COPY ... TO PROGRAM, all functions that mutate (pg_terminate_backend,
pg_cancel_backend EXCEPT when explicitly allow-listed).

For `collector-app-layer`, only SELECT + pg_stat_* are reachable.

## Caveats

- hyd-db is PRODUCTION and serves live writes. Single-stream reads only — parallel
  pool exhaustion hurts throughput (CLAUDE.md note `hyd-db is production`).
- pg-tenant uses Spilo (Patroni); `pg_stat_replication` views require connection to the
  current primary. The pooler routes by default but explicit primary connection may be
  needed for replication-lag queries.
- pg_dump / pg_restore are NOT MCP-bound — those run via Bash through dedicated jobs.
- Connection pool: `postgres-mcp` opens 1 connection per session — fine for incident use.
