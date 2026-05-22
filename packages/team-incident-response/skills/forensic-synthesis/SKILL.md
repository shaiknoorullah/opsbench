---
name: forensic-synthesis
description: Use after parallel-hypothesis-debug agents have ALL returned. Synthesizes their FOR/AGAINST evidence into a single forensic report following NIST SP 800-86 narrative style. Refuses the word "probable" without explicit user permission. Cites every claim with file:timestamp. Names a root cause ONLY when an agent CONFIRMED it with HIGH confidence. If no hypothesis hit HIGH/CONFIRMED, the report ends with "INCONCLUSIVE — additional evidence required" — do not pick a winner.
---

# Forensic Synthesis

## When to invoke

- All `parallel-hypothesis-debug` agents have returned
- A user explicitly requests "forensic report", "investigation report", "RCA document", "post-mortem evidence section"
- A previous "probable" answer was rejected and a citable report is needed

## The principle

```
EVIDENCE → VERDICT → RECOVERY PLAN
       (in that order, never reversed)
```

You are translating raw agent findings into a single authoritative document. The reader is a senior operator who will check your citations. Every claim must survive that audit.

## Forbidden words

Without explicit user permission to use them, do NOT write:

- "probable", "probably", "likely", "most likely" (when describing root cause)
- "should be", "must have been", "would have"
- "the issue was caused by..." without a `file:timestamp` citation in the same sentence

Permitted phrasings:

- "Evidence CONFIRMS that ..." (followed by citation)
- "H{n} was FALSIFIED by ..." (followed by citation)
- "ROOT CAUSE INCONCLUSIVE — no hypothesis reached HIGH confidence"
- "Two hypotheses remain plausible: H{a} and H{c}. Additional evidence required to distinguish: <specific evidence>"

## Report structure

Save to `~/work/.handoffs/<project>/<YYYY-MM-DD>/forensic-report-<workload>.md`.

```markdown
# Forensic Report — <Workload> — <UTC date>

## 1. Incident summary

- **Workload:** <name>
- **Detection time:** <UTC>
- **Failure mode:** <one-sentence technical description>
- **Blast radius:** <what was affected, what wasn't>
- **Current state:** Quarantined since <UTC> per [[incident-quarantine]]
- **Data at risk:** <e.g. 4.3M audit_logs rows on chi-audit-0-1>

## 2. Timeline (UTC)

| Time | Event | Source |
|---|---|---|
| HH:MM:SS | <event> | <file:line> |
| HH:MM:SS | <event> | <file:line> |

Timeline must be reconstructed from cited logs only. Do not interpolate.

## 3. Hypothesis verdicts

### H1: <Hypothesis title> — <CONFIRMED | LIKELY | UNLIKELY | FALSIFIED>
**Confidence:** HIGH | MEDIUM | LOW | INCONCLUSIVE

**Evidence FOR:**
- `<file>:<timestamp>` — "<verbatim excerpt>"

**Evidence AGAINST:**
- `<file>:<timestamp>` — "<verbatim excerpt>"

**Investigator's conclusion:** <one paragraph from the subagent report>

### H2, H3, H4: <same structure>

## 4. Synthesized verdict

One of:

**A. ROOT CAUSE CONFIRMED.** Exactly one hypothesis hit HIGH confidence + CONFIRMED. State it plainly:

> Root cause: <hypothesis>. Evidence: `<key file>:<key timestamp>` confirming "<the smoking gun>".

**B. MULTIPLE PLAUSIBLE CAUSES.** Two or more hypotheses are LIKELY:

> Two contributing causes are LIKELY:
> - <H{a}> ... evidence at `<file>:<timestamp>`
> - <H{c}> ... evidence at `<file>:<timestamp>`
>
> To distinguish: <specific further evidence needed>.

**C. INCONCLUSIVE.** No hypothesis reached HIGH/CONFIRMED:

> ROOT CAUSE INCONCLUSIVE.
>
> Evidence reviewed cannot distinguish between <H{a}> and <H{c}>. Both remain LIKELY.
> Further evidence required:
> - <specific evidence 1>
> - <specific evidence 2>
>
> Recovery should NOT proceed on the basis of "best guess." Either:
> 1. Collect the additional evidence above, then re-synthesize.
> 2. Execute a recovery path that is safe against ALL remaining hypotheses.

## 5. Recovery options

Only listed AFTER the verdict. Each option must explicitly handle each LIKELY hypothesis.

### Option X: <name>
- Steps: <ordered list>
- Hypothesis coverage: <which hypotheses this option remediates>
- Hypothesis exposure: <which hypotheses this option does NOT remediate, if any>
- Risk: <data-loss / downtime / blast-radius>

### Option Y: ...

## 6. Open questions / lessons

Anything that should change the next incident response (memory rule additions, runbook updates, alerting gaps).

## Provenance

- Agent reports: <list of subagent output files>
- Synthesizing operator: <user> via Claude
- UTC at synthesis: <timestamp>
```

## Anti-patterns

- ❌ Writing the verdict first, then cherry-picking evidence
- ❌ Using "probable" when a hypothesis is actually LIKELY (use the framework's word)
- ❌ Naming a root cause when no agent reached HIGH/CONFIRMED — say INCONCLUSIVE
- ❌ Skipping the "Evidence AGAINST" section (always include it, even for the winning hypothesis)
- ❌ Adding recovery steps that don't map to a confirmed hypothesis
- ❌ Burying disagreement among agents — surface it in §4

## Anti-pattern recovery

If you find yourself wanting to write "probable", stop. Either:

1. Find a stronger citation that lets you say CONFIRMED.
2. Dispatch another `parallel-hypothesis-debug` round with better evidence sources.
3. Honestly write INCONCLUSIVE.

## Related

- Parent: `storage-incident-response`
- Previous phase: `parallel-hypothesis-debug`
- For leadership-facing post-mortem after the technical recovery: `incident-report-suite`
- Memory: [[feedback_evidence_attribution]], [[feedback_incident_quarantine_then_forensics]]
