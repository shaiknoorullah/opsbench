// Package auditledger is C5 — the tamper-evident, per-tenant hash-chained audit
// ledger (Architecture A: batched single-writer, Postgres source of truth).
// See docs/superpowers/specs/opsbench-platform/components/C5-audit-ledger.md.
package auditledger

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

// ZeroDigest is the genesis prev_hash for a tenant chain.
const ZeroDigest = "sha256:0000000000000000000000000000000000000000000000000000000000000000"

// Canonicalize returns deterministic JSON with recursively sorted object keys.
// Round-tripping through `any` makes encoding/json sort every map's keys
// lexicographically at all depths; array order is preserved. This is the byte-exact
// basis for the record hash and offline verification (spec amendment A9).
func Canonicalize(v any) ([]byte, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var generic any
	if err := json.Unmarshal(b, &generic); err != nil {
		return nil, err
	}
	return json.Marshal(generic)
}

// SHA256 returns "sha256:<lowercase hex>" of b.
func SHA256(b []byte) string {
	sum := sha256.Sum256(b)
	return "sha256:" + hex.EncodeToString(sum[:])
}

// ComputeRecordHash implements hash = sha256(canonical(record sans hash) || prev_hash).
// The `hash` key is dropped before canonicalization; prev_hash remains a field (it is
// part of the sealed record) and is also appended, matching the spec formula.
func ComputeRecordHash(record any, prevHash string) (string, error) {
	b, err := json.Marshal(record)
	if err != nil {
		return "", err
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return "", err
	}
	delete(m, "hash")
	c, err := Canonicalize(m)
	if err != nil {
		return "", err
	}
	return SHA256(append(c, []byte(prevHash)...)), nil
}
