# Security & Networking Agent Skills, MCPs, Sub-agents, and Plugins

> Part 2 of 4 of the "Agent Ecosystems for DevOps & Security/Networking" practitioner reference (input corpus for the enterprise AgentOps platform research on branch `research/enterprise-agentops-platform`). Current as of May 2026.

## Networking (general)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| `network-engineer` agent | [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents/tree/main/categories/03-infrastructure) | Claude Code subagent | General L2–L7 troubleshooting persona. |
| `senior-secops` skill | [alirezarezvani/claude-skills `engineering-team`](https://github.com/alirezarezvani/claude-skills/tree/main/engineering-team) | Cross-agent | Network-hardening patterns. |

## Network security (firewalls, IDS/IPS, Snort, Suricata, Zeek)

Sparse purpose-built skills. Practitioners use:

- `defense-in-depth` listed in [BehiSecc/awesome-claude-skills](https://github.com/BehiSecc/awesome-claude-skills).
- Suricata/Snort rule generation via `detection-engineer` inside [gl0bal01/malware-analysis-claude-skills](https://github.com/gl0bal01/malware-analysis-claude-skills) (YARA/Sigma/Suricata + IOC defanging).

## Overlay Networks (VXLAN, Geneve, Cilium, Calico, Weave, Flannel)

- **Cilium**: CNCF Graduated. No flagship Cilium-specific MCP yet; drive via `kubernetes-mcp-server` CRDs ([cilium/cilium](https://github.com/cilium/cilium)). `cilium-dbg`/`cilium connectivity test` runnable via shell MCP.
- **Calico / Weave / Flannel**: Sparse — no notable agent tooling.

## WireGuard (mesh networks, Tailscale/Headscale/Netbird/Innernet)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| `meshpop/wire` | [mcpmarket.com/server/wire-1](https://mcpmarket.com/server/wire-1) | MCP | Self-hosted WireGuard mesh, NAT traversal, AI-managed topology. |
| `doxx.net Tunnel Manager` | [mcpmarket.com](https://mcpmarket.com/tools/skills/doxx-net-tunnel-manager-1) | Claude Code skill | Tunnel lifecycle, QR for mobile. |
| `jschmid6/ha-wireguard-client-addon-wireguard-config` | [LobeHub](https://lobehub.com/skills/jschmid6-ha-wireguard-client-addon-wireguard-config) | LobeHub skill | Generates per-target iptables FORWARD/DNAT rules instead of blanket forwarding. |
| URnetwork | [docs.ur.io/mcp/skill](https://docs.ur.io/mcp/skill) | MCP skill | Location-aware WireGuard/HTTPS/SOCKS proxy creation. |
| `Nolaan/ai_vpn_mcp` | [GitHub](https://github.com/Nolaan/ai_vpn_mcp) | MCP | VPN tunnel orchestration. |
| `DynamicDevices/ai-lab-testing` VPN MCP | [docs/VPN_SETUP.md](https://github.com/DynamicDevices/ai-lab-testing/blob/main/docs/VPN_SETUP.md) | MCP | Auto-detects WireGuard configs in standard locations; remote embedded test rig. |
| Tailscale / Headscale / Netbird / Innernet | Sparse first-party MCPs. Use shell wrappers + [`trailofbits/dropkit`](https://github.com/trailofbits/claude-code-config) for ephemeral droplet pattern. | — | — |

## Corporate Firewalls (Palo Alto, Fortinet, Cisco ASA, Checkpoint, pfSense, OPNsense)

Sparse — no notable production-grade Claude-native skills. Best path: vendor REST APIs through custom MCP wrappers.

## Routers (Cisco IOS, Juniper Junos, MikroTik, Ubiquiti, OpenWrt, NETCONF/RESTCONF)

Sparse. Community MCPs handle config snippets through shell + SSH MCP servers.

## Managed Switches (Cisco Catalyst, Arista)

Sparse — no notable agent-native skill.

## Corporate Networking Concepts (VLANs, STP, LAG)

Sparse. Encoded in general `network-engineer` subagent docs.

## NAT / DNAT

Best coverage in WireGuard skills above — `jschmid6` HA add-on ships full DNAT + FORWARD generation. Also `iptables` patterns appear in [Cilium documentation](https://github.com/cilium/cilium).

## IPv6 / IPv4 (dual-stack, prefix delegation)

Sparse — no purpose-built skills.

## BGP (FRR, BIRD, BGP peering)

Sparse. Cilium has a built-in BGP control plane drivable via K8s MCP CRDs (`CiliumBGPPeeringPolicy`). No FRR/BIRD-specific skill at production grade.

## eBPF (Cilium, Pixie, Tetragon, Falco, bpftrace)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| Cilium / Hubble / Tetragon | [cilium/cilium](https://github.com/cilium/cilium) | Native eBPF | Drive via `kubernetes-mcp-server` CRDs. Hubble flow visibility + Tetragon inline enforcement at kernel level. |
| Pixie | New Relic-owned; no MCP. | Sparse | — |
| Falco | Sparse first-party MCP. | — | — |
| bpftrace | Wrap via shell MCP. | — | — |

## Virtual networking (libvirt, OVS, OVN, KVM)

Sparse first-party skills. Use KubeVirt toolset in `containers/kubernetes-mcp-server` for VM networking on K8s.

## SSH (key management, jump hosts, bastions, SSH certs, Teleport, Boundary)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| `ferrislucas/iterm-mcp` | listed in [WagnerAgent/awesome-mcp-servers-devops](https://github.com/WagnerAgent/awesome-mcp-servers-devops) | MCP | iTerm session control. |
| Remote SSH/SFTP MCP with 43 tools | same | MCP | Docker, monitoring, DB, file ops, jump-host support. |
| `trailofbits/dropkit` | linked from [trailofbits/claude-code-config](https://github.com/trailofbits/claude-code-config) | CLI tool | Ephemeral DigitalOcean droplets with Tailscale; "create, run Claude Code, destroy when done." |
| Teleport / Boundary | Sparse — no notable agent skill. | — | — |

## Tunneling (Cloudflare Tunnel, ngrok, SSH tunneling, frp, rathole)

Sparse first-party MCPs. Cloudflare has comprehensive Workers/Pages MCP coverage ([mcp.directory](https://mcp.directory/servers/hashicorp-terraform)) including Tunnel. ngrok / frp / rathole — wrap via shell MCP.

## Zero Trust Networking (BeyondCorp, identity-aware proxy)

Sparse. Embedded in `senior-secops` skill ([alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills)).

## DNS (BIND, CoreDNS, ExternalDNS, DNSSEC)

Sparse purpose-built. ExternalDNS managed via `kubernetes-mcp-server` CRDs.

## TLS / PKI (cert-manager, Let's Encrypt, internal CA, mTLS)

Sparse purpose-built. cert-manager via K8s MCP CRDs.

## Penetration testing & red teaming (infrastructure overlap)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| `Eyadkelleh/awesome-claude-skills-security` | [GitHub](https://github.com/Eyadkelleh/awesome-claude-skills-security) | Claude Code marketplace | SecLists, fuzzing payloads, web shells, LLM testing prompts. |
| `bug-bounty-hunter` agent | same | Claude Code | Scope-aware recon, OWASP testing, mobile testing workflows. |
| Trail of Bits skill suite | [trailofbits/skills](https://github.com/trailofbits/skills) | Claude Code marketplace | Smart-contract security, CodeQL static analysis, constant-time analysis, audit-report writing. |
| Shodan + CVE MCP, ORKL threat intel, VirusTotal MCP | listed in [WagnerAgent/awesome-mcp-servers-devops](https://github.com/WagnerAgent/awesome-mcp-servers-devops) | MCP | Threat-intel sourcing. |

## Threat hunting & SOC automation

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| `gl0bal01/malware-analysis-claude-skills` | [GitHub](https://github.com/gl0bal01/malware-analysis-claude-skills) | Claude skills (5 sub-skills + orchestrator) | Triage, dynamic analysis, specialized file analyzer (.NET, Office macros, PDFs, scripts, HTA, disk images, ELF, .lnk), detection engineering (YARA/Sigma/Suricata + IOC defanging), enterprise report writing. Optional VirusTotal + abuse.ch MCP integration. Install: `npx skills add gl0bal01/malware-analysis-claude-skills`. |
| `detection-engineer` skill | inside above | Claude | YARA/Sigma/Suricata rule generation. |

## Forensics & incident investigation

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| `AlabamaMike/forensic-skills` | [GitHub](https://github.com/AlabamaMike/forensic-skills) | Claude Code | **CODE forensics (NOT DFIR)** — 11 skills + 2 slash commands inspired by Adam Tornhill's *Your Code as a Crime Scene*: `forensic-hotspot-finder` (4–9× defect correlation), `forensic-knowledge-mapping` (bus factor), `forensic-change-coupling`, `forensic-complexity-trends`. Useful for repo archaeology, not for digital incident response. |
| `gl0bal01/malware-analysis-claude-skills` | (see above) | Claude | The real DFIR-adjacent suite. |
| Ghidra / Ghidra-Analysis MCPs | listed in [WagnerAgent/awesome-mcp-servers-devops](https://github.com/WagnerAgent/awesome-mcp-servers-devops) | MCP | Reverse engineering. |
| CyberChef API MCP | same | MCP | Encoding/decoding workflows. |

## IAM & identity (Okta, Auth0, Keycloak, AWS IAM Identity Center)

Sparse first-party MCPs. AWS IAM through AWS Official MCP suite. Okta / Auth0 / Keycloak — no flagship MCP yet.

## Compliance (CIS, NIST, SOC 2, PCI-DSS, HIPAA)

| Name | Source | Ecosystem | Description |
|---|---|---|---|
| `mdr-745-specialist` skill | [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) | Cross-agent | EU MDR Annex II compliance checks (regulated medical). |
| Compliance skill cluster | same library | Cross-agent | SOC 2 / PCI / HIPAA mapping documents. |
| Trail of Bits CodeQL Security skill | [mcpmarket.com](https://mcpmarket.com/tools/skills/trail-of-bits-codeql-security) | Claude Code | Multi-language CodeQL packs (C++, Go, Java, Python, JavaScript) for vuln classes; integrate in CI. |
| `owasp-security` skill | listed in [BehiSecc/awesome-claude-skills](https://github.com/BehiSecc/awesome-claude-skills) | Claude | OWASP Top-10:2025 + ASVS 5.0 + Agentic AI 2026. |
