package policygateway

import "testing"

const listPolicy = `
permit (
    principal in Team::"team-a",
    action == Action::"list",
    resource in Team::"team-a"
);

@tier("3")
permit (
    principal == Agent::"admin",
    action == Action::"invoke",
    resource
);

permit (
    principal == Agent::"unranked",
    action == Action::"invoke",
    resource
);
`

func TestTierFromAnnotation(t *testing.T) {
	e, err := NewCedarEngine([]byte(listPolicy))
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name       string
		principal  string
		wantEffect string
		wantTier   int
	}{
		{"@tier(3) permit", "admin", "permit", 3},
		{"permit with no @tier -> 0", "unranked", "permit", 0},
		{"deny -> tier 0", "stranger", "deny", 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			d := e.Decide(Request{Principal: tc.principal, Action: "invoke", Resource: "x"})
			if d.Effect != tc.wantEffect || d.Tier != tc.wantTier {
				t.Fatalf("effect=%q tier=%d, want %q/%d", d.Effect, d.Tier, tc.wantEffect, tc.wantTier)
			}
		})
	}
}

func TestToolFilter(t *testing.T) {
	e, err := NewCedarEngine([]byte(listPolicy))
	if err != nil {
		t.Fatal(err)
	}
	f := NewToolFilter(e)
	tools := []ToolRef{
		{ID: "ta1", Parents: []string{"team-a"}, Attrs: map[string]any{"env": "prod"}},
		{ID: "ta2", Parents: []string{"team-a"}, Attrs: map[string]any{"env": "dev"}},
		{ID: "tb1", Parents: []string{"team-b"}, Attrs: map[string]any{"env": "prod"}},
	}

	got := f.Filter("a1", []string{"team-a"}, tools)
	if len(got) != 2 {
		t.Fatalf("filtered to %d tools, want 2 (team-a only): %+v", len(got), got)
	}
	ids := map[string]bool{}
	for _, tr := range got {
		ids[tr.ID] = true
	}
	if !ids["ta1"] || !ids["ta2"] || ids["tb1"] {
		t.Fatalf("wrong subset: %v", ids)
	}

	// repeat identical request → every per-tool decision served from cache
	before := f.Hits()
	_ = f.Filter("a1", []string{"team-a"}, tools)
	if got := f.Hits() - before; got != len(tools) {
		t.Fatalf("expected %d cache hits on repeat, got %d", len(tools), got)
	}

	// a different agent scope is not served from a1's cache and sees nothing team-a-listable
	if got := f.Filter("b1", []string{"team-b"}, tools); len(got) != 0 {
		t.Fatalf("team-b agent should list zero team-a tools, got %+v", got)
	}
}
