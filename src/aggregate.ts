import { scanClaude, type ClaudeSkill } from "./claude.js";
import { scanCodex, type CodexSkill } from "./codex.js";
import { preferredSkillIdentity, skillId } from "./skill.js";

type Agent = "codex" | "claude";
type InvocationKind = "explicit" | "agent" | "inferred";
export type Scope = "all" | Agent;
type Skill = CodexSkill | ClaudeSkill;

export type AggregateSkill = {
  available: boolean;
  byAgent: Partial<Record<Agent, number>>;
  byInvocationKind: Record<InvocationKind, number>;
  id: string;
  members: Agent[];
  name: string;
  source: Skill["source"];
  sourceHint?: string;
  total: number;
};

export type AggregateScan = { hasReadableData: boolean; skills: AggregateSkill[]; warnings: string[] };

function agentOf(skill: Skill): Agent {
  return skill.members[0];
}

function disambiguate(skills: AggregateSkill[]): void {
  const byName = Map.groupBy(skills, (skill) => skill.name);
  for (const matches of byName.values()) {
    if (matches.length < 2) continue;
    const sources = new Set(matches.map((skill) => skill.source));
    const memberships = matches.map((skill) => skill.members.join("+"));
    const uniqueMemberships = new Set(memberships).size === matches.length;
    for (const [index, skill] of matches.entries()) {
      skill.sourceHint = sources.size === matches.length ? skill.source
        : uniqueMemberships ? memberships[index]
          : `${skill.source}-${skill.id.slice(-4)}`;
    }
  }
}

function groupByIdentity(skills: Skill[]): Skill[][] {
  const parents = skills.map((_, index) => index);
  const find = (index: number): number => parents[index] === index ? index : (parents[index] = find(parents[index]));
  const seen = new Map<string, number>();
  for (const [index, skill] of skills.entries()) {
    for (const identity of skill.identities) {
      const match = seen.get(identity.key);
      if (match === undefined) seen.set(identity.key, index);
      else parents[find(index)] = find(match);
    }
  }
  return [...Map.groupBy(skills, (_, index) => find(index)).values()];
}

export function aggregate(scope: Scope): AggregateScan {
  const scans = { codex: scanCodex(), claude: scanClaude() };
  const selectedAgents: Agent[] = scope === "all" ? ["codex", "claude"] : [scope];
  const groups = groupByIdentity([...scans.codex.skills, ...scans.claude.skills]);
  const skills = groups.flatMap((group): AggregateSkill[] => {
    const records = group.filter((record) => selectedAgents.includes(agentOf(record)));
    if (!records.length) return [];
    const byAgent: Partial<Record<Agent, number>> = {};
    const byInvocationKind = { explicit: 0, agent: 0, inferred: 0 };
    for (const record of records) {
      const agent = agentOf(record);
      byAgent[agent] = (byAgent[agent] ?? 0) + record.byAgent[agent as keyof typeof record.byAgent];
      for (const kind of Object.keys(byInvocationKind) as InvocationKind[]) {
        byInvocationKind[kind] += record.byInvocationKind[kind];
      }
    }
    const members = (["codex", "claude"] as const).filter((agent) => agent in byAgent);
    const identity = preferredSkillIdentity(group.flatMap((record) => record.identities));
    const namedRecord = records.toSorted((left, right) => left.name.localeCompare(right.name))[0];
    return [{
      available: records.some((record) => record.available), byAgent, byInvocationKind,
      id: skillId(identity.key), members, name: namedRecord.name, source: namedRecord.source,
      total: Object.values(byAgent).reduce((sum, count) => sum + count, 0)
    }];
  });

  disambiguate(skills);
  skills.sort((left, right) => right.total - left.total || left.name.localeCompare(right.name)
    || (left.sourceHint ?? "").localeCompare(right.sourceHint ?? "") || left.id.localeCompare(right.id));
  return {
    hasReadableData: selectedAgents.some((agent) => scans[agent].inventoryReadable || scans[agent].historyReadable),
    skills, warnings: selectedAgents.flatMap((agent) => scans[agent].warnings)
  };
}
