package gatekeeper

import (
	"context"
	"testing"

	identityregistry "github.com/shaiknoorullah/opsbench/platform/services/identity-registry"
	policygateway "github.com/shaiknoorullah/opsbench/platform/services/policy-gateway"
)

// c7Policy: SRE agents may invoke SRE-owned tools at tier 1 (notify, no approval), so the
// end-to-end path exercises identity -> policy -> execute without an approval detour. The
// point of these tests is that identity governs authorization: the SAME action executes
// for an active agent and default-denies once C7 no longer resolves that identity.
const c7Policy = `
@tier("1")
permit (
    principal in Team::"sre",
    action == Action::"invoke",
    resource in Team::"sre"
);
`

// newC1BackedByC7 builds the real C1 policy gateway whose entity store is C7 (the identity
// registry) plus a tool source, wrapped as a gatekeeper PolicyEngine. It returns the
// registry so a test can revoke the agent and prove the deny flows C7 -> C1 -> C2.
func newC1BackedByC7(t *testing.T) (PolicyEngine, *identityregistry.Registry) {
	t.Helper()
	eng, err := policygateway.NewCedarEngine([]byte(c7Policy))
	if err != nil {
		t.Fatalf("NewCedarEngine: %v", err)
	}

	reg := identityregistry.New()
	reg.Register(identityregistry.Agent{
		ID:       "spiffe://t_acme/agent/inv-7",
		TenantID: "t_acme",
		Teams:    []string{"sre"},
		Owner:    "usr_alice",
		Autonomy: identityregistry.L2,
	})

	// Tool metadata is C10's job (not built); a MemoryStore stands in as the tool source.
	tools := policygateway.NewMemoryStore()
	tools.SetTool("k8s.scale", policygateway.ToolMeta{
		Parents: []string{"sre"},
		Attrs:   map[string]any{"env": "prod", "danger": false, "read_only": false},
	})

	store := identityregistry.NewPolicyStore(reg, tools)
	svc := policygateway.NewService(eng, &policygateway.MemoryRecorder{}, "t_acme", policygateway.WithStore(store))
	return NewPolicyAdapter(svc), reg
}

func TestC7Integration_ActiveAgentPermitsAndExecutes(t *testing.T) {
	led := &fakeLedger{}
	pol, _ := newC1BackedByC7(t)
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGK(led, pol, fakeApprovals{}, nil, tool)

	res, err := g.Execute(context.Background(), action())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Outcome != OutcomeExecuted {
		t.Fatalf("active SRE agent should execute, got %s (%s)", res.Outcome, res.Reason)
	}
	if !tool.applied {
		t.Fatal("tool was not applied for an active, authorized agent")
	}
}

func TestC7Integration_RevokedAgentDefaultDenies(t *testing.T) {
	led := &fakeLedger{}
	pol, reg := newC1BackedByC7(t)
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGK(led, pol, fakeApprovals{}, nil, tool)

	// Revoke the identity in C7 -> no teams -> C1 default-deny -> C2 denies. Same action.
	if !reg.Revoke("spiffe://t_acme/agent/inv-7") {
		t.Fatal("expected the agent to be known before revocation")
	}
	res, err := g.Execute(context.Background(), action())
	if err != nil {
		t.Fatalf("a policy deny must not be a Go error: %v", err)
	}
	if res.Outcome != OutcomeDenied {
		t.Fatalf("revoked agent must default-deny, got %s", res.Outcome)
	}
	if tool.applied {
		t.Fatal("tool must not be applied for a revoked agent")
	}
}

func TestC7Integration_UnknownAgentDefaultDenies(t *testing.T) {
	led := &fakeLedger{}
	pol, _ := newC1BackedByC7(t)
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGK(led, pol, fakeApprovals{}, nil, tool)

	a := action()
	a.Agent = "spiffe://t_acme/agent/ghost" // never registered in C7
	res, _ := g.Execute(context.Background(), a)
	if res.Outcome != OutcomeDenied {
		t.Fatalf("unknown agent must default-deny, got %s", res.Outcome)
	}
	if tool.applied {
		t.Fatal("tool must not be applied for an unknown agent")
	}
}
