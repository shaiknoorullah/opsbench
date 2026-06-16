// Package gatekeeper is C2 — the actuation gatekeeper: the single deterministic
// chokepoint every mutation passes through, sitting outside the agent's write scope
// (DP-1). See docs/superpowers/specs/opsbench-platform/components/C2-gatekeeper.md.
package gatekeeper

import (
	"context"
	"time"
)

// Action is a mutation an agent proposes. The gatekeeper — never the agent — executes it.
type Action struct {
	TenantID      string
	Agent         string // SPIFFE id
	Tool          string // registered tool name
	Resource      string // scope uri
	Payload       map[string]any
	Justification string
	OnBehalfOf    string // human in the delegation chain
	TaskID        string
}

// Outcome is the terminal classification of an Execute call.
type Outcome string

const (
	OutcomeExecuted    Outcome = "executed"
	OutcomeDenied      Outcome = "denied"      // policy/freeze/fail-closed
	OutcomeInvalidated Outcome = "invalidated" // GOV-004 payload changed after approval
	OutcomeBlocked     Outcome = "blocked"     // GOV-003 apply-time dry-run divergence
	OutcomeFailed      Outcome = "failed"      // apply errored after passing all gates
)

// Result is what Execute returns. Governance outcomes (denied/invalidated/blocked)
// carry a nil error; collaborator/infra failures and apply errors carry a non-nil error
// alongside a fail-closed Result.
type Result struct {
	Outcome        Outcome
	Reason         string
	Tier           int
	PayloadHash    string
	RollbackHandle string
	LedgerID       string
}

// --- Tool contract (GOV-003) ---

type DryRunResult struct {
	Diff       string
	EffectHash string // hash of the computed effect; apply must reproduce it
}

type ApplyResult struct {
	RollbackHandle string
	Detail         string
}

// Tool must declare whether it supports a dry-run; tools without one auto-escalate to
// the highest approval tier (GOV-003).
type Tool interface {
	Name() string
	HasDryRun() bool
	DryRun(ctx context.Context, payload map[string]any) (DryRunResult, error)
	Apply(ctx context.Context, payload map[string]any, cred Credential) (ApplyResult, error)
}

// --- Collaborator seams (C1/C3/C4) ---

// Decision is the policy engine's verdict (C1).
type Decision struct {
	Effect           string // "permit" | "deny"
	Tier             int    // 0 auto · 1 notify · 2 single · 3 two-person
	PolicyRefs       []string
	DecisionRecordID string
}

type PolicyEngine interface {
	Decide(ctx context.Context, principal, action, resource string, attrs map[string]any) (Decision, error)
}

type ApprovalRequest struct {
	TenantID    string
	ActionRef   string
	Tier        int
	PayloadHash string
	Diff        string
}

type ApprovalOutcome struct {
	Approved        bool
	By              string
	PayloadHashSeen string // GOV-004: must equal the pinned payload hash
}

type ApprovalGate interface {
	Request(ctx context.Context, req ApprovalRequest) (ApprovalOutcome, error)
}

type Credential struct {
	Token     string
	ExpiresAt time.Time
}

type CredentialBroker interface {
	MintWrite(ctx context.Context, agent, taskID, scope string) (Credential, error)
}

// FreezeChecker is the GOV-009 placeholder (becomes policy-as-code at C1).
type FreezeChecker interface {
	IsFrozen(ctx context.Context, tenant, scope string) (frozen bool, reason string, err error)
}

// --- Ledger seam (C5) ---

// AuditEntry is the gatekeeper's view of an audit record; the C5 adapter maps it to the
// AuditRecord schema.
type AuditEntry struct {
	TenantID        string
	Agent           string
	DelegationChain []string
	Kind            string // "policy_decision" | "tool_call" | "approval"
	Operation       string // tool name
	Resource        string
	PayloadHash     string
	Effect          string // "permit" | "deny"
	OutcomeStatus   string // "ok" | "error" | "denied"
	PolicyRefs      []string
	TaskID          string
	OnBehalfOf      string
	ApprovalRef     string
}

// Ledger is the durable audit sink. Record returns only on durable commit; an error
// means the gatekeeper must fail closed (DP-3: no evidence → no action).
type Ledger interface {
	Record(ctx context.Context, e AuditEntry) (ledgerID string, err error)
}
