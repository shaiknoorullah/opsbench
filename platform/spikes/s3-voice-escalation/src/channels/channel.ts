// Channel abstraction. A Channel is an interchangeable delivery vendor: the
// ladder state machine owns all state and treats every channel uniformly. A
// channel's only job is to "deliver" a notification and, out of band, surface an
// acknowledgement back to the ladder via the AckSink callback.
//
// This is the seam that makes vendors swappable (spec §7 invariant: "vendors are
// delivery channels"). The voice channel models the Twilio outbound-call + DTMF
// contract so the real adapter is a thin swap (see src/channels/voice.ts).

import type { Surface } from "../schema.ts";

/** What the ladder hands a channel when it fires a rung. */
export interface RungNotification {
  ladderId: string;
  rungN: number;
  /** Human-readable incident summary read out / rendered. */
  summary: string;
  /** Pre-registered destination for this channel (phone number, slack user, etc.). */
  destination: string;
  /** Whether this rung requires PIN identity assurance (voice only, today). */
  identityAssurance: "pin" | "none";
}

/** Evidence a channel attaches to an ack (shape mirrors EscalationLadder.ack.evidence). */
export interface AckEvidence {
  call_sid?: string;
  digits_hash?: string; // sha256:<hex>
  pin_verified?: boolean;
  attestation?: string; // STIR/SHAKEN level, e.g. "A"
}

/** An acknowledgement surfaced by a channel back to the ladder. */
export interface ChannelAck {
  ladderId: string;
  rungN: number;
  channel: Surface; // schema surface, e.g. "slack" | "voice_dtmf"
  by: string; // usr_...
  at: string; // ISO timestamp
  evidence?: AckEvidence;
}

/** Result of delivering a rung notification. */
export interface DeliveryResult {
  /** Did the channel manage to deliver at all (call connected, message sent)? */
  delivered: boolean;
  /** Vendor-side correlation id (call_sid, message_sid, ...). */
  vendorRef?: string;
  /** Reason when not delivered (no-answer, failed, busy, channel_outage). */
  reason?: string;
}

/**
 * The ladder injects an AckSink into each channel. When a channel observes an
 * ack (Slack button click, DTMF "press 1", spoken yes), it calls the sink. The
 * sink is idempotent on the ladder side: late or duplicate acks are absorbed.
 */
export type AckSink = (ack: ChannelAck) => void;

export interface Channel {
  /** Matches the rung.channel enum: slack | teams | push | sms | voice. */
  readonly kind: "slack" | "teams" | "push" | "sms" | "voice";
  /** Fire a rung. Returns once the delivery attempt completes (sync in sim). */
  deliver(n: RungNotification, ackSink: AckSink): DeliveryResult;
}
