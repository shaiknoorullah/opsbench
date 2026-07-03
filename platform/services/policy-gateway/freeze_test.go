package policygateway

import (
	"context"
	"testing"
)

func TestFreezeService(t *testing.T) {
	f := NewFreezeService()
	ctx := context.Background()

	// nothing frozen initially
	if frozen, _, _ := f.IsFrozen(ctx, "t_acme", "scope://t_acme/env/prod/svc/x"); frozen {
		t.Fatal("expected not frozen initially")
	}

	f.Freeze("t_acme", "scope://t_acme/env/prod/*", "Q3 freeze")

	// prefix glob matches
	frozen, reason, err := f.IsFrozen(ctx, "t_acme", "scope://t_acme/env/prod/svc/x")
	if err != nil || !frozen || reason != "Q3 freeze" {
		t.Fatalf("expected frozen with reason, got frozen=%v reason=%q err=%v", frozen, reason, err)
	}

	// out-of-scope not frozen
	if frozen, _, _ := f.IsFrozen(ctx, "t_acme", "scope://t_acme/env/staging/svc/x"); frozen {
		t.Fatal("staging scope should not be frozen")
	}

	// other tenant not affected
	if frozen, _, _ := f.IsFrozen(ctx, "t_other", "scope://t_acme/env/prod/svc/x"); frozen {
		t.Fatal("freeze must be tenant-scoped")
	}

	// lifting clears it
	f.Lift("t_acme")
	if frozen, _, _ := f.IsFrozen(ctx, "t_acme", "scope://t_acme/env/prod/svc/x"); frozen {
		t.Fatal("expected not frozen after Lift")
	}
}
