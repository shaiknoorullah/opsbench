// Thin adapter for redis/agent-memory-server (REST). UNVERIFIED-AGAINST-LIVE.
//
// Pinned target: redis/agent-memory-server v0.15.2 (released 2026-04-10).
// API shapes per the project docs fetched 2026-06-16:
//   - https://redis.github.io/agent-memory-server/api/
//   - https://redis.github.io/agent-memory-server/configuration/
//   - https://redis.github.io/agent-memory-server/memory-lifecycle/
//
// This adapter is implemented against the DOCUMENTED REST contract and has NOT
// been run against a live server in this environment (no Redis available). Every
// method is marked UNVERIFIED in its doc comment with the reason. The shape is
// deliberately conservative so a live integration test can drop in unchanged.
//
// CRITICAL SAFETY POSTURE (defends MEM-002 against the engine's hazards):
//   * The engine config DEFAULT_MCP_NAMESPACE defaults to "default" and
//     DEFAULT_MCP_USER_ID to "default-user" — if a write omits namespace, the
//     engine SILENTLY MERGES it into the shared "default" namespace, crossing
//     tenants. This adapter NEVER omits namespace: it is required and asserted
//     compiled before the call. We also pass an EXPLICIT, non-default user_id
//     derived from the compiled namespace so the engine's default-user fallback
//     is unreachable too.
//   * Search uses an EXACT namespace filter {"eq": ns}. We never use a prefix
//     or wildcard filter, so descendant namespaces cannot leak into results.
//   * AUTH_MODE defaults to "disabled"; this adapter refuses to construct unless
//     the caller asserts an auth posture (constructor requires authToken OR an
//     explicit insecure: true opt-in, which we log).

import {
  assertCompiled,
  type MemoryTier,
} from "./namespace.ts";
import type { MemoryBackend, SearchInput, StoredMemory, WriteInput } from "./backend.ts";

export interface AgentMemoryServerOptions {
  baseUrl: string;
  /** Bearer token when AUTH_MODE=token|oauth2. */
  authToken?: string;
  /** Must be set true to run against an unauthenticated server (logged). */
  insecure?: boolean;
  /** Injected fetch for testing; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-call timeout ms. */
  timeoutMs?: number;
}

interface AmsMemoryRecord {
  id?: string;
  text: string;
  session_id?: string | null;
  user_id?: string | null;
  namespace?: string | null;
  topics?: string[] | null;
  entities?: string[] | null;
  memory_type?: "semantic" | "episodic" | "message";
  event_date?: string | null;
  created_at?: number;
}

export class AgentMemoryServerBackend implements MemoryBackend {
  readonly name = "agent-memory-server@0.15.2 (UNVERIFIED-against-live)";
  private readonly baseUrl: string;
  private readonly authToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: AgentMemoryServerOptions) {
    if (!opts.authToken && !opts.insecure) {
      throw new Error(
        "AgentMemoryServerBackend: agent-memory-server AUTH_MODE defaults to 'disabled'. " +
          "Refusing to construct without an authToken. Pass {insecure:true} to opt in explicitly.",
      );
    }
    if (opts.insecure && !opts.authToken) {
      console.warn(
        "[agent-memory-server] INSECURE mode: no auth token; engine likely AUTH_MODE=disabled. Do not use in prod.",
      );
    }
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.authToken = opts.authToken;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 1000;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (this.authToken) h.authorization = `Bearer ${this.authToken}`;
    return h;
  }

  /**
   * Derive a non-default, explicit user_id from the compiled namespace so the
   * engine's DEFAULT_MCP_USER_ID="default-user" fallback can never be hit. We
   * scope user_id per-tenant+namespace; it is opaque to the engine's filters
   * because we always also pass namespace eq.
   */
  private explicitUserId(tenant: string, ns: string): string {
    return `u:${tenant}:${ns.replace(/\//g, "_")}`;
  }

  /**
   * UNVERIFIED-against-live. POST /v1/long-term-memory/ with namespace REQUIRED.
   * Reason unverified: no Redis/agent-memory-server reachable in this env.
   */
  async write(input: WriteInput): Promise<StoredMemory> {
    const ns = assertCompiled(input.namespace); // never blank/default
    const record: AmsMemoryRecord = {
      text: input.text,
      namespace: ns, // EXPLICIT — defeats DEFAULT_MCP_NAMESPACE silent merge
      user_id: this.explicitUserId(input.tenant_id, ns), // defeats default-user
      topics: input.topics ?? null,
      entities: input.entities ?? null,
      memory_type: "semantic",
    };
    const res = await this.post(`/v1/long-term-memory/`, {
      memories: [record],
      // Engine-side dedup is on; we keep it but never rely on it for isolation.
      deduplicate: true,
    });
    const id = (res?.memories?.[0]?.id as string) ?? `ams_${Date.now()}`;
    return {
      id,
      tenant_id: input.tenant_id,
      namespace: ns,
      text: input.text,
      created_at: Date.now(),
      topics: input.topics,
      entities: input.entities,
      trust_label: input.trust_label,
      written_by: input.written_by,
      source_event: input.source_event,
    };
  }

  /**
   * UNVERIFIED-against-live. POST /v1/long-term-memory/search with an EXACT
   * namespace filter. Never a prefix — exact-eq is what prevents descendant
   * leakage at the engine. Reason unverified: no live server in this env.
   */
  async search(input: SearchInput): Promise<StoredMemory[]> {
    const ns = assertCompiled(input.namespace);
    const body = {
      text: input.query,
      search_mode: "hybrid",
      namespace: { eq: ns }, // EXACT match — no prefix/wildcard, no descendant leak
      user_id: { eq: this.explicitUserId(input.tenant_id, ns) },
      limit: input.limit,
    };
    const res = await this.post(`/v1/long-term-memory/search`, body);
    const memories: AmsMemoryRecord[] = res?.memories ?? [];
    return memories
      .filter((m) => m.namespace === ns) // belt-and-suspenders: drop any non-exact
      .map((m, i) => ({
        id: m.id ?? `ams_${i}`,
        tenant_id: input.tenant_id,
        namespace: ns,
        text: m.text,
        created_at: m.created_at ? m.created_at * 1000 : Date.now(),
        topics: m.topics ?? undefined,
        entities: m.entities ?? undefined,
      }));
  }

  async count(): Promise<number> {
    // No documented count endpoint relied upon; UNVERIFIED. Return -1 sentinel.
    return -1;
  }

  private async post(path: string, body: unknown): Promise<any> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`agent-memory-server ${path} -> HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }
}

/** Documented pinned defaults, captured for the VERDICT divergence list. */
export const AMS_PINNED = {
  version: "0.15.2",
  released: "2026-04-10",
  defaults: {
    DEFAULT_MCP_NAMESPACE: "default", // hazard: silent tenant merge if unset
    DEFAULT_MCP_USER_ID: "default-user", // hazard
    AUTH_MODE: "disabled", // hazard: open by default
    LONG_TERM_MEMORY: true,
    ENABLE_DISCRETE_MEMORY_EXTRACTION: true,
    INDEX_ALL_MESSAGES_IN_LONG_TERM_MEMORY: false,
    FORGETTING_ENABLED: false, // forgetting OFF by default
    FORGETTING_EVERY_MINUTES: 60,
    FORGETTING_MAX_AGE_DAYS: 90.0,
    FORGETTING_MAX_INACTIVE_DAYS: 30.0,
    FORGETTING_BUDGET_KEEP_TOP_N: 10000,
    COMPACTION_EVERY_MINUTES: 10,
    WORKING_MEMORY_TTL: "1h (no documented env var name)",
    REDISVL_VECTOR_DIMENSIONS: 1536,
  },
  notes: [
    "Forgetting requires a SEPARATE running task-worker (docket); config alone is inert.",
    "DEFAULT_MCP_NAMESPACE/DEFAULT_MCP_USER_ID cause silent cross-tenant merge if a call omits them.",
    "memory-scope tiers (org/dept/team/agent/account) are NOT native; only session_id/user_id/namespace exist.",
    "Hierarchy + RBAC must be enforced ABOVE the engine (this proxy); engine scoping is query-time metadata filters.",
  ],
} as const;

export type { MemoryTier };
