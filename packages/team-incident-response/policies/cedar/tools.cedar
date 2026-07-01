// Cedar policy bundle — tool authorization for the 33 team-incident-response subagents.
//
// Evaluated by hooks/pre-tool-use.sh on every tool invocation. Default is DENY; every
// allow rule is scoped to a specific agent, action, and resource shape. Validated in CI
// against policies/cedar/opsbench.cedarschema.
//
// Canonical model (see opsbench.cedarschema):
//   Principal : Agent::"<agent-name>"   one of the 33 subagents (real `name:` frontmatter), or
//                                        Agent::"human-operator"
//   Action    : Action::"<ns>::<verb>"  e.g. Action::"k8s::scale", Action::"FS::append"
//   Resource  : Resource::"<tool|path>" with optional attrs: path, namespace, read_only,
//                                        command_class, exec_user, repo, node_role
//   Context   : human_approval (Bool), verdict_status (String), recovery_step_id/_risk, ...
//
// Cedar scope note: the `in` scope operator takes a SINGLE entity/group, so rules that apply
// to several agents are written `principal,` (unconstrained) + `when { [..].contains(principal) }`.
//
// IMPORTANT: every access to an OPTIONAL attribute is guarded with `has` so that an absent
// attribute makes the rule fail safe (permit does not apply -> default deny; forbid still
// fires) instead of erroring and being skipped. Mutating actions on production resources
// require human_approval; recovery additionally requires a CONFIRMED verdict.

// =============================================================================
// TEAM 1 — COMMAND (incident-commander, quarantine-coordinator, timeline-keeper)
// =============================================================================

// incident-commander: read-only orchestration + dispatch of subagents. No mutations.
permit (
    principal == Agent::"incident-commander",
    action in [
        Action::"agent::dispatch",
        Action::"k8s::get",
        Action::"k8s::list",
        Action::"k8s::describe",
        Action::"Bash::read",
        Action::"FS::read",
        Action::"FS::write"
    ],
    resource
);

// timeline-keeper: append-only to timeline.md / custody.log inside incident dirs.
permit (
    principal == Agent::"timeline-keeper",
    action in [Action::"FS::read", Action::"FS::append"],
    resource
) when {
    resource has path && (
        resource.path like "*/incident-*/timeline.md" ||
        resource.path like "*/incident-*/custody.log" ||
        resource.path like "*/INC-*/timeline.md"      ||
        resource.path like "*/INC-*/custody.log"
    )
};

// timeline-keeper: NEVER overwrite or delete the timeline/custody ledger.
forbid (
    principal == Agent::"timeline-keeper",
    action in [Action::"FS::write", Action::"FS::delete"],
    resource
);

// quarantine-coordinator: CONTAINMENT mutations (scale-to-0, delete Service, default-deny
// NetworkPolicy). Allowed pre-verdict (containment precedes root-cause), but only with
// recorded human approval. Destructive node/volume ops are NOT granted here.
permit (
    principal == Agent::"quarantine-coordinator",
    action in [
        Action::"k8s::get", Action::"k8s::list", Action::"k8s::describe",
        Action::"k8s::scale", Action::"k8s::patch", Action::"k8s::create",
        Action::"k8s::apply", Action::"k8s::delete",
        Action::"FS::read", Action::"FS::write"
    ],
    resource
) when {
    context has human_approval && context.human_approval == true
};

// =============================================================================
// TEAM 2 — EVIDENCE COLLECTION (source-discoverer + 6 collectors) — READ ONLY
// =============================================================================

// Every collector may read/write ONLY inside the round evidence tree + the plan.
permit (
    principal,
    action in [Action::"FS::read", Action::"FS::write", Action::"FS::sha256"],
    resource
) when {
    [Agent::"evidence-source-discoverer", Agent::"app-layer-collector",
     Agent::"controlplane-collector", Agent::"network-collector", Agent::"node-collector",
     Agent::"observability-collector", Agent::"storage-collector"].contains(principal) &&
    resource has path && (
        resource.path like "*/round-*/evidence/*" ||
        resource.path like "*/round-*/collection-plan.yaml" ||
        resource.path like "*/round-*/manifest.sha256"
    )
};

// No collector may EVER mutate the cluster, nodes, or databases.
forbid (
    principal,
    action in [
        Action::"k8s::create", Action::"k8s::patch", Action::"k8s::delete",
        Action::"k8s::exec", Action::"k8s::scale", Action::"k8s::apply",
        Action::"Bash::ssh::exec",
        Action::"postgres::query::write", Action::"clickhouse::query::write",
        Action::"longhorn::salvage", Action::"longhorn::detach",
        Action::"longhorn::delete-volume", Action::"longhorn::delete-replica"
    ],
    resource
) when {
    [Agent::"evidence-source-discoverer", Agent::"app-layer-collector",
     Agent::"controlplane-collector", Agent::"network-collector", Agent::"node-collector",
     Agent::"observability-collector", Agent::"storage-collector"].contains(principal)
};

// evidence-source-discoverer: broad read-only reconnaissance across all source families.
permit (
    principal == Agent::"evidence-source-discoverer",
    action in [
        Action::"k8s::get", Action::"k8s::list", Action::"k8s::describe",
        Action::"prometheus::query", Action::"loki::query",
        Action::"clickhouse::query::readonly", Action::"postgres::query::readonly",
        Action::"azure::list", Action::"azure::describe",
        Action::"aws::describe", Action::"contabo::list", Action::"ovh::describe",
        Action::"Bash::ssh::readonly", Action::"Bash::read"
    ],
    resource
);

// controlplane-collector: read kube-apiserver / etcd / audit log.
permit (
    principal == Agent::"controlplane-collector",
    action in [
        Action::"k8s::get", Action::"k8s::list", Action::"k8s::describe",
        Action::"k8s::logs", Action::"k8s::events", Action::"k8s::audit-log",
        Action::"Bash::read"
    ],
    resource
);

// node-collector / network-collector: read-only SSH on nodes, restricted command classes.
permit (
    principal,
    action in [Action::"Bash::ssh::readonly", Action::"k8s::get", Action::"k8s::list", Action::"Bash::read"],
    resource
) when {
    [Agent::"node-collector", Agent::"network-collector"].contains(principal) &&
    resource has command_class &&
    [
        "journalctl", "dmesg", "ip", "ss", "iptables-save",
        "ethtool", "iostat", "vmstat", "ps", "lsof", "free", "df", "mount"
    ].contains(resource.command_class)
};

// observability-collector: read-only Prometheus / Loki / Tempo / OTel + Falco events.
permit (
    principal == Agent::"observability-collector",
    action in [
        Action::"prometheus::query", Action::"prometheus::query_range",
        Action::"loki::query", Action::"loki::query_range",
        Action::"tempo::search", Action::"tempo::trace", Action::"otel::query",
        Action::"falco::events"
    ],
    resource
);

// storage-collector: read Longhorn CRDs / Ceph status / k8s storage objects + ssh read.
permit (
    principal == Agent::"storage-collector",
    action in [
        Action::"k8s::get", Action::"k8s::list", Action::"k8s::describe",
        Action::"longhorn::backup-status", Action::"longhorn::replica-list",
        Action::"longhorn::volume-status", Action::"ceph::status",
        Action::"Bash::ssh::readonly"
    ],
    resource
);

// app-layer-collector: read pg_stat_* / ClickHouse system tables / redis info (read-only).
permit (
    principal == Agent::"app-layer-collector",
    action in [
        Action::"postgres::query::readonly", Action::"clickhouse::query::readonly",
        Action::"redis::info", Action::"k8s::exec::readonly",
        Action::"k8s::get", Action::"k8s::logs"
    ],
    resource
);

// =============================================================================
// TEAM 3 — CATALOGING (evidence-cataloger, evidence-witness)
// =============================================================================

// evidence-cataloger: compute sha256, write manifest + catalog + bundle hash.
permit (
    principal == Agent::"evidence-cataloger",
    action in [Action::"FS::read", Action::"FS::sha256", Action::"FS::write", Action::"FS::append"],
    resource
) when {
    resource has path && (
        resource.path like "*/round-*/manifest.sha256"    ||
        resource.path like "*/round-*/catalog.md"         ||
        resource.path like "*/round-*/bundle.sha256.txt"  ||
        resource.path like "*/round-*/evidence/*"         ||
        resource.path like "*/custody.log"
    )
};

// evidence-cataloger: never delete sealed evidence.
forbid (
    principal == Agent::"evidence-cataloger",
    action == Action::"FS::delete",
    resource
);

// evidence-witness: independent witness — sha256 + RFC 3161 timestamp + git push to the
// dedicated witness repo only.
permit (
    principal == Agent::"evidence-witness",
    action in [
        Action::"FS::read", Action::"FS::write", Action::"FS::sha256",
        Action::"rfc3161::timestamp", Action::"git::commit", Action::"git::push"
    ],
    resource
) when {
    (resource has path && resource.path like "*/round-*/bundle.sha256.txt*") ||
    (resource has repo && resource.repo == "incident-witness")
};

// =============================================================================
// TEAM 4 — ANALYSIS (hypothesis-generator, 4 verdict-blind investigators, synthesizer)
// =============================================================================

// hypothesis-generator: READ evidence + hypotheses, WRITE the ranked hypothesis list only.
permit (
    principal == Agent::"hypothesis-generator",
    action == Action::"FS::read",
    resource
) when {
    resource has path && (
        resource.path like "*/round-*/hypotheses/*" ||
        resource.path like "*/round-*/evidence/*"
    )
};

permit (
    principal == Agent::"hypothesis-generator",
    action == Action::"FS::write",
    resource
) when {
    resource has path && resource.path like "*/round-*/hypotheses/*"
};

// verdict-blind investigators: READ evidence (immutable) + their own hypothesis dir; WRITE
// their own hypothesis verdict ONLY — never the evidence. No cluster access whatsoever
// (belt-and-suspenders to the front-matter tool restriction).
permit (
    principal,
    action == Action::"FS::read",
    resource
) when {
    [Agent::"hypothesis-storage", Agent::"hypothesis-network",
     Agent::"hypothesis-control-plane", Agent::"hypothesis-app"].contains(principal) &&
    resource has path && (
        resource.path like "*/round-*/hypotheses/*" ||
        resource.path like "*/round-*/evidence/*"
    )
};

permit (
    principal,
    action == Action::"FS::write",
    resource
) when {
    [Agent::"hypothesis-storage", Agent::"hypothesis-network",
     Agent::"hypothesis-control-plane", Agent::"hypothesis-app"].contains(principal) &&
    resource has path && (
        resource.path like "*/round-*/hypotheses/*.md" ||
        resource.path like "*/round-*/hypotheses/*.json"
    )
};

forbid (
    principal,
    action in [
        Action::"k8s::create", Action::"k8s::patch", Action::"k8s::delete",
        Action::"k8s::exec", Action::"k8s::scale", Action::"k8s::apply",
        Action::"Bash::ssh::exec",
        Action::"postgres::query::write", Action::"clickhouse::query::write"
    ],
    resource
) when {
    [Agent::"hypothesis-storage", Agent::"hypothesis-network",
     Agent::"hypothesis-control-plane", Agent::"hypothesis-app",
     Agent::"hypothesis-generator"].contains(principal)
};

// forensic-synthesizer: READ all round-N artifacts, WRITE the round verdict + synthesis only.
permit (
    principal == Agent::"forensic-synthesizer",
    action == Action::"FS::read",
    resource
) when {
    resource has path && (
        resource.path like "*/round-*/verdict.md"     ||
        resource.path like "*/round-*/synthesis.md"   ||
        resource.path like "*/round-*/hypotheses/*"   ||
        resource.path like "*/round-*/evidence/*"
    )
};

permit (
    principal == Agent::"forensic-synthesizer",
    action == Action::"FS::write",
    resource
) when {
    resource has path && (
        resource.path like "*/round-*/verdict.md" ||
        resource.path like "*/round-*/synthesis.md"
    )
};

// =============================================================================
// TEAM 5 — ENFORCEMENT (schema-validator, tone-reviewer, citation-checker, redaction)
// =============================================================================

// Reviewers: read everything in the incident dir, write critiques/validation results.
permit (
    principal,
    action in [Action::"FS::read", Action::"FS::write", Action::"FS::sha256"],
    resource
) when {
    [Agent::"schema-validator", Agent::"tone-reviewer",
     Agent::"evidence-citation-checker", Agent::"redaction-checker"].contains(principal) &&
    resource has path && (
        resource.path like "*/incident-*/*" ||
        resource.path like "*/INC-*/*"      ||
        resource.path like "*/.validation/*"
    )
};

// Reviewers may never delete, touch the cluster, or exec on nodes.
forbid (
    principal,
    action in [
        Action::"FS::delete",
        Action::"k8s::exec", Action::"k8s::scale", Action::"k8s::patch",
        Action::"k8s::delete", Action::"Bash::ssh::exec"
    ],
    resource
) when {
    [Agent::"schema-validator", Agent::"tone-reviewer",
     Agent::"evidence-citation-checker", Agent::"redaction-checker"].contains(principal)
};

// =============================================================================
// TEAM 6 — AUTHORING (rca / incident-report / investigation-report / mitigations / comms)
// =============================================================================

// Report authors: READ evidence + verdict, WRITE their final artifact only (never evidence).
permit (
    principal,
    action == Action::"FS::read",
    resource
) when {
    [Agent::"rca-author", Agent::"incident-report-author",
     Agent::"investigation-report-author", Agent::"mitigations-author"].contains(principal) &&
    resource has path && (
        resource.path like "*/final/*"            ||
        resource.path like "*/round-*/verdict.md"  ||
        resource.path like "*/round-*/evidence/*"
    )
};

permit (
    principal,
    action == Action::"FS::write",
    resource
) when {
    [Agent::"rca-author", Agent::"incident-report-author",
     Agent::"investigation-report-author", Agent::"mitigations-author"].contains(principal) &&
    resource has path && resource.path like "*/final/*"
};

// Final artifacts may not be authored until the root cause is CONFIRMED (or a human override
// is recorded). Mirrors governors.cedar `loop::author_final`.
forbid (
    principal,
    action == Action::"FS::write",
    resource
) when {
    [Agent::"rca-author", Agent::"incident-report-author",
     Agent::"investigation-report-author", Agent::"mitigations-author"].contains(principal) &&
    resource has path && resource.path like "*/final/*"
} unless {
    (context has verdict_status && context.verdict_status == "ROOT_CAUSE_CONFIRMED") ||
    (context has human_approval && context.human_approval == true)
};

// customer-comms-author: write DRAFT comms only; never send to any external channel.
permit (
    principal == Agent::"customer-comms-author",
    action in [Action::"FS::read", Action::"FS::write"],
    resource
) when {
    resource has path && (
        resource.path like "*/comms/draft-*.md" ||
        resource.path like "*/final/*comms*"
    )
};

forbid (
    principal == Agent::"customer-comms-author",
    action in [Action::"slack::post", Action::"email::send", Action::"statuspage::publish"],
    resource
);

// =============================================================================
// TEAM 7 — RECOVERY (recovery-planner, recovery-executor, recovery-verifier)
// =============================================================================

// recovery-planner: read verdict, write the recovery plan — NO mutations.
permit (
    principal == Agent::"recovery-planner",
    action in [Action::"FS::read", Action::"FS::write"],
    resource
) when {
    resource has path && (
        resource.path like "*/recovery/plan.json" ||
        resource.path like "*/recovery/plan.md"   ||
        resource.path like "*/round-*/verdict.md"
    )
};

forbid (
    principal == Agent::"recovery-planner",
    action in [
        Action::"k8s::create", Action::"k8s::patch", Action::"k8s::delete",
        Action::"k8s::scale", Action::"k8s::apply", Action::"Bash::ssh::exec",
        Action::"postgres::query::write"
    ],
    resource
);

// recovery-executor: GATED mutation authority. Non-destructive recovery requires a CONFIRMED
// verdict + human approval + a recovery step id.
permit (
    principal == Agent::"recovery-executor",
    action in [
        Action::"k8s::scale", Action::"k8s::patch", Action::"k8s::create",
        Action::"k8s::apply", Action::"Bash::ssh::exec",
        Action::"postgres::query::write",
        Action::"longhorn::salvage", Action::"longhorn::detach", Action::"longhorn::reattach"
    ],
    resource
) when {
    context has human_approval   && context.human_approval == true &&
    context has verdict_status   && context.verdict_status == "ROOT_CAUSE_CONFIRMED" &&
    context has recovery_step_id && context.recovery_step_id like "S*"
};

// recovery-executor: DESTRUCTIVE recovery authority — additionally requires the step to be
// explicitly classified and approved as destructive.
permit (
    principal == Agent::"recovery-executor",
    action in [
        Action::"k8s::delete",
        Action::"longhorn::delete-volume", Action::"longhorn::delete-replica",
        Action::"postgres::truncate", Action::"postgres::drop"
    ],
    resource
) when {
    context has human_approval     && context.human_approval == true &&
    context has verdict_status     && context.verdict_status == "ROOT_CAUSE_CONFIRMED" &&
    context has recovery_step_risk && context.recovery_step_risk == "destructive" &&
    context has recovery_step_id   && context.recovery_step_id like "S*"
};

// recovery-executor: destructive actions are forbidden unless EXPLICITLY approved as a
// destructive step (defense-in-depth on top of the permit above).
forbid (
    principal == Agent::"recovery-executor",
    action in [
        Action::"k8s::delete",
        Action::"longhorn::delete-volume", Action::"longhorn::delete-replica",
        Action::"postgres::truncate", Action::"postgres::drop"
    ],
    resource
) unless {
    context has human_approval && context.human_approval == true &&
    context has recovery_step_risk && context.recovery_step_risk == "destructive" &&
    context has verdict_status && context.verdict_status == "ROOT_CAUSE_CONFIRMED"
};

// recovery-verifier: read-only post-recovery checks.
permit (
    principal == Agent::"recovery-verifier",
    action in [
        Action::"k8s::get", Action::"k8s::list", Action::"k8s::logs",
        Action::"prometheus::query", Action::"loki::query",
        Action::"postgres::query::readonly", Action::"clickhouse::query::readonly",
        Action::"FS::read", Action::"FS::write"
    ],
    resource
);

// =============================================================================
// TEAM 8 — LOOP CONTROL (evidence-requester, verdict-arbiter, human-escalation)
// =============================================================================

// evidence-requester: read prior verdict, write the next-round request.
permit (
    principal == Agent::"evidence-requester",
    action in [Action::"FS::read", Action::"FS::write"],
    resource
) when {
    resource has path && (
        resource.path like "*/round-*/request.md"   ||
        resource.path like "*/round-*/request.json" ||
        resource.path like "*/round-*/verdict.md"
    )
};

// verdict-arbiter: most-restricted — read verdict + governor state, write arbiter decision
// only. Verdict-blind reads are additionally restricted by verdict-arbiter front-matter.
permit (
    principal == Agent::"verdict-arbiter",
    action == Action::"FS::read",
    resource
);

permit (
    principal == Agent::"verdict-arbiter",
    action == Action::"FS::write",
    resource
) when {
    resource has path && resource.path like "*/round-*/arbiter-decision.json"
};

// human-escalation: read incident state, write escalation records, and notify humans via
// external channels (this is the ONLY agent permitted to page/notify).
permit (
    principal == Agent::"human-escalation",
    action in [
        Action::"FS::read", Action::"FS::append", Action::"FS::write",
        Action::"slack::post", Action::"email::send", Action::"pagerduty::trigger",
        Action::"linear::create"
    ],
    resource
);

// =============================================================================
// HUMAN OPERATOR — full authority, audited via timeline + ledger
// =============================================================================

permit (
    principal == Agent::"human-operator",
    action,
    resource
);

// =============================================================================
// GLOBAL FORBIDS — apply to every principal except where explicitly overridden
// =============================================================================

// No agent may push to a git remote without human approval — except the witness pushing to
// the dedicated witness repo.
forbid (
    principal,
    action == Action::"git::push",
    resource
) unless {
    principal == Agent::"human-operator" ||
    (principal == Agent::"evidence-witness" && resource has repo && resource.repo == "incident-witness") ||
    (context has human_approval && context.human_approval == true)
};

// No agent may exec into a pod in a protected namespace as root.
forbid (
    principal,
    action in [Action::"k8s::exec", Action::"k8s::exec::readonly"],
    resource
) when {
    resource has namespace &&
    ["pnats", "pnats-data", "kube-system", "longhorn-system", "calico-system"].contains(resource.namespace) &&
    resource has exec_user && resource.exec_user == "root"
} unless {
    principal == Agent::"human-operator"
};

// No agent may modify Cedar policies, hooks, the constitution, or schemas at runtime.
// Self-protection: the governance layer cannot be edited by the agents it governs.
forbid (
    principal,
    action in [Action::"FS::write", Action::"FS::append", Action::"FS::delete"],
    resource
) when {
    resource has path && (
        resource.path like "*/policies/cedar/*.cedar"       ||
        resource.path like "*/policies/cedar/*.cedarschema" ||
        resource.path like "*/policies/constitution.md"     ||
        resource.path like "*/hooks/*.sh"                   ||
        resource.path like "*/schemas/*.schema.json"
    )
} unless {
    principal == Agent::"human-operator"
};
