package gatekeeper

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	auditledger "github.com/shaiknoorullah/opsbench/platform/services/audit-ledger"
)

// --- fakes ---

type fakePolicy struct {
	dec Decision
	err error
}

func (p fakePolicy) Decide(context.Context, string, string, string, map[string]any) (Decision, error) {
	return p.dec, p.err
}

type fakeApprovals struct {
	out       ApprovalOutcome
	err       error
	onRequest func() // lets a test mutate the payload between approval and apply
}

func (a fakeApprovals) Request(_ context.Context, req ApprovalRequest) (ApprovalOutcome, error) {
	if a.onRequest != nil {
		a.onRequest()
	}
	if a.err != nil {
		return ApprovalOutcome{}, a.err
	}
	out := a.out
	if out.Approved && out.PayloadHashSeen == "" {
		out.PayloadHashSeen = req.PayloadHash // by default the approver saw the pinned payload
	}
	return out, nil
}

type fakeBroker struct{ err error }

func (b fakeBroker) MintWrite(context.Context, string, string, string) (Credential, error) {
	if b.err != nil {
		return Credential{}, b.err
	}
	return Credential{Token: "jit", ExpiresAt: time.Now().Add(time.Hour)}, nil
}

type fakeFreeze struct {
	frozen bool
	reason string
	err    error
}

func (f fakeFreeze) IsFrozen(context.Context, string, string) (bool, string, error) {
	return f.frozen, f.reason, f.err
}

type fakeLedger struct {
	mu       sync.Mutex
	entries  []AuditEntry
	failKind string // if set, Record fails for entries of this Kind
	n        int
}

func (l *fakeLedger) Record(_ context.Context, e AuditEntry) (string, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.failKind != "" && e.Kind == l.failKind {
		return "", errors.New("ledger down")
	}
	l.entries = append(l.entries, e)
	l.n++
	return fmt.Sprintf("led_%d", l.n), nil
}

func (l *fakeLedger) kinds() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]string, len(l.entries))
	for i, e := range l.entries {
		out[i] = e.Kind + ":" + e.Effect + ":" + e.OutcomeStatus
	}
	return out
}

type fakeTool struct {
	name         string
	hasDryRun    bool
	dryRunHashes []string // EffectHash per successive DryRun call (default "effA")
	dryRunErr    error
	applyErr     error
	rollback     string
	dryRunCalls  int
	applied      bool
}

func (f *fakeTool) Name() string    { return f.name }
func (f *fakeTool) HasDryRun() bool { return f.hasDryRun }

func (f *fakeTool) DryRun(context.Context, map[string]any) (DryRunResult, error) {
	if f.dryRunErr != nil {
		return DryRunResult{}, f.dryRunErr
	}
	h := "effA"
	if f.dryRunCalls < len(f.dryRunHashes) {
		h = f.dryRunHashes[f.dryRunCalls]
	}
	f.dryRunCalls++
	return DryRunResult{Diff: "diff", EffectHash: h}, nil
}

func (f *fakeTool) Apply(context.Context, map[string]any, Credential) (ApplyResult, error) {
	if f.applyErr != nil {
		return ApplyResult{RollbackHandle: f.rollback}, f.applyErr
	}
	f.applied = true
	return ApplyResult{RollbackHandle: f.rollback, Detail: "done"}, nil
}

// --- helpers ---

func action() Action {
	return Action{
		TenantID:      "t_acme",
		Agent:         "spiffe://t_acme/agent/inv-7",
		Tool:          "k8s.scale",
		Resource:      "scope://t_acme/env/prod/service/checkout",
		Payload:       map[string]any{"replicas": 6},
		Justification: "scale out for load",
		OnBehalfOf:    "usr_alice",
		TaskID:        "tsk_x",
	}
}

func permit(tier int) Decision {
	return Decision{Effect: "permit", Tier: tier, PolicyRefs: []string{"pol_sre-scale"}}
}

func newGK(led Ledger, pol PolicyEngine, app ApprovalGate, fr FreezeChecker, tools ...Tool) *Gatekeeper {
	g := New(Config{Policy: pol, Approvals: app, Broker: fakeBroker{}, Freeze: fr, Ledger: led})
	for _, t := range tools {
		g.Register(t)
	}
	return g
}

// --- tests ---

func TestHappyPathExecutesAndLedgers(t *testing.T) {
	led := &fakeLedger{}
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGK(led, fakePolicy{dec: permit(1)}, fakeApprovals{}, nil, tool)

	res, err := g.Execute(context.Background(), action())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Outcome != OutcomeExecuted {
		t.Fatalf("want executed, got %s (%s)", res.Outcome, res.Reason)
	}
	if !tool.applied {
		t.Fatal("tool was not applied")
	}
	if got := led.kinds(); len(got) != 2 || got[0] != "policy_decision:permit:ok" || got[1] != "tool_call:permit:ok" {
		t.Fatalf("unexpected ledger entries: %v", got)
	}
}

func TestPolicyDenyBlocks(t *testing.T) {
	led := &fakeLedger{}
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGK(led, fakePolicy{dec: Decision{Effect: "deny"}}, fakeApprovals{}, nil, tool)

	res, err := g.Execute(context.Background(), action())
	if err != nil {
		t.Fatalf("policy deny should not be a Go error: %v", err)
	}
	if res.Outcome != OutcomeDenied {
		t.Fatalf("want denied, got %s", res.Outcome)
	}
	if tool.applied {
		t.Fatal("tool must not be applied on policy deny")
	}
}

func TestNoDryRunAutoEscalatesToTier3(t *testing.T) {
	led := &fakeLedger{}
	tool := &fakeTool{name: "k8s.scale", hasDryRun: false}
	// policy permits at tier 1, but no dry-run forces tier 3 -> approval required.
	g := newGK(led, fakePolicy{dec: permit(1)}, fakeApprovals{out: ApprovalOutcome{Approved: true}}, nil, tool)

	res, err := g.Execute(context.Background(), action())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Outcome != OutcomeExecuted || res.Tier != 3 {
		t.Fatalf("want executed at tier 3, got %s tier=%d", res.Outcome, res.Tier)
	}
	if !tool.applied {
		t.Fatal("tool was not applied")
	}
}

func TestApprovalRejectedDenies(t *testing.T) {
	led := &fakeLedger{}
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGK(led, fakePolicy{dec: permit(2)}, fakeApprovals{out: ApprovalOutcome{Approved: false}}, nil, tool)

	res, _ := g.Execute(context.Background(), action())
	if res.Outcome != OutcomeDenied {
		t.Fatalf("want denied, got %s", res.Outcome)
	}
	if tool.applied {
		t.Fatal("tool must not be applied when approval is rejected")
	}
}

func TestApproverSawDifferentPayloadInvalidates(t *testing.T) {
	led := &fakeLedger{}
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGK(led, fakePolicy{dec: permit(2)},
		fakeApprovals{out: ApprovalOutcome{Approved: true, PayloadHashSeen: "sha256:deadbeef"}}, nil, tool)

	res, _ := g.Execute(context.Background(), action())
	if res.Outcome != OutcomeInvalidated {
		t.Fatalf("want invalidated, got %s", res.Outcome)
	}
	if tool.applied {
		t.Fatal("tool must not be applied when the approver saw a different payload")
	}
}

func TestPayloadChangedAfterApprovalInvalidates(t *testing.T) {
	led := &fakeLedger{}
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	a := action()
	// The approval gate mutates the payload after the approver "saw" it (GOV-004).
	app := fakeApprovals{out: ApprovalOutcome{Approved: true}, onRequest: func() { a.Payload["replicas"] = 999 }}
	g := newGK(led, fakePolicy{dec: permit(2)}, app, nil, tool)

	res, _ := g.Execute(context.Background(), a)
	if res.Outcome != OutcomeInvalidated {
		t.Fatalf("want invalidated, got %s (%s)", res.Outcome, res.Reason)
	}
	if tool.applied {
		t.Fatal("tool must not be applied after the payload changed")
	}
}

func TestDryRunDivergenceBlocks(t *testing.T) {
	led := &fakeLedger{}
	// EffectHash differs between the pre-approval and apply-time dry-runs.
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true, dryRunHashes: []string{"A", "B"}}
	g := newGK(led, fakePolicy{dec: permit(1)}, fakeApprovals{}, nil, tool)

	res, _ := g.Execute(context.Background(), action())
	if res.Outcome != OutcomeBlocked {
		t.Fatalf("want blocked, got %s", res.Outcome)
	}
	if tool.applied {
		t.Fatal("tool must not be applied on dry-run divergence")
	}
}

func TestFrozenDenies(t *testing.T) {
	led := &fakeLedger{}
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGK(led, fakePolicy{dec: permit(1)}, fakeApprovals{}, fakeFreeze{frozen: true, reason: "Q3 freeze"}, tool)

	res, _ := g.Execute(context.Background(), action())
	if res.Outcome != OutcomeDenied {
		t.Fatalf("want denied, got %s", res.Outcome)
	}
	if tool.applied {
		t.Fatal("tool must not be applied during a freeze")
	}
}

func TestUnknownToolDenies(t *testing.T) {
	led := &fakeLedger{}
	g := newGK(led, fakePolicy{dec: permit(1)}, fakeApprovals{}, nil) // no tools registered
	res, _ := g.Execute(context.Background(), action())
	if res.Outcome != OutcomeDenied {
		t.Fatalf("want denied for unknown tool, got %s", res.Outcome)
	}
}

func TestFailClosedOnPolicyError(t *testing.T) {
	led := &fakeLedger{}
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGK(led, fakePolicy{err: errors.New("policy unreachable")}, fakeApprovals{}, nil, tool)

	res, err := g.Execute(context.Background(), action())
	if err == nil {
		t.Fatal("want a non-nil error on policy failure")
	}
	if res.Outcome != OutcomeDenied || tool.applied {
		t.Fatalf("want denied + not applied, got %s applied=%v", res.Outcome, tool.applied)
	}
}

func TestFailClosedWhenDecisionCannotBeLedgered(t *testing.T) {
	led := &fakeLedger{failKind: "policy_decision"}
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGK(led, fakePolicy{dec: permit(1)}, fakeApprovals{}, nil, tool)

	res, err := g.Execute(context.Background(), action())
	if err == nil {
		t.Fatal("want a non-nil error when the decision cannot be recorded")
	}
	if res.Outcome != OutcomeDenied || tool.applied {
		t.Fatalf("no evidence -> no action: want denied + not applied, got %s applied=%v", res.Outcome, tool.applied)
	}
}

func TestFailClosedOnCredentialMintError(t *testing.T) {
	led := &fakeLedger{}
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := New(Config{Policy: fakePolicy{dec: permit(1)}, Approvals: fakeApprovals{}, Broker: fakeBroker{err: errors.New("broker down")}, Ledger: led})
	g.Register(tool)

	res, err := g.Execute(context.Background(), action())
	if err == nil || res.Outcome != OutcomeDenied || tool.applied {
		t.Fatalf("want denied+err+not-applied, got %s err=%v applied=%v", res.Outcome, err, tool.applied)
	}
}

// Integration: wire the gatekeeper to the REAL C5 audit ledger and verify the chain.
func TestIntegrationWithRealAuditLedger(t *testing.T) {
	store := auditledger.NewMemoryLedgerStore()
	app := auditledger.NewLedgerAppender(store, auditledger.Options{FlushInterval: time.Millisecond})
	g := New(Config{
		Policy:    fakePolicy{dec: permit(1)},
		Approvals: fakeApprovals{},
		Broker:    fakeBroker{},
		Ledger:    NewLedgerAdapter(app),
	})
	g.Register(&fakeTool{name: "k8s.scale", hasDryRun: true})

	res, err := g.Execute(context.Background(), action())
	if err != nil || res.Outcome != OutcomeExecuted {
		t.Fatalf("want executed, got %s err=%v", res.Outcome, err)
	}
	app.Close()

	recs, _ := store.ReadRange(context.Background(), "t_acme", 0, 9)
	if len(recs) != 2 {
		t.Fatalf("want 2 ledger records (decision + outcome), got %d", len(recs))
	}
	if !auditledger.VerifyChain(recs, nil).OK {
		t.Fatal("audit chain produced by the gatekeeper did not verify")
	}
	if recs[0].Operation.Kind != "policy_decision" || recs[1].Operation.Kind != "tool_call" {
		t.Fatalf("unexpected record kinds: %s, %s", recs[0].Operation.Kind, recs[1].Operation.Kind)
	}
}
