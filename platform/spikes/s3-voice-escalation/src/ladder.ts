// Escalation-ladder state machine. THE single source of truth (spec §7 invariant).
//
// Responsibilities:
//   - Fire rungs in order; each rung runs for timeout_s, then advances.
//   - The first EFFECTIVE ack from ANY channel cancels ALL pending rungs,
//     idempotently, within the NF-001 budget (≤ 5 s). Late/duplicate acks no-op.
//   - A channel outage on a rung (delivered:false, reason channel_outage) marks
//     the rung skipped_outage and advances immediately.
//   - An unanswered/failed call marks the rung timeout-equivalent and advances.
//   - When all rungs are exhausted, fire the ESC-003 fallback contacts. Terminal
//     silence is UNREPRESENTABLE: exhausted always notifies fallback.
//
// Time is driven entirely through the injected Clock so tests use virtual time.

import type { Clock, CancelTimer } from "./clock.ts";
import type { Channel, ChannelAck, AckSink } from "./channels/channel.ts";
import type { EscalationLadder, EscalationRung } from "./schema.ts";

export interface LadderConfig {
  id: string; // esc_<ULID>
  tenantId: string; // t_...
  subjectRef: string; // apr_... | inc_...
  summary: string; // incident summary read out / rendered on each rung
  target: { resolvedHuman: string; rosterSource: string; resolvedAt: string };
  rungs: Array<{
    n: number;
    channel: EscalationRung["channel"];
    timeoutS: number;
    identityAssurance?: "pin" | "none";
    /** Pre-registered destination for this channel (phone, slack id). */
    destination: string;
  }>;
  onExhausted: string[]; // ESC-003 fallback usr_/grp_ ids; empty = provisioning error
}

/** Notification the ladder emits when it fires the fallback (ESC-003). */
export interface FallbackNotice {
  ladderId: string;
  contacts: string[];
  at: string;
  reason: "exhausted";
}

export interface LadderHooks {
  /** Called when a rung fires (audit: escalation.rung). */
  onRungFired?: (rung: RungRuntime) => void;
  /** Called once when an ack is accepted (the cancel-all moment). */
  onAck?: (ack: ChannelAck, cancelLatencyMs: number) => void;
  /** Called when the ladder exhausts and fires fallback. MUST notify someone. */
  onFallback?: (notice: FallbackNotice) => void;
}

export interface RungRuntime {
  n: number;
  channel: EscalationRung["channel"];
  timeoutS: number;
  identityAssurance: "pin" | "none";
  destination: string;
  state: "pending" | "fired" | "acked" | "timeout" | "skipped_outage";
  firedAt?: string;
}

export class EscalationLadderMachine {
  private readonly rungs: RungRuntime[];
  private state: "running" | "acked" | "exhausted" = "running";
  private currentIndex = -1;
  private timer: CancelTimer | null = null;
  private ack: EscalationLadder["ack"] | undefined;
  private ackFiredAtMs: number | null = null;

  constructor(
    private readonly cfg: LadderConfig,
    private readonly clock: Clock,
    private readonly channels: Record<string, Channel>,
    private readonly hooks: LadderHooks = {},
  ) {
    if (cfg.onExhausted.length === 0) {
      // Spec §7: an empty fallback list is a provisioning error — terminal silence
      // would otherwise be representable. Fail closed at construction.
      throw new Error("on_exhausted must be non-empty (ESC-003 provisioning error)");
    }
    this.rungs = cfg.rungs
      .slice()
      .sort((a, b) => a.n - b.n)
      .map((r) => ({
        n: r.n,
        channel: r.channel,
        timeoutS: r.timeoutS,
        identityAssurance: r.identityAssurance ?? "none",
        destination: r.destination,
        state: "pending",
      }));
  }

  /** Single idempotent ack sink shared by every channel. */
  private readonly ackSink: AckSink = (ack: ChannelAck) => this.onAck(ack);

  /** Start the ladder: fire rung 1, arm its timeout. */
  start(): void {
    if (this.state !== "running" || this.currentIndex !== -1) {
      throw new Error("ladder already started");
    }
    this.fireNext();
  }

  private fireNext(): void {
    if (this.state !== "running") return;
    this.currentIndex += 1;
    if (this.currentIndex >= this.rungs.length) {
      this.exhaust();
      return;
    }
    const rung = this.rungs[this.currentIndex];
    rung.state = "fired";
    rung.firedAt = this.clock.nowIso();
    this.hooks.onRungFired?.(rung);

    const channel = this.channels[rung.channel];
    if (!channel) {
      // No adapter for this channel → treat as outage, advance.
      rung.state = "skipped_outage";
      this.fireNext();
      return;
    }

    const result = channel.deliver(
      {
        ladderId: this.cfg.id,
        rungN: rung.n,
        summary: this.cfg.summary,
        destination: rung.destination,
        identityAssurance: rung.identityAssurance,
      },
      this.ackSink,
    );

    // A synchronous ack (sim voice press-1) may have already flipped state.
    if (this.state !== "running") return;

    if (!result.delivered) {
      // Channel outage → skipped_outage; no-answer/failed → timeout-equivalent.
      rung.state = result.reason === "channel_outage" ? "skipped_outage" : "timeout";
      this.fireNext();
      return;
    }

    // Delivered: arm the timeout. If it fires, this rung timed out → advance.
    this.timer = this.clock.setTimer(rung.timeoutS * 1000, () => {
      this.timer = null;
      if (this.state !== "running") return;
      if (rung.state === "fired") rung.state = "timeout";
      this.fireNext();
    });
  }

  /**
   * Idempotent ack handler. The FIRST effective ack wins, cancels the live rung
   * timer (the cancel-all moment), and transitions the ladder to acked. All later
   * acks — from any channel, including timers that fire concurrently — no-op.
   */
  private onAck(ack: ChannelAck): void {
    if (this.state !== "running") return; // already acked/exhausted → idempotent no-op

    const startMs = this.clock.now();
    this.state = "acked";

    // Cancel the live rung timeout — this is the "cancel all pending rungs"
    // operation. Because rungs fire sequentially, there is exactly one armed
    // timer; cancelling it stops every future rung from ever firing.
    if (this.timer) {
      this.timer();
      this.timer = null;
    }

    // Mark the acked rung; any not-yet-fired rungs stay pending (never fire).
    const acked = this.rungs.find((r) => r.n === ack.rungN);
    if (acked) acked.state = "acked";

    this.ack = {
      by: ack.by,
      channel: ack.channel,
      at: ack.at,
      ...(ack.evidence ? { evidence: ack.evidence } : {}),
    };
    this.ackFiredAtMs = this.clock.now();
    const cancelLatencyMs = this.ackFiredAtMs - startMs;
    this.hooks.onAck?.(ack, cancelLatencyMs);
  }

  private exhaust(): void {
    this.state = "exhausted";
    if (this.timer) {
      this.timer();
      this.timer = null;
    }
    // ESC-003: exhausted MUST notify fallback. Terminal silence is unrepresentable.
    const notice: FallbackNotice = {
      ladderId: this.cfg.id,
      contacts: this.cfg.onExhausted.slice(),
      at: this.clock.nowIso(),
      reason: "exhausted",
    };
    this.hooks.onFallback?.(notice);
  }

  // ── Read accessors ──────────────────────────────────────────────────────────

  getState(): "running" | "acked" | "exhausted" {
    return this.state;
  }

  /** Number of rung timeouts still armed (0 once acked/exhausted). */
  pendingRungs(): number {
    return this.timer ? 1 : 0;
  }

  /**
   * Serialise to the canonical EscalationLadder schema shape. The result is what
   * gets validated against escalation-ladder.json and written to the audit spine.
   */
  toSchema(): EscalationLadder {
    const ladder: EscalationLadder = {
      id: this.cfg.id,
      tenant_id: this.cfg.tenantId,
      subject_ref: this.cfg.subjectRef,
      target: {
        resolved_human: this.cfg.target.resolvedHuman,
        roster_source: this.cfg.target.rosterSource,
        resolved_at: this.cfg.target.resolvedAt,
      },
      rungs: this.rungs.map((r) => {
        const rung: EscalationRung = { n: r.n, channel: r.channel, timeout_s: r.timeoutS };
        if (r.state !== "pending") rung.state = r.state;
        if (r.firedAt) rung.fired_at = r.firedAt;
        if (r.identityAssurance === "pin") rung.identity_assurance = "pin";
        return rung;
      }),
      state: this.state,
      on_exhausted: this.cfg.onExhausted.slice(),
    };
    if (this.ack) ladder.ack = this.ack;
    return ladder;
  }
}
