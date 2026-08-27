import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const cli = new URL("../dist/cli.js", import.meta.url).pathname;

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

test("CLI exposes the v1 contract", () => {
  const help = run("--help");
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--json/);
  assert.match(help.stdout, /--agent <scope>/);

  const version = run("--version");
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), "0.1.0");

  const json = run("--json");
  assert.equal(json.status, 0);
  assert.deepEqual(JSON.parse(json.stdout), {
    schemaVersion: 1,
    scope: "all",
    skills: [],
    warnings: []
  });

  const invalid = run("--nope");
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown option/);
});
