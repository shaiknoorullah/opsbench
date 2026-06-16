package auditledger

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresLedgerStore is the Architecture A source of truth: an append-only table,
// one transaction (one fsync) per batch — the durability boundary (C5 design §4).
type PostgresLedgerStore struct {
	pool *pgxpool.Pool
}

// NewPostgresLedgerStore opens a pool against connString.
func NewPostgresLedgerStore(ctx context.Context, connString string) (*PostgresLedgerStore, error) {
	pool, err := pgxpool.New(ctx, connString)
	if err != nil {
		return nil, err
	}
	return &PostgresLedgerStore{pool: pool}, nil
}

// NewPostgresLedgerStoreFromPool wraps an existing pool (useful for tests).
func NewPostgresLedgerStoreFromPool(pool *pgxpool.Pool) *PostgresLedgerStore {
	return &PostgresLedgerStore{pool: pool}
}

// Close releases the pool.
func (s *PostgresLedgerStore) Close() { s.pool.Close() }

// Init creates the append-only tables if absent. Idempotent.
func (s *PostgresLedgerStore) Init(ctx context.Context) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS audit_ledger (
			tenant_id text NOT NULL,
			seq bigint NOT NULL,
			id text NOT NULL,
			ts timestamptz NOT NULL,
			prev_hash text NOT NULL,
			hash text NOT NULL,
			record jsonb NOT NULL,
			PRIMARY KEY (tenant_id, seq)
		)`,
		`CREATE INDEX IF NOT EXISTS audit_ledger_ts_brin ON audit_ledger USING brin (tenant_id, ts)`,
		`CREATE TABLE IF NOT EXISTS audit_checkpoints (
			tenant_id text NOT NULL,
			from_seq bigint NOT NULL,
			to_seq bigint NOT NULL,
			root text NOT NULL,
			created_at timestamptz NOT NULL,
			PRIMARY KEY (tenant_id, from_seq)
		)`,
	}
	for _, q := range stmts {
		if _, err := s.pool.Exec(ctx, q); err != nil {
			return err
		}
	}
	return nil
}

func (s *PostgresLedgerStore) Head(ctx context.Context, tenant string) (*ChainHead, error) {
	var seq int64
	var hash string
	err := s.pool.QueryRow(ctx,
		`SELECT seq, hash FROM audit_ledger WHERE tenant_id = $1 ORDER BY seq DESC LIMIT 1`, tenant,
	).Scan(&seq, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &ChainHead{Seq: seq, Hash: hash}, nil
}

func (s *PostgresLedgerStore) AppendBatch(ctx context.Context, tenant string, records []AuditRecord) error {
	if len(records) == 0 {
		return nil
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op after a successful Commit

	// One batched round-trip, one COMMIT (one fsync). The (tenant_id, seq) primary key
	// makes a duplicate/non-contiguous seq fail the whole transaction -> fail-closed.
	b := &pgx.Batch{}
	for _, r := range records {
		blob, mErr := json.Marshal(r)
		if mErr != nil {
			return mErr
		}
		b.Queue(
			`INSERT INTO audit_ledger (tenant_id, seq, id, ts, prev_hash, hash, record) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			tenant, r.Seq, r.ID, r.TS, r.PrevHash, r.Hash, string(blob),
		)
	}
	br := tx.SendBatch(ctx, b)
	for range records {
		if _, err := br.Exec(); err != nil {
			_ = br.Close()
			return err
		}
	}
	if err := br.Close(); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *PostgresLedgerStore) ReadRange(ctx context.Context, tenant string, fromSeq, toSeq int64) ([]AuditRecord, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT record FROM audit_ledger WHERE tenant_id = $1 AND seq >= $2 AND seq <= $3 ORDER BY seq ASC`,
		tenant, fromSeq, toSeq,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AuditRecord
	for rows.Next() {
		var blob []byte
		if err := rows.Scan(&blob); err != nil {
			return nil, err
		}
		var rec AuditRecord
		if err := json.Unmarshal(blob, &rec); err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

func (s *PostgresLedgerStore) PutCheckpoint(ctx context.Context, cp Checkpoint) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO audit_checkpoints (tenant_id, from_seq, to_seq, root, created_at)
		 VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, from_seq) DO NOTHING`,
		cp.TenantID, cp.FromSeq, cp.ToSeq, cp.Root, cp.CreatedAt,
	)
	return err
}

func (s *PostgresLedgerStore) ReadCheckpoints(ctx context.Context, tenant string) ([]Checkpoint, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT tenant_id, from_seq, to_seq, root, created_at FROM audit_checkpoints WHERE tenant_id = $1 ORDER BY from_seq ASC`,
		tenant,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Checkpoint
	for rows.Next() {
		var cp Checkpoint
		var createdAt time.Time
		if err := rows.Scan(&cp.TenantID, &cp.FromSeq, &cp.ToSeq, &cp.Root, &createdAt); err != nil {
			return nil, err
		}
		cp.CreatedAt = createdAt.UTC().Format(time.RFC3339Nano)
		out = append(out, cp)
	}
	return out, rows.Err()
}
