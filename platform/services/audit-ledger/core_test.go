package auditledger

import (
	"encoding/json"
	"regexp"
	"testing"
)

func sampleInput(tenant string) AppendInput {
	return AppendInput{
		TenantID:        tenant,
		TS:              "2026-06-17T10:00:00Z",
		Agent:           Agent{ID: "spiffe://" + tenant + "/agent/inv-7"},
		DelegationChain: []string{"usr_alice", "spiffe://" + tenant + "/agent/inv-7"},
		Resources:       []Resource{{System: "k8s:prod", Ref: "deploy/checkout", DataClass: "config"}},
		Operation:       Operation{Kind: "tool_call", Name: "kubernetes:scale"},
		Decision:        Decision{Effect: "permit", PolicyRefs: []string{"pol_sre-scale"}},
		Outcome:         Outcome{Status: "ok"},
	}
}

func TestCanonicalizeKeyOrderIndependent(t *testing.T) {
	a, err := Canonicalize(map[string]any{"b": 1, "a": map[string]any{"d": 2, "c": 3}})
	if err != nil {
		t.Fatal(err)
	}
	b, _ := Canonicalize(map[string]any{"a": map[string]any{"c": 3, "d": 2}, "b": 1})
	if string(a) != string(b) {
		t.Fatalf("not canonical: %s vs %s", a, b)
	}
	if string(a) != `{"a":{"c":3,"d":2},"b":1}` {
		t.Fatalf("unexpected canonical form: %s", a)
	}
}

func TestSHA256Stable(t *testing.T) {
	if got := SHA256([]byte("")); got != "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" {
		t.Fatalf("sha256 mismatch: %s", got)
	}
}

func TestComputeRecordHashChanges(t *testing.T) {
	h1, _ := ComputeRecordHash(map[string]any{"seq": 0, "v": 1, "prev_hash": ZeroDigest}, ZeroDigest)
	h2, _ := ComputeRecordHash(map[string]any{"seq": 0, "v": 2, "prev_hash": ZeroDigest}, ZeroDigest)
	if h1 == h2 {
		t.Fatal("hash did not change with content")
	}
}

func TestMerkleRootAndProofs(t *testing.T) {
	for _, n := range []int{1, 2, 3, 5, 8} {
		leaves := make([]string, n)
		for i := range leaves {
			leaves[i] = SHA256([]byte(("rec") + string(rune('0'+i))))
		}
		root, err := MerkleRoot(leaves)
		if err != nil {
			t.Fatal(err)
		}
		for i := 0; i < n; i++ {
			proof, err := BuildProof(leaves, i)
			if err != nil {
				t.Fatal(err)
			}
			if !VerifyProof(leaves[i], proof, root) {
				t.Fatalf("proof %d/%d failed", i, n)
			}
		}
		p0, _ := BuildProof(leaves, 0)
		if VerifyProof(SHA256([]byte("forged")), p0, root) {
			t.Fatal("forged leaf verified")
		}
	}
}

func TestSealRecordChains(t *testing.T) {
	r0, err := SealRecord(sampleInput("t_acme"), 0, ZeroDigest, LedgerID)
	if err != nil {
		t.Fatal(err)
	}
	if r0.Seq != 0 || r0.PrevHash != ZeroDigest {
		t.Fatalf("genesis wrong: seq=%d prev=%s", r0.Seq, r0.PrevHash)
	}
	r1, _ := SealRecord(sampleInput("t_acme"), 1, r0.Hash, LedgerID)
	if r1.PrevHash != r0.Hash {
		t.Fatal("chain link wrong")
	}
	recomputed, _ := ComputeRecordHash(r1, r1.PrevHash)
	if recomputed != r1.Hash {
		t.Fatal("hash does not recompute")
	}
}

func TestVerifyChainDetectsTamper(t *testing.T) {
	r0, _ := SealRecord(sampleInput("t_acme"), 0, ZeroDigest, LedgerID)
	r1, _ := SealRecord(sampleInput("t_acme"), 1, r0.Hash, LedgerID)
	r2, _ := SealRecord(sampleInput("t_acme"), 2, r1.Hash, LedgerID)
	if !VerifyChain([]AuditRecord{r0, r1, r2}, nil).OK {
		t.Fatal("valid chain reported invalid")
	}
	// tamper a field without recomputing hash
	tampered := r1
	tampered.Outcome.Status = "error"
	if VerifyChain([]AuditRecord{r0, tampered, r2}, nil).OK {
		t.Fatal("tamper not detected")
	}
	// delete a middle record -> chain link break
	if VerifyChain([]AuditRecord{r0, r2}, nil).OK {
		t.Fatal("deletion not detected")
	}
}

func TestSealedRecordMatchesSchemaShape(t *testing.T) {
	// Lightweight schema-shape check (full JSON-Schema validation lives in the TS
	// schemas package; here we assert id/hash patterns + required keys present).
	rec, _ := SealRecord(sampleInput("t_acme"), 0, ZeroDigest, LedgerID)
	if !regexp.MustCompile(`^led_[0-9A-HJKMNP-TV-Z]{26}$`).MatchString(rec.ID) {
		t.Fatalf("id not schema-conformant: %s", rec.ID)
	}
	if !regexp.MustCompile(`^sha256:[0-9a-f]{64}$`).MatchString(rec.Hash) {
		t.Fatalf("hash not schema-conformant: %s", rec.Hash)
	}
	b, _ := json.Marshal(rec)
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	for _, k := range []string{"seq", "id", "tenant_id", "ts", "agent", "delegation_chain", "resources", "operation", "decision", "outcome", "prev_hash", "hash"} {
		if _, ok := m[k]; !ok {
			t.Fatalf("required field missing: %s", k)
		}
	}
}
