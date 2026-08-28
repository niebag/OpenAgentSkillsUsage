<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/header/graph.svg?title=OpenAgentSkillsUsage&subtitle=See+how+your+local+Agent+Skills+are+used&logo=node.js&mode=dark" />
    <img alt="OpenAgentSkillsUsage" src="https://shieldcn.dev/header/graph.svg?title=OpenAgentSkillsUsage&subtitle=See+how+your+local+Agent+Skills+are+used&logo=node.js&mode=light" />
  </picture>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/openagentskillsusage"><img alt="npm version" src="https://shieldcn.dev/npm/openagentskillsusage.svg" /></a>
  <a href="https://github.com/niebag/OpenAgentSkillsUsage"><img alt="GitHub stars" src="https://shieldcn.dev/github/stars/niebag/OpenAgentSkillsUsage.svg" /></a>
  <a href="https://github.com/niebag/OpenAgentSkillsUsage/blob/main/package.json"><img alt="license" src="https://shieldcn.dev/github/license/niebag/OpenAgentSkillsUsage.svg" /></a>
</p>

# OpenAgentSkillsUsage

OpenAgentSkillsUsage is a local, read-only overview of Agent Skill usage in
Codex and Claude Code sessions. It reads the data already on your machine; it
does not send telemetry anywhere.

## Install

```sh
npm install -g openagentskillsusage
agentskillsusage
```

The package also exposes `openagentskillsusage`. Both executable names run the
same CLI.

## Controls

The interactive view uses the arrow keys to change scope and move through the
Skill list. Page Up and Page Down jump by a page. Press `r` to rescan local
data, or `q` / Escape to quit.

Use `--agent all`, `--agent codex`, or `--agent claude` to choose the initial
scope. Use `--json` for scripts and environments without a TTY:

```sh
agentskillsusage --json --agent all
```

JSON includes the schema version, selected scope, every discovered Skill,
total usage, per-agent counts, `explicit`, `agent`, and `inferred` Invocation
Kind counts, plus non-sensitive warnings.

## Invocation Kind

- `explicit`: the Skill was requested directly by the user.
- `agent`: the agent recorded a Skill invocation.
- `inferred`: the Skill was reconstructed from supporting session evidence.

Usage is counted once per Agent Session turn. Installed Skills with no observed
usage remain visible with a total of zero.

## Privacy

This program is local and read-only. It scans local Skill inventories and session
records, then emits aggregated counts. It does not upload session content,
paths, or telemetry. The JSON output intentionally omits raw session data and
local paths.

## Known limitations

Results depend on the local inventories and histories that are readable when a
scan runs. Unreadable files and malformed records are skipped with warnings.
The tool cannot recover usage that was never recorded, and `inferred` counts
are evidence-based estimates rather than explicit user requests.

## Development

```sh
npm install
npm test
npm pack
```

Requires Node.js 24 or newer.
