import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

  const json = run(options, "--json");
  assert.equal(json.status, 0);
  assert.deepEqual(JSON.parse(json.stdout).skills, []);

  const invalid = run(options, "--nope");
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown option/);
  rmSync(root, { recursive: true });
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
