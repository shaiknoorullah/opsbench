# Reference Architecture — Hybrid Kubernetes Mesh

> A reference network architecture for hybrid Kubernetes clusters spanning multiple cloud providers, commodity VPS, and on-premises hardware, connected by a WireGuard mesh under Calico VXLAN. Distilled from real production operations, sanitized for general use.

This document describes:

- The realistic *as-built* topology of a 4-zone hybrid Kubernetes cluster
- The packet path through 4 encapsulation layers
- Where the architecture breaks under load and why
- A path matrix for every inter-zone/intra-zone traffic combination
- Anti-patterns that experienced operators learn the hard way
- Mitigations and a phased target architecture
- A decision tree for placing new workloads

It is companion material to the skills in this repository (`storage-incident-response`, the 33 specialized subagents, etc.). Use it as a network reference when running any incident response or recovery in a comparable topology.

---

## 1. The four zones

A representative hybrid cluster has four zones with different characteristics:

| Zone | Description | Underlay | Public IPs | Private LAN | Mesh IP range |
|---|---|---|---|---|---|
| **Zone A — Primary cloud** | Managed bare-metal / managed K8s host hardware in a metro region | internal private LAN (`10.10.0.0/24`) + per-host public IP | yes | n/a — internal LAN is the private path | `10.50.0.1`, `10.50.0.2` |
| **Zone B — Commodity VPS** | Lower-cost VPS provider in the same metro region; private-network add-on available | provider private VLAN (`10.0.0.0/22`) + per-VPS public IP | yes | yes — `eth1 = 10.0.0.x` | `10.50.0.11..16` |
| **Zone C — Secondary cloud (witness)** | A second cloud provider in an adjacent region, used as a quorum witness only | cloud VNet + public IP | yes | n/a | `10.50.0.30` |
| **Zone D — On-prem** | Office/colocated hardware behind NAT; no public IP | LAN behind home/office NAT | **no** | n/a | `10.50.0.20` (declared, often unreachable) |

The cluster IDs, IP addresses, and node names in this document are illustrative. Real deployments will have different specifics, but the four-zone shape is common.

---

## 2. The four-layer encapsulation stack

For pod-to-pod traffic anywhere in this cluster:

```
Pod A (10.1.X.Y on node A in zone X)
  │
  │   ① Pod veth → Calico VXLAN encapsulation
  │      (vxlan.calico, id=4096, dstport=4789, MTU=1230, vxlanMode=Always)
  │      Cost: kernel VXLAN module — per-packet src/dst MAC + UDP encap
  ▼
  VXLAN(IPv4 src = 10.50.0.X → dst = 10.50.0.Y)
  │
  │   ② vxlan.calico → wg0 (WireGuard)
  │      Cost: kernel WireGuard module — Curve25519 + ChaCha20-Poly1305 encrypt
  ▼
  WireGuard(public-key authenticated UDP, 1420-byte payload)
  │
  │   ③ wg0 → physical interface
  │      Endpoint selection depends on peer:
  │        intra-Zone-B (configured peers):  eth1 = 10.0.0.X (private VLAN) — fast wire
  │        intra-Zone-B (unconfigured peer): eth0 = public IP — public internet (bug)
  │        cross-zone (any pair):            eth0 = public IP — public internet
  ▼
  UDP/IP on wire
  │
  ▼
  Node B receives → ③' decap WG → ②' decap VXLAN → ①' deliver to Pod B
```

**Four CPU-bound encap/decap steps per packet.** The wire itself is fast (private VLAN: ~0.5 ms physical; public internet ~2-4 ms physical). The CPU work dominates under load.

**Critical implication**: when a node is CPU-saturated (load1 > 4×cores), the kernel can't service VXLAN + WireGuard worker threads on schedule. Packets queue. 100-200 ms intra-zone jitter emerges — **not from the wire**, from the kernel scheduler.

You cannot fix this jitter by changing transports. The fixes are:

- Reducing the number of encap layers (e.g., `vxlanMode: CrossSubnet`)
- Reducing CPU pressure on hot nodes
- Tuning app-layer timeouts to absorb the variability
- Co-locating tightly-coupled workloads

---

## 3. Path matrix — what packet path each traffic class takes

### 3.1 Pod-to-pod (default workloads)

| Source zone | Dest zone | Path | Expected RTT (unsaturated) | Caveats |
|---|---|---|---|---|
| Zone B | Zone B (same node) | localhost loopback | <1 ms | None |
| Zone B | Zone B (cross-node, both on private VLAN) | VXLAN → WG → eth1 (private VLAN) | 1-3 ms | CPU-bound; jitter under saturation |
| Zone B | Zone B (one peer is misconfigured for public endpoint) | VXLAN → WG → eth0 (public IP) | 3-8 ms | + public internet routing variability |
| Zone B | Zone A | VXLAN → WG → eth0 (public IP) → Zone A internal | 4-10 ms | Cross-DC; one-way over public internet |
| Zone A | Zone A (same node) | localhost | <1 ms | None |
| Zone A | Zone A (cross-node) | VXLAN → eth0 (Zone A internal LAN) | <1 ms | No WireGuard layer; pure VXLAN |
| Zone A | Zone C witness | VXLAN → WG → eth0 (public IP) → Zone C VNet | 30-60 ms | Cross-region; expected high latency |
| Zone B | Zone C witness | VXLAN → WG → eth0 (public IP) → Zone C VNet | 30-60 ms | Same |
| ANY | Zone D (on-prem) | **typically unreachable** | n/a | RFC1918 endpoint; needs NAT-traversal solution |

### 3.2 Kubernetes control-plane traffic (kubelet ↔ apiserver, etcd, etc.)

| Source zone | Dest zone | Path | Caveat |
|---|---|---|---|
| Zone B node | Zone A apiserver | direct via public IP (Zone B NodeIP commonly the public IP) | **Does NOT use the WireGuard mesh.** Cross-zone control-plane traffic uses public internet. |
| Zone A node | Zone A apiserver | direct via Zone A internal LAN | Fast, internal |
| Zone C | Zone A apiserver | direct via Zone C → public → Zone A | Cross-region |
| Zone D | Zone A apiserver | via remote-admin SSH (Azure Arc, Tailscale, etc.) only | Direct K8s control plane usually not feasible without WG reachability |

### 3.3 Distributed storage traffic (e.g., Longhorn engine ↔ replicas, Ceph OSD peer)

Same as 3.1 (pod-to-pod) — storage replication rides on the overlay. Hot path: cross-host replica sync = full 4-layer encap.

### 3.4 DNS

| Source | Path |
|---|---|
| Pod on a zone without a local CoreDNS replica | VXLAN → WG → eth0 → zone-with-CoreDNS internal → CoreDNS pod |
| Pod on a zone with a local CoreDNS replica | VXLAN → in-zone CoreDNS pod (fast) |

If CoreDNS pods are unevenly distributed (e.g., all in Zone A), every Zone-B or Zone-C pod's DNS query crosses the WG overlay.

### 3.5 External egress

| Source | Path |
|---|---|
| Pod (any zone) | `natOutgoing: true` → SNAT to node's public IP → ISP → external service |
| CoreDNS upstream forward | CoreDNS pod → configured upstream (e.g., 1.1.1.1) — intermittent timeouts seen on saturated paths |

---

## 4. Confirmed failure modes

These are the recurring problems observed in production on this kind of topology. Each is real evidence, not theoretical.

### F1 — NodeIP set to public IP instead of private LAN address

```
kubectl get node zone-b.node-1 -o jsonpath='{.status.addresses}'
[{"address":"<public-IP>","type":"InternalIP"}]
```

When the K8s `InternalIP` is the public address, several things misbehave:

- `kube-proxy` SNAT rules use public IPs
- NodePort/LoadBalancer Service endpoints are advertised on public IPs
- Cross-node K8s control-plane traffic traverses the public internet
- The pod overlay (Calico) is unaffected because it uses its own VXLAN tunnel address, but everything else is misrouted

**Fix**: set kubelet `--node-ip=<private-LAN-IP>` on each affected node.

### F2 — One zone-B peer misconfigured for public endpoint

If most Zone-B peers correctly use private-VLAN endpoints for the WireGuard mesh but one or two use public IPs (often due to a re-installed node not picking up the private network attachment), that node's traffic with its zone-mates pays the public-internet latency penalty.

**Fix**: ensure the configuration management for Zone B includes a per-node `wg_endpoint_private` value and re-runs after any node reinstall.

### F3 — On-prem zone unreachable from the mesh

Endpoint is an RFC1918 address (e.g., `172.17.0.X:51820`) that isn't routable from any other peer. Bidirectional `NO_HANDSHAKE`.

**Fix options**:

- Port-forward on the office router + dynamic DNS for the WAN IP
- Use a relay (the Zone-C witness, with its stable public IP, as a WireGuard rendezvous)
- Accept that the on-prem zone is read-only / management-only and exclude it from K8s data plane

### F4 — Cluster service FQDN macros produce malformed names

Some operators (especially in StatefulSets with per-pod headless Services) require careful template configuration of host FQDNs. A common bug: the macro uses the per-pod Service name as both the hostname label AND the service subdomain — but the actual pod hostname includes the StatefulSet ordinal `-0`.

```
Incorrect:  <svc-name>.<svc-name>.<ns>.svc.cluster.local        → NXDOMAIN
Correct:    <svc-name>-0.<svc-name>.<ns>.svc.cluster.local      → resolves
```

This is a CR/operator-config bug, not a CoreDNS failure. Hard to diagnose without an `nslookup` from inside the affected pod.

**Fix**: correct the host pattern in the workload's CR. If the operator is in a non-reconciling state (e.g., "Aborted"), fix the operator first.

### F5 — CoreDNS zone imbalance

CoreDNS deployment has insufficient `topologySpreadConstraints`, leading to all CoreDNS pods scheduled in one zone. Every other zone's pods cross the overlay for every DNS query.

**Fix**: increase CoreDNS replicas + add `topologySpreadConstraints` keyed on `topology.kubernetes.io/zone`, with explicit tolerations for tainted commodity-VPS workers.

### F6 — Intra-zone overlay jitter from CPU saturation

Observation: same-zone pod-to-pod RTT can spike to **5-200 ms** on a private VLAN (where the physical wire is sub-millisecond). Root cause is kernel scheduler starvation on the saturated node — VXLAN + WG worker threads queue.

**Fix**:

- Eliminate the VXLAN layer with `vxlanMode: CrossSubnet` for same-subnet peers
- Reduce CPU pressure on hot nodes (workload rebalancing)
- Bump app-layer timeouts (storage replica timeouts, database heartbeats, RPC timeouts) to absorb the jitter

### F7 — Asymmetric TX drops on one zone's VXLAN tunnel

Zone-A nodes can show 100-1000× more TX drops on `vxlan.calico` than other zones. Usually indicates UDP socket buffer pressure or kernel send-buffer exhaustion under load.

**Fix**: tune `net.core.wmem_max`, `net.core.rmem_max`, `net.ipv4.udp_wmem_min`. Investigate which workloads on the affected nodes generate the most overlay TX.

### F8 — No WireGuard metrics in Prometheus

`node_exporter` not built with `--collector.wireguard`. No historical handshake recency or per-peer RX/TX rate data.

**Fix**: rebuild node-exporter with the wireguard collector enabled, or deploy `wireguard_exporter` as a sidecar.

### F9 — CoreDNS upstream-forward i/o timeouts

```
[ERROR] plugin/errors: read udp ... ->1.1.1.1:53: i/o timeout
```

External DNS resolution intermittently fails. Doesn't affect cluster-local lookups but breaks external-service lookups (cloud APIs, vault, package mirrors).

**Fix**: configure CoreDNS with redundant upstream resolvers and a fast-failure policy.

---

## 5. Anti-patterns

Things experienced operators learn not to do, given the constraints above.

| Anti-pattern | Why it bites |
|---|---|
| **Aggressive RPC timeouts (< 10s) on cross-zone calls** | Cross-zone overlay routinely shows 50-150 ms jitter; a 5s timeout will produce false positives under load |
| **Synchronous replication across zones** (e.g., Postgres synchronous_mode_strict cross-zone) | Synchronous-mode write tolerance must accommodate WG mesh variability; not realistic at 99.99% availability |
| **Default distributed-storage replica timeouts (e.g., 8s)** on cross-zone replicas | 8s budget burns through on a single jitter spike. Volume goes degraded; engine returns synthetic SCSI errors; kernel JBD2 abort; filesystem RO. |
| **`replicas: 3` without explicit zone-spreading** | Replicas can land 2-of-3 on the same physical host class → SPOF. Use explicit `topologyKey` zone-spreading. |
| **Cross-zone quorum services (etcd, ZooKeeper, Keeper) without zone-aware placement** | Quorum loss when a zone is partitioned; if 2 of 3 land in the same zone, the SPOF is at the host level too |
| **DNS queries from zones without a local CoreDNS replica** | Every query crosses the WG overlay; jitter compounds for high-QPS lookups |
| **Long-lived TCP connections without keepalive across zones** | WG endpoint changes silently drop connections without RST; app discovers via read timeout |
| **Public IPs as K8s NodeIP** | Inter-node K8s control plane uses public internet |
| **`vxlanMode: Always`** when most traffic is intra-subnet | Forces VXLAN encapsulation for in-subnet pod traffic that could route plainly. CPU cost for no isolation benefit. |
| **Trusting library code that builds FQDNs as `<host>.<service>.<ns>.svc.cluster.local`** from a single host parameter | The doubled-FQDN bug. Libraries that pre-build hostname patterns can fail in StatefulSet contexts. |

---

## 6. Mitigation patterns

### 6.1 Tune timeouts to absorb overlay jitter

| Knob | Default | Recommended for hybrid mesh |
|---|---|---|
| Distributed-storage replica timeout (e.g., Longhorn `engine-replica-timeout`) | 8 s | **30 s** |
| Patroni / Postgres-HA `ttl` | 30 s | **60 s** for cross-zone clusters |
| Patroni `retry_timeout` | 10 s | **30 s** |
| Patroni `loop_wait` | 10 s | leave (10 s) |
| etcd `heartbeat-interval` | 100 ms | **500 ms** for cross-zone members |
| TCP keepalive (Postgres / app) | OS default | `tcp_keepalives_idle=60`, `tcp_keepalives_interval=10`, `tcp_keepalives_count=6` |
| K8s API server `request-timeout` | 60 s | leave |
| HTTP client timeouts in apps | varies | **30 s minimum** for cross-zone calls; retries with exponential backoff |

### 6.2 Topology-aware placement

For every StatefulSet/Deployment hosting stateful or latency-sensitive workloads:

```yaml
spec:
  affinity:
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchLabels:
            app: <name>
        topologyKey: kubernetes.io/hostname     # spread across distinct hosts
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app: <name>
          topologyKey: topology.kubernetes.io/zone   # ALSO spread across zones when possible
```

For distributed storage (Longhorn, OpenEBS, Portworx, Ceph), set explicit per-storage-class zone selectors and verify the replica spread before any heavy I/O operation.

### 6.3 Zone-aware DNS

Deploy CoreDNS with `topologySpreadConstraints`:

```yaml
spec:
  template:
    spec:
      topologySpreadConstraints:
      - maxSkew: 1
        topologyKey: topology.kubernetes.io/zone
        whenUnsatisfiable: ScheduleAnyway
        labelSelector:
          matchLabels:
            k8s-app: kube-dns
      tolerations:
      - key: <commodity-vps-taint-key>
        operator: Equal
        value: <taint-value>
        effect: NoSchedule
```

Bump replicas to 3-4. Result: every zone has at least one local CoreDNS pod.

### 6.4 Skip the VXLAN layer for same-subnet traffic

Switch Calico to `vxlanMode: CrossSubnet`:

```yaml
apiVersion: crd.projectcalico.org/v1
kind: IPPool
metadata:
  name: default-ipv4-ippool
spec:
  cidr: 10.1.0.0/16
  vxlanMode: CrossSubnet   # was: Always
  natOutgoing: true
  nodeSelector: all()
```

Effect: pods on the same L2 subnet (both on a private VLAN) route plain IP without VXLAN encap. Cross-subnet (e.g., Zone B ↔ Zone A) still uses VXLAN. The WireGuard layer is unaffected — it still handles authentication and cross-zone routing.

**Requires**: each node's IP annotation correctly reflects its subnet (Calico's default node subnet detection works in most cases; verify with `calicoctl get nodes -o yaml`).

**Risk**: low. Same-subnet routing is well-tested in Calico. Rollback by switching back to `Always`.

### 6.5 K8s NodeIP = private LAN address

For each Zone-B node, update kubelet:

```bash
# kubelet args (path varies by distro)
--node-ip=10.0.0.X
```

After restart, `kubectl get node ... -o wide` should show `INTERNAL-IP=10.0.0.X`.

**Benefit**: kube-proxy SNAT, NodePort traffic, and inter-node control-plane traffic all use the private VLAN.

**Risk**: medium — coordinate kubelet's perception with Calico's node IP annotation. Test on one node before rolling out.

### 6.6 NAT-traversed endpoint for on-prem zone

Three options (pick one):

1. **Port-forward on the office router**: `51820/udp → 172.17.0.X` + dynamic DNS for the WAN IP. Configure `Endpoint=<dyndns-name>:51820` on other peers' WG config.
2. **Rendezvous via the witness zone**: configure the on-prem node to maintain an outbound WireGuard connection to the Zone-C witness (which has a stable public IP); other peers route to on-prem via the witness. Adds 1 hop, costs ~30-60 ms RTT.
3. **Accept that on-prem is management-only**: keep it out of the K8s data plane; use remote-admin SSH for access only.

### 6.7 Co-locate latency-sensitive replicas

For workloads where sync-replica latency < 5 ms is non-negotiable, co-locate primary + sync standby on the same node:

```yaml
spec:
  affinity:
    podAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchLabels:
            app: <name>
            role: primary
        topologyKey: kubernetes.io/hostname
```

Anti-HA but pragmatic. Use only where the alternative (cross-node sync replication on a high-jitter overlay) is unacceptable.

---

## 7. Phased target architecture

Recommended order for moving from the as-built state to a stable, fast, predictable hybrid mesh.

### Phase 1 — Quick wins (no service disruption)

| Item | Action | Risk | Service impact |
|---|---|---|---|
| Increase distributed-storage replica timeout 8s → 30s | Edit storage backend setting | Low | None — only triggers under failure |
| Increase Patroni `ttl` / `retry_timeout` | Update postgresql CRs | Low | One rolling restart per cluster |
| Add CoreDNS replicas + zone topology spread | Patch coredns Deployment | Low | None |
| Fix any misconfigured Zone-B private-VLAN endpoints | Re-run config management | Low | Brief WG handshake re-establish (<5 s) |
| Tune Zone-A node UDP/VXLAN buffer sysctls | sysctl on affected nodes | Low | None |

### Phase 2 — Topology / control-plane fixes (one node at a time)

| Item | Action | Risk | Service impact |
|---|---|---|---|
| `vxlanMode: Always → CrossSubnet` | Update default IP pool | Medium | Brief pod-network re-converge across all nodes |
| Set `NodeIP=<private-LAN>` on Zone-B nodes (rolling) | kubelet args + restart | Medium | Per-node ~30 s pod evictions during restart |
| Fix any operator-Aborted state | Manual operator intervention | Medium | Affected workload pods may restart |
| Re-spread coordination-service quorum pods across 3 distinct hosts | Patch quorum CR | Low-Medium | Brief quorum re-election |

### Phase 3 — Structural (planned change windows)

| Item | Action | Risk | Service impact |
|---|---|---|---|
| Resolve on-prem mesh isolation | Pick option from §6.6 + implement | Medium | n/a — on-prem usually isn't carrying production yet |
| Add Prometheus WireGuard metric collection | Rebuild node-exporter or deploy sidecar | Low | None |
| Configure CoreDNS redundant upstream resolvers | ConfigMap patch | Low | None |

---

## 8. Decision tree — placing a new workload

```
Q1: Does this workload need <5 ms latency to its sibling replicas?
  YES → Co-locate on same node OR same zone with pod affinity (§6.7)
  NO  → continue

Q2: Is this workload stateful (database, cache, message broker)?
  YES → 
    Q2a: Latency-sensitive write path?
      YES → Same-zone replicas only. Cross-zone for backup only.
      NO  → Cross-zone OK; use timeouts from §6.1 + topology spread (§6.2)
  NO (stateless) → place anywhere; let scheduler decide

Q3: Does this workload need large single-volume storage (>200 GB)?
  YES → Zone B (commodity VPS) is typically the only zone with affordable
        large block storage.
  NO  → Zone A or Zone B.

Q4: Is this workload CPU-heavy?
  YES → 
    Q4a: Does its CPU pressure affect storage co-tenants on the same node?
      → Avoid Zone-B nodes with active distributed-storage replicas (F6 risk)
    Q4b: Otherwise, Zone-A worker is preferred (no WG overhead for intra-zone).

Q5: Does this workload need external network egress?
  YES → 
    Q5a: To cloud APIs (KV, blob, registry)?
      → Tolerate CoreDNS upstream timeouts (F9) — add retries
    Q5b: To public internet (LLM APIs, etc.)?
      → No specific path advantage; egress SNAT to node's public IP

Q6: Will this workload's clients connect from cross-zone?
  YES → Set HTTP timeout ≥30 s; add retries; never assume <100 ms
  NO  → standard tuning OK
```

---

## 9. Related skills in this repository

This architecture document pairs with the incident-response skills in this repo. When investigating any problem in a hybrid mesh of this shape:

- **`storage-incident-response`** — master skill for storage/EIO/data-corruption incidents (most failures involve the overlay)
- **`incident-quarantine`** — isolate affected workloads before forensics
- **`evidence-source-discovery`** + **`evidence-collection-orchestrator`** — gather the per-zone evidence outlined in §4
- **`parallel-hypothesis-debug`** — investigate hypotheses across the four encap layers in parallel
- **`forensic-synthesis`** — produce verdict.md citing specific evidence from the corpus

The 33 specialized subagents in `agents/` map to these phases.

---

## 10. Why this matters

Most "the database is slow" or "the storage failed" or "DNS isn't working" incidents in a hybrid Kubernetes cluster actually trace back to one or more of the patterns in §4. The packet path through 4 encap layers is the single most important fact about this kind of topology — and the one most often ignored.

If you operate a comparable cluster and find yourself debugging mysterious latency spikes, intermittent DNS failures, or distributed-storage replica timeouts that "shouldn't be possible" — start here.

---

## License

MIT — see [LICENSE](../../LICENSE).
