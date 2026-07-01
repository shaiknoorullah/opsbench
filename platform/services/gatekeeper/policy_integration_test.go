package gatekeeper

import (
	"context"
	"testing"

	policygateway "github.com/shaiknoorullah/opsbench/platform/services/policy-gateway"
)

// c1Policy: SRE team may invoke SRE-owned tools at tier 2; dangerous prod tools are
// forbidden (forbid overrides permit).
const c1Policy = `
@tier("2")
permit (
    principal in Team::"sre",
    action == Action::"invoke",
    resource in Team::"sre"
);

forbid (
    principal,
    action == Action::"invoke",
    resource
) when { resource.danger == true && resource.env == "prod" };
`

// newC1 builds the real C1 policy gateway (engine + recorder + entity store) wrapped as a
// gatekeeper PolicyEngine.
func newC1(t *testing.T) (PolicyEngine, *policygateway.MemoryRecorder) {
	t.Helper()
	eng, err := policygateway.NewCedarEngine([]byte(c1Policy))
	if err != nil {
		t.Fatalf("NewCedarEngine: %v", err)
	}
	rec := &policygateway.MemoryRecorder{}
	svc := policygateway.NewService(eng, rec, "t_acme")

	store := policygateway.NewMemoryStore()
	store.SetAgentTeams("spiffe://t_acme/agent/inv-7", "sre")
	store.SetTool("k8s.scale", policygateway.ToolMeta{
		Parents: []string{"sre"},
		Attrs:   map[string]any{"env": "prod", "danger": false, "read_only": false},
	})
	store.SetTool("node.reimage", policygateway.ToolMeta{
		Parents: []string{"sre"},
		Attrs:   map[string]any{"env": "prod", "danger": true, "read_only": false},
	})
	return NewPolicyAdapter(svc, store), rec
}

func TestC1Integration_PermitFlowsThroughGatekeeper(t *testing.T) {
	led := &fakeLedger{}
	pol, rec := newC1(t)
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	// @tier("2") -> approval required; approve it.
	g := newGK(led, pol, fakeApprovals{out: ApprovalOutcome{Approved: true}}, nil, tool)

	res, err := g.Execute(context.Background(), action())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Outcome != OutcomeExecuted {
		t.Fatalf("want executed, got %s (%s)", res.Outcome, res.Reason)
	}
	if res.Tier != 2 {
		t.Errorf("want tier 2 derived from C1 @tier annotation, got %d", res.Tier)
	}
	if !tool.applied {
		t.Fatal("tool was not applied")
	}
	if len(rec.Records) != 1 || rec.Records[0].Effect != "permit" {
		t.Fatalf("C1 should record exactly one permit PolicyDecisionRecord, got %+v", rec.Records)
	}
	if rec.Records[0].ID == "" || rec.Records[0].Phase != policygateway.PhaseInvocation {
		t.Errorf("PDR should carry an id and the invocation phase, got id=%q phase=%q", rec.Records[0].ID, rec.Records[0].Phase)
	}
}

func TestC1Integration_ForbidBlocksAtGatekeeper(t *testing.T) {
	led := &fakeLedger{}
	pol, rec := newC1(t)
	tool := &fakeTool{name: "node.reimage", hasDryRun: true}
	g := newGK(led, pol, fakeApprovals{out: ApprovalOutcome{Approved: true}}, nil, tool)

	a := action()
	a.Tool = "node.reimage" // dangerous prod tool -> C1 forbid overrides -> deny
	res, err := g.Execute(context.Background(), a)
	if err != nil {
		t.Fatalf("a policy deny must not be a Go error: %v", err)
	}
	if res.Outcome != OutcomeDenied {
		t.Fatalf("want denied by C1 forbid, got %s", res.Outcome)
	}
	if tool.applied {
		t.Fatal("tool must not be applied when C1 denies")
	}
	if len(rec.Records) != 1 || rec.Records[0].Effect != "deny" {
		t.Fatalf("C1 should record exactly one deny PolicyDecisionRecord, got %+v", rec.Records)
	}
}

func TestC1Integration_UnknownAgentDefaultDenies(t *testing.T) {
	led := &fakeLedger{}
	pol, _ := newC1(t)
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGK(led, pol, fakeApprovals{out: ApprovalOutcome{Approved: true}}, nil, tool)

	a := action()
	a.Agent = "spiffe://t_acme/agent/unknown" // not in the store -> no teams -> default-deny
	res, _ := g.Execute(context.Background(), a)
	if res.Outcome != OutcomeDenied {
		t.Fatalf("unknown agent should default-deny, got %s", res.Outcome)
	}
	if tool.applied {
		t.Fatal("tool must not be applied for an unknown agent")
	}
}

func TestC1Integration_FreezeDeniesAfterPermit(t *testing.T) {
	led := &fakeLedger{}
	pol, _ := newC1(t)
	fr := policygateway.NewFreezeService()
	fr.Freeze("t_acme", "scope://t_acme/env/prod/*", "Q3 change freeze")
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGK(led, pol, fakeApprovals{out: ApprovalOutcome{Approved: true}}, fr, tool)

	res, _ := g.Execute(context.Background(), action())
	if res.Outcome != OutcomeDenied {
		t.Fatalf("want denied by freeze, got %s", res.Outcome)
	}
	if tool.applied {
		t.Fatal("tool must not be applied during a freeze")
	}
}
