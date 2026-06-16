// The memory-rbac-proxy. The ONLY component that talks to a MemoryBackend.
//
// Pipeline for every operation:
//   1. Compile the caller's namespace from TRUSTED claims (never request body).
//   2. Compile the TARGET namespace and prefix tenant isolation.
//   3. Enforce the RBAC matrix BEFORE any backend call (decide()).
//   4. Only on permit, issue the backend call with an asserted-compiled namespace.
//
// Tenant isolation: the backend is tenant-naive, so the proxy folds tenant_id
// into the namespace it hands to the backend search/write key. Two tenants with
// identical org/dept/team strings therefore occupy disjoint backend buckets.

import type { IdentityClaims } from "./claims.ts";
import type { MemoryBackend, StoredMemory } from "./backend.ts";
import {
  assertCompiled,
  compileCallerNamespace,
  readAuthoritySet,
} from "./namespace.ts";
import { decide, type AccessDecision, type MemoryOpKind, type RbacContext } from "./rbac.ts";
import { recallFanout, type FanoutOptions, type RecallResult } from "./fanout.ts";

export class AccessDenied extends Error {
  constructor(public readonly decision: AccessDecision) {
    super(`memory op denied: ${decision.reason}`);
    this.name = "AccessDenied";
  }
}

/** Decision audit hook — the platform wires this to the ledger (MEM-007 etc.). */
export type AuditSink = (entry: {
  tenant_id: string;
  op: MemoryOpKind | "recall";
  decision: AccessDecision | { effect: "permit" | "deny"; reason: string };
  target?: string;
  at: string;
}) => void;

export interface ProxyOptions {
  backend: MemoryBackend;
  audit?: AuditSink;
}

export interface WriteRequest {
  text: string;
  /**
   * OPTIONAL caller-asserted target. If present it is treated as UNTRUSTED and
   * must resolve to the caller's own compiled namespace (or an explicit grant).
   * If absent, the proxy writes to the caller's own deepest scope. Free-form
   * namespaces never reach the backend.
   */
  targetNamespace?: string;
  topics?: string[];
  entities?: string[];
  trust_label?: StoredMemory["trust_label"];
  source_event?: string;
  rbac?: RbacContext;
}

export class MemoryRbacProxy {
  private readonly backend: MemoryBackend;
  private readonly audit?: AuditSink;

  constructor(opts: ProxyOptions) {
    this.backend = opts.backend;
    this.audit = opts.audit;
  }

  /**
   * Fold tenant into the namespace handed to the backend. The logical namespace
   * (org/...) is preserved as a suffix so RBAC math is unchanged; tenant becomes
   * the outermost isolation key. This makes cross-tenant collisions impossible
   * even against a tenant-naive backend.
   */
  private backendNs(tenant_id: string, logicalNs: string): string {
    // logicalNs is already assertCompiled. We DON'T pass this through
    // assertCompiled (it has a t_ prefix), but it stays internal to the proxy
    // <-> backend channel and is opaque to the grammar.
    return `t/${tenant_id}/${logicalNs}`;
  }

  /** Caller's own compiled namespace from trusted claims. */
  ownNamespace(claims: IdentityClaims): string {
    return compileCallerNamespace(claims);
  }

  async write(claims: IdentityClaims, req: WriteRequest): Promise<StoredMemory> {
    const own = compileCallerNamespace(claims);
    // Target defaults to own ONLY when truly absent (undefined). A PRESENT but
    // blank/whitespace target is a MEM-002 hazard and must be rejected, never
    // silently coerced to own scope.
    let target: string;
    if (req.targetNamespace === undefined) {
      target = own;
    } else {
      target = assertCompiled(req.targetNamespace); // throws on blank/default/malformed
    }
    const d = decide(claims, "write", target, req.rbac);
    this.emit(claims.tenant_id, "write", d, target);
    if (d.effect === "deny") throw new AccessDenied(d);

    return this.backend.write({
      tenant_id: claims.tenant_id,
      namespace: this.backendNs(claims.tenant_id, target),
      text: req.text,
      topics: req.topics,
      entities: req.entities,
      trust_label: req.trust_label,
      written_by: claims.principal ?? claims.agent,
      source_event: req.source_event,
    });
  }

  /** Single-scope read (non-fan-out) with RBAC enforcement. */
  async read(
    claims: IdentityClaims,
    targetNamespace: string,
    query: string,
    limit = 20,
  ): Promise<StoredMemory[]> {
    const target = assertCompiled(targetNamespace);
    const d = decide(claims, "read", target, {});
    this.emit(claims.tenant_id, "read", d, target);
    if (d.effect === "deny") throw new AccessDenied(d);
    return this.backend.search({
      tenant_id: claims.tenant_id,
      namespace: this.backendNs(claims.tenant_id, target),
      query,
      limit,
    });
  }

  /**
   * Recall fan-out across the caller's PERMITTED tiers (own + ancestors).
   * RBAC is enforced by CONSTRUCTION: we only ever fan out over the read
   * authority set, every member of which permits read by the matrix. We still
   * assert each via decide() so a future grammar change can't silently widen.
   */
  async recall(
    claims: IdentityClaims,
    query: string,
    opts: FanoutOptions,
  ): Promise<RecallResult> {
    const own = compileCallerNamespace(claims);
    const permitted = [...readAuthoritySet(own)].filter((ns) => {
      const d = decide(claims, "recall", ns, {});
      return d.effect === "permit";
    });
    // Hand the backend tenant-folded namespaces; the fan-out annotates using the
    // logical namespace it gets back, which the in-memory backend echoes. To keep
    // annotations in logical terms, we search per logical ns but key by tenant.
    const backendNamespaces = permitted.map((ns) => this.backendNs(claims.tenant_id, ns));
    const result = await recallFanout(this.backend, claims.tenant_id, query, backendNamespaces, opts);
    // Strip the tenant fold from annotations so consumers see logical namespaces.
    const prefix = `t/${claims.tenant_id}/`;
    result.items = result.items.map((it) => ({
      ...it,
      namespace: it.namespace.startsWith(prefix) ? it.namespace.slice(prefix.length) : it.namespace,
    }));
    result.tiers = result.tiers.map((t) => ({
      ...t,
      namespace: t.namespace.startsWith(prefix) ? t.namespace.slice(prefix.length) : t.namespace,
    }));
    this.emit(claims.tenant_id, "recall", { effect: "permit", reason: `fan-out over ${permitted.length} tiers` });
    return result;
  }

  async promote(claims: IdentityClaims, targetNamespace: string, rbac: RbacContext = {}): Promise<AccessDecision> {
    const target = assertCompiled(targetNamespace);
    const d = decide(claims, "promote", target, rbac);
    this.emit(claims.tenant_id, "promote", d, target);
    if (d.effect === "deny") throw new AccessDenied(d);
    return d; // actual tier move is a ledgered platform action (MEM-007), out of spike scope
  }

  async remove(
    claims: IdentityClaims,
    targetNamespace: string,
    rbac: RbacContext = {},
  ): Promise<AccessDecision> {
    const target = assertCompiled(targetNamespace);
    const d = decide(claims, "delete", target, rbac);
    this.emit(claims.tenant_id, "delete", d, target);
    if (d.effect === "deny") throw new AccessDenied(d);
    return d; // soft-delete with retention is a platform action (MEM-004)
  }

  private emit(
    tenant_id: string,
    op: MemoryOpKind | "recall",
    decision: AccessDecision | { effect: "permit" | "deny"; reason: string },
    target?: string,
  ): void {
    this.audit?.({ tenant_id, op, decision, target, at: new Date().toISOString() });
  }
}
