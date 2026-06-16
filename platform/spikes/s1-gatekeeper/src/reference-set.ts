// Programmatic generation of the REFERENCE policy set and entity store used for
// the NF-004 benchmark (spec S1 exit criterion: >= 200 policies, >= 5000 entities).
//
// Domain model (Cedar):
//   Principal: Agent          — a SPIFFE-identified workload, member of one or more Team groups
//   Action:    Action::"invoke" (per-call) and Action::"list" (tool listing)
//   Resource:  Tool           — an MCP tool, tagged with env, danger, team ownership
//
// The generated policy mix is realistic for a governed-mutation gatekeeper:
//   - per-team PERMIT policies scoped by tool environment + team ownership
//   - global FORBID guards (irreversible / prod-danger) that override
//   - read-only PERMIT for low-risk tools
//
// Entities: agents + teams + tools, well over 5000 total.

import type { PolicySet, Entities, EntityJson } from "@cedar-policy/cedar-wasm/nodejs";

export interface ReferenceSet {
  policies: PolicySet;
  entities: Entities;
  agents: string[]; // agent ids
  tools: string[]; // tool ids
  teams: string[]; // team group ids
  counts: { policies: number; entities: number; agents: number; tools: number; teams: number };
}

export interface GenOptions {
  teams?: number;
  agentsPerTeam?: number;
  toolsPerTeam?: number;
  globalGuards?: number;
}

const ENVS = ["prod", "staging", "dev"] as const;

export function generateReferenceSet(opts: GenOptions = {}): ReferenceSet {
  // Defaults chosen to satisfy the S1 reference-size floor: >= 200 policies
  // (2 per team + guards => 100 teams = 200 + privileged + 2 guards = 208) and
  // >= 5000 entities (100 teams + 400 agents + 5500 tools + 2 actions = 5902).
  const teams = opts.teams ?? 100;
  const agentsPerTeam = opts.agentsPerTeam ?? 4; // 400 agents
  const toolsPerTeam = opts.toolsPerTeam ?? 55; // 5500 tools
  const globalGuards = opts.globalGuards ?? 6;

  const entities: EntityJson[] = [];
  const agentIds: string[] = [];
  const toolIds: string[] = [];
  const teamIds: string[] = [];
  const staticPolicies: Record<string, string> = {};
  let polN = 0;

  // Stable Action entities.
  entities.push({ uid: { type: "Action", id: "invoke" }, attrs: {}, parents: [] });
  entities.push({ uid: { type: "Action", id: "list" }, attrs: {}, parents: [] });

  for (let t = 0; t < teams; t++) {
    const teamId = `team-${t}`;
    teamIds.push(teamId);
    entities.push({ uid: { type: "Team", id: teamId }, attrs: {}, parents: [] });

    // Agents belong to the team (Cedar group membership via parents).
    for (let a = 0; a < agentsPerTeam; a++) {
      const agentId = `t${t}-agent-${a}`;
      agentIds.push(agentId);
      entities.push({
        uid: { type: "Agent", id: agentId },
        attrs: { team: agentId.split("-agent-")[0] },
        parents: [{ type: "Team", id: teamId }],
      });
    }

    // Tools owned by the team, spread across environments and risk classes.
    for (let k = 0; k < toolsPerTeam; k++) {
      const toolId = `t${t}-tool-${k}`;
      toolIds.push(toolId);
      const env = ENVS[k % ENVS.length];
      const danger = k % 7 === 0; // ~14% are "dangerous" mutations
      const readOnly = k % 3 === 0;
      entities.push({
        uid: { type: "Tool", id: toolId },
        attrs: { env, danger, read_only: readOnly, owner_team: teamId },
        parents: [{ type: "Team", id: teamId }],
      });
    }

    // Per-team PERMIT: members may invoke non-dangerous tools owned by their team
    // in staging/dev, and read-only tools anywhere.
    staticPolicies[`pol_team_${t}_invoke`] =
      `permit(\n` +
      `  principal in Team::"${teamId}",\n` +
      `  action == Action::"invoke",\n` +
      `  resource in Team::"${teamId}"\n` +
      `) when {\n` +
      `  resource.read_only == true || resource.env != "prod"\n` +
      `};`;
    polN++;

    // Per-team listing PERMIT (broad; the residual + forbids constrain it).
    staticPolicies[`pol_team_${t}_list`] =
      `permit(\n` +
      `  principal in Team::"${teamId}",\n` +
      `  action == Action::"list",\n` +
      `  resource in Team::"${teamId}"\n` +
      `);`;
    polN++;
  }

  // A handful of privileged agents may invoke prod tools (SRE on-call style).
  // Pick the agent 0 of teams 0..(globalGuards-1) as privileged for variety.
  for (let g = 0; g < Math.min(globalGuards, teams); g++) {
    const agentId = `t${g}-agent-0`;
    staticPolicies[`pol_priv_${g}`] =
      `permit(\n` +
      `  principal == Agent::"${agentId}",\n` +
      `  action == Action::"invoke",\n` +
      `  resource\n` +
      `) when { resource.env == "prod" && resource.danger == false };`;
    polN++;
  }

  // Global FORBID guards that OVERRIDE all permits (Cedar: forbid wins).
  // GOV: dangerous + prod tools are never auto-invocable; this is the guard the
  // gatekeeper relies on to force escalation.
  staticPolicies["pol_guard_prod_danger"] =
    `forbid(principal, action == Action::"invoke", resource)\n` +
    `when { resource.danger == true && resource.env == "prod" };`;
  polN++;
  staticPolicies["pol_guard_no_cross_team_invoke"] =
    `forbid(principal, action == Action::"invoke", resource)\n` +
    `when { !(resource has owner_team) };`;
  polN++;

  return {
    policies: { staticPolicies },
    entities,
    agents: agentIds,
    tools: toolIds,
    teams: teamIds,
    counts: {
      policies: polN,
      entities: entities.length,
      agents: agentIds.length,
      tools: toolIds.length,
      teams: teamIds.length,
    },
  };
}
