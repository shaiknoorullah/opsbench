package policygateway

import "testing"

// S1-style reference policy: per-team invoke permit (read-only anywhere, else
// non-prod), plus a global forbid guard for dangerous prod tools (forbid overrides).
const testPolicy = `
permit (
    principal in Team::"team-a",
    action == Action::"invoke",
    resource in Team::"team-a"
) when { resource.read_only == true || resource.env != "prod" };

forbid (
    principal,
    action == Action::"invoke",
    resource
) when { resource.danger == true && resource.env == "prod" };
`

func newTestEngine(t *testing.T) *CedarEngine {
	t.Helper()
	e, err := NewCedarEngine([]byte(testPolicy))
	if err != nil {
		t.Fatalf("NewCedarEngine: %v", err)
	}
	return e
}

func TestDecide(t *testing.T) {
	e := newTestEngine(t)
	cases := []struct {
		name     string
		req      Request
		want     string
		wantTier int
	}{
		{
			name: "permit: team member, staging, non-danger",
			req: Request{Principal: "a1", PrincipalTeams: []string{"team-a"}, Action: "invoke",
				Resource: "tool1", ResourceParents: []string{"team-a"},
				ResourceAttrs: map[string]any{"env": "staging", "danger": false, "read_only": false}},
			want: "permit", wantTier: 0,
		},
		{
			name: "permit: read-only prod tool (tier 2)",
			req: Request{Principal: "a1", PrincipalTeams: []string{"team-a"}, Action: "invoke",
				Resource: "tool4", ResourceParents: []string{"team-a"},
				ResourceAttrs: map[string]any{"env": "prod", "danger": false, "read_only": true}},
			want: "permit", wantTier: 2,
		},
		{
			name: "default-deny: prod, non-read-only, no matching permit",
			req: Request{Principal: "a1", PrincipalTeams: []string{"team-a"}, Action: "invoke",
				Resource: "tool2", ResourceParents: []string{"team-a"},
				ResourceAttrs: map[string]any{"env": "prod", "danger": false, "read_only": false}},
			want: "deny",
		},
		{
			name: "forbid overrides permit: dangerous prod tool (read-only would permit)",
			req: Request{Principal: "a1", PrincipalTeams: []string{"team-a"}, Action: "invoke",
				Resource: "tool3", ResourceParents: []string{"team-a"},
				ResourceAttrs: map[string]any{"env": "prod", "danger": true, "read_only": true}},
			want: "deny",
		},
		{
			name: "cross-team deny: team-b agent, team-a tool",
			req: Request{Principal: "b1", PrincipalTeams: []string{"team-b"}, Action: "invoke",
				Resource: "tool1", ResourceParents: []string{"team-a"},
				ResourceAttrs: map[string]any{"env": "staging", "danger": false, "read_only": true}},
			want: "deny",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := e.Decide(tc.req)
			if got.Effect != tc.want {
				t.Fatalf("effect = %q, want %q (policyRefs=%v)", got.Effect, tc.want, got.PolicyRefs)
			}
			if got.Effect == "permit" && got.Tier != tc.wantTier {
				t.Errorf("tier = %d, want %d", got.Tier, tc.wantTier)
			}
			if got.Effect == "permit" && len(got.PolicyRefs) == 0 {
				t.Errorf("permit should cite a governing policy, got none")
			}
		})
	}
}

func TestDecideDeterministic(t *testing.T) {
	e := newTestEngine(t)
	r := Request{Principal: "a1", PrincipalTeams: []string{"team-a"}, Action: "invoke",
		Resource: "tool1", ResourceParents: []string{"team-a"},
		ResourceAttrs: map[string]any{"env": "staging", "danger": false, "read_only": true}}
	first := e.Decide(r)
	for i := 0; i < 100; i++ {
		if got := e.Decide(r); got.Effect != first.Effect {
			t.Fatalf("non-deterministic decision on iter %d: %q vs %q", i, got.Effect, first.Effect)
		}
	}
}

func TestNewCedarEngineRejectsGarbage(t *testing.T) {
	if _, err := NewCedarEngine([]byte("this is not cedar")); err == nil {
		t.Fatal("expected parse error for invalid policy source, got nil")
	}
}
