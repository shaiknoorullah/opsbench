package identityregistry

import "testing"

func TestRegistryLifecycle(t *testing.T) {
	r := New()
	const id = "spiffe://t_acme/agent/inv-7"

	if _, ok := r.Lookup(id); ok {
		t.Fatal("unknown identity must not resolve")
	}
	if r.IsActive(id) {
		t.Fatal("unknown identity is not active")
	}
	if r.Teams(id) != nil {
		t.Fatal("unknown identity has no teams")
	}

	r.Register(Agent{ID: id, TenantID: "t_acme", Teams: []string{"sre", "platform"}, Owner: "usr_alice", Autonomy: L2, OnBehalfOf: []string{"usr_alice"}})

	a, ok := r.Lookup(id)
	if !ok {
		t.Fatal("registered identity must resolve")
	}
	if a.Owner != "usr_alice" || a.Autonomy != L2 || a.Autonomy.String() != "L2" {
		t.Fatalf("unexpected agent: %+v", a)
	}
	if got := r.Teams(id); len(got) != 2 || got[0] != "sre" || got[1] != "platform" {
		t.Fatalf("teams = %v", got)
	}

	// revocation -> deny
	if !r.Revoke(id) {
		t.Fatal("revoking a known identity should return true")
	}
	if _, ok := r.Lookup(id); ok {
		t.Fatal("revoked identity must not resolve (deny)")
	}
	if r.IsActive(id) || r.Teams(id) != nil {
		t.Fatal("revoked identity is inactive and has no teams")
	}
	if r.Revoke("spiffe://t_acme/agent/nobody") {
		t.Fatal("revoking an unknown identity should return false")
	}

	// re-register clears revocation
	r.Register(Agent{ID: id, TenantID: "t_acme", Teams: []string{"sre"}, Autonomy: L1})
	if !r.IsActive(id) {
		t.Fatal("re-registered identity should be active")
	}
	if a, _ := r.Lookup(id); a.Autonomy != L1 {
		t.Fatalf("re-register should replace fields, autonomy=%s", a.Autonomy)
	}
}

func TestRegistryReturnsIsolatedCopies(t *testing.T) {
	r := New()
	r.Register(Agent{ID: "a", Teams: []string{"sre"}, Scopes: []string{"scope://t/*"}, OnBehalfOf: []string{"usr"}})

	teams := r.Teams("a")
	teams[0] = "mutated"
	if r.Teams("a")[0] != "sre" {
		t.Fatal("callers must not be able to mutate the registry's team slice")
	}

	a, _ := r.Lookup("a")
	a.Teams[0] = "mutated"
	a.Scopes[0] = "mutated"
	a.OnBehalfOf[0] = "mutated"
	if got := r.Teams("a"); got[0] != "sre" {
		t.Fatal("Lookup must return an isolated copy of Teams")
	}
	if got, _ := r.Lookup("a"); got.Scopes[0] != "scope://t/*" {
		t.Fatal("Lookup must return an isolated copy of Scopes")
	}
}

func TestAutonomyLevelString(t *testing.T) {
	for lvl, want := range map[AutonomyLevel]string{L0: "L0", L1: "L1", L2: "L2", L3: "L3", L4: "L4", AutonomyLevel(9): "L?"} {
		if got := lvl.String(); got != want {
			t.Errorf("AutonomyLevel(%d).String() = %q, want %q", int(lvl), got, want)
		}
	}
}
