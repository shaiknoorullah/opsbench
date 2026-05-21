---
name: team-5-enforcement
description: Schema + tone + citation + redaction enforcement for every authored artifact. Routes via PostToolUse hook on artifact write — schema-validator → tone-reviewer → evidence-citation-checker → redaction-checker. On FAIL, critique back to author; max 3 cycles. Without this gate, no artifact reaches "final" or external distribution.
---

# Team 5 — Schema + tone enforcement

## Composition

| Subagent | Role |
|---|---|
| `schema-validator` | Validates artifact JSON against committed schemas. Pydantic + structured-output retry-with-feedback |
| `tone-reviewer` | Constitutional review against `policies/constitution.md`. Anti-"probable", anti-emoji, NIST phrasing |
| `evidence-citation-checker` | Verifies every claim's sha256 + file ref resolves in the catalog |
| `redaction-checker` | Scans for PII, secrets, API keys, internal hostnames, engineer names before external publication |

## Sequencing (gates every artifact write)

```
[any author writes round-N/verdict.md, final/rca.md, recovery-plan.md, etc.]
  └── PostToolUse hook fires
        └── schema-validator (deny on schema FAIL with JSON Pointer critique)
              └── (if PASS) tone-reviewer (deny on style FAIL)
                    └── (if PASS) evidence-citation-checker (deny on broken citation)
                          └── (if PASS, external artifact only) redaction-checker
                                └── ACCEPT and persist
        On any DENY:
          → critique returned to authoring agent
          → max 3 revision cycles
          → on 4th fail: human-escalation
```

## Inputs

- Artifact files (just-written by author agents)
- `<incident_dir>/round-<N>/manifest.sha256` (for citation checking)
- `policies/constitution.md` (for tone)
- `schemas/*.json` (for schema validation)

## Outputs

- Critique JSON returned to author (structured by JSON Pointer)
- Approval stamp written to artifact frontmatter: `enforcement: passed_at_utc=<ts>`
- Failed artifacts are REJECTED — not silently persisted

## Hooks involved

- `PostToolUse` is the entry point for this team — fires whenever an artifact file is written
- `PreToolUse` enforces Cedar: only Team 5 agents can write to `<incident_dir>/<artifact>.validation.json`

## Schemas enforced

- This team owns the schema enforcement infrastructure. See `schemas/` directory.

## Hard rules

- **No artifact reaches `final/` without passing all 4 gates.**
- **Customer-facing artifacts MUST pass redaction-checker** — internal hostnames (`.pnats.cloud`, `*.local`), IPs (`10.0.*`, `172.*`), engineer names trigger denial.
- **The constitution is law.** Forbidden words: "probable", "probably", "likely", "most likely" without HIGH/MEDIUM/LOW evidence-confidence qualifier; "should be", "must have been". Permitted: CONFIRMED, LIKELY, UNLIKELY, FALSIFIED, INCONCLUSIVE.
- **Max 3 revision cycles.** Fourth fail = human-escalation.
- **Citation checking verifies sha256 against the SEALED catalog**, not the live filesystem. If the manifest doesn't have the file, the citation is broken regardless of whether the file exists.

## Constitution location

`policies/constitution.md` — see for the full ruleset. Updated centrally; tone-reviewer reads on each invocation.

## Related

- Concurrent with: `team-4-analysis` (validates verdicts as produced), `team-6-authoring` (validates RCA/MIR/comms)
- Triggered by: PostToolUse hook on file write
- On 4th fail: hands off to `team-8-loop-control` human-escalation
