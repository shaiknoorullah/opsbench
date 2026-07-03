package policygateway

import (
	"context"
	"strings"
	"sync"
)

// FreezeService enforces GOV-009 change freezes as a gate the gatekeeper (C2) queries at
// its FreezeChecker seam — freezes are a deny-override at the decision point, not a prompt
// convention. Frozen scopes are matched exactly or by a "prefix*" glob.
//
// GOV-009 failure mode: a freeze must persist until positively lifted, so any failure to
// determine freeze state fails FROZEN. This in-memory implementation cannot fail; a
// calendar-backed implementation returns (true, "freeze source unavailable", err).
type FreezeService struct {
	mu      sync.Mutex
	windows map[string][]freezeWindow // tenant -> active windows
}

type freezeWindow struct {
	scopeGlob string
	reason    string
}

// NewFreezeService returns an empty freeze service (nothing frozen).
func NewFreezeService() *FreezeService {
	return &FreezeService{windows: map[string][]freezeWindow{}}
}

// Freeze adds a freeze window. scopeGlob matches a scope exactly, or as a prefix when it
// ends with '*'.
func (f *FreezeService) Freeze(tenant, scopeGlob, reason string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.windows[tenant] = append(f.windows[tenant], freezeWindow{scopeGlob: scopeGlob, reason: reason})
}

// Lift removes all freeze windows for a tenant.
func (f *FreezeService) Lift(tenant string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.windows, tenant)
}

// IsFrozen reports whether the scope is under an active freeze. It satisfies the
// gatekeeper's FreezeChecker seam.
func (f *FreezeService) IsFrozen(_ context.Context, tenant, scope string) (bool, string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, w := range f.windows[tenant] {
		if matchScopeGlob(w.scopeGlob, scope) {
			return true, w.reason, nil
		}
	}
	return false, "", nil
}

func matchScopeGlob(glob, scope string) bool {
	if strings.HasSuffix(glob, "*") {
		return strings.HasPrefix(scope, strings.TrimSuffix(glob, "*"))
	}
	return glob == scope
}
