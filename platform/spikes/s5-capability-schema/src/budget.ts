// Vendor-quota budget accounting for the CapabilityEnvelope.budget block.
//
// Models the real, documented vendor limits from the integrations catalog
// (research 2026-06-12-opsbench-integrations-catalog.md §2):
//   - Datadog MCP: 50 requests / 10s burst window AND 50,000 tool calls / month.
//   - Dynatrace Grail: metered by GB scanned (DT_GRAIL_QUERY_BUDGET_GB, ~1000 GB/session).
// We implement the Datadog dual-window class plus a generic call-count class so
// the swap test can show budgeting is connector-agnostic. Each call decrements
// the named vendor_quota_class and is attributed to cost_attribution (a task id).
// A pre-exhaustion alert fires at a configurable threshold (default 80%).

export interface QuotaWindow {
  limit: number;
  windowMs: number; // sliding window length
  /** timestamps (ms) of calls inside the window */
  hits: number[];
}

export interface QuotaClassConfig {
  name: string; // e.g. "datadog.mcp"
  windows: { limit: number; windowMs: number }[];
  /** alert when remaining fraction (of the tightest window) drops below this. */
  alertAtRemainingFraction?: number;
}

export interface ChargeResult {
  allowed: boolean;
  quotaClass: string;
  attribution: string;
  /** per-window remaining after this charge */
  remaining: { limit: number; windowMs: number; remaining: number }[];
  alert: { level: "ok" | "warn" | "exhausted"; message: string };
}

export class BudgetLedger {
  private classes = new Map<string, { cfg: QuotaClassConfig; windows: QuotaWindow[] }>();
  /** per-attribution running spend, for cross-vendor cost dashboards. */
  readonly attribution = new Map<string, Record<string, number>>();
  readonly alerts: ChargeResult["alert"][] = [];

  registerClass(cfg: QuotaClassConfig): void {
    this.classes.set(cfg.name, {
      cfg,
      windows: cfg.windows.map((w) => ({ ...w, hits: [] })),
    });
  }

  /**
   * Charge one call to the quota class, attributed to a task.
   * Returns allowed=false (and does NOT record the hit) if any window is full.
   */
  charge(quotaClass: string, attribution: string, now = Date.now()): ChargeResult {
    const entry = this.classes.get(quotaClass);
    if (!entry) {
      throw new Error(`unknown vendor_quota_class: ${quotaClass}`);
    }
    const { cfg, windows } = entry;
    const alertFrac = cfg.alertAtRemainingFraction ?? 0.2;

    // Evict expired hits from each sliding window.
    for (const w of windows) {
      w.hits = w.hits.filter((t) => now - t < w.windowMs);
    }

    // Check capacity BEFORE recording.
    const wouldExceed = windows.find((w) => w.hits.length >= w.limit);
    if (wouldExceed) {
      const res: ChargeResult = {
        allowed: false,
        quotaClass,
        attribution,
        remaining: windows.map((w) => ({
          limit: w.limit,
          windowMs: w.windowMs,
          remaining: Math.max(0, w.limit - w.hits.length),
        })),
        alert: {
          level: "exhausted",
          message: `${quotaClass} exhausted on window ${wouldExceed.windowMs}ms (limit ${wouldExceed.limit}); call rejected`,
        },
      };
      this.alerts.push(res.alert);
      return res;
    }

    // Record the hit + attribution.
    for (const w of windows) w.hits.push(now);
    const bucket = this.attribution.get(attribution) ?? {};
    bucket[quotaClass] = (bucket[quotaClass] ?? 0) + 1;
    this.attribution.set(attribution, bucket);

    const remaining = windows.map((w) => ({
      limit: w.limit,
      windowMs: w.windowMs,
      remaining: w.limit - w.hits.length,
    }));

    // Pre-exhaustion alert on the tightest (lowest remaining-fraction) window.
    const tightest = remaining.reduce((a, b) =>
      a.remaining / a.limit <= b.remaining / b.limit ? a : b,
    );
    const frac = tightest.remaining / tightest.limit;
    const alert: ChargeResult["alert"] =
      frac <= alertFrac
        ? {
            level: "warn",
            message: `${quotaClass} at ${tightest.remaining}/${tightest.limit} on window ${tightest.windowMs}ms (<= ${Math.round(alertFrac * 100)}% remaining)`,
          }
        : { level: "ok", message: `${quotaClass} ok (${tightest.remaining}/${tightest.limit})` };
    if (alert.level === "warn") this.alerts.push(alert);

    return { allowed: true, quotaClass, attribution, remaining, alert };
  }
}

/** Documented Datadog MCP quota (research §2): 50 req/10s AND 50,000 calls/month. */
export function datadogMcpQuota(): QuotaClassConfig {
  return {
    name: "datadog.mcp",
    windows: [
      { limit: 50, windowMs: 10_000 },
      { limit: 50_000, windowMs: 30 * 24 * 3600 * 1000 },
    ],
    alertAtRemainingFraction: 0.2,
  };
}
