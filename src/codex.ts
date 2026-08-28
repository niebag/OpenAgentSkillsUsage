import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readSync, realpathSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { StringDecoder } from "node:string_decoder";
import {
  findSkillByIdentity, installationIdentities, preferredSkillIdentity, skillFiles, skillId, skillIdentity,
  readableDirectory, skillIdentityMap, type SkillIdentity
} from "./skill.js";

type InvocationKind = "explicit" | "agent" | "inferred";
type Source = "global" | "system" | "project" | "plugin";

type Skill = {
  aliases: Set<string>;
  available: boolean;
  byInvocationKind: Record<InvocationKind, number>;
  id: string;
  identities: Map<string, SkillIdentity>;
  name: string;
  paths: Set<string>;
  source: Source | "history";
  uses: Map<string, InvocationKind>;
};

export type CodexSkill = {
  available: boolean;
  byAgent: { codex: number };
  byInvocationKind: Record<InvocationKind, number>;
  id: string;
  identities: SkillIdentity[];
  members: ["codex"];
  name: string;
  source: Source | "history";
  total: number;
};

export type CodexScan = { historyReadable: boolean; inventoryReadable: boolean; skills: CodexSkill[]; warnings: string[] };

const precedence: Record<InvocationKind, number> = { inferred: 1, agent: 2, explicit: 3 };

function skillName(path: string): string {
  const content = readFileSync(path, "utf8");
  return content.match(/^name:\s*["']?([^\n"']+)/m)?.[1].trim() || basename(resolve(path, ".."));
}

function addAvailableSkill(
  skills: Map<string, Skill>, path: string, source: Source, namespace?: string, identity?: string, warnings?: string[]
): boolean {
  try {
    const canonical = realpathSync(path);
    const identities = installationIdentities(canonical, identity);
    const localName = skillName(canonical);
    const name = namespace ? `${namespace}:${localName}` : localName;
    const skill = findSkillByIdentity(skills.values(), identities) ?? (() => {
      const id = skillId(preferredSkillIdentity(identities).key);
      const created: Skill = {
        aliases: new Set<string>(), available: true,
        byInvocationKind: { explicit: 0, agent: 0, inferred: 0 }, id, name,
        identities: new Map<string, SkillIdentity>(), paths: new Set<string>(), source,
        uses: new Map<string, InvocationKind>()
      };
      skills.set(id, created);
      return created;
    })();
    skill.aliases.add(name);
    skill.aliases.add(localName);
    for (const value of identities) skill.identities.set(value.key, value);
    skill.paths.add(path);
    skill.paths.add(canonical);
    return true;
  } catch {
    warnings?.push("Codex skipped an unreadable Skill file.");
    return false;
  }
}

function recordUse(skill: Skill, turn: string, kind: InvocationKind): void {
  const current = skill.uses.get(turn);
  if (!current || precedence[kind] > precedence[current]) skill.uses.set(turn, kind);
}

function addUse(skills: Map<string, Skill>, name: string, turn: string, kind: InvocationKind): void {
  const matches = [...skills.values()].filter((skill) => skill.aliases.has(name));
  const sourceRank: Record<Skill["source"], number> = { global: 4, project: 3, system: 2, plugin: 1, history: 0 };
  const bestRank = Math.max(...matches.map((match) => sourceRank[match.source]));
  const best = matches.filter((skill) => sourceRank[skill.source] === bestRank);
  const skill = best.length === 1 ? best[0] : (() => {
    const id = skillId(`codex:history:${name}`);
    const history = skills.get(id) ?? {
      aliases: new Set([name]), available: false,
      byInvocationKind: { explicit: 0, agent: 0, inferred: 0 }, id,
      identities: skillIdentityMap(skillIdentity("history", `codex:${name}`)),
      name: /^[\w:-]+$/.test(name) ? name : `unknown-${id.slice(-8)}`,
      paths: new Set<string>(), source: "history" as const, uses: new Map<string, InvocationKind>()
    };
    skills.set(id, history);
    return history;
  })();
  recordUse(skill, turn, kind);
}

function addHistoricalUse(
  skills: Map<string, Skill>,
  path: string,
  codexHome: string,
  pluginRoots: Map<string, string>,
  turn: string
): void {
  const canonical = existsSync(path) ? realpathSync(path) : path;
  const localName = existsSync(canonical) ? skillName(canonical) : basename(resolve(canonical, ".."));
  const cacheRoot = join(codexHome, "plugins", "cache");
  const cachePath = existsSync(cacheRoot) ? realpathSync(cacheRoot) : cacheRoot;
  const cacheSegments = relative(cachePath, canonical).split(sep);
  const cachedPluginName = cacheSegments[0] !== ".." && cacheSegments[3] === "skills" ? cacheSegments[1] : undefined;
  const authoritativePluginName = [...pluginRoots].find(([root]) => canonical.startsWith(`${root}${sep}`))?.[1];
  const pluginName = authoritativePluginName ?? cachedPluginName;
  const name = pluginName ? `${pluginName}:${localName}` : localName;
  const id = skillId(`history-path:${canonical}`);
  const skill = skills.get(id) ?? {
    aliases: new Set([name, localName]), available: false,
    byInvocationKind: { explicit: 0, agent: 0, inferred: 0 }, id, name,
    identities: skillIdentityMap(skillIdentity("history", `codex:path:${canonical}`)),
    paths: new Set([path, canonical]), source: "history" as const, uses: new Map<string, InvocationKind>()
  };
  skills.set(id, skill);
  recordUse(skill, turn, "inferred");
}

function projectRoots(cwd: string): string[] {
  let root = resolve(cwd);
  for (;;) {
    if (existsSync(join(root, ".git"))) break;
    const parent = resolve(root, "..");
    if (parent === root) return [join(resolve(cwd), ".agents", "skills")];
    root = parent;
  }
  const roots: string[] = [];
  for (let directory = resolve(cwd); ; directory = resolve(directory, "..")) {
    roots.push(join(directory, ".agents", "skills"));
    if (directory === root) return roots;
  }
}

function parsePluginSkills(skills: Map<string, Skill>, warnings: string[], codexHome: string): Map<string, string> {
  const pluginRoots = new Map<string, string>();
  let inventory: unknown;
  try {
    inventory = JSON.parse(execFileSync("codex", ["plugin", "list", "--json"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
    }));
  } catch {
    warnings.push("Codex plugin inventory is unavailable.");
    return pluginRoots;
  }
  const installed = inventory && typeof inventory === "object" ? (inventory as { installed?: unknown }).installed : undefined;
  if (!Array.isArray(installed)) {
    warnings.push("Codex plugin inventory is unreadable.");
    return pluginRoots;
  }
  for (const entry of installed) {
    if (!entry || typeof entry !== "object") continue;
    const plugin = entry as Record<string, unknown>;
    if (plugin.installed !== true || typeof plugin.name !== "string") continue;
    const source = plugin.source && typeof plugin.source === "object" ? plugin.source as Record<string, unknown> : {};
    const root = typeof source.path === "string" ? source.path
      : typeof plugin.marketplaceName === "string" && typeof plugin.version === "string"
        ? join(codexHome, "plugins", "cache", plugin.marketplaceName, plugin.name, plugin.version)
        : undefined;
    if (!root || !existsSync(root)) continue;
    pluginRoots.set(realpathSync(root), plugin.name);
    if (plugin.enabled !== true) continue;
    for (const file of skillFiles(join(root, "skills"))) {
      const identity = typeof plugin.pluginId === "string"
        ? `plugin:${plugin.pluginId}:${relative(root, file)}` : undefined;
      addAvailableSkill(skills, file, "plugin", plugin.name, identity, warnings);
    }
  }
  return pluginRoots;
}

function sessionFiles(root: string): { files: string[]; readable: boolean; unavailable: boolean } {
  const readable = readableDirectory(root);
  if (!readable) return { files: [], readable, unavailable: existsSync(root) };
  const files: string[] = [];
  let unavailable = false;
  const visit = (directory: string): void => {
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { unavailable = true; return; }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(path);
    }
  };
  visit(root);
  return { files, readable, unavailable };
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

function toolInput(payload: Record<string, unknown>): unknown {
  const input = payload.input ?? payload.arguments;
  if (typeof input !== "string") return input;
  try { return JSON.parse(input) as unknown; } catch { return input; }
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringValues);
  return [];
}

function execCommands(name: string, input: unknown): string[] {
  if (input && typeof input === "object") {
    const command = (input as Record<string, unknown>).cmd;
    return typeof command === "string" ? [command] : [];
  }
  if (name !== "exec" || typeof input !== "string") return [];
  const commands: string[] = [];
  for (const match of input.matchAll(/["']?cmd["']?\s*:\s*"((?:\\.|[^"\\])*)"/g)) {
    try { commands.push(JSON.parse(`"${match[1]}"`) as string); } catch { commands.push(match[1]); }
  }
  return commands;
}

function skillReadPaths(payload: Record<string, unknown>, input: unknown): string[] {
  const name = typeof payload.name === "string" ? payload.name : "";
  const values = /^(?:read_file|read_mcp_resource|skills\.read)$/.test(name) ? stringValues(input)
    : (name === "exec" || name === "exec_command") ? execCommands(name, input)
      .filter((command) => /(?:^|[;&|]\s*)(?:cat|sed|head|tail|less|more|bat|rg|grep)\b/.test(command)) : [];
  const paths = new Set<string>();
  for (const value of values) {
    for (const match of value.matchAll(/["']((?:\/|\.\.?\/)[^"'\n]*\/SKILL\.md)["']/g)) paths.add(match[1]);
    for (const match of value.matchAll(/((?:\/|\.\.?\/)[^\s"'`;&|]*\/SKILL\.md)/g)) paths.add(match[1]);
  }
  return [...paths];
}

function scanSession(path: string, skills: Map<string, Skill>, codexHome: string, pluginRoots: Map<string, string>): number {
  let corrupt = 0;
  let turn = `session:${skillId(path)}`;
  let cwd: string | undefined;
  for (const line of lines(path)) {
    if (!line) continue;
    let record: { payload?: unknown; type?: unknown };
    try { record = JSON.parse(line) as typeof record; } catch { corrupt += 1; continue; }
    if (!record.payload || typeof record.payload !== "object") continue;
    const payload = record.payload as Record<string, unknown>;
    const metadata = payload.internal_chat_message_metadata_passthrough;
    const metadataTurn = metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>).turn_id : undefined;
    const recordTurn = typeof payload.turn_id === "string" ? payload.turn_id
      : typeof metadataTurn === "string" ? metadataTurn : undefined;
    if (record.type === "turn_context" || payload.type === "task_started") turn = recordTurn ?? turn;
    if (typeof payload.cwd === "string") cwd = payload.cwd;
    const useTurn = recordTurn ?? turn;

    if (record.type === "event_msg" && payload.type === "user_message") {
      const elements = Array.isArray(payload.text_elements) ? payload.text_elements : [];
      for (const element of elements) {
        if (!element || typeof element !== "object") continue;
        const placeholder = (element as Record<string, unknown>).placeholder;
        const match = typeof placeholder === "string" ? placeholder.match(/^\$([\w:-]+)$/) : undefined;
        if (match) addUse(skills, match[1], useTurn, "explicit");
      }
      const direct = typeof payload.message === "string" ? payload.message.match(/^\$([\w:-]+)(?:\s|$)/) : undefined;
      if (direct) addUse(skills, direct[1], useTurn, "explicit");
    }

    if (record.type !== "response_item" || (payload.type !== "custom_tool_call" && payload.type !== "function_call")) continue;
    const input = toolInput(payload);
    if (payload.name === "Skill" && input && typeof input === "object") {
      const name = (input as Record<string, unknown>).skill;
      if (typeof name === "string") addUse(skills, name, useTurn, "agent");
    }
    for (const reference of skillReadPaths(payload, input)) {
      const referencedPath = isAbsolute(reference) ? reference : cwd ? resolve(cwd, reference) : undefined;
      if (!referencedPath) continue;
      const canonical = existsSync(referencedPath) ? realpathSync(referencedPath) : referencedPath;
      const skill = [...skills.values()].find((candidate) => candidate.paths.has(reference)
        || candidate.paths.has(referencedPath) || candidate.paths.has(canonical));
      if (skill) recordUse(skill, useTurn, "inferred");
      else addHistoricalUse(skills, referencedPath, codexHome, pluginRoots, useTurn);
    }
  }
  return corrupt;
}

export function scanCodex(
  cwd = process.cwd(),
  home = homedir(),
  codexHome = process.env.CODEX_HOME || join(home, ".codex"),
  onProgress?: (percent: number) => void
): CodexScan {
  onProgress?.(0);
  const skills = new Map<string, Skill>();
  const warnings: string[] = [];
  const roots = [join(home, ".agents", "skills")];
  const systemRoot = join(codexHome, "skills", ".system");
  roots.push(join(codexHome, "skills"), systemRoot, ...projectRoots(cwd));
  let inventoryReadable = roots.some(readableDirectory);
  let readableInventoryFile = false;
  let unreadableInventoryFile = false;
  if (roots.some((root) => existsSync(root) && !readableDirectory(root))) warnings.push("Codex Skill inventory is partially unavailable.");
  for (const file of skillFiles(roots[0])) {
    const readable = addAvailableSkill(skills, file, "global", undefined, undefined, warnings);
    readableInventoryFile ||= readable;
    unreadableInventoryFile ||= !readable;
  }
  const excluded = readableDirectory(systemRoot) ? new Set([realpathSync(systemRoot)]) : undefined;
  for (const file of skillFiles(join(codexHome, "skills"), excluded)) {
    const readable = addAvailableSkill(skills, file, "global", undefined, undefined, warnings);
    readableInventoryFile ||= readable;
    unreadableInventoryFile ||= !readable;
  }
  for (const file of skillFiles(systemRoot)) {
    const readable = addAvailableSkill(skills, file, "system", undefined, undefined, warnings);
    readableInventoryFile ||= readable;
    unreadableInventoryFile ||= !readable;
  }
  for (const root of roots.slice(3)) {
    for (const file of skillFiles(root)) {
      const readable = addAvailableSkill(skills, file, "project", undefined, undefined, warnings);
      readableInventoryFile ||= readable;
      unreadableInventoryFile ||= !readable;
    }
  }
  const pluginRoots = parsePluginSkills(skills, warnings, codexHome);
  if (unreadableInventoryFile && !readableInventoryFile && !pluginRoots.size) inventoryReadable = false;
  inventoryReadable ||= pluginRoots.size > 0;
  onProgress?.(10);

  let corrupt = 0;
  const histories = [sessionFiles(join(codexHome, "sessions")), sessionFiles(join(codexHome, "archived_sessions"))];
  let unavailableHistory = histories.some((history) => history.unavailable);
  const historyPaths = histories.flatMap((history) => history.files);
  const historyFiles = historyPaths.length;
  let readableHistoryFile = false;
  for (const [index, path] of historyPaths.entries()) {
    try { corrupt += scanSession(path, skills, codexHome, pluginRoots); readableHistoryFile = true; } catch { unavailableHistory = true; }
    onProgress?.(10 + 90 * (index + 1) / historyFiles);
  }
  if (!historyFiles) onProgress?.(100);
  if (unavailableHistory) warnings.push("Codex Usage History is partially unavailable.");
  if (corrupt) warnings.push(`Codex skipped ${corrupt} malformed session record${corrupt === 1 ? "" : "s"}.`);

  return {
    skills: [...skills.values()].map((skill) => {
      for (const kind of Object.keys(skill.byInvocationKind) as InvocationKind[]) skill.byInvocationKind[kind] = 0;
      for (const kind of skill.uses.values()) skill.byInvocationKind[kind] += 1;
      const total = skill.uses.size;
      return {
        available: skill.available, byAgent: { codex: total }, byInvocationKind: skill.byInvocationKind,
        id: skill.id, identities: [...skill.identities.values()], members: ["codex"] as ["codex"],
        name: skill.name, source: skill.source, total
      };
    }).sort((left, right) => right.total - left.total || left.name.localeCompare(right.name)),
    historyReadable: histories.some((history) => history.readable) && (!historyFiles || readableHistoryFile), inventoryReadable,
    warnings
  };
}
