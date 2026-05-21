---
name: incident-quarantine
description: Use to isolate a failing or corrupted workload BEFORE forensics or recovery. Scales clients to 0, deletes aggregate Services, applies default-deny NetworkPolicy, and backs up state — all without disrupting the workload's internal coordination (ZK, Patroni, etcd, Keeper). Invoked as Phase 1 by storage-incident-response, but also usable standalone for any "stop the bleeding" scenario (data corruption, compromised service, runaway connections).
---

# Incident Quarantine

## When to invoke

- Master skill `storage-incident-response` calls this as Phase 1
- A workload is corrupting data and you need to STOP all writes immediately
- A workload is suspected compromised and external traffic must be cut
- An incident response demands evidence preservation (no new state mutations during forensics)
- A user asks: "isolate this", "quarantine this", "make this unavailable", "block all external traffic"

## The principle

```
SAVE STATE → STOP WRITERS → STOP READERS → CUT THE NAME → BLOCK THE NETWORK
```

Internal coordination services (ZK, Patroni HTTP, Keeper, Raft) must STAY running. Quarantine isolates from the OUTSIDE; the workload must stay internally consistent for forensics.

## Procedure

### Step 1: Create handoff directory and survey

```bash
WORKLOAD=<name>                          # e.g. chi-audit
PROJECT=$(basename $(git rev-parse --show-toplevel 2>/dev/null) || echo "ad-hoc")
DATE=$(date -u +%Y-%m-%d)
HANDOFF=~/work/.handoffs/$PROJECT/$DATE/quarantine-backup
mkdir -p $HANDOFF
cd $HANDOFF
```

### Step 2: Identify all clients

```bash
# Services in the target namespace
kubectl --context <ctx> -n <ns> get svc

# Which Services target the affected pods (by label selector match)
kubectl --context <ctx> -n <ns> get svc -o yaml | grep -B 2 -A 5 "<pod-label>"

# What namespaces reference the affected service by DNS
for NS in $(kubectl --context <ctx> get ns -o jsonpath='{.items[*].metadata.name}'); do
  if kubectl --context <ctx> -n $NS get cm,deploy,sts -o yaml 2>/dev/null | grep -q "<service-host>"; then
    echo "ns=$NS has refs"
  fi
done

# Active connections inside the affected pod (verify quarantine after applying)
kubectl --context <ctx> -n <ns> exec <pod> -c <container> -- <inspection-command>
# For ClickHouse: clickhouse-client --query "SELECT user, query_kind, count() FROM system.processes GROUP BY user, query_kind"
# For Postgres: psql -c "SELECT usename, state, count(*) FROM pg_stat_activity WHERE pid != pg_backend_pid() GROUP BY 1, 2"
```

### Step 3: Backup state

```bash
# Save current Service YAMLs
kubectl --context <ctx> -n <ns> get svc <agg-service> -o yaml > svc-<agg-service>.yaml
kubectl --context <ctx> -n <ns> get svc <per-pod-service-1> -o yaml > svc-<per-pod-service-1>.yaml

# Save Deployment specs and replica counts
kubectl --context <ctx> -n <client-ns> get deploy <client-1> <client-2> -o yaml > backup-clients.yaml
kubectl --context <ctx> -n <client-ns> get deploy <client-1> <client-2> -o jsonpath='{range .items[*]}{.metadata.name}={.spec.replicas}{"\n"}{end}' > replicas.txt

# Save existing NetworkPolicies
kubectl --context <ctx> -n <ns> get networkpolicy -o yaml > netpols.yaml

# Save Ingress / IngressRoute if external
kubectl --context <ctx> -A get ingress,ingressroutes -o yaml > ingresses.yaml
```

### Step 4: Scale writers to 0

```bash
kubectl --context <ctx> -n <client-ns> scale deploy <writer-1> --replicas=0
kubectl --context <ctx> -n <client-ns> scale deploy <writer-2> --replicas=0
# Wait for pods to terminate (verify)
kubectl --context <ctx> -n <client-ns> get pods -l app=<writer> --no-headers
```

### Step 5: Scale readers to 0

Even readers can write metadata (query logs, session tables). Stop them too.

```bash
kubectl --context <ctx> -n <client-ns> scale deploy <reader-1> --replicas=0
kubectl --context <ctx> -n <client-ns> scale deploy <reader-2> --replicas=0
```

### Step 6: Delete the aggregate Service

This breaks DNS for any client we haven't found. Keep per-pod headless Services intact so internal RMT/Patroni/Raft coordination continues.

```bash
kubectl --context <ctx> -n <ns> delete svc <agg-service>
# Verify per-pod Services still exist
kubectl --context <ctx> -n <ns> get svc | grep <workload>
```

### Step 7: Apply default-deny NetworkPolicy

Whitelist ONLY: (a) intra-pod traffic (workload talking to itself), (b) the coordination service (ZK, Keeper, etcd peers).

```bash
cat <<EOF | kubectl --context <ctx> apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: <workload>-quarantine
  namespace: <ns>
  annotations:
    pnats.cloud/created-by: "quarantine-${DATE}"
    pnats.cloud/reason: "<one-line incident description>"
spec:
  podSelector:
    matchLabels:
      <pod-selector-label>: <value>
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          <pod-selector-label>: <value>  # self
  - from:
    - podSelector:
        matchLabels:
          <coordination-label>: <coord-value>  # Keeper / Patroni / etcd
EOF
```

### Step 8: Verify quarantine

```bash
# 0 external connections in workload
kubectl --context <ctx> -n <ns> exec <pod> -c <container> -- <inspection-command>
# All client deploys should show 0/N
kubectl --context <ctx> -n <client-ns> get deploy <client-1> <client-2>
# Aggregate Service gone
kubectl --context <ctx> -n <ns> get svc <agg-service>  # should NotFound
# NetworkPolicy applied
kubectl --context <ctx> -n <ns> get networkpolicy <workload>-quarantine
```

### Step 9: Document

Write a short `quarantine-state.md` to the handoff directory:

```markdown
# Quarantine — <workload> — <UTC timestamp>

## Reason
<incident summary>

## Quarantined
- Clients scaled to 0: <list>
- Services deleted: <list>
- NetworkPolicy applied: <name>

## Reachable
- Internal coordination: <coord-service>
- kubectl exec: yes (via kubelet, not blocked by NetworkPolicy)

## Restore command
kubectl scale deploy <client-1> --replicas=1 -n <client-ns> && \\
kubectl apply -f svc-<agg-service>.yaml && \\
kubectl delete networkpolicy <workload>-quarantine -n <ns>
```

## Anti-patterns

- ❌ Deleting per-pod Services (kills internal coordination)
- ❌ Applying `policyTypes: [Ingress, Egress]` (breaks DNS lookups to Keeper/ZK)
- ❌ Skipping state backup ("we can recover from git") — Deployment replica counts and runtime annotations rarely survive in git
- ❌ Forcing pods to delete (use scale 0 — gives the workload a chance to flush coordinated state)
- ❌ Quarantining the coordination layer (ZK/etcd) — only quarantine data-plane pods

## Related

- Parent: `storage-incident-response`
- Next phase: `parallel-hypothesis-debug`
- Memory: [[feedback_incident_quarantine_then_forensics]], [[feedback_no_manual_kubectl_patches]]
