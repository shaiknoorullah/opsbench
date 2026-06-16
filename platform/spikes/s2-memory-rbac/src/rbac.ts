// Scope-RBAC enforcer implementing the spec §5 access matrix.
//
// | Operation        | Rule                                                                  |
// |------------------|-----------------------------------------------------------------------|
// | write            | Only the caller's OWN deepest scope (team-shared needs explicit grant) |
// | read / recall    | Own scope + ancestors; sibling AND descendant denied by default       |
// | promote          | Human-authorized only; ledgered (MEM-007)                             |
// | delete / correct | Scope owners + P-ADM; prior content retained in audit history        |
//
// Decisions are pure functions of (claims-derived caller namespace, target,
// operation, human?). Cross-tenant is denied before any namespace math.

import type { IdentityClaims } from "./claims.ts";
import { isHuman } from "./claims.ts";
import {
  ancestorsOf,
  assertCompiled,
  compileCallerNamespace,
  isAncestorOrSelf,
  isDescendant,
  tierOf,
  type MemoryTier,
} from "./namespace.ts";

export type MemoryOpKind = "write" | "read" | "recall" | "promote" | "delete" | "correct";

export interface RbacContext {
  /** Explicit team-shared write grant: caller may write these exact namespaces. */
  writeGrants?: string[];
  /** Platform-admin role (P-ADM) — required alongside human for cross-scope delete. */
  isPlatformAdmin?: boolean;
}

export interface AccessDecision {
  effect: "permit" | "deny";
  reason: string;
  callerNamespace: string;
  targetNamespace: string;
  tier: MemoryTier;
}

/**
 * Decide a single memory operation. `target` MUST already be compiled (callers
 * use compileTargetNamespace). Cross-tenant is structurally impossible here:
 * both namespaces are derived under the same tenant_id by the proxy, and we
 * additionally require the caller's tenant to be threaded in for the audit.
 */
export function decide(
  claims: IdentityClaims,
  op: MemoryOpKind,
  target: string,
  ctx: RbacContext = {},
): AccessDecision {
  const callerNs = compileCallerNamespace(claims);
  const targetNs = assertCompiled(target);
  const tier = tierOf(targetNs);

  const base = { callerNamespace: callerNs, targetNamespace: targetNs, tier } as const;
  const human = isHuman(claims);

  switch (op) {
    case "write": {
      // Own deepest scope only.
      if (targetNs === callerNs) {
        return { effect: "permit", reason: "write to own deepest scope", ...base };
      }
      // Explicit team-shared grant.
      if (ctx.writeGrants?.includes(targetNs)) {
        return { effect: "permit", reason: "write via explicit grant", ...base };
      }
      if (isDescendant(targetNs, callerNs)) {
        return { effect: "deny", reason: "write to descendant scope denied (own deepest scope only)", ...base };
      }
      if (ancestorsOf(callerNs).includes(targetNs)) {
        return { effect: "deny", reason: "write to ancestor scope denied (would leak down-hierarchy; promote is the only upward path)", ...base };
      }
      return { effect: "deny", reason: "write to non-own scope denied (no grant)", ...base };
    }

    case "read":
    case "recall": {
      // Own scope + ancestors. Siblings and descendants denied.
      if (isAncestorOrSelf(targetNs, callerNs)) {
        return { effect: "permit", reason: "read own scope or ancestor", ...base };
      }
      if (isDescendant(targetNs, callerNs)) {
        return { effect: "deny", reason: "read of descendant scope denied by default", ...base };
      }
      return { effect: "deny", reason: "read of sibling/unrelated scope denied by default", ...base };
    }

    case "promote": {
      // Human-authorized only (ledgered MEM-007). NHIs may never promote.
      if (!human) {
        return { effect: "deny", reason: "promote is human-only (NHI denied)", ...base };
      }
      // The human must own (or be an ancestor of) the source scope being promoted.
      if (isAncestorOrSelf(targetNs, callerNs)) {
        return { effect: "permit", reason: "human promote within own authority (ledger required)", ...base };
      }
      return { effect: "deny", reason: "human cannot promote a scope outside own authority", ...base };
    }

    case "delete":
    case "correct": {
      // Scope owners + P-ADM. Humans only; prior content retained (MEM-004).
      if (!human) {
        return { effect: "deny", reason: "delete/correct is human-only (NHI denied)", ...base };
      }
      if (targetNs === callerNs) {
        return { effect: "permit", reason: "scope owner delete/correct (prior content retained MEM-004)", ...base };
      }
      if (ctx.isPlatformAdmin) {
        return { effect: "permit", reason: "P-ADM delete/correct (prior content retained MEM-004)", ...base };
      }
      return { effect: "deny", reason: "delete/correct requires scope ownership or P-ADM", ...base };
    }

    default: {
      const _exhaustive: never = op;
      return { effect: "deny", reason: `unknown operation ${String(_exhaustive)}`, ...base };
    }
  }
}
