// Runnable narrative demo: a timed-out approval climbs chat → push → sms → voice,
// the on-call presses 1 and enters a PIN on the voice rung, and ALL pending rungs
// cancel. Run with: npm run demo
//
// Uses VirtualClock so it is deterministic and instant (no real telephony, no waits).

import { VirtualClock } from "./clock.ts";
import { SlackChannel, PushChannel, SmsChannel } from "./channels/chat.ts";
import { VoiceChannel } from "./channels/voice.ts";
import { EscalationLadderMachine, type LadderConfig } from "./ladder.ts";
import { validator } from "./schema.ts";

const clock = new VirtualClock();

const voice = new VoiceChannel(clock, {
  fromNumber: "+15005550006",
  attestation: "A",
  consentMode: "metadata-only",
  pinRegistry: { usr_oncall: "1379" },
  resolveUser: () => "usr_oncall",
});
const slack = new SlackChannel(clock);
const push = new PushChannel(clock);
const sms = new SmsChannel(clock);

const cfg: LadderConfig = {
  id: "esc_01J9Z3K7Y0Z8H5V6F2QABCDEMP",
  tenantId: "t_acme",
  subjectRef: "apr_01J9Z3K7Y0Z8H5V6F2QABCDEAP",
  summary: "INC-4521: checkout p99 latency breached SLO for 12 min. Approve rollback?",
  target: { resolvedHuman: "usr_oncall", rosterSource: "pagerduty:schedule/P123", resolvedAt: clock.nowIso() },
  rungs: [
    { n: 1, channel: "slack", timeoutS: 120, destination: "U_oncall_slack" },
    { n: 2, channel: "push", timeoutS: 120, destination: "device_oncall" },
    { n: 3, channel: "sms", timeoutS: 180, destination: "+15551230000" },
    { n: 4, channel: "voice", timeoutS: 240, identityAssurance: "pin", destination: "+15551230000" },
  ],
  onExhausted: ["usr_fallback1", "grp_exec"],
};

const log = (...a: unknown[]) => console.log(...a);

const ladder = new EscalationLadderMachine(
  cfg,
  clock,
  { slack, push, sms, voice },
  {
    onRungFired: (r) => log(`  → rung ${r.n} fired on ${r.channel} (timeout ${r.timeoutS}s) at ${r.firedAt}`),
    onAck: (ack, latency) =>
      log(`  ✓ ACK from ${ack.channel} by ${ack.by} — cancelled all pending rungs in ${latency} ms`),
    onFallback: (n) => log(`  ! EXHAUSTED → fallback fired to ${n.contacts.join(", ")}`),
  },
);

log("S3 demo: chat → push → sms → voice, PIN-gated DTMF ack\n");

// On-call ignores chat, push, sms (each times out), then answers the voice call,
// presses 1, and enters the correct PIN.
voice.setNextCalleeBehaviour({ type: "ack", pin: "1379" });

ladder.start();
log("\nNo one acks the first three rungs; advancing virtual time past each timeout...");
clock.advance(120_000); // rung 1 slack times out → push
clock.advance(120_000); // rung 2 push times out → sms
clock.advance(180_000); // rung 3 sms times out → voice (acks synchronously)

log(`\nLadder state: ${ladder.getState()}  | pending rung timers: ${ladder.pendingRungs()}`);

const snapshot = ladder.toSchema();
const validate = validator("escalationLadder");
const ok = validate(snapshot);
log(`\nSchema-valid against escalation-ladder.json: ${ok}`);
if (!ok) log(validate.errors);
log("\nAck evidence record:");
log(JSON.stringify(snapshot.ack, null, 2));
