// Connector hub router.
//
// Takes a CapabilityEnvelope (the agent-facing, vendor-neutral input), validates
// it, resolves the connector named in envelope.routing.connector, charges the
// vendor quota (envelope.budget), and dispatches to the adapter's translate()
// (+ parse() of a supplied fixture). The agent NEVER names a query language; the
// SAME envelope can route to any connector — proving INT-001 (zero agent-prompt
// change on backend swap).

import type { CapabilityEnvelope } from "./envelope.ts";
import { validateEnvelope } from "./envelope.ts";
import { verbOf, type VerbParams } from "./verbs.ts";
import type { ConnectorAdapter, NormalizedResult, TranslatedRequest } from "./connector.ts";
import { BudgetLedger } from "./budget.ts";

export interface RouteOutcome {
  connector: string;
  translated: TranslatedRequest;
  /** present only when a fixture was supplied to execute against. */
  result?: NormalizedResult;
  budget?: ReturnType<BudgetLedger["charge"]>;
}

export class ConnectorHub {
  private connectors = new Map<string, ConnectorAdapter>();
  constructor(public readonly budget?: BudgetLedger) {}

  register(adapter: ConnectorAdapter): void {
    this.connectors.set(adapter.id, adapter);
  }

  /**
   * Translate-only (no execution): the assertable core. Pure function of the
   * envelope; used by translation tests and the swap test.
   */
  translate(env: CapabilityEnvelope): TranslatedRequest {
    const v = validateEnvelope(env);
    if (!v.ok) throw new Error(`invalid envelope: ${v.errors.join("; ")}`);
    const adapter = this.resolve(env);
    const verb = verbOf(env.capability);
    return adapter.translate(verb, env.params as unknown as VerbParams, env);
  }

  /** Full route: validate -> charge budget -> translate -> parse fixture. */
  route(env: CapabilityEnvelope, fixture?: unknown): RouteOutcome {
    const v = validateEnvelope(env);
    if (!v.ok) throw new Error(`invalid envelope: ${v.errors.join("; ")}`);
    const adapter = this.resolve(env);
    const verb = verbOf(env.capability);

    let budget: RouteOutcome["budget"];
    if (this.budget && env.budget?.vendor_quota_class) {
      budget = this.budget.charge(
        env.budget.vendor_quota_class,
        env.budget.cost_attribution ?? "unattributed",
      );
      if (!budget.allowed) {
        // Surface a structured, policy-visible rejection rather than calling the vendor.
        return { connector: adapter.id, translated: emptyTranslate(adapter, env), budget };
      }
    }

    const translated = adapter.translate(verb, env.params as unknown as VerbParams, env);
    const result = fixture !== undefined ? adapter.parse(verb, fixture) : undefined;
    return { connector: adapter.id, translated, result, budget };
  }

  private resolve(env: CapabilityEnvelope): ConnectorAdapter {
    const primary = this.connectors.get(env.routing.connector);
    if (primary) return primary;
    for (const fb of env.routing.fallback ?? []) {
      const a = this.connectors.get(fb);
      if (a) return a;
    }
    throw new Error(
      `no connector registered for ${env.routing.connector} (fallbacks: ${(env.routing.fallback ?? []).join(",") || "none"})`,
    );
  }
}

function emptyTranslate(adapter: ConnectorAdapter, env: CapabilityEnvelope): TranslatedRequest {
  return {
    vendor: adapter.vendor,
    query: "",
    language: "rest",
    endpoint: { method: "GET", path: "" },
    passthrough: { reason: "budget exhausted; call not issued", raw: env.capability },
  };
}
