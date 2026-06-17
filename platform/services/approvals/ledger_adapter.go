package approvals

import (
	"context"
	"time"

	auditledger "github.com/shaiknoorullah/opsbench/platform/services/audit-ledger"
)

// c5Adapter bridges the C3 Ledger seam to the C5 audit-ledger appender, so every
// approval transition lands on the real tamper-evident, per-tenant hash chain (DP-3).
type c5Adapter struct {
	app *auditledger.LedgerAppender
	now func() time.Time
}

// NewC5Ledger wraps a C5 LedgerAppender as a C3 Ledger.
func NewC5Ledger(app *auditledger.LedgerAppender) Ledger {
	return &c5Adapter{app: app, now: time.Now}
}

func (l *c5Adapter) Record(_ context.Context, e LedgerEntry) (string, error) {
	in := auditledger.AppendInput{
		TenantID:        e.TenantID,
		TS:              l.now().UTC().Format(time.RFC3339Nano),
		Agent:           auditledger.Agent{ID: e.By}, // the deciding identity (empty for create/expire)
		DelegationChain: []string{},
		Resources:       []auditledger.Resource{{System: "approvals", Ref: e.ApprovalID, DataClass: "control"}},
		Operation:       auditledger.Operation{Kind: "approval", Name: e.Transition, PayloadHash: e.PayloadHash},
		Decision:        auditledger.Decision{Effect: e.Effect},
		Outcome:         auditledger.Outcome{Status: "recorded"},
		Context:         &auditledger.Context{ApprovalRef: e.ApprovalID},
	}
	r, err := l.app.Append(in)
	if err != nil {
		return "", err
	}
	return r.ID, nil
}
