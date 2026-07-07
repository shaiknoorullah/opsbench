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

func TestRegistryList(t *testing.T) {
	r := New()
	r.Register(Agent{ID: "a", Teams: []string{"sre"}})
	r.Register(Agent{ID: "b", Teams: []string{"payments"}})
	r.Register(Agent{ID: "c"})
	r.Revoke("c") // revoked agents are excluded

	got := r.List()
	if len(got) != 2 {
		t.Fatalf("want 2 active agents, got %d", len(got))
	}
	ids := map[string]bool{}
	for _, a := range got {
		ids[a.ID] = true
	}
	if !ids["a"] || !ids["b"] || ids["c"] {
		t.Fatalf("List should return a and b (not revoked c), got %v", ids)
	}

	// Isolation: mutating a returned agent's slice must not affect the registry.
	got[0].Teams = append(got[0].Teams, "mutated")
	for _, a := range r.List() {
		for _, tm := range a.Teams {
			if tm == "mutated" {
				t.Fatal("List must return isolated copies")
			}
		}
	}
}
