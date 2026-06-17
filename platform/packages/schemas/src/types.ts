// TypeScript types mirroring the Opsbench JSON Schemas (json/*.json).
// Hand-authored to match the schemas; the JSON Schemas remain the source of truth.
// Keep in sync with spec Part 1 (docs/superpowers/specs/opsbench-platform/01-schemas.md).

// --- common primitives ---
export type Ulid = string; // [0-9A-HJKMNP-TV-Z]{26}
export type PrefixedId = string; // e.g. apr_01J...
export type TenantId = string; // t_...
export type SpiffeId = string; // spiffe://<tenant>/agent/<id>
export type UserId = string; // usr_...
export type GroupId = string; // grp_...
export type Sha256 = string; // sha256:<64 hex>
export type Timestamp = string; // RFC 3339 UTC
export type ScopeUri = string; // scope://t_x/...
export type LedgerRef = string; // led_...
export type PolicyRef = string; // pol_...
export type Principal = UserId | GroupId | SpiffeId;
export type Surface =
  | "slack" | "teams" | "web" | "tui" | "mobile" | "desktop" | "voice_dtmf" | "api";

// --- ApprovalObject (GOV-004/005) ---
export type ApprovalState =
  | "pending" | "approved" | "executing" | "executed"
  | "rejected" | "invalidated" | "failed" | "expired";

export interface ApprovalDecision {
  decision: "approved" | "rejected" | "rejected_with_edits";
  by: UserId;
  surface: Surface;
  at: Timestamp;
  payload_hash_seen: Sha256;
  edits?: Record<string, unknown> | null;
}

export interface ApprovalObject {
  id: PrefixedId;
  tenant_id: TenantId;
  action_ref: string;
  tier: 0 | 1 | 2 | 3;
  payload_hash: Sha256;
  idempotency_key: string;
  diff: { format: "unified" | "structured"; body: string };
  dry_run_ref?: LedgerRef | null;
  risk: { irreversible: boolean; blast_radius?: string; policy_refs: PolicyRef[] };
  reviewers: { required: 1 | 2; eligible: (UserId | GroupId)[]; second_must_differ: boolean };
  expires_at: Timestamp;
  state: ApprovalState;
  decisions: ApprovalDecision[];
  ledger_refs?: LedgerRef[];
}

// --- AuditRecord (IDN-001) ---
export interface AuditRecord {
  seq: number;
  id: LedgerRef;
  tenant_id: TenantId;
  ts: Timestamp;
  agent: { id: SpiffeId; version?: string };
  delegation_chain: string[];
  resources: { system: string; ref: string; data_class?: string }[];
  operation: {
    kind: "tool_call" | "approval" | "policy_decision" | "escalation" | "memory_op" | "admin";
    name: string;
    payload_hash?: Sha256;
  };
  decision: { effect: "permit" | "deny"; policy_refs?: PolicyRef[]; decision_record?: string };
  outcome: { status: "ok" | "error" | "denied"; detail_ref?: string };
  context?: {
    task_id?: string;
    incident_id?: string;
    approval_ref?: string;
    on_behalf_of?: UserId;
    time_source?: string;
  };
  prev_hash: Sha256;
  hash: Sha256;
}

// --- PolicyDecisionRecord (GOV-002) ---
export interface PolicyDecisionRecord {
  id: string;
  tenant_id: TenantId;
  principal: Principal;
  action: string;
  resource: ScopeUri;
  context_hash: Sha256;
  effect: "permit" | "deny";
  engine: { kind: "cedar" | "rego" | "cel"; version: string };
  policy_refs?: PolicyRef[];
  evaluated_at: Timestamp;
  latency_ms?: number;
  phase: "tool_listing" | "invocation";
}

// --- AutonomyCertificate (GOV-006/007) ---
export type AutonomyLevel = "L0" | "L1" | "L2" | "L3" | "L4";
export interface AutonomyCertificate {
  id: string;
  tenant_id: TenantId;
  subject: { agent: SpiffeId; scenario_class: string; environment: string };
  level: AutonomyLevel;
  evidence: {
    eval_runs: string[];
    thresholds: Record<string, string>;
    window: { from: Timestamp; to: Timestamp; sample_size: number };
  };
  approved_by: UserId;
  issued_at: Timestamp;
  expires_at: Timestamp;
  revocation: {
    conditions: string[];
    status: "active" | "revoked" | "expired";
    revoked_at?: Timestamp | null;
    revoked_reason?: string | null;
  };
  ledger_refs?: LedgerRef[];
}

// --- MemoryScope (MEM-001..005) ---
export type MemoryTier = "org" | "department" | "team" | "agent" | "account";
export interface MemoryScope {
  tenant_id: TenantId;
  namespace: string;
  tier: MemoryTier;
  operation?: {
    kind: "write" | "read" | "recall" | "promote" | "delete" | "correct";
    caller_namespace: string;
    trust_label?: "verified_fact" | "runbook" | "feedback_memory";
  };
  provenance?: { source_event?: string; written_by?: SpiffeId; ledger_ref?: LedgerRef };
  retention?: { ttl_seconds?: number; erasable?: boolean };
}

// --- CanonicalEvent (SUR-001) ---
export interface CanonicalEvent {
  id: string;
  tenant_id: TenantId;
  stream: string;
  ts: Timestamp;
  actor: { type: "agent" | "human" | "system"; id: string };
  kind: string;
  disclosure: 0 | 1 | 2;
  payload: Record<string, unknown>;
  ledger_ref?: LedgerRef | null;
  schema: string;
}

// --- EscalationLadder (ESC-001..003) ---
export interface EscalationRung {
  n: number;
  channel: "slack" | "teams" | "push" | "sms" | "voice";
  timeout_s: number;
  state?: "pending" | "fired" | "acked" | "timeout" | "skipped_outage";
  fired_at?: Timestamp;
  identity_assurance?: "pin" | "none";
}
export interface EscalationLadder {
  id: string;
  tenant_id: TenantId;
  subject_ref: string;
  target: { resolved_human: UserId; roster_source: string; resolved_at: Timestamp };
  rungs: EscalationRung[];
  ack?: {
    by: UserId;
    channel: Surface;
    at: Timestamp;
    evidence?: { call_sid?: string; digits_hash?: Sha256; pin_verified?: boolean; attestation?: string };
  };
  state: "running" | "acked" | "exhausted";
  on_exhausted: (UserId | GroupId)[];
}

// --- CapabilityEnvelope (INT-001/005) ---
export interface CapabilityEnvelope {
  tenant_id: TenantId;
  capability: string; // domain/version:verb
  scope: ScopeUri;
  params: Record<string, unknown>;
  routing: { connector: string; fallback?: string[] };
  budget?: { vendor_quota_class?: string; cost_attribution?: string };
  freshness?: { max_staleness_s?: number; served_from?: "live" | "cache"; as_of?: Timestamp };
}
