package approvals

import (
	"context"
	"errors"
	"sync"
	"time"
)

// MembershipChecker resolves whether a user belongs to a group (C7 identity in the
// full system). The v0.1 default denies all group membership, so only explicit usr_
// entries in reviewers.eligible count.
type MembershipChecker interface {
	IsMember(ctx context.Context, user, group string) bool
}

type denyGroups struct{}

func (denyGroups) IsMember(context.Context, string, string) bool { return false }

// DefaultTTLForTier: tier ≤ 2 expires in 24h, tier 3 in 72h (spec §3).
func DefaultTTLForTier(tier int) time.Duration {
	if tier >= 3 {
		return 72 * time.Hour
	}
	return 24 * time.Hour
}

// Options configures a Service. Zero values fall back to safe defaults.
type Options struct {
	Ledger     Ledger
	Membership MembershipChecker
	Now        func() time.Time
	TTLForTier func(tier int) time.Duration
	// PollInterval bounds how often a blocked Request re-checks TTL expiry while it
	// waits for a decision signal. Defaults to 250ms.
	PollInterval time.Duration
}

// Service owns the ApprovalObject lifecycle (C3).
type Service struct {
	store   Store
	ledger  Ledger
	members MembershipChecker
	now     func() time.Time
	ttl     func(tier int) time.Duration
	poll    time.Duration

	mu      sync.Mutex
	waiters map[string][]chan struct{} // approval id -> goroutines blocked in Request
}

// New constructs a Service over the given store.
func New(store Store, opts Options) *Service {
	s := &Service{
		store:   store,
		ledger:  opts.Ledger,
		members: opts.Membership,
		now:     opts.Now,
		ttl:     opts.TTLForTier,
		poll:    opts.PollInterval,
		waiters: map[string][]chan struct{}{},
	}
	if s.ledger == nil {
		s.ledger = NoopLedger{}
	}
	if s.members == nil {
		s.members = denyGroups{}
	}
	if s.now == nil {
		s.now = time.Now
	}
	if s.ttl == nil {
		s.ttl = DefaultTTLForTier
	}
	if s.poll <= 0 {
		s.poll = 250 * time.Millisecond
	}
	return s
}

// CreateInput is the action the gatekeeper wants signed off. Reviewers.Required and
// SecondMustDiffer are derived from Tier; Eligible comes from policy (C1).
type CreateInput struct {
	TenantID    string
	ActionRef   string
	Tier        int
	PayloadHash string
	Diff        Diff
	DryRunRef   *string
	Risk        Risk
	Eligible    []string
}

// Create mints a pending ApprovalObject and records its creation on the ledger.
func (s *Service) Create(ctx context.Context, in CreateInput) (ApprovalObject, error) {
	now := s.now().UTC()
	required := 1
	secondDiffer := false
	if in.Tier >= 3 {
		required = 2
		secondDiffer = true
	}
	obj := ApprovalObject{
		ID:             ApprovalID(),
		TenantID:       in.TenantID,
		ActionRef:      in.ActionRef,
		Tier:           in.Tier,
		PayloadHash:    in.PayloadHash,
		IdempotencyKey: IdempotencyKey(),
		Diff:           in.Diff,
		DryRunRef:      in.DryRunRef,
		Risk:           in.Risk,
		Reviewers:      Reviewers{Required: required, Eligible: in.Eligible, SecondMustDiffer: secondDiffer},
		ExpiresAt:      now.Add(s.ttl(in.Tier)).Format(time.RFC3339Nano),
		State:          StatePending,
	}
	ref, err := s.ledger.Record(ctx, LedgerEntry{
		TenantID: obj.TenantID, ApprovalID: obj.ID, ActionRef: obj.ActionRef,
		Transition: "created", PayloadHash: obj.PayloadHash, Effect: "deny", // pending ≠ permitted
	})
	if err != nil {
		return ApprovalObject{}, err // DP-3: no evidence, no object
	}
	obj.LedgerRefs = append(obj.LedgerRefs, ref)
	if err := s.store.Put(ctx, obj); err != nil {
		return ApprovalObject{}, err
	}
	return obj, nil
}

// DecideInput is one human decision arriving from a surface.
type DecideInput struct {
	ApprovalID      string
	Decision        DecisionKind
	By              string
	Surface         string
	PayloadHashSeen string
	Edits           any
}

// Decide applies one decision and advances the state machine. It is idempotent on a
// terminal object (returns the existing object unchanged).
func (s *Service) Decide(ctx context.Context, in DecideInput) (ApprovalObject, error) {
	s.mu.Lock()
	obj, err := s.store.Get(ctx, in.ApprovalID)
	if err != nil {
		s.mu.Unlock()
		return ApprovalObject{}, err
	}

	// Idempotent: a decision on an already-decided object is a no-op.
	if obj.State.terminalForC3() {
		s.mu.Unlock()
		return obj, nil
	}

	// TTL: if the object has aged out while pending, expire it now rather than accept
	// a late decision.
	if s.isExpired(obj) {
		next, _ := s.transition(ctx, obj, StateExpired, "expired", "", "", "deny")
		s.mu.Unlock()
		return next, nil
	}

	// Eligibility — an ineligible decider is rejected without touching state or quorum.
	if !s.eligible(ctx, obj, in.By) {
		s.mu.Unlock()
		return obj, ErrNotEligible
	}

	// GOV-004: the approver must have seen the exact payload that would execute.
	if in.PayloadHashSeen != obj.PayloadHash {
		obj.Decisions = append(obj.Decisions, s.decisionEntry(in))
		next, err := s.transition(ctx, obj, StateInvalidated, "invalidated", in.By, in.Surface, "deny")
		s.mu.Unlock()
		return next, err
	}

	obj.Decisions = append(obj.Decisions, s.decisionEntry(in))

	if in.Decision == DecisionRejected || in.Decision == DecisionRejectedWithEdit {
		next, err := s.transition(ctx, obj, StateRejected, "rejected", in.By, in.Surface, "deny")
		s.mu.Unlock()
		return next, err
	}

	// Approval: advance only when quorum of distinct eligible approvers is met.
	if s.quorumMet(obj) {
		next, err := s.transition(ctx, obj, StateApproved, "approved", in.By, in.Surface, "permit")
		s.mu.Unlock()
		return next, err
	}

	// Not yet — the decision is accepted and auditable, but quorum is unmet so the
	// object stays pending (awaiting the second approver). Record the decision (DP-3),
	// then persist without a state change.
	ref, err := s.ledger.Record(ctx, LedgerEntry{
		TenantID: obj.TenantID, ApprovalID: obj.ID, ActionRef: obj.ActionRef,
		Transition: "decision", By: in.By, Surface: in.Surface, PayloadHash: obj.PayloadHash, Effect: "deny",
	})
	if err != nil {
		s.mu.Unlock()
		return ApprovalObject{}, err
	}
	obj.LedgerRefs = append(obj.LedgerRefs, ref)
	if err := s.store.Put(ctx, obj); err != nil {
		s.mu.Unlock()
		return ApprovalObject{}, err
	}
	s.mu.Unlock()
	return obj, nil
}

// Outcome is what the gate returns to C2.
type Outcome struct {
	ApprovalID      string
	State           State
	Approved        bool
	By              string // the approver whose decision carried quorum, when approved
	PayloadHashSeen string
}

// Request is the gate C2 blocks on. It get-or-creates the pending object for the
// action and waits until the object is terminal or its TTL/ctx elapses.
func (s *Service) Request(ctx context.Context, in CreateInput) (Outcome, error) {
	obj, err := s.store.GetByAction(ctx, in.TenantID, in.ActionRef)
	if errors.Is(err, ErrNotFound) {
		obj, err = s.Create(ctx, in)
	}
	if err != nil {
		return Outcome{}, err
	}

	for {
		cur, err := s.store.Get(ctx, obj.ID)
		if err != nil {
			return Outcome{}, err
		}
		if cur.State.terminalForC3() {
			return outcomeOf(cur), nil
		}
		if s.isExpired(cur) {
			s.mu.Lock()
			next, _ := s.transition(ctx, cur, StateExpired, "expired", "", "", "deny")
			s.mu.Unlock()
			return outcomeOf(next), nil
		}

		// Register a waiter and block until a decision signals it, ctx is done, or the
		// poll interval elapses (so TTL is re-checked even with no decision activity).
		ch := s.register(obj.ID)
		select {
		case <-ch:
		case <-ctx.Done():
			s.unregister(obj.ID, ch)
			return Outcome{}, ctx.Err()
		case <-time.After(s.poll):
			s.unregister(obj.ID, ch)
		}
	}
}

// SweepExpired transitions any pending objects past their TTL to expired. A periodic
// caller (or escalation service) drives this; Request and Decide also expire lazily.
func (s *Service) SweepExpired(ctx context.Context, ids []string) {
	for _, id := range ids {
		s.mu.Lock()
		obj, err := s.store.Get(ctx, id)
		if err == nil && obj.State == StatePending && s.isExpired(obj) {
			_, _ = s.transition(ctx, obj, StateExpired, "expired", "", "", "deny")
		}
		s.mu.Unlock()
	}
}

// Get returns the current object (read-through to the store).
func (s *Service) Get(ctx context.Context, id string) (ApprovalObject, error) {
	return s.store.Get(ctx, id)
}

// GetByAction returns the live object for a tenant+action ref (read-through). Surfaces
// use this to render the pending approval for a proposed action.
func (s *Service) GetByAction(ctx context.Context, tenant, actionRef string) (ApprovalObject, error) {
	return s.store.GetByAction(ctx, tenant, actionRef)
}

// --- internals (callers hold s.mu where they mutate) ---

// transition records the ledger entry, persists the new state, and wakes waiters. A
// ledger failure fails the transition closed: state is not advanced.
func (s *Service) transition(ctx context.Context, obj ApprovalObject, to State, name, by, surface, effect string) (ApprovalObject, error) {
	ref, err := s.ledger.Record(ctx, LedgerEntry{
		TenantID: obj.TenantID, ApprovalID: obj.ID, ActionRef: obj.ActionRef,
		Transition: name, By: by, Surface: surface, PayloadHash: obj.PayloadHash, Effect: effect,
	})
	if err != nil {
		return obj, err
	}
	obj.State = to
	obj.LedgerRefs = append(obj.LedgerRefs, ref)
	if err := s.store.Put(ctx, obj); err != nil {
		return obj, err
	}
	s.wake(obj.ID)
	return obj, nil
}

func (s *Service) decisionEntry(in DecideInput) Decision {
	return Decision{
		Decision: in.Decision, By: in.By, Surface: in.Surface,
		At: s.now().UTC().Format(time.RFC3339Nano), PayloadHashSeen: in.PayloadHashSeen, Edits: in.Edits,
	}
}

func (s *Service) isExpired(obj ApprovalObject) bool {
	exp, err := time.Parse(time.RFC3339Nano, obj.ExpiresAt)
	if err != nil {
		return false
	}
	return s.now().After(exp)
}

// eligible reports whether by may decide: an exact usr_ match in eligible, or
// membership in an eligible grp_ (resolved by the MembershipChecker).
func (s *Service) eligible(ctx context.Context, obj ApprovalObject, by string) bool {
	for _, e := range obj.Reviewers.Eligible {
		if e == by {
			return true
		}
		if len(e) >= 4 && e[:4] == "grp_" && s.members.IsMember(ctx, by, e) {
			return true
		}
	}
	return false
}

// quorumMet counts distinct approving identities and compares against required. When
// SecondMustDiffer, distinctness already guarantees two different approvers.
func (s *Service) quorumMet(obj ApprovalObject) bool {
	seen := map[string]bool{}
	for _, d := range obj.Decisions {
		if d.Decision == DecisionApproved {
			seen[d.By] = true
		}
	}
	return len(seen) >= obj.Reviewers.Required
}

func outcomeOf(obj ApprovalObject) Outcome {
	o := Outcome{ApprovalID: obj.ID, State: obj.State, Approved: obj.State == StateApproved}
	// Surface the carrying approver's attested hash (the last approval).
	for i := len(obj.Decisions) - 1; i >= 0; i-- {
		if obj.Decisions[i].Decision == DecisionApproved {
			o.By = obj.Decisions[i].By
			o.PayloadHashSeen = obj.Decisions[i].PayloadHashSeen
			break
		}
	}
	return o
}

// --- waiter registry (blocking Request support) ---

func (s *Service) register(id string) chan struct{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	ch := make(chan struct{})
	s.waiters[id] = append(s.waiters[id], ch)
	return ch
}

func (s *Service) unregister(id string, ch chan struct{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	w := s.waiters[id]
	for i, c := range w {
		if c == ch {
			s.waiters[id] = append(w[:i], w[i+1:]...)
			break
		}
	}
	if len(s.waiters[id]) == 0 {
		delete(s.waiters, id)
	}
}

// wake closes every waiter for id (callers hold s.mu). Closed channels make blocked
// Requests re-check state; they re-register if still non-terminal.
func (s *Service) wake(id string) {
	for _, ch := range s.waiters[id] {
		close(ch)
	}
	delete(s.waiters, id)
}
