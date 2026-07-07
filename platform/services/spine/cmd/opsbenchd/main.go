// Command opsbenchd runs the assembled opsbench governed-action spine in-process and
// demonstrates one governed mutation end-to-end: an agent proposes a change, which flows
// C7 identity → C1 policy → C3 approval → C4 credential → C2 gatekeeper → C5 evidence.
//
// It is a demonstration/assembly entrypoint (in-memory stores, no HTTP surface yet — that
// is a later Phase-1 slice). It prints each stage and then seals + offline-verifies the
// audit chain, exiting non-zero if the flow or the evidence does not hold.
package main

import (
	"context"
	"fmt"
	"os"

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

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "opsbenchd: "+err.Error())
		os.Exit(1)
	}
}

func run() error {
	ctx := context.Background()

	sp, err := spine.New(spine.Config{TenantID: tenant, EligibleReviewers: []string{reviewer}})
	if err != nil {
		return err
	}
	sp.RegisterAgent(identityregistry.Agent{
		ID: agentID, TenantID: tenant, Teams: []string{"sre"},
		Scopes: []string{"scope://t_acme/env/prod/*"}, Owner: "usr_alice", Autonomy: identityregistry.L3,
	})
	sp.RegisterTool(
		[]string{"sre"},
		map[string]any{"env": "prod", "danger": false, "read_only": false},
		spine.NewDemoTool(toolName),
	)

	action := gatekeeper.Action{
		TenantID: tenant, Agent: agentID, Tool: toolName, Resource: scope,
		Payload: map[string]any{"replicas": 6}, Justification: "scale out for load",
		OnBehalfOf: "usr_alice", TaskID: "tsk_demo",
	}

	fmt.Println("opsbench governed-action spine — in-process demo")
	fmt.Printf("  agent    %s  (team sre, owner usr_alice)\n", agentID)
	fmt.Printf("  proposes %s on %s  payload=%v\n\n", toolName, scope, action.Payload)

	fmt.Println("→ executing (tier-2 policy ⇒ on-call must approve the pinned payload)…")
	res, err := sp.ExecuteWithApproval(ctx, action, reviewer)
	if err != nil {
		return fmt.Errorf("execute: %w", err)
	}
	fmt.Printf("  outcome  %s (tier %d)\n", res.Outcome, res.Tier)
	fmt.Printf("  payload  %s\n", res.PayloadHash)
	fmt.Printf("  rollback %s\n", res.RollbackHandle)

	inv := sp.Broker().Inventory()
	fmt.Printf("\n  C4 minted %d write credential(s):\n", len(inv))
	for _, c := range inv {
		fmt.Printf("    token=%s…  scope=%s  expires=%s\n", short(c.Token), c.Scope, c.ExpiresAt.Format("15:04:05"))
	}

	vr, recs, err := sp.VerifyEvidence(ctx)
	if err != nil {
		return fmt.Errorf("evidence: %w", err)
	}
	fmt.Printf("\n  C5 evidence chain (%d records):\n", len(recs))
	for _, r := range recs {
		fmt.Printf("    #%d  %-16s %-7s %s\n", r.Seq, r.Operation.Kind, r.Decision.Effect, r.Operation.Name)
	}
	fmt.Printf("  offline verification: OK=%v (%d records checked)\n", vr.OK, vr.RecordsChecked)

	if res.Outcome != gatekeeper.OutcomeExecuted {
		return fmt.Errorf("expected execution, got %s (%s)", res.Outcome, res.Reason)
	}
	if !vr.OK {
		return fmt.Errorf("evidence chain failed verification: %v", vr.Errors)
	}
	fmt.Println("\n✓ governed action executed and proven by an offline-verifiable evidence chain.")
	return nil
}

func short(s string) string {
	if len(s) > 8 {
		return s[:8]
	}
	return s
}
