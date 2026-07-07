package gatekeeper

import (
	"context"
	"sync"
	"time"

	auditledger "github.com/shaiknoorullah/opsbench/platform/services/audit-ledger"
)

// Config wires the gatekeeper's collaborators. Freeze is optional (nil => never frozen).
type Config struct {
	Policy    PolicyEngine
	Approvals ApprovalGate
	Broker    CredentialBroker
	Freeze    FreezeChecker
	Ledger    Ledger
	Now       func() time.Time
}

// Gatekeeper is the actuation control point (C2). Agents never hold write credentials;
// they propose Actions and only Execute mutates anything.
type Gatekeeper struct {
	cfg Config

	mu    sync.RWMutex // guards tools (registration may run concurrently with Execute)
	tools map[string]Tool
}

func New(cfg Config) *Gatekeeper {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	return &Gatekeeper{cfg: cfg, tools: make(map[string]Tool)}
}

// Register makes a tool available for execution. Safe to call concurrently with Execute.
func (g *Gatekeeper) Register(t Tool) {
	g.mu.Lock()
	g.tools[t.Name()] = t
	g.mu.Unlock()
}

// tool looks up a registered tool under the read lock.
func (g *Gatekeeper) tool(name string) Tool {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.tools[name]
}

// payloadHash pins the exact payload via canonical JSON + SHA-256 (reuses C5's hashing).
func payloadHash(p map[string]any) (string, error) {
	c, err := auditledger.Canonicalize(p)
	if err != nil {
		return "", err
	}
	return auditledger.SHA256(c), nil
}

// Execute runs the governed-mutation flow (C2 design §1). Order is normative; every
// step is fail-closed (NF-005). Governance outcomes return a nil error; collaborator
// failures and apply errors return a non-nil error alongside a fail-closed Result.
func (g *Gatekeeper) Execute(ctx context.Context, a Action) (Result, error) {
	ph, err := payloadHash(a.Payload)
	if err != nil {
		return Result{Outcome: OutcomeDenied, Reason: "payload hash error"}, err
	}
	chain := make([]string, 0, 2)
	if a.OnBehalfOf != "" {
		chain = append(chain, a.OnBehalfOf)
	}
	chain = append(chain, a.Agent)

	rec := func(kind, effect, status string, refs []string) (string, error) {
		return g.cfg.Ledger.Record(ctx, AuditEntry{
			TenantID: a.TenantID, Agent: a.Agent, DelegationChain: chain,
			Kind: kind, Operation: a.Tool, Resource: a.Resource, PayloadHash: ph,
			Effect: effect, OutcomeStatus: status, PolicyRefs: refs,
			TaskID: a.TaskID, OnBehalfOf: a.OnBehalfOf,
		})
	}
	denied := func(reason string, tier int) Result {
		return Result{Outcome: OutcomeDenied, Reason: reason, Tier: tier, PayloadHash: ph}
	}

	// 2. Policy decision.
	dec, err := g.cfg.Policy.Decide(ctx, a.Agent, "tool:"+a.Tool, a.Resource, map[string]any{"justification": a.Justification})
	if err != nil {
		_, _ = rec("policy_decision", "deny", "denied", nil)
		return denied("policy engine unavailable", 0), err
	}
	if dec.Effect != "permit" {
		if _, lerr := rec("policy_decision", "deny", "denied", dec.PolicyRefs); lerr != nil {
			return denied("policy denied; ledger unavailable", dec.Tier), lerr
		}
		return denied("policy denied", dec.Tier), nil
	}
	// DP-3: the permit decision must be durably recorded before any effect. Fail closed.
	if _, lerr := rec("policy_decision", "permit", "ok", dec.PolicyRefs); lerr != nil {
		return denied("cannot record decision (ledger unavailable)", dec.Tier), lerr
	}

	// 3. Freeze window.
	if g.cfg.Freeze != nil {
		frozen, reason, ferr := g.cfg.Freeze.IsFrozen(ctx, a.TenantID, a.Resource)
		if ferr != nil {
			_, _ = rec("policy_decision", "deny", "denied", nil)
			return denied("freeze check failed (fail frozen)", dec.Tier), ferr
		}
		if frozen {
			_, _ = rec("policy_decision", "deny", "denied", nil)
			return denied("change freeze active: "+reason, dec.Tier), nil
		}
	}

	// 4. Tool + dry-run contract (GOV-003 auto-escalation).
	tool := g.tool(a.Tool)
	if tool == nil {
		_, _ = rec("tool_call", "deny", "denied", nil)
		return denied("unknown tool: "+a.Tool, dec.Tier), nil
	}
	tier := dec.Tier
	if !tool.HasDryRun() && tier < 3 {
		tier = 3
	}

	// 5. Forced dry-run (when supported).
	var dr DryRunResult
	if tool.HasDryRun() {
		dr, err = tool.DryRun(ctx, a.Payload)
		if err != nil {
			_, _ = rec("tool_call", "deny", "error", nil)
			return denied("dry-run failed", tier), err
		}
	}

	// 6. Approval for tier >= 2.
	if tier >= 2 {
		out, aerr := g.cfg.Approvals.Request(ctx, ApprovalRequest{
			TenantID: a.TenantID, ActionRef: a.TaskID, Tier: tier, PayloadHash: ph, Diff: dr.Diff,
		})
		if aerr != nil {
			_, _ = rec("approval", "deny", "error", nil)
			return denied("approval gate unavailable", tier), aerr
		}
		if !out.Approved {
			_, _ = rec("approval", "deny", "denied", nil)
			return denied("approval rejected", tier), nil
		}
		if out.PayloadHashSeen != ph {
			_, _ = rec("approval", "deny", "denied", nil)
			return Result{Outcome: OutcomeInvalidated, Reason: "approver saw a different payload (GOV-004)", Tier: tier, PayloadHash: ph}, nil
		}
	}

	// 7. GOV-004 re-hash + GOV-003 apply-time divergence.
	ph2, err := payloadHash(a.Payload)
	if err != nil {
		return denied("payload re-hash error", tier), err
	}
	if ph2 != ph {
		_, _ = rec("tool_call", "deny", "denied", nil)
		return Result{Outcome: OutcomeInvalidated, Reason: "payload changed after approval (GOV-004)", Tier: tier, PayloadHash: ph}, nil
	}
	if tool.HasDryRun() {
		dr2, derr := tool.DryRun(ctx, a.Payload)
		if derr != nil {
			_, _ = rec("tool_call", "deny", "error", nil)
			return denied("apply-time dry-run failed", tier), derr
		}
		if dr2.EffectHash != dr.EffectHash {
			_, _ = rec("tool_call", "deny", "denied", nil)
			return Result{Outcome: OutcomeBlocked, Reason: "apply-time dry-run divergence (GOV-003)", Tier: tier, PayloadHash: ph}, nil
		}
	}

	// 8. Just-in-time write credential (distinct from any read credential).
	cred, cerr := g.cfg.Broker.MintWrite(ctx, a.Agent, a.TaskID, a.Resource)
	if cerr != nil {
		_, _ = rec("tool_call", "deny", "error", nil)
		return denied("credential mint failed", tier), cerr
	}

	// 9. Apply.
	ar, aerr := tool.Apply(ctx, a.Payload, cred)
	if aerr != nil {
		_, _ = rec("tool_call", "permit", "error", dec.PolicyRefs)
		return Result{Outcome: OutcomeFailed, Reason: "apply failed: " + aerr.Error(), Tier: tier, PayloadHash: ph, RollbackHandle: ar.RollbackHandle}, aerr
	}

	// 10. Outcome must be durably recorded before success is acknowledged.
	outID, lerr := rec("tool_call", "permit", "ok", dec.PolicyRefs)
	if lerr != nil {
		return Result{Outcome: OutcomeFailed, Reason: "executed but outcome not durably recorded", Tier: tier, PayloadHash: ph, RollbackHandle: ar.RollbackHandle}, lerr
	}
	return Result{Outcome: OutcomeExecuted, Tier: tier, PayloadHash: ph, RollbackHandle: ar.RollbackHandle, LedgerID: outID}, nil
}
