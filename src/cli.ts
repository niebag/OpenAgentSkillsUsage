#!/usr/bin/env node
import packageJson from "../package.json" with { type: "json" };
import { aggregate } from "./aggregate.js";
import { startTui } from "./tui.js";

const version = packageJson.version;

function help(): string {
  return `Usage: agentskillsusage [options]

Options:
  --agent <scope>  Choose all, codex, or claude (default: all)
  --json           Print the result as JSON
  --help           Show this help
  --version        Show the package version`;
}

function parseArgs(args: string[]): { agent: "all" | "codex" | "claude"; json: boolean } {
  let agent: "all" | "codex" | "claude" = "all";
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "--version") {
      throw new Error(`Unexpected option: ${arg}`);
    } else if (arg === "--agent") {
      const value = args[++index];
      if (value !== "all" && value !== "codex" && value !== "claude") {
        throw new Error("--agent must be one of: all, codex, claude");
      }
      agent = value;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { agent, json };
}

export function main(args = process.argv.slice(2)): number {
  if (args.includes("--help")) {
    if (args.length !== 1) {
      console.error("--help cannot be combined with other options");
      return 1;
    }
    console.log(help());
    return 0;
  }

  if (args.includes("--version")) {
    if (args.length !== 1) {
      console.error("--version cannot be combined with other options");
      return 1;
    }
    console.log(version);
    return 0;
  }

  let options: ReturnType<typeof parseArgs>;
  try {
    options = parseArgs(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid options");
    return 1;
  }

  if (!options.json && (!process.stdout.isTTY || !process.stdin.isTTY)) {
    console.error("Interactive mode requires a TTY; use --json instead.");
    return 2;
  }

  if (!options.json) {
    startTui(options.agent);
    return 0;
  }
  const scan = aggregate(options.agent);
  if (!scan.hasReadableData) {
    console.error("No readable Skill inventory or Usage History found.");
    return 1;
  }
  console.log(JSON.stringify({
    schemaVersion: 1,
    scope: options.agent,
    skills: scan.skills,
    warnings: scan.warnings
  }));
  return 0;
}

process.exitCode = main();
