package gatekeeper

import (
	"context"
	"testing"
	"time"

	approvals "github.com/shaiknoorullah/opsbench/platform/services/approvals"
	auditledger "github.com/shaiknoorullah/opsbench/platform/services/audit-ledger"
)

// TestSpineC2ToC3ToC5 wires the full governed-action spine: the gatekeeper (C2) blocks
// on the real approval service (C3), and BOTH record to one C5 audit ledger. A reviewer
// approves out-of-band; the action then executes and the combined chain verifies.
func TestSpineC2ToC3ToC5(t *testing.T) {
	c5 := auditledger.NewMemoryLedgerStore()
	app := auditledger.NewLedgerAppender(c5, auditledger.Options{FlushInterval: time.Millisecond})

	// C3 over the same C5 ledger.
	c3 := approvals.New(approvals.NewMemoryStore(), approvals.Options{
		Ledger:       approvals.NewC5Ledger(app),
		PollInterval: 5 * time.Millisecond,
	})
	gate := NewApprovalAdapter(c3, func(ApprovalRequest) []string { return []string{"usr_approver"} })

	g := New(Config{
		Policy:    fakePolicy{dec: permit(2)}, // tier 2 => requires one approval
		Approvals: gate,
		Broker:    fakeBroker{},
		Ledger:    NewLedgerAdapter(app),
	})
	g.Register(&fakeTool{name: "k8s.scale", hasDryRun: true})

	act := action() // TaskID "tsk_x" is the action ref the approval is keyed on

	// Approve out-of-band once the pending object exists.
	ph, _ := payloadHash(act.Payload)
	go func() {
		deadline := time.Now().Add(2 * time.Second)
		for time.Now().Before(deadline) {
			o, gerr := c3.GetByAction(context.Background(), act.TenantID, act.TaskID)
			if gerr == nil && o.State == approvals.StatePending {
				_, _ = c3.Decide(context.Background(), approvals.DecideInput{
					ApprovalID: o.ID, Decision: approvals.DecisionApproved,
					By: "usr_approver", Surface: "web", PayloadHashSeen: ph,
				})
				return
			}
			time.Sleep(5 * time.Millisecond)
		}
	}()

	res, err := g.Execute(context.Background(), act)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Outcome != OutcomeExecuted {
		t.Fatalf("want executed, got %s (%s)", res.Outcome, res.Reason)
	}
	app.Close()

	// C5 holds: C3 created + C3 approved + C2 policy_decision + C2 tool_call = 4, chained.
	recs, _ := c5.ReadRange(context.Background(), "t_acme", 0, 99)
	if len(recs) != 4 {
		t.Fatalf("want 4 records on the shared chain, got %d", len(recs))
	}
	if !auditledger.VerifyChain(recs, nil).OK {
		t.Fatal("the C2+C3 shared audit chain did not verify")
	}
}

// TestSpineApprovalRejectedDenies proves a C3 rejection blocks execution via C2.
func TestSpineApprovalRejectedDenies(t *testing.T) {
	c3 := approvals.New(approvals.NewMemoryStore(), approvals.Options{PollInterval: 5 * time.Millisecond})
	gate := NewApprovalAdapter(c3, func(ApprovalRequest) []string { return []string{"usr_approver"} })
	led := &fakeLedger{}
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGK(led, fakePolicy{dec: permit(2)}, gate, nil, tool)

	act := action()
	ph, _ := payloadHash(act.Payload)
	go func() {
		deadline := time.Now().Add(2 * time.Second)
		for time.Now().Before(deadline) {
			o, gerr := c3.GetByAction(context.Background(), act.TenantID, act.TaskID)
			if gerr == nil && o.State == approvals.StatePending {
				_, _ = c3.Decide(context.Background(), approvals.DecideInput{
					ApprovalID: o.ID, Decision: approvals.DecisionRejected,
					By: "usr_approver", Surface: "web", PayloadHashSeen: ph,
				})
				return
			}
			time.Sleep(5 * time.Millisecond)
		}
	}()

	res, _ := g.Execute(context.Background(), act)
	if res.Outcome != OutcomeDenied || tool.applied {
		t.Fatalf("rejection must deny + not apply, got %s applied=%v", res.Outcome, tool.applied)
	}
}
