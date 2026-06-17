// Claims -> namespace COMPILER and the namespace algebra used by the RBAC enforcer.
//
// Grammar (spec §5, normative):
//   ns := org/<org_id>
//       | org/<org_id>/dept/<dept_id>
//       | org/<org_id>/dept/<dept_id>/team/<team_id>
//       | org/<org_id>/dept/<dept_id>/team/<team_id>/agent/<agent_id>
//       | org/<org_id>/account/<crm_account_id>          # support-context scope
//
// Every namespace is COMPILED here from trusted identity-registry claims. The
// backend never sees a free-form namespace — `assertCompiled` is the only gate
// through which a string reaches a backend call.

import type { IdentityClaims } from "./claims.ts";

export type MemoryTier = "org" | "department" | "team" | "agent" | "account";

/** Segment id charset, matching memory-scope.json pattern segments. */
const SEG = /^[a-zA-Z0-9._-]+$/;

/**
 * The compiled-namespace pattern. Identical in spirit to memory-scope.json's
 * `namespace` pattern; re-stated here so the proxy can self-check WITHOUT a
 * schema round-trip on the hot path (the schema is still used in tests).
 */
export const NAMESPACE_RE =
  /^org\/[a-zA-Z0-9._-]+(\/dept\/[a-zA-Z0-9._-]+(\/team\/[a-zA-Z0-9._-]+(\/agent\/[a-zA-Z0-9._-]+)?)?|\/account\/[a-zA-Z0-9._-]+)?$/;

export class NamespaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NamespaceError";
  }
}

/** Reserved/forbidden tokens the engine treats as DEFAULT (MEM-002 hazard). */
const FORBIDDEN_SEGMENTS = new Set(["default", "default-user", "", "*"]);

function requireSeg(label: string, v: string | undefined): string {
  if (v === undefined || v === null) {
    throw new NamespaceError(`missing required segment: ${label}`);
  }
  const s = String(v).trim();
  if (s.length === 0) {
    throw new NamespaceError(`blank segment: ${label} (MEM-002: blank namespace forbidden)`);
  }
  if (FORBIDDEN_SEGMENTS.has(s.toLowerCase())) {
    throw new NamespaceError(
      `forbidden segment "${s}" for ${label}: collides with engine DEFAULT_MCP_NAMESPACE fallback (MEM-002)`,
    );
  }
  if (!SEG.test(s)) {
    throw new NamespaceError(`segment "${s}" for ${label} violates charset [a-zA-Z0-9._-]`);
  }
  return s;
}

/**
 * Compile the caller's OWN deepest namespace from trusted claims.
 *
 * Deepest scope is the most specific tier the claims support:
 *   agent (if NHI) > team (home team) > department (home dept) > org.
 * If `account` is present it takes precedence — a support-context principal's
 * own scope is the account branch (org/<org>/account/<id>).
 */
export function compileCallerNamespace(c: IdentityClaims): string {
  const org = requireSeg("org", c.org);
  if (c.account !== undefined) {
    const acct = requireSeg("account", c.account);
    return assertCompiled(`org/${org}/account/${acct}`);
  }
  const homeDept = c.dept?.[0];
  const homeTeam = c.team?.[0];
  const agent = c.agent;

  let ns = `org/${org}`;
  if (homeDept !== undefined) {
    ns += `/dept/${requireSeg("dept", homeDept)}`;
    if (homeTeam !== undefined) {
      ns += `/team/${requireSeg("team", homeTeam)}`;
      if (agent !== undefined) {
        ns += `/agent/${requireSeg("agent", agent)}`;
      }
    } else if (agent !== undefined) {
      // An agent must live under a team; reject team-less agent claims.
      throw new NamespaceError("agent claim present without a team claim (grammar violation)");
    }
  } else if (homeTeam !== undefined || agent !== undefined) {
    throw new NamespaceError("team/agent claim present without a dept claim (grammar violation)");
  }
  return assertCompiled(ns);
}

/** Tier of a compiled namespace (its deepest segment). */
export function tierOf(ns: string): MemoryTier {
  if (/\/agent\/[^/]+$/.test(ns)) return "agent";
  if (/\/team\/[^/]+$/.test(ns)) return "team";
  if (/\/account\/[^/]+$/.test(ns)) return "account";
  if (/\/dept\/[^/]+$/.test(ns)) return "department";
  return "org";
}

/**
 * Ancestors of a compiled namespace, deepest-first EXCLUDING self.
 * For org/o/dept/d/team/t/agent/a -> [team, dept, org].
 * Account branch ancestors: org/o/account/x -> [org/o].
 */
export function ancestorsOf(ns: string): string[] {
  const out: string[] = [];
  let cur = ns;
  // Strip trailing "/<kind>/<id>" pairs one at a time.
  while (true) {
    const m = cur.match(/^(.*)\/(?:dept|team|agent|account)\/[^/]+$/);
    if (!m || m[1] === undefined) break;
    cur = m[1];
    out.push(cur);
  }
  return out;
}

/** The read-authority set for a caller: own namespace + ancestors. */
export function readAuthoritySet(ownNs: string): Set<string> {
  return new Set<string>([ownNs, ...ancestorsOf(ownNs)]);
}

/** True if `a` is an ancestor of (or equal to) `b`. */
export function isAncestorOrSelf(a: string, b: string): boolean {
  return a === b || ancestorsOf(b).includes(a);
}

/** True if `a` is a strict descendant of `b`. */
export function isDescendant(a: string, b: string): boolean {
  return a !== b && ancestorsOf(a).includes(b);
}

/**
 * THE GATE. Validate that a string is a well-formed compiled namespace before
 * it can reach a backend. Throws NamespaceError otherwise. Also re-checks the
 * blank/default hazard at the boundary (defense in depth — MEM-002).
 */
export function assertCompiled(ns: string): string {
  if (typeof ns !== "string" || ns.trim().length === 0) {
    throw new NamespaceError("blank namespace (MEM-002: provisioning/runtime forbids blank/default)");
  }
  if (!NAMESPACE_RE.test(ns)) {
    throw new NamespaceError(`namespace "${ns}" does not match the compiled grammar`);
  }
  // Reject any namespace whose org/dept/team/agent/account segment is a
  // forbidden default token (e.g. org/default), even if grammar-shaped.
  for (const seg of ns.split("/")) {
    if (FORBIDDEN_SEGMENTS.has(seg.toLowerCase()) && seg !== "org" && seg !== "dept" && seg !== "team" && seg !== "agent" && seg !== "account") {
      throw new NamespaceError(`namespace "${ns}" contains forbidden default token "${seg}" (MEM-002)`);
    }
  }
  return ns;
}
