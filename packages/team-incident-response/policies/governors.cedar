// Cedar policies for incident-response loop governors.
//
// Evaluated by governor-enforcer before allowing a new round to begin OR before
// allowing evidence-collection-orchestrator to dispatch collectors for a new
// round. Context carries rounds_used, wall_clock_used_min, artifact_count, etc.
//
// Principal: User::"evidence-requester" or User::"governor-enforcer"
// Action:    Action::"loop::new_round", Action::"loop::dispatch_collection",
//            Action::"loop::author_final", Action::"loop::extend_wall_clock"
// Resource:  Resource::"incident::<incident_id>"

// =============================================================================
// MAX ROUNDS — hard cap at 5
// =============================================================================

forbid (
    principal,
    action == Action::"loop::new_round",
    resource
) when {
    context.rounds_used >= 5
};

// =============================================================================
// 24-HOUR WALL-CLOCK CAP (cumulative)
// =============================================================================

forbid (
    principal,
    action in [Action::"loop::new_round", Action::"loop::dispatch_collection"],
    resource
) when {
    context.wall_clock_used_min >= 1440
} unless {
    context.human_extension_granted == true
};

// Permit human-granted extension up to +24h (recorded in timeline)
permit (
    principal == User::"human-operator",
    action == Action::"loop::extend_wall_clock",
    resource
) when {
    context.extension_minutes <= 1440
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
    context.requesting_round == 2 &&
    context.artifact_count_requested > 50
};

// Round 3: <= 25 new artifacts
forbid (
    principal,
    action == Action::"loop::dispatch_collection",
    resource
) when {
    context.requesting_round == 3 &&
    context.artifact_count_requested > 25
};

// Round 4: <= 12 new artifacts
forbid (
    principal,
    action == Action::"loop::dispatch_collection",
    resource
) when {
    context.requesting_round == 4 &&
    context.artifact_count_requested > 12
};

// Round 5: <= 6 new artifacts (final round — sniper, not shotgun)
forbid (
    principal,
    action == Action::"loop::dispatch_collection",
    resource
) when {
    context.requesting_round == 5 &&
    context.artifact_count_requested > 6
};

// =============================================================================
// CONVERGENCE CHECK — new round must serve a NEW hypothesis or close a gap
// =============================================================================

forbid (
    principal,
    action == Action::"loop::new_round",
    resource
) when {
    context.requesting_round >= 3 &&
    context.new_hypotheses_this_round == false &&
    context.evidence_gaps_count == 0
};

// =============================================================================
// FALSIFICATION REQUIREMENT — round 2+ must include falsification artifacts
// =============================================================================

forbid (
    principal,
    action == Action::"loop::dispatch_collection",
    resource
) when {
    context.requesting_round >= 2 &&
    context.falsification_artifacts_requested == 0
};

// =============================================================================
// HUMAN APPROVAL — required at every round boundary >= 2
// =============================================================================

forbid (
    principal,
    action == Action::"loop::dispatch_collection",
    resource
) when {
    context.requesting_round >= 2 &&
    context.human_approval_recorded == false
};

// =============================================================================
// FINAL AUTHORING — only after ROOT_CAUSE_CONFIRMED verdict
// =============================================================================

permit (
    principal in [
        User::"rca-author",
        User::"incident-report-author",
        User::"mitigation-author"
    ],
    action == Action::"loop::author_final",
    resource
) when {
    context.verdict_status == "ROOT_CAUSE_CONFIRMED" &&
    context.tone_review_passed == true &&
    context.citation_check_passed == true &&
    context.schema_validation_passed == true
};

forbid (
    principal,
    action == Action::"loop::author_final",
    resource
) unless {
    context.verdict_status == "ROOT_CAUSE_CONFIRMED" ||
    (context.verdict_status == "INCONCLUSIVE" && context.human_approval == true)
};

// =============================================================================
// RECOVERY GATE — no recovery before confirmed root cause OR explicit override
// =============================================================================

forbid (
    principal,
    action in [Action::"loop::dispatch_recovery", Action::"recovery::execute"],
    resource
) unless {
    context.verdict_status == "ROOT_CAUSE_CONFIRMED" ||
    (context.human_override_recorded == true && context.human_override_actor != "")
};

// =============================================================================
// STALENESS — request expires after staleness_deadline_utc
// =============================================================================

forbid (
    principal,
    action == Action::"loop::dispatch_collection",
    resource
) when {
    context.now_utc > context.staleness_deadline_utc
};
