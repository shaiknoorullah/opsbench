package auditledger

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"
)

// Postgres backend integration test. Skipped unless DATABASE_URL is set, so the suite
// stays green without a live database (same discipline as the design spikes). Where a
// Postgres is available, it exercises the real durability boundary end-to-end.
func TestPostgresStoreIntegration(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("set DATABASE_URL to run the Postgres integration test")
	}
	ctx := context.Background()
	store, err := NewPostgresLedgerStore(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer store.Close()
	if err := store.Init(ctx); err != nil {
		t.Fatalf("init: %v", err)
	}

	tenant := fmt.Sprintf("t_pgtest_%d", time.Now().UnixNano())
	app := NewLedgerAppender(store, Options{FlushInterval: time.Millisecond, CheckpointEvery: 4})
	for i := 0; i < 8; i++ {
		if _, err := app.Append(sampleInput(tenant)); err != nil {
			t.Fatalf("append: %v", err)
		}
	}
	app.Close()

	recs, err := store.ReadRange(ctx, tenant, 0, 7)
	if err != nil {
		t.Fatalf("read range: %v", err)
	}
	cps, err := store.ReadCheckpoints(ctx, tenant)
	if err != nil {
		t.Fatalf("read checkpoints: %v", err)
	}
	if len(recs) != 8 {
		t.Fatalf("want 8 records, got %d", len(recs))
	}
	if !VerifyChain(recs, cps).OK {
		t.Fatal("chain+checkpoints did not verify against Postgres-backed store")
	}
}
