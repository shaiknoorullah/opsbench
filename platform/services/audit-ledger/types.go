package auditledger

// These types mirror @opsbench/schemas audit-record.json (the neutral contract).
// JSON tags match the schema field names exactly; omitempty marks the schema's
// optional fields so absent fields do not appear in the canonical hash input.

type Agent struct {
	ID      string `json:"id"`
	Version string `json:"version,omitempty"`
}

type Resource struct {
	System    string `json:"system"`
	Ref       string `json:"ref"`
	DataClass string `json:"data_class,omitempty"`
}

type Operation struct {
	Kind        string `json:"kind"`
	Name        string `json:"name"`
	PayloadHash string `json:"payload_hash,omitempty"`
}

type Decision struct {
	Effect         string   `json:"effect"`
	PolicyRefs     []string `json:"policy_refs,omitempty"`
	DecisionRecord string   `json:"decision_record,omitempty"`
}

type Outcome struct {
	Status    string `json:"status"`
	DetailRef string `json:"detail_ref,omitempty"`
}

type Context struct {
	TaskID      string `json:"task_id,omitempty"`
	IncidentID  string `json:"incident_id,omitempty"`
	ApprovalRef string `json:"approval_ref,omitempty"`
	OnBehalfOf  string `json:"on_behalf_of,omitempty"`
	TimeSource  string `json:"time_source,omitempty"`
}

// AppendInput is the caller-supplied content. The sequencer assigns Seq, ID,
// PrevHash, and Hash — the caller never sets them.
type AppendInput struct {
	TenantID        string     `json:"tenant_id"`
	TS              string     `json:"ts"`
	Agent           Agent      `json:"agent"`
	DelegationChain []string   `json:"delegation_chain"`
	Resources       []Resource `json:"resources"`
	Operation       Operation  `json:"operation"`
	Decision        Decision   `json:"decision"`
	Outcome         Outcome    `json:"outcome"`
	Context         *Context   `json:"context,omitempty"`
}

// AuditRecord is the sealed, chained record (audit-record.json).
type AuditRecord struct {
	Seq             int64      `json:"seq"`
	ID              string     `json:"id"`
	TenantID        string     `json:"tenant_id"`
	TS              string     `json:"ts"`
	Agent           Agent      `json:"agent"`
	DelegationChain []string   `json:"delegation_chain"`
	Resources       []Resource `json:"resources"`
	Operation       Operation  `json:"operation"`
	Decision        Decision   `json:"decision"`
	Outcome         Outcome    `json:"outcome"`
	Context         *Context   `json:"context,omitempty"`
	PrevHash        string     `json:"prev_hash"`
	Hash            string     `json:"hash"`
}

// DurableReceipt is returned only after a record is durably committed.
type DurableReceipt struct {
	TenantID    string `json:"tenant_id"`
	Seq         int64  `json:"seq"`
	ID          string `json:"id"`
	Hash        string `json:"hash"`
	CommittedAt string `json:"committed_at"`
}

// Checkpoint is a Merkle checkpoint over a contiguous block of one tenant's chain.
type Checkpoint struct {
	TenantID  string `json:"tenant_id"`
	FromSeq   int64  `json:"from_seq"`
	ToSeq     int64  `json:"to_seq"`
	Root      string `json:"root"`
	CreatedAt string `json:"created_at"`
}

// ChainHead is the last committed record of a tenant chain.
type ChainHead struct {
	Seq  int64
	Hash string
}
