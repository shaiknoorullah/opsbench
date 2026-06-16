// Simulated chat (Slack/Teams), push, and SMS channels. These are deliberately
// thin: they model "did delivery succeed" and expose a programmatic hook for a
// human ack so tests can drive an ack from any channel. Real adapters would wire
// Slack Block Kit / APNs+FCM / Twilio Messaging respectively behind the same seam.

import type { Channel, AckSink, RungNotification, DeliveryResult } from "./channel.ts";
import type { Clock } from "../clock.ts";

interface SimChannelOpts {
  /** If false, deliver() reports a channel outage (drives rung skip → next rung). */
  available?: boolean;
}

abstract class SimChannel implements Channel {
  abstract readonly kind: "slack" | "teams" | "push" | "sms";
  protected available: boolean;
  private lastSink: AckSink | null = null;
  private lastNotification: RungNotification | null = null;

  constructor(
    protected readonly clock: Clock,
    opts: SimChannelOpts = {},
  ) {
    this.available = opts.available ?? true;
  }

  deliver(n: RungNotification, ackSink: AckSink): DeliveryResult {
    if (!this.available) {
      return { delivered: false, reason: "channel_outage" };
    }
    this.lastSink = ackSink;
    this.lastNotification = n;
    return { delivered: true, vendorRef: `${this.kind}_msg_${n.ladderId}_${n.rungN}` };
  }

  /** Test/affordance hook: a human acks from this channel (button click etc.). */
  simulateAck(by: string): void {
    if (!this.lastSink || !this.lastNotification) {
      throw new Error(`${this.kind}: nothing delivered to ack`);
    }
    const surface = this.kind === "push" ? "mobile" : this.kind; // schema Surface mapping
    this.lastSink({
      ladderId: this.lastNotification.ladderId,
      rungN: this.lastNotification.rungN,
      channel: surface as never,
      by,
      at: this.clock.nowIso(),
    });
  }
}

export class SlackChannel extends SimChannel {
  readonly kind = "slack" as const;
}
export class PushChannel extends SimChannel {
  readonly kind = "push" as const;
}
export class SmsChannel extends SimChannel {
  readonly kind = "sms" as const;
}
