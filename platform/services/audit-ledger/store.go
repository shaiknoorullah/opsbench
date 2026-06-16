package auditledger

import "context"

// LedgerStore is the storage boundary. The sequencer and appender depend only on
// this interface, so Architecture A (Postgres source of truth) and Architecture B
// (durable log + async projection) are a swap, not a rewrite (C5 design §6).
// AppendBatch MUST be atomic and durable on return.
type LedgerStore interface {
	// Head returns the last committed record of a tenant chain, or nil if empty.
	Head(ctx context.Context, tenant string) (*ChainHead, error)

	// AppendBatch durably appends a contiguous, pre-chained batch in one atomic
	// transaction. It MUST reject a batch that does not extend the current head.
	AppendBatch(ctx context.Context, tenant string, records []AuditRecord) error

	// ReadRange returns records with seq in [fromSeq, toSeq], ascending.
	ReadRange(ctx context.Context, tenant string, fromSeq, toSeq int64) ([]AuditRecord, error)

	// PutCheckpoint persists a Merkle checkpoint (off the caller's latency path).
	PutCheckpoint(ctx context.Context, cp Checkpoint) error

	// ReadCheckpoints returns a tenant's checkpoints ordered by from_seq ascending.
	ReadCheckpoints(ctx context.Context, tenant string) ([]Checkpoint, error)
}
