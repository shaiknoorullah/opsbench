package approvals

import (
	"context"
	"sync"
)

// Store persists ApprovalObjects. The memory implementation is v0.1; a durable
// Postgres store (mirroring C5's LedgerStore) is the documented drop-in.
type Store interface {
	// Get returns the object by id, or ErrNotFound.
	Get(ctx context.Context, id string) (ApprovalObject, error)
	// GetByAction returns the live (non-expired) object for a tenant+action_ref, used
	// to make Request idempotent. Returns ErrNotFound when none exists.
	GetByAction(ctx context.Context, tenant, actionRef string) (ApprovalObject, error)
	// Put upserts the object (the service owns all state transitions).
	Put(ctx context.Context, obj ApprovalObject) error
}

// MemoryStore is an in-memory Store for v0.1 and tests.
type MemoryStore struct {
	mu      sync.RWMutex
	byID    map[string]ApprovalObject
	byAction map[string]string // "tenant\x00action_ref" -> approval id
}

// NewMemoryStore returns an empty MemoryStore.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{byID: map[string]ApprovalObject{}, byAction: map[string]string{}}
}

func actionKey(tenant, actionRef string) string { return tenant + "\x00" + actionRef }

func (s *MemoryStore) Get(_ context.Context, id string) (ApprovalObject, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	obj, ok := s.byID[id]
	if !ok {
		return ApprovalObject{}, ErrNotFound
	}
	return obj, nil
}

func (s *MemoryStore) GetByAction(_ context.Context, tenant, actionRef string) (ApprovalObject, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	id, ok := s.byAction[actionKey(tenant, actionRef)]
	if !ok {
		return ApprovalObject{}, ErrNotFound
	}
	return s.byID[id], nil
}

func (s *MemoryStore) Put(_ context.Context, obj ApprovalObject) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.byID[obj.ID] = obj
	s.byAction[actionKey(obj.TenantID, obj.ActionRef)] = obj.ID
	return nil
}
