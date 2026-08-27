import { createHash } from "node:crypto";
import { existsSync, realpathSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type SkillIdentity = {
  key: string;
  kind: "history" | "path" | "plugin" | "system";
};

export function skillId(identity: string): string {
  return `skill-${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`;
}

export function skillIdentity(kind: SkillIdentity["kind"], evidence: string): SkillIdentity {
  return { key: skillId(`${kind}:${evidence}`), kind };
}

export function skillIdentityMap(...identities: SkillIdentity[]): Map<string, SkillIdentity> {
  return new Map(identities.map((identity) => [identity.key, identity]));
}

export function installationIdentities(canonicalPath: string, plugin?: string): SkillIdentity[] {
  return [skillIdentity("path", canonicalPath), ...(plugin ? [skillIdentity("plugin", plugin)] : [])];
}

export function preferredSkillIdentity(identities: SkillIdentity[]): SkillIdentity {
  return identities.filter((identity) => identity.kind === "plugin")
    .toSorted((left, right) => left.key.localeCompare(right.key))[0]
    ?? identities.toSorted((left, right) => left.key.localeCompare(right.key))[0];
}

export function findSkillByIdentity<T extends { identities: Map<string, SkillIdentity> }>(
  skills: Iterable<T>, identities: SkillIdentity[]
): T | undefined {
  return [...skills].find((skill) => identities.some((identity) => skill.identities.has(identity.key)));
}

export function skillFiles(root: string, excluded = new Set<string>()): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visited = new Set<string>();
  const visit = (directory: string): void => {
    const canonicalDirectory = realpathSync(directory);
    if (visited.has(canonicalDirectory) || excluded.has(canonicalDirectory)) return;
    visited.add(canonicalDirectory);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const target = entry.isSymbolicLink() && existsSync(path) ? statSync(path) : entry;
      if (target.isDirectory()) visit(path);
      else if (target.isFile() && entry.name === "SKILL.md") files.push(path);
    }
  };
  visit(root);
  return files;
}
