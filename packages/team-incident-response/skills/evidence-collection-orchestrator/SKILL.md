---
name: evidence-collection-orchestrator
description: Use after evidence-source-discovery to actually collect evidence per the collection-plan.yaml. Dispatches parallel collector subagents (one per source family — control plane, nodes, observability, storage, network, app-layer, security, platform). Wraps replicatedhq/troubleshoot (troubleshoot.sh) for the K8s+DB layer where it applies; adds thin native collectors for node-level, CNI-specific, observability snapshots, and chain-of-custody work the SDK doesn't cover. Writes everything to round-N/evidence/ with strict OpenShift must-gather-style directory structure.
---

# Evidence Collection Orchestrator

## When to invoke

- `storage-incident-response` calls this as Phase 3 (after evidence-source-discovery)
- A `collection-plan.yaml` exists for this incident
- This is round N=1 (initial collection) OR round N>1 (driven by `round-N/request.md` from a prior verdict)

## The principle

```
COLLECT WHAT THE PLAN SAYS, ON A DEADLINE, WITH PROVENANCE
```

Collection is not analysis. Collection captures the state of the world at incident time as completely as the discovery layer found possible. Every artifact gets a manifest entry. Every command run gets logged.

## Directory layout (OpenShift must-gather + extensions)

```
<handoff>/<incident-id>/round-<N>/
├── request.md                # (round-N>1 only) what was asked for and why
├── evidence/
│   ├── cluster-scoped/
│   │   ├── nodes.yaml
│   │   ├── namespaces.yaml
│   │   ├── customresourcedefinitions.yaml
│   │   ├── events.yaml        # P0 — 1h TTL — collect FIRST
│   │   └── persistentvolumes.yaml
│   ├── namespaces/
│   │   └── <ns>/
│   │       ├── <group>/
│   │       │   └── <kind>.yaml
│   │       └── pods/<pod>/
│   │           ├── pod.yaml
│   │           ├── logs/<container>.current.log
│   │           └── logs/<container>.previous.log   # P0 if CrashLoop
│   ├── nodes/
│   │   └── <node>/
│   │       ├── journalctl-kernel.log
│   │       ├── journalctl-<service>.log
│   │       ├── dmesg.log
│   │       ├── iostat.log
│   │       ├── vmstat.log
│   │       ├── ps-auxf.log
│   │       ├── lsblk.log
│   │       ├── mount.log
│   │       ├── ip-addr.log
│   │       ├── ip-route.log
│   │       ├── conntrack-count.log
│   │       ├── wg-show.log
│   │       └── smart-<dev>.txt
│   ├── network/
│   │   ├── calico/<node>/felix.log
│   │   ├── cilium/<node>/cilium-status.log
│   │   └── wireguard/<node>/wg-show.log
│   ├── storage/
│   │   ├── longhorn/
│   │   │   ├── volumes/<pvc>.yaml
│   │   │   ├── replicas/<pvc>/<replica>.yaml
│   │   │   ├── engines/<pvc>/<engine>.yaml
│   │   │   ├── instance-manager-logs/<node>.log
│   │   │   └── longhorn-manager.log
│   │   └── ceph/
│   │       └── (if applicable)
│   ├── observability/
│   │   ├── prometheus/
│   │   │   ├── query_range-<metric>.json    # one file per query
│   │   │   └── query-snapshot.txt
│   │   ├── loki/
│   │   │   └── range_query-<labels>.ndjson
│   │   └── tempo/
│   │       └── traces-<traceid>.json
│   ├── app-layer/
│   │   ├── postgres/<cluster>/<pod>/{pg_stat_activity.tsv,pg_stat_replication.tsv}
│   │   └── clickhouse/<chi>/<pod>/{system.replicas.tsv,system.replication_queue.tsv,system.parts.tsv}
│   ├── security/
│   │   ├── falco/events.ndjson
│   │   └── audit/k8s-audit.ndjson
│   ├── platform/
│   │   ├── cntb/instance-<id>.json
│   │   └── azure/activity-log.json
│   └── artifacts/               # operator's own artifacts (commits, configs, screenshots)
├── catalog.md                   # produced by evidence-cataloger
├── manifest.sha256              # produced by evidence-cataloger
└── custody.log                  # appended to during collection
```

## Wrap existing tools where they fit

For K8s + databases, use `replicatedhq/troubleshoot` (<https://troubleshoot.sh>):

```bash
# Generate support bundle via troubleshoot.sh
kubectl support-bundle https://kots.io/support-bundle/longhorn.yaml -o /tmp/sb.tar.gz
# Then extract into round-N/evidence/ following our naming convention
```

For OpenShift clusters: use `oc adm must-gather`.

Native collectors only for what those tools don't cover well:

- Node-level (`journalctl`, `dmesg`, `iostat`, `smartctl`) — too host-specific for SDK
- CNI-specific (Felix log, Cilium status, WireGuard handshake) — varies per cluster
- Observability snapshots (Prometheus range queries, Loki labels) — needs specific PromQL/LogQL
- Chain-of-custody (SHA-256, custody log) — done by `evidence-cataloger`

## Dispatch pattern

One collector subagent per source family in `collection-plan.yaml`. Run in parallel via `Agent({run_in_background: true})`.

```
- control-plane-collector: kubectl events FIRST, then get all -A -o yaml
- node-collector: per-node SSH + journal/dmesg/iostat/smart
- observability-collector: Prometheus range queries + Loki LogQL pulls
- storage-collector: Longhorn CRDs + engine/replica logs + ceph status
- network-collector: Felix logs + WireGuard show + iptables-save
- app-layer-collector: per-DB system tables → TSV
- security-collector: Falco events + K8s audit
- platform-collector: cloud audit log + cntb/cloud-CLI dump
```

Each collector receives:

- Its slice of `collection-plan.yaml`
- The exact output directory it must write to
- A handoff manifest writer to log "STARTED <cmd>" / "DONE <file> <sha256>" entries to `custody.log`
- Read-only mandate (collection is observation, not mutation)

## Collector subagent prompt template

```
You are a <source-family>-collector for incident <id>, round <N>.

## Your slice of the collection plan
<paste sources.<family> from collection-plan.yaml>

## Output directory
<handoff>/<id>/round-<N>/evidence/<family>/

## Custody log
Append one line per command/file to <handoff>/<id>/custody.log in format:
  <ISO8601-UTC> | <family>-collector | <cmd> | <output-file> | <sha256-or-status>

## Rules
- Read-only on the cluster (no kubectl apply/delete/edit/scale)
- Preserve original bytes; do not pretty-print or reformat
- For commands that emit volumes of data, gzip output (extension .log.gz / .json.gz)
- For each artifact you write, compute sha256 immediately: sha256sum <file> >> manifest.sha256.partial
- If a source is unreachable (timeout, NotFound), log it as STATUS=UNREACHABLE in custody.log
  — do NOT silently skip; document the gap
- Hard deadline: <wall-clock budget per family> minutes; if exceeded, write partial collection + flag

## Report
- Number of artifacts collected
- Total bytes
- Failed sources (with reason)
- Manifest partial path
```

## P0 — collect FIRST regardless of order

1. **K8s events** (1-hour TTL) — `kubectl get events -A --sort-by='.lastTimestamp' -o yaml > events.yaml`
2. **`kubectl logs --previous`** for any pod in CrashLoopBackOff (lost on next restart)
3. **`dmesg -T`** on all suspect nodes (kernel ring buffer can roll over)

## Hard rules

- Read-only on the cluster.
- No `kubectl debug` that mutates state.
- No reboots, no fsck during collection.
- Preserve byte-for-byte; do not transform.
- Every file written must produce a `custody.log` entry with sha256.
- If a collector fails, document it — never silently skip.
- Default wall-clock budget: 15 min per family. If exceeded, write partial + flag.

## Related

- Parent: `storage-incident-response`
- Previous phase: `evidence-source-discovery`
- Next phase: `evidence-cataloger`
- Templates: `templates/collection-plan-template.yaml`, `templates/collector-prompt-template.md`
