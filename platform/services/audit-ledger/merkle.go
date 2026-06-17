package auditledger

import "errors"

// Domain-separated leaf/node hashing prevents second-preimage tricks; an odd node
// is promoted by duplication. Backs the periodic checkpoint (C5 design §4).

func leafDigest(recordHash string) string { return SHA256([]byte("leaf:" + recordHash)) }
func nodeDigest(a, b string) string       { return SHA256([]byte("node:" + a + b)) }

// MerkleRoot computes the root over a checkpoint block's ordered record hashes.
func MerkleRoot(recordHashes []string) (string, error) {
	if len(recordHashes) == 0 {
		return "", errors.New("merkle: empty block")
	}
	level := make([]string, len(recordHashes))
	for i, h := range recordHashes {
		level[i] = leafDigest(h)
	}
	for len(level) > 1 {
		next := make([]string, 0, (len(level)+1)/2)
		for i := 0; i < len(level); i += 2 {
			left := level[i]
			right := left // duplicate odd node
			if i+1 < len(level) {
				right = level[i+1]
			}
			next = append(next, nodeDigest(left, right))
		}
		level = next
	}
	return level[0], nil
}

// ProofStep is one sibling on the path from a leaf to the root.
type ProofStep struct {
	Dir     string // "L" or "R": side the sibling is on
	Sibling string
}

// BuildProof returns the inclusion proof for the leaf at index within the block.
func BuildProof(recordHashes []string, index int) ([]ProofStep, error) {
	if index < 0 || index >= len(recordHashes) {
		return nil, errors.New("merkle: index out of range")
	}
	level := make([]string, len(recordHashes))
	for i, h := range recordHashes {
		level[i] = leafDigest(h)
	}
	idx := index
	var proof []ProofStep
	for len(level) > 1 {
		isRight := idx%2 == 1
		siblingIdx := idx + 1
		dir := "R"
		if isRight {
			siblingIdx = idx - 1
			dir = "L"
		}
		sibling := level[idx] // duplicated odd node
		if siblingIdx < len(level) {
			sibling = level[siblingIdx]
		}
		proof = append(proof, ProofStep{Dir: dir, Sibling: sibling})
		next := make([]string, 0, (len(level)+1)/2)
		for i := 0; i < len(level); i += 2 {
			left := level[i]
			right := left
			if i+1 < len(level) {
				right = level[i+1]
			}
			next = append(next, nodeDigest(left, right))
		}
		level = next
		idx /= 2
	}
	return proof, nil
}

// VerifyProof checks an inclusion proof for recordHash against root.
func VerifyProof(recordHash string, proof []ProofStep, root string) bool {
	acc := leafDigest(recordHash)
	for _, step := range proof {
		if step.Dir == "L" {
			acc = nodeDigest(step.Sibling, acc)
		} else {
			acc = nodeDigest(acc, step.Sibling)
		}
	}
	return acc == root
}
