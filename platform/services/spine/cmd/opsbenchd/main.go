// Command opsbenchd runs the assembled opsbench governed-action spine. By default it runs a
// one-shot in-process demo of a single governed mutation (C7 identity → C1 policy → C3
// approval → C4 credential → C2 gatekeeper → C5 evidence). With -http it instead serves the
// governed-action HTTP API over the same assembled spine.
//
// It is an assembly/demonstration entrypoint: in-memory stores, and identities and tools
// are seeded in-process (an admin API is a later slice). The demo exits non-zero if the
// flow or the evidence does not hold.
package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"time"

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
	addr := flag.String("http", "", "serve the governed-action HTTP API on this address (e.g. :8080) instead of running the one-shot demo")
	flag.Parse()
	if err := run(*addr); err != nil {
		fmt.Fprintln(os.Stderr, "opsbenchd: "+err.Error())
		os.Exit(1)
	}
}

func run(httpAddr string) error {
	sp, err := newSeededSpine()
	if err != nil {
		return err
	}
	defer sp.Close()
	if httpAddr != "" {
		return serve(sp, httpAddr)
	}
	return demo(sp)
}

// newSeededSpine builds the spine and seeds the demo tenant: one SRE agent (permitted the
// prod scope), the SRE-owned demo tool, and the on-call reviewer.
func newSeededSpine() (*spine.Spine, error) {
	sp, err := spine.New(spine.Config{TenantID: tenant, EligibleReviewers: []string{reviewer}})
	if err != nil {
		return nil, err
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
	return sp, nil
}

// serve runs the governed-action HTTP API. WriteTimeout is intentionally unset because
// POST /v1/actions long-polls through the approval gate; ReadHeaderTimeout guards the
// accept path.
func serve(sp *spine.Spine, addr string) error {
	fmt.Printf("opsbenchd: serving the governed-action API on %s (tenant %s)\n", addr, tenant)
	fmt.Println("  POST /v1/actions · GET /v1/approvals/by-action/{ref} · POST /v1/approvals/{id}/decide · GET /v1/evidence")
	srv := &http.Server{Addr: addr, Handler: spine.NewServer(sp), ReadHeaderTimeout: 10 * time.Second}
	return srv.ListenAndServe()
}

func demo(sp *spine.Spine) error {
	ctx := context.Background()
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
