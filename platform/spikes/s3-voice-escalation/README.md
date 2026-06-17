# S3 — Voice Escalation Loop (design spike)

Standalone, runnable prototype answering: **does the full ladder → outbound call →
DTMF ack → ladder-cancel loop close reliably, and what identity-assurance UX (PIN)
is acceptable?**

It implements the platform-owned **escalation-ladder state machine** as the single
source of truth (spec `01-schemas.md §7`, architecture C11, PRD ESC-001..ESC-003),
with interchangeable simulated delivery channels (`slack`, `push`, `sms`, `voice`).
The voice channel models the **Twilio Programmable Voice + `<Gather>` DTMF webhook**
contract so the real adapter is a thin swap. Nothing here dials a real number.

## Run

```bash
npm install      # local node_modules; NOT a workspace member
npm test         # node:test + tsx — 14 tests incl. all three exit-criteria loops
npm run demo     # narrative chat→push→sms→voice→PIN-DTMF-ack walkthrough
```

## What it proves

| File | Role |
|------|------|
| `src/clock.ts` | Injectable `Clock`; `VirtualClock` drives all rung timeouts in **virtual time** — no wall-clock sleeps in tests, so the `≤ 5 s` cancellation is deterministic and instant. |
| `src/ladder.ts` | `EscalationLadderMachine` — owns ladder state. Sequential rung firing, per-rung timeouts, **first ack from any channel cancels all pending rungs idempotently**, channel-outage skip, **exhausted → ESC-003 fallback (never silent)**. Empty `on_exhausted` fails closed at construction. |
| `src/channels/channel.ts` | `Channel` interface + `AckSink` seam. Vendors are interchangeable; the ladder treats every channel uniformly. |
| `src/channels/chat.ts` | Simulated `slack` / `push` / `sms` channels with a programmatic ack hook. |
| `src/channels/voice.ts` | Simulated Twilio outbound call + `<Gather>` DTMF/PIN webhook handlers. Documents the real TwiML / ConversationRelay wiring inline. |
| `src/pin.ts` | PIN handling: salted `digits_hash` (sha256), constant-time `verifyPin`. **PIN values never persist.** |
| `src/schema.ts` | Imports the canonical `EscalationLadder` type + Ajv `validator` from `packages/schemas` (same source of truth as the services). |

## Ladder state machine

```
start → [rung 1 fire] --timeout--> [rung 2 fire] --timeout--> ... --timeout--> exhausted → fallback (ESC-003)
              |                          |                                          (always notifies someone)
            ack ────────────────────── ack (from ANY channel) ──────────────► acked  (cancels ALL pending rungs, idempotent)
```

- **Ack idempotency.** Because rungs fire sequentially, exactly one rung timer is
  armed at a time. The first effective ack cancels that timer; the ladder flips to
  `acked`; every later ack and any concurrently-firing timer is a no-op.
- **Failure paths.** A no-answer / carrier-failed call records the rung as
  `timeout` and advances. A channel outage records `skipped_outage` and advances.
- **Terminal silence is unrepresentable.** `exhausted` always fires the fallback
  notice; an empty `on_exhausted` is rejected at construction.

## Voice channel — real Twilio wiring (documented, not executed)

The simulation in `src/channels/voice.ts` mirrors this production sequence:

1. **Outbound call** — `POST .../Accounts/{Sid}/Calls.json` with
   `From=+1… To=+1<oncall> Url=<twiml> MachineDetection=Enable` → returns
   `{ sid: "CA…" }` (the `call_sid`).
2. **TTS + first `<Gather>`** — Twilio fetches the TwiML and reads:
   `<Say>…incident summary… Press 1 to acknowledge.</Say>` inside a
   `<Gather input="dtmf" numDigits="1" action="/voice/ack">`.
3. **Ack webhook** — caller presses `1` → Twilio `POST /voice/ack { CallSid, Digits:"1" }`.
   For a PIN rung the handler returns a second `<Gather numDigits="4|6" action="/voice/pin">`.
4. **PIN webhook** — `POST /voice/pin { CallSid, Digits:"<pin>" }` → we verify in
   constant time, store **only** `digits_hash` + `pin_verified`, then
   `<Say>Acknowledged.</Say><Hangup/>`.
5. **STIR/SHAKEN** — outbound `From` ownership yields an attestation level (A/B/C),
   recorded in evidence. Attestation protects the *callee's* trust in our caller-ID,
   **not** our trust in the callee — which is why the PIN remains load-bearing
   (NIST SP 800-63B classifies PSTN OOB auth as *restricted*).

**ConversationRelay variant** (natural-language ack): swap the `<Gather>` for
`<Connect><ConversationRelay url="wss://…"/></Connect>`; the relay streams ASR
transcripts and we map intent → ack. DTMF stays as the fallback. Pricing differs
(see `VERDICT.md`).

## Consent / recording (NF-012)

`VoiceChannel` carries a `consentMode`:

- `metadata-only` (default) — **no audio retained**; only call metadata + DTMF
  events. Safe under California all-party-consent (Penal Code §632) and GDPR.
- `recorded` — requires a ledgered all-party-consent DTMF press before the readout.

The PIN digits are excluded from any recording/log in both modes.

See `VERDICT.md` for the per-criterion PASS/PARTIAL/BLOCKED verdicts, the measured
cancellation latency, the per-call cost arithmetic, and suggested spec amendments.
