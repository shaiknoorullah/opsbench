---
id: SPEC-OPSBENCH-001
title: "Opsbench Platform — Component Design: C5 Audit Ledger"
version: 0.1.0
status: draft
part: component
component: C5
component_title: "Audit Ledger"
author: "Shaik Noorullah <shaiknooru247@gmail.com>"
created: 2026-06-16
last_updated: 2026-06-16
consumes: "SPEC-OPSBENCH-001 Part 0 §2 (C5), Part 1 §2 (AuditRecord); PRD IDN-001, IDN-002, NF-003, NF-005, DP-3"
---

# Component Design: C5 — Audit Ledger

The audit ledger is the platform's evidence spine: a tamper-evident, per-tenant hash-chained record of every agent action and policy decision, exportable as auditor-ready compliance evidence and independently verifiable offline. This document specifies how it meets its latency and durability budgets, because "one durable `INSERT` per audited action" is where a naive design fails under load.

## 1. Requirements traceability

| Requirement | What it imposes on C5 |
|---|---|
| IDN-001 | Six mandatory evidence fields per record; per-tenant `sha256` hash chain; Merkle checkpoints; offline verification without platform access. |
| IDN-002 | Records stream verbatim to customer SIEM/storage with at-least-once delivery. |
| NF-003 | 100% of actions/decisions ledgered **before** their effects are acknowledged; durable; P99 ≤ 25 ms for the on-path write at the NF-008 load floor. |
| NF-005 | Fail-closed: if the ledger write path is unavailable, gated mutations are denied — never best-effort. |
| DP-3 | "Evidence or it didn't happen": any user-visible platform behavior must be reconstructable from the ledger alone. |

The record shape is the `AuditRecord` schema (Part 1 §2). This document specifies the write path, not the record fields.

## 2. The problem

Two costs sit on the critical path, and only one is latency:

1. **Durable-write tail latency.** A single fsync'd Postgres commit is typically ~1–5 ms on NVMe, so the 25 ms P99 budget has headroom. The risk is the **tail** under concurrency — WAL fsync contention, checkpoint spikes, lock waits — not the median.
2. **The hash chain forces serialization.** Each record's `prev_hash` references the previous record, so writes within a tenant's chain are inherently ordered. You cannot fan out N independent concurrent inserts into one chain. This is a throughput ceiling, and it is the larger architectural constraint.

## 3. The governing principle

**Eventual consistency of the *query store* is fine; eventual *durability* is not.** The invariant is not "Postgres has the row before effect-ack"; it is "the record is durably, tamper-evidently persisted before effect-ack." Postgres may be an eventually-consistent projection of a durable log, as long as the durable boundary itself is synchronous and on-path.

The litmus test for any proposed optimization:

> If the node dies the instant after we acknowledge the effect, is the record still recoverable from stable media?

If yes, the optimization is safe. If the only copy was in RAM or an un-fsync'd buffer, it is not. Everything below follows from this test.

## 4. Architecture A — batched single-writer, Postgres source of truth (MVP default)

The chain's mandatory serialization and the fsync cost solve each other through batching.

```text
                 submit(record)            +-----------------------------+
 Gatekeeper  ------------------------->    |  Append worker (per tenant) |
 (awaits future)                           |  - assign seq               |
      ^                                    |  - compute prev_hash->hash  |
      |  resolve on durable commit         |    for the batch in memory  |
      +----------------------------------  |  - flush batch in ONE txn   |
                                           |    (ONE fsync) every ~2-5ms |
                                           |    or at K records          |
                                           +--------------+--------------+
                                                          | one transaction
                                                          v
                                              +-----------------------+
                                              | Postgres (append-only)|  <-- source of truth
                                              | BRIN(seq,ts); no heavy |
                                              | secondary indexes      |
                                              +-----------+-----------+
                                                          | async consumers (off-path)
                                   +----------------------+----------------------+
                                   v                      v                      v
                          Merkle checkpoint        SIEM streaming         search / projections
                          (every 1024 recs)        (IDN-002)              (query, RBAC joins)
```

**Write path (per tenant chain):**

1. The gatekeeper submits a record and awaits a future.
2. A single **append worker** per tenant chain assigns `seq`, computes the `prev_hash → hash` links **in memory in arrival order** for a batch of pending records.
3. The worker writes the whole batch in **one transaction with one fsync**, flushing on a small timer (~2–5 ms) or at K records, whichever comes first (group commit).
4. The worker resolves each caller's future on durable commit; only then does the gatekeeper acknowledge the effect.

**Why it works:** per-record durable-commit latency ≈ flush interval + one fsync (within the 25 ms budget), and throughput = batch size ÷ flush interval — thousands/sec per chain instead of one-at-a-time. The serialization the chain *requires* becomes the batching that makes fsync cheap per record. This is the same commit-coalescing that Kafka, Trillian, and Postgres's own group commit use.

**Supporting choices:**

- **Sharding = the per-tenant chain.** NF-006 already mandates per-tenant chains, so chains are independent → parallel append workers → throughput scales with tenant count. A single hot tenant may be sub-sharded by stream (cost: N chains to verify instead of 1); one chain per tenant by default.
- **Minimal on-path table.** Append-only, no heavy secondary indexes (BRIN on `seq`/`ts` only — cheap for monotonic appends). Everything expensive is off-path: the Merkle checkpoint (every 1024 records, ~7.2 ms, async per S1), SIEM streaming (IDN-002, async), and search/projection indexes built by consumers reading the committed rows.
- **Durability is a deployment-tier knob.** Local `synchronous_commit=on` (fsync to local WAL) is the single-node default; synchronous replication to a standby (`synchronous_commit=remote_write`/`remote_apply`) adds ~1 ms same-AZ RTT when "survive node loss" is required. The air-gapped/self-hosted tier uses local fsync.
- **Fail-closed (NF-005).** The worker resolves only on durable commit. If the worker or database is unavailable, the gatekeeper denies the mutation. If the ledger falls behind, the worker applies **backpressure** — mutations queue or deny rather than executing un-ledgered — and the lag surfaces as an agent-SLO burn (RPT-003).

## 5. Architecture B — durable log as source of truth, async Postgres projection (drop-in for scale)

When throughput must decouple from Postgres entirely, the synchronous on-path write goes to an append-only durable log (an fsync'd segment, Kafka with `acks=all`, or Redis/Dragonfly with `appendfsync always` + synchronous replica). The caller acks once the **log** has the record durably. A consumer then projects into Postgres asynchronously for querying — and *that* write is the "async to DB, eventual consistency" path, and it is safe because durability already happened upstream. This is plain event sourcing.

In B, every guarantee anchors to the **log**, not Postgres: the hash chain is computed at the log's single-writer/sequencer (so ordering is unambiguous), the Merkle checkpoints and the offline verification CLI run over the log, and SIEM streaming ships from the log. Postgres lagging by a few hundred milliseconds weakens nothing because no guarantee is anchored to Postgres — it is the convenient query/RBAC/join surface only.

**A vs B:** the fsync does not disappear in B — there is still one fsync on the path, so the latency floor is the same physics; batching remains the lever. B's win is **decoupling throughput from Postgres** and letting Postgres lag under burst without backpressuring the hot path. That is valuable at high scale and overkill at MVP scale (NF-008 floor is 1,000 events/sec per tenant — comfortably within a batched single-writer's reach).

## 6. The interface that keeps A → B a swap, not a rewrite

The sequencer and chain logic MUST be independent of the storage engine. Both architectures implement one interface:

```text
LedgerAppender:
  append(tenant, record) -> Future<DurableReceipt{seq, hash, committed_at}>
  // assigns seq, computes the chain link, returns only on durable commit
```

- The **sequencer** (assign `seq`, compute `prev_hash → hash` in arrival order) lives above the storage engine and is shared by A and B.
- Architecture A's appender flushes batches to Postgres. Architecture B's appender flushes to the durable log and Postgres becomes a downstream consumer.
- Migration A → B is "swap the durable-append implementation and make Postgres a consumer" — provided the sequencer/chain logic was kept storage-independent from day one. **This independence is a build-time requirement, not an optimization.**

## 7. Mutation ordering (what is on-path)

For mutations specifically, two records gate two different things:

1. The **decision/approval** record is durably appended **before** the irreversible effect executes — so a crash mid-execution always leaves a trail of intent.
2. The **outcome** record is durably appended **before** the platform acknowledges success to the human/agent.

Both anchor to the durable append; Postgres (in B) or the projection indexes (in A) trail both. Human-perceived latencies (NF-001 approval propagation 5 s, NF-002 investigation 2 min) dwarf ledger latency, so the ledger write only matters for the 25 ms budget and for not bottlenecking throughput — both solved by batching + sharding.

## 8. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **Write-through cache** (Redis/Dragonfly) | Still writes synchronously to the durable store before ack — no write-latency win, only faster reads. The audit ledger is write-heavy, read-rare (verification, SIEM, audits are off-path), so a read cache in front of it is low value. |
| **Write-back cache** | Acks the effect while the record is only in volatile memory. A crash before flush loses the evidence — violates DP-3 / NF-003 / NF-005. Disqualified as the durability tier. |
| **Redis/Dragonfly `appendfsync always` as primary store** | Same fsync physics as Postgres (no latency win) and a weaker, fussier compliance/durability story for an audit-of-record (async replication by default, snapshot/AOF semantics). Considered only as Architecture B's log if a benchmark proves it beats batched Postgres *and* clears the compliance bar. |
| **Per-record write to object storage** | S3-class PUT latency ≫ 25 ms. This is exactly why *checkpoints* (batched) go to object storage and individual records do not. |
| **Operating Trillian/Rekor** | Heavyweight to run; the spec chose "Rekor-style pattern without operating Trillian." The batched appender + periodic Merkle checkpoint gives the useful half without the operational weight. |

## 9. Where Redis / Dragonfly do belong

Not the audit durability tier — but legitimately: the **event stream** (C6, already Redis Streams; the replayable surface feed projected *from* the ledger, where eventual durability is fine), **memory** (C8), and **read-side caching** of the context store (C9, NF-010) and the hot audit tail for the live UI. **Dragonfly is a benchmark-decided drop-in for Redis** where single-threaded throughput becomes the bottleneck (event stream / cache at the NF-008 floor).

## 10. Failure modes (NF-005)

| Condition | Behavior |
|---|---|
| Append worker / DB unavailable | Gatekeeper denies the mutation (fail-closed); degradation surfaced within one minute. |
| Ledger lag (DB slow) | Worker applies backpressure; mutations queue or deny rather than executing un-ledgered; agent-SLO burn (RPT-003). |
| Batch transaction rollback | The batch's seqs are not committed; records are re-chained and retried as a new batch; callers' futures resolve on the retry or reject (→ deny). |
| SIEM destination outage (B or A) | Off-path; buffered with at-least-once replay (IDN-002); never blocks the mutation path. |
| Checkpoint builder failure | Off-path; alarmed; chain remains verifiable record-by-record until checkpoints resume. |

## 11. Performance budget and the MVP benchmark

S1 measured the CPU portions on real hardware: chain append (canonical-JSON `sha256` + link) **P99 0.016 ms**; 4-record mutation path ~0.066 ms; 1024-record Merkle checkpoint 7.2 ms off-path with a 320-byte inclusion proof. **S1 did not measure a durable Postgres insert — there was no database in the spike environment.** The 25 ms NF-003 budget therefore has ~24.9 ms of unmeasured headroom for the durable write.

The MVP gatekeeper+ledger slice MUST stand up a real Postgres and load-test the append worker at the NF-008 floor (1,000 events/sec per tenant, 100 concurrent governed runs) to confirm P99 ≤ 25 ms with the chosen batch interval and `synchronous_commit` setting. This is already an MVP exit criterion (NF-003 validated at the NF-008 load floor). The benchmark result decides whether Architecture B is ever needed.

## 12. Decisions for MVP build

1. Build **Architecture A** (batched Postgres-as-source-of-truth).
2. Implement the **`LedgerAppender` interface with a storage-independent sequencer** so A → B is a drop-in.
3. Default flush interval 2–5 ms (tune against the benchmark); checkpoint cadence 1024 records (S1).
4. Durability: `synchronous_commit=on` local by default; sync-replica as a per-tenant deployment-tier option.
5. Land the offline verification CLI alongside the appender (chain continuity + checkpoint roots), per IDN-001 / UC-011.
