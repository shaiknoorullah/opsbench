// Recall fan-out (MEM-003): query each PERMITTED tier, merge by recency x
// relevance, annotate each item {scope_tier, provenance_ref, trust_label};
// per-tier timeouts degrade to PARTIAL results with the missing tier flagged.

import type { MemoryBackend, StoredMemory } from "./backend.ts";
import { tierOf, type MemoryTier } from "./namespace.ts";

export interface RecalledItem {
  id: string;
  text: string;
  namespace: string;
  /** Annotation: which tier this came from. */
  scope_tier: MemoryTier;
  /** Annotation: provenance ref (source event / writer / ledger). */
  provenance_ref: string | null;
  /** Annotation: trust label, if the stored memory carried one. */
  trust_label: StoredMemory["trust_label"] | null;
  relevance: number;
  created_at: number;
  /** Final merge score (recency x relevance). */
  score: number;
}

export interface TierStatus {
  namespace: string;
  tier: MemoryTier;
  status: "ok" | "timeout" | "error";
  count: number;
  latency_ms: number;
  detail?: string;
}

export interface RecallResult {
  items: RecalledItem[];
  /** True if ANY permitted tier failed/timed out -> results are PARTIAL. */
  partial: boolean;
  tiers: TierStatus[];
}

export interface FanoutOptions {
  /** Per-tier timeout in ms; a tier exceeding this is flagged, others kept. */
  perTierTimeoutMs: number;
  /** Max items returned after merge. */
  limit: number;
  /** Per-tier fetch limit before merge. */
  perTierLimit?: number;
  /**
   * Recency half-life in ms for the recency factor. Default 7 days.
   * recencyFactor = 0.5 ^ (age / halfLife), in (0,1].
   */
  recencyHalfLifeMs?: number;
  now?: () => number;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false }> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false }), ms);
    p.then(
      (value) => {
        clearTimeout(t);
        resolve({ ok: true, value });
      },
      () => {
        clearTimeout(t);
        resolve({ ok: false });
      },
    );
  });
}

/**
 * Fan out a recall across the caller's PERMITTED namespaces (own + ancestors).
 * The caller is responsible for passing ONLY permitted namespaces — RBAC has
 * already filtered them. This function does NOT widen scope.
 */
export async function recallFanout(
  backend: MemoryBackend,
  tenant_id: string,
  query: string,
  permittedNamespaces: string[],
  opts: FanoutOptions,
): Promise<RecallResult> {
  const now = opts.now ?? Date.now;
  const halfLife = opts.recencyHalfLifeMs ?? 7 * 24 * 60 * 60 * 1000;
  const perTierLimit = opts.perTierLimit ?? Math.max(opts.limit, 50);

  const tierResults = await Promise.all(
    permittedNamespaces.map(async (ns): Promise<{ status: TierStatus; items: StoredMemory[] }> => {
      const tier = tierOf(ns);
      const start = now();
      const r = await withTimeout(
        backend.search({ tenant_id, namespace: ns, query, limit: perTierLimit }),
        opts.perTierTimeoutMs,
      );
      const latency_ms = now() - start;
      if (!r.ok) {
        return {
          status: { namespace: ns, tier, status: "timeout", count: 0, latency_ms, detail: "per-tier timeout" },
          items: [],
        };
      }
      return {
        status: { namespace: ns, tier, status: "ok", count: r.value.length, latency_ms },
        items: r.value,
      };
    }),
  );

  const merged: RecalledItem[] = [];
  for (const { items } of tierResults) {
    for (const m of items) {
      const age = Math.max(0, now() - m.created_at);
      const recency = Math.pow(0.5, age / halfLife); // (0,1]
      const relevance = m.relevance ?? 0;
      const score = recency * relevance;
      merged.push({
        id: m.id,
        text: m.text,
        namespace: m.namespace,
        scope_tier: tierOf(m.namespace),
        provenance_ref: m.source_event ?? m.written_by ?? null,
        trust_label: m.trust_label ?? null,
        relevance,
        created_at: m.created_at,
        score,
      });
    }
  }
  // Merge by recency x relevance, ties broken by recency.
  merged.sort((a, b) => b.score - a.score || b.created_at - a.created_at);

  const tiers = tierResults.map((t) => t.status);
  const partial = tiers.some((t) => t.status !== "ok");
  return { items: merged.slice(0, opts.limit), partial, tiers };
}
