import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render } from "ink-testing-library";
import { UsageTui } from "../dist/tui.js";

const skills = [
  { id: "one", name: "alpha", source: "global", available: true, members: ["codex"], byAgent: { codex: 8 }, byInvocationKind: { explicit: 5, agent: 2, inferred: 1 }, total: 8 },
  { id: "two", name: "zero", source: "global", available: true, members: ["codex"], byAgent: { codex: 0 }, byInvocationKind: { explicit: 0, agent: 0, inferred: 0 }, total: 0 }
];

test("TUI shows usage, switches scope, rescans, scrolls, and quits", async () => {
  const scans = [];
  let quit = false;
  const scan = (scope) => {
    scans.push(scope);
    return { hasReadableData: true, skills: scope === "claude" ? [...skills].reverse() : skills, warnings: [] };
  };
  const app = render(React.createElement(UsageTui, { initialScope: "all", initialScan: scan("all"), scan, height: 4, onQuit: () => { quit = true; } }));

  assert.match(app.lastFrame(), /All/);
  assert.match(app.lastFrame(), /alpha/);
  assert.match(app.lastFrame(), /inferred/);
  app.stdin.write("\u001B[C");
  await new Promise(setImmediate);
  assert.match(app.lastFrame(), /Codex/);
  app.stdin.write("\u001B[C");
  await new Promise(setImmediate);
  assert.match(app.lastFrame(), /Claude/);
  assert.deepEqual(scans, ["all", "codex", "claude"]);
  assert.match(app.lastFrame(), /zero/);
  app.stdin.write("\u001B[B");
  await new Promise(setImmediate);
  assert.match(app.lastFrame(), /alpha/);
  app.stdin.write("\u001B[5~");
  await new Promise(setImmediate);
  assert.match(app.lastFrame(), /zero/);
  app.stdin.write("\u001B[6~");
  await new Promise(setImmediate);
  assert.match(app.lastFrame(), /alpha/);
  app.stdin.write("r");
  await new Promise(setImmediate);
  assert.equal(scans.at(-1), "claude");
  app.stdin.write("q");
  await new Promise(setImmediate);
  assert.equal(quit, true);

  const escape = render(React.createElement(UsageTui, { initialScope: "all", initialScan: scan("all"), scan, onQuit: () => { quit = true; } }));
  quit = false;
  escape.stdin.write("\u001B");
  await new Promise(setImmediate);
  assert.equal(quit, true);
});
