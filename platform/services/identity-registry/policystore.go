package identityregistry

import (
	policygateway "github.com/shaiknoorullah/opsbench/platform/services/policy-gateway"
)

// ToolSource supplies tool entity metadata (owning teams + attributes) to policy
// evaluation. In production this is C10 (the connector/tool registry); C7 does not own
// tool metadata. It is injected so the identity plane can compose a complete C1 entity
// store without depending on C10's implementation. A nil ToolSource resolves every tool
// as unknown, which — like an unknown agent — makes C1 default-deny.
type ToolSource interface {
	Tool(toolID string) (policygateway.ToolMeta, bool)
}

// PolicyStore adapts C7 (the identity registry) plus an injected tool source to C1's
// policygateway.Store, so the policy gateway resolves an agent's teams from real identity
// state instead of a static map.
//
// Agent -> teams comes from the registry: an unknown or revoked agent yields nil teams,
// which makes C1 default-deny (TEAM-003 "identity resolution failure denies; never falls
// back to a parent identity"). This gives the C7 -> C1 -> C2 chain end-to-end deny for
// unknown and revoked identities for free — proven by C1's
// TestC1Integration_UnknownAgentDefaultDenies and this package's integration tests.
//
// Tool -> metadata comes from the injected tool source (C10), which C7 does not own.
type PolicyStore struct {
	reg   *Registry
	tools ToolSource
}

// NewPolicyStore composes a C7 registry and a tool source into a C1 entity store. A nil
// registry resolves every agent as having no teams (default-deny); a nil tool source
// resolves every tool as unknown (default-deny).
func NewPolicyStore(reg *Registry, tools ToolSource) *PolicyStore {
	return &PolicyStore{reg: reg, tools: tools}
}

// AgentTeams returns the agent's team memberships from C7, or nil if the agent is unknown
// or revoked (so C1 default-denies).
func (s *PolicyStore) AgentTeams(agentID string) []string {
	if s.reg == nil {
		return nil
	}
	return s.reg.Teams(agentID)
}

// Tool returns tool entity metadata from the injected tool source, or not-found if there
// is no source or the tool is unknown.
func (s *PolicyStore) Tool(toolID string) (policygateway.ToolMeta, bool) {
	if s.tools == nil {
		return policygateway.ToolMeta{}, false
	}
	return s.tools.Tool(toolID)
}

// PolicyStore satisfies C1's entity-store contract.
var _ policygateway.Store = (*PolicyStore)(nil)
