package auditledger

import (
	"fmt"
	"sort"
)

// VerifyResult is the outcome of offline verification.
type VerifyResult struct {
	OK                 bool
	RecordsChecked     int
	CheckpointsChecked int
	Errors             []string
}

// VerifyChain validates chain continuity, per-record hashes, and checkpoint roots
// from an exported bundle alone — no platform or database access (IDN-001 / UC-011).
// Any mutation, reorder, deletion, or forged record is detected.
func VerifyChain(records []AuditRecord, checkpoints []Checkpoint) VerifyResult {
	sorted := append([]AuditRecord(nil), records...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Seq < sorted[j].Seq })

	var errs []string
	prevHash := ZeroDigest
	var expectedSeq int64
	for _, r := range sorted {
		if r.Seq != expectedSeq {
			errs = append(errs, fmt.Sprintf("seq gap: expected %d, got %d", expectedSeq, r.Seq))
		}
		if r.PrevHash != prevHash {
			errs = append(errs, fmt.Sprintf("broken chain link at seq %d: prev_hash does not match previous record hash", r.Seq))
		}
		recomputed, err := ComputeRecordHash(r, r.PrevHash)
		if err != nil {
			errs = append(errs, fmt.Sprintf("hash error at seq %d: %v", r.Seq, err))
		} else if recomputed != r.Hash {
			errs = append(errs, fmt.Sprintf("tampered record at seq %d: recomputed hash does not match stored hash", r.Seq))
		}
		prevHash = r.Hash
		expectedSeq = r.Seq + 1
	}

	checked := 0
	for _, cp := range checkpoints {
		var block []AuditRecord
		for _, r := range sorted {
			if r.Seq >= cp.FromSeq && r.Seq <= cp.ToSeq {
				block = append(block, r)
			}
		}
		if int64(len(block)) != cp.ToSeq-cp.FromSeq+1 {
			errs = append(errs, fmt.Sprintf("checkpoint %d-%d: block incomplete (%d records present)", cp.FromSeq, cp.ToSeq, len(block)))
			continue
		}
		hashes := make([]string, len(block))
		for i, r := range block {
			hashes[i] = r.Hash
		}
		root, err := MerkleRoot(hashes)
		if err != nil || root != cp.Root {
			errs = append(errs, fmt.Sprintf("checkpoint %d-%d: Merkle root mismatch", cp.FromSeq, cp.ToSeq))
			continue
		}
		checked++
	}

	return VerifyResult{OK: len(errs) == 0, RecordsChecked: len(sorted), CheckpointsChecked: checked, Errors: errs}
}
