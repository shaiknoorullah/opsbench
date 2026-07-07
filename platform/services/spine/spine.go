// Package spine assembles the opsbench governed-action spine in one process: an agent
// proposes a mutation, and it flows C7 identity → C1 policy → C3 approval → C4 credential
// → C2 gatekeeper → C5 evidence. It is the composition root that wires the six merged
// component libraries into a single configured *gatekeeper.Gatekeeper, plus the registries
// that seed identities and tools.
//
// The point of this package is to prove the spine works as a system (not just as isolated
// libraries) and to produce a single, offline-verifiable evidence chain: C2 and C3 share
// one C5 appender, so policy decisions, approval transitions, and the tool call all land
// on the same tamper-evident, per-tenant hash chain.
//
// This is an in-process assembly (no HTTP surface yet — that is the next Phase-1 slice);
// stores are in-memory. It intentionally has no external dependencies (no DB / network).
package spine

import (
	"context"
	"fmt"
	"time"

	approvals "github.com/shaiknoorullah/opsbench/platform/services/approvals"
	auditledger "github.com/shaiknoorullah/opsbench/platform/services/audit-ledger"
	credentialbroker "github.com/shaiknoorullah/opsbench/platform/services/credential-broker"
	gatekeeper "github.com/shaiknoorullah/opsbench/platform/services/gatekeeper"
	identityregistry "github.com/shaiknoorullah/opsbench/platform/services/identity-registry"
	policygateway "github.com/shaiknoorullah/opsbench/platform/services/policy-gateway"
)

// DemoPolicy is the built-in Cedar policy for the assembled spine: SRE agents may invoke
// SRE-owned tools at tier 2 (single approval), and any dangerous production tool is
// forbidden (a forbid overrides the permit). Production loads a tenant policy set instead.
const DemoPolicy = `
@tier("2")
permit (
    principal in Team::"sre",
    action == Action::"invoke",
    resource in Team::"sre"
);

forbid (
    principal,
    action == Action::"invoke",
    resource
) when { resource.danger == true && resource.env == "prod" };
`

// Config parameterizes the assembled spine. Zero values fall back to safe defaults.
type Config struct {
	TenantID          string          // required
	PolicySource      []byte          // Cedar source; defaults to DemoPolicy
	EligibleReviewers []string        // who may approve tiered actions (production: from C1 policy)
	CredentialTTL     time.Duration   // write-credential lifetime; default credentialbroker.DefaultTTL
	FlushInterval     time.Duration   // C5 batch window; default 3ms
	Now               func() time.Time
}

// Spine is the assembled governed-action spine. Build it with New, seed it with
// RegisterAgent / RegisterTool, then run proposals through Execute (or ExecuteWithApproval
// for tiered actions). It is safe for concurrent Execute calls.
type Spine struct {
	tenant    string
	gk        *gatekeeper.Gatekeeper
	ids       *identityregistry.Registry
	tools     *policygateway.MemoryStore
	broker    *credentialbroker.Broker
	approvals *approvals.Service
	freeze    *policygateway.FreezeService
	ledgerApp *auditledger.LedgerAppender
	store     *auditledger.MemoryLedgerStore
	policyRec *policygateway.MemoryRecorder
}

// New wires the full spine. It returns an error only if the Cedar policy fails to parse.
func New(cfg Config) (*Spine, error) {
	if cfg.TenantID == "" {
		return nil, fmt.Errorf("spine: TenantID is required")
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	src := cfg.PolicySource
	if len(src) == 0 {
		src = []byte(DemoPolicy)
	}

	// C5 — one appender/store shared by C2 and C3 so evidence is a single chain.
	store := auditledger.NewMemoryLedgerStore()
	app := auditledger.NewLedgerAppender(store, auditledger.Options{FlushInterval: cfg.FlushInterval})

	// C7 — identity registry, and the tool-metadata source (C10 stand-in).
	ids := identityregistry.New()
	tools := policygateway.NewMemoryStore()

	// C1 — Cedar PDP whose entity store is C7 (agent→teams) + the tool source.
	engine, err := policygateway.NewCedarEngine(src)
	if err != nil {
		return nil, fmt.Errorf("spine: parse policy: %w", err)
	}
	policyRec := &policygateway.MemoryRecorder{}
	c1 := policygateway.NewService(engine, policyRec, cfg.TenantID,
		policygateway.WithStore(identityregistry.NewPolicyStore(ids, tools)),
		policygateway.WithClock(now),
	)

	// C3 — approvals, recording every transition onto the shared C5 chain.
	c3 := approvals.New(approvals.NewMemoryStore(), approvals.Options{
		Ledger:       approvals.NewC5Ledger(app),
		Now:          now,
		PollInterval: 5 * time.Millisecond,
	})

	// C4 — credential broker gated on C7 identity.
	var brokerOpts []credentialbroker.Option
	if cfg.CredentialTTL > 0 {
		brokerOpts = append(brokerOpts, credentialbroker.WithTTL(cfg.CredentialTTL))
	}
	if cfg.Now != nil {
		brokerOpts = append(brokerOpts, credentialbroker.WithClock(now))
	}
	broker := credentialbroker.New(ids, brokerOpts...)

	// C1 freeze gate (GOV-009).
	freeze := policygateway.NewFreezeService()

	eligible := append([]string(nil), cfg.EligibleReviewers...)
	gk := gatekeeper.New(gatekeeper.Config{
		Policy:    gatekeeper.NewPolicyAdapter(c1),
		Approvals: gatekeeper.NewApprovalAdapter(c3, func(gatekeeper.ApprovalRequest) []string { return eligible }),
		Broker:    gatekeeper.NewCredentialAdapter(broker),
		Freeze:    freeze,
		Ledger:    gatekeeper.NewLedgerAdapter(app),
		Now:       now,
	})

	return &Spine{
		tenant: cfg.TenantID, gk: gk, ids: ids, tools: tools, broker: broker,
		approvals: c3, freeze: freeze, ledgerApp: app, store: store, policyRec: policyRec,
	}, nil
}

// RegisterAgent seeds an identity into C7.
func (s *Spine) RegisterAgent(a identityregistry.Agent) { s.ids.Register(a) }

// RegisterTool makes a tool executable (C2) and gives C1 its entity metadata (owning teams
// + attributes). In production the metadata comes from C10; here it is supplied directly.
func (s *Spine) RegisterTool(parents []string, attrs map[string]any, tool gatekeeper.Tool) {
	s.tools.SetTool(tool.Name(), policygateway.ToolMeta{Parents: parents, Attrs: attrs})
	s.gk.Register(tool)
}

// Freeze activates a GOV-009 change freeze over a scope glob (exact, or "prefix*").
func (s *Spine) Freeze(scopeGlob, reason string) { s.freeze.Freeze(s.tenant, scopeGlob, reason) }

// Revoke revokes an identity in C7 (its authorizations and credentials must stop).
func (s *Spine) Revoke(agentID string) bool { return s.ids.Revoke(agentID) }

// Broker exposes the C4 broker for attribution-inventory inspection.
func (s *Spine) Broker() *credentialbroker.Broker { return s.broker }

// Execute runs a proposed action through the governed-mutation flow. For a tiered action
// (tier ≥ 2) it BLOCKS at the approval gate until a decision arrives — use
// ExecuteWithApproval / ExecuteWithRejection to drive the reviewer in-process.
func (s *Spine) Execute(ctx context.Context, a gatekeeper.Action) (gatekeeper.Result, error) {
	return s.gk.Execute(ctx, a)
}

// ExecuteWithApproval runs the action and, concurrently, approves the pending approval as
// `by` (an eligible reviewer attesting the pinned payload). It returns the terminal result.
func (s *Spine) ExecuteWithApproval(ctx context.Context, a gatekeeper.Action, by string) (gatekeeper.Result, error) {
	return s.executeWithDecision(ctx, a, by, approvals.DecisionApproved)
}

// ExecuteWithRejection runs the action and, concurrently, rejects the pending approval as
// `by`. It returns the terminal (denied) result.
func (s *Spine) ExecuteWithRejection(ctx context.Context, a gatekeeper.Action, by string) (gatekeeper.Result, error) {
	return s.executeWithDecision(ctx, a, by, approvals.DecisionRejected)
}

type execResult struct {
	res gatekeeper.Result
	err error
}

// executeWithDecision runs Execute in a goroutine and, in this goroutine, drives the
// reviewer decision as soon as the pending approval object appears.
//
// Execute blocks in C3.Request at the approval gate until the approval reaches a terminal
// state. So this helper must guarantee that either the decision resolves the approval, or
// Execute is unblocked another way — otherwise a misuse (an ineligible reviewer, or a
// single sign-off on a two-person action) would hang forever. It derives a cancelable
// context and cancels Execute when the decision cannot resolve the approval.
func (s *Spine) executeWithDecision(ctx context.Context, a gatekeeper.Action, by string, kind approvals.DecisionKind) (gatekeeper.Result, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	ch := make(chan execResult, 1)
	go func() { r, err := s.gk.Execute(ctx, a); ch <- execResult{r, err} }()

	for {
		obj, gerr := s.approvals.GetByAction(ctx, a.TenantID, a.TaskID)
		if gerr == nil && obj.State == approvals.StatePending {
			next, derr := s.approvals.Decide(ctx, approvals.DecideInput{
				ApprovalID:      obj.ID,
				Decision:        kind,
				By:              by,
				Surface:         "web",
				PayloadHashSeen: obj.PayloadHash, // GOV-004: attest the exact pinned payload
			})
			if derr != nil || next.State == approvals.StatePending {
				// The approval did not reach a terminal state (ineligible reviewer, a ledger
				// error, or quorum still needs another sign-off). Cancel Execute so it can't
				// block at the gate forever, then surface why.
				cancel()
				out := <-ch
				if derr != nil {
					return out.res, fmt.Errorf("spine: approval decision not applied: %w", derr)
				}
				return out.res, fmt.Errorf("spine: approval for %q unresolved (quorum needs another approver)", a.TaskID)
			}
			// Terminal (approved/rejected/…): Execute unblocks and runs to completion.
			out := <-ch
			return out.res, out.err
		}
		select {
		case out := <-ch: // Execute finished before ever reaching the approval gate (a deny path)
			return out.res, out.err
		case <-ctx.Done():
			out := <-ch
			return out.res, ctx.Err()
		case <-time.After(2 * time.Millisecond): // real-clock poll, independent of the logical clock
		}
	}
}

// Close stops the C5 appender workers. Call it at shutdown. Reading evidence does NOT
// require Close — the appender's Append blocks until each record is durable, so completed
// actions are already committed.
func (s *Spine) Close() { s.ledgerApp.Close() }

// Evidence returns the full per-tenant audit chain (every record of a completed action is
// already durable).
func (s *Spine) Evidence(ctx context.Context) ([]auditledger.AuditRecord, error) {
	return s.store.ReadRange(ctx, s.tenant, 0, int64(1)<<62)
}

// VerifyEvidence reads the current per-tenant audit chain and verifies it offline (no
// platform or DB access) — the IDN-001 property. It is read-only and repeatable — safe to
// call on a live server.
func (s *Spine) VerifyEvidence(ctx context.Context) (auditledger.VerifyResult, []auditledger.AuditRecord, error) {
	recs, err := s.Evidence(ctx)
	if err != nil {
		return auditledger.VerifyResult{}, nil, err
	}
	return auditledger.VerifyChain(recs, nil), recs, nil
}
