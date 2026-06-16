package auditledger

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

// ErrBackpressure is returned when a tenant's pending queue is full — the caller
// must treat this as a denial (fail-closed), never a silent drop.
var ErrBackpressure = errors.New("audit ledger backpressure: tenant pending queue full")

// ErrClosed is returned when appending to a closed appender.
var ErrClosed = errors.New("audit ledger appender is closed")

// Options configure the appender. Zero values fall back to sensible defaults.
type Options struct {
	FlushInterval   time.Duration // batch window; default 3ms
	MaxBatch        int           // max records per transaction; default 256
	MaxPending      int           // per-tenant queue depth before backpressure; default 10000
	CheckpointEvery int64         // Merkle checkpoint block size; default 1024
	MakeID          func() string // id factory; default LedgerID
	Now             func() time.Time
}

func (o Options) withDefaults() Options {
	if o.FlushInterval <= 0 {
		o.FlushInterval = 3 * time.Millisecond
	}
	if o.MaxBatch <= 0 {
		o.MaxBatch = 256
	}
	if o.MaxPending <= 0 {
		o.MaxPending = 10_000
	}
	if o.CheckpointEvery <= 0 {
		o.CheckpointEvery = 1024
	}
	if o.Now == nil {
		o.Now = time.Now
	}
	return o
}

type appendReq struct {
	input AppendInput
	reply chan appendResult
}

type appendResult struct {
	receipt DurableReceipt
	err     error
}

type tenantWorker struct {
	ch chan appendReq
}

// LedgerAppender is the batched single-writer per tenant chain (C5 design §4). One
// goroutine per tenant assigns seq + chain links in arrival order and flushes a batch
// in one transaction, resolving each caller only on durable commit.
type LedgerAppender struct {
	store LedgerStore
	opts  Options

	mu      sync.Mutex
	workers map[string]*tenantWorker
	closed  bool
	wg      sync.WaitGroup
}

func NewLedgerAppender(store LedgerStore, opts Options) *LedgerAppender {
	return &LedgerAppender{
		store:   store,
		opts:    opts.withDefaults(),
		workers: make(map[string]*tenantWorker),
	}
}

// Append submits a record and blocks until it is durably committed (or rejected).
func (a *LedgerAppender) Append(in AppendInput) (DurableReceipt, error) {
	if in.TenantID == "" {
		return DurableReceipt{}, errors.New("append: tenant_id is required")
	}
	a.mu.Lock()
	if a.closed {
		a.mu.Unlock()
		return DurableReceipt{}, ErrClosed
	}
	w := a.workerFor(in.TenantID)
	reply := make(chan appendResult, 1)
	select {
	case w.ch <- appendReq{input: in, reply: reply}:
		a.mu.Unlock()
	default:
		a.mu.Unlock()
		return DurableReceipt{}, fmt.Errorf("%w (tenant %s)", ErrBackpressure, in.TenantID)
	}
	res := <-reply
	return res.receipt, res.err
}

// Close flushes all pending records and stops the workers.
func (a *LedgerAppender) Close() {
	a.mu.Lock()
	if a.closed {
		a.mu.Unlock()
		return
	}
	a.closed = true
	for _, w := range a.workers {
		close(w.ch)
	}
	a.mu.Unlock()
	a.wg.Wait()
}

// workerFor returns (creating + starting) the worker for a tenant. Caller holds mu.
func (a *LedgerAppender) workerFor(tenant string) *tenantWorker {
	if w, ok := a.workers[tenant]; ok {
		return w
	}
	w := &tenantWorker{ch: make(chan appendReq, a.opts.MaxPending)}
	a.workers[tenant] = w
	a.wg.Add(1)
	go a.run(tenant, w)
	return w
}

func (a *LedgerAppender) run(tenant string, w *tenantWorker) {
	defer a.wg.Done()
	ctx := context.Background()
	var head *ChainHead
	headLoaded := false
	lastCheckpointSeq := int64(-1)
	cpLoaded := false

	for {
		first, ok := <-w.ch
		if !ok {
			return // channel closed and drained
		}
		batch := []appendReq{first}

		// Collect more arrivals within the flush window, up to MaxBatch.
		timer := time.NewTimer(a.opts.FlushInterval)
	collect:
		for len(batch) < a.opts.MaxBatch {
			select {
			case req, ok := <-w.ch:
				if !ok {
					break collect // closing; commit what we have, loop exits next read
				}
				batch = append(batch, req)
			case <-timer.C:
				break collect
			}
		}
		timer.Stop()

		if !headLoaded {
			h, err := a.store.Head(ctx, tenant)
			if err != nil {
				failBatch(batch, err)
				continue
			}
			head = h
			headLoaded = true
		}
		if !cpLoaded {
			cps, err := a.store.ReadCheckpoints(ctx, tenant)
			if err != nil {
				failBatch(batch, err)
				continue
			}
			if len(cps) > 0 {
				lastCheckpointSeq = cps[len(cps)-1].ToSeq
			}
			cpLoaded = true
		}

		seq := int64(0)
		prevHash := ZeroDigest
		if head != nil {
			seq = head.Seq + 1
			prevHash = head.Hash
		}
		records := make([]AuditRecord, 0, len(batch))
		sealErr := error(nil)
		for _, req := range batch {
			rec, err := SealRecord(req.input, seq, prevHash, a.opts.MakeID)
			if err != nil {
				sealErr = err
				break
			}
			records = append(records, rec)
			prevHash = rec.Hash
			seq++
		}
		if sealErr != nil {
			failBatch(batch, sealErr)
			continue
		}

		if err := a.store.AppendBatch(ctx, tenant, records); err != nil {
			failBatch(batch, err) // head unchanged -> next batch re-chains from real head
			continue
		}

		last := records[len(records)-1]
		head = &ChainHead{Seq: last.Seq, Hash: last.Hash}
		committedAt := a.opts.Now().UTC().Format(time.RFC3339Nano)
		for i, req := range batch {
			req.reply <- appendResult{receipt: DurableReceipt{
				TenantID:    tenant,
				Seq:         records[i].Seq,
				ID:          records[i].ID,
				Hash:        records[i].Hash,
				CommittedAt: committedAt,
			}}
		}

		// Off the caller's latency path (replies already sent): seal completed blocks.
		lastCheckpointSeq = a.maybeCheckpoint(ctx, tenant, head, lastCheckpointSeq)
	}
}

func (a *LedgerAppender) maybeCheckpoint(ctx context.Context, tenant string, head *ChainHead, lastCheckpointSeq int64) int64 {
	for lastCheckpointSeq+a.opts.CheckpointEvery <= head.Seq {
		from := lastCheckpointSeq + 1
		to := from + a.opts.CheckpointEvery - 1
		block, err := a.store.ReadRange(ctx, tenant, from, to)
		if err != nil {
			break
		}
		hashes := make([]string, len(block))
		for i, r := range block {
			hashes[i] = r.Hash
		}
		root, err := MerkleRoot(hashes)
		if err != nil {
			break
		}
		cp := Checkpoint{
			TenantID:  tenant,
			FromSeq:   from,
			ToSeq:     to,
			Root:      root,
			CreatedAt: a.opts.Now().UTC().Format(time.RFC3339Nano),
		}
		if err := a.store.PutCheckpoint(ctx, cp); err != nil {
			break // a checkpoint failure must not unwind committed records; retry later
		}
		lastCheckpointSeq = to
	}
	return lastCheckpointSeq
}

func failBatch(batch []appendReq, err error) {
	for _, req := range batch {
		req.reply <- appendResult{err: err}
	}
}
