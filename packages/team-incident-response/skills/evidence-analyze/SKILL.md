---
name: evidence-analyze
description: Use after evidence-cataloger seals a round's evidence. Wraps parallel-hypothesis-debug + forensic-synthesis to produce a per-round verdict that explicitly states whether (a) ROOT CAUSE CONFIRMED, (b) NEED-MORE-EVIDENCE (triggers evidence-request loop), or (c) INCONCLUSIVE (escalate to human). Verdict-blind to prior rounds — each round re-evaluates from cataloged files only, to mitigate confirmation bias per published forensic-loop methodology.
---

# Evidence Analyze

## When to invoke

- `storage-incident-response` calls this as Phase 5 of round N (after evidence-cataloger seals round-N)
- Re-invoked for each round in the iterative loop
- The evidence corpus for this round is finalized in `round-<N>/evidence/` with `manifest.sha256` sealed

## The principle

```
ROUND N ANALYSIS USES ONLY ROUND-N EVIDENCE
```

Verdict-blind to prior rounds. This is the anti-confirmation-bias guard from the SANS DFIR / NTSB party-process model: each analytic round must re-evaluate from the cataloged files of THAT round, not from prior verdicts. Prior verdicts may be referenced for FALSIFICATION ATTEMPTS but never to constrain the hypothesis space.

## Procedure

### Step 1: Load the round's evidence

```bash
ROUND_DIR="<handoff>/<id>/round-<N>"
test -f "$ROUND_DIR/manifest.sha256" || { echo "Round not sealed by evidence-cataloger"; exit 1; }

# Verify bundle integrity before analyzing — if bundle hash mismatches, refuse to analyze
sort "$ROUND_DIR/manifest.sha256" | sha256sum | awk '{print $1}' > /tmp/bundle.check
diff /tmp/bundle.check "$ROUND_DIR/bundle.sha256.txt" || exit 1
```

### Step 2: Dispatch parallel-hypothesis-debug against evidence files

Use the existing `parallel-hypothesis-debug` skill but with evidence-corpus-only mode:

- Each team-debugger receives the path to its hypothesis's relevant evidence subtree (not live cluster access)
- This ensures reproducibility — same evidence + same prompt = same verdict
- If a hypothesis NEEDS data that isn't in the round's corpus, the agent reports `EVIDENCE-GAP: <what is missing>` instead of guessing

Example dispatch prompt fragment:

```
You are investigating hypothesis H1 against the sealed evidence corpus at:
  <handoff>/<id>/round-<N>/evidence/

Allowed: read files under that path. Verify file hashes against manifest.sha256 before citing.
Not allowed: live cluster queries. If evidence is missing for your hypothesis, report:
  EVIDENCE-GAP: <specific file or query that would resolve this>

The EVIDENCE-GAP markers feed the next round's evidence-request.
```

### Step 3: Synthesize per-round verdict

Invoke the existing `forensic-synthesis` skill with the round's debug reports. The verdict must end with exactly one of:

#### A. ROOT-CAUSE-CONFIRMED

One hypothesis hit HIGH/CONFIRMED. Recovery can proceed.

Write `round-<N>/verdict.md` with explicit `status: CONFIRMED` frontmatter.

#### B. NEED-MORE-EVIDENCE

At least one hypothesis is LIKELY but FALSIFY-EVIDENCE was insufficient. Report which hypotheses remain and what evidence would distinguish them.

Write `round-<N>/verdict.md` with `status: NEED-MORE-EVIDENCE` frontmatter AND a list of EVIDENCE-GAP entries that feed `round-<N+1>/request.md`.

Trigger `evidence-request` skill to write the next round's request (with human-in-loop checkpoint).

#### C. INCONCLUSIVE

No hypothesis reached HIGH confidence AND the EVIDENCE-GAP entries cannot be filled (sources unavailable, retention expired, etc.). Escalate to a human operator.

Write `round-<N>/verdict.md` with `status: INCONCLUSIVE` frontmatter.

### Step 4: Loop control governors

Before returning NEED-MORE-EVIDENCE, this skill MUST check:

| Governor | Default | Action if exceeded |
|---|---|---|
| Max rounds | 5 | Force INCONCLUSIVE; require human decision to continue |
| Per-round artifact budget | round-1 unlimited, round-2 ≤50, round-3 ≤25, round-4 ≤12, round-5 ≤6 | Force INCONCLUSIVE |
| Wall-clock budget | 24h cumulative | Force INCONCLUSIVE |
| No-new-hypothesis convergence | After round N≥2, if no hypothesis is added or refined vs round N-1, stop | Force INCONCLUSIVE |
| Falsification quota | Round must include ≥1 falsification artifact | Reject the verdict; require redo |
| Stale evidence guard | All round-N evidence collected within 6h of incident_time | Flag stale entries; allow but warn |

## Verdict file format

`round-<N>/verdict.md`:

```markdown
---
incident_id: <id>
round: <N>
analyzed_at_utc: <ISO8601>
status: CONFIRMED | NEED-MORE-EVIDENCE | INCONCLUSIVE
parent_evidence_bundle_sha256: <bundle-hash>
prior_verdict_sha256: <round-N-1 verdict hash, or null for round-1>
hypotheses_evaluated: [H1, H2, H3, H4]
governor_check:
  rounds_used: <N>
  rounds_remaining: <5 - N>
  artifact_budget_used: <count>
  wall_clock_used_min: <int>
  new_hypotheses_this_round: <bool>
  falsification_artifacts_present: <bool>
---

# Round <N> Verdict

<full forensic-synthesis output structured per its template>

## Evidence gaps requiring next round (NEED-MORE-EVIDENCE only)

- GAP-1: <what is missing> — needed to falsify H<n>
- GAP-2: ...
```

## Anti-patterns

- ❌ Carrying forward a "leading hypothesis" from prior rounds — re-evaluate from evidence
- ❌ Suppressing a hypothesis because a prior round called it UNLIKELY — re-test it with new evidence
- ❌ Returning NEED-MORE-EVIDENCE without specific GAP entries — the next round must know what to collect
- ❌ Skipping the bundle-hash verification step — if hashes don't match, the evidence has been tampered with or the catalog is broken
- ❌ Asking for evidence outside the discovery layer's identified sources — if a source wasn't found in evidence-source-discovery, the orchestrator can't collect it

## Related

- Parent: `storage-incident-response`
- Previous phase: `evidence-cataloger`
- Next phase (status A): `recovery` → `post-incident-artifact-generator`
- Next phase (status B): `evidence-request` (which triggers a new round)
- Next phase (status C): escalate to human
- Foundation: `parallel-hypothesis-debug`, `forensic-synthesis`
