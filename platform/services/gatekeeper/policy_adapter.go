package gatekeeper

import (
	"context"
	"strings"

	policygateway "github.com/shaiknoorullah/opsbench/platform/services/policy-gateway"
)

// policyAdapter bridges the gatekeeper's PolicyEngine seam to the C1 policy gateway. The
// gatekeeper hands thin ids (agent SPIFFE id, "tool:<name>", resource scope); the adapter
// enriches them with entity metadata (agent -> teams, tool -> attrs) from the store and
// delegates to C1, which records the PolicyDecisionRecord before returning (DP-3).
type policyAdapter struct {
	svc   *policygateway.Service
	store policygateway.Store
}

// NewPolicyAdapter wraps a C1 decision service (+ its entity store) as a gatekeeper
// PolicyEngine.
func NewPolicyAdapter(svc *policygateway.Service, store policygateway.Store) PolicyEngine {
	return &policyAdapter{svc: svc, store: store}
}

func (p *policyAdapter) Decide(ctx context.Context, principal, action, resource string, attrs map[string]any) (Decision, error) {
	tool := strings.TrimPrefix(action, "tool:")
	meta, _ := p.store.Tool(tool)

	// copy attrs into the evaluated context (don't mutate the caller's map) + add scope
	c := make(map[string]any, len(attrs)+1)
	for k, v := range attrs {
		c[k] = v
	}
	c["scope"] = resource

	d, err := p.svc.Authorize(ctx, policygateway.Request{
		Principal:       principal,
		PrincipalTeams:  p.store.AgentTeams(principal),
		Action:          "invoke",
		Resource:        tool,
		ResourceParents: meta.Parents,
		ResourceAttrs:   meta.Attrs,
		Context:         c,
	}, policygateway.PhaseInvocation)
	if err != nil {
		return Decision{}, err // C2 fails closed on a policy-engine error
	}
	return Decision{
		Effect:           d.Effect,
		Tier:             d.Tier,
		PolicyRefs:       d.PolicyRefs,
		DecisionRecordID: d.DecisionRecordID,
	}, nil
}
