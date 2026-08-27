import { closeSync, existsSync, openSync, readFileSync, readSync, realpathSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import {
  findSkillByIdentity, installationIdentities, preferredSkillIdentity, skillFiles, skillId, skillIdentity,
  skillIdentityMap, type SkillIdentity
} from "./skill.js";

type InvocationKind = "explicit" | "agent" | "inferred";
type Source = "global" | "system" | "project" | "plugin";

type Skill = {
  aliases: Set<string>;
  available: boolean;
  byInvocationKind: Record<InvocationKind, number>;
  id: string;
  identities: Map<string, SkillIdentity>;
  members: Set<"claude">;
  name: string;
  source: Source | "history";
  uses: Map<string, InvocationKind>;
};

export type ClaudeSkill = {
  available: boolean;
  byAgent: { claude: number };
  byInvocationKind: Record<InvocationKind, number>;
  id: string;
  identities: SkillIdentity[];
  members: ["claude"];
  name: string;
  source: Source | "history";
  total: number;
};

export type ClaudeScan = { skills: ClaudeSkill[]; warnings: string[] };

const precedence: Record<InvocationKind, number> = { inferred: 1, agent: 2, explicit: 3 };

function skillName(path: string): string {
  const content = readFileSync(path, "utf8");
  return content.match(/^name:\s*["']?([^\n"']+)/m)?.[1].trim() || basename(resolve(path, ".."));
}

function addAvailableSkill(
  skills: Map<string, Skill>, path: string, source: Source, namespace?: string, identity?: string
): void {
  const canonical = realpathSync(path);
  const identities = installationIdentities(canonical, identity);
  const localName = skillName(canonical);
  const name = namespace ? `${namespace}:${localName}` : localName;
  const skill = findSkillByIdentity(skills.values(), identities) ?? (() => {
    const id = skillId(preferredSkillIdentity(identities).key);
    const created: Skill = {
      aliases: new Set<string>(), available: true,
      byInvocationKind: { explicit: 0, agent: 0, inferred: 0 }, id,
      identities: new Map<string, SkillIdentity>(), members: new Set<"claude">(["claude"]), name, source,
      uses: new Map<string, InvocationKind>()
    };
    skills.set(id, created);
    return created;
  })();
  skill.aliases.add(name);
  skill.aliases.add(localName);
  for (const value of identities) skill.identities.set(value.key, value);
}

function addSystemSkills(skills: Map<string, Skill>): void {
  for (const name of ["debug", "simplify"]) {
    const id = skillId(`system:${name}`);
    skills.set(id, {
      aliases: new Set([name]), available: true,
      byInvocationKind: { explicit: 0, agent: 0, inferred: 0 }, id,
      identities: skillIdentityMap(skillIdentity("system", name)),
      members: new Set<"claude">(["claude"]), name, source: "system", uses: new Map<string, InvocationKind>()
    });
  }
}

function claudeAvailable(): boolean {
  try {
    execFileSync("claude", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

function parsePluginSkills(skills: Map<string, Skill>, warnings: string[]): boolean {
  let plugins: unknown;
  try {
    plugins = JSON.parse(execFileSync("claude", ["plugin", "list", "--json"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
    }));
  } catch {
    warnings.push("Claude plugin inventory is unavailable.");
    return false;
  }

  if (!Array.isArray(plugins)) {
    warnings.push("Claude plugin inventory is unreadable.");
    return false;
  }

  for (const plugin of plugins) {
    if (!plugin || typeof plugin !== "object") continue;
    const { enabled, id, installPath } = plugin as Record<string, unknown>;
    if (enabled !== true || typeof id !== "string" || typeof installPath !== "string" || !existsSync(installPath)) continue;
    let namespace = id.split("@", 1)[0];
    try {
      const manifest = JSON.parse(readFileSync(join(installPath, ".claude-plugin", "plugin.json"), "utf8")) as { name?: unknown };
      if (typeof manifest.name === "string") namespace = manifest.name;
    } catch { /* The plugin id is the documented fallback namespace. */ }
    for (const file of skillFiles(join(installPath, "skills"))) {
      addAvailableSkill(skills, file, "plugin", namespace, `plugin:${id}:${relative(installPath, file)}`);
    }
  }
  return true;
}

function addUse(skills: Map<string, Skill>, name: string, turn: string, kind: InvocationKind): void {
  const matches = [...skills.values()].filter((skill) => skill.aliases.has(name));
  const sourceRank: Record<Skill["source"], number> = { global: 3, project: 2, system: 1, plugin: 0, history: 0 };
  const best = matches.filter((skill) => sourceRank[skill.source] === Math.max(...matches.map((match) => sourceRank[match.source])));
  const skill = best.length === 1 ? best[0] : (() => {
    const id = skillId(`claude:history:${name}`);
    const history = skills.get(id) ?? {
      aliases: new Set([name]), available: false,
      byInvocationKind: { explicit: 0, agent: 0, inferred: 0 }, id,
      identities: skillIdentityMap(skillIdentity("history", `claude:${name}`)),
      members: new Set<"claude">(["claude"]), name: /^[\w:-]+$/.test(name) ? name : `unknown-${skillId(name).slice(-8)}`,
      source: "history" as const, uses: new Map<string, InvocationKind>()
    };
    skills.set(id, history);
    return history;
  })();
  const current = skill.uses.get(turn);
  if (!current || precedence[kind] > precedence[current]) skill.uses.set(turn, kind);
}

type SessionRecord = {
  attributionSkill?: unknown;
  isMeta?: unknown;
  message?: { content?: unknown; role?: unknown };
  parentUuid?: unknown;
  toolUseResult?: unknown;
  type?: unknown;
  uuid?: unknown;
};

function sessionFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(path);
    }
  };
  visit(root);
  return files;
}

function projectRoots(cwd: string): string[] {
  let root = resolve(cwd);
  for (;;) {
    if (existsSync(join(root, ".git"))) break;
    const parent = resolve(root, "..");
    if (parent === root) return [resolve(cwd)];
    root = parent;
  }
  const roots: string[] = [];
  for (let directory = resolve(cwd); ; directory = resolve(directory, "..")) {
    roots.push(join(directory, ".claude", "skills"));
    if (directory === root) return roots;
  }
}

function* lines(path: string): Iterable<string> {
  const descriptor = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const decoder = new StringDecoder("utf8");
  let remainder = "";
  try {
    for (;;) {
      const bytes = readSync(descriptor, buffer, 0, buffer.length, null);
      if (!bytes) break;
      const text = remainder + decoder.write(buffer.subarray(0, bytes));
      const lastNewline = text.lastIndexOf("\n");
      if (lastNewline < 0) {
        remainder = text;
        continue;
      }
      yield* text.slice(0, lastNewline).split("\n");
      remainder = text.slice(lastNewline + 1);
    }
    const last = remainder + decoder.end();
    if (last) yield last;
  } finally {
    closeSync(descriptor);
  }
}

function scanSession(path: string, skills: Map<string, Skill>): number {
  const turns = new Map<string, string>();
  let corrupt = 0;
  for (const line of lines(path)) {
    if (!line) continue;
    let record: SessionRecord;
    try { record = JSON.parse(line) as SessionRecord; } catch { corrupt += 1; continue; }
    if (typeof record.uuid !== "string") continue;
    const isTurn = record.type === "user" && record.toolUseResult === undefined && record.isMeta !== true;
    const parent = typeof record.parentUuid === "string" ? turns.get(record.parentUuid) : undefined;
    const turn = isTurn ? record.uuid : parent ?? `orphan:${record.uuid}`;
    turns.set(record.uuid, turn);
    const content = record.message?.content;
    if (isTurn && typeof content === "string") {
      const command = content.match(/^\/([\w:-]+)(?:\s|$)/)?.[1];
      if (command) addUse(skills, command, turn, "explicit");
    }
    if (typeof record.attributionSkill === "string") addUse(skills, record.attributionSkill, turn, "inferred");
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const tool = item as { input?: { skill?: unknown }; name?: unknown; type?: unknown };
      if (tool.type === "tool_use" && tool.name === "Skill" && typeof tool.input?.skill === "string") {
        addUse(skills, tool.input.skill, turn, "agent");
      }
    }
  }
  return corrupt;
}

export function scanClaude(cwd = process.cwd(), home = homedir()): ClaudeScan {
  const skills = new Map<string, Skill>();
  const warnings: string[] = [];
  for (const file of skillFiles(join(home, ".claude", "skills"))) addAvailableSkill(skills, file, "global");
  for (const root of projectRoots(cwd)) {
    for (const file of skillFiles(root)) addAvailableSkill(skills, file, "project");
  }
  if (parsePluginSkills(skills, warnings) || claudeAvailable()) addSystemSkills(skills);

  let corrupt = 0;
  for (const path of sessionFiles(join(home, ".claude", "projects"))) corrupt += scanSession(path, skills);
  for (const path of sessionFiles(join(home, ".claude", "archived_sessions"))) corrupt += scanSession(path, skills);
  if (corrupt) warnings.push(`Claude skipped ${corrupt} malformed session record${corrupt === 1 ? "" : "s"}.`);

  return {
    skills: [...skills.values()].map((skill) => {
      for (const kind of Object.keys(skill.byInvocationKind) as InvocationKind[]) skill.byInvocationKind[kind] = 0;
      for (const kind of skill.uses.values()) skill.byInvocationKind[kind] += 1;
      const total = skill.uses.size;
      return {
        available: skill.available, byAgent: { claude: total }, byInvocationKind: skill.byInvocationKind,
        id: skill.id, identities: [...skill.identities.values()], members: ["claude"] as ["claude"],
        name: skill.name, source: skill.source, total
      };
    }).sort((left, right) => right.total - left.total || left.name.localeCompare(right.name)),
    warnings
  };
}
