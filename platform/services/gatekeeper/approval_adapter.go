package gatekeeper

import (
	"context"

	approvals "github.com/shaiknoorullah/opsbench/platform/services/approvals"
)

// ReviewerResolver decides who may approve a given action. In the full system this is
// driven by C1 policy (role/group bindings on the matched policy); the adapter takes it
// as a function so C2 stays decoupled from how eligibility is sourced.
type ReviewerResolver func(req ApprovalRequest) []string

// approvalAdapter bridges C2's ApprovalGate to the real C3 approvals.Service, so the
// gatekeeper blocks on a genuine hash-pinned, tiered, audited approval object rather
// than a stub. Request rejoins an existing object for the same action ref (idempotent).
type approvalAdapter struct {
	svc      *approvals.Service
	eligible ReviewerResolver
}

// NewApprovalAdapter wraps a C3 Service as a C2 ApprovalGate. resolve supplies the
// eligible reviewers per request; nil means none are eligible (fail-closed: no one can
// approve, so tier ≥ 2 actions cannot execute).
func NewApprovalAdapter(svc *approvals.Service, resolve ReviewerResolver) ApprovalGate {
	if resolve == nil {
		resolve = func(ApprovalRequest) []string { return nil }
	}
	return &approvalAdapter{svc: svc, eligible: resolve}
}

func (a *approvalAdapter) Request(ctx context.Context, req ApprovalRequest) (ApprovalOutcome, error) {
	out, err := a.svc.Request(ctx, approvals.CreateInput{
		TenantID:    req.TenantID,
		ActionRef:   req.ActionRef,
		Tier:        req.Tier,
		PayloadHash: req.PayloadHash,
		Diff:        approvals.Diff{Format: "unified", Body: req.Diff},
		Risk:        approvals.Risk{Irreversible: req.Tier >= 3},
		Eligible:    a.eligible(req),
	})
	if err != nil {
		return ApprovalOutcome{}, err
	}
	return ApprovalOutcome{Approved: out.Approved, By: out.By, PayloadHashSeen: out.PayloadHashSeen}, nil
}
