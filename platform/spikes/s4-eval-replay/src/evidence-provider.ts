// Temporal evidence provider — the CORE mechanism of S4.
//
// During replay the agent must see evidence ONLY as-of the incident-window
// cutoff. The provider enforces the predicate `ts <= cutoff` on every access.
// Any attempt to reach an item dated after the cutoff:
//   1. is BLOCKED (the item is never returned),
//   2. is LOGGED to an access log (and as an AuditRecord-shaped denial),
//   3. throws if accessed by id (a hard fail the test asserts on).
//
// "Inaccessible" is enforced two ways for defense-in-depth:
//   - list/query surfaces filter post-cutoff items out entirely, so an agent
//     iterating evidence never even sees their ids.
//   - getById on a post-cutoff id throws PostCutoffAccessError AND logs a denial,
//     so even a hostile agent that guesses an id cannot read it.

import type { EvidenceItem } from "./types.ts";

export class PostCutoffAccessError extends Error {
  constructor(
    readonly evidenceId: string,
    readonly evidenceTs: string,
    readonly cutoff: string,
  ) {
    super(
      `temporal isolation violation: evidence ${evidenceId} (ts=${evidenceTs}) is after cutoff ${cutoff} and is inaccessible during replay`,
    );
    this.name = "PostCutoffAccessError";
  }
}

/** A single access-log entry. Denials are first-class (mirrors AuditRecord). */
export interface AccessLogEntry {
  ts_logged: string;
  evidence_id: string;
  evidence_ts: string;
  effect: "permit" | "deny";
  reason: string;
}

export interface QueryFilter {
  service?: string;
  kind?: EvidenceItem["kind"];
  /** Match any of these tag key=value pairs. */
  tag?: { key: string; value: string };
}

/**
 * Wraps the full evidence store and exposes it strictly as-of `cutoff`.
 * `now` is irrelevant — the only gate is the incident-window cutoff, which is
 * what makes this a deterministic, replayable time-travel boundary.
 */
export class TemporalEvidenceProvider {
  private readonly all: EvidenceItem[];
  private readonly byId: Map<string, EvidenceItem>;
  private readonly accessLog: AccessLogEntry[] = [];

  constructor(
    evidence: EvidenceItem[],
    private readonly cutoff: string,
  ) {
    this.all = [...evidence].sort((a, b) => a.ts.localeCompare(b.ts));
    this.byId = new Map(this.all.map((e) => [e.id, e]));
  }

  private isVisible(item: EvidenceItem): boolean {
    // RFC3339 UTC strings sort lexicographically iff same zone/precision; our
    // fixture is uniform Z-suffixed, but compare as Date to be robust.
    return Date.parse(item.ts) <= Date.parse(this.cutoff);
  }

  private log(item: EvidenceItem, effect: "permit" | "deny", reason: string): void {
    this.accessLog.push({
      ts_logged: new Date().toISOString(),
      evidence_id: item.id,
      evidence_ts: item.ts,
      effect,
      reason,
    });
  }

  /** All evidence visible as-of the cutoff. Post-cutoff items are filtered out. */
  list(): EvidenceItem[] {
    const visible: EvidenceItem[] = [];
    for (const item of this.all) {
      if (this.isVisible(item)) {
        this.log(item, "permit", "list within window");
        visible.push(item);
      } else {
        // Logged as a denial even though it was never surfaced to the caller.
        this.log(item, "deny", "filtered: ts > cutoff");
      }
    }
    return visible;
  }

  /** Filtered query surface. Post-cutoff items are never matched. */
  query(filter: QueryFilter): EvidenceItem[] {
    return this.list().filter((e) => {
      if (filter.service && e.tags.service !== filter.service) return false;
      if (filter.kind && e.kind !== filter.kind) return false;
      if (filter.tag && e.tags[filter.tag.key] !== filter.tag.value) return false;
      return true;
    });
  }

  /**
   * Direct fetch by id. A post-cutoff id is BLOCKED: it is logged as a denial
   * and throws. This is the hard guarantee the temporal-isolation test asserts.
   */
  getById(id: string): EvidenceItem {
    const item = this.byId.get(id);
    if (!item) {
      throw new Error(`unknown evidence id: ${id}`);
    }
    if (!this.isVisible(item)) {
      this.log(item, "deny", "blocked: ts > cutoff (direct access)");
      throw new PostCutoffAccessError(item.id, item.ts, this.cutoff);
    }
    this.log(item, "permit", "direct access within window");
    return item;
  }

  /** Read-only copy of the access log. */
  getAccessLog(): readonly AccessLogEntry[] {
    return [...this.accessLog];
  }

  /** Count of denied accesses — proof that blocking happened and was logged. */
  deniedCount(): number {
    return this.accessLog.filter((e) => e.effect === "deny").length;
  }

  /** The set of post-cutoff ids that exist but are hidden (for test assertions). */
  hiddenIds(): string[] {
    return this.all.filter((e) => !this.isVisible(e)).map((e) => e.id);
  }
}
