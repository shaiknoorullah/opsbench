package auditledger

import (
	"context"
	"fmt"
	"sort"
	"sync"
)

// MemoryLedgerStore is an in-memory LedgerStore for unit tests and as the reference
// semantics for the Postgres store. It enforces the same contiguity + chain-link
// invariants a real store must.
type MemoryLedgerStore struct {
	mu          sync.Mutex
	chains      map[string][]AuditRecord
	checkpoints map[string][]Checkpoint
}

func NewMemoryLedgerStore() *MemoryLedgerStore {
	return &MemoryLedgerStore{
		chains:      make(map[string][]AuditRecord),
		checkpoints: make(map[string][]Checkpoint),
	}
}

func (s *MemoryLedgerStore) Head(_ context.Context, tenant string) (*ChainHead, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	chain := s.chains[tenant]
	if len(chain) == 0 {
		return nil, nil
	}
	last := chain[len(chain)-1]
	return &ChainHead{Seq: last.Seq, Hash: last.Hash}, nil
}

func (s *MemoryLedgerStore) AppendBatch(_ context.Context, tenant string, records []AuditRecord) error {
	if len(records) == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	chain := s.chains[tenant]
	var expectedSeq int64
	prevHash := ZeroDigest
	if len(chain) > 0 {
		last := chain[len(chain)-1]
		expectedSeq = last.Seq + 1
		prevHash = last.Hash
	}
	for _, r := range records {
		if r.Seq != expectedSeq {
			return fmt.Errorf("non-contiguous append for %s: expected seq %d, got %d", tenant, expectedSeq, r.Seq)
		}
		if r.PrevHash != prevHash {
			return fmt.Errorf("broken chain link for %s at seq %d", tenant, r.Seq)
		}
		expectedSeq++
		prevHash = r.Hash
	}
	// Atomic: only mutate after the whole batch validates.
	s.chains[tenant] = append(chain, records...)
	return nil
}

func (s *MemoryLedgerStore) ReadRange(_ context.Context, tenant string, fromSeq, toSeq int64) ([]AuditRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []AuditRecord
	for _, r := range s.chains[tenant] {
		if r.Seq >= fromSeq && r.Seq <= toSeq {
			out = append(out, r)
		}
	}
	return out, nil
}

func (s *MemoryLedgerStore) PutCheckpoint(_ context.Context, cp Checkpoint) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	list := append(s.checkpoints[cp.TenantID], cp)
	sort.Slice(list, func(i, j int) bool { return list[i].FromSeq < list[j].FromSeq })
	s.checkpoints[cp.TenantID] = list
	return nil
}

func (s *MemoryLedgerStore) ReadCheckpoints(_ context.Context, tenant string) ([]Checkpoint, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Checkpoint(nil), s.checkpoints[tenant]...), nil
}
