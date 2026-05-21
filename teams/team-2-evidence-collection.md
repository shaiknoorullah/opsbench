---
name: team-2-evidence-collection
description: Discovers available evidence sources, then dispatches 7 parallel collectors (control plane, nodes, observability, storage, network, app-layer, security) per source family. Writes to round-N/evidence/. Wraps replicatedhq/troubleshoot for K8s+DB layer; adds native collectors for everything else. Invoked once per round.
---

# Team 2 — Evidence collection

## Composition

| Subagent | Role |
|---|---|
| `evidence-source-discoverer` | Phase 2: read-only inventory of all available evidence sources. Emits `collection-plan.yaml`. |
| `controlplane-collector` | Phase 3 collector: etcd snapshots, kube-apiserver audit, controller-manager events |
| `node-collector` | Phase 3 collector: dmesg, journalctl, /proc, ip/route/ss, iptables-save per node |
| `observability-collector` | Phase 3 collector: Prometheus TSDB ranges, Loki LogQL ranges, Tempo traces |
| `storage-collector` | Phase 3 collector: Longhorn engine + replica logs, volume CRDs, ceph-mgr |
| `network-collector` | Phase 3 collector: Calico/Cilium state, NetworkPolicy, WireGuard peer status, tcpdump |
| `app-layer-collector` | Phase 3 collector: pg_stat_*, ClickHouse system.*, replication state |

## Sequencing (within team)

```
evidence-source-discoverer (Phase 2, sequential)
  └── emits collection-plan.yaml
      └── incident-commander fans out 7 collectors IN PARALLEL (Phase 3):
            ├── controlplane-collector
            ├── node-collector
            ├── observability-collector
            ├── storage-collector
            ├── network-collector
            ├── app-layer-collector
            └── (optional: 7th custom-domain collector per discovery findings)
```

## Inputs

- `<incident_dir>/timeline.md` (read for context)
- For round N>1: `<incident_dir>/round-<N>/request.md` (from evidence-requester)

## Outputs

- `<incident_dir>/collection-plan.yaml` (Phase 2; or `round-<N>/collection-plan.yaml` for N>1)
- `<incident_dir>/round-<N>/evidence/<family>/...` (Phase 3, per family)

## Hooks involved

- `PreToolUse` → Cedar gates: all collectors READ-ONLY against cluster (`k8s::list`, `k8s::get`, `prometheus::query` allowed; `k8s::scale`, `k8s::apply` denied)
- `PostToolUse` → every artifact gets SHA-256'd + custody.log appended + timeline entry via timeline-keeper

## Schemas enforced

- Collection plan: `schemas/collection-plan.schema.json`

## Hard rules

- READ-ONLY on cluster. Cedar policy denies all mutations from collectors.
- Per-family wall-clock budget: 15 min default; adjustable per round
- K8s events (1h TTL) collected FIRST; CrashLooping pod logs collected FIRST
- Document `UNREACHABLE` / `TIMEOUT` / `PERMISSION_DENIED` explicitly — never silently skip
- All write paths under `<incident_dir>/round-<N>/evidence/<family>/` — Cedar policy denies writes outside this prefix

## Wraps

- `replicatedhq/troubleshoot` (`troubleshoot.sh`) for K8s+DB layer where applicable
- Native collectors only for what troubleshoot doesn't cover well

## Related

- Previous team: `team-1-command`
- Next team: `team-3-cataloging`
- Triggered (round N≥2) by: `team-8-loop-control` evidence-requester
