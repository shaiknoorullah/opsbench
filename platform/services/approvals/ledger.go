package approvals

import (
	"context"
	"sync"
)

// LedgerEntry is what C3 records on every state transition (DP-3: evidence or it
// didn't happen). The C5 adapter maps this onto the tamper-evident chain.
type LedgerEntry struct {
	TenantID    string
	ApprovalID  string
	ActionRef   string
	Transition  string // e.g. "created", "approved", "rejected", "invalidated", "expired"
	By          string // deciding identity, where applicable
	Surface     string
	PayloadHash string
	Effect      string // "permit" for approved, "deny" otherwise — mirrors the gatekeeper decision vocab
}

// Ledger records approval transitions durably. A record failure must fail the
// transition closed (NF-005), so Record returns an error the service honors.
type Ledger interface {
	Record(ctx context.Context, e LedgerEntry) (ref string, err error)
}

// NoopLedger discards records. NOT for production — it defeats DP-3; it exists only
// for narrow unit tests that assert state-machine behavior in isolation.
type NoopLedger struct{}

func (NoopLedger) Record(context.Context, LedgerEntry) (string, error) { return "", nil }

// CapturingLedger records into memory for assertions.
type CapturingLedger struct {
	mu      sync.Mutex
	entries []LedgerEntry
	n       int
}

func (c *CapturingLedger) Record(_ context.Context, e LedgerEntry) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.n++
	c.entries = append(c.entries, e)
	return "led_capture", nil
}

// Entries returns a copy of the recorded entries.
func (c *CapturingLedger) Entries() []LedgerEntry {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make([]LedgerEntry, len(c.entries))
	copy(out, c.entries)
	return out
}
