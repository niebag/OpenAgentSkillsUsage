#!/usr/bin/env node
import packageJson from "../package.json" with { type: "json" };

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

  if (!options.json) {
    console.error("Interactive mode requires a TTY; use --json instead.");
    return 2;
  }

  console.log(JSON.stringify({
    schemaVersion: 1,
    scope: options.agent,
    skills: [],
    warnings: []
  }));
  return 0;
}

process.exitCode = main();
