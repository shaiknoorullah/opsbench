package auditledger

// SealRecord turns a caller AppendInput into a fully sealed AuditRecord by assigning
// the chain-owned fields (seq, id, prev_hash, hash). Pure and storage-independent —
// the same logic backs Architecture A and B (C5 design §6). The hash binds id +
// prev_hash, so the verifier recomputes it from the stored record alone.
func SealRecord(in AppendInput, seq int64, prevHash string, makeID func() string) (AuditRecord, error) {
	if makeID == nil {
		makeID = LedgerID
	}
	rec := AuditRecord{
		Seq:             seq,
		ID:              makeID(),
		TenantID:        in.TenantID,
		TS:              in.TS,
		Agent:           in.Agent,
		DelegationChain: in.DelegationChain,
		Resources:       in.Resources,
		Operation:       in.Operation,
		Decision:        in.Decision,
		Outcome:         in.Outcome,
		Context:         in.Context,
		PrevHash:        prevHash,
	}
	h, err := ComputeRecordHash(rec, prevHash)
	if err != nil {
		return AuditRecord{}, err
	}
	rec.Hash = h
	return rec, nil
}
