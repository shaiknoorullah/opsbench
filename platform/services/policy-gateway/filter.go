package policygateway

import (
	"sort"
	"strings"
	"sync"
)

// ToolRef identifies a tool for list-phase filtering: its Cedar resource identity
// (id + type + owning-team parents) and the attributes policies evaluate.
type ToolRef struct {
	ID      string
	Type    string         // Cedar entity type (default "Tool")
	Parents []string       // owning teams
	Attrs   map[string]any // env, danger, read_only, ...
}

// listPermit reports whether the principal may see the tool (Action "list").
func (e *CedarEngine) listPermit(principal string, teams []string, t ToolRef) bool {
	return e.Decide(Request{
		Principal:       principal,
		PrincipalTeams:  teams,
		Action:          "list",
		Resource:        t.ID,
		ResourceType:    t.Type,
		ResourceParents: t.Parents,
		ResourceAttrs:   t.Attrs,
	}).Effect == "permit"
}

// ToolFilter removes tools an agent may not see from tool lists — the first of GOV-002's
// two enforcement points. Cedar has no stateful partial evaluation, so filtering is N
// cheap per-tool stateful calls (spec §3, A1); ToolFilter caches each per-(agent-scope,
// tool) decision, keyed by the engine's policy version so a policy change invalidates it.
type ToolFilter struct {
	engine  *CedarEngine
	version string
	mu      sync.Mutex
	cache   map[string]bool
	hits    int
}

// NewToolFilter builds a filter bound to the engine's current policy version.
func NewToolFilter(e *CedarEngine) *ToolFilter {
	return &ToolFilter{engine: e, version: e.PolicyVersion(), cache: map[string]bool{}}
}

// Filter returns the subset of tools the principal is permitted to list.
func (f *ToolFilter) Filter(principal string, teams []string, tools []ToolRef) []ToolRef {
	scope := f.scopeKey(principal, teams)
	out := make([]ToolRef, 0, len(tools))
	for _, t := range tools {
		key := scope + "|" + t.ID
		f.mu.Lock()
		allowed, ok := f.cache[key]
		if ok {
			f.hits++
		}
		f.mu.Unlock()
		if !ok {
			allowed = f.engine.listPermit(principal, teams, t)
			f.mu.Lock()
			f.cache[key] = allowed
			f.mu.Unlock()
		}
		if allowed {
			out = append(out, t)
		}
	}
	return out
}

// Hits reports the number of per-tool cache hits (observability/tests).
func (f *ToolFilter) Hits() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.hits
}

// Invalidate clears the cache. A policy change already invalidates via the version key;
// call this when the tool universe changes within a single policy version.
func (f *ToolFilter) Invalidate() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.cache = map[string]bool{}
}

func (f *ToolFilter) scopeKey(principal string, teams []string) string {
	ts := append([]string(nil), teams...)
	sort.Strings(ts)
	return f.version + "|" + principal + "|" + strings.Join(ts, ",")
}
