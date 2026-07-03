package gatekeeper

import (
	"context"
	"strings"

	policygateway "github.com/shaiknoorullah/opsbench/platform/services/policy-gateway"
)

// policyAdapter bridges the gatekeeper's PolicyEngine seam to the in-process C1 policy
// gateway. The gatekeeper hands thin ids (agent SPIFFE id, "tool:<name>", resource scope);
// C1 enriches them from its entity store and records the PolicyDecisionRecord before
// returning (DP-3).
type policyAdapter struct {
	svc *policygateway.Service
}

// NewPolicyAdapter wraps an in-process C1 decision service as a gatekeeper PolicyEngine.
// The service must carry its entity store (policygateway.WithStore).
func NewPolicyAdapter(svc *policygateway.Service) PolicyEngine {
	return &policyAdapter{svc: svc}
}

func (p *policyAdapter) Decide(ctx context.Context, principal, action, resource string, attrs map[string]any) (Decision, error) {
	d, err := p.svc.Evaluate(ctx, policygateway.RequestRef{
		Principal: principal,
		Tool:      strings.TrimPrefix(action, "tool:"),
		Resource:  resource,
		Context:   attrs,
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
