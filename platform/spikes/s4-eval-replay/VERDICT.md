# S4 — Time-Travel Eval Replay — VERDICT

**Question.** Can a closed incident be replayed with temporal isolation and
graded meaningfully against the human resolution, producing evidence suitable for
an `AutonomyCertificate`?

**Overall: PASS** (for the spike's scope — the temporal-isolation mechanism,
deterministic grading stability, and schema-valid evidence emission). Real-LLM
investigator accuracy/variance is explicitly out of scope.

Reproduce: `npm install && npm test && npm run demo` (19 tests, all pass).

---

## Criterion 1 — Temporal isolation verified — **PASS**

During replay, any attempt to read evidence dated after the incident-window
cutoff fails and is logged.

**Mechanism.** The agent is handed only a `TemporalEvidenceProvider`
(`src/evidence-provider.ts`) constructed with the incident `cutoff_ts`. The gate
is `Date.parse(item.ts) <= Date.parse(cutoff)`, enforced on every surface:

- `list()` / `query()` filter post-cutoff items out; each filtered item is logged
  as a `deny` though it is never surfaced.
- `getById(postCutoffId)` logs a `deny` **and throws** `PostCutoffAccessError`.

**Proof (`test/temporal-isolation.test.ts`).** A fresh post-cutoff item
`ev_seeded_leak` (ts `2026-05-01T12:00:00Z`, cutoff `10:45:00Z`) that names the
root cause and fix is seeded, then:

- it is absent from `list()` and never matched by `query()`;
- `getById("ev_seeded_leak")` throws `PostCutoffAccessError` and the access log
  records a `deny` for it;
- in a full replay the agent's `consulted_evidence_ids` contain **zero**
  post-cutoff ids (`ev_post_rollback`, `ev_post_recovered`, `ev_seeded_leak`);
- `denied_accesses > 0` and `hidden_ids.length === 3` for the run;
- the agent **still solves** the incident from pre-cutoff evidence alone
  (`rca.cause_id === "rc_pool_exhaustion"`), proving isolation does not break
  gradeability.

**Demo numbers:** per replay run — 2 fixture post-cutoff items hidden, 8 denials
logged (every blocked item logged once per `list()` traversal the stub performs).

---

## Criterion 2 — Grading stability across 3 reruns — **PASS**

| metric | run 1 | run 2 | run 3 | variance | stddev |
|---|---|---|---|---|---|
| aggregate | 1.0 | 1.0 | 1.0 | **0** | 0 |
| detection | 1.0 | 1.0 | 1.0 | **0** | 0 |
| localization | 1.0 | 1.0 | 1.0 | **0** | 0 |
| rca | 1.0 | 1.0 | 1.0 | **0** | 0 |
| mitigation | 1.0 | 1.0 | 1.0 | **0** | 0 |

Variance is **exactly 0** across all dimensions and the aggregate
(`test/stability.test.ts`). The `Investigation` object is byte-identical across
reruns (`JSON.stringify` equality). This is expected and is the point: the
deterministic stub + pure grader + seeded id factory make the harness fully
reproducible **without a live model**.

The aggregate is `1.0` because the synthetic incident is cleanly solvable from
pre-cutoff evidence and the stub's rules align with the recorded resolution. The
grader is **not** a rubber-stamp — `test/grader.test.ts` proves wrong
localization, wrong RCA, and a totally-wrong investigation score strictly lower
(near-zero aggregate for the latter).

**Out of scope:** a real LLM investigator would show non-zero run-to-run variance
even at temperature 0 (provider non-determinism, tokenization, tool-call
ordering). Measuring that is a follow-up; the harness is ready to measure it
(swap the agent, rerun `aggregateVariance` over N runs).

---

## Criterion 3 — Evidence record satisfies the `AutonomyCertificate.evidence`
block and validates against the schema — **PASS**

`emitEvidenceBlock` (`src/harness.ts`) produces:

```json
{
  "eval_runs": ["evr_…","evr_…","evr_…"],
  "thresholds": { "rca_accuracy": ">=0.85", "localization_accuracy": ">=0.9", "aggregate": ">=0.8" },
  "window": { "from": "2026-05-01T10:00:00Z", "to": "2026-05-01T10:45:00Z", "sample_size": 3 }
}
```

- `eval_runs` — one seeded id per replay run, each matching
  `^evr_[0-9A-HJKMNP-TV-Z]{26}$`, unique across the batch.
- `thresholds` — `metric -> expression`, ≥ 1 property (matches schema's
  `additionalProperties: string`, `minProperties: 1`).
- `window` — `{from, to, sample_size}`: from = window open, to = **cutoff**
  (the isolation boundary), sample_size = number of runs.

Validation (`test/evidence-block.test.ts`, `src/schema.ts`) compiles the
**committed** `autonomy-certificate.json` + `common.json` from
`packages/schemas/json/` with the spike's own ajv and validates a full
certificate carrying the emitted block: **`validate(cert) === true`**.

Negative controls confirm the validation is real, not cosmetic: an empty
`eval_runs` array is rejected (`minItems: 1`), and a malformed eval-run id is
rejected (pattern).

`window.to` is deliberately set to the **cutoff** rather than the incident close
time — the evidence window is the band the agent could actually observe.

---

## Suggested spec amendments

1. **01-schemas §4 — name the isolation boundary in `evidence.window`.** The
   schema's `window.{from,to}` does not say what `to` means for a replay-derived
   certificate. Recommend a normative note: *for eval-replay evidence, `to` is the
   incident-window cutoff (the temporal-isolation boundary), not the incident
   close time.* Otherwise two emitters can disagree on whether post-cutoff time is
   inside the evidence window.

2. **Add a `methodology` / `isolation` descriptor to the `evidence` block.** A
   certificate consumer cannot currently tell whether eval evidence came from a
   temporally-isolated replay or a live run that may have seen hindsight. Recommend
   an optional `evidence.isolation: { kind: "temporal_replay" | "live", cutoff?: timestamp }`
   so the audit trail records *how* isolation was enforced.

3. **Distinguish investigator determinism in evidence.** Stable scores from a
   deterministic stub are not equivalent to stable scores from a real model.
   Recommend an optional `evidence.sample_kind: "deterministic" | "model"` (or a
   per-run agent identity) so a `sample_size: 3` with variance 0 is not mistaken
   for model robustness. As-is, the schema would happily certify a stub.

4. **Per-metric measured values, not just thresholds.** `thresholds` records the
   gate but not the *observed* score. Recommend an optional `evidence.measurements:
   { metric -> number }` (or a link to the eval-run records) so a verifier can
   recompute pass/fail rather than trusting the issuer's claim that the threshold
   was met.

5. **`eval_runs` should resolve to retrievable records.** The schema requires
   `evr_…` ids but nothing pins them to durable, hash-addressable eval-run
   artifacts. Recommend an `EvalRun` schema (id, fixture hash, agent identity,
   grades, access-log digest) and an `AuditRecord` `ledger_ref` per run, so a
   certificate's `eval_runs` are independently verifiable — closing the loop with
   the audit ledger (IDN-001).

---

## Nothing blocked

All deliverables runnable and tested standalone. One environment note: the spike
intentionally does **not** import `packages/schemas/src/index.ts` at runtime
(that module resolves `ajv` from its own dir, which has no `node_modules` in a
standalone checkout). It loads the committed JSON schemas + the TS type directly
and compiles with its own ajv — same normative contract, self-contained.
