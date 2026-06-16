package gatekeeper

import (
	"context"
	"time"

	auditledger "github.com/shaiknoorullah/opsbench/platform/services/audit-ledger"
)

// ledgerAdapter bridges the gatekeeper's Ledger seam to the C5 audit-ledger appender,
// so decisions and outcomes land on the real tamper-evident chain.
type ledgerAdapter struct {
	app *auditledger.LedgerAppender
	now func() time.Time
}

// NewLedgerAdapter wraps a C5 LedgerAppender as a gatekeeper Ledger.
func NewLedgerAdapter(app *auditledger.LedgerAppender) Ledger {
	return &ledgerAdapter{app: app, now: time.Now}
}

func (l *ledgerAdapter) Record(ctx context.Context, e AuditEntry) (string, error) {
	var resources []auditledger.Resource
	if e.Resource != "" {
		resources = append(resources, auditledger.Resource{System: e.Resource, Ref: e.Resource, DataClass: "config"})
	}
	in := auditledger.AppendInput{
		TenantID:        e.TenantID,
		TS:              l.now().UTC().Format(time.RFC3339Nano),
		Agent:           auditledger.Agent{ID: e.Agent},
		DelegationChain: e.DelegationChain,
		Resources:       resources,
		Operation:       auditledger.Operation{Kind: e.Kind, Name: e.Operation, PayloadHash: e.PayloadHash},
		Decision:        auditledger.Decision{Effect: e.Effect, PolicyRefs: e.PolicyRefs},
		Outcome:         auditledger.Outcome{Status: e.OutcomeStatus},
		Context:         &auditledger.Context{TaskID: e.TaskID, OnBehalfOf: e.OnBehalfOf, ApprovalRef: e.ApprovalRef},
	}
	r, err := l.app.Append(in)
	if err != nil {
		return "", err
	}
	return r.ID, nil
}
