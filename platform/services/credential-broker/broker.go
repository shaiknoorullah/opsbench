// Package credentialbroker is C4 — the just-in-time write-credential broker.
//
// Agents never hold standing write credentials (DP-1). When the C2 gatekeeper is about to
// apply a mutation it asks the broker to mint a short-lived, attributed credential scoped
// to exactly the resource being touched. The broker fails closed: an inactive identity or
// a scope the agent isn't permitted yields an error and NO credential, so the gatekeeper
// denies the action.
//
// The broker enforces three properties:
//   - identity-gated (C7): only an active, non-revoked agent gets a credential;
//   - intersection scope: the credential's blast radius is the agent's permitted scope
//     (from C7) ∩ the requested scope — the narrowest concrete resource (least privilege);
//   - NF-007 short-lived: every credential has a lifetime that is always set and capped;
//     a non-expiring write credential is never issued.
package credentialbroker

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	identityregistry "github.com/shaiknoorullah/opsbench/platform/services/identity-registry"
)

// MaxTTL is the hard cap on a write credential's lifetime (NF-007). DefaultTTL is used
// when no lifetime is configured. Both keep credentials short-lived; the broker never
// issues a non-expiring credential.
const (
	MaxTTL     = 15 * time.Minute
	DefaultTTL = 15 * time.Minute
)

// Credential is a short-lived, attributed write credential. ExpiresAt is ALWAYS in the
// future relative to IssuedAt — the broker never mints a zero (non-expiring) ExpiresAt.
type Credential struct {
	Token      string    // opaque bearer token (crypto/rand)
	Scope      string    // effective scope (permitted ∩ requested) — the blast radius
	Agent      string    // minting agent (SPIFFE id)
	TaskID     string    // task this credential serves
	OnBehalfOf []string  // delegation chain carried for attribution
	IssuedAt   time.Time //
	ExpiresAt  time.Time //
}

// IsExpiring reports whether the credential has a finite, in-the-future lifetime. It is
// the NF-007 invariant every credential this broker mints must satisfy.
func (c Credential) IsExpiring() bool {
	return !c.ExpiresAt.IsZero() && c.ExpiresAt.After(c.IssuedAt)
}

// clone returns a copy whose mutable fields (OnBehalfOf) share nothing with the receiver,
// so a credential handed out never lets a caller mutate the broker's audit trail.
func (c Credential) clone() Credential {
	c.OnBehalfOf = append([]string(nil), c.OnBehalfOf...)
	return c
}

// IdentitySource resolves an agent id to its identity record. *identityregistry.Registry
// satisfies it directly; Lookup returns (zero, false) for an unknown OR revoked identity.
type IdentitySource interface {
	Lookup(id string) (identityregistry.Agent, bool)
}

// Broker mints just-in-time write credentials (C4). Safe for concurrent use.
type Broker struct {
	ids   IdentitySource
	ttl   time.Duration
	now   func() time.Time
	token func() (string, error)

	mu  sync.Mutex
	inv []Credential // attribution inventory of everything minted
}

var (
	// ErrInactiveIdentity is returned when the agent is unknown or revoked in C7.
	ErrInactiveIdentity = errors.New("credentialbroker: agent is not an active identity")
	// ErrScopeNotPermitted is returned when the requested scope is not within the agent's
	// permitted scope grant.
	ErrScopeNotPermitted = errors.New("credentialbroker: requested scope not within the agent's permitted scope")
)

// Option configures a Broker.
type Option func(*Broker)

// WithTTL sets the credential lifetime. A non-positive value falls back to DefaultTTL; any
// value above MaxTTL is capped to MaxTTL (NF-007 — the lifetime can never exceed the cap).
func WithTTL(d time.Duration) Option { return func(b *Broker) { b.ttl = normalizeTTL(d) } }

// WithClock overrides the time source (deterministic tests).
func WithClock(f func() time.Time) Option { return func(b *Broker) { b.now = f } }

// WithTokenGen overrides the token generator (deterministic tests / fault injection).
func WithTokenGen(f func() (string, error)) Option { return func(b *Broker) { b.token = f } }

// New builds a broker over the given identity source. The lifetime defaults to DefaultTTL
// and is always kept within MaxTTL.
func New(ids IdentitySource, opts ...Option) *Broker {
	b := &Broker{ids: ids, ttl: DefaultTTL, now: time.Now, token: randToken}
	for _, o := range opts {
		o(b)
	}
	b.ttl = normalizeTTL(b.ttl)
	return b
}

// Mint issues a short-lived write credential for agent to act on the requested scope in
// service of taskID. It fails closed: an inactive identity (ErrInactiveIdentity) or a
// scope the agent is not permitted (ErrScopeNotPermitted) returns no credential.
func (b *Broker) Mint(_ context.Context, agent, taskID, scope string) (Credential, error) {
	a, ok := b.ids.Lookup(agent)
	if !ok {
		return Credential{}, fmt.Errorf("%w: %q", ErrInactiveIdentity, agent)
	}
	eff, ok := intersectScope(a.Scopes, scope)
	if !ok {
		return Credential{}, fmt.Errorf("%w: %q", ErrScopeNotPermitted, scope)
	}
	tok, err := b.token()
	if err != nil {
		return Credential{}, fmt.Errorf("credentialbroker: token generation: %w", err)
	}

	now := b.now()
	cred := Credential{
		Token:      tok,
		Scope:      eff,
		Agent:      agent,
		TaskID:     taskID,
		OnBehalfOf: append([]string(nil), a.OnBehalfOf...),
		IssuedAt:   now,
		ExpiresAt:  now.Add(b.ttl), // NF-007: ttl is always > 0 and capped at construction
	}

	b.mu.Lock()
	b.inv = append(b.inv, cred)
	b.mu.Unlock()
	return cred.clone(), nil
}

// Inventory returns a snapshot of every credential minted, for attribution and audit. Each
// returned credential is a deep copy; mutating the slice or any credential's fields does
// not affect the broker's audit trail.
func (b *Broker) Inventory() []Credential {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]Credential, len(b.inv))
	for i, c := range b.inv {
		out[i] = c.clone()
	}
	return out
}

// intersectScope returns the effective scope — the narrower, concrete requested scope —
// when the requested scope is covered by one of the agent's permitted scopes, else
// ok=false. A permitted scope ending in "/*" matches any requested scope with that prefix;
// otherwise it must match exactly. An agent with no permitted scopes is permitted nothing
// (fail-closed least privilege).
func intersectScope(permitted []string, requested string) (string, bool) {
	if requested == "" {
		return "", false
	}
	for _, p := range permitted {
		if p == requested {
			return requested, true
		}
		if strings.HasSuffix(p, "/*") && strings.HasPrefix(requested, strings.TrimSuffix(p, "*")) {
			return requested, true
		}
	}
	return "", false
}

// normalizeTTL clamps a configured lifetime into (0, MaxTTL].
func normalizeTTL(d time.Duration) time.Duration {
	if d <= 0 {
		return DefaultTTL
	}
	if d > MaxTTL {
		return MaxTTL
	}
	return d
}

// randToken returns 32 bytes of cryptographic randomness, hex-encoded.
func randToken() (string, error) {
	var buf [32]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf[:]), nil
}
