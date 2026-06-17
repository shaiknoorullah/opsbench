// Identity claims carried by a (mock) JWT minted by the identity registry.
//
// NORMATIVE (spec §5): "the caller's JWT carries org, dept[], team[], agent
// (for NHIs) from the identity registry — NEVER agent-supplied." This module
// therefore treats claims as the ONLY trusted source of scope. Nothing in a
// memory operation request may widen the caller's scope.

export interface IdentityClaims {
  /** Tenant — mandatory on every object (NF-006). Maps to the schema tenant_id. */
  tenant_id: string;
  /** Single org the principal belongs to. Required: the grammar roots at org/. */
  org: string;
  /**
   * Departments the principal is a member of. The compiler uses the FIRST as the
   * principal's home department for write-scope derivation; the full list is the
   * read-authority set (a principal may read any dept it is a member of, plus
   * ancestors). Empty => org-tier principal.
   */
  dept?: string[];
  /** Teams the principal belongs to (home team = first). Empty => dept/org tier. */
  team?: string[];
  /** Agent (non-human identity) id. Present only for NHIs; humans omit it. */
  agent?: string;
  /**
   * Support-context CRM account scope (the org/<org>/account/<id> branch).
   * Orthogonal to the dept/team/agent branch.
   */
  account?: string;
  /** Principal id for ledgering (usr_… or spiffe://…). Not used for scope math. */
  principal?: string;
}

/** Is this principal a human (no agent claim) or a non-human identity? */
export function isHuman(c: IdentityClaims): boolean {
  return !c.agent;
}
