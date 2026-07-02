package policygateway

import (
	"encoding/json"
	"net/http"
)

// Server is C1's thin HTTP surface so C2 and the tool gateway can call the policy gateway
// across a process boundary. It is fail-closed: any malformed request or internal error
// yields a deny (never a permit).
//
//	POST /v1/decide        -> {effect, tier, policy_refs, decision_record_id}
//	POST /v1/tools/filter  -> {allowed: [tool ids]}
type Server struct {
	svc    *Service
	filter *ToolFilter
	mux    *http.ServeMux
}

// NewServer builds the HTTP surface over a decision Service and a ToolFilter (both bound
// to the same engine).
func NewServer(svc *Service, filter *ToolFilter) *Server {
	s := &Server{svc: svc, filter: filter, mux: http.NewServeMux()}
	s.mux.HandleFunc("/v1/decide", s.handleDecide)
	s.mux.HandleFunc("/v1/tools/filter", s.handleFilter)
	return s
}

// ServeHTTP dispatches to the gateway endpoints.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

type decideRequest struct {
	Principal string         `json:"principal"`
	Tool      string         `json:"tool"`
	Resource  string         `json:"resource"`
	Context   map[string]any `json:"context,omitempty"`
	Phase     string         `json:"phase,omitempty"`
}

type decideResponse struct {
	Effect           string   `json:"effect"`
	Tier             int      `json:"tier"`
	PolicyRefs       []string `json:"policy_refs,omitempty"`
	DecisionRecordID string   `json:"decision_record_id,omitempty"`
	Reason           string   `json:"reason,omitempty"`
}

func (s *Server) handleDecide(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeDeny(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req decideRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeDeny(w, http.StatusBadRequest, "invalid request body")
		return
	}
	phase := PhaseInvocation
	if req.Phase == string(PhaseToolListing) {
		phase = PhaseToolListing
	}
	d, err := s.svc.Evaluate(r.Context(), RequestRef{
		Principal: req.Principal, Tool: req.Tool, Resource: req.Resource, Context: req.Context,
	}, phase)
	if err != nil {
		// fail closed: a decision that cannot be recorded is not a permit (DP-3).
		writeDeny(w, http.StatusServiceUnavailable, "policy gateway unavailable")
		return
	}
	writeJSON(w, http.StatusOK, decideResponse{
		Effect: d.Effect, Tier: d.Tier, PolicyRefs: d.PolicyRefs, DecisionRecordID: d.DecisionRecordID,
	})
}

type filterRequest struct {
	Principal      string    `json:"principal"`
	PrincipalTeams []string  `json:"principal_teams,omitempty"`
	Tools          []ToolRef `json:"tools"`
}

type filterResponse struct {
	Allowed []string `json:"allowed"`
}

func (s *Server) handleFilter(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, filterResponse{Allowed: []string{}})
		return
	}
	var req filterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// fail closed: an unparseable list request exposes no tools.
		writeJSON(w, http.StatusBadRequest, filterResponse{Allowed: []string{}})
		return
	}
	allowed := s.filter.Filter(req.Principal, req.PrincipalTeams, req.Tools)
	ids := make([]string, 0, len(allowed))
	for _, t := range allowed {
		ids = append(ids, t.ID)
	}
	writeJSON(w, http.StatusOK, filterResponse{Allowed: ids})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeDeny(w http.ResponseWriter, status int, reason string) {
	writeJSON(w, status, decideResponse{Effect: "deny", Reason: reason})
}
