// Cedar PolicyEngine wrapper (spec Part 0 §3 — "Cedar in-process WASM bindings
// behind a PolicyEngine interface").
//
// Uses the real Cedar engine via @cedar-policy/cedar-wasm (the official AWS Cedar
// WASM binding; package license Apache-2.0). The `/nodejs` build is synchronous
// (CommonJS-style wasm load), so no async init is required.
//
// Two enforcement phases (PRD GOV-002 dual enforcement points):
//   (a) tool_listing  — filter an MCP tools/list response to the tools the agent
//       may invoke.
//   (b) invocation    — full per-call authorization for the exact (principal,
//       action, resource, context).
//
// PERFORMANCE MODEL (measured — see VERDICT.md EC1). The WASM binding has two
// re-parse costs that dominate latency at reference scale (208 policies, 6k
// entities):
//   * policy-set parse — eliminated by preparsing once (preparsePolicySet) and
//     calling statefulIsAuthorized, which references the cached set by id.
//   * entity-store parse — paid PER CALL; cost scales with the number of
//     entities passed. The engine therefore builds an entity index and passes
//     only the request-relevant SLICE (principal + its groups + the resource +
//     the resource's groups + the action). With a single-tool slice (~3-5
//     entities) per-call P99 is sub-1ms; passing the full 6k entity store makes
//     each call ~18ms.

import * as cedar from "@cedar-policy/cedar-wasm/nodejs";
import type {
  PolicySet,
  Entities,
  EntityJson,
  EntityUid,
  Context,
} from "@cedar-policy/cedar-wasm/nodejs";

export interface CedarRequest {
  principal: EntityUid;
  action: EntityUid;
  resource: EntityUid;
  context: Context;
}

export interface Decision {
  effect: "permit" | "deny";
  reasonPolicies: string[];
}

export const CEDAR_VERSION = cedar.getCedarVersion();

// Monotonic id so multiple engines in one process get distinct preparsed caches.
let engineSeq = 0;

function uidKey(u: EntityUid): string {
  const t = (u as { type?: string }).type ?? (u as { __entity?: { type: string } }).__entity?.type;
  const id = (u as { id?: string }).id ?? (u as { __entity?: { id: string } }).__entity?.id;
  return `${t}:${id}`;
}

export class CedarEngine {
  private readonly policies: PolicySet;
  private readonly allEntities: Entities;
  private readonly psetId: string;
  private readonly index = new Map<string, EntityJson>();

  /** When true, authorize() passes the FULL entity store (worst case). Used by
   *  the bench to demonstrate the entity-parse cost. Default false (sliced). */
  passFullEntities = false;

  constructor(policies: PolicySet, entities: Entities) {
    this.policies = policies;
    this.allEntities = entities;
    this.psetId = `pset_${engineSeq++}`;
    for (const e of entities) this.index.set(uidKey(e.uid as EntityUid), e);

    // Fail fast + preparse: the reference policy set + entities must parse, and
    // the policy set is cached for the hot path.
    const pp = cedar.preparsePolicySet(this.psetId, this.policies);
    if (pp.type === "failure") {
      throw new Error(`policy set did not parse: ${JSON.stringify(pp.errors).slice(0, 400)}`);
    }
    const e = cedar.checkParseEntities({ entities: this.allEntities });
    if (e.type === "failure") {
      throw new Error(`entities did not parse: ${JSON.stringify(e.errors).slice(0, 400)}`);
    }
  }

  /**
   * Build the minimal entity slice for a request: the principal, the resource,
   * the action, and the transitive `parents` (groups) of each. Cedar membership
   * (`in`) only needs the chain of group entities, so this slice is sound for the
   * reference policy shape (Agent in Team, Tool in Team).
   */
  private sliceFor(principal: EntityUid, action: EntityUid, resources: EntityUid[]): Entities {
    if (this.passFullEntities) return this.allEntities;
    const out: EntityJson[] = [];
    const seen = new Set<string>();
    const add = (key: string) => {
      if (seen.has(key)) return;
      const ent = this.index.get(key);
      if (!ent) return;
      seen.add(key);
      out.push(ent);
      for (const p of ent.parents) out.push(...this.parentChain(p as EntityUid, seen));
    };
    add(uidKey(principal));
    add(uidKey(action));
    for (const r of resources) add(uidKey(r));
    return out;
  }

  private parentChain(parent: EntityUid, seen: Set<string>): EntityJson[] {
    const key = uidKey(parent);
    if (seen.has(key)) return [];
    const ent = this.index.get(key);
    if (!ent) return [];
    seen.add(key);
    const acc = [ent];
    for (const p of ent.parents) acc.push(...this.parentChain(p as EntityUid, seen));
    return acc;
  }

  /** Phase (b): per-call invocation authorization. Default-deny. Preparsed
   *  policy set + minimal entity slice keep this inside the NF-004 budget. */
  authorize(req: CedarRequest): Decision {
    const entities = this.sliceFor(req.principal, req.action, [req.resource]);
    const ans = cedar.statefulIsAuthorized({
      principal: req.principal,
      action: req.action,
      resource: req.resource,
      context: req.context,
      preparsedPolicySetId: this.psetId,
      entities,
    });
    if (ans.type === "failure") {
      // An evaluation failure is a hard deny (fail closed, NF-005).
      return { effect: "deny", reasonPolicies: [] };
    }
    const decision = ans.response.decision; // "allow" | "deny"
    return {
      effect: decision === "allow" ? "permit" : "deny",
      reasonPolicies: ans.response.diagnostics.reason,
    };
  }

  /**
   * Phase (a): tool-list filtering.
   *
   * Two strategies are available; both are exercised by the bench:
   *
   *   "per-tool" (default, production-recommended): for each candidate tool run a
   *   stateful authorize with a single-tool entity slice. O(N) cheap calls; the
   *   visible set is exactly the PERMITted tools. Scales linearly and predictably.
   *
   *   "partial": one isAuthorizedPartial pass with the resource UNKNOWN to obtain
   *   residuals, then concretise. Useful when a single residual collapses to a
   *   uniform decision; but isAuthorizedPartial RE-PARSES the policy set (no
   *   stateful variant exists in the WASM binding), so it carries a fixed ~140ms
   *   cost at reference scale — documented as a limitation.
   */
  filterTools(
    principal: EntityUid,
    action: EntityUid,
    context: Context,
    candidateResources: EntityUid[],
    strategy: "per-tool" | "partial" = "per-tool",
  ): { visible: EntityUid[]; strategy: string } {
    if (strategy === "partial") {
      const partial = cedar.isAuthorizedPartial({
        principal,
        action,
        resource: null,
        context,
        policies: this.policies,
        entities: this.allEntities,
      });
      if (partial.type === "residuals" && partial.response.decision !== null) {
        const permit = partial.response.decision === "allow";
        return { visible: permit ? candidateResources : [], strategy: "partial-uniform" };
      }
      // residual depends on resource -> concretise per tool (falls through).
    }
    const visible = candidateResources.filter(
      (r) => this.authorize({ principal, action, resource: r, context }).effect === "permit",
    );
    return { visible, strategy: strategy === "partial" ? "partial+concretise" : "per-tool" };
  }
}
