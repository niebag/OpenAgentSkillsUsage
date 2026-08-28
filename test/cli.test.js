import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cli = new URL("../dist/cli.js", import.meta.url).pathname;

function run(options, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", ...options });
}

test("CLI exposes the v1 contract", () => {
  const root = mkdtempSync(join(tmpdir(), "agentskillsusage-"));
  const environment = { ...process.env, HOME: root, PATH: join(root, "bin") };
  const options = { cwd: root, env: environment };

  const help = run(options, "--help");
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--json/);
  assert.match(help.stdout, /--agent <scope>/);

  const version = run(options, "--version");
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), "0.1.0");

  const invalid = run(options, "--nope");
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown option/);
  rmSync(root, { recursive: true });
});

test("npm artifact contains only the published runtime and documentation", (t) => {
  const cache = mkdtempSync(join(tmpdir(), "agentskillsusage-npm-cache-"));
  t.after(() => rmSync(cache, { recursive: true }));
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    encoding: "utf8", env: { ...process.env, npm_config_cache: cache }
  });
  assert.equal(result.status, 0, result.stderr);
  const files = JSON.parse(result.stdout)[0].files.map((entry) => entry.path).sort();
  assert.deepEqual(files, [
    "README.md",
    "dist/aggregate.js",
    "dist/claude.js",
    "dist/cli.js",
    "dist/codex.js",
    "dist/skill.js",
    "dist/tui.js",
    "package.json"
  ]);
});

test("installed npm artifact exposes both executable names", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agentskillsusage-pack-"));
  const cache = mkdtempSync(join(tmpdir(), "agentskillsusage-npm-cache-"));
  const home = join(root, "home");
  mkdirSync(join(home, ".agents", "skills", "fixture"), { recursive: true });
  writeFileSync(join(home, ".agents", "skills", "fixture", "SKILL.md"), "---\nname: fixture\n---\n");
  mkdirSync(join(root, "node_modules"), { recursive: true });
  for (const dependency of ["ink", "react"]) {
    symlinkSync(join(process.cwd(), "node_modules", dependency), join(root, "node_modules", dependency));
  }
  t.after(() => {
    rmSync(root, { recursive: true });
    rmSync(cache, { recursive: true });
  });

  const packed = spawnSync("npm", ["pack", "--ignore-scripts", "--pack-destination", root], {
    encoding: "utf8", env: { ...process.env, npm_config_cache: cache }
  });
  assert.equal(packed.status, 0, packed.stderr);
  const tarball = join(root, packed.stdout.trim());
  const installed = spawnSync("npm", ["install", "--offline", "--ignore-scripts", "--no-package-lock", "--no-audit", "--no-fund", "--omit=prod", tarball], {
    cwd: root, encoding: "utf8", env: { ...process.env, npm_config_cache: cache }
  });
  assert.equal(installed.status, 0, installed.stderr);

  for (const executable of ["agentskillsusage", "openagentskillsusage"]) {
    const path = join(root, "node_modules", ".bin", executable);
    const options = {
      cwd: root,
      env: { ...process.env, HOME: home, PATH: `${join(root, "node_modules", ".bin")}:${process.env.PATH}` }
    };
    assert.equal(spawnSync(path, ["--help"], { ...options, encoding: "utf8" }).status, 0);
    assert.equal(spawnSync(path, ["--version"], { ...options, encoding: "utf8" }).stdout.trim(), "0.1.0");
    const json = spawnSync(path, ["--json"], { ...options, encoding: "utf8" });
    assert.equal(json.status, 0);
    assert.equal(JSON.parse(json.stdout).skills.find((entry) => entry.name === "fixture").name, "fixture");
  }
});

test("CLI directs interactive startup without a TTY to JSON", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agentskillsusage-"));
  t.after(() => rmSync(root, { recursive: true }));
  const result = run({ cwd: root, env: { ...process.env, HOME: root, PATH: join(root, "bin") } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--json/);
});

test("CLI returns partial data without agent commands", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agentskillsusage-"));
  const home = join(root, "home");
  const codexHome = join(root, "codex");
  const skill = (directory, name) => {
    mkdirSync(join(directory, name), { recursive: true });
    writeFileSync(join(directory, name, "SKILL.md"), `---\nname: ${name}\n---\n`);
  };
  skill(join(home, ".agents", "skills"), "codex-global");
  skill(join(home, ".claude", "skills"), "claude-global");
  mkdirSync(join(codexHome, "sessions"), { recursive: true });
  mkdirSync(join(home, ".claude", "projects"), { recursive: true });
  writeFileSync(join(codexHome, "sessions", "session.jsonl"), [
    JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "$codex-global", text_elements: [{ placeholder: "$codex-global" }] } }),
    "{bad json}"
  ].join("\n"));
  writeFileSync(join(home, ".claude", "projects", "session.jsonl"), [
    JSON.stringify({ uuid: "claude-turn", type: "user", message: { content: "/claude-global" } }),
    "{bad json}"
  ].join("\n"));

  t.after(() => rmSync(root, { recursive: true }));
  const result = run({
    cwd: root, env: { ...process.env, HOME: home, CODEX_HOME: codexHome, PATH: join(root, "missing-bin") }
  }, "--json");
  assert.equal(result.status, 0);
  const json = JSON.parse(result.stdout);
  assert.deepEqual(json.skills.map((entry) => entry.name), ["claude-global", "codex-global"]);
  assert.match(json.warnings.join("\n"), /Codex plugin inventory is unavailable/);
  assert.match(json.warnings.join("\n"), /Claude plugin inventory is unavailable/);
  assert.match(json.warnings.join("\n"), /Codex skipped 1 malformed session record/);
  assert.match(json.warnings.join("\n"), /Claude skipped 1 malformed session record/);
  assert.equal(result.stderr, "");
});

test("CLI fails only when no inventory or history is readable", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agentskillsusage-"));
  const home = join(root, "home");
  const codexHome = join(root, "codex");
  const skill = (directory, name) => {
    mkdirSync(join(directory, name), { recursive: true });
    writeFileSync(join(directory, name, "SKILL.md"), `---\nname: ${name}\n---\n`);
  };
  skill(join(home, ".agents", "skills"), "available");

  t.after(() => rmSync(root, { recursive: true }));
  const inventoryOnly = run({
    cwd: root, env: { ...process.env, HOME: home, CODEX_HOME: codexHome, PATH: join(root, "missing-bin") }
  }, "--json", "--agent", "codex");
  assert.equal(inventoryOnly.status, 0);
  assert.equal(JSON.parse(inventoryOnly.stdout).skills[0].name, "available");

  const unavailable = run({
    cwd: root, env: { ...process.env, HOME: join(root, "empty-home"), CODEX_HOME: join(root, "empty-codex"), PATH: join(root, "missing-bin") }
  }, "--json");
  assert.equal(unavailable.status, 1);
  assert.equal(unavailable.stdout, "");
  assert.match(unavailable.stderr, /No readable Skill inventory or Usage History/);
});

test("CLI skips unreadable local files with safe warnings", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agentskillsusage-"));
  const home = join(root, "home");
  const codexHome = join(root, "codex");
  const skill = (name) => {
    const path = join(home, ".agents", "skills", name, "SKILL.md");
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, `---\nname: ${name}\n---\n`);
    return path;
  };
  skill("available");
  const unavailableSkill = skill("unavailable");
  const sessions = join(codexHome, "sessions");
  mkdirSync(sessions, { recursive: true });
  writeFileSync(join(sessions, "available.jsonl"), JSON.stringify({
    type: "event_msg", payload: { type: "user_message", message: "$available", text_elements: [{ placeholder: "$available" }] }
  }));
  const unavailableHistory = join(sessions, "unavailable.jsonl");
  writeFileSync(unavailableHistory, "{}");
  chmodSync(unavailableSkill, 0);
  chmodSync(unavailableHistory, 0);

  t.after(() => rmSync(root, { recursive: true }));
  const result = run({
    cwd: root, env: { ...process.env, HOME: home, CODEX_HOME: codexHome, PATH: join(root, "missing-bin") }
  }, "--json", "--agent", "codex");
  assert.equal(result.status, 0);
  const json = JSON.parse(result.stdout);
  assert.equal(json.skills.find((entry) => entry.name === "available").total, 1);
  assert.match(json.warnings.join("\n"), /Codex skipped an unreadable Skill file/);
  assert.match(json.warnings.join("\n"), /Codex Usage History is partially unavailable/);
  assert.doesNotMatch(json.warnings.join("\n"), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const unusableHome = join(root, "unusable-home");
  const unusableCodexHome = join(root, "unusable-codex");
  const unusableSkill = join(unusableHome, ".agents", "skills", "unavailable", "SKILL.md");
  const unusableSession = join(unusableCodexHome, "sessions", "unavailable.jsonl");
  mkdirSync(join(unusableSkill, ".."), { recursive: true });
  mkdirSync(join(unusableSession, ".."), { recursive: true });
  writeFileSync(unusableSkill, "---\nname: unavailable\n---\n");
  writeFileSync(unusableSession, "{}");
  chmodSync(unusableSkill, 0);
  chmodSync(unusableSession, 0);
  const unavailable = run({
    cwd: root, env: { ...process.env, HOME: unusableHome, CODEX_HOME: unusableCodexHome, PATH: join(root, "missing-bin") }
  }, "--json", "--agent", "codex");
  assert.equal(unavailable.status, 1);
  assert.equal(unavailable.stdout, "");
  assert.match(unavailable.stderr, /No readable Skill inventory or Usage History/);
});

test("--json --agent claude inventories skills and deduplicates session evidence", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agentskillsusage-"));
  const home = join(root, "home");
  const project = join(root, "project");
  const plugin = join(root, "plugin");
  const bin = join(root, "bin");
  const skill = (directory, name) => {
    mkdirSync(join(directory, name), { recursive: true });
    writeFileSync(join(directory, name, "SKILL.md"), `---\nname: ${name}\n---\n`);
  };
  skill(join(home, ".claude", "skills"), "global");
  skill(join(home, ".claude", "skills"), "unused");
  skill(join(project, ".claude", "skills"), "project");
  mkdirSync(join(project, ".git"), { recursive: true });
  mkdirSync(join(project, "src"), { recursive: true });
  skill(join(plugin, "skills"), "plugin-run");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "claude"), `#!/bin/sh\nprintf '%s' '[{"id":"fixture@local","enabled":true,"installPath":"${plugin}"}]'\n`);
  chmodSync(join(bin, "claude"), 0o755);

  const active = join(home, ".claude", "projects", "active");
  const archived = join(home, ".claude", "archived_sessions");
  mkdirSync(active, { recursive: true });
  mkdirSync(archived, { recursive: true });
  writeFileSync(join(active, "session.jsonl"), [
    JSON.stringify({ uuid: "one", type: "user", message: { content: "/global" } }),
    JSON.stringify({ uuid: "two", parentUuid: "one", type: "assistant", attributionSkill: "global", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "global" } }] } }),
    JSON.stringify({ uuid: "three", type: "user", message: { content: "Can we discuss /unused?" } }),
    JSON.stringify({ uuid: "four", type: "user", message: { content: "Run the plugin" } }),
    JSON.stringify({ uuid: "five", parentUuid: "four", type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "fixture:plugin-run" } }] } }),
    JSON.stringify({ uuid: "six", parentUuid: "five", type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "fixture:plugin-run" } }] } }),
    JSON.stringify({ uuid: "seven", type: "user", message: { content: "Use project guidance" } }),
    JSON.stringify({ uuid: "eight", parentUuid: "seven", type: "assistant", attributionSkill: "project", message: { content: [] } }),
    JSON.stringify({ uuid: "path", parentUuid: "seven", type: "assistant", attributionSkill: "/Users/secret/SKILL.md", message: { content: [] } })
  ].join("\n"));
  writeFileSync(join(archived, "session.jsonl"), [
    JSON.stringify({ uuid: "nine", type: "user", message: { content: "debug this" } }),
    JSON.stringify({ uuid: "ten", parentUuid: "nine", type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "debug" } }] } }),
    "{bad json}"
  ].join("\n"));

  t.after(() => rmSync(root, { recursive: true }));
  const result = run({ cwd: join(project, "src"), env: { ...process.env, HOME: home, PATH: bin } }, "--json", "--agent", "claude");
  assert.equal(result.status, 0);
  const json = JSON.parse(result.stdout);
  assert.equal(json.scope, "claude");
  assert.equal(result.stderr, "");
  assert.doesNotMatch(result.stdout, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(result.stdout, /Users\/secret/);

  const skills = Object.fromEntries(json.skills.map((entry) => [entry.name, entry]));
  assert.deepEqual(skills.global.byInvocationKind, { explicit: 1, agent: 0, inferred: 0 });
  assert.deepEqual(skills["fixture:plugin-run"].byInvocationKind, { explicit: 0, agent: 1, inferred: 0 });
  assert.deepEqual(skills.project.byInvocationKind, { explicit: 0, agent: 0, inferred: 1 });
  assert.equal(skills.debug.total, 1);
  assert.equal(skills.unused.total, 0);
  assert.equal(skills.simplify.total, 0);
  assert.match(json.warnings.join("\n"), /malformed session record/);
});

test("--json --agent codex inventories skills and deduplicates session evidence", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agentskillsusage-"));
  const home = join(root, "home");
  const codexHome = join(root, "codex");
  const project = join(root, "project");
  const plugin = join(root, "plugin");
  const disabledPlugin = join(root, "disabled-plugin");
  const stalePlugin = join(codexHome, "plugins", "cache", "stale", "stale", "1.0.0");
  const bin = join(root, "bin");
  const skill = (directory, name) => {
    mkdirSync(join(directory, name), { recursive: true });
    writeFileSync(join(directory, name, "SKILL.md"), `---\nname: ${name}\n---\n`);
    return join(directory, name, "SKILL.md");
  };
  const globalSkill = skill(join(home, ".agents", "skills"), "global");
  const unusedSkill = skill(join(home, ".agents", "skills"), "unused");
  const projectSkill = skill(join(project, ".agents", "skills"), "project");
  skill(join(codexHome, "skills", ".system"), "system");
  const pluginSkill = skill(join(plugin, "skills"), "plugin-run");
  skill(join(disabledPlugin, "skills"), "disabled");
  skill(join(stalePlugin, "skills"), "stale");
  mkdirSync(join(project, ".git"), { recursive: true });
  mkdirSync(join(project, "src"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "codex"), `#!/bin/sh\nprintf '%s' '${JSON.stringify({ installed: [
    { pluginId: "fixture@local", name: "fixture", marketplaceName: "local", version: "1.0.0", installed: true, enabled: true, source: { source: "local", path: plugin } },
    { pluginId: "disabled@local", name: "disabled", marketplaceName: "local", version: "1.0.0", installed: true, enabled: false, source: { source: "local", path: disabledPlugin } }
  ], available: [] })}'\n`);
  chmodSync(join(bin, "codex"), 0o755);

  const active = join(codexHome, "sessions", "active");
  const archived = join(codexHome, "archived_sessions");
  mkdirSync(active, { recursive: true });
  mkdirSync(archived, { recursive: true });
  writeFileSync(join(active, "session.jsonl"), [
    JSON.stringify({ type: "event_msg", payload: { type: "task_started", turn_id: "one" } }),
    JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "$global", text_elements: [{ placeholder: "$global" }] } }),
    JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "Skill", input: JSON.stringify({ skill: "global" }) } }),
    JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec_command", input: JSON.stringify({ cmd: `cat ${globalSkill}` }) } }),
    JSON.stringify({ type: "turn_context", payload: { turn_id: "two" } }),
    JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "Skill", input: JSON.stringify({ skill: "fixture:plugin-run" }) } }),
    JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec_command", input: JSON.stringify({ cmd: `cat ${pluginSkill}` }) } }),
    JSON.stringify({ type: "turn_context", payload: { turn_id: "three" } }),
    JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "Can we discuss $unused?", text_elements: [] } }),
    JSON.stringify({ type: "turn_context", payload: { turn_id: "four" } }),
    JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec_command", input: JSON.stringify({ cmd: `cat ${projectSkill}` }) } })
  ].join("\n"));
  writeFileSync(join(archived, "session.jsonl"), [
    JSON.stringify({ type: "event_msg", payload: { type: "task_started", turn_id: "two" } }),
    JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "Skill", input: JSON.stringify({ skill: "fixture:plugin-run" }) } }),
    JSON.stringify({ type: "turn_context", payload: { turn_id: "five" } }),
    JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "$system", text_elements: [{ placeholder: "$system" }] } }),
    JSON.stringify({ type: "turn_context", payload: { turn_id: "six" } }),
    JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec", input: `const result = await tools.exec_command({"cmd":"cat ${join(stalePlugin, "skills", "stale", "SKILL.md")}"});` } }),
    JSON.stringify({ type: "turn_context", payload: { turn_id: "seven" } }),
    JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec", input: `await tools.exec_command({"cmd":"cat README.md"}); await tools.exec_command({"cmd":"rm ${unusedSkill}"});` } }),
    JSON.stringify({ type: "turn_context", payload: { turn_id: "eight" } }),
    JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec_command", input: JSON.stringify({ cmd: `cat ${join(disabledPlugin, "skills", "disabled", "SKILL.md")}` }) } }),
    "{bad json}"
  ].join("\n"));

  t.after(() => rmSync(root, { recursive: true }));
  const result = run({
    cwd: join(project, "src"),
    env: { ...process.env, HOME: home, CODEX_HOME: codexHome, PATH: bin }
  }, "--json", "--agent", "codex");
  assert.equal(result.status, 0);
  const json = JSON.parse(result.stdout);
  assert.equal(json.scope, "codex");
  assert.equal(result.stderr, "");
  assert.doesNotMatch(result.stdout, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const skills = Object.fromEntries(json.skills.map((entry) => [entry.name, entry]));
  assert.deepEqual(skills.global.byInvocationKind, { explicit: 1, agent: 0, inferred: 0 });
  assert.deepEqual(skills["fixture:plugin-run"].byInvocationKind, { explicit: 0, agent: 1, inferred: 0 });
  assert.deepEqual(skills.project.byInvocationKind, { explicit: 0, agent: 0, inferred: 1 });
  assert.equal(skills.system.total, 1);
  assert.equal(skills.unused.total, 0);
  assert.equal(skills.disabled, undefined);
  assert.equal(skills["disabled:disabled"].available, false);
  assert.deepEqual(skills["disabled:disabled"].byInvocationKind, { explicit: 0, agent: 0, inferred: 1 });
  assert.equal(skills["stale:stale"].available, false);
  assert.deepEqual(skills["stale:stale"].byInvocationKind, { explicit: 0, agent: 0, inferred: 1 });
  assert.match(json.warnings.join("\n"), /malformed session record/);
});

test("CLI combines shared skills and scopes inventory and usage", (t) => {
  const root = mkdtempSync(join(tmpdir(), "agentskillsusage-"));
  const home = join(root, "home");
  const codexHome = join(root, "codex");
  const project = join(root, "project");
  const bin = join(root, "bin");
  const shared = join(root, "shared");
  const codexPlugin = join(root, "codex-plugin");
  const claudePlugin = join(root, "claude-plugin");
  const skill = (directory, name) => {
    mkdirSync(join(directory, name), { recursive: true });
    writeFileSync(join(directory, name, "SKILL.md"), `---\nname: ${name}\n---\n`);
  };

  skill(root, "shared");
  mkdirSync(join(home, ".agents", "skills"), { recursive: true });
  mkdirSync(join(home, ".claude", "skills"), { recursive: true });
  symlinkSync(shared, join(home, ".agents", "skills", "shared"));
  symlinkSync(shared, join(home, ".claude", "skills", "shared"));
  skill(join(home, ".agents", "skills"), "same-name");
  skill(join(home, ".agents", "skills"), "zeta-used");
  skill(join(home, ".claude", "skills"), "same-name");
  skill(join(home, ".claude", "skills"), "alpha-used");
  skill(join(codexPlugin, "skills"), "plugin-shared");
  skill(join(codexPlugin, "skills"), "mixed-shared");
  skill(join(claudePlugin, "skills"), "plugin-shared");
  symlinkSync(join(codexPlugin, "skills", "mixed-shared"), join(home, ".agents", "skills", "mixed-shared"));
  symlinkSync(join(codexPlugin, "skills", "mixed-shared"), join(home, ".claude", "skills", "mixed-shared"));
  mkdirSync(join(project, ".git"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "codex"), `#!/bin/sh\nprintf '%s' '${JSON.stringify({ installed: [{
    pluginId: "shared@fixture", name: "shared", installed: true, enabled: true,
    source: { source: "local", path: codexPlugin }
  }], available: [] })}'\n`);
  writeFileSync(join(bin, "claude"), `#!/bin/sh\nprintf '%s' '${JSON.stringify([{
    id: "shared@fixture", enabled: true, installPath: claudePlugin
  }])}'\n`);
  chmodSync(join(bin, "codex"), 0o755);
  chmodSync(join(bin, "claude"), 0o755);

  const codexSessions = join(codexHome, "sessions");
  const claudeSessions = join(home, ".claude", "projects");
  mkdirSync(codexSessions, { recursive: true });
  mkdirSync(claudeSessions, { recursive: true });
  writeFileSync(join(codexSessions, "session.jsonl"), [
    JSON.stringify({ type: "event_msg", payload: { type: "task_started", turn_id: "codex-turn" } }),
    JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "$shared", text_elements: [{ placeholder: "$shared" }] } }),
    JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "Skill", input: JSON.stringify({ skill: "shared:mixed-shared" }) } }),
    JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec_command", input: JSON.stringify({ cmd: `cat ${join(home, ".agents", "skills", "mixed-shared", "SKILL.md")}` }) } }),
    JSON.stringify({ type: "turn_context", payload: { turn_id: "codex-zeta" } }),
    JSON.stringify({ type: "event_msg", payload: { type: "user_message", message: "$zeta-used", text_elements: [{ placeholder: "$zeta-used" }] } })
  ].join("\n"));
  writeFileSync(join(claudeSessions, "session.jsonl"), [
    JSON.stringify({ uuid: "claude-turn", type: "user", message: { content: "/shared" } }),
    JSON.stringify({ uuid: "claude-alpha", type: "user", message: { content: "/alpha-used" } })
  ].join("\n"));

  t.after(() => rmSync(root, { recursive: true }));
  const options = { cwd: project, env: { ...process.env, HOME: home, CODEX_HOME: codexHome, PATH: bin } };
  const allResult = run(options, "--json");
  const codexResult = run(options, "--json", "--agent", "codex");
  const claudeResult = run(options, "--json", "--agent", "claude");
  assert.equal(allResult.status, 0);
  assert.equal(codexResult.status, 0);
  assert.equal(claudeResult.status, 0);

  const all = JSON.parse(allResult.stdout);
  const codex = JSON.parse(codexResult.stdout);
  const claude = JSON.parse(claudeResult.stdout);
  const sharedAll = all.skills.find((entry) => entry.name === "shared");
  const sharedCodex = codex.skills.find((entry) => entry.name === "shared");
  const sharedClaude = claude.skills.find((entry) => entry.name === "shared");
  assert.deepEqual(sharedAll.members, ["codex", "claude"]);
  assert.deepEqual(sharedAll.byAgent, { codex: 1, claude: 1 });
  assert.equal(sharedAll.total, 2);
  assert.equal(sharedAll.id, sharedCodex.id);
  assert.equal(sharedAll.id, sharedClaude.id);
  assert.deepEqual(sharedCodex.members, ["codex"]);
  assert.deepEqual(sharedCodex.byAgent, { codex: 1 });
  assert.equal(sharedCodex.total, 1);
  assert.deepEqual(sharedClaude.members, ["claude"]);
  assert.deepEqual(sharedClaude.byAgent, { claude: 1 });
  assert.equal(sharedClaude.total, 1);

  const allSameName = all.skills.filter((entry) => entry.name === "same-name");
  assert.equal(allSameName.length, 2);
  assert.deepEqual(new Set(allSameName.map((entry) => entry.sourceHint)), new Set(["codex", "claude"]));
  assert.equal(codex.skills.filter((entry) => entry.name === "same-name").length, 1);
  assert.equal(claude.skills.filter((entry) => entry.name === "same-name").length, 1);
  const pluginShared = all.skills.find((entry) => entry.name === "shared:plugin-shared");
  assert.deepEqual(pluginShared.members, ["codex", "claude"]);
  const mixedShared = all.skills.find((entry) => entry.name === "mixed-shared");
  assert.deepEqual(mixedShared.members, ["codex", "claude"]);
  const mixedCodex = codex.skills.find((entry) => entry.name === "mixed-shared");
  assert.equal(mixedShared.id, mixedCodex.id);
  assert.equal(mixedShared.id, claude.skills.find((entry) => entry.name === "mixed-shared").id);
  assert.equal(mixedCodex.total, 1);
  assert.deepEqual(mixedCodex.byInvocationKind, { explicit: 0, agent: 1, inferred: 0 });

  const used = all.skills.filter((entry) => entry.total > 0);
  const unused = all.skills.filter((entry) => entry.total === 0);
  assert.deepEqual(used.map((entry) => [entry.name, entry.total]), [
    ["shared", 2], ["alpha-used", 1], ["mixed-shared", 1], ["zeta-used", 1]
  ]);
  assert.deepEqual(unused.map((entry) => entry.name), unused.map((entry) => entry.name).toSorted());
  assert.doesNotMatch(allResult.stdout, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
