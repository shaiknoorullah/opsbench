# C5 — Audit Ledger (Go)

Tamper-evident, per-tenant hash-chained audit ledger. The platform's evidence spine:
every agent action and policy decision is recorded, chained, and independently
verifiable offline.

- Design: `docs/superpowers/specs/opsbench-platform/components/C5-audit-ledger.md`
- Requirements: PRD `IDN-001`, `IDN-002`, `NF-003`, `NF-005`, `DP-3`
- Record contract: `@opsbench/schemas` `audit-record.json`

This is **Architecture A**: a batched single-writer per tenant chain with Postgres as
the source of truth. One goroutine per tenant assigns `seq` + chain links in arrival
order and flushes a batch in one transaction (one fsync), resolving each caller only on
durable commit. The mandatory chain serialization becomes the batching that makes the
fsync cheap per record.

## Layout

| File | Role |
|---|---|
| `canonical.go` | recursive key-sort canonical JSON + SHA-256 + record-hash rule (amendment A9) |
| `ids.go` | `led_<ULID>` id generation (Crockford base32, schema-conformant) |
| `types.go` | Go structs mirroring `audit-record.json` |
| `sequencer.go` | `SealRecord` — assign seq/id/prev_hash/hash (storage-independent) |
| `merkle.go` | Merkle root + inclusion proofs for checkpoints |
| `store.go` | `LedgerStore` interface (the A↔B swap boundary) |
| `store_memory.go` | in-memory store (tests + reference semantics) |
| `store_postgres.go` | Postgres store (pgx); append-only table, one txn per batch |
| `appender.go` | `LedgerAppender` — batched writer, backpressure, fail-closed, checkpoints |
| `verify.go` | offline chain + checkpoint verification |
| `cmd/verify-ledger/` | offline verification CLI (IDN-001 / UC-011) |

## Run

```sh
cd platform
go test ./...                       # unit tests; Postgres integration skips without DATABASE_URL
go test -run Postgres ./...         # with DATABASE_URL set, runs the live integration test
go build ./...
go run ./services/audit-ledger/cmd/verify-ledger bundle.json   # verify an export bundle
```

The verify CLI reads `{ "records": [...], "checkpoints": [...] }` from a file or stdin and
exits 0 (intact) or 1 (tamper/gap/forgery detected).

## Status

`LedgerStore` has in-memory and Postgres implementations. Architecture B (durable log
as source of truth + async Postgres projection) is a drop-in behind the same interface
if throughput demands it — see the design doc §5–§6. The durable Postgres-insert latency
is validated at the NF-008 load floor at MVP (the C5 design's one measured gap).
