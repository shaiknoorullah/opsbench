package gatekeeper

import (
	"context"
	"net/http/httptest"
	"testing"

	policygateway "github.com/shaiknoorullah/opsbench/platform/services/policy-gateway"
)

// End-to-end: the gatekeeper (C2) authorizes a mutation by calling C1 over HTTP.
func TestC1PolicyEngineOverHTTP(t *testing.T) {
	eng, err := policygateway.NewCedarEngine([]byte(c1Policy))
	if err != nil {
		t.Fatal(err)
	}
	rec := &policygateway.MemoryRecorder{}
	store := policygateway.NewMemoryStore()
	store.SetAgentTeams("spiffe://t_acme/agent/inv-7", "sre")
	store.SetTool("k8s.scale", policygateway.ToolMeta{Parents: []string{"sre"}, Attrs: map[string]any{"env": "prod", "danger": false}})
	store.SetTool("node.reimage", policygateway.ToolMeta{Parents: []string{"sre"}, Attrs: map[string]any{"env": "prod", "danger": true}})
	svc := policygateway.NewService(eng, rec, "t_acme", policygateway.WithStore(store))
	ts := httptest.NewServer(policygateway.NewServer(svc, policygateway.NewToolFilter(eng)))
	defer ts.Close()

	pol := NewHTTPPolicyAdapter(ts.URL, ts.Client())

	// permit flows through and executes at the C1-derived tier
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGK(&fakeLedger{}, pol, fakeApprovals{out: ApprovalOutcome{Approved: true}}, nil, tool)
	res, err := g.Execute(context.Background(), action())
	if err != nil || res.Outcome != OutcomeExecuted || res.Tier != 2 {
		t.Fatalf("want executed at tier 2 over HTTP, got %s tier=%d err=%v", res.Outcome, res.Tier, err)
	}
	if !tool.applied {
		t.Fatal("tool was not applied over the HTTP policy path")
	}

	// a C1 forbid denies over HTTP (a 200 deny, not a transport error)
	tool2 := &fakeTool{name: "node.reimage", hasDryRun: true}
	g2 := newGK(&fakeLedger{}, pol, fakeApprovals{out: ApprovalOutcome{Approved: true}}, nil, tool2)
	a := action()
	a.Tool = "node.reimage"
	res2, err2 := g2.Execute(context.Background(), a)
	if err2 != nil {
		t.Fatalf("a policy deny must not be a Go error: %v", err2)
	}
	if res2.Outcome != OutcomeDenied {
		t.Fatalf("want denied over HTTP, got %s", res2.Outcome)
	}
	if tool2.applied {
		t.Fatal("tool must not be applied when C1 denies over HTTP")
	}
}
