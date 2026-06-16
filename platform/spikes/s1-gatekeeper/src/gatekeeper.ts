// Governed-mutation vertical slice (spec Part 0 §5.1).
//
//   Agent proposes -> Policy Gateway (Cedar phase b: invocation) -> PolicyDecisionRecord -> Ledger
//   -> Gatekeeper forces dry-run -> ApprovalObject {payload_hash, idempotency_key, ttl, diff, dry_run_ref}
//   -> Approval Service (first decision wins) -> on APPROVED re-validate payload_hash
//   -> (Credential Broker mint — simulated) -> Gatekeeper executes against a MOCK target
//   -> chained AuditRecords throughout -> Event stream omitted (out of S1 scope).
//
// Order is normative: ledger write precedes effect acknowledgment (NF-003). All
// gated steps fail closed (NF-005).
//
// External targets (Kubernetes) are SIMULATED with an in-process mock executor.

import type {
  ApprovalObject,
  ApprovalState,
  PolicyDecisionRecord,
  AuditRecord,
} from "../../../packages/schemas/src/index.ts";
import { CedarEngine, CEDAR_VERSION, type CedarRequest } from "./cedar-engine.ts";
import { AuditLedger } from "./ledger.ts";
import { hashObject } from "./canonical.ts";
import { approvalId, actionRef, idempotencyKey, pdrId, taskId } from "./ids.ts";

export interface MutationProposal {
  tenantId: string;
  agentSpiffe: string;
  humanAuthorizer: string; // usr_...
  toolName: string; // e.g. kubernetes:scale
  cedarRequest: CedarRequest; // principal/action/resource/context for Cedar
  resourceSystem: string; // e.g. k8s:prod-eu
  resourceRef: string; // e.g. deploy/checkout
  payload: Record<string, unknown>; // the EXACT execution payload
  irreversible: boolean;
  tier: 0 | 1 | 2 | 3;
  eligibleReviewers: string[]; // usr_/grp_
}

export interface MockTarget {
  // Returns a rollback handle string; throws to simulate failure.
  apply(toolName: string, payload: Record<string, unknown>): { rollbackHandle: string };
}

/** In-process mock K8s-style executor (no real cluster — ENVIRONMENT REALITY). */
export class MockExecutor implements MockTarget {
  applied: { toolName: string; payload: Record<string, unknown> }[] = [];
  apply(toolName: string, payload: Record<string, unknown>): { rollbackHandle: string } {
    this.applied.push({ toolName, payload });
    return { rollbackHandle: `rbk_${this.applied.length}` };
  }
}

export interface FlowResult {
  decisionRecord: PolicyDecisionRecord;
  approval?: ApprovalObject;
  finalState: ApprovalState | "denied_by_policy";
  executed: boolean;
  rollbackHandle?: string;
  ledger: AuditRecord[];
  blockedReason?: string;
}

const TIME_SOURCE = "ntp:pool.ntp.org";

export class Gatekeeper {
  constructor(
    private readonly engine: CedarEngine,
    private readonly ledger: AuditLedger,
    private readonly target: MockTarget,
  ) {}

  /** Phase (b) decision + normalized PolicyDecisionRecord (GOV-002). */
  decide(p: MutationProposal): { record: PolicyDecisionRecord; permit: boolean } {
    const t0 = performance.now();
    const decision = this.engine.authorize(p.cedarRequest);
    const latency = performance.now() - t0;

    const record: PolicyDecisionRecord = {
      id: pdrId(),
      tenant_id: p.tenantId,
      principal: p.agentSpiffe,
      action: p.toolName,
      resource: cedarResourceToScopeUri(p.tenantId, p.resourceRef),
      context_hash: hashObject(p.cedarRequest.context),
      effect: decision.effect,
      engine: { kind: "cedar", version: CEDAR_VERSION },
      policy_refs: decision.reasonPolicies.map(toPolicyRef),
      evaluated_at: new Date().toISOString(),
      latency_ms: Math.round(latency * 1000) / 1000,
      phase: "invocation",
    };
    return { record, permit: decision.effect === "permit" };
  }

  /**
   * Run the full §5.1 flow. `approverPayloadHashSeen` lets a test inject what the
   * approver actually saw, to exercise the payload-hash invalidation invariant
   * (GOV-004): if the executed payload's hash differs from the approved hash, the
   * gatekeeper MUST block at execution.
   */
  run(
    p: MutationProposal,
    opts: {
      approverDecision: "approved" | "rejected";
      approverSurface?: "slack" | "web" | "api";
      /** If set, the payload actually executed (simulating post-approval tampering). */
      executionPayloadOverride?: Record<string, unknown>;
    },
  ): FlowResult {
    // step 2: policy decision -> ledger
    const { record, permit } = this.decide(p);
    this.ledger.append({
      tenant_id: p.tenantId,
      ts: new Date().toISOString(),
      agent: { id: p.agentSpiffe },
      delegation_chain: [p.humanAuthorizer, p.agentSpiffe],
      resources: [{ system: p.resourceSystem, ref: p.resourceRef, data_class: "config" }],
      operation: { kind: "policy_decision", name: p.toolName },
      decision: { effect: record.effect, policy_refs: record.policy_refs, decision_record: record.id },
      outcome: { status: permit ? "ok" : "denied" },
      context: { time_source: TIME_SOURCE, task_id: taskId() },
    });

    if (!permit) {
      return {
        decisionRecord: record,
        finalState: "denied_by_policy",
        executed: false,
        ledger: [...this.ledger.all()],
        blockedReason: "policy_deny",
      };
    }

    // step 3: force dry-run (simulated) -> ledger ref becomes dry_run_ref
    const dryRunRecord = this.ledger.append({
      tenant_id: p.tenantId,
      ts: new Date().toISOString(),
      agent: { id: p.agentSpiffe },
      delegation_chain: [p.humanAuthorizer, p.agentSpiffe],
      resources: [{ system: p.resourceSystem, ref: p.resourceRef, data_class: "config" }],
      operation: { kind: "tool_call", name: `${p.toolName}#dry_run`, payload_hash: hashObject(p.payload) },
      decision: { effect: "permit", decision_record: record.id },
      outcome: { status: "ok" },
      context: { time_source: TIME_SOURCE },
    });

    // step 4: create ApprovalObject (payload hash-pinned)
    const approvedHash = hashObject(p.payload);
    const approval: ApprovalObject = {
      id: approvalId(),
      tenant_id: p.tenantId,
      action_ref: actionRef(),
      tier: p.tier,
      payload_hash: approvedHash,
      idempotency_key: idempotencyKey(),
      diff: { format: "structured", body: JSON.stringify(p.payload) },
      dry_run_ref: dryRunRecord.id,
      risk: {
        irreversible: p.irreversible,
        blast_radius: `${p.resourceSystem}:${p.resourceRef}`,
        policy_refs: record.policy_refs ?? [],
      },
      reviewers: {
        required: p.tier === 3 ? 2 : 1,
        eligible: p.eligibleReviewers,
        second_must_differ: p.tier === 3,
      },
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      state: "pending",
      decisions: [],
      ledger_refs: [dryRunRecord.id],
    };

    // step 5: approver decision (first decision wins). The approver attests to the
    // hash they saw = the approved hash.
    const surface = opts.approverSurface ?? "slack";
    approval.decisions.push({
      decision: opts.approverDecision,
      by: pickUser(p.eligibleReviewers),
      surface,
      at: new Date().toISOString(),
      payload_hash_seen: approvedHash,
    });

    this.ledger.append({
      tenant_id: p.tenantId,
      ts: new Date().toISOString(),
      agent: { id: p.agentSpiffe },
      delegation_chain: [p.humanAuthorizer, p.agentSpiffe],
      resources: [{ system: p.resourceSystem, ref: p.resourceRef }],
      operation: { kind: "approval", name: approval.id },
      decision: { effect: "permit", decision_record: record.id },
      outcome: { status: opts.approverDecision === "approved" ? "ok" : "denied" },
      context: { time_source: TIME_SOURCE, approval_ref: approval.id, on_behalf_of: p.humanAuthorizer },
    });

    if (opts.approverDecision === "rejected") {
      approval.state = "rejected";
      return {
        decisionRecord: record,
        approval,
        finalState: "rejected",
        executed: false,
        ledger: [...this.ledger.all()],
        blockedReason: "approver_rejected",
      };
    }

    approval.state = "approved";

    // step 6: on APPROVED, re-validate payload hash against the EXACT payload that
    // will be executed. This is the GOV-004 invariant gate.
    const executionPayload = opts.executionPayloadOverride ?? p.payload;
    const executionHash = hashObject(executionPayload);

    if (executionHash !== approval.payload_hash) {
      // BLOCK: payload mutated after approval. Record a denial (denials are
      // first-class audit records) and invalidate the approval.
      approval.state = "invalidated";
      this.ledger.append({
        tenant_id: p.tenantId,
        ts: new Date().toISOString(),
        agent: { id: p.agentSpiffe },
        delegation_chain: [p.humanAuthorizer, p.agentSpiffe],
        resources: [{ system: p.resourceSystem, ref: p.resourceRef, data_class: "config" }],
        operation: { kind: "tool_call", name: p.toolName, payload_hash: executionHash },
        decision: { effect: "deny", decision_record: record.id },
        outcome: { status: "denied", detail_ref: "payload_hash_mismatch" },
        context: { time_source: TIME_SOURCE, approval_ref: approval.id },
      });
      return {
        decisionRecord: record,
        approval,
        finalState: "invalidated",
        executed: false,
        ledger: [...this.ledger.all()],
        blockedReason: "payload_hash_mismatch",
      };
    }

    // step 7 (simulated): credential broker mints JIT write cred — omitted as a
    // mock; in production this is C4. step 8: execute against mock target.
    approval.state = "executing";
    let rollbackHandle: string | undefined;
    let outcomeStatus: "ok" | "error" = "ok";
    try {
      const res = this.target.apply(p.toolName, executionPayload);
      rollbackHandle = res.rollbackHandle;
    } catch {
      outcomeStatus = "error";
    }

    // ledger write PRECEDES returning the effect ack (NF-003).
    this.ledger.append({
      tenant_id: p.tenantId,
      ts: new Date().toISOString(),
      agent: { id: p.agentSpiffe },
      delegation_chain: [p.humanAuthorizer, p.agentSpiffe],
      resources: [{ system: p.resourceSystem, ref: p.resourceRef, data_class: "config" }],
      operation: { kind: "tool_call", name: p.toolName, payload_hash: executionHash },
      decision: { effect: "permit", policy_refs: record.policy_refs, decision_record: record.id },
      outcome: { status: outcomeStatus, detail_ref: rollbackHandle },
      context: { time_source: TIME_SOURCE, approval_ref: approval.id, on_behalf_of: p.humanAuthorizer },
    });

    approval.state = outcomeStatus === "ok" ? "executed" : "failed";
    return {
      decisionRecord: record,
      approval,
      finalState: approval.state,
      executed: outcomeStatus === "ok",
      rollbackHandle,
      ledger: [...this.ledger.all()],
    };
  }
}

function cedarResourceToScopeUri(tenantId: string, ref: string): string {
  // scope://t_x/resource/<ref-with-slashes-normalised>
  const safe = ref.replace(/[^a-zA-Z0-9._/-]/g, "-");
  return `scope://${tenantId}/resource/${safe}`;
}

function toPolicyRef(cedarPolicyId: string): string {
  // Cedar policy ids in the reference set are already `pol_*`-ish; normalise to
  // the schema's policyRef pattern ^pol_[a-zA-Z0-9._-]+$.
  const base = cedarPolicyId.startsWith("pol_") ? cedarPolicyId : `pol_${cedarPolicyId}`;
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function pickUser(eligible: string[]): string {
  const u = eligible.find((e) => e.startsWith("usr_"));
  return u ?? "usr_oncall";
}
