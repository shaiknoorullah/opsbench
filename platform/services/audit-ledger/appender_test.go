package auditledger

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

// appendN fires n concurrent appends and returns receipts (failing the test on error).
func appendN(t *testing.T, app *LedgerAppender, in AppendInput, n int) []DurableReceipt {
	t.Helper()
	var wg sync.WaitGroup
	res := make([]DurableReceipt, n)
	errs := make([]error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			res[i], errs[i] = app.Append(in)
		}(i)
	}
	wg.Wait()
	for _, e := range errs {
		if e != nil {
			t.Fatalf("append error: %v", e)
		}
	}
	return res
}

func TestAppenderHappyPathVerifies(t *testing.T) {
	store := NewMemoryLedgerStore()
	app := NewLedgerAppender(store, Options{FlushInterval: 50 * time.Millisecond})
	appendN(t, app, sampleInput("t_acme"), 8)
	app.Close()

	recs, _ := store.ReadRange(context.Background(), "t_acme", 0, 7)
	if len(recs) != 8 {
		t.Fatalf("want 8 records, got %d", len(recs))
	}
	if !VerifyChain(recs, nil).OK {
		t.Fatal("chain did not verify")
	}
}

// countingStore counts AppendBatch calls to prove batching.
type countingStore struct {
	*MemoryLedgerStore
	mu      sync.Mutex
	batches int
}

func (c *countingStore) AppendBatch(ctx context.Context, tenant string, recs []AuditRecord) error {
	c.mu.Lock()
	c.batches++
	c.mu.Unlock()
	return c.MemoryLedgerStore.AppendBatch(ctx, tenant, recs)
}

func TestAppenderBatchesIntoOneTransaction(t *testing.T) {
	store := &countingStore{MemoryLedgerStore: NewMemoryLedgerStore()}
	app := NewLedgerAppender(store, Options{FlushInterval: 100 * time.Millisecond})
	appendN(t, app, sampleInput("t_acme"), 10)
	app.Close()
	if store.batches != 1 {
		t.Fatalf("want 1 batch for 10 concurrent appends, got %d", store.batches)
	}
}

// blockingStore lets a test pause inside AppendBatch to exercise backpressure.
type blockingStore struct {
	*MemoryLedgerStore
	entered chan struct{}
	release chan struct{}
}

func (b *blockingStore) AppendBatch(ctx context.Context, tenant string, recs []AuditRecord) error {
	select {
	case b.entered <- struct{}{}: // signal the first entry; later calls skip
	default:
	}
	<-b.release // after close(release) this returns immediately for every call
	return b.MemoryLedgerStore.AppendBatch(ctx, tenant, recs)
}

func TestBackpressureRejectsWhenQueueFull(t *testing.T) {
	store := &blockingStore{MemoryLedgerStore: NewMemoryLedgerStore(), entered: make(chan struct{}), release: make(chan struct{})}
	app := NewLedgerAppender(store, Options{FlushInterval: time.Millisecond, MaxBatch: 1, MaxPending: 2})

	// First append: worker reads it and blocks inside AppendBatch.
	go func() { _, _ = app.Append(sampleInput("t_acme")) }()
	<-store.entered // worker is now stuck flushing; it will not drain the queue

	// Fill the pending queue (cap 2), then the next submit must be rejected.
	go func() { _, _ = app.Append(sampleInput("t_acme")) }()
	go func() { _, _ = app.Append(sampleInput("t_acme")) }()
	time.Sleep(50 * time.Millisecond) // let the two enqueue

	_, err := app.Append(sampleInput("t_acme"))
	if !errors.Is(err, ErrBackpressure) {
		t.Fatalf("want ErrBackpressure, got %v", err)
	}

	close(store.release) // let everything drain
	app.Close()
}

// failingStore always errors on AppendBatch.
type failingStore struct{ *MemoryLedgerStore }

func (f *failingStore) AppendBatch(context.Context, string, []AuditRecord) error {
	return errors.New("db down")
}

func TestFailClosedOnStoreError(t *testing.T) {
	app := NewLedgerAppender(&failingStore{NewMemoryLedgerStore()}, Options{FlushInterval: time.Millisecond})
	_, err := app.Append(sampleInput("t_acme"))
	if err == nil || err.Error() != "db down" {
		t.Fatalf("want store error surfaced to caller, got %v", err)
	}
	app.Close()
}

func TestCheckpointsSealAndVerify(t *testing.T) {
	store := NewMemoryLedgerStore()
	app := NewLedgerAppender(store, Options{FlushInterval: 50 * time.Millisecond, CheckpointEvery: 4})
	appendN(t, app, sampleInput("t_acme"), 8)
	app.Close()

	cps, _ := store.ReadCheckpoints(context.Background(), "t_acme")
	if len(cps) != 2 {
		t.Fatalf("want 2 checkpoints, got %d", len(cps))
	}
	if cps[0].FromSeq != 0 || cps[0].ToSeq != 3 || cps[1].FromSeq != 4 || cps[1].ToSeq != 7 {
		t.Fatalf("checkpoint ranges wrong: %+v", cps)
	}
	recs, _ := store.ReadRange(context.Background(), "t_acme", 0, 7)
	if !VerifyChain(recs, cps).OK {
		t.Fatal("chain+checkpoints did not verify")
	}
}

func TestTenantChainsAreIndependent(t *testing.T) {
	store := NewMemoryLedgerStore()
	app := NewLedgerAppender(store, Options{FlushInterval: 50 * time.Millisecond})
	var wg sync.WaitGroup
	for _, tn := range []string{"t_a", "t_b", "t_a"} {
		wg.Add(1)
		go func(tn string) { defer wg.Done(); _, _ = app.Append(sampleInput(tn)) }(tn)
	}
	wg.Wait()
	app.Close()

	a, _ := store.ReadRange(context.Background(), "t_a", 0, 99)
	b, _ := store.ReadRange(context.Background(), "t_b", 0, 99)
	if len(a) != 2 || len(b) != 1 {
		t.Fatalf("want a=2 b=1, got a=%d b=%d", len(a), len(b))
	}
	if !VerifyChain(a, nil).OK || !VerifyChain(b, nil).OK {
		t.Fatal("per-tenant chains did not verify")
	}
	if a[0].Hash == b[0].Hash {
		t.Fatal("distinct tenants produced identical genesis hash")
	}
}

func TestHeadReloadAcrossInstances(t *testing.T) {
	store := NewMemoryLedgerStore()
	a1 := NewLedgerAppender(store, Options{FlushInterval: time.Millisecond})
	if _, err := a1.Append(sampleInput("t_acme")); err != nil {
		t.Fatal(err)
	}
	a1.Close()

	a2 := NewLedgerAppender(store, Options{FlushInterval: time.Millisecond})
	r, err := a2.Append(sampleInput("t_acme"))
	if err != nil {
		t.Fatal(err)
	}
	a2.Close()
	if r.Seq != 1 {
		t.Fatalf("want seq 1 after restart, got %d", r.Seq)
	}
	recs, _ := store.ReadRange(context.Background(), "t_acme", 0, 9)
	if !VerifyChain(recs, nil).OK {
		t.Fatal("chain across restart did not verify")
	}
}
