package credentialbroker

import (
	"context"
	"errors"
	"testing"
	"time"

	identityregistry "github.com/shaiknoorullah/opsbench/platform/services/identity-registry"
)

// fixedClock is a deterministic time source for lifetime assertions.
var fixedNow = time.Date(2026, 7, 3, 12, 0, 0, 0, time.UTC)

func testBroker(t *testing.T, opts ...Option) (*Broker, *identityregistry.Registry) {
	t.Helper()
	reg := identityregistry.New()
	reg.Register(identityregistry.Agent{
		ID:         "spiffe://t_acme/agent/inv-7",
		TenantID:   "t_acme",
		Teams:      []string{"sre"},
		Scopes:     []string{"scope://t_acme/env/prod/*"},
		OnBehalfOf: []string{"usr_alice"},
	})
	base := []Option{
		WithClock(func() time.Time { return fixedNow }),
		WithTokenGen(func() (string, error) { return "tok-deterministic", nil }),
	}
	return New(reg, append(base, opts...)...), reg
}

func TestMint_ActiveAgentGetsShortLivedAttributedCredential(t *testing.T) {
	b, _ := testBroker(t)

	c, err := b.Mint(context.Background(), "spiffe://t_acme/agent/inv-7", "tsk_x", "scope://t_acme/env/prod/service/checkout")
	if err != nil {
		t.Fatalf("mint for active agent: %v", err)
	}
	if c.Token != "tok-deterministic" {
		t.Errorf("token not from generator: %q", c.Token)
	}
	// intersection: requested scope is within the permitted prefix, so it is the effective scope.
	if c.Scope != "scope://t_acme/env/prod/service/checkout" {
		t.Errorf("effective scope should be the narrower requested scope, got %q", c.Scope)
	}
	if c.Agent != "spiffe://t_acme/agent/inv-7" || c.TaskID != "tsk_x" {
		t.Errorf("attribution wrong: agent=%q task=%q", c.Agent, c.TaskID)
	}
	if len(c.OnBehalfOf) != 1 || c.OnBehalfOf[0] != "usr_alice" {
		t.Errorf("delegation chain not carried for attribution: %v", c.OnBehalfOf)
	}
	// NF-007: lifetime always set and in the future.
	if !c.IsExpiring() {
		t.Fatal("NF-007 violated: credential is not short-lived")
	}
	if want := fixedNow.Add(DefaultTTL); !c.ExpiresAt.Equal(want) {
		t.Errorf("ExpiresAt = %v, want %v", c.ExpiresAt, want)
	}
}

func TestMint_UnknownAgentFailsClosed(t *testing.T) {
	b, _ := testBroker(t)
	_, err := b.Mint(context.Background(), "spiffe://t_acme/agent/ghost", "tsk_x", "scope://t_acme/env/prod/service/checkout")
	if !errors.Is(err, ErrInactiveIdentity) {
		t.Fatalf("want ErrInactiveIdentity for unknown agent, got %v", err)
	}
}

func TestMint_RevokedAgentFailsClosed(t *testing.T) {
	b, reg := testBroker(t)
	reg.Revoke("spiffe://t_acme/agent/inv-7")
	_, err := b.Mint(context.Background(), "spiffe://t_acme/agent/inv-7", "tsk_x", "scope://t_acme/env/prod/service/checkout")
	if !errors.Is(err, ErrInactiveIdentity) {
		t.Fatalf("want ErrInactiveIdentity for revoked agent, got %v", err)
	}
}

func TestMint_ScopeOutsideGrantFailsClosed(t *testing.T) {
	b, _ := testBroker(t)
	// agent is permitted scope://t_acme/env/prod/* only.
	_, err := b.Mint(context.Background(), "spiffe://t_acme/agent/inv-7", "tsk_x", "scope://t_acme/env/staging/service/api")
	if !errors.Is(err, ErrScopeNotPermitted) {
		t.Fatalf("want ErrScopeNotPermitted for out-of-grant scope, got %v", err)
	}
}

func TestMint_NoFailedMintEntersInventory(t *testing.T) {
	b, reg := testBroker(t)
	reg.Revoke("spiffe://t_acme/agent/inv-7")
	_, _ = b.Mint(context.Background(), "spiffe://t_acme/agent/inv-7", "tsk_x", "scope://t_acme/env/prod/service/checkout")
	if n := len(b.Inventory()); n != 0 {
		t.Fatalf("a failed mint must not enter the attribution inventory, got %d entries", n)
	}
}

func TestTTL_CappedAtMaxTTL(t *testing.T) {
	// Requesting a 24h lifetime must be capped to MaxTTL (NF-007).
	b, _ := testBroker(t, WithTTL(24*time.Hour))
	c, err := b.Mint(context.Background(), "spiffe://t_acme/agent/inv-7", "tsk_x", "scope://t_acme/env/prod/service/checkout")
	if err != nil {
		t.Fatalf("mint: %v", err)
	}
	if got := c.ExpiresAt.Sub(c.IssuedAt); got != MaxTTL {
		t.Fatalf("lifetime = %v, want capped to MaxTTL %v", got, MaxTTL)
	}
}

func TestTTL_ShorterValueHonored(t *testing.T) {
	b, _ := testBroker(t, WithTTL(90*time.Second))
	c, _ := b.Mint(context.Background(), "spiffe://t_acme/agent/inv-7", "tsk_x", "scope://t_acme/env/prod/service/checkout")
	if got := c.ExpiresAt.Sub(c.IssuedAt); got != 90*time.Second {
		t.Fatalf("lifetime = %v, want 90s", got)
	}
}

func TestInventory_EveryCredentialIsExpiring(t *testing.T) {
	b, _ := testBroker(t)
	for i := 0; i < 3; i++ {
		if _, err := b.Mint(context.Background(), "spiffe://t_acme/agent/inv-7", "tsk", "scope://t_acme/env/prod/service/checkout"); err != nil {
			t.Fatalf("mint %d: %v", i, err)
		}
	}
	inv := b.Inventory()
	if len(inv) != 3 {
		t.Fatalf("want 3 inventory entries, got %d", len(inv))
	}
	for i, c := range inv {
		if !c.IsExpiring() {
			t.Fatalf("NF-007: inventory entry %d is not short-lived (ExpiresAt=%v)", i, c.ExpiresAt)
		}
	}
}

func TestIntersectScope(t *testing.T) {
	cases := []struct {
		name      string
		permitted []string
		requested string
		wantEff   string
		wantOK    bool
	}{
		{"exact match", []string{"scope://t/env/prod/svc/x"}, "scope://t/env/prod/svc/x", "scope://t/env/prod/svc/x", true},
		{"wildcard prefix covers", []string{"scope://t/env/prod/*"}, "scope://t/env/prod/svc/x", "scope://t/env/prod/svc/x", true},
		{"later scope in the list matches", []string{"scope://t/env/staging/*", "scope://t/env/prod/*"}, "scope://t/env/prod/svc/x", "scope://t/env/prod/svc/x", true},
		{"wildcard does not cover other env", []string{"scope://t/env/prod/*"}, "scope://t/env/staging/x", "", false},
		{"no permitted scopes denies", nil, "scope://t/env/prod/x", "", false},
		{"empty requested denies", []string{"scope://t/*"}, "", "", false},
		{"prefix-but-not-boundary denies", []string{"scope://t/env/prod/*"}, "scope://t/env/production", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			eff, ok := intersectScope(tc.permitted, tc.requested)
			if ok != tc.wantOK || eff != tc.wantEff {
				t.Fatalf("intersectScope(%v, %q) = (%q, %v), want (%q, %v)", tc.permitted, tc.requested, eff, ok, tc.wantEff, tc.wantOK)
			}
		})
	}
}

func TestInventory_ReturnsIsolatedCopies(t *testing.T) {
	b, _ := testBroker(t)
	if _, err := b.Mint(context.Background(), "spiffe://t_acme/agent/inv-7", "tsk", "scope://t_acme/env/prod/service/checkout"); err != nil {
		t.Fatal(err)
	}
	inv := b.Inventory()
	if len(inv) != 1 || len(inv[0].OnBehalfOf) != 1 {
		t.Fatalf("unexpected inventory: %+v", inv)
	}
	inv[0].OnBehalfOf[0] = "mutated" // must not reach into the broker's audit trail
	if got := b.Inventory()[0].OnBehalfOf[0]; got != "usr_alice" {
		t.Fatalf("mutating a returned credential corrupted the broker's audit trail: %q", got)
	}
}

func TestMint_ReturnedCredentialIsIsolated(t *testing.T) {
	b, _ := testBroker(t)
	c, err := b.Mint(context.Background(), "spiffe://t_acme/agent/inv-7", "tsk", "scope://t_acme/env/prod/service/checkout")
	if err != nil {
		t.Fatal(err)
	}
	c.OnBehalfOf[0] = "mutated" // must not reach into the stored inventory entry
	if got := b.Inventory()[0].OnBehalfOf[0]; got != "usr_alice" {
		t.Fatalf("mutating the Mint result corrupted the broker's audit trail: %q", got)
	}
}

func TestConcurrentMintIsSafe(t *testing.T) {
	b, _ := testBroker(t)
	const n = 50
	done := make(chan struct{})
	for i := 0; i < n; i++ {
		go func() {
			defer func() { done <- struct{}{} }()
			_, _ = b.Mint(context.Background(), "spiffe://t_acme/agent/inv-7", "tsk", "scope://t_acme/env/prod/service/checkout")
		}()
	}
	for i := 0; i < n; i++ {
		<-done
	}
	if got := len(b.Inventory()); got != n {
		t.Fatalf("want %d inventory entries after concurrent mints, got %d", n, got)
	}
}

func TestTokenGenErrorFailsClosed(t *testing.T) {
	b, _ := testBroker(t, WithTokenGen(func() (string, error) { return "", errors.New("rng down") }))
	_, err := b.Mint(context.Background(), "spiffe://t_acme/agent/inv-7", "tsk_x", "scope://t_acme/env/prod/service/checkout")
	if err == nil {
		t.Fatal("token generation failure must fail closed")
	}
	if len(b.Inventory()) != 0 {
		t.Fatal("a failed mint must not be recorded")
	}
}
