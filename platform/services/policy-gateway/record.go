package policygateway

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	auditledger "github.com/shaiknoorullah/opsbench/platform/services/audit-ledger"
)

// Phase is the enforcement point a decision was made at (PRD GOV-002 dual enforcement).
type Phase string

const (
	PhaseInvocation  Phase = "invocation"   // per-call authorization
	PhaseToolListing Phase = "tool_listing" // filtering forbidden tools out of tool lists
)

// PolicyDecisionRecord is the normalized, engine-agnostic record of one decision
// (schema: platform/packages/schemas/json/policy-decision-record.json). Identical
// (principal, action, resource, context_hash) MUST yield an identical effect.
type PolicyDecisionRecord struct {
	ID          string   `json:"id"`       // pdr_<ULID>
	TenantID    string   `json:"tenant_id"`
	Principal   string   `json:"principal"`
	Action      string   `json:"action"`
	Resource    string   `json:"resource"`
	ContextHash string   `json:"context_hash"` // sha256 of the canonical evaluated context (A9)
	Effect      string   `json:"effect"`       // permit | deny
	Engine      Engine   `json:"engine"`
	PolicyRefs  []string `json:"policy_refs,omitempty"`
	EvaluatedAt string   `json:"evaluated_at"`
	LatencyMS   float64  `json:"latency_ms"`
	Phase       Phase    `json:"phase"`
}

// Engine identifies the policy engine that produced the decision.
type Engine struct {
	Kind    string `json:"kind"` // "cedar"
	Version string `json:"version"`
}

// Recorder persists a decision record to the audit ledger (C5). Record MUST return
// only on durable commit; an error means the caller fails closed (DP-3: no evidence
// -> no action). "permit recorded before any effect" is enforced by recording here,
// before the decision is returned to the gatekeeper.
type Recorder interface {
	Record(ctx context.Context, rec PolicyDecisionRecord) error
}

// Service composes the Cedar engine with a Recorder: it decides, durably records the
// PolicyDecisionRecord, and only then returns the decision (with its record id).
type Service struct {
	engine   *CedarEngine
	recorder Recorder
	tenantID string
	now      func() time.Time
	newID    func() string
}

// Option configures a Service (clock/id injection for deterministic tests).
type Option func(*Service)

// WithClock overrides the timestamp source.
func WithClock(f func() time.Time) Option { return func(s *Service) { s.now = f } }

// WithIDGen overrides the decision-record id generator.
func WithIDGen(f func() string) Option { return func(s *Service) { s.newID = f } }

// NewService builds a decision service for one tenant.
func NewService(engine *CedarEngine, recorder Recorder, tenantID string, opts ...Option) *Service {
	s := &Service{engine: engine, recorder: recorder, tenantID: tenantID, now: time.Now, newID: newDecisionRecordID}
	for _, o := range opts {
		o(s)
	}
	return s
}

// Authorize evaluates the request, records the PolicyDecisionRecord to the ledger
// (fail-closed: a record error aborts with no usable decision, DP-3), and returns the
// decision with DecisionRecordID set.
func (s *Service) Authorize(ctx context.Context, r Request, phase Phase) (Decision, error) {
	start := s.now()
	d := s.engine.Decide(r)
	latencyMS := float64(s.now().Sub(start).Microseconds()) / 1000.0

	ctxHash, err := contextHash(r.Context)
	if err != nil {
		return Decision{}, fmt.Errorf("policygateway: hash context: %w", err)
	}

	rec := PolicyDecisionRecord{
		ID:          s.newID(),
		TenantID:    s.tenantID,
		Principal:   r.Principal,
		Action:      r.Action,
		Resource:    r.Resource,
		ContextHash: ctxHash,
		Effect:      d.Effect,
		Engine:      Engine{Kind: EngineKind, Version: s.engine.Version()},
		PolicyRefs:  d.PolicyRefs,
		EvaluatedAt: start.UTC().Format(time.RFC3339),
		LatencyMS:   latencyMS,
		Phase:       phase,
	}
	if err := s.recorder.Record(ctx, rec); err != nil {
		return Decision{}, fmt.Errorf("policygateway: record decision (fail-closed): %w", err)
	}
	d.DecisionRecordID = rec.ID
	return d, nil
}

// contextHash is sha256 over the canonical JSON of the evaluated context. It reuses
// C5's Canonicalize so the digest is byte-identical to the audit ledger's (A9).
func contextHash(attrs map[string]any) (string, error) {
	if attrs == nil {
		attrs = map[string]any{}
	}
	canon, err := auditledger.Canonicalize(attrs)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canon)
	return hex.EncodeToString(sum[:]), nil
}

// MemoryRecorder is an in-memory Recorder for tests and local runs.
type MemoryRecorder struct {
	mu      sync.Mutex
	Records []PolicyDecisionRecord
}

// Record appends the decision record.
func (m *MemoryRecorder) Record(_ context.Context, rec PolicyDecisionRecord) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Records = append(m.Records, rec)
	return nil
}
