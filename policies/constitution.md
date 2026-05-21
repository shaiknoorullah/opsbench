# Forensic Authoring Constitution

Hard rules consumed by `tone-reviewer` (team-5-enforcement) before any artifact is sealed
into `final/`, `round-N/verdict.md`, comms, or any document attached to an incident.

A violation is BLOCKING. The agent must rewrite and resubmit.

---

## 1. Forbidden words and phrases

The following are forbidden unconditionally in forensic reports, verdicts, RCAs, and incident
reports — regardless of context — UNLESS the user has granted explicit permission for this
incident:

- `probable`
- `probably`
- `likely` (when used as an unqualified standalone — see §2 for the allowed form)
- `most likely`
- `should be` (as a causal claim — "this should be the cause")
- `must have been`
- `presumably`
- `seems to have`
- `appears to have caused`
- `I think` / `I believe` / `my guess` (any first-person speculation)

`tone-reviewer` performs a case-insensitive regex match for each phrase and fails the document
on any hit unless the surrounding context matches an exemption (see §2).

## 2. Permitted forensic phrasings

Forensic verdicts MUST use these exact status terms, each paired with a confidence band AND a
cited sha256-sealed evidence file:

| Status     | Meaning                                                                       |
|------------|-------------------------------------------------------------------------------|
| CONFIRMED  | All confirm_criteria met, all falsify_criteria attempted and did not falsify  |
| LIKELY     | Some confirm_criteria met, some falsify_criteria not yet attempted            |
| UNLIKELY   | Most confirm_criteria absent, some falsify_criteria succeeded                 |
| FALSIFIED  | At least one falsify_criterion produced contradicting evidence                |
| INCONCLUSIVE | Evidence is insufficient to evaluate confirm or falsify criteria              |

Confidence bands: `HIGH`, `MEDIUM`, `LOW`, `INCONCLUSIVE`.

Examples of permitted constructions:

- "H2 CONFIRMED with HIGH confidence (evidence: round-1/evidence/storage/iostat-l01.txt sha256=abc...)"
- "H1 LIKELY with MEDIUM confidence; one falsify_criterion not yet attempted (see gap §X)"
- "Hypothesis H3 INCONCLUSIVE pending round-2 Prometheus query for node_cpu_seconds_total"

The unqualified word "likely" is allowed ONLY when immediately followed by a confidence band
and an evidence citation, OR when used inside a quoted log line / external excerpt.

## 3. Style

- No emojis in any forensic artifact, comms message, or commit message UNLESS explicitly
  requested by the user.
- All timestamps in ISO 8601 UTC with literal `Z` suffix. No local time, no offsets, no
  bare epoch seconds. Format: `YYYY-MM-DDTHH:MM:SSZ` (sub-second allowed: `.123Z`).
- All durations in explicit units (`min`, `sec`, `hr`). No bare numbers.
- Code, paths, hostnames, and IPs in backticks.
- Block quotes for verbatim log excerpts; include the source path and line range.

## 4. Citations

Every causal claim cites at least one sha256-sealed evidence file via this exact format:

    <claim text> (evidence: <path-relative-to-incident-root> sha256=<64-hex-chars>)

- The path must exist in this incident's `custody.log`.
- The sha256 must match the value in `manifest.sha256`.
- `tone-reviewer` verifies the file exists and the digest matches before sealing.
- Verbal evidence (a phone call, an in-person hand-off) is permitted only when marked
  `(evidence: verbal — witness: <name>)` and the witness has been recorded in `timeline.md`.

## 5. Customer-facing communications

Comms drafted by `comms-drafter` and intended for customers, status pages, or external
stakeholders MUST:

- Use plain English. Replace internal jargon (CRD, CNI, ext4 journal abort, EIO) with
  customer-level descriptions (a storage layer error, a network configuration issue).
- Never include internal hostnames (e.g., `n.cnt.ap-south-1a.l.01`).
- Never include internal IP addresses (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
  100.64.0.0/10, WireGuard 10.50.0.0/24, pod/service CIDRs).
- Never name internal engineers, contractors, or vendor support reps. Use roles only
  ("our infrastructure engineering team").
- Never disclose the specific operator/version/CVE that caused the incident unless the user
  explicitly approves disclosure.
- Include: what happened (plain), who is affected, current status, next update time.
- Exclude: root-cause speculation, blame, internal timelines under active investigation.

Internal Slack and engineering postmortems are NOT subject to §5 — they may use jargon and
internal identifiers freely.

## 6. Probabilistic language exception

The user MAY grant explicit permission to use probabilistic language for a specific incident
or document. The permission is recorded in `timeline.md` with category=ROLE_ASSIGNED and the
exact phrase:

    Actor: <user>
    Event: Granted probabilistic-language exemption for <document>. Phrases permitted: <list>.

`tone-reviewer` checks `timeline.md` for this entry before failing a document on §1.

## 7. Authoring discipline

- Append-only documents (timeline.md, custody.log) must NEVER be rewritten. Append new
  entries; do not edit history.
- Round-N verdicts are sealed once written; corrections happen in round-(N+1) with explicit
  reference to the prior verdict's sha256.
- Recovery actions are NEVER taken without a `ROOT_CAUSE_CONFIRMED` verdict OR an explicit
  user override recorded in `timeline.md` (category=HUMAN_APPROVAL).
