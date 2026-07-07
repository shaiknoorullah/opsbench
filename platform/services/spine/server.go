package spine

import (
	"encoding/json"
	"errors"
	"net/http"

	approvals "github.com/shaiknoorullah/opsbench/platform/services/approvals"
	auditledger "github.com/shaiknoorullah/opsbench/platform/services/audit-ledger"
	gatekeeper "github.com/shaiknoorullah/opsbench/platform/services/gatekeeper"
)

// Server is the HTTP front door for an assembled Spine (one tenant). It exposes the
// governed-action flow:
//
//	POST /v1/actions                    propose an action; long-polls through the approval
//	                                    gate and returns the governed outcome
//	GET  /v1/approvals/by-action/{ref}  render the pending approval for a task (id, pinned
//	                                    payload hash, diff) so a reviewer can attest it
//	POST /v1/approvals/{id}/decide      a reviewer approves/rejects out of band
//	GET  /v1/evidence                   the offline-verifiable audit chain
//	GET  /healthz                       liveness
//
// Handlers are thin: all governance lives in the spine components, and every seam fails
// closed. Identity/tool registration is done in-process at startup (an admin API is a
// later slice), so the server governs the action flow for one already-seeded tenant.
type Server struct {
	sp  *Spine
	mux *http.ServeMux
}

// NewServer builds the HTTP handler for an assembled, seeded Spine.
func NewServer(sp *Spine) *Server {
	s := &Server{sp: sp, mux: http.NewServeMux()}
	s.mux.HandleFunc("POST /v1/actions", s.handleAction)
	s.mux.HandleFunc("GET /v1/approvals/by-action/{ref}", s.handleApprovalByAction)
	s.mux.HandleFunc("POST /v1/approvals/{id}/decide", s.handleDecide)
	s.mux.HandleFunc("GET /v1/evidence", s.handleEvidence)
	s.mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
	})
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

// --- request/response DTOs (the JSON API contract) ---

type actionRequest struct {
	Agent         string         `json:"agent"`
	Tool          string         `json:"tool"`
	Resource      string         `json:"resource"`
	Payload       map[string]any `json:"payload"`
	Justification string         `json:"justification"`
	OnBehalfOf    string         `json:"on_behalf_of"`
	TaskID        string         `json:"task_id"`
}

type resultResponse struct {
	Outcome        string `json:"outcome"`
	Reason         string `json:"reason,omitempty"`
	Tier           int    `json:"tier"`
	PayloadHash    string `json:"payload_hash,omitempty"`
	RollbackHandle string `json:"rollback_handle,omitempty"`
	LedgerID       string `json:"ledger_id,omitempty"`
	Error          string `json:"error,omitempty"`
}

type decideRequest struct {
	Decision        string `json:"decision"` // "approve" | "reject"
	By              string `json:"by"`
	PayloadHashSeen string `json:"payload_hash_seen"`
}

type approvalResponse struct {
	ID          string   `json:"id"`
	ActionRef   string   `json:"action_ref"`
	Tier        int      `json:"tier"`
	PayloadHash string   `json:"payload_hash"`
	State       string   `json:"state"`
	Diff        string   `json:"diff,omitempty"`
	Eligible    []string `json:"eligible"`
	ExpiresAt   string   `json:"expires_at"`
}

type evidenceRecord struct {
	Seq         int64  `json:"seq"`
	Kind        string `json:"kind"`
	Name        string `json:"name"`
	Effect      string `json:"effect"`
	Outcome     string `json:"outcome"`
	PayloadHash string `json:"payload_hash,omitempty"`
}

type evidenceResponse struct {
	Tenant         string           `json:"tenant"`
	Verified       bool             `json:"verified"`
	RecordsChecked int              `json:"records_checked"`
	Records        []evidenceRecord `json:"records"`
}

// --- handlers ---

// handleAction proposes an action. For a tiered action it blocks in the gatekeeper's
// approval gate until a reviewer decides via POST /v1/approvals/{id}/decide (or the request
// context is cancelled); untiered actions return immediately.
func (s *Server) handleAction(w http.ResponseWriter, r *http.Request) {
	var req actionRequest
	if !decode(w, r, &req) {
		return
	}
	if req.Agent == "" || req.Tool == "" || req.TaskID == "" || req.Payload == nil {
		writeErr(w, http.StatusBadRequest, "agent, tool, task_id, and payload are required")
		return
	}
	res, err := s.sp.Execute(r.Context(), gatekeeper.Action{
		TenantID:      s.sp.tenant,
		Agent:         req.Agent,
		Tool:          req.Tool,
		Resource:      req.Resource,
		Payload:       req.Payload,
		Justification: req.Justification,
		OnBehalfOf:    req.OnBehalfOf,
		TaskID:        req.TaskID,
	})
	resp := resultResponse{
		Outcome: string(res.Outcome), Reason: res.Reason, Tier: res.Tier,
		PayloadHash: res.PayloadHash, RollbackHandle: res.RollbackHandle, LedgerID: res.LedgerID,
	}
	if err != nil {
		resp.Error = err.Error()
	}
	writeJSON(w, statusForOutcome(res.Outcome, err), resp)
}

// handleApprovalByAction renders the pending approval for a task ref, so a reviewer/surface
// can see the pinned payload hash and diff before attesting.
func (s *Server) handleApprovalByAction(w http.ResponseWriter, r *http.Request) {
	obj, err := s.sp.approvals.GetByAction(r.Context(), s.sp.tenant, r.PathValue("ref"))
	if err != nil {
		if errors.Is(err, approvals.ErrNotFound) {
			writeErr(w, http.StatusNotFound, "no approval for action "+r.PathValue("ref"))
			return
		}
		writeErr(w, http.StatusBadGateway, err.Error()) // operational failure — fail closed, don't mask as 404
		return
	}
	writeJSON(w, http.StatusOK, approvalDTO(obj))
}

// handleDecide applies a reviewer decision to a pending approval, unblocking any action
// request waiting on it. GOV-004: payload_hash_seen must equal the pinned hash.
func (s *Server) handleDecide(w http.ResponseWriter, r *http.Request) {
	var req decideRequest
	if !decode(w, r, &req) {
		return
	}
	kind, ok := decisionKind(req.Decision)
	if !ok {
		writeErr(w, http.StatusBadRequest, `decision must be "approve" or "reject"`)
		return
	}
	if req.By == "" {
		writeErr(w, http.StatusBadRequest, "by is required")
		return
	}
	obj, err := s.sp.approvals.Decide(r.Context(), approvals.DecideInput{
		ApprovalID:      r.PathValue("id"),
		Decision:        kind,
		By:              req.By,
		Surface:         "http",
		PayloadHashSeen: req.PayloadHashSeen,
	})
	if err != nil {
		writeErr(w, statusForDecideErr(err), err.Error())
		return
	}
	writeJSON(w, http.StatusOK, approvalDTO(obj))
}

// handleEvidence returns the tenant's offline-verifiable audit chain.
func (s *Server) handleEvidence(w http.ResponseWriter, r *http.Request) {
	vr, recs, err := s.sp.VerifyEvidence(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, evidenceDTO(s.sp.tenant, vr, recs))
}

// --- mapping helpers ---

func approvalDTO(o approvals.ApprovalObject) approvalResponse {
	return approvalResponse{
		ID: o.ID, ActionRef: o.ActionRef, Tier: o.Tier, PayloadHash: o.PayloadHash,
		State: string(o.State), Diff: o.Diff.Body, Eligible: o.Reviewers.Eligible, ExpiresAt: o.ExpiresAt,
	}
}

func evidenceDTO(tenant string, vr auditledger.VerifyResult, recs []auditledger.AuditRecord) evidenceResponse {
	out := evidenceResponse{Tenant: tenant, Verified: vr.OK, RecordsChecked: vr.RecordsChecked}
	for _, r := range recs {
		out.Records = append(out.Records, evidenceRecord{
			Seq: r.Seq, Kind: r.Operation.Kind, Name: r.Operation.Name,
			Effect: r.Decision.Effect, Outcome: r.Outcome.Status, PayloadHash: r.Operation.PayloadHash,
		})
	}
	return out
}

// statusForOutcome maps a governed outcome to an HTTP status. A denial carrying a Go error
// is a fail-closed collaborator failure (502); a clean policy/freeze/rejection denial is 403.
func statusForOutcome(o gatekeeper.Outcome, err error) int {
	switch o {
	case gatekeeper.OutcomeExecuted:
		return http.StatusOK
	case gatekeeper.OutcomeDenied:
		if err != nil {
			return http.StatusBadGateway
		}
		return http.StatusForbidden
	case gatekeeper.OutcomeInvalidated, gatekeeper.OutcomeBlocked:
		return http.StatusConflict
	default: // OutcomeFailed or anything unexpected
		return http.StatusInternalServerError
	}
}

func statusForDecideErr(err error) int {
	switch {
	case errors.Is(err, approvals.ErrNotFound):
		return http.StatusNotFound
	case errors.Is(err, approvals.ErrNotEligible):
		return http.StatusForbidden
	case errors.Is(err, approvals.ErrWrongState):
		return http.StatusConflict
	default:
		return http.StatusBadGateway // e.g. ledger unavailable — fail closed
	}
}

func decisionKind(s string) (approvals.DecisionKind, bool) {
	switch s {
	case "approve", "approved":
		return approvals.DecisionApproved, true
	case "reject", "rejected":
		return approvals.DecisionRejected, true
	default:
		return "", false
	}
}

// --- io helpers ---

// decode reads a strict JSON body; on failure it writes 400 and returns false.
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
