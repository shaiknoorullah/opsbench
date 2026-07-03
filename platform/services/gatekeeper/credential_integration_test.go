package gatekeeper

import (
	"context"
	"testing"

	credentialbroker "github.com/shaiknoorullah/opsbench/platform/services/credential-broker"
	identityregistry "github.com/shaiknoorullah/opsbench/platform/services/identity-registry"
)

// newGKWithBroker wires a gatekeeper whose credential seam is the REAL C4 broker. The
// policy is a fixed permit at tier 1 so Execute reaches the mint step (8) without an
// approval detour — the point is to exercise C4, not the policy/approval path.
func newGKWithBroker(led Ledger, broker CredentialBroker, tool Tool) *Gatekeeper {
	g := New(Config{
		Policy:    fakePolicy{dec: permit(1)},
		Approvals: fakeApprovals{},
		Broker:    broker,
		Ledger:    led,
	})
	g.Register(tool)
	return g
}

// c4Registry registers the inv-7 agent as an active SRE identity permitted the prod scope
// the canonical action() targets.
func c4Registry() *identityregistry.Registry {
	reg := identityregistry.New()
	reg.Register(identityregistry.Agent{
		ID:         "spiffe://t_acme/agent/inv-7",
		TenantID:   "t_acme",
		Teams:      []string{"sre"},
		Scopes:     []string{"scope://t_acme/env/prod/*"},
		OnBehalfOf: []string{"usr_alice"},
	})
	return reg
}

func TestC4Integration_ActiveAgentExecutesWithMintedCredential(t *testing.T) {
	led := &fakeLedger{}
	broker := credentialbroker.New(c4Registry())
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGKWithBroker(led, NewCredentialAdapter(broker), tool)

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

	// C4 minted exactly one credential, attributed and NF-007 short-lived, scoped to the
	// requested resource (permitted ∩ requested).
	inv := broker.Inventory()
	if len(inv) != 1 {
		t.Fatalf("want 1 minted credential, got %d", len(inv))
	}
	c := inv[0]
	if !c.IsExpiring() {
		t.Fatal("NF-007: the minted credential is not short-lived")
	}
	a := action()
	if c.Agent != a.Agent || c.TaskID != a.TaskID {
		t.Errorf("attribution mismatch: agent=%q task=%q", c.Agent, c.TaskID)
	}
	if c.Scope != a.Resource {
		t.Errorf("effective scope should equal the requested resource, got %q", c.Scope)
	}
}

func TestC4Integration_RevokedAgentFailsClosed(t *testing.T) {
	led := &fakeLedger{}
	reg := c4Registry()
	broker := credentialbroker.New(reg)
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGKWithBroker(led, NewCredentialAdapter(broker), tool)

	reg.Revoke("spiffe://t_acme/agent/inv-7") // no active identity -> broker mint fails -> C2 denies

	res, err := g.Execute(context.Background(), action())
	if err == nil {
		t.Fatal("want a non-nil error when the broker cannot mint")
	}
	if res.Outcome != OutcomeDenied {
		t.Fatalf("want denied (fail closed), got %s", res.Outcome)
	}
	if tool.applied {
		t.Fatal("tool must not be applied when no credential can be minted")
	}
	if len(broker.Inventory()) != 0 {
		t.Fatal("no credential should have been minted for a revoked agent")
	}
}

func TestC4Integration_ScopeOutsideGrantFailsClosed(t *testing.T) {
	led := &fakeLedger{}
	reg := identityregistry.New()
	reg.Register(identityregistry.Agent{
		ID:       "spiffe://t_acme/agent/inv-7",
		TenantID: "t_acme",
		Teams:    []string{"sre"},
		Scopes:   []string{"scope://t_acme/env/staging/*"}, // does NOT cover the prod action resource
	})
	broker := credentialbroker.New(reg)
	tool := &fakeTool{name: "k8s.scale", hasDryRun: true}
	g := newGKWithBroker(led, NewCredentialAdapter(broker), tool)

	res, err := g.Execute(context.Background(), action())
	if err == nil {
		t.Fatal("want a non-nil error when the requested scope is outside the agent's grant")
	}
	if res.Outcome != OutcomeDenied || tool.applied {
		t.Fatalf("want denied + not applied, got %s applied=%v", res.Outcome, tool.applied)
	}
	if len(broker.Inventory()) != 0 {
		t.Fatal("no credential should have been minted for an out-of-scope request")
	}
}
