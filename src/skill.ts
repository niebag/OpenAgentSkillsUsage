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
    let canonicalDirectory: string;
    let entries;
    try {
      canonicalDirectory = realpathSync(directory);
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    if (visited.has(canonicalDirectory) || excluded.has(canonicalDirectory)) return;
    visited.add(canonicalDirectory);
    for (const entry of entries) {
      const path = join(directory, entry.name);
      let isDirectory = entry.isDirectory();
      let isFile = entry.isFile();
      try {
        if (entry.isSymbolicLink() && existsSync(path)) {
          const target = statSync(path);
          isDirectory = target.isDirectory();
          isFile = target.isFile();
        }
      } catch { continue; }
      if (isDirectory) visit(path);
      else if (isFile && entry.name === "SKILL.md") files.push(path);
    }
  };
  visit(root);
  return files;
}

export function readableDirectory(path: string): boolean {
  try {
    readdirSync(path);
    return true;
  } catch {
    return false;
  }
}
