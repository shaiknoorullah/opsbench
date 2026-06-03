---
name: evidence-source-discovery
description: Use after incident-quarantine to enumerate every evidence source that exists in the cluster — Prometheus, Loki, Tempo, OTel, Falco, Longhorn CRDs, ceph-mgr, cloud audit logs, VPS APIs, application-specific system tables. Read-only inventory. Emits a `collection-plan.yaml` that drives the next phase (evidence-collection-orchestrator). Discovers what's POSSIBLE to collect before deciding what's NECESSARY.
---

# Evidence Source Discovery

## When to invoke

- `storage-incident-response` calls this as Phase 2 (after quarantine, before collection)
- You don't yet know what observability tooling is present in this cluster
- You need a plan for what to collect, not a guess
- A new cluster/environment where the operator has never run forensics before

## The principle

```
KNOW WHAT EXISTS BEFORE DECIDING WHAT TO COLLECT
```

Many incidents are diagnosed late because the responder didn't realize a critical evidence source was already running. Discovery prevents that. Discovery is also free — no collection happens here, only enumeration.

## Discovery layers

Enumerate the cluster against these 9 layers. For each, record (a) what's present, (b) how to query it, (c) data retention/freshness window, (d) credentials needed.

### Layer 1 — K8s control plane

```bash
kubectl --context $CTX cluster-info
kubectl --context $CTX get apiservices.apiregistration.k8s.io
kubectl --context $CTX api-resources --verbs=list -o wide
kubectl --context $CTX get crd -o custom-columns=NAME:.metadata.name,GROUP:.spec.group | head -50
```

Record: K8s version, runtime, CNI plugin, every CRD group present.

### Layer 2 — Namespaces and operators

```bash
kubectl --context $CTX get ns
# Look for operator namespaces: cert-manager, longhorn-system, kube-prometheus-stack/promstack, monitoring, observability,
# loki, tempo, grafana, signoz, opentelemetry-operator, falco-system, trivy-system, argocd, cilium-system, calico-system
```

### Layer 3 — Observability stack

For each potential observability tool, probe its presence:

```bash
# Prometheus / Mimir / Thanos
kubectl --context $CTX get servicemonitors,podmonitors,prometheusrules -A | head
kubectl --context $CTX -n <ns> get prometheus -o yaml | grep -E "retention|version"

# Loki
kubectl --context $CTX get pods -A | grep -iE "loki"
# discover loki-distributor / loki-read endpoint

# Tempo / Jaeger / Zipkin
kubectl --context $CTX get pods -A | grep -iE "tempo|jaeger|zipkin"

# OpenTelemetry
kubectl --context $CTX get pods -A | grep -iE "otel|opentelemetry"
kubectl --context $CTX get opentelemetrycollectors -A

# Grafana / SigNoz
kubectl --context $CTX get pods -A | grep -iE "grafana|signoz"
```

### Layer 4 — Node-level access

```bash
# Identify how to reach hosts (kubectl debug node, az ssh arc, ssh, etc.)
kubectl --context $CTX get nodes -o wide
# Test if `kubectl debug node/<node>` is allowed
# Test if Azure Arc SSH works (`az ssh arc --resource-group ... --name ... -- echo`)
# Identify per-node ssh keys (~/.ssh/ovh_key, ~/.ssh/contabo_key, etc.)
```

### Layer 5 — Storage subsystem

```bash
# Longhorn
kubectl --context $CTX -n longhorn-system get volumes.longhorn.io,replicas.longhorn.io,engines.longhorn.io,backups.longhorn.io 2>&1 | head
kubectl --context $CTX -n longhorn-system get nodes.longhorn.io -o wide 2>&1 | head

# Ceph / Rook
kubectl --context $CTX get cephclusters -A
kubectl --context $CTX -n rook-ceph exec deploy/rook-ceph-tools -- ceph -s 2>&1 | head

# CSI drivers
kubectl --context $CTX get csidrivers
kubectl --context $CTX get csinodes
```

### Layer 6 — Network plane

```bash
# Calico / Cilium / Flannel
kubectl --context $CTX -n kube-system get pods -l k8s-app=calico-node -o wide 2>&1 | head
kubectl --context $CTX get felixconfigurations,bgpconfigurations,ippools,networkpolicies -A | head

# Cilium Hubble (deep flow visibility)
kubectl --context $CTX -n kube-system get pods -l k8s-app=cilium-hubble 2>&1 | head
```

### Layer 7 — Application-specific system tables

```bash
# Postgres (Patroni / Spilo / Zalando operator)
kubectl --context $CTX get postgresql,clusters.postgresql.cnpg.io -A 2>&1 | head
# Note: pg_stat_activity, pg_stat_replication, pg_stat_user_tables available per pod

# ClickHouse (Altinity)
kubectl --context $CTX get clickhouseinstallations,clickhousekeeperinstallations -A 2>&1 | head
# Note: system.parts, system.processes, system.replication_queue, system.replicas

# Kafka (Strimzi)
kubectl --context $CTX get kafkas,kafkaconnects,kafkatopics -A 2>&1 | head

# Redis / etcd / MySQL...
```

### Layer 8 — Security / audit

```bash
# Falco / Tetragon
kubectl --context $CTX get pods -A | grep -iE "falco|tetragon"

# Trivy / kube-bench
kubectl --context $CTX get vulnerabilityreports,configauditreports -A 2>&1 | head

# Kubernetes audit log (if enabled)
# Cloud audit log (Azure Activity Log, AWS CloudTrail, GCP)
```

### Layer 9 — Platform / infrastructure

```bash
# Cloud provider audit / control plane
# Azure: az monitor activity-log list --start-time ...
# AWS: aws cloudtrail lookup-events ...
# Hypervisor: cntb instance get (Contabo); pvesh get /cluster/log (Proxmox)
# VPS API access?
```

## Output: `collection-plan.yaml`

Write to `<handoff>/<incident-id>/collection-plan.yaml`:

```yaml
incident_id: <id>
incident_time_utc: <YYYY-MM-DDTHH:MM:SSZ>
discovery_time_utc: <YYYY-MM-DDTHH:MM:SSZ>
cluster:
  k8s_version: 1.32.13
  cni: calico-v3.27
  context: ovh
  master_count: 0
  worker_count: 8
sources:
  control_plane:
    enabled: true
    commands:
      - "kubectl get events -A --sort-by='.lastTimestamp'"  # CRITICAL: 1h TTL, capture FIRST
      - "kubectl get all -A -o yaml"
    output_dir: cluster-scoped/
    retention: "1h for events; rest persistent"
  observability:
    prometheus:
      enabled: true
      endpoint: http://promstack-kube-prometheus-prometheus.observability.svc:9090
      retention: "15d (from prometheus.spec.retention)"
      query_window: incident_time ±30min
    loki:
      enabled: true
      endpoint: http://loki-gateway.observability.svc
      labels_to_query: ["namespace=pnats-data", "pod=~chi-audit.*"]
    tempo:
      enabled: false
  node_level:
    enabled: true
    access_method: "az ssh arc + ssh -i ~/.ssh/contabo_key"
    nodes_to_collect:
      - n.cnt.ap-south-1a.s.01  # incident node
      - n.cnt.ap-south-1a.l.01  # suspected SPOF
    commands_per_node:
      - "journalctl -k --since '<incident_time - 1h>' --until '<incident_time + 30min>'"
      - "dmesg -T"
      - "iostat -xz 1 30"
      - "ps auxf"
      - "smartctl -a /dev/sda"
  storage:
    longhorn:
      enabled: true
      volumes_to_dump:
        - pvc-b51346a6-8274-4de7-9d8d-8106be4fa7f0
      include_engine_logs: true
      include_replica_state: true
  network:
    calico:
      enabled: true
      include_felix_logs_per_node: true
  app_layer:
    clickhouse:
      enabled: true
      pods_to_query:
        - chi-audit-audit-0-0-0
        - chi-audit-audit-0-1-0
      queries:
        - "SELECT * FROM system.replicas FORMAT Vertical"
        - "SELECT * FROM system.replication_queue FORMAT Vertical"
        - "SELECT * FROM system.parts WHERE active FORMAT Vertical"
  security:
    falco:
      enabled: false
  platform:
    cntb:
      enabled: true
      instances:
        - 202805997  # l.01
      commands:
        - "cntb get instance <id>"

skip_sources:
  - tempo  # not deployed
  - jaeger  # not deployed
  - ceph  # using longhorn, not ceph

estimated_collection_artifacts: 184
estimated_collection_time_minutes: 12
estimated_evidence_size_mb: 350
```

## Hard rules

- **READ ONLY.** Do not enable, install, or deploy anything during discovery.
- **No collection here.** Discovery only enumerates; orchestrator does the work.
- **Always probe — don't assume from memory.** Memory rules may be stale; verify per-incident.
- **K8s events have 1-hour TTL.** Flag this in `collection-plan.yaml` as `priority: P0` so orchestrator collects them first.
- **`kubectl logs --previous` is lost on next pod restart.** Flag CrashLooping pods explicitly as P0.
- **Record retention windows.** A 15-day Prometheus retention means we can query incident_time backward, but only that far. Older incident → less coverage.

## Related

- Parent: `storage-incident-response`
- Previous phase: `incident-quarantine`
- Next phase: `evidence-collection-orchestrator`
- Memory: [[feedback_incident_quarantine_then_forensics]]
