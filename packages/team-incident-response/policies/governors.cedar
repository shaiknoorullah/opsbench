// Cedar policies for incident-response loop governors.
//
// Evaluated by hooks/lib/governor-check.sh at round boundaries (NOT per tool call — loop::*
// actions are orchestration decisions, not tool invocations). The orchestrator/skill calls
// governor-check.sh with a LoopContext before starting a new round, dispatching collection,
// authoring finals, or executing recovery. Validated in CI against opsbench.cedarschema.
//
//   Principal : Agent::"<agent-name>" (the agent requesting the transition) or Agent::"human-operator"
//   Action    : Action::"loop::new_round" | "loop::dispatch_collection" | "loop::author_final"
//               | "loop::extend_wall_clock" | "loop::dispatch_recovery" | "recovery::execute"
//   Resource  : Incident::"<incident-id>"
//   Context   : LoopContext (see opsbench.cedarschema)
//
// NOTE: governor-check.sh is responsible for populating the FULL LoopContext and for treating
// any missing required field as DENY — the `has` guards below keep policy evaluation safe under
// strict validation, but completeness of the context is enforced by the caller.

// =============================================================================
// BASELINE — governors are FORBID-based constraints. These baseline permits let a loop
// transition proceed UNLESS one of the forbids below blocks it. Only the orchestration /
// loop-control agents may drive transitions.
// =============================================================================

permit (
    principal,
    action in [
        Action::"loop::new_round",
        Action::"loop::dispatch_collection",
        Action::"loop::dispatch_recovery",
        Action::"recovery::execute"
    ],
    resource
) when {
    [Agent::"incident-commander", Agent::"evidence-requester",
     Agent::"recovery-executor", Agent::"recovery-planner",
     Agent::"human-operator"].contains(principal)
};

// =============================================================================
// MAX ROUNDS — hard cap at 5
// =============================================================================

forbid (
    principal,
    action == Action::"loop::new_round",
    resource
) when {
    context has rounds_used && context.rounds_used >= 5
};

// =============================================================================
// 24-HOUR WALL-CLOCK CAP (cumulative)
// =============================================================================

forbid (
    principal,
    action in [Action::"loop::new_round", Action::"loop::dispatch_collection"],
    resource
) when {
    context has wall_clock_used_min && context.wall_clock_used_min >= 1440
} unless {
    context has human_extension_granted && context.human_extension_granted == true
};

// Permit human-granted extension up to +24h (recorded in timeline).
permit (
    principal == Agent::"human-operator",
    action == Action::"loop::extend_wall_clock",
    resource
) when {
    context has extension_minutes && context.extension_minutes <= 1440
};

// =============================================================================
// PER-ROUND ARTIFACT BUDGETS (decreasing — forces convergence)
// =============================================================================

// Round 2: <= 50 new artifacts
forbid (
    principal,
    action == Action::"loop::dispatch_collection",
    resource
) when {
    context has requesting_round && context.requesting_round == 2 &&
    context has artifact_count_requested && context.artifact_count_requested > 50
};

// Round 3: <= 25 new artifacts
forbid (
    principal,
    action == Action::"loop::dispatch_collection",
    resource
) when {
    context has requesting_round && context.requesting_round == 3 &&
    context has artifact_count_requested && context.artifact_count_requested > 25
};

// Round 4: <= 12 new artifacts
forbid (
    principal,
    action == Action::"loop::dispatch_collection",
    resource
) when {
    context has requesting_round && context.requesting_round == 4 &&
    context has artifact_count_requested && context.artifact_count_requested > 12
};

// Round 5: <= 6 new artifacts (final round — sniper, not shotgun)
forbid (
    principal,
    action == Action::"loop::dispatch_collection",
    resource
) when {
    context has requesting_round && context.requesting_round == 5 &&
    context has artifact_count_requested && context.artifact_count_requested > 6
};

// =============================================================================
// CONVERGENCE CHECK — new round must serve a NEW hypothesis or close a gap
// =============================================================================

forbid (
    principal,
    action == Action::"loop::new_round",
    resource
) when {
    context has requesting_round && context.requesting_round >= 3 &&
    context has new_hypotheses_this_round && context.new_hypotheses_this_round == false &&
    context has evidence_gaps_count && context.evidence_gaps_count == 0
};

// =============================================================================
// FALSIFICATION REQUIREMENT — round 2+ must include falsification artifacts
// =============================================================================

forbid (
    principal,
    action == Action::"loop::dispatch_collection",
    resource
) when {
    context has requesting_round && context.requesting_round >= 2 &&
    context has falsification_artifacts_requested && context.falsification_artifacts_requested == 0
};

// =============================================================================
// HUMAN APPROVAL — required at every round boundary >= 2
// =============================================================================

forbid (
    principal,
    action == Action::"loop::dispatch_collection",
    resource
) when {
    context has requesting_round && context.requesting_round >= 2
} unless {
    context has human_approval_recorded && context.human_approval_recorded == true
};

// =============================================================================
// FINAL AUTHORING — only after ROOT_CAUSE_CONFIRMED verdict + clean reviews
// =============================================================================

permit (
    principal,
    action == Action::"loop::author_final",
    resource
) when {
    [Agent::"rca-author", Agent::"incident-report-author",
     Agent::"investigation-report-author", Agent::"mitigations-author"].contains(principal) &&
    context has verdict_status && context.verdict_status == "ROOT_CAUSE_CONFIRMED" &&
    context has tone_review_passed && context.tone_review_passed == true &&
    context has citation_check_passed && context.citation_check_passed == true &&
    context has schema_validation_passed && context.schema_validation_passed == true
};

forbid (
    principal,
    action == Action::"loop::author_final",
    resource
) unless {
    (context has verdict_status && context.verdict_status == "ROOT_CAUSE_CONFIRMED") ||
    (context has verdict_status && context.verdict_status == "INCONCLUSIVE" &&
     context has human_approval && context.human_approval == true)
};

// =============================================================================
// RECOVERY GATE — no recovery before confirmed root cause OR explicit override
// =============================================================================

forbid (
    principal,
    action in [Action::"loop::dispatch_recovery", Action::"recovery::execute"],
    resource
) unless {
    (context has verdict_status && context.verdict_status == "ROOT_CAUSE_CONFIRMED") ||
    (context has human_override_recorded && context.human_override_recorded == true &&
     context has human_override_actor && context.human_override_actor != "")
};

// =============================================================================
// STALENESS — request expires after staleness_deadline_utc
// =============================================================================

forbid (
    principal,
    action == Action::"loop::dispatch_collection",
    resource
) when {
    context has now_utc && context has staleness_deadline_utc &&
    context.now_utc > context.staleness_deadline_utc
};
