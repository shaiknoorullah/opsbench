package identityregistry

import (
	"testing"

	policygateway "github.com/shaiknoorullah/opsbench/platform/services/policy-gateway"
)

func TestPolicyStore_AgentTeamsFromRegistry(t *testing.T) {
	reg := New()
	reg.Register(Agent{ID: "spiffe://t_acme/agent/inv-7", TenantID: "t_acme", Teams: []string{"sre", "payments"}})
	ps := NewPolicyStore(reg, policygateway.NewMemoryStore())

	got := ps.AgentTeams("spiffe://t_acme/agent/inv-7")
	if len(got) != 2 || got[0] != "sre" || got[1] != "payments" {
		t.Fatalf("want [sre payments], got %v", got)
	}
	if ps.AgentTeams("spiffe://t_acme/agent/unknown") != nil {
		t.Fatal("unknown agent must resolve to nil teams (default-deny)")
	}
}

func TestPolicyStore_RevokedAgentHasNoTeams(t *testing.T) {
	reg := New()
	reg.Register(Agent{ID: "a1", Teams: []string{"sre"}})
	ps := NewPolicyStore(reg, nil)

	if ps.AgentTeams("a1") == nil {
		t.Fatal("active agent should have teams")
	}
	reg.Revoke("a1")
	if ps.AgentTeams("a1") != nil {
		t.Fatal("revoked agent must resolve to nil teams (default-deny)")
	}
}

func TestPolicyStore_ToolFromSource(t *testing.T) {
	tools := policygateway.NewMemoryStore()
	tools.SetTool("k8s.scale", policygateway.ToolMeta{Parents: []string{"sre"}, Attrs: map[string]any{"env": "prod"}})
	ps := NewPolicyStore(New(), tools)

	m, ok := ps.Tool("k8s.scale")
	if !ok || len(m.Parents) != 1 || m.Parents[0] != "sre" {
		t.Fatalf("want tool meta with parent sre, got %+v ok=%v", m, ok)
	}
	if _, ok := ps.Tool("unknown.tool"); ok {
		t.Fatal("unknown tool must be not-found")
	}
}

func TestPolicyStore_NilSourcesDefaultDeny(t *testing.T) {
	ps := NewPolicyStore(nil, nil)
	if ps.AgentTeams("anyone") != nil {
		t.Fatal("nil registry must yield nil teams")
	}
	if _, ok := ps.Tool("anything"); ok {
		t.Fatal("nil tool source must yield not-found")
	}
}
