package policygateway

import "testing"

// The shipped platform policy set must parse (cedar-go) and behave. This is C1's Go-side
// validation of policies/platform.cedar (cedar-go is an authorizer, not a schema validator).
func TestPlatformPolicySetParsesAndBehaves(t *testing.T) {
	eng, err := NewCedarEngine(DefaultPlatformPolicy)
	if err != nil {
		t.Fatalf("shipped platform policy set does not parse: %v", err)
	}

	sre := func(attrs map[string]any) Request {
		return Request{Principal: "a", PrincipalTeams: []string{"sre"}, Action: "invoke",
			Resource: "t", ResourceParents: []string{"sre"}, ResourceAttrs: attrs}
	}

	cases := []struct {
		name   string
		req    Request
		effect string
		tier   int
	}{
		{"sre invoke dev tool", sre(map[string]any{"env": "dev", "danger": false, "read_only": false}), "permit", 2},
		{"sre invoke prod read-only", sre(map[string]any{"env": "prod", "danger": false, "read_only": true}), "permit", 2},
		{"sre invoke prod mutating -> default-deny", sre(map[string]any{"env": "prod", "danger": false, "read_only": false}), "deny", 0},
		{"forbid overrides: dangerous prod tool", sre(map[string]any{"env": "prod", "danger": true, "read_only": true}), "deny", 0},
		{"cross-team deny", Request{Principal: "p", PrincipalTeams: []string{"platform"}, Action: "invoke",
			Resource: "t", ResourceParents: []string{"sre"}, ResourceAttrs: map[string]any{"env": "dev", "read_only": true}}, "deny", 0},
		{"break-glass human operator (exempt from prod-danger forbid)", Request{Principal: "human-operator",
			Action: "invoke", Resource: "anything", ResourceAttrs: map[string]any{"env": "prod", "danger": true}}, "permit", 3},
		{"sre list own tool", Request{Principal: "a", PrincipalTeams: []string{"sre"}, Action: "list",
			Resource: "t", ResourceParents: []string{"sre"}}, "permit", 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			d := eng.Decide(tc.req)
			if d.Effect != tc.effect {
				t.Fatalf("effect = %q, want %q (policyRefs=%v)", d.Effect, tc.effect, d.PolicyRefs)
			}
			if d.Effect == "permit" && d.Tier != tc.tier {
				t.Errorf("tier = %d, want %d", d.Tier, tc.tier)
			}
		})
	}
}
