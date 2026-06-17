// Package approvals is C3 — the Approval Service. It owns the ApprovalObject
// lifecycle: the hash-pinned, TTL-bounded, append-only human-in-the-loop gate the
// gatekeeper (C2) blocks on for tiered actions.
// See docs/superpowers/specs/opsbench-platform/components/C3-approvals.md.
package approvals

import (
	"crypto/rand"
	"errors"
	"sync"
	"time"
)

// State is the ApprovalObject lifecycle state (spec 01-schemas §1).
type State string

const (
	StatePending     State = "pending"
	StateApproved    State = "approved"
	StateExecuting   State = "executing"
	StateExecuted    State = "executed"
	StateRejected    State = "rejected"
	StateInvalidated State = "invalidated"
	StateFailed      State = "failed"
	StateExpired     State = "expired"
)

// terminalForC3 reports whether the object can no longer accept decisions. The
// executing/executed/failed states are C2-driven post-approval and are also closed to
// new decisions.
func (s State) terminalForC3() bool {
	switch s {
	case StatePending:
		return false
	default:
		return true
	}
}

// DecisionKind is what a reviewer chose.
type DecisionKind string

const (
	DecisionApproved         DecisionKind = "approved"
	DecisionRejected         DecisionKind = "rejected"
	DecisionRejectedWithEdit DecisionKind = "rejected_with_edits"
)

// Diff is the human-readable, surface-renderable change preview.
type Diff struct {
	Format string `json:"format"` // "unified" | "structured"
	Body   string `json:"body"`
}

// Risk summarizes the action's blast radius for the reviewer.
type Risk struct {
	Irreversible bool     `json:"irreversible"`
	BlastRadius  string   `json:"blast_radius,omitempty"`
	PolicyRefs   []string `json:"policy_refs"`
}

// Reviewers is the quorum policy: how many distinct sign-offs and from whom.
type Reviewers struct {
	Required         int      `json:"required"` // 1 or 2
	Eligible         []string `json:"eligible"` // usr_ and/or grp_ ids
	SecondMustDiffer bool     `json:"second_must_differ"`
}

// Decision is one entry in the append-only decision log.
type Decision struct {
	Decision        DecisionKind `json:"decision"`
	By              string       `json:"by"`      // usr_...
	Surface         string       `json:"surface"` // slack|web|tui|mobile|teams|voice_dtmf
	At              string       `json:"at"`      // RFC3339Nano UTC
	PayloadHashSeen string       `json:"payload_hash_seen"`
	Edits           any          `json:"edits,omitempty"`
}

// ApprovalObject is the cross-surface approval record (schema approval-object.json).
type ApprovalObject struct {
	ID             string     `json:"id"`         // apr_<ULID>
	TenantID       string     `json:"tenant_id"`  // t_...
	ActionRef      string     `json:"action_ref"` // act_<ULID>
	Tier           int        `json:"tier"`
	PayloadHash    string     `json:"payload_hash"`    // sha256:... — the pinned artifact
	IdempotencyKey string     `json:"idempotency_key"` // idk_<ULID>
	Diff           Diff       `json:"diff"`
	DryRunRef      *string    `json:"dry_run_ref"`
	Risk           Risk       `json:"risk"`
	Reviewers      Reviewers  `json:"reviewers"`
	ExpiresAt      string     `json:"expires_at"`
	State          State      `json:"state"`
	Decisions      []Decision `json:"decisions"`
	LedgerRefs     []string   `json:"ledger_refs"`
}

// Errors surfaced by the service.
var (
	ErrNotFound   = errors.New("approvals: object not found")
	ErrWrongState = errors.New("approvals: object is not pending")
	ErrNotEligible = errors.New("approvals: decider is not an eligible reviewer")
)

// --- ID minting (Crockford base32 ULIDs, matching the schema id patterns) ---

const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

var idMu sync.Mutex

// ApprovalID returns "apr_<ULID>".
func ApprovalID() string { return "apr_" + ulid(time.Now()) }

// IdempotencyKey returns "idk_<ULID>".
func IdempotencyKey() string { return "idk_" + ulid(time.Now()) }

func ulid(t time.Time) string {
	idMu.Lock()
	defer idMu.Unlock()
	var b [16]byte
	ms := uint64(t.UnixMilli())
	b[0] = byte(ms >> 40)
	b[1] = byte(ms >> 32)
	b[2] = byte(ms >> 24)
	b[3] = byte(ms >> 16)
	b[4] = byte(ms >> 8)
	b[5] = byte(ms)
	_, _ = rand.Read(b[6:])
	return encodeULID(b)
}

// encodeULID renders 128 bits as the canonical 26-char ULID string.
func encodeULID(b [16]byte) string {
	out := make([]byte, 26)
	out[0] = crockford[(b[0]&224)>>5]
	out[1] = crockford[b[0]&31]
	out[2] = crockford[(b[1]&248)>>3]
	out[3] = crockford[((b[1]&7)<<2)|((b[2]&192)>>6)]
	out[4] = crockford[(b[2]&62)>>1]
	out[5] = crockford[((b[2]&1)<<4)|((b[3]&240)>>4)]
	out[6] = crockford[((b[3]&15)<<1)|((b[4]&128)>>7)]
	out[7] = crockford[(b[4]&124)>>2]
	out[8] = crockford[((b[4]&3)<<3)|((b[5]&224)>>5)]
	out[9] = crockford[b[5]&31]
	out[10] = crockford[(b[6]&248)>>3]
	out[11] = crockford[((b[6]&7)<<2)|((b[7]&192)>>6)]
	out[12] = crockford[(b[7]&62)>>1]
	out[13] = crockford[((b[7]&1)<<4)|((b[8]&240)>>4)]
	out[14] = crockford[((b[8]&15)<<1)|((b[9]&128)>>7)]
	out[15] = crockford[(b[9]&124)>>2]
	out[16] = crockford[((b[9]&3)<<3)|((b[10]&224)>>5)]
	out[17] = crockford[b[10]&31]
	out[18] = crockford[(b[11]&248)>>3]
	out[19] = crockford[((b[11]&7)<<2)|((b[12]&192)>>6)]
	out[20] = crockford[(b[12]&62)>>1]
	out[21] = crockford[((b[12]&1)<<4)|((b[13]&240)>>4)]
	out[22] = crockford[((b[13]&15)<<1)|((b[14]&128)>>7)]
	out[23] = crockford[(b[14]&124)>>2]
	out[24] = crockford[((b[14]&3)<<3)|((b[15]&224)>>5)]
	out[25] = crockford[b[15]&31]
	return string(out)
}
