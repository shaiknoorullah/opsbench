package spine

import (
	"fmt"
	"net/http"
	"sort"

	gatekeeper "github.com/shaiknoorullah/opsbench/platform/services/gatekeeper"
	identityregistry "github.com/shaiknoorullah/opsbench/platform/services/identity-registry"
)

// The admin API registers the entities the governed-action flow operates on, so a running
// server is standalone rather than seeded in-process. Agent ids are SPIFFE URIs (they
// contain '/' and ':'), so id-addressed operations take the id as a query parameter rather
// than a path segment (path cleaning would corrupt the '//'). These endpoints are
// unauthenticated for now — an authz layer is a later slice.

// --- DTOs ---

type agentRequest struct {
	ID         string   `json:"id"`
	Teams      []string `json:"teams"`
	Scopes     []string `json:"scopes"`
	Owner      string   `json:"owner"`
	Autonomy   int      `json:"autonomy"` // 0..4 -> L0..L4
	OnBehalfOf []string `json:"on_behalf_of"`
}

type agentResponse struct {
	ID         string   `json:"id"`
	TenantID   string   `json:"tenant_id"`
	Teams      []string `json:"teams"`
	Scopes     []string `json:"scopes"`
	Owner      string   `json:"owner"`
	Autonomy   string   `json:"autonomy"` // "L0".."L4"
	OnBehalfOf []string `json:"on_behalf_of"`
}

type toolRequest struct {
	Name    string         `json:"name"`
	Kind    string         `json:"kind"`    // executable factory; currently "demo"
	Parents []string       `json:"parents"` // owning teams (Cedar parents)
	Attrs   map[string]any `json:"attrs"`   // env, danger, read_only, ...
}

type toolResponse struct {
	Name    string         `json:"name"`
	Parents []string       `json:"parents"`
	Attrs   map[string]any `json:"attrs"`
}

// --- agent handlers ---

// handleRegisterAgent upserts a non-human identity (C7). Re-registering an id clears a
// prior revocation.
func (s *Server) handleRegisterAgent(w http.ResponseWriter, r *http.Request) {
	var req agentRequest
	if !decode(w, r, &req) {
		return
	}
	if req.ID == "" {
		writeErr(w, http.StatusBadRequest, "id is required")
		return
	}
	if req.Autonomy < int(identityregistry.L0) || req.Autonomy > int(identityregistry.L4) {
		writeErr(w, http.StatusBadRequest, "autonomy must be 0..4")
		return
	}
	a := identityregistry.Agent{
		ID: req.ID, TenantID: s.sp.tenant, Teams: req.Teams, Scopes: req.Scopes,
		Owner: req.Owner, Autonomy: identityregistry.AutonomyLevel(req.Autonomy), OnBehalfOf: req.OnBehalfOf,
	}
	s.sp.RegisterAgent(a)
	// Echo what was registered rather than reading it back — a concurrent revoke between
	// register and lookup would otherwise return a zero agent.
	writeJSON(w, http.StatusOK, agentDTO(a))
}

// handleAgents lists active agents, or returns a single agent when ?id= is supplied.
func (s *Server) handleAgents(w http.ResponseWriter, r *http.Request) {
	if id := r.URL.Query().Get("id"); id != "" {
		a, ok := s.sp.ids.Lookup(id)
		if !ok {
			writeErr(w, http.StatusNotFound, "no active agent "+id)
			return
		}
		writeJSON(w, http.StatusOK, agentDTO(a))
		return
	}
	agents := s.sp.ids.List()
	out := make([]agentResponse, 0, len(agents))
	for _, a := range agents {
		out = append(out, agentDTO(a))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	writeJSON(w, http.StatusOK, out)
}

// handleRevokeAgent revokes an identity (its authorizations and credentials must stop).
func (s *Server) handleRevokeAgent(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		writeErr(w, http.StatusBadRequest, "id query parameter is required")
		return
	}
	if !s.sp.Revoke(id) {
		writeErr(w, http.StatusNotFound, "no agent "+id)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "revoked": true})
}

// --- tool handlers ---

// handleRegisterTool registers a tool: its policy metadata (owning teams + attributes) plus
// an executable bound by `kind`. Real connectors (C10) will supply kinds; only "demo"
// exists today.
func (s *Server) handleRegisterTool(w http.ResponseWriter, r *http.Request) {
	var req toolRequest
	if !decode(w, r, &req) {
		return
	}
	if req.Name == "" {
		writeErr(w, http.StatusBadRequest, "name is required")
		return
	}
	tool, err := buildTool(req.Kind, req.Name)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	s.sp.RegisterTool(req.Parents, req.Attrs, tool)
	writeJSON(w, http.StatusOK, toolResponse{Name: req.Name, Parents: req.Parents, Attrs: req.Attrs})
}

// handleTools lists registered tool metadata.
func (s *Server) handleTools(w http.ResponseWriter, _ *http.Request) {
	metas := s.sp.tools.SnapshotTools()
	out := make([]toolResponse, 0, len(metas))
	for name, meta := range metas {
		out = append(out, toolResponse{Name: name, Parents: meta.Parents, Attrs: meta.Attrs})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	writeJSON(w, http.StatusOK, out)
}

// --- mapping ---

func agentDTO(a identityregistry.Agent) agentResponse {
	return agentResponse{
		ID: a.ID, TenantID: a.TenantID, Teams: a.Teams, Scopes: a.Scopes,
		Owner: a.Owner, Autonomy: a.Autonomy.String(), OnBehalfOf: a.OnBehalfOf,
	}
}

// buildTool constructs the executable behind a registered tool. `kind` selects a built-in
// factory; unknown kinds are rejected (fail closed).
func buildTool(kind, name string) (gatekeeper.Tool, error) {
	switch kind {
	case "demo":
		return NewDemoTool(name), nil
	default:
		return nil, fmt.Errorf("unknown tool kind %q (supported: demo)", kind)
	}
}
