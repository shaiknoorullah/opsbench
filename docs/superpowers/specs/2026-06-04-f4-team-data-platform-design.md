# F4 — team-data-platform Package Design

**Status:** draft 2026-06-04 — spec-only, awaiting reviewer approval
**Author:** Claude Code session (Shaik Noorullah, driver)
**Parent:** [`2026-06-04-f-series-master-roadmap.md`](./2026-06-04-f-series-master-roadmap.md) (F4 section, team #4 in the rollout order)
**Sibling team specs:** team-platform-engineering, team-security-response, team-network-operations, team-it-helpdesk (parallel F4 sub-teams)
**Inputs:**

- 25-domain ecosystem catalog ([`../research/2026-06-04-ecosystem-catalog.md`](../research/2026-06-04-ecosystem-catalog.md)) — data-platform-adjacent rows: Velero, Kasten K10, Stash, Liquibase, Flyway, Atlas (Ariga), Debezium, Kafka Connect, Apache Iceberg, Delta Lake, Airbyte, Fivetran (commercial), dbt, Great Expectations, Soda Core, OpenLineage, Marquez, DataHub, Atlas (Apache), Unity Catalog
- `team-incident-response` reference structure ([`/packages/team-incident-response/`](../../../packages/team-incident-response/))
- F1 (Cedar generator) — produces `tools-generated.cedar` from each recipe's `tools:` frontmatter
- F2 (opsbench-gateway) — every MCP call passes through gateway with Cedar eval + custody.log
- F3 (signed receipts) — Ed25519-signed audit trail
- Pi-first authoring rules (see roadmap §F5 + the cross-cutting Pi context)

---

## Purpose

`team-data-platform` is the F4 package that gives an agent the operational vocabulary of a **data-platform / DBA / data-reliability** team: backups verified, schemas migrated safely, replication healthy, lineage intact, data quality measured, and disasters recoverable. It assumes the foundation (F1–F3) already supplies the policy/evidence layer and that `team-incident-response` supplies the generic incident-response chassis (timelines, custody, recovery plans).

The team's job is to convert raw data-system events (a failed Flyway migration, a Debezium connector lag spike, a Velero backup that "succeeded" but cannot restore, a schema drift between staging and prod) into structured, gateway-mediated, evidence-sealed remediation. It does **not** re-implement timeline keeping, evidence cataloging, or quarantine — those flow through `team-incident-response` skills and the shared `custody-entry.schema.json` lineage.

### Concretely the team owns

1. **Backup verification** — beyond "backup succeeded", actually restore into a sandbox and assert recoverability. Velero, Kasten K10, Stash (CNCF), and database-native dumps (pg_basebackup, mysqldump, mongodump) are all supported.
2. **Schema migrations** — Liquibase, Flyway, Atlas (Ariga) and Sqitch wrappers. Pre-flight Cedar checks ("does this migration touch a `Deny` table?"), dry-run plans, post-flight verification, automatic rollback proposals.
3. **CDC and replication health** — Debezium connectors, Kafka Connect tasks, logical-replication slots in Postgres / MySQL / MongoDB, plus Materialize/RisingWave subscribers when present. Lag, snapshot status, schema-evolution events.
4. **Data quality and lineage** — Great Expectations, Soda Core, dbt tests, OpenLineage emitters into Marquez or DataHub. Quality-gate enforcement before downstream promotion.
5. **Storage tiering and PITR posture** — verifying that PITR windows match RPO, that S3/GCS lifecycle rules don't shred recovery objects, that encryption-at-rest keys are rotation-ready.

### Concretely the team does NOT own

- Generic incident commanding, evidence catalog, RCA narrative — those belong to `team-incident-response`.
- Cluster-level IaC orchestration (Terraform/Crossplane) — `team-platform-engineering`.
- Network-layer forensics (eBPF, Kubeshark) — `team-network-operations`.
- Identity/endpoint posture for the humans operating the platform — `team-it-helpdesk`.
- Application-layer SOC tooling (Wazuh/MISP/TheHive) — `team-security-response`.

### Hand-off contracts (briefly)

- **Inbound from `team-incident-response`**: a `collection-plan` whose `target_systems[]` includes one of `{"db", "warehouse", "queue", "object-store", "cdc"}` is routed here.
- **Outbound to `team-incident-response`**: `data-platform-finding.v1.json` payloads are emitted as `evidence-request` responses with `evidence_class = "data-platform"`.
- **Inbound from `team-platform-engineering`**: post-IaC drift events that involve managed databases (RDS, Cloud SQL, Azure SQL Managed Instance) get a sanity-check pass here before any destructive Crossplane reconcile.

---

## Skill inventory (12 skills, target 8–15)

Skills live at `packages/team-data-platform/skills/<slug>/SKILL.md` and follow the existing `team-incident-response` SKILL.md frontmatter conventions (name, description, allowed_tools, agent_capability, sources). Each skill below specifies its primary verb, the MCP recipes it pulls from, and its custody footprint.

### 1. `backup-verify`

**Purpose:** Given a recent backup artifact (Velero schedule, Kasten policy, pg_dump file, Mongo restic snapshot), actually restore into an isolated sandbox namespace / ephemeral database and run a defined readiness probe set. Emits `backup-verification.v1.json`.
**Primary MCPs:** `velero-mcp`, `kasten-k10-mcp` (recipe to be added), `stash-mcp`, `postgres-mcp`.
**Custody:** every restore action writes a `custody-entry` with `tool=backup.restore` and the restore-target namespace digest.
**Default agent class:** `data-recoverability-engineer`.

### 2. `migration-preflight`

**Purpose:** Read a pending migration (Liquibase changelog, Flyway versioned SQL, Atlas HCL, Sqitch plan) and produce a structured `migration-preflight.v1.json` with: target tables, estimated lock duration, online-DDL eligibility, Cedar policy check result, rollback availability.
**Primary MCPs:** `liquibase-mcp`, `flyway-mcp`, `atlas-mcp`, `postgres-mcp` / `mysql-mcp` for shadow-table analysis.
**Custody:** preflight reports are sealed; no write actions in this skill.
**Default agent class:** `schema-migration-planner`.

### 3. `migration-execute`

**Purpose:** Execute a previously approved migration in dry-run-first mode. Stops at the first non-recoverable error. Wraps Liquibase/Flyway/Atlas/Sqitch CLI invocations. Writes a `migration-run.v1.json`.
**Primary MCPs:** Same as preflight, but with `read_only=false` Cedar grant only for the approved `migration_id`.
**Custody:** every executed statement is mirrored to custody with its before-checksum and after-checksum.
**Default agent class:** `schema-migration-executor` (privilege-elevated; gated by `team-incident-response/policies/governors.cedar` analogue).

### 4. `cdc-health`

**Purpose:** Snapshot the health of CDC plumbing: Debezium connector status, Kafka Connect task lag, Postgres replication-slot retention, MySQL binlog position, MongoDB oplog window. Emits `cdc-health.v1.json`.
**Primary MCPs:** `debezium-mcp` (community recipe to be added), `kafka-mcp`, `postgres-mcp`, `mysql-mcp`, `mongodb-mcp`.
**Custody:** lag samples are written so trend analysis can prove RPO compliance.
**Default agent class:** `cdc-observer`.

### 5. `cdc-replay`

**Purpose:** Re-emit a CDC range from a known LSN/offset into a sandbox topic for forensic replay. Useful when a downstream consumer is suspected of poisoning state. Strictly read-only relative to source; writes only to a quarantined sandbox topic.
**Primary MCPs:** `debezium-mcp`, `kafka-mcp`.
**Custody:** every replayed batch is recorded with the source LSN range and target sandbox.
**Default agent class:** `cdc-replay-operator` (elevated).

### 6. `data-quality-check`

**Purpose:** Execute Great Expectations suites, Soda Core scans, or `dbt test` against a specified dataset; aggregate pass/fail; emit `data-quality-report.v1.json`.
**Primary MCPs:** `great-expectations-mcp`, `soda-core-mcp`, `dbt-mcp`, plus warehouse-side MCPs (`bigquery-mcp`, `snowflake-mcp`, `redshift-mcp`) for read.
**Custody:** report digests; no mutation.
**Default agent class:** `data-quality-auditor`.

### 7. `lineage-trace`

**Purpose:** Given an entity (table, dataset, dashboard), walk OpenLineage / Marquez / DataHub to produce an upstream + downstream graph slice with last-touch timestamps. Emits `lineage-slice.v1.json`.
**Primary MCPs:** `openlineage-mcp`, `marquez-mcp`, `datahub-mcp`.
**Custody:** slice digests sealed.
**Default agent class:** `lineage-investigator`.

### 8. `pitr-window-verify`

**Purpose:** Cross-check the documented RPO against the actual point-in-time-recovery window present in WAL archives / binlog retention / Mongo oplog / cloud-provider snapshot history. Surfaces gaps. Emits `pitr-posture.v1.json`.
**Primary MCPs:** `awslabs-mcp` (RDS sub-server), `gcloud-mcp` (Cloud SQL), `microsoft-mcp` (Azure SQL), `postgres-mcp`, `mysql-mcp`.
**Custody:** posture summary sealed.
**Default agent class:** `pitr-auditor`.

### 9. `storage-tier-audit`

**Purpose:** Check S3 / GCS / Azure Blob lifecycle rules and inventory reports against the team's stated retention policy. Detect when a "cold" rule has prematurely tiered an object out of recovery scope.
**Primary MCPs:** `awslabs-mcp` (S3 sub-server), `gcloud-mcp`, `microsoft-mcp` (Storage Blobs), generic `s3-mcp`.
**Custody:** rule diff is sealed.
**Default agent class:** `storage-tier-auditor`.

### 10. `schema-drift-detect`

**Purpose:** Compare schema across environments (dev/staging/prod) or against a registered Atlas state and emit a `schema-drift.v1.json` with introduced columns, type changes, missing indexes, and Cedar policy implications.
**Primary MCPs:** `atlas-mcp`, `liquibase-mcp` (snapshot mode), warehouse MCPs read-only.
**Custody:** drift digest sealed.
**Default agent class:** `schema-drift-detector`.

### 11. `connector-quarantine`

**Purpose:** Hand-off skill that takes a misbehaving CDC connector or Kafka Connect task and either pauses it via the MCP (preferred) or applies a Cedar gating tag that the gateway will translate into denial. Mirrors `team-incident-response/skills/incident-quarantine` semantics but specialized for streaming data plumbing.
**Primary MCPs:** `kafka-mcp`, `debezium-mcp`, `kyverno-mcp` (for cluster-level pause).
**Custody:** quarantine actions are first-class custody entries with `tool=connector.pause` and the connector identifier.
**Default agent class:** `cdc-quarantine-coordinator`.

### 12. `data-recovery-plan`

**Purpose:** Produce a `recovery-plan.v1.json` (analogous to `team-incident-response/schemas/recovery-plan.schema.json`) specialized for data systems: which backup, which PITR target, which schema version, which CDC offset to resume from, ordered steps, halt-on-failure gates.
**Primary MCPs:** read-only across all of the above; the plan is written, not executed.
**Custody:** plan sealed and surfaced to `team-incident-response`'s `evidence-cataloger`.
**Default agent class:** `data-recovery-planner`.

### Skill count rationale

Twelve sits comfortably inside the 8–15 band the roadmap mandates. It covers the four canonical data-platform pillars (backups, migrations, replication, quality/lineage) with two skills each on average, plus three crosscut skills (`pitr-window-verify`, `storage-tier-audit`, `data-recovery-plan`). We can drop `connector-quarantine` to nine if reviewers prefer that responsibility to live exclusively in `team-incident-response`; default keeps it here because the streaming-data semantics are CDC-specific.

---

## Agent inventory

Agents live under `packages/team-data-platform/agents/team-N-<role>/` mirroring the team-incident-response shape (team-1-command, team-2-evidence-collection, etc.). Each agent ships a single `.md` file with frontmatter: `name`, `description`, `tools`, `cedar_role`, `skills_used`, `escalates_to`. The Cedar `cedar_role` value is the principal that `tools-generated.cedar` will scope.

Eleven agents in total, organized into four subgroups.

### Subgroup `team-1-orchestration` (2 agents)

#### `data-platform-commander.md`

Top-level orchestrator. Receives a routed `evidence-request` from `team-incident-response/incident-commander`, decides which subgroup is engaged, and emits a `data-recovery-plan` when remediation is in scope. Mirrors `incident-commander` shape.
**Default tool allowlist (Cedar):** `Allow principal == DataPlatformCommander to read on Recipe::*; Allow to invoke on Skill::data-recovery-plan, lineage-trace, schema-drift-detect; Deny invoke on any Skill where tags.write == true unless tagged "approved-by:incident-commander".`
**Skills used:** all read-only skills + `data-recovery-plan`.

#### `migration-change-advisor.md`

Specializes the orchestrator for schema-change requests that arrive outside an incident — typically as a routine PR review or scheduled migration. Wraps `migration-preflight`. Never executes; always escalates execution to `schema-migration-executor`.
**Cedar:** `Allow read on Recipe::liquibase-mcp, flyway-mcp, atlas-mcp, postgres-mcp, mysql-mcp; Allow invoke on Skill::migration-preflight; Deny invoke on Skill::migration-execute.`

### Subgroup `team-2-backup-and-recovery` (3 agents)

#### `backup-verifier.md`

Drives `backup-verify`. Reads the relevant backup catalog (Velero schedule, Kasten policy), picks a sandbox namespace, performs restore, runs readiness probes, emits `backup-verification.v1.json`.
**Cedar:** `Allow invoke on Skill::backup-verify; Allow read on Recipe::velero-mcp, kasten-k10-mcp, stash-mcp, postgres-mcp, mongodb-mcp; Allow restore action only in sandbox namespace prefix "verify-".`

#### `pitr-auditor.md`

Drives `pitr-window-verify`. Strictly read-only; emits posture artifact.
**Cedar:** `Allow invoke on Skill::pitr-window-verify; Allow read on Recipe::awslabs-mcp, gcloud-mcp, microsoft-mcp, postgres-mcp, mysql-mcp; Deny all writes.`

#### `data-recovery-planner.md`

Drives `data-recovery-plan`. Synthesizes inputs from `backup-verifier`, `pitr-auditor`, and `cdc-observer` into a step-ordered plan. Never executes; routes plan back to `data-platform-commander` for approval.
**Cedar:** `Allow invoke on Skill::data-recovery-plan; Allow read on all data-platform Recipes; Deny all mutating tools.`

### Subgroup `team-3-schema-and-migration` (3 agents)

#### `schema-migration-planner.md`

Drives `migration-preflight` and `schema-drift-detect`. Surfaces risks but cannot mutate.
**Cedar:** `Allow invoke on Skill::migration-preflight, schema-drift-detect; Allow read on Recipe::liquibase-mcp, flyway-mcp, atlas-mcp; Deny invoke on Skill::migration-execute.`

#### `schema-migration-executor.md`

Privilege-elevated. Drives `migration-execute`. Only callable with a fresh `approved-by:incident-commander` or `approved-by:migration-change-advisor` Cedar tag.
**Cedar:** `Allow invoke on Skill::migration-execute when context.approval_token.valid && context.approval_token.scope == migration_id; Deny all other writes.` This is the cleanest example in the package of Cedar context-based authorization.

#### `schema-drift-detector.md`

Drives `schema-drift-detect` independently of any migration cycle — typically on a schedule via cron or as a hook on PR merge.
**Cedar:** `Allow invoke on Skill::schema-drift-detect; Allow read on Recipe::atlas-mcp, postgres-mcp, mysql-mcp, bigquery-mcp; Deny all writes.`

### Subgroup `team-4-streaming-and-quality` (3 agents)

#### `cdc-observer.md`

Drives `cdc-health`. Routine pulse-check of CDC plumbing; emits lag and offset samples.
**Cedar:** `Allow invoke on Skill::cdc-health; Allow read on Recipe::debezium-mcp, kafka-mcp, postgres-mcp, mysql-mcp, mongodb-mcp; Deny all writes including topic creates.`

#### `cdc-replay-operator.md`

Drives `cdc-replay`. Privilege-elevated similarly to `schema-migration-executor`. Only writes to sandbox topics whose names match the prefix `replay-sandbox-`.
**Cedar:** `Allow invoke on Skill::cdc-replay when context.target_topic startsWith "replay-sandbox-"; Allow write on those topics; Deny writes on any other topic.`

#### `data-quality-auditor.md`

Drives `data-quality-check`, `lineage-trace`, `storage-tier-audit`. Read-only across warehouses, OpenLineage, and S3/GCS/Azure Blob.
**Cedar:** `Allow invoke on Skill::data-quality-check, lineage-trace, storage-tier-audit; Allow read on Recipe::great-expectations-mcp, soda-core-mcp, dbt-mcp, openlineage-mcp, marquez-mcp, datahub-mcp, awslabs-mcp, gcloud-mcp, microsoft-mcp; Deny all writes.`

### Optional later (post-F4)

- `cdc-quarantine-coordinator.md` — split from `data-platform-commander` if the connector-quarantine flow grows; ships in a follow-up PR.
- `lineage-investigator.md` — split from `data-quality-auditor` if OpenLineage usage warrants a dedicated principal.

Eleven shipped agents is comfortably inside the 5–15 band.

---

## Schemas

Schemas live at `packages/team-data-platform/schemas/<name>.schema.json`, draft-2020-12. Each is referenced by exactly the skills listed above so the dependency graph is auditable. Five schemas ship in F4; one more is reserved for a possible split.

### 1. `backup-verification.schema.json`

Produced by `backup-verify`.
**Required:** `backup_id`, `source_type` (one of `velero | kasten | stash | pg_dump | mongodump | mysqldump | other`), `restore_namespace`, `restore_started_at`, `restore_completed_at`, `probes[]` (each with `name`, `result` ∈ `pass|fail|skip`, `evidence_digest_sha256`), `overall_result`, `custody_chain_ref`.
**Optional:** `signed_receipt_ref` (when F3 receipts are enabled).

### 2. `migration-preflight.schema.json`

Produced by `migration-preflight`.
**Required:** `migration_id`, `engine` (`liquibase | flyway | atlas | sqitch`), `target_database`, `tables_touched[]`, `estimated_lock_ms`, `online_ddl_eligible` (bool), `cedar_decision` (`allow | deny | conditional`), `rollback_available` (bool), `risks[]`.
**Optional:** `shadow_table_diff` (free-form for engines that support shadow).

### 3. `migration-run.schema.json`

Produced by `migration-execute`. Extends `migration-preflight` results with `started_at`, `completed_at`, `statements_executed[]` (each with `sql_digest`, `before_digest`, `after_digest`, `duration_ms`), `overall_result`, `rollback_artifact_ref` (when produced).

### 4. `cdc-health.schema.json`

Produced by `cdc-health`. Required: `sampled_at`, `connectors[]` (each with `name`, `engine`, `state`, `lag_seconds`, `last_event_ts`, `error_count`), `replication_slots[]` (with `slot_name`, `wal_retained_bytes`, `confirmed_flush_lsn`), `oplog_windows[]` (Mongo), `rpo_compliance` (bool with rationale string).

### 5. `data-recovery-plan.schema.json`

Produced by `data-recovery-plan`. Required: `incident_ref` (links to `team-incident-response/schemas/incident-report.schema.json`), `target_rpo`, `target_rto`, `chosen_backup_ref`, `chosen_pitr_target`, `cdc_resume_offsets[]`, `ordered_steps[]` (each `step_id`, `description`, `skill_invocation`, `halt_on_failure` bool, `approval_required` bool), `cedar_approval_tokens_needed[]`.

### Reserved for future split (not shipped in F4)

- `schema-drift.schema.json` — currently inlined into a sub-property of `data-recovery-plan.schema.json` (`drift_findings[]`). If `schema-drift-detect` runs frequently outside recovery scope, this gets promoted to a top-level schema in a follow-up.
- `data-quality-report.schema.json` — produced by `data-quality-check`, currently inlined into `data-recovery-plan` as `quality_findings[]`. Same split rule applies.

Counting only top-level files: five schemas at F4 ship. This is within the 3–6 band.

### Cross-package schema references

- `data-recovery-plan.schema.json` `$refs` `team-incident-response/schemas/recovery-plan.schema.json` for the generic `ordered_steps[].step_id` shape so the two plans remain compatible.
- `cdc-health.schema.json` referenced by `team-network-operations` skills that watch Kafka traffic patterns (the connector list is a useful pivot for traffic-pattern reasoning).
- Every schema embeds `custody_chain_ref` and `signed_receipt_ref` so they fit the foundation's evidence model unchanged.

---

## MCP recipes

Per the roadmap, `team-data-platform/mcp-recipes/` does **not** duplicate catalog recipes; it cross-links via `See-also` markdown stubs. Each stub names the canonical recipe path in `packages/team-incident-response/mcp-recipes/` (where the F0 bulk-ship lands), the Cedar role expected, and any team-data-platform-specific config notes.

### Reused as-is from F0 catalog (cross-link only)

| Stub | Canonical recipe | Why we cross-link |
| ---- | ---------------- | ----------------- |
| `vault-mcp.see-also.md` | `vault-mcp.md` | Migrations and CDC connectors fetch credentials from Vault |
| `github-mcp.see-also.md` | `github-mcp.md` | Migration PRs are read for preflight context |
| `awslabs-mcp.see-also.md` | `awslabs-mcp.md` | RDS, S3 lifecycle, DynamoDB PITR |
| `gcloud-mcp.see-also.md` | `gcloud-mcp.md` | Cloud SQL, GCS lifecycle, BigQuery snapshots |
| `microsoft-mcp.see-also.md` | `microsoft-mcp.md` | Azure SQL Managed Instance, Blob Storage lifecycle |
| `postgres-mcp.see-also.md` | `postgres-mcp.md` | Authoritative Postgres surface |
| `mysql-mcp.see-also.md` | `mysql-mcp.md` | MySQL surface |
| `mongodb-mcp.see-also.md` | (canonical recipe to land in F0 or here) | Mongo surface |
| `kafka-mcp.see-also.md` | (canonical recipe in F0) | Required by `cdc-health`, `cdc-replay` |
| `prometheus-mcp.see-also.md` | `prometheus-mcp.md` | Replication-lag metrics scrape |
| `grafana-mcp.see-also.md` | `grafana-mcp.md` | Dashboards referenced from `cdc-health` outputs |

### New recipes authored by F4-team-data-platform (land in canonical catalog, not duplicated)

These canonical files live in `packages/team-incident-response/mcp-recipes/` per the F0 organization rule; the team-data-platform `mcp-recipes/` directory only hosts the `.see-also.md` stub. Per the parent roadmap §F4, "F4 reorganizes by team package" is deferred to a later phase.

| Recipe slug | Upstream | License | Status |
| ----------- | -------- | ------- | ------ |
| `velero-mcp.md` | `vmware-tanzu/velero` (community wrapper required; see Pi notes) | Apache-2.0 | Authoring task in F4 |
| `kasten-k10-mcp.md` | `kastenhq` (Veeam) — REST API + CLI-Anything wrap | Commercial | EXPERIMENTAL banner; auth notes |
| `stash-mcp.md` | `stashed/stash` | Apache-2.0 | CLI-Anything wrap |
| `liquibase-mcp.md` | `liquibase/liquibase` | Apache-2.0 | CLI-Anything wrap; OSS edition only |
| `flyway-mcp.md` | `flyway/flyway` | Apache-2.0 | CLI-Anything wrap |
| `atlas-mcp.md` | `ariga/atlas` | Apache-2.0 | Native Atlas CLI is MCP-friendly |
| `sqitch-mcp.md` | `sqitchers/sqitch` | MIT | CLI-Anything wrap |
| `debezium-mcp.md` | `debezium/debezium` | Apache-2.0 | REST connector API + CLI-Anything for `kcctl` |
| `kafka-connect-mcp.md` | Apache Kafka Connect REST | Apache-2.0 | CLI-Anything wrap |
| `great-expectations-mcp.md` | `great-expectations/great_expectations` | Apache-2.0 | CLI wrap |
| `soda-core-mcp.md` | `sodadata/soda-core` | Apache-2.0 | CLI wrap |
| `dbt-mcp.md` | `dbt-labs/dbt-core` | Apache-2.0 | CLI wrap; also a vendor adapter exists for dbt Cloud |
| `openlineage-mcp.md` | `OpenLineage/OpenLineage` | Apache-2.0 | HTTP API |
| `marquez-mcp.md` | `MarquezProject/marquez` | Apache-2.0 | HTTP API |
| `datahub-mcp.md` | `datahub-project/datahub` | Apache-2.0 | GraphQL/REST API |
| `bigquery-mcp.md` | `googleapis/genai-toolbox` BigQuery MCP | Apache-2.0 | Vendor MCP |
| `snowflake-mcp.md` | `Snowflake-Labs/mcp` | Apache-2.0 | Vendor MCP |
| `redshift-mcp.md` | `awslabs/mcp` (Redshift sub-server) | Apache-2.0 | Cross-link to awslabs-mcp |

Eighteen new recipe slots. F4 ships the catalog skeleton plus enough Cedar config to wire the agents listed above. The detailed per-recipe write-ups follow the F0 lighter template (Source / Install / Configuration / Auth / Tools / Safety / Caveats) and ship as a separate sub-PR if reviewers want to keep team-data-platform's spec PR small.

---

## Cedar policy posture

Per the roadmap, most rules flow through `tools-generated.cedar` (the F1 generator output). `team-data-platform/policies/` holds only the small hand-written overrides and the team-specific governor rules.

### Files shipped

#### `policies/governors.cedar`

Team-specific governors. Five rules:

1. **`migration-execute requires fresh approval token.`** Cedar context predicate; mirrors `team-incident-response/policies/governors.cedar` shape.
2. **`cdc-replay sandbox-prefix enforcement.`** Restricts `cdc-replay-operator` to topics starting with `replay-sandbox-`.
3. **`backup-restore namespace-prefix enforcement.`** Restricts `backup-verifier` to namespaces starting with `verify-`.
4. **`storage-tier-audit read-only attestation.`** Asserts that any S3/GCS/Azure Blob action with verb in `{Put, Delete, Tag, Lifecycle}` is denied for `data-quality-auditor`.
5. **`pitr-auditor cross-cloud allow.`** Allows the auditor to read posture from all three major clouds; needed because the principal is otherwise denied cross-account reads by the foundation default.

#### `policies/constitution.md`

Mirrors `team-incident-response/policies/constitution.md` shape but specializes the prose to data-platform concerns:

- Backups that succeed without a restore-verification are treated as broken backups.
- Migrations may not execute outside an approval window even with a valid Cedar token.
- CDC replay never resumes consumers to upstream topics; replay always lands in a sandbox.
- Schema drift in shared dimensions (`dim_*` tables) is treated as P2 immediately, P1 if downstream BI dashboards are impacted (cross-link via `lineage-trace`).
- Storage-tier "auto-archive" lifecycle rules require a documented RPO that the rule respects.

#### `policies/cedar/` (subdirectory)

Same structure as `team-incident-response/policies/cedar/` — generated allowlists live here, regenerated on `npm prepare`. Empty in the F4 PR; F1's generator populates on first run.

### What does NOT live here

- Generic agent-class allowlists (those come from `tools-generated.cedar` at the foundation level).
- Recipe-level `tools:` frontmatter (those live in the recipes themselves; F1 reads them).

### Default posture

- Read by default everywhere.
- Writes denied unless:
  1. The principal is one of `{schema-migration-executor, cdc-replay-operator, backup-verifier}`, AND
  2. The action is in the principal's explicit allow set, AND
  3. The context predicates above are satisfied.

This matches the foundation's "read-only by default; writes are gated" principle from the roadmap §"Cross-cutting principles" item 4.

---

## Pi-first authoring notes

Per the cross-cutting Pi context: every recipe, skill, and agent ships a Pi-flavored variant **first**, with Claude Code, Codex CLI, Copilot, Cursor, Gemini, OpenCode as secondary parity targets. Pi has no built-in MCP — integration is via CLI tools that Pi shells out to, plus Pi extensions installed by `pi install`. For team-data-platform specifically:

### Recipe authoring

For each new recipe shipped by F4-team-data-platform (the eighteen rows in the previous section), the recipe document includes a **"Configuration — Pi (primary)"** section before the **"Configuration — Claude Code (secondary)"** section. The Pi section documents one of two paths:

- **(a) Vendor Pi extension exists.** Show the `pi install npm:@vendor/<name>` line + the AGENTS.md snippet that tells the agent how to invoke the wrapper.
- **(b) No vendor Pi extension.** Use HKUDS/CLI-Anything to generate a Pi-callable CLI from the upstream tool's source, fork it under `shaiknoorullah/`, publish via `pi install git:github.com/shaiknoorullah/<tool>-pi-skill`, and document the AGENTS.md / SYSTEM.md snippets that direct the agent to call the wrapper CLI.

At F4 ship time, the expected split is:

| Recipe | Pi config path |
| ------ | -------------- |
| `velero-mcp` | (b) CLI-Anything wrap of `velero` CLI |
| `kasten-k10-mcp` | (b) CLI-Anything wrap of `kubectl-k10` |
| `stash-mcp` | (b) CLI-Anything wrap of `kubectl-stash` |
| `liquibase-mcp` | (b) CLI-Anything wrap of `liquibase` CLI |
| `flyway-mcp` | (b) CLI-Anything wrap of `flyway` CLI |
| `atlas-mcp` | (a) Atlas already has a Pi-friendly CLI; check for vendor extension first |
| `sqitch-mcp` | (b) CLI-Anything wrap |
| `debezium-mcp` | (b) CLI-Anything wrap of `kcctl` + Debezium REST |
| `kafka-connect-mcp` | (b) CLI-Anything wrap of `connect-cli` or `kcat` |
| `great-expectations-mcp` | (b) CLI-Anything wrap of `great_expectations` CLI |
| `soda-core-mcp` | (b) CLI-Anything wrap of `soda` CLI |
| `dbt-mcp` | (b) CLI-Anything wrap of `dbt` CLI (consider vendor adapter for dbt Cloud) |
| `openlineage-mcp` | (b) CLI-Anything wrap of `openlineage-cli` if present, else HTTP shim |
| `marquez-mcp` | (b) HTTP shim |
| `datahub-mcp` | (b) CLI-Anything wrap of `datahub` CLI |
| `bigquery-mcp` | (a) vendor MCP available; Pi config calls vendor binary |
| `snowflake-mcp` | (a) vendor MCP available |
| `redshift-mcp` | (a) via awslabs vendor MCP |

The "Configuration — Claude Code (secondary)" section retains the standard `{"mcpServers": {...}}` JSONC config in each recipe.

Other hosts (Codex, Copilot, Cursor, Gemini, OpenCode) get the one-line "See tools/<host>-compat-layer/" pointer at the bottom of each recipe; full host configs ship in F5.

### Skill authoring

Each skill's `SKILL.md` lists `pi_extension: <slug>` in frontmatter when a Pi extension is required (e.g., `migration-execute` requires the Liquibase Pi extension to be installed). The skill body opens with the Pi invocation, then a "Also supports Claude Code via …" note.

### Agent authoring

Each agent's `.md` includes a `# Pi setup` section near the top that lists `pi install` lines the user runs once. Claude Code parity is documented under `# Claude Code setup` further down. Codex/Copilot/Cursor/Gemini/OpenCode get one-liners.

### AGENTS.md / SYSTEM.md

The package ships two Pi-host context files:

- `tools/pi-compat-layer/data-platform-AGENTS.md` — the project-level system prompt that registers the data-platform agents.
- `tools/pi-compat-layer/data-platform-SYSTEM.md` — per-project SYSTEM.md customization stub.

Both files cross-link the corresponding `team-incident-response` Pi files so the agent stack composes cleanly. Detailed authoring of these files happens in F5; the F4 PR ships placeholders so the directory exists.

### models.json

No custom model registration is required for team-data-platform itself. Pi's default model selection works.

---

## Acceptance criteria

The F4-team-data-platform PR (or PR-series, if split for review) is acceptable when:

1. **Package structure exists.**
   - `packages/team-data-platform/README.md` present with team overview + hand-off contracts copied from §Purpose.
   - `packages/team-data-platform/skills/` contains all 12 skill directories (each with a valid `SKILL.md`).
   - `packages/team-data-platform/agents/team-1-orchestration/`, `team-2-backup-and-recovery/`, `team-3-schema-and-migration/`, `team-4-streaming-and-quality/` exist and contain the agents listed in §Agent inventory.
   - `packages/team-data-platform/schemas/` contains the five shipped schemas.
   - `packages/team-data-platform/policies/governors.cedar` + `policies/constitution.md` present.
   - `packages/team-data-platform/mcp-recipes/` contains a `.see-also.md` stub for every recipe listed in §MCP recipes.
   - `packages/team-data-platform/hooks/` present (small — likely empty or one `pre-tool-use.sh` shim that delegates to foundation).

2. **Frontmatter validates.**
   - Every skill's `SKILL.md` frontmatter passes the existing schema validation in `lint:md`.
   - Every agent's `.md` frontmatter passes the same validation.
   - The five JSON schemas validate against draft-2020-12.

3. **Cedar policy posture is testable.**
   - `governors.cedar` parses with the Cedar binary.
   - At least one positive and one negative authorization test ships under `packages/team-data-platform/policies/cedar/tests/` for each governor rule.

4. **Cross-references resolve.**
   - Every `.see-also.md` stub links to an existing recipe in `packages/team-incident-response/mcp-recipes/` (or stages a TODO with the recipe-authoring task ID if the canonical recipe is not yet shipped — acceptable for the experimental stubs).
   - `data-recovery-plan.schema.json`'s `$ref` to `team-incident-response/schemas/recovery-plan.schema.json` resolves.

5. **Foundation integration.**
   - Every recipe gets a `tools:` frontmatter block so F1's generator can produce `tools-generated.cedar`.
   - Every skill's allowed_tools list is a subset of the gateway-allowed tools (i.e., the gateway route exists).
   - Every schema embeds `custody_chain_ref` and `signed_receipt_ref` so F3 receipts flow through.

6. **Pi-first authoring is visible.**
   - Every recipe stub lists its Pi config path (a or b) with the upstream tool reference.
   - The two `tools/pi-compat-layer/data-platform-*.md` placeholders exist.

7. **CI green.**
   - `lint:md`, `cspell`, the JSON-schema validation job, and the Cedar validation job (added in F1) all pass.
   - No new ESLint or TypeScript errors introduced.

8. **Documentation.**
   - `packages/team-data-platform/README.md` is at least 200 lines and includes: overview, agent map, skill map, schema map, MCP recipe pointer, Cedar posture summary, Pi setup overview, security notes, and a "Status: experimental" banner if any recipe is still EXPERIMENTAL.
   - `docs/integrations.md` (the root index) gains a "team-data-platform" section that lists each agent and the skills it owns.

9. **PR shape.**
   - One PR titled `feat(team-data-platform): F4 team package — backups, migrations, CDC, quality (spec + scaffold)` against `main`.
   - If reviewer prefers split: (a) schemas + policies, (b) skills + agents, (c) recipes + Pi compat — three PRs.

10. **No foundation regression.**
    - `team-incident-response` tests still pass.
    - `tools.cedar` did not shrink unexpectedly; only `tools-generated.cedar` may have grown.

---

## Risks & mitigations

| Risk | Likelihood | Severity | Mitigation |
| ---- | ---------- | -------- | ---------- |
| `Velero` and `Kasten K10` MCPs do not exist upstream and CLI-Anything wraps are non-trivial | High | High | Ship `.md` recipes with EXPERIMENTAL banners; defer the actual Pi extension publish to a follow-up; mark `backup-verifier` agent as "blocked on recipe (b)" in its frontmatter |
| Liquibase / Flyway commercial licensing for Pro features | Medium | Medium | Recipes explicitly scope to OSS editions; Cedar default `Deny` on Pro-only tool names |
| Schema-migration execution is irreducibly destructive even with Cedar | Medium | Critical | `schema-migration-executor` requires fresh `approved-by:incident-commander` token; recommended deployment includes a 2-human-approver workflow documented in `constitution.md` |
| CDC replay misconfiguration could re-emit production events to a non-sandbox topic | Medium | Critical | Cedar `sandbox-prefix` rule + recipe-level `tools:` frontmatter denies writes outside `replay-sandbox-`; integration test in `policies/cedar/tests/` covers both happy and rejection paths |
| `OpenLineage` / `Marquez` / `DataHub` are three overlapping lineage surfaces; choosing wrong one wastes effort | Low | Medium | Ship all three recipes as cross-links; let downstream user pick; provide a "lineage backend chooser" note in the README |
| Pi extension publishing pipeline (CLI-Anything → fork → `pi install git:`) is fragile if upstream tools rev | Medium | Medium | Pin upstream tool versions in the Pi extension's `pi.json`; document re-publish procedure |
| Recipe drift: vendor MCPs change tool surfaces, breaking the F1 Cedar generator output | Medium | Medium | F1's regeneration on `npm prepare` catches drift; recipe authors must keep `tools:` frontmatter fresh; CI fails if generated Cedar disagrees with checked-in baseline |
| Cross-package schema refs (to `team-incident-response/schemas/`) break if that package is reorganized | Low | High | Use stable schema `$id` URIs; never `$ref` by relative file path; document in `data-recovery-plan.schema.json` frontmatter |
| Backup verification against a real production backup could consume non-trivial cloud cost | Medium | Low | `backup-verifier` README documents cost model; recommended schedule is weekly per critical system; Cedar allows opt-in only |
| `dbt-mcp` adapter doubles up with `dbt-cloud-mcp` (commercial) — recipe ambiguity | Low | Low | Two separate `.see-also.md` stubs; OSS path is default |

---

## Open questions

1. **`connector-quarantine` skill placement.** Should it live here (current spec) or be moved to `team-incident-response/skills/` as an incident-shared skill? Default keeps it here; reviewer to confirm.
2. **`schema-migration-executor` agent split.** Should this be split into per-engine principals (`liquibase-executor`, `flyway-executor`, `atlas-executor`) so Cedar context predicates can be narrower? Default keeps it unified; revisit if Cedar token leakage between engines becomes a real concern.
3. **`Kasten K10` commercial gating.** Should we ship the recipe at all given the commercial license? Default: yes, with EXPERIMENTAL banner and clear opt-in note. Alternative: drop it; ship only Velero + Stash.
4. **Schemas not promoted in F4.** `schema-drift.schema.json` and `data-quality-report.schema.json` are inlined into `data-recovery-plan` for now. Reviewer: promote to top-level files in F4, or follow-up?
5. **Pi extension repository layout.** One repo per tool (`shaiknoorullah/velero-pi-skill`, etc.) or a monorepo (`shaiknoorullah/opsbench-pi-skills`)? Default: per-tool repo for clean `pi install git:` URLs; revisit if maintenance overhead grows.
6. **`tools/pi-compat-layer/data-platform-AGENTS.md` content.** Ship placeholder in F4 or block on F5's pi-compat-layer scaffold? Default: ship placeholder + a `TODO: F5` comment so the directory exists.
7. **Backup-verify sandbox lifecycle.** Should `verify-` namespaces auto-teardown after N minutes? Default: yes via a `kyverno` policy referenced from `governors.cedar`; reviewer to confirm we want that dependency in F4 vs deferring.
8. **CDC replay max range.** Should there be a Cedar hard cap on replay range (e.g., max 10M events)? Default: yes, embedded in `cdc-replay-operator`'s Cedar context predicate; reviewer to choose the cap value.
9. **Cross-team handoff schema.** Currently `data-platform-finding.v1.json` is described in §Purpose but not shipped as a schema. Should it be? Default: defer to follow-up; the `evidence-request` shape from `team-incident-response` is sufficient for F4.
10. **Order vs. team-platform-engineering.** The roadmap orders team-platform-engineering before team-data-platform. If those PRs proceed in parallel, the `team-platform-engineering` IaC recipes (Terraform/Crossplane) may shift the recipes for managed databases (RDS/Cloud SQL/Azure SQL) into `team-platform-engineering`. Default: keep RDS/Cloud SQL/Azure SQL DB-side recipes here as cross-links to whatever `team-platform-engineering` ships; resolve by mutual reference rather than ownership transfer.

---

## Appendix A — Directory map preview

```
packages/team-data-platform/
├── README.md
├── package.json
├── skills/
│   ├── backup-verify/SKILL.md
│   ├── migration-preflight/SKILL.md
│   ├── migration-execute/SKILL.md
│   ├── cdc-health/SKILL.md
│   ├── cdc-replay/SKILL.md
│   ├── data-quality-check/SKILL.md
│   ├── lineage-trace/SKILL.md
│   ├── pitr-window-verify/SKILL.md
│   ├── storage-tier-audit/SKILL.md
│   ├── schema-drift-detect/SKILL.md
│   ├── connector-quarantine/SKILL.md
│   └── data-recovery-plan/SKILL.md
├── agents/
│   ├── team-1-orchestration/
│   │   ├── data-platform-commander.md
│   │   └── migration-change-advisor.md
│   ├── team-2-backup-and-recovery/
│   │   ├── backup-verifier.md
│   │   ├── pitr-auditor.md
│   │   └── data-recovery-planner.md
│   ├── team-3-schema-and-migration/
│   │   ├── schema-migration-planner.md
│   │   ├── schema-migration-executor.md
│   │   └── schema-drift-detector.md
│   └── team-4-streaming-and-quality/
│       ├── cdc-observer.md
│       ├── cdc-replay-operator.md
│       └── data-quality-auditor.md
├── schemas/
│   ├── backup-verification.schema.json
│   ├── migration-preflight.schema.json
│   ├── migration-run.schema.json
│   ├── cdc-health.schema.json
│   └── data-recovery-plan.schema.json
├── policies/
│   ├── governors.cedar
│   ├── constitution.md
│   └── cedar/
│       └── tests/
│           └── (positive + negative authz tests)
├── mcp-recipes/
│   ├── velero-mcp.see-also.md
│   ├── kasten-k10-mcp.see-also.md
│   ├── stash-mcp.see-also.md
│   ├── liquibase-mcp.see-also.md
│   ├── flyway-mcp.see-also.md
│   ├── atlas-mcp.see-also.md
│   ├── sqitch-mcp.see-also.md
│   ├── debezium-mcp.see-also.md
│   ├── kafka-connect-mcp.see-also.md
│   ├── great-expectations-mcp.see-also.md
│   ├── soda-core-mcp.see-also.md
│   ├── dbt-mcp.see-also.md
│   ├── openlineage-mcp.see-also.md
│   ├── marquez-mcp.see-also.md
│   ├── datahub-mcp.see-also.md
│   ├── bigquery-mcp.see-also.md
│   ├── snowflake-mcp.see-also.md
│   ├── redshift-mcp.see-also.md
│   ├── vault-mcp.see-also.md
│   ├── github-mcp.see-also.md
│   ├── awslabs-mcp.see-also.md
│   ├── gcloud-mcp.see-also.md
│   ├── microsoft-mcp.see-also.md
│   ├── postgres-mcp.see-also.md
│   ├── mysql-mcp.see-also.md
│   ├── mongodb-mcp.see-also.md
│   ├── kafka-mcp.see-also.md
│   ├── prometheus-mcp.see-also.md
│   └── grafana-mcp.see-also.md
└── hooks/
    └── (small — likely empty or single delegation shim)
```

29 recipe stubs total (18 new + 11 reused).

## Appendix B — Cross-team dependency summary

| This package depends on | Provided by | F-phase |
| ----------------------- | ----------- | ------- |
| Cedar generator producing `tools-generated.cedar` | foundation | F1 |
| opsbench-gateway routing MCP calls through Cedar eval | foundation | F2 |
| Ed25519 signed receipts | foundation | F3 |
| Generic incident chassis (custody, timeline, evidence-request) | team-incident-response | pre-F4 |
| IaC-side recipes for cloud DBs (overlap-only) | team-platform-engineering | F4 (parallel) |
| eBPF observability for Kafka traffic (overlap-only) | team-network-operations | F4 (parallel) |
| Pi compat layer scaffolding | foundation | F5 |

| This package provides to | Consumer | Surface |
| ------------------------ | -------- | ------- |
| Backup verification reports | team-incident-response | `backup-verification.v1.json` via evidence-request |
| CDC health snapshots | team-incident-response, team-network-operations | `cdc-health.v1.json` |
| Recovery plans | team-incident-response | `data-recovery-plan.v1.json` |
| Schema drift findings | team-platform-engineering | inline drift sub-object |

---

**End of spec.**
