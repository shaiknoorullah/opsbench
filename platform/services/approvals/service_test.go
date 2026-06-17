package approvals

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	auditledger "github.com/shaiknoorullah/opsbench/platform/services/audit-ledger"
)

const (
	hashA = "sha256:aaaa000000000000000000000000000000000000000000000000000000000000"
	hashB = "sha256:bbbb000000000000000000000000000000000000000000000000000000000000"
)

// fakeClock is a controllable time source for TTL tests.
type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}
func (c *fakeClock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

func tier2Input() CreateInput {
	return CreateInput{
		TenantID: "t_acme", ActionRef: "act_01HZZZZZZZZZZZZZZZZZZZZZZZ", Tier: 2,
		PayloadHash: hashA, Diff: Diff{Format: "unified", Body: "- a\n+ b"},
		Eligible: []string{"usr_alice", "usr_bob"},
	}
}

func tier3Input() CreateInput {
	in := tier2Input()
	in.Tier = 3
	in.Risk = Risk{Irreversible: true}
	return in
}

func newSvc(t *testing.T, l Ledger) (*Service, *MemoryStore) {
	t.Helper()
	store := NewMemoryStore()
	return New(store, Options{Ledger: l, PollInterval: 5 * time.Millisecond}), store
}

func TestSingleApprovalApproves(t *testing.T) {
	lg := &CapturingLedger{}
	s, _ := newSvc(t, lg)
	ctx := context.Background()

	obj, err := s.Create(ctx, tier2Input())
	if err != nil {
		t.Fatal(err)
	}
	if obj.State != StatePending || obj.Reviewers.Required != 1 {
		t.Fatalf("unexpected fresh object: state=%s required=%d", obj.State, obj.Reviewers.Required)
	}

	out, err := s.Decide(ctx, DecideInput{ApprovalID: obj.ID, Decision: DecisionApproved, By: "usr_alice", Surface: "web", PayloadHashSeen: hashA})
	if err != nil {
		t.Fatal(err)
	}
	if out.State != StateApproved {
		t.Fatalf("want approved, got %s", out.State)
	}
	// created + approved => 2 ledger records
	if got := len(lg.Entries()); got != 2 {
		t.Fatalf("want 2 ledger entries, got %d", got)
	}
}

func TestGOV004HashMismatchInvalidates(t *testing.T) {
	s, _ := newSvc(t, &CapturingLedger{})
	ctx := context.Background()
	obj, _ := s.Create(ctx, tier2Input())

	out, err := s.Decide(ctx, DecideInput{ApprovalID: obj.ID, Decision: DecisionApproved, By: "usr_alice", PayloadHashSeen: hashB})
	if err != nil {
		t.Fatal(err)
	}
	if out.State != StateInvalidated {
		t.Fatalf("want invalidated on hash mismatch, got %s", out.State)
	}
	if len(out.Decisions) != 1 {
		t.Fatalf("the mismatching decision must still be appended; got %d", len(out.Decisions))
	}
}

func TestRejectionRejects(t *testing.T) {
	s, _ := newSvc(t, &CapturingLedger{})
	ctx := context.Background()
	obj, _ := s.Create(ctx, tier2Input())
	out, _ := s.Decide(ctx, DecideInput{ApprovalID: obj.ID, Decision: DecisionRejected, By: "usr_bob", PayloadHashSeen: hashA})
	if out.State != StateRejected {
		t.Fatalf("want rejected, got %s", out.State)
	}
}

func TestTierThreeNeedsTwoDistinctApprovers(t *testing.T) {
	s, _ := newSvc(t, &CapturingLedger{})
	ctx := context.Background()
	obj, _ := s.Create(ctx, tier3Input())
	if obj.Reviewers.Required != 2 || !obj.Reviewers.SecondMustDiffer {
		t.Fatalf("tier 3 must require 2 distinct: %+v", obj.Reviewers)
	}

	// First approval -> still pending.
	out, _ := s.Decide(ctx, DecideInput{ApprovalID: obj.ID, Decision: DecisionApproved, By: "usr_alice", PayloadHashSeen: hashA})
	if out.State != StatePending {
		t.Fatalf("after one approval want pending, got %s", out.State)
	}

	// Same identity approving again -> still pending (no distinct quorum).
	out, _ = s.Decide(ctx, DecideInput{ApprovalID: obj.ID, Decision: DecisionApproved, By: "usr_alice", PayloadHashSeen: hashA})
	if out.State != StatePending {
		t.Fatalf("duplicate approver must not advance quorum; got %s", out.State)
	}

	// Distinct second approver -> approved.
	out, _ = s.Decide(ctx, DecideInput{ApprovalID: obj.ID, Decision: DecisionApproved, By: "usr_bob", PayloadHashSeen: hashA})
	if out.State != StateApproved {
		t.Fatalf("two distinct approvers must approve; got %s", out.State)
	}
}

func TestIneligibleDeciderRejected(t *testing.T) {
	s, _ := newSvc(t, &CapturingLedger{})
	ctx := context.Background()
	obj, _ := s.Create(ctx, tier2Input())
	_, err := s.Decide(ctx, DecideInput{ApprovalID: obj.ID, Decision: DecisionApproved, By: "usr_eve", PayloadHashSeen: hashA})
	if !errors.Is(err, ErrNotEligible) {
		t.Fatalf("want ErrNotEligible, got %v", err)
	}
	cur, _ := s.Get(ctx, obj.ID)
	if cur.State != StatePending || len(cur.Decisions) != 0 {
		t.Fatalf("ineligible decision must not touch state/log: %s decisions=%d", cur.State, len(cur.Decisions))
	}
}

// groupChecker approves membership for one fixed (user, group) pair.
type groupChecker struct{ user, group string }

func (g groupChecker) IsMember(_ context.Context, u, grp string) bool {
	return u == g.user && grp == g.group
}

func TestEligibilityViaGroupMembership(t *testing.T) {
	store := NewMemoryStore()
	s := New(store, Options{Membership: groupChecker{user: "usr_carol", group: "grp_sre"}})
	ctx := context.Background()
	in := tier2Input()
	in.Eligible = []string{"grp_sre"}
	obj, _ := s.Create(ctx, in)

	out, err := s.Decide(ctx, DecideInput{ApprovalID: obj.ID, Decision: DecisionApproved, By: "usr_carol", PayloadHashSeen: hashA})
	if err != nil || out.State != StateApproved {
		t.Fatalf("group member should approve: state=%s err=%v", out.State, err)
	}
}

func TestTTLExpires(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_700_000_000, 0).UTC()}
	store := NewMemoryStore()
	s := New(store, Options{Now: clk.now, PollInterval: 5 * time.Millisecond})
	ctx := context.Background()
	obj, _ := s.Create(ctx, tier2Input()) // 24h TTL

	clk.advance(25 * time.Hour)
	out, _ := s.Decide(ctx, DecideInput{ApprovalID: obj.ID, Decision: DecisionApproved, By: "usr_alice", PayloadHashSeen: hashA})
	if out.State != StateExpired {
		t.Fatalf("a decision past TTL must expire, not approve; got %s", out.State)
	}
}

func TestIdempotentDecisionOnTerminal(t *testing.T) {
	s, _ := newSvc(t, &CapturingLedger{})
	ctx := context.Background()
	obj, _ := s.Create(ctx, tier2Input())
	first, _ := s.Decide(ctx, DecideInput{ApprovalID: obj.ID, Decision: DecisionApproved, By: "usr_alice", PayloadHashSeen: hashA})
	// A second decision is a no-op returning the existing object.
	second, err := s.Decide(ctx, DecideInput{ApprovalID: obj.ID, Decision: DecisionRejected, By: "usr_bob", PayloadHashSeen: hashA})
	if err != nil {
		t.Fatal(err)
	}
	if second.State != StateApproved || len(second.Decisions) != len(first.Decisions) {
		t.Fatalf("decision on terminal object must be a no-op; got %s decisions=%d", second.State, len(second.Decisions))
	}
}

func TestRequestBlocksUntilDecision(t *testing.T) {
	s, _ := newSvc(t, &CapturingLedger{})
	ctx := context.Background()
	in := tier2Input()
	created, _ := s.Create(ctx, in)

	go func() {
		time.Sleep(20 * time.Millisecond)
		_, _ = s.Decide(ctx, DecideInput{ApprovalID: created.ID, Decision: DecisionApproved, By: "usr_alice", PayloadHashSeen: hashA})
	}()

	out, err := s.Request(ctx, in) // rejoins the existing object, blocks
	if err != nil {
		t.Fatal(err)
	}
	if !out.Approved || out.By != "usr_alice" || out.PayloadHashSeen != hashA {
		t.Fatalf("blocked Request should return the approval: %+v", out)
	}
}

func TestRequestIsIdempotentPerAction(t *testing.T) {
	s, store := newSvc(t, &CapturingLedger{})
	ctx := context.Background()
	in := tier2Input()

	first, _ := s.Create(ctx, in)
	// A Request for the same action must rejoin, not mint a second object.
	go func() {
		time.Sleep(10 * time.Millisecond)
		_, _ = s.Decide(ctx, DecideInput{ApprovalID: first.ID, Decision: DecisionApproved, By: "usr_alice", PayloadHashSeen: hashA})
	}()
	out, _ := s.Request(ctx, in)
	if out.ApprovalID != first.ID {
		t.Fatalf("Request minted a new object %s, want rejoin of %s", out.ApprovalID, first.ID)
	}
	got, _ := store.GetByAction(ctx, in.TenantID, in.ActionRef)
	if got.ID != first.ID {
		t.Fatalf("store should hold a single object per action")
	}
}

func TestRequestHonorsContextCancel(t *testing.T) {
	s, _ := newSvc(t, &CapturingLedger{})
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Millisecond)
	defer cancel()
	_, err := s.Request(ctx, tier2Input()) // no decision ever arrives
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("want deadline exceeded, got %v", err)
	}
}

// TestRealC5Integration drives transitions through the real C5 appender and verifies
// the resulting per-tenant chain — proving the C3 → C5 evidence path end-to-end.
func TestRealC5Integration(t *testing.T) {
	c5store := auditledger.NewMemoryLedgerStore()
	app := auditledger.NewLedgerAppender(c5store, auditledger.Options{FlushInterval: 5 * time.Millisecond})
	s, _ := newSvc(t, NewC5Ledger(app))
	ctx := context.Background()

	obj, err := s.Create(ctx, tier3Input())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Decide(ctx, DecideInput{ApprovalID: obj.ID, Decision: DecisionApproved, By: "usr_alice", PayloadHashSeen: hashA}); err != nil {
		t.Fatal(err)
	}
	out, err := s.Decide(ctx, DecideInput{ApprovalID: obj.ID, Decision: DecisionApproved, By: "usr_bob", PayloadHashSeen: hashA})
	if err != nil {
		t.Fatal(err)
	}
	if out.State != StateApproved {
		t.Fatalf("want approved, got %s", out.State)
	}
	app.Close()

	// created + 2 approvals (the second carries quorum) = 3 records on t_acme's chain.
	recs, _ := c5store.ReadRange(ctx, "t_acme", 0, 99)
	if len(recs) != 3 {
		t.Fatalf("want 3 ledger records, got %d", len(recs))
	}
	if !auditledger.VerifyChain(recs, nil).OK {
		t.Fatal("C3 transitions did not produce a verifiable C5 chain")
	}
}
