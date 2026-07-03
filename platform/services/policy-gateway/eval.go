package policygateway

import "context"

// RequestRef is a decision query expressed as the thin ids a caller (the gatekeeper, the
// tool gateway) has: an agent, a tool, and the target scope. The Service enriches it with
// entity metadata from its Store before authorizing — C1 owns that metadata (from C7/C10),
// so callers never need to know an agent's teams or a tool's attributes.
type RequestRef struct {
	Principal string         // agent id (SPIFFE)
	Tool      string         // tool name
	Resource  string         // target scope uri
	Context   map[string]any // justification, autonomy level, ...
}

// Evaluate enriches the ref from the Store, authorizes it (recording the decision, DP-3),
// and returns the decision. The Cedar action is derived from the phase: "invoke" for
// invocation, "list" for tool-list filtering.
func (s *Service) Evaluate(ctx context.Context, ref RequestRef, phase Phase) (Decision, error) {
	var teams []string
	var meta ToolMeta
	if s.store != nil {
		teams = s.store.AgentTeams(ref.Principal)
		meta, _ = s.store.Tool(ref.Tool)
	}

	action := "invoke"
	if phase == PhaseToolListing {
		action = "list"
	}

	c := make(map[string]any, len(ref.Context)+1)
	for k, v := range ref.Context {
		c[k] = v
	}
	c["scope"] = ref.Resource

	return s.Authorize(ctx, Request{
		Principal:       ref.Principal,
		PrincipalTeams:  teams,
		Action:          action,
		Resource:        ref.Tool,
		ResourceParents: meta.Parents,
		ResourceAttrs:   meta.Attrs,
		Context:         c,
	}, phase)
}
