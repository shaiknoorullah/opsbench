// Simulated outbound-voice channel modelling the Twilio Programmable Voice +
// <Gather> DTMF contract. The goal: the real Twilio adapter is a THIN swap of the
// `place()` / webhook plumbing, with identical ladder-facing behaviour.
//
// ── Real Twilio wiring this simulation stands in for ──────────────────────────
//  1. Outbound call:  POST https://api.twilio.com/2010-04-01/Accounts/{Sid}/Calls.json
//                     From=+1... To=+1<oncall> Url=https://us/voice/twiml MachineDetection=Enable
//                     → returns { sid: "CA....", status: "queued" }  (this is call_sid)
//  2. Twilio fetches the TwiML at Url and reads it out:
//       <Response>
//         <Say>Incident INC-123: checkout p99 breached. Press 1 to acknowledge.</Say>
//         <Gather input="dtmf" numDigits="1" action="/voice/ack" method="POST" timeout="10">
//           <Say>Press 1 to acknowledge this incident.</Say>
//         </Gather>
//         <Say>No input received. Goodbye.</Say>   <!-- falls through → no-answer path -->
//       </Response>
//  3. Caller presses 1 → Twilio POSTs to /voice/ack: { CallSid, Digits:"1", From, To, ... }
//     Optional PIN: that handler returns a second <Gather numDigits="4|6" action="/voice/pin">
//     and Twilio POSTs { CallSid, Digits:"<pin>" } to /voice/pin.
//  4. We verify, then return <Response><Say>Acknowledged.</Say><Hangup/></Response>.
//  5. STIR/SHAKEN: the From number's verified-ownership yields an attestation level
//     (A/B/C) surfaced on the call; A-level requires verified ownership of From.
//     ── ConversationRelay variant ──
//  For natural-language ("say 'I approve'") instead of DTMF, swap the <Gather> for
//  <Connect><ConversationRelay url="wss://us/relay"/></Connect>; the relay streams
//  ASR transcripts over WebSocket and we map intent→ack. DTMF remains the fallback.
//  Pricing differs (see VERDICT.md): plain <Gather> rides Programmable Voice
//  per-minute; ConversationRelay adds ~$0.07/min.
//
// All of the above is simulated below with an injectable "phone" so tests are
// deterministic and offline. Nothing here dials a real number.

import type { Channel, AckSink, AckEvidence, RungNotification, DeliveryResult } from "./channel.ts";
import type { Clock } from "../clock.ts";
import { digitsHash, newSalt, verifyPin } from "../pin.ts";

/** Outcome of the simulated callee answering behaviour, set per call by the test. */
export type CalleeBehaviour =
  | { type: "no-answer" } // rings out / voicemail → delivery fails, ladder advances
  | { type: "failed"; reason: string } // carrier failure / invalid number
  | { type: "ack"; pin?: string }; // presses 1, optionally enters a PIN

/** A simulated Twilio "call" object. */
export interface SimCall {
  callSid: string;
  to: string;
  from: string;
  attestation: string; // STIR/SHAKEN level on the outbound leg
}

/**
 * Consent / recording mode (NF-012). In "metadata-only" mode NO audio is retained;
 * only call metadata + DTMF events are recorded. "recorded" requires ledgered
 * all-party consent captured as an explicit DTMF press before the readout.
 */
export type ConsentMode = "metadata-only" | "recorded";

export interface VoiceChannelOpts {
  fromNumber: string;
  attestation?: string; // simulated STIR/SHAKEN level for the From number
  consentMode?: ConsentMode;
  available?: boolean;
  /**
   * PIN registry: usr_ → expected PIN. Looked up by the resolved on-call human.
   * In production this is a per-user/per-incident secret fetched from a vault,
   * never written into the ladder.
   */
  pinRegistry?: Record<string, string>;
  /** Maps a destination phone number back to the on-call usr_ id (roster). */
  resolveUser?: (destination: string) => string;
}

/** The simulated DTMF webhook payload Twilio would POST to /voice/ack. */
export interface DtmfWebhookEvent {
  CallSid: string;
  From: string;
  To: string;
  Digits: string;
}

export class VoiceChannel implements Channel {
  readonly kind = "voice" as const;
  private available: boolean;
  private nextBehaviour: CalleeBehaviour | null = null;
  private callSeq = 0;

  // Per-call context kept only for the lifetime of the call. PIN digits are NEVER
  // stored here; only the expected PIN is read transiently during verification.
  private inFlight = new Map<
    string,
    { notification: RungNotification; ackSink: AckSink; salt: string; user: string; consent: boolean }
  >();

  constructor(
    private readonly clock: Clock,
    private readonly opts: VoiceChannelOpts,
  ) {
    this.available = opts.available ?? true;
  }

  /** Test affordance: set how the callee will behave on the NEXT placed call. */
  setNextCalleeBehaviour(b: CalleeBehaviour): void {
    this.nextBehaviour = b;
  }

  deliver(n: RungNotification, ackSink: AckSink): DeliveryResult {
    if (!this.available) return { delivered: false, reason: "channel_outage" };

    const behaviour = this.nextBehaviour ?? { type: "no-answer" };
    this.nextBehaviour = null;

    // 1. Place the outbound call (Twilio: POST .../Calls.json → call_sid).
    const call = this.placeCall(n.destination);

    if (behaviour.type === "failed") {
      return { delivered: false, vendorRef: call.callSid, reason: behaviour.reason };
    }
    if (behaviour.type === "no-answer") {
      // Twilio MachineDetection / no <Gather> input → call completes without ack.
      return { delivered: false, vendorRef: call.callSid, reason: "no-answer" };
    }

    // 2. Call connected and TTS read out. Register in-flight context for webhooks.
    const user = this.opts.resolveUser?.(n.destination) ?? "usr_oncall";
    // Consent (NF-012): in recorded mode the callee presses a digit to consent
    // before the readout; in metadata-only mode no audio is retained at all.
    const consent = (this.opts.consentMode ?? "metadata-only") === "recorded";
    this.inFlight.set(call.callSid, {
      notification: n,
      ackSink,
      salt: newSalt(),
      user,
      consent,
    });

    // 3. Drive the DTMF "press 1 to ack" webhook.
    this.handleDtmfWebhook({ CallSid: call.callSid, From: call.from, To: call.to, Digits: "1" });

    // 4. If a PIN is required and provided, drive the PIN webhook.
    if (n.identityAssurance === "pin") {
      const pin = behaviour.pin ?? "";
      this.handlePinWebhook({ CallSid: call.callSid, From: call.from, To: call.to, Digits: pin }, call.attestation);
    } else {
      // No PIN rung: the press-1 itself is the ack (phone possession only).
      this.completeAck(call.callSid, call.attestation, { pinRequired: false, enteredPin: null });
    }

    return { delivered: true, vendorRef: call.callSid };
  }

  /** Simulated Twilio Calls.create. Returns a call_sid + attestation. */
  private placeCall(to: string): SimCall {
    const callSid = `CA${(this.callSeq++).toString().padStart(30, "0")}`;
    return {
      callSid,
      to,
      from: this.opts.fromNumber,
      attestation: this.opts.attestation ?? "A",
    };
  }

  /**
   * Webhook handler for the first <Gather> (press 1 to ack). In production this is
   * the HTTP POST /voice/ack endpoint. For a non-PIN rung this is terminal; for a
   * PIN rung it returns a second <Gather> and we await /voice/pin.
   */
  handleDtmfWebhook(ev: DtmfWebhookEvent): void {
    const ctx = this.inFlight.get(ev.CallSid);
    if (!ctx) return; // unknown/late call → ignore (idempotent)
    if (ev.Digits !== "1") return; // any non-ack press is a no-op here
    // Press-1 observed. If no PIN required, the ack completes from deliver().
    // If PIN required, deliver() will subsequently call handlePinWebhook.
  }

  /**
   * Webhook handler for the PIN <Gather>. Verifies the knowledge factor on top of
   * phone possession, then records evidence WITHOUT persisting the PIN.
   */
  handlePinWebhook(ev: DtmfWebhookEvent, attestation: string): void {
    const ctx = this.inFlight.get(ev.CallSid);
    if (!ctx) return;
    const expected = this.opts.pinRegistry?.[ctx.user];
    const ok = expected != null && ev.Digits.length > 0 && verifyPin(ev.Digits, expected);
    this.completeAck(ev.CallSid, attestation, { pinRequired: true, enteredPin: ev.Digits, pinVerified: ok });
    // ev.Digits and `expected` go out of scope here; nothing retains the PIN.
  }

  /**
   * Build the ack evidence record and push it to the ladder. This is the ONLY place
   * an ack is emitted. Evidence shape mirrors EscalationLadder.ack.evidence exactly.
   */
  private completeAck(
    callSid: string,
    attestation: string,
    pinState: { pinRequired: boolean; enteredPin: string | null; pinVerified?: boolean },
  ): void {
    const ctx = this.inFlight.get(callSid);
    if (!ctx) return;

    // If a PIN was required but failed verification, do NOT ack. The call would
    // re-prompt / hang up; the rung keeps running until its timeout (then advances).
    if (pinState.pinRequired && pinState.pinVerified !== true) {
      this.inFlight.delete(callSid);
      return;
    }

    const evidence: AckEvidence = {
      call_sid: callSid,
      attestation,
    };
    if (pinState.pinRequired) {
      // Store ONLY a salted hash of the entered digits + the boolean result.
      evidence.digits_hash = digitsHash(pinState.enteredPin ?? "", ctx.salt);
      evidence.pin_verified = pinState.pinVerified === true;
    }

    this.inFlight.delete(callSid); // drop transient call context (incl. salt)

    ctx.ackSink({
      ladderId: ctx.notification.ladderId,
      rungN: ctx.notification.rungN,
      channel: "voice_dtmf",
      by: ctx.user,
      at: this.clock.nowIso(),
      evidence,
    });
  }
}
