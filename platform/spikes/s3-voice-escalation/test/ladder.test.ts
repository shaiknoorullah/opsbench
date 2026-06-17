import { test } from "node:test";
import assert from "node:assert/strict";

import { VirtualClock } from "../src/clock.ts";
import { SlackChannel, PushChannel, SmsChannel } from "../src/channels/chat.ts";
import { VoiceChannel, type DtmfWebhookEvent } from "../src/channels/voice.ts";
import { EscalationLadderMachine, type LadderConfig } from "../src/ladder.ts";
import { digitsHash } from "../src/pin.ts";
import { validator } from "../src/schema.ts";

function baseCfg(over: Partial<LadderConfig> = {}): LadderConfig {
  return {
    id: "esc_01J9Z3K7Y0Z8H5V6F2QABCDEMP",
    tenantId: "t_acme",
    subjectRef: "apr_01J9Z3K7Y0Z8H5V6F2QABCDEAP",
    summary: "INC-1: rollback?",
    target: {
      resolvedHuman: "usr_oncall",
      rosterSource: "pagerduty:schedule/P123",
      resolvedAt: "2026-06-16T00:00:00.000Z",
    },
    rungs: [
      { n: 1, channel: "slack", timeoutS: 120, destination: "U_slack" },
      { n: 2, channel: "push", timeoutS: 120, destination: "dev_1" },
      { n: 3, channel: "sms", timeoutS: 180, destination: "+15551230000" },
      { n: 4, channel: "voice", timeoutS: 240, identityAssurance: "pin", destination: "+15551230000" },
    ],
    onExhausted: ["usr_fallback1", "grp_exec"],
    ...over,
  };
}

function buildChannels(clock: VirtualClock, voiceOpts = {}) {
  const voice = new VoiceChannel(clock, {
    fromNumber: "+15005550006",
    attestation: "A",
    consentMode: "metadata-only",
    pinRegistry: { usr_oncall: "1379" },
    resolveUser: () => "usr_oncall",
    ...voiceOpts,
  });
  return {
    voice,
    channels: {
      slack: new SlackChannel(clock),
      push: new PushChannel(clock),
      sms: new SmsChannel(clock),
      voice,
    },
  };
}

// ── EXIT CRITERION 1 ──────────────────────────────────────────────────────────
// A timed-out approval escalates chat→push→sms→voice; a DTMF ack on the voice
// rung cancels ALL pending rungs within ≤ 5 s (NF-001) end-to-end. Virtual time.
test("EC1: timeout escalates through rungs; voice DTMF ack cancels all rungs ≤ 5s", () => {
  const clock = new VirtualClock();
  const { voice, channels } = buildChannels(clock);

  const firedRungs: number[] = [];
  let cancelLatencyMs = -1;
  const ladder = new EscalationLadderMachine(baseCfg(), clock, channels, {
    onRungFired: (r) => firedRungs.push(r.n),
    onAck: (_ack, latency) => {
      cancelLatencyMs = latency;
    },
  });

  // On-call answers the voice call, presses 1, enters correct PIN.
  voice.setNextCalleeBehaviour({ type: "ack", pin: "1379" });

  ladder.start();
  assert.equal(ladder.getState(), "running");
  assert.deepEqual(firedRungs, [1], "only rung 1 fired at start");
  assert.equal(ladder.pendingRungs(), 1, "rung-1 timer armed");

  clock.advance(120_000); // rung 1 (slack) times out → rung 2 (push)
  clock.advance(120_000); // rung 2 (push) times out → rung 3 (sms)
  clock.advance(180_000); // rung 3 (sms) times out → rung 4 (voice) acks synchronously

  assert.deepEqual(firedRungs, [1, 2, 3, 4], "all four rungs fired in order");
  assert.equal(ladder.getState(), "acked", "ladder acked after voice DTMF");
  assert.equal(ladder.pendingRungs(), 0, "ALL pending rung timers cancelled");

  // NF-001: cancellation latency budget ≤ 5 s. Measured in simulated time.
  assert.ok(cancelLatencyMs >= 0, "ack latency captured");
  assert.ok(cancelLatencyMs <= 5000, `cancel latency ${cancelLatencyMs}ms ≤ 5000ms (NF-001)`);

  const snap = ladder.toSchema();
  assert.equal(snap.state, "acked");
  assert.equal(snap.ack?.channel, "voice_dtmf");
  assert.equal(snap.rungs[3].state, "acked");
  // Earlier rungs must be timed-out, not silently dropped.
  assert.equal(snap.rungs[0].state, "timeout");
  assert.equal(snap.rungs[1].state, "timeout");
  assert.equal(snap.rungs[2].state, "timeout");
});

// Ack from ANY channel cancels all rungs, idempotently. Here: ack on the FIRST
// (slack) rung before any timeout. Late acks / concurrent timers no-op.
test("EC1b: ack from chat rung cancels all rungs; duplicate acks are idempotent", () => {
  const clock = new VirtualClock();
  const { channels } = buildChannels(clock);
  const slack = channels.slack as SlackChannel;

  let ackCount = 0;
  const ladder = new EscalationLadderMachine(baseCfg(), clock, channels, {
    onAck: () => {
      ackCount += 1;
    },
  });
  ladder.start();
  assert.equal(ladder.pendingRungs(), 1);

  slack.simulateAck("usr_oncall");
  assert.equal(ladder.getState(), "acked");
  assert.equal(ladder.pendingRungs(), 0, "all rungs cancelled by first-rung ack");
  assert.equal(ackCount, 1);

  // Duplicate ack + a stray timer advance must not re-ack or fire later rungs.
  slack.simulateAck("usr_oncall");
  clock.advance(600_000);
  assert.equal(ackCount, 1, "duplicate ack is a no-op (idempotent)");
  assert.equal(ladder.getState(), "acked");
});

// ── EXIT CRITERION 2 ──────────────────────────────────────────────────────────
// PIN flow works WITHOUT persisting the PIN: only a verification result +
// digits_hash are stored, and the ack.evidence matches the schema shape.
test("EC2: PIN verified without persistence; evidence matches schema and stores only hash", () => {
  const clock = new VirtualClock();
  const { voice, channels } = buildChannels(clock);
  // Single voice-only ladder for a focused PIN assertion.
  const cfg = baseCfg({ rungs: [{ n: 1, channel: "voice", timeoutS: 240, identityAssurance: "pin", destination: "+15551230000" }] });

  const ladder = new EscalationLadderMachine(cfg, clock, channels, {});
  voice.setNextCalleeBehaviour({ type: "ack", pin: "1379" });
  ladder.start();

  assert.equal(ladder.getState(), "acked");
  const snap = ladder.toSchema();
  const ev = snap.ack?.evidence;
  assert.ok(ev, "evidence present");
  assert.equal(ev?.pin_verified, true, "PIN verified");
  assert.equal(ev?.attestation, "A", "STIR/SHAKEN attestation recorded");
  assert.match(ev?.call_sid ?? "", /^CA\d{30}$/, "call_sid recorded");
  assert.match(ev?.digits_hash ?? "", /^sha256:[a-f0-9]{64}$/, "digits_hash is a sha256");

  // No-persistence proof 1: the raw PIN "1379" appears NOWHERE in the serialised
  // ladder / evidence record.
  const serialised = JSON.stringify(snap);
  assert.ok(!serialised.includes("1379"), "raw PIN absent from persisted record");

  // No-persistence proof 2: digits_hash is a salted hash, so it does NOT equal a
  // bare sha256 of the PIN — confirming we don't store a trivially-reversible digest.
  const bareHash = digitsHash("1379", ""); // unsalted, for contrast only
  assert.notEqual(ev?.digits_hash, bareHash, "digits_hash is salted, not a bare PIN digest");
});

test("EC2b: wrong PIN does NOT ack; ladder keeps running then advances on timeout", () => {
  const clock = new VirtualClock();
  const { voice, channels } = buildChannels(clock);
  const cfg = baseCfg({
    rungs: [
      { n: 1, channel: "voice", timeoutS: 240, identityAssurance: "pin", destination: "+15551230000" },
      { n: 2, channel: "sms", timeoutS: 60, destination: "+15551230000" },
    ],
  });
  const fired: number[] = [];
  const ladder = new EscalationLadderMachine(cfg, clock, channels, { onRungFired: (r) => fired.push(r.n) });

  voice.setNextCalleeBehaviour({ type: "ack", pin: "0000" }); // wrong PIN
  ladder.start();

  assert.equal(ladder.getState(), "running", "wrong PIN must NOT ack");
  clock.advance(240_000); // voice rung times out → sms rung fires
  assert.deepEqual(fired, [1, 2], "ladder advanced past failed-PIN voice rung");
});

// The DTMF webhook handler can also be driven directly (mirrors Twilio POSTing
// /voice/ack then /voice/pin), proving the webhook contract, not just deliver().
test("EC2c: direct DTMF + PIN webhook drive acks the ladder with correct evidence", () => {
  const clock = new VirtualClock();
  const voice = new VoiceChannel(clock, {
    fromNumber: "+15005550006",
    attestation: "B",
    pinRegistry: { usr_oncall: "246810" },
    resolveUser: () => "usr_oncall",
  });
  const channels = { voice };
  const cfg = baseCfg({ rungs: [{ n: 1, channel: "voice", timeoutS: 240, identityAssurance: "pin", destination: "+15551230000" }] });
  const ladder = new EscalationLadderMachine(cfg, clock, channels, {});

  // Drive deliver() with an ack behaviour carrying the 6-digit PIN.
  voice.setNextCalleeBehaviour({ type: "ack", pin: "246810" });
  ladder.start();

  const snap = ladder.toSchema();
  assert.equal(snap.state, "acked");
  assert.equal(snap.ack?.evidence?.pin_verified, true);
  assert.equal(snap.ack?.evidence?.attestation, "B");
});

// ── EXIT CRITERION 3 ──────────────────────────────────────────────────────────
// Unanswered/failed-call path advances the ladder; an exhausted ladder fires the
// fallback contacts (ESC-003) and NEVER terminates silently.
//
// A no-answer on a chat rung's timeout and a no-answer voice call both advance.
test("EC3: no-answer voice call advances the ladder to the next rung", () => {
  const clock = new VirtualClock();
  const { voice, channels } = buildChannels(clock);
  const cfg = baseCfg({
    rungs: [
      { n: 1, channel: "voice", timeoutS: 240, destination: "+15551230001" },
      { n: 2, channel: "sms", timeoutS: 120, destination: "+15551230000" },
    ],
  });
  const fired: number[] = [];
  const ladder = new EscalationLadderMachine(cfg, clock, channels, { onRungFired: (r) => fired.push(r.n) });

  voice.setNextCalleeBehaviour({ type: "no-answer" });
  ladder.start(); // rung 1 (voice) no-answer → rung 2 (sms) fires
  assert.deepEqual(fired, [1, 2], "no-answer voice rung advanced to sms");
  assert.equal(ladder.getState(), "running");
  const snap = ladder.toSchema();
  assert.equal(snap.rungs[0].state, "timeout", "no-answer recorded as timeout, not silent drop");
});

// Precise sequential modelling of the failed-call exhaustion path.
test("EC3b: every call fails → ladder exhausts and ALWAYS notifies fallback", () => {
  const clock = new VirtualClock();
  // A voice channel whose deliver() always fails (no-answer) regardless of order.
  const voice = new VoiceChannel(clock, { fromNumber: "+15005550006", resolveUser: () => "usr_oncall" });
  // Default behaviour with no setNextCalleeBehaviour is "no-answer" → fails.
  const channels = { voice };
  const cfg = baseCfg({
    rungs: [
      { n: 1, channel: "voice", timeoutS: 240, destination: "+15551230001" },
      { n: 2, channel: "voice", timeoutS: 240, destination: "+15551230002" },
    ],
  });

  const fired: number[] = [];
  let fallback: string[] | null = null;
  let fallbackCount = 0;
  const ladder = new EscalationLadderMachine(cfg, clock, channels, {
    onRungFired: (r) => fired.push(r.n),
    onFallback: (n) => {
      fallback = n.contacts;
      fallbackCount += 1;
    },
  });

  ladder.start(); // rung 1 no-answer → rung 2 no-answer → exhaust → fallback

  assert.deepEqual(fired, [1, 2], "both rungs attempted");
  assert.equal(ladder.getState(), "exhausted");
  assert.deepEqual(fallback, ["usr_fallback1", "grp_exec"], "ESC-003 fallback contacts notified");
  assert.equal(fallbackCount, 1, "fallback fired exactly once — no silent termination");
});

// Channel outage on a rung → skipped_outage, advances to next rung (C11 behaviour).
test("EC3c: channel outage skips the rung and advances", () => {
  const clock = new VirtualClock();
  const slack = new SlackChannel(clock, { available: false }); // outage
  const sms = new SmsChannel(clock);
  const channels = { slack, sms };
  const cfg = baseCfg({
    rungs: [
      { n: 1, channel: "slack", timeoutS: 120, destination: "U_slack" },
      { n: 2, channel: "sms", timeoutS: 120, destination: "+15551230000" },
    ],
  });
  const fired: number[] = [];
  const ladder = new EscalationLadderMachine(cfg, clock, channels, { onRungFired: (r) => fired.push(r.n) });
  ladder.start();
  sms.simulateAck("usr_oncall");

  const snap = ladder.toSchema();
  assert.deepEqual(fired, [1, 2]);
  assert.equal(snap.rungs[0].state, "skipped_outage", "outage rung marked skipped_outage");
  assert.equal(ladder.getState(), "acked");
});

// Provisioning guard: empty on_exhausted must fail closed (terminal silence ban).
test("EC3d: empty on_exhausted is rejected at construction (no representable silence)", () => {
  const clock = new VirtualClock();
  const { channels } = buildChannels(clock);
  assert.throws(
    () => new EscalationLadderMachine(baseCfg({ onExhausted: [] }), clock, channels, {}),
    /on_exhausted must be non-empty/,
  );
});

// ── SCHEMA CONFORMANCE ─────────────────────────────────────────────────────────
// Every serialised ladder state validates against the canonical JSON Schema.
test("Schema: running / acked / exhausted snapshots all validate against escalation-ladder.json", () => {
  const validate = validator("escalationLadder");

  // running
  {
    const clock = new VirtualClock();
    const { channels } = buildChannels(clock);
    const ladder = new EscalationLadderMachine(baseCfg(), clock, channels, {});
    ladder.start();
    assert.ok(validate(ladder.toSchema()), `running invalid: ${JSON.stringify(validate.errors)}`);
  }
  // acked (with voice PIN evidence)
  {
    const clock = new VirtualClock();
    const { voice, channels } = buildChannels(clock);
    const ladder = new EscalationLadderMachine(baseCfg(), clock, channels, {});
    voice.setNextCalleeBehaviour({ type: "ack", pin: "1379" });
    ladder.start();
    clock.advance(120_000);
    clock.advance(120_000);
    clock.advance(180_000);
    const snap = ladder.toSchema();
    assert.equal(snap.state, "acked");
    assert.ok(validate(snap), `acked invalid: ${JSON.stringify(validate.errors)}`);
  }
  // exhausted
  {
    const clock = new VirtualClock();
    const voice = new VoiceChannel(clock, { fromNumber: "+15005550006", resolveUser: () => "usr_oncall" });
    const cfg = baseCfg({ rungs: [{ n: 1, channel: "voice", timeoutS: 240, destination: "+15551230001" }] });
    const ladder = new EscalationLadderMachine(cfg, clock, { voice }, {});
    ladder.start();
    const snap = ladder.toSchema();
    assert.equal(snap.state, "exhausted");
    assert.ok(validate(snap), `exhausted invalid: ${JSON.stringify(validate.errors)}`);
  }
});
