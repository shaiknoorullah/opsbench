package policygateway

import "sync"

// ToolMeta is the entity metadata a tool needs for policy evaluation: its owning teams
// (Cedar parents) and attributes (env, danger, read_only, ...). In production this comes
// from the connector/tool registry (C10).
type ToolMeta struct {
	Parents []string
	Attrs   map[string]any
}

// Store supplies the entity metadata policies evaluate, given only the ids a caller has
// (e.g. the gatekeeper passes an agent SPIFFE id + a tool name). In production it is
// backed by the identity registry (C7: agent -> teams) and the tool registry (C10: tool
// -> attributes). Unknown ids yield empty metadata; default-deny then does the rest.
type Store interface {
	AgentTeams(agentID string) []string
	Tool(toolID string) (ToolMeta, bool)
}

// MemoryStore is a concurrency-safe in-memory Store for tests and single-node runs. It is
// safe for concurrent reads (during policy evaluation) and writes (dynamic registration).
type MemoryStore struct {
	mu    sync.RWMutex
	teams map[string][]string
	tools map[string]ToolMeta
}

// NewMemoryStore returns an empty in-memory store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{teams: map[string][]string{}, tools: map[string]ToolMeta{}}
}

// SetAgentTeams records an agent's team memberships (the input is copied).
func (s *MemoryStore) SetAgentTeams(agentID string, teams ...string) {
	s.mu.Lock()
	s.teams[agentID] = append([]string(nil), teams...)
	s.mu.Unlock()
}

// SetTool records a tool's entity metadata.
func (s *MemoryStore) SetTool(toolID string, meta ToolMeta) {
	s.mu.Lock()
	s.tools[toolID] = meta
	s.mu.Unlock()
}

// AgentTeams returns a copy of the agent's team memberships (nil if unknown).
func (s *MemoryStore) AgentTeams(agentID string) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]string(nil), s.teams[agentID]...)
}

// Tool returns the tool's metadata and whether it is known.
func (s *MemoryStore) Tool(toolID string) (ToolMeta, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	m, ok := s.tools[toolID]
	return m, ok
}

// SnapshotTools returns a shallow copy of all tool metadata keyed by tool id, for listing.
func (s *MemoryStore) SnapshotTools() map[string]ToolMeta {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]ToolMeta, len(s.tools))
	for k, v := range s.tools {
		out[k] = v
	}
	return out
}
