package spine

import (
	"context"
	"fmt"

	auditledger "github.com/shaiknoorullah/opsbench/platform/services/audit-ledger"
	gatekeeper "github.com/shaiknoorullah/opsbench/platform/services/gatekeeper"
)

// demoTool is a deterministic gatekeeper.Tool for the assembled-spine demo and tests. Its
// dry-run derives a stable effect hash from the canonical payload, so the gatekeeper's
// apply-time divergence check (GOV-003) passes on identical input; Apply is a no-op that
// returns a rollback handle. It touches no real estate — the spine flow is what's exercised.
type demoTool struct{ name string }

// NewDemoTool returns a tool named `name` that supports dry-run and applies deterministically.
func NewDemoTool(name string) gatekeeper.Tool { return &demoTool{name: name} }

func (t *demoTool) Name() string    { return t.name }
func (t *demoTool) HasDryRun() bool { return true }

func (t *demoTool) DryRun(_ context.Context, payload map[string]any) (gatekeeper.DryRunResult, error) {
	canon, err := auditledger.Canonicalize(payload)
	if err != nil {
		return gatekeeper.DryRunResult{}, err
	}
	// fmt %v sorts map keys, so the diff is stable; the effect hash is canonical either way.
	return gatekeeper.DryRunResult{
		Diff:       fmt.Sprintf("%s(%v)", t.name, payload),
		EffectHash: auditledger.SHA256(canon),
	}, nil
}

func (t *demoTool) Apply(_ context.Context, _ map[string]any, _ gatekeeper.Credential) (gatekeeper.ApplyResult, error) {
	return gatekeeper.ApplyResult{RollbackHandle: "rb-" + t.name, Detail: "applied " + t.name}, nil
}
