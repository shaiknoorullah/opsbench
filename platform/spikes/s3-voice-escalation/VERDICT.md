# S3 — Voice Escalation Loop — VERDICT

**Question.** Does the full ladder → outbound call → DTMF ack → ladder-cancel loop
close reliably, and what identity-assurance UX (PIN) is acceptable?

**Headline.** **YES** — the loop closes reliably in the simulation. The
platform-owned state machine is the single source of truth; the first ack from any
channel cancels all pending rungs idempotently; failure paths advance; exhaustion
always fires the ESC-003 fallback. The acceptable identity-assurance UX is a
**per-incident/per-user PIN entered via DTMF on top of phone possession**, with the
PIN never persisted (only a salted `digits_hash` + `pin_verified` boolean + STIR/SHAKEN
attestation recorded). Live-telephony items are **documented, not executed** (no
Twilio creds / public webhook / phone in this environment).

Evidence: `npm test` → **14/14 pass** (node:test + tsx, virtual time). `npm run demo`
prints the full chat→push→sms→voice→PIN-DTMF-ack walkthrough and a schema-valid
evidence record.

---

## Exit criterion 1 — timeout escalates through rungs; DTMF ack cancels ALL rungs ≤ 5 s

**PASS (simulated).**

Test `EC1` (`test/ladder.test.ts`): a ladder with rungs `slack(120s) → push(120s) →
sms(180s) → voice(240s, PIN)` starts; the on-call ignores the first three rungs.
Virtual time is advanced past each timeout (`clock.advance(120_000)` ×2, then
`180_000`). Each timeout fires the next rung in order (`firedRungs === [1,2,3,4]`).
On the voice rung the callee presses 1 and enters the correct PIN; the ladder
transitions to `acked`, **all pending rung timers are cancelled** (`pendingRungs()
=== 0`), and the earlier rungs are recorded as `timeout` (not silently dropped).

- **Measured cancellation latency in the simulation: 0 ms.** The ack handler cancels
  the single armed rung timer synchronously in-process, then flips state. Because
  rungs fire sequentially there is exactly one armed timer, so "cancel all rungs" is
  one cancel call. `0 ms ≤ 5000 ms` → **NF-001 satisfied** with full headroom.
- `EC1b` proves ack from a **non-voice** rung (slack button) also cancels everything,
  and that a **duplicate ack + a 600 s time advance is a no-op** (idempotent; no later
  rung ever fires).

**What the 0 ms does and does not prove.** It proves the *platform-internal*
cancellation is effectively instantaneous — the part S3 owns. It does **not** model
real-world wall-clock latency, which in production is dominated by: webhook RTT
(Twilio → our `/voice/ack`, ~tens-hundreds ms), fan-out to cancel any *parallel*
notifications (if the design ever fires rungs concurrently), and Slack/push API
delete-message calls. The NF-001 5 s budget is for that end-to-end path; this spike
shows the state-machine contribution is negligible and the budget is comfortable.
**Spec note:** keep rungs strictly sequential (as modelled) so "cancel all" is always
a single timer-cancel; if future product needs *simultaneous* multi-channel blasts,
re-measure the fan-out cancel against NF-001.

## Exit criterion 2 — PIN flow works WITHOUT persisting the PIN; evidence matches schema

**PASS.**

Tests `EC2`, `EC2b`, `EC2c`:

- The DTMF webhook handler verifies the PIN with a **constant-time compare**
  (`src/pin.ts verifyPin`) and records only `{ call_sid, digits_hash, pin_verified,
  attestation }` — exactly the `EscalationLadder.ack.evidence` shape in
  `escalation-ladder.json`. The serialised ladder **validates against the canonical
  JSON Schema** via the shared Ajv `validator("escalationLadder")`.
- **No-persistence proof 1:** the raw PIN string (`"1379"`) appears **nowhere** in the
  serialised ladder/evidence (`assert(!JSON.stringify(snap).includes("1379"))`).
- **No-persistence proof 2:** `digits_hash` is **salted** per-incident, so it does not
  equal a bare `sha256(pin)` — it is not a trivially-reversible digest of a 4–6 digit
  secret. The salt lives only in transient per-call context and is dropped when the
  ack completes; only the hash survives.
- `EC2b`: a **wrong PIN does not ack** — the ladder stays `running` and advances on the
  rung timeout (fail-closed; phone-possession alone is never sufficient on a PIN rung).
- `EC2c`: drives the DTMF + PIN webhooks directly (mirroring Twilio `POST /voice/ack`
  then `POST /voice/pin`), proving the webhook contract independent of the convenience
  `deliver()` path, including a 6-digit PIN and a `B`-level attestation.

**Acceptable identity-assurance UX (the question's "what PIN is acceptable").**
A short numeric PIN (4–6 digits) entered via DTMF, layered on phone possession,
gathered with `<Gather>` and excluded from recordings/logs. This is the right control
because (per research / NIST SP 800-63B) PSTN out-of-band is *restricted*: a bare
keypress only proves someone answered a portable, SIM-swappable number. The PIN is the
knowledge factor that makes the ack attributable. Treat a PIN-confirmed DTMF press as
**strong attributable evidence, not a legal signature** (open legal question, per
research). Recommended UX: per-incident ephemeral PIN delivered out-of-band (e.g. in
the Slack/push rung text) so it is fresh per escalation rather than a reused static PIN.

## Exit criterion 3 — failed-call path advances; exhausted fires fallback; never silent

**PASS.**

- `EC3`: a **no-answer** voice call advances to the next rung and records the rung as
  `timeout` (not a silent drop).
- `EC3b`: every call fails (no-answer) → ladder reaches `exhausted` → **fallback fires
  exactly once** to the ESC-003 contacts (`["usr_fallback1","grp_exec"]`). The
  `onFallback` hook is the failure-detector seam (C11: "exhausted → failure detector").
- `EC3c`: a **channel outage** on a rung records `skipped_outage` and advances (C11:
  "channel outage → next rung").
- `EC3d`: an **empty `on_exhausted`** throws at construction — "an empty list is a
  provisioning error" (spec §7). **Terminal silence is unrepresentable**: there is no
  path to a terminal state without either an ack or a fallback notification.

## Exit criterion 4 — per-call cost vs research "< $1 per 5-minute call"

**PASS (arithmetic below; one figure live-verified, one cross-referenced to research).**

Live-fetched pricing (Twilio, US, fetched 2026-06-16):

| Item | Rate (USD) | Source |
|------|-----------|--------|
| Programmable Voice — outbound to US local/toll-free | **$0.0140 / min** | `twilio.com/en-us/voice/pricing/us` |
| ConversationRelay (NL ack add-on) | **$0.07 / min** | `twilio.com/en-us/voice/pricing/us` + `.../products/conversational-ai/pricing` |
| Local phone number rental | ~$1.15 / month | research / Twilio numbers pricing |
| `<Say>` TTS (standard voices) | bundled in per-minute voice | Twilio (no separate line item on the voice pricing page) |

Vonage outbound-US per-minute is paywalled (HTTP 403/404 on the public pricing
endpoints from this environment) — the research synthesis cites Vonage as the
equivalent NCCO `talk`+`input` path at a comparable rate, used here only as a sanity
cross-reference, not the basis of the number.

**Arithmetic — 5-minute incident call:**

- **DTMF-only path** (this spike's primary design — `<Say>` + `<Gather>`):
  `5 min × $0.0140/min = $0.070` per call.
  Amortized number rental at, say, 200 calls/mo: `$1.15 / 200 ≈ $0.006` → still
  **≈ $0.076 per call**. **Well under $1.**
- **ConversationRelay path** (optional natural-language ack):
  `5 min × ($0.0140 + $0.07)/min = 5 × $0.084 = $0.42` per call. **Still under $1.**
- Most acks happen in the first ~30–60 s (press 1 + 4-digit PIN), so the *typical*
  DTMF call is ~1 min ≈ **$0.014**, an order of magnitude under budget.

**Conclusion:** the research's "< $1 per 5-minute call" holds with large margin on the
DTMF path and comfortably on the ConversationRelay path. Cost is not a constraint;
choose the channel on UX, not price.

---

## Summary table

| Criterion | Verdict | Key evidence |
|-----------|---------|--------------|
| 1. timeout→escalate→DTMF-ack→cancel-all ≤ 5 s | **PASS (sim)** | `EC1`/`EC1b`; cancel latency **0 ms** (virtual time); idempotent |
| 2. PIN works without persistence; evidence matches schema | **PASS** | `EC2/EC2b/EC2c`; raw PIN absent; salted `digits_hash`; schema-valid |
| 3. failed→advance; exhausted→fallback; never silent | **PASS** | `EC3/EC3b/EC3c/EC3d`; empty fallback fails closed |
| 4. cost < $1 / 5-min | **PASS** | DTMF $0.07; ConversationRelay $0.42; both < $1 |
| Live outbound call + public webhook + real phone | **DOCUMENTED, NOT EXECUTED** | no Twilio creds/phone/webhook in env; real wiring in `voice.ts` + README |

## Suggested spec amendments (`01-schemas.md §7` / PRD ESC-*)

1. **State machine: keep rungs strictly sequential.** Make explicit in §7 that rungs
   fire one at a time so "first ack cancels all pending rungs" is always a single
   timer-cancel — this is what keeps the cancel inside NF-001 with margin. If parallel
   multi-channel blasts are ever introduced, NF-001 must be re-validated against the
   fan-out cancel cost.
2. **Add `evidence.consent_mode` to `ack.evidence`.** NF-012 distinguishes
   `metadata-only` vs `recorded`; the ack record should carry which mode was in force
   (and, if recorded, the consent-capture DTMF event reference) so the audit spine
   proves recording legality per call. Currently §7 mentions consent only in prose.
3. **Add a `digits_hash` salting requirement note.** §7 says "PIN values never persist
   (only verification results)". Strengthen to require that `digits_hash` be a *salted*
   hash (per-incident salt), since an unsalted sha256 of a 4–6 digit PIN is trivially
   reversible — i.e. an unsalted digest is itself a near-equivalent of persisting it.
4. **Add a `failure_reason` enum on timed-out/failed rungs.** Today a rung's `state`
   collapses `no-answer`, `carrier-failed`, and `unacked-timeout` all into `timeout`.
   For the failure detector (C11) and postmortems, distinguish them (e.g. optional
   `rungs[].failure_reason: "no_answer"|"failed"|"timeout"|"outage"`).
5. **Clarify ack legal weight.** Record in the spec (and surface in UX) that a
   PIN-confirmed DTMF ack is *strong attributable evidence, not a contractual
   signature* — matching the research's LOW-confidence legal flag — so downstream
   policy doesn't over-trust voice acks for irreversible Tier-3 actions.

## Files created

```
platform/spikes/s3-voice-escalation/
  package.json            standalone "type":"module"; tsx + node:test; local node_modules
  tsconfig.json
  README.md
  VERDICT.md              (this file)
  src/
    clock.ts              injectable Clock + deterministic VirtualClock
    ladder.ts             EscalationLadderMachine (single source of truth)
    pin.ts                salted digits_hash + constant-time verifyPin (no PIN persistence)
    schema.ts             imports EscalationLadder type + Ajv validator from packages/schemas
    index.ts              barrel
    demo.ts               runnable narrative walkthrough (npm run demo)
    channels/
      channel.ts          Channel interface + AckSink seam
      chat.ts             simulated slack / push / sms
      voice.ts            simulated Twilio outbound call + <Gather> DTMF/PIN webhooks
  test/
    clock.test.ts         virtual-time scheduler unit tests (4)
    ladder.test.ts        EC1/EC2/EC3 loops + schema conformance (10)
```

## Blocked / not-executed items

- **Live outbound call, public DTMF webhook, real phone, real STIR/SHAKEN
  attestation** — BLOCKED by environment (no Twilio credentials, no public webhook
  endpoint, no phone). Fully simulated and the real wiring is documented in
  `src/channels/voice.ts` and the README. Mark as *documented-not-executed*.
- **Vonage live per-minute price** — public pricing endpoints returned 403/404 from
  this environment; used the research-cited "comparable to Twilio" figure as a
  cross-reference only. Twilio numbers are live-verified and carry the verdict.
- **Pre-existing `tsc --noEmit` errors** originate inside the canonical
  `packages/schemas/src/index.ts` (Ajv `esModuleInterop` typing), **not** this spike's
  code; `tsx` (the test/demo runtime) executes correctly and all 14 tests pass.
