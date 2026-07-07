package spine_test

import (
	"context"
	"testing"
	"time"

	auditledger "github.com/shaiknoorullah/opsbench/platform/services/audit-ledger"
	gatekeeper "github.com/shaiknoorullah/opsbench/platform/services/gatekeeper"
	identityregistry "github.com/shaiknoorullah/opsbench/platform/services/identity-registry"
	spine "github.com/shaiknoorullah/opsbench/platform/services/spine"
)

const (
	tenant   = "t_acme"
	agentID  = "spiffe://t_acme/agent/inv-7"
	reviewer = "usr_oncall"
	toolName = "k8s.scale"
	scope    = "scope://t_acme/env/prod/service/checkout"
)

// seededSpine builds a spine with one active SRE agent (permitted the prod scope), the
// SRE-owned demo tool, and the on-call reviewer eligible to approve.
func seededSpine(t *testing.T) *spine.Spine {
	t.Helper()
	sp, err := spine.New(spine.Config{TenantID: tenant, EligibleReviewers: []string{reviewer}})
	if err != nil {
		t.Fatalf("spine.New: %v", err)
	}
	t.Cleanup(sp.Close) // stop the C5 appender workers (Close is idempotent with VerifyEvidence)
	sp.RegisterAgent(identityregistry.Agent{
		ID: agentID, TenantID: tenant, Teams: []string{"sre"},
		Scopes: []string{"scope://t_acme/env/prod/*"}, Owner: "usr_alice", Autonomy: identityregistry.L3,
	})
	sp.RegisterTool(
		[]string{"sre"},
		map[string]any{"env": "prod", "danger": false, "read_only": false},
		spine.NewDemoTool(toolName),
	)
	return sp
}

func demoAction() gatekeeper.Action {
	return gatekeeper.Action{
		TenantID: tenant, Agent: agentID, Tool: toolName, Resource: scope,
		Payload: map[string]any{"replicas": 6}, Justification: "scale out for load",
		OnBehalfOf: "usr_alice", TaskID: "tsk_demo",
	}
}

func kindEffects(recs []auditledger.AuditRecord) []string {
	out := make([]string, len(recs))
	for i, r := range recs {
		out[i] = r.Operation.Kind + ":" + r.Decision.Effect
	}
	return out
}

// TestSpine_GoldenPath is the milestone: one governed mutation flows C7→C1→C3→C4→C2→C5 and
// leaves a single offline-verifiable evidence chain.
func TestSpine_GoldenPath_ExecutesWithApprovalAndVerifiableEvidence(t *testing.T) {
	sp := seededSpine(t)

	res, err := sp.ExecuteWithApproval(context.Background(), demoAction(), reviewer)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if res.Outcome != gatekeeper.OutcomeExecuted {
		t.Fatalf("want executed, got %s (%s)", res.Outcome, res.Reason)
	}
	if res.Tier != 2 {
		t.Errorf("want tier 2 (single approval), got %d", res.Tier)
	}

	// C4 — exactly one short-lived credential, scoped to the requested resource (least privilege).
	inv := sp.Broker().Inventory()
	if len(inv) != 1 {
		t.Fatalf("want 1 minted credential, got %d", len(inv))
	}
	if !inv[0].IsExpiring() {
		t.Error("NF-007: the minted credential must be short-lived")
	}
	if inv[0].Scope != scope {
		t.Errorf("credential scope = %q, want %q", inv[0].Scope, scope)
	}

	// C5 — one unified, offline-verifiable evidence chain across policy, approval, and execution.
	vr, recs, err := sp.VerifyEvidence(context.Background())
	if err != nil {
		t.Fatalf("evidence: %v", err)
	}
	if !vr.OK {
		t.Fatalf("evidence chain failed offline verification: %v", vr.Errors)
	}
	// The order is normative (DP-3: decision recorded before any effect; approval created
	// then approved before execution), and the appender is per-tenant serialized, so the
	// exact sequence is deterministic.
	ke := kindEffects(recs)
	want := []string{"policy_decision:permit", "approval:deny", "approval:permit", "tool_call:permit"}
	if !equalStrings(ke, want) {
		t.Fatalf("evidence sequence = %v, want %v", ke, want)
	}
	if recs[3].Outcome.Status != "ok" {
		t.Errorf("the executed tool_call should carry outcome status ok, got %q", recs[3].Outcome.Status)
	}
}

// TestSpine_TamperedEvidenceFailsVerification proves the chain is genuinely tamper-evident:
// mutating any sealed record breaks offline verification (IDN-001).
func TestSpine_TamperedEvidenceFailsVerification(t *testing.T) {
	sp := seededSpine(t)
	if _, err := sp.ExecuteWithApproval(context.Background(), demoAction(), reviewer); err != nil {
		t.Fatalf("execute: %v", err)
	}
	vr, recs, err := sp.VerifyEvidence(context.Background())
	if err != nil {
		t.Fatalf("evidence: %v", err)
	}
	if !vr.OK {
		t.Fatalf("baseline chain should verify: %v", vr.Errors)
	}

	tampered := append([]auditledger.AuditRecord(nil), recs...)
	tampered[0].Decision.Effect = "deny" // flip the recorded policy verdict
	if auditledger.VerifyChain(tampered, nil).OK {
		t.Fatal("verification must fail after a record is mutated")
	}
}

func TestSpine_RevokedIdentityDenies(t *testing.T) {
	sp := seededSpine(t)
	if !sp.Revoke(agentID) {
		t.Fatal("expected the agent to be known before revocation")
	}
	// Denied at the C1 policy step (no teams) — never reaches the approval gate.
	res, err := sp.Execute(context.Background(), demoAction())
	if err != nil {
		t.Fatalf("a policy deny must not be a Go error: %v", err)
	}
	if res.Outcome != gatekeeper.OutcomeDenied {
		t.Fatalf("revoked identity must default-deny, got %s", res.Outcome)
	}
	if n := len(sp.Broker().Inventory()); n != 0 {
		t.Fatalf("no credential should be minted on an identity deny, got %d", n)
	}
}

func TestSpine_UnknownAgentDenies(t *testing.T) {
	sp := seededSpine(t)
	a := demoAction()
	a.Agent = "spiffe://t_acme/agent/ghost" // never registered
	res, _ := sp.Execute(context.Background(), a)
	if res.Outcome != gatekeeper.OutcomeDenied {
		t.Fatalf("unknown agent must default-deny, got %s", res.Outcome)
	}
	if n := len(sp.Broker().Inventory()); n != 0 {
		t.Fatalf("no credential should be minted for an unknown agent, got %d", n)
	}
}

func TestSpine_FrozenScopeDenies(t *testing.T) {
	sp := seededSpine(t)
	sp.Freeze("scope://t_acme/env/prod/*", "Q3 change freeze")
	// Denied at the freeze step (after policy permit, before approval).
	res, err := sp.Execute(context.Background(), demoAction())
	if err != nil {
		t.Fatalf("a freeze deny must not be a Go error: %v", err)
	}
	if res.Outcome != gatekeeper.OutcomeDenied {
		t.Fatalf("frozen scope must deny, got %s", res.Outcome)
	}
	if n := len(sp.Broker().Inventory()); n != 0 {
		t.Fatalf("no credential should be minted during a freeze, got %d", n)
	}
}

func TestSpine_RejectedApprovalDenies(t *testing.T) {
	sp := seededSpine(t)
	res, err := sp.ExecuteWithRejection(context.Background(), demoAction(), reviewer)
	if err != nil {
		t.Fatalf("a rejected approval must not be a Go error: %v", err)
	}
	if res.Outcome != gatekeeper.OutcomeDenied {
		t.Fatalf("a rejected approval must deny, got %s (%s)", res.Outcome, res.Reason)
	}
	if n := len(sp.Broker().Inventory()); n != 0 {
		t.Fatalf("no credential should be minted when approval is rejected, got %d", n)
	}
}

// TestSpine_OutOfScopeCredentialFailsClosed shows defense-in-depth: an action can be
// policy-permitted AND approved, yet still be denied at C4 because the credential's scope
// is not within the agent's grant.
func TestSpine_OutOfScopeCredentialFailsClosed(t *testing.T) {
	sp := seededSpine(t)
	a := demoAction()
	a.Resource = "scope://t_acme/env/staging/service/api" // outside the agent's prod/* grant
	res, err := sp.ExecuteWithApproval(context.Background(), a, reviewer)
	if err == nil {
		t.Fatal("want a non-nil error when the broker cannot mint the requested scope")
	}
	if res.Outcome != gatekeeper.OutcomeDenied {
		t.Fatalf("out-of-scope credential must fail closed, got %s", res.Outcome)
	}
	if n := len(sp.Broker().Inventory()); n != 0 {
		t.Fatalf("no credential should be minted for an out-of-scope request, got %d", n)
	}
}

// tier3Policy permits SRE→SRE tools at tier 3 (two-person). Used to exercise the
// quorum-not-yet-met path, which a single ExecuteWithApproval cannot resolve.
const tier3Policy = `
@tier("3")
permit (
    principal in Team::"sre",
    action == Action::"invoke",
    resource in Team::"sre"
);
`

// TestSpine_IneligibleReviewerFailsClosed proves the reviewer handshake does NOT hang when
// the decision cannot be applied (the reviewer is not eligible): it cancels Execute and
// returns denied + an error.
func TestSpine_IneligibleReviewerFailsClosed(t *testing.T) {
	sp := seededSpine(t)
	res, err := runBounded(t, func(ctx context.Context) (gatekeeper.Result, error) {
		return sp.ExecuteWithApproval(ctx, demoAction(), "usr_stranger") // not in EligibleReviewers
	})
	if err == nil {
		t.Fatal("want an error when the reviewer is not eligible")
	}
	if res.Outcome != gatekeeper.OutcomeDenied {
		t.Fatalf("want denied, got %s", res.Outcome)
	}
	if n := len(sp.Broker().Inventory()); n != 0 {
		t.Fatalf("no credential should be minted, got %d", n)
	}
}

// TestSpine_TwoPersonActionSingleApprovalDoesNotHang proves the handshake does NOT hang
// when one sign-off cannot satisfy a two-person (tier-3) action: it returns unresolved
// rather than blocking forever waiting for a second approver.
func TestSpine_TwoPersonActionSingleApprovalDoesNotHang(t *testing.T) {
	sp, err := spine.New(spine.Config{
		TenantID: tenant, PolicySource: []byte(tier3Policy), EligibleReviewers: []string{reviewer},
	})
	if err != nil {
		t.Fatalf("spine.New: %v", err)
	}
	t.Cleanup(sp.Close)
	sp.RegisterAgent(identityregistry.Agent{
		ID: agentID, TenantID: tenant, Teams: []string{"sre"},
		Scopes: []string{"scope://t_acme/env/prod/*"}, Owner: "usr_alice",
	})
	sp.RegisterTool([]string{"sre"}, map[string]any{"env": "prod", "danger": false}, spine.NewDemoTool(toolName))

	res, err := runBounded(t, func(ctx context.Context) (gatekeeper.Result, error) {
		return sp.ExecuteWithApproval(ctx, demoAction(), reviewer)
	})
	if err == nil {
		t.Fatal("want an unresolved-approval error for a single sign-off on a two-person action")
	}
	if res.Outcome != gatekeeper.OutcomeDenied {
		t.Fatalf("want denied, got %s", res.Outcome)
	}
}

// runBounded runs fn and fails the test (rather than hanging the whole suite) if it does
// not return within the watchdog window — a direct guard for the anti-deadlock property.
func runBounded(t *testing.T, fn func(context.Context) (gatekeeper.Result, error)) (gatekeeper.Result, error) {
	t.Helper()
	type out struct {
		r gatekeeper.Result
		e error
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ch := make(chan out, 1)
	go func() { r, e := fn(ctx); ch <- out{r, e} }()
	select {
	case o := <-ch:
		return o.r, o.e
	case <-time.After(4 * time.Second):
		t.Fatal("ExecuteWithApproval hung (deadlock) — did not return within 4s")
		return gatekeeper.Result{}, nil
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
