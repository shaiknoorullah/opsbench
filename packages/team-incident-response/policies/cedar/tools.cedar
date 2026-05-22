// Cedar policy bundle — tool authorization for the 33 k8s-incident-response subagents.
//
// Evaluated by hooks/pre-tool-use.sh on every tool invocation. Default is deny;
// every allow rule is scoped to a specific agent, action, and resource shape.
//
// Principal:   User::"<agent-name>" (one of the 33 subagents) or User::"human-operator"
// Action:      Action::"<tool>::<verb>" (e.g., Action::"k8s::scale", Action::"Bash::ssh")
// Resource:    Resource::"<type>::<id>" or Resource::"k8s::<kind>::<namespace>::<name>"
// Context:     human_approval (bool), incident_round (int), incident_phase (string),
//              verdict_status (string), tone_review_passed (bool)
//
// All write-mode actions on production resources require human_approval=true.

// =============================================================================
// TEAM 1 — COMMAND (incident-commander, scribe, comms-drafter, role-assigner)
// =============================================================================

// incident-commander: read-only orchestration, no mutations
permit (
    principal == User::"incident-commander",
    action in [
        Action::"k8s::get",
        Action::"k8s::list",
        Action::"k8s::describe",
        Action::"Bash::read",
        Action::"FS::read"
    ],
    resource
);

// scribe: append-only writes to timeline.md and custody.log inside incident dirs
permit (
    principal == User::"scribe",
    action == Action::"FS::append",
    resource
) when {
    resource.path like "*/incident-*/timeline.md" ||
    resource.path like "*/incident-*/custody.log" ||
    resource.path like "*/INC-*/timeline.md" ||
    resource.path like "*/INC-*/custody.log"
};

// scribe: NEVER overwrite or delete
forbid (
    principal == User::"scribe",
    action in [Action::"FS::write", Action::"FS::delete", Action::"FS::truncate"],
    resource
);

// comms-drafter: write drafts only, never send
permit (
    principal == User::"comms-drafter",
    action == Action::"FS::write",
    resource
) when {
    resource.path like "*/comms/draft-*.md"
};

forbid (
    principal == User::"comms-drafter",
    action in [Action::"slack::post", Action::"email::send", Action::"statuspage::publish"],
    resource
);

// role-assigner: append-only to timeline.md with category=ROLE_ASSIGNED
permit (
    principal == User::"role-assigner",
    action == Action::"FS::append",
    resource
) when {
    resource.path like "*/timeline.md"
};

// =============================================================================
// TEAM 2 — EVIDENCE COLLECTION (8 collectors + orchestrator + source-discoverer)
// =============================================================================

// evidence-source-discoverer: read-only across all source families
permit (
    principal == User::"evidence-source-discoverer",
    action in [
        Action::"k8s::get",
        Action::"k8s::list",
        Action::"prometheus::query",
        Action::"loki::query",
        Action::"clickhouse::query::readonly",
        Action::"azure::list",
        Action::"aws::describe",
        Action::"Bash::ssh::readonly"
    ],
    resource
);

forbid (
    principal == User::"evidence-source-discoverer",
    action in [
        Action::"k8s::create", Action::"k8s::patch", Action::"k8s::delete",
        Action::"k8s::exec", Action::"k8s::scale",
        Action::"FS::write::node", Action::"Bash::ssh::exec"
    ],
    resource
);

// collector-control-plane: read kube-apiserver, etcd snapshots
permit (
    principal == User::"collector-control-plane",
    action in [
        Action::"k8s::get",
        Action::"k8s::list",
        Action::"k8s::describe",
        Action::"k8s::logs",
        Action::"k8s::events"
    ],
    resource
);

// collector-nodes-network: SSH read commands on cluster nodes
permit (
    principal == User::"collector-nodes-network",
    action == Action::"Bash::ssh::readonly",
    resource
) when {
    resource.node_role in ["worker", "control-plane"] &&
    resource.command_class in ["journalctl", "dmesg", "ip", "ss", "iptables-save", "ethtool", "iostat", "vmstat", "ps", "lsof"]
};

forbid (
    principal == User::"collector-nodes-network",
    action == Action::"Bash::ssh::readonly",
    resource
) when {
    resource.command_class in ["rm", "dd", "mkfs", "iptables-restore", "systemctl-restart", "kill"]
};

// collector-observability: read-only Prometheus / Loki / Tempo / OTel
permit (
    principal == User::"collector-observability",
    action in [
        Action::"prometheus::query",
        Action::"prometheus::query_range",
        Action::"loki::query",
        Action::"loki::query_range",
        Action::"tempo::search",
        Action::"tempo::trace",
        Action::"otel::query"
    ],
    resource
);

// collector-storage: read Longhorn CRDs, Ceph status, iostat
permit (
    principal == User::"collector-storage",
    action in [
        Action::"k8s::get",
        Action::"k8s::list",
        Action::"longhorn::backup-status",
        Action::"longhorn::replica-list",
        Action::"longhorn::volume-status",
        Action::"ceph::status",
        Action::"Bash::ssh::readonly"
    ],
    resource
) when {
    resource.read_only == true
};

// collector-app-layer: read pg_stat_*, ClickHouse system tables (read-only)
permit (
    principal == User::"collector-app-layer",
    action in [
        Action::"postgres::query::readonly",
        Action::"clickhouse::query::readonly",
        Action::"redis::info",
        Action::"k8s::exec::readonly"
    ],
    resource
);

forbid (
    principal == User::"collector-app-layer",
    action in [
        Action::"postgres::query::write",
        Action::"postgres::pg_terminate_backend",
        Action::"clickhouse::query::write",
        Action::"clickhouse::truncate"
    ],
    resource
);

// collector-security: read Falco events, audit logs, IAM
permit (
    principal == User::"collector-security",
    action in [
        Action::"falco::events",
        Action::"k8s::audit-log",
        Action::"azure::audit-log",
        Action::"aws::cloudtrail::lookup"
    ],
    resource
);

// collector-platform: read cloud provider APIs (Azure, Contabo, AWS, OVH)
permit (
    principal == User::"collector-platform",
    action in [
        Action::"azure::list",
        Action::"azure::describe",
        Action::"aws::describe",
        Action::"contabo::list",
        Action::"contabo::describe",
        Action::"ovh::describe"
    ],
    resource
);

// evidence-collection-orchestrator: read-only itself, dispatches collectors
permit (
    principal == User::"evidence-collection-orchestrator",
    action in [
        Action::"agent::dispatch",
        Action::"FS::write",
        Action::"FS::read",
        Action::"FS::list"
    ],
    resource
) when {
    resource.path like "*/round-*/evidence/*" ||
    resource.path like "*/round-*/collection-plan.yaml"
};

// =============================================================================
// TEAM 3 — CATALOGING (cataloger, custody-attester, manifest-sealer)
// =============================================================================

// evidence-cataloger: compute sha256, write manifest, write catalog.md
permit (
    principal == User::"evidence-cataloger",
    action in [
        Action::"FS::read",
        Action::"FS::sha256",
        Action::"FS::write"
    ],
    resource
) when {
    resource.path like "*/round-*/manifest.sha256" ||
    resource.path like "*/round-*/catalog.md" ||
    resource.path like "*/round-*/bundle.sha256.txt"
};

// custody-attester: append-only to custody.log
permit (
    principal == User::"custody-attester",
    action == Action::"FS::append",
    resource
) when {
    resource.path like "*/custody.log"
};

forbid (
    principal == User::"custody-attester",
    action in [Action::"FS::write", Action::"FS::delete"],
    resource
) when {
    resource.path like "*/custody.log"
};

// manifest-sealer: optional RFC 3161 timestamp + git witness push
permit (
    principal == User::"manifest-sealer",
    action in [
        Action::"FS::read",
        Action::"FS::write",
        Action::"rfc3161::timestamp",
        Action::"git::commit",
        Action::"git::push"
    ],
    resource
) when {
    resource.path like "*/round-*/bundle.sha256.txt.tsr" ||
    resource.repo == "incident-witness"
};

// =============================================================================
// TEAM 4 — ANALYSIS (hypothesis-* agents x N, synthesizer, arbiter)
// =============================================================================

// hypothesis-* agents: read evidence files only, no cluster access
permit (
    principal in [
        User::"hypothesis-storage",
        User::"hypothesis-network",
        User::"hypothesis-cpu-overcommit",
        User::"hypothesis-app-logic",
        User::"hypothesis-platform-change",
        User::"hypothesis-security",
        User::"hypothesis-config-drift"
    ],
    action in [
        Action::"FS::read",
        Action::"FS::write"
    ],
    resource
) when {
    resource.path like "*/round-*/hypotheses/*.md" ||
    resource.path like "*/round-*/hypotheses/*.json" ||
    (resource.path like "*/round-*/evidence/*" && resource.read_only == true)
};

forbid (
    principal in [
        User::"hypothesis-storage",
        User::"hypothesis-network",
        User::"hypothesis-cpu-overcommit",
        User::"hypothesis-app-logic",
        User::"hypothesis-platform-change",
        User::"hypothesis-security",
        User::"hypothesis-config-drift"
    ],
    action in [
        Action::"k8s::create", Action::"k8s::patch", Action::"k8s::delete",
        Action::"k8s::exec", Action::"k8s::scale",
        Action::"Bash::ssh::exec",
        Action::"postgres::query::write", Action::"clickhouse::query::write"
    ],
    resource
);

// forensic-synthesizer: read all round-N artifacts, write verdict.md
permit (
    principal == User::"forensic-synthesizer",
    action in [Action::"FS::read", Action::"FS::write"],
    resource
) when {
    resource.path like "*/round-*/verdict.md" ||
    resource.path like "*/round-*/synthesis.md" ||
    resource.path like "*/round-*/hypotheses/*" ||
    resource.path like "*/round-*/evidence/*"
};

// verdict-arbiter: read verdict + governor state, write arbiter-decision.json
permit (
    principal == User::"verdict-arbiter",
    action in [Action::"FS::read", Action::"FS::write"],
    resource
) when {
    resource.path like "*/round-*/verdict.md" ||
    resource.path like "*/round-*/arbiter-decision.json" ||
    resource.path like "*/governor-state.json"
};

// =============================================================================
// TEAM 5 — ENFORCEMENT (tone-reviewer, schema-validator, citation-checker)
// =============================================================================

// tone-reviewer: read everything in incident dir, write critique only
permit (
    principal == User::"tone-reviewer",
    action in [Action::"FS::read", Action::"FS::write"],
    resource
) when {
    resource.path like "*/incident-*/**" ||
    resource.path like "*/INC-*/**"
};

forbid (
    principal == User::"tone-reviewer",
    action in [Action::"FS::delete", Action::"k8s::*", Action::"Bash::ssh::exec"],
    resource
);

// schema-validator: read artifacts, write validation results
permit (
    principal == User::"schema-validator",
    action in [Action::"FS::read", Action::"FS::write"],
    resource
) when {
    resource.path like "*/incident-*/**" ||
    resource.path like "*/INC-*/**" ||
    resource.path like "*/.validation/*"
};

// citation-checker: read artifacts + manifest, write citation-report
permit (
    principal == User::"citation-checker",
    action in [Action::"FS::read", Action::"FS::write", Action::"FS::sha256"],
    resource
) when {
    resource.path like "*/incident-*/**" ||
    resource.path like "*/INC-*/**"
};

// =============================================================================
// TEAM 6 — AUTHORING (rca-author, incident-report-author, mitigation-author, pdf-renderer)
// =============================================================================

// rca-author: read evidence + verdict, write final/rca.md
permit (
    principal == User::"rca-author",
    action in [Action::"FS::read", Action::"FS::write"],
    resource
) when {
    resource.path like "*/final/rca.md" ||
    resource.path like "*/final/rca.json" ||
    resource.path like "*/round-*/verdict.md" ||
    resource.path like "*/round-*/evidence/*"
};

// rca-author cannot author final/rca.md until verdict.status == ROOT_CAUSE_CONFIRMED
forbid (
    principal == User::"rca-author",
    action == Action::"FS::write",
    resource
) when {
    resource.path like "*/final/rca.md" &&
    context.verdict_status != "ROOT_CAUSE_CONFIRMED"
};

// incident-report-author: writes final/incident-report.md
permit (
    principal == User::"incident-report-author",
    action in [Action::"FS::read", Action::"FS::write"],
    resource
) when {
    resource.path like "*/final/incident-report.md" ||
    resource.path like "*/final/incident-report.json"
};

// mitigation-author: writes final/mitigations.md (CAPA)
permit (
    principal == User::"mitigation-author",
    action in [Action::"FS::read", Action::"FS::write"],
    resource
) when {
    resource.path like "*/final/mitigations.md"
};

// pdf-renderer: read final/*.md, write final/*.pdf via LibreOffice
permit (
    principal == User::"pdf-renderer",
    action in [Action::"FS::read", Action::"FS::write", Action::"Bash::libreoffice"],
    resource
) when {
    resource.path like "*/final/*.pdf" ||
    resource.path like "*/final/*.md" ||
    resource.path like "*/final/*.html"
};

// =============================================================================
// TEAM 7 — RECOVERY (recovery-planner, recovery-executor, recovery-verifier)
// =============================================================================

// recovery-planner: read verdict, write recovery-plan.json — no mutations
permit (
    principal == User::"recovery-planner",
    action in [Action::"FS::read", Action::"FS::write"],
    resource
) when {
    resource.path like "*/recovery/plan.json" ||
    resource.path like "*/recovery/plan.md" ||
    resource.path like "*/round-*/verdict.md"
};

forbid (
    principal == User::"recovery-planner",
    action in [
        Action::"k8s::create", Action::"k8s::patch", Action::"k8s::delete",
        Action::"k8s::scale", Action::"Bash::ssh::exec",
        Action::"postgres::query::write"
    ],
    resource
);

// recovery-executor: gated mutation authority
permit (
    principal == User::"recovery-executor",
    action in [
        Action::"k8s::scale",
        Action::"k8s::patch",
        Action::"k8s::create",
        Action::"k8s::apply",
        Action::"Bash::ssh::exec",
        Action::"postgres::query::write",
        Action::"longhorn::salvage",
        Action::"longhorn::detach",
        Action::"longhorn::reattach"
    ],
    resource
) when {
    context.human_approval == true &&
    context.verdict_status == "ROOT_CAUSE_CONFIRMED" &&
    context.recovery_step_id like "S*"
};

// recovery-executor: NEVER bypass human approval for destructive actions
forbid (
    principal == User::"recovery-executor",
    action in [
        Action::"k8s::delete",
        Action::"longhorn::delete-volume",
        Action::"longhorn::delete-replica",
        Action::"postgres::truncate",
        Action::"postgres::drop",
        Action::"Bash::ssh::rm",
        Action::"Bash::ssh::dd",
        Action::"Bash::ssh::mkfs"
    ],
    resource
) unless {
    context.human_approval == true &&
    context.recovery_step_risk == "destructive"
};

// recovery-verifier: read-only post-recovery checks
permit (
    principal == User::"recovery-verifier",
    action in [
        Action::"k8s::get",
        Action::"k8s::list",
        Action::"k8s::logs",
        Action::"prometheus::query",
        Action::"loki::query",
        Action::"postgres::query::readonly",
        Action::"clickhouse::query::readonly"
    ],
    resource
);

// =============================================================================
// TEAM 8 — LOOP CONTROL (evidence-requester, governor-enforcer, human-gate)
// =============================================================================

// evidence-requester: read prior verdict, write round-(N+1)/request.md
permit (
    principal == User::"evidence-requester",
    action in [Action::"FS::read", Action::"FS::write"],
    resource
) when {
    resource.path like "*/round-*/request.md" ||
    resource.path like "*/round-*/request.json" ||
    resource.path like "*/round-*/verdict.md"
};

// governor-enforcer: read state, write governor-state.json — can BLOCK actions
permit (
    principal == User::"governor-enforcer",
    action in [
        Action::"FS::read",
        Action::"FS::write",
        Action::"loop::block",
        Action::"loop::allow"
    ],
    resource
) when {
    resource.path like "*/governor-state.json"
};

// human-gate: writes human-decision records into timeline + request.md
permit (
    principal == User::"human-gate",
    action in [Action::"FS::read", Action::"FS::append"],
    resource
) when {
    resource.path like "*/timeline.md" ||
    resource.path like "*/round-*/request.md"
};

// =============================================================================
// HUMAN OPERATOR — full authority, audited via timeline
// =============================================================================

permit (
    principal == User::"human-operator",
    action,
    resource
);

// =============================================================================
// GLOBAL FORBIDS — apply to every principal except where explicitly overridden
// =============================================================================

// No agent may push to git remote without human approval
forbid (
    principal,
    action == Action::"git::push",
    resource
) unless {
    principal == User::"human-operator" ||
    (principal == User::"manifest-sealer" && resource.repo == "incident-witness") ||
    context.human_approval == true
};

// No agent may exec into a pod in a production namespace as root
forbid (
    principal,
    action == Action::"k8s::exec",
    resource
) when {
    resource.namespace in ["pnats", "pnats-data", "kube-system", "longhorn-system", "calico-system"] &&
    resource.exec_user == "root"
} unless {
    principal == User::"human-operator"
};

// No agent may modify Cedar policies, hooks, or schemas at runtime
forbid (
    principal,
    action == Action::"FS::write",
    resource
) when {
    resource.path like "*/policies/cedar/*.cedar" ||
    resource.path like "*/policies/constitution.md" ||
    resource.path like "*/hooks/*.sh" ||
    resource.path like "*/schemas/*.schema.json"
} unless {
    principal == User::"human-operator"
};
