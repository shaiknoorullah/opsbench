# Security policy

## Supported versions

opsbench follows [Semantic Versioning](https://semver.org/). Security patches are issued for the latest minor of each supported major release:

| Version | Supported |
| ------- | --------- |
| 3.x     | Yes       |
| 2.x     | Critical fixes only |
| < 2.0   | No        |

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Email: `snoorullah@proficientnow.com` with subject `[opsbench-security] <short title>`.

Alternatively, use GitHub's [private vulnerability reporting](https://github.com/shaiknoorullah/opsbench/security/advisories/new).

Please include:

1. A description of the vulnerability and its impact.
2. Steps to reproduce.
3. Affected versions / components.
4. Suggested mitigation if you have one.

You will receive an acknowledgement within 72 hours. We aim to triage within 7 days and to publish a fix or coordinated disclosure within 30 days for high-severity issues.

## Threat model

opsbench is a **toolkit**, not a runtime — it ships text artifacts (skills, agents, schemas, policies, scripts) that the user installs into their Claude Code config dir. The threat surface includes:

- **Installer (`scripts/install.sh`)** — runs as the invoking user; downloads from GitHub releases over HTTPS. Issues here are high severity.
- **Hooks (`packages/*/hooks/*.sh`)** — run on every Claude Code tool invocation. A malicious hook can exfiltrate, persist, or escalate.
- **Cedar policies (`packages/*/policies/*.cedar`)** — define what each agent may do. A weakened policy is a privilege-escalation vector for the *user's* agents.
- **Skill / agent prompts** — instruct downstream LLMs. Prompt injection or unsafe defaults that bypass policy / human approval gates are in-scope.

Out of scope: vulnerabilities in upstream LLM providers, in Claude Code itself, or in the user's MCP server choices.

## Public disclosure

Once a fix is released, we publish a GitHub Security Advisory with CVE coordination via MITRE.
