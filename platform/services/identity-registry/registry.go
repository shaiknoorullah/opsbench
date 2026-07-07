// Package identityregistry is C7 — the non-human identity (NHI) registry (PRD IDN-003).
//
// Every agent is a registered workload with a SPIFFE identity, team memberships, a human
// owner (accountability), and a granted autonomy level. Unknown or revoked identities
// resolve to not-found, so the policy plane (C1) and the gatekeeper (C2) deny them
// (TEAM-003: identity resolution failure denies; never falls back to a parent identity).
package identityregistry

import "sync"

// AutonomyLevel is a graduated autonomy grant (PRD GOV-006): L0 observe-only, L1 suggest,
// L2 act-with-approval, L3 bounded-autonomous within certified scenarios, L4 reserved.
type AutonomyLevel int

const (
	L0 AutonomyLevel = iota
	L1
	L2
	L3
	L4
)

// String renders the level as "L0".."L4".
func (l AutonomyLevel) String() string {
	if l < L0 || l > L4 {
		return "L?"
	}
	return [...]string{"L0", "L1", "L2", "L3", "L4"}[l]
}

// Agent is a registered non-human identity.
type Agent struct {
	ID         string        // SPIFFE id, e.g. spiffe://<tenant>/agent/<id>
	TenantID   string        //
	Teams      []string      // team memberships (backs C1's entity store)
	Scopes     []string      // permitted write scopes (backs C4's credential intersection)
	Owner      string        // human owner
	Autonomy   AutonomyLevel // granted autonomy level
	OnBehalfOf []string      // delegation chain (humans/agents this identity acts for)
	revoked    bool
}

// Registry is the in-memory NHI registry. Safe for concurrent use.
type Registry struct {
	mu     sync.RWMutex
	agents map[string]Agent
}

// New returns an empty registry.
func New() *Registry { return &Registry{agents: map[string]Agent{}} }

// Register adds or replaces an agent. Re-registering an id clears a prior revocation.
func (r *Registry) Register(a Agent) {
	r.mu.Lock()
	defer r.mu.Unlock()
	a.revoked = false
	a.Teams = append([]string(nil), a.Teams...)
	a.Scopes = append([]string(nil), a.Scopes...)
	a.OnBehalfOf = append([]string(nil), a.OnBehalfOf...)
	r.agents[a.ID] = a
}

// Revoke marks an agent revoked (its authorizations and credentials must stop). Returns
// whether the agent was known.
func (r *Registry) Revoke(id string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	a, ok := r.agents[id]
	if !ok {
		return false
	}
	a.revoked = true
	r.agents[id] = a
	return true
}

// Lookup returns the agent iff it is known AND active. Unknown or revoked -> (zero, false),
// so callers deny (TEAM-003).
func (r *Registry) Lookup(id string) (Agent, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	a, ok := r.agents[id]
	if !ok || a.revoked {
		return Agent{}, false
	}
	a.Teams = append([]string(nil), a.Teams...)
	a.Scopes = append([]string(nil), a.Scopes...)
	a.OnBehalfOf = append([]string(nil), a.OnBehalfOf...)
	return a, true
}

// Teams returns an active agent's team memberships (nil if unknown/revoked). This is the
// seam C1's entity store consumes (agent -> teams).
func (r *Registry) Teams(id string) []string {
	a, ok := r.Lookup(id)
	if !ok {
		return nil
	}
	return a.Teams
}

// IsActive reports whether the id is a known, non-revoked identity.
func (r *Registry) IsActive(id string) bool {
	_, ok := r.Lookup(id)
	return ok
}

// List returns every active (non-revoked) agent, each with isolated slice copies so a
// caller cannot mutate registry state. Order is unspecified.
func (r *Registry) List() []Agent {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]Agent, 0, len(r.agents))
	for _, a := range r.agents {
		if a.revoked {
			continue
		}
		a.Teams = append([]string(nil), a.Teams...)
		a.Scopes = append([]string(nil), a.Scopes...)
		a.OnBehalfOf = append([]string(nil), a.OnBehalfOf...)
		out = append(out, a)
	}
	return out
}
