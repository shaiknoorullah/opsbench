package policygateway

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

// MemoryStore is an in-memory Store for tests and single-node runs.
type MemoryStore struct {
	Teams map[string][]string
	Tools map[string]ToolMeta
}

// NewMemoryStore returns an empty in-memory store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{Teams: map[string][]string{}, Tools: map[string]ToolMeta{}}
}

// SetAgentTeams records an agent's team memberships.
func (s *MemoryStore) SetAgentTeams(agentID string, teams ...string) { s.Teams[agentID] = teams }

// SetTool records a tool's entity metadata.
func (s *MemoryStore) SetTool(toolID string, meta ToolMeta) { s.Tools[toolID] = meta }

// AgentTeams returns the agent's team memberships (nil if unknown).
func (s *MemoryStore) AgentTeams(agentID string) []string { return s.Teams[agentID] }

// Tool returns the tool's metadata and whether it is known.
func (s *MemoryStore) Tool(toolID string) (ToolMeta, bool) { m, ok := s.Tools[toolID]; return m, ok }
