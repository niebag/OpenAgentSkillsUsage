<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/header/grid.svg?title=OpenAgentSkillsUsage&amp;subtitle=Inspect+local+Agent+Skill+usage&amp;theme=violet&amp;align=center&amp;mode=dark&amp;border=false" />
    <img src="https://shieldcn.dev/header/grid.svg?title=OpenAgentSkillsUsage&amp;subtitle=Inspect+local+Agent+Skill+usage&amp;theme=violet&amp;align=center&amp;mode=light&amp;border=false" alt="OpenAgentSkillsUsage: inspect local Agent Skill usage" />
  </picture>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/npm/openagentskillsusage.svg?variant=secondary&amp;size=sm&amp;mode=dark" />
    <img src="https://shieldcn.dev/npm/openagentskillsusage.svg?variant=secondary&amp;size=sm&amp;mode=light" alt="OpenAgentSkillsUsage npm package version" />
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/ci/niebag/OpenAgentSkillsUsage.svg?workflow=ci.yml&amp;branch=main&amp;variant=secondary&amp;size=sm&amp;mode=dark" />
    <img src="https://shieldcn.dev/github/ci/niebag/OpenAgentSkillsUsage.svg?workflow=ci.yml&amp;branch=main&amp;variant=secondary&amp;size=sm&amp;mode=light" alt="CI workflow status" />
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/license-MIT.svg?variant=secondary&amp;size=sm&amp;logo=opensourceinitiative&amp;mode=dark" />
    <img src="https://shieldcn.dev/badge/license-MIT.svg?variant=secondary&amp;size=sm&amp;logo=opensourceinitiative&amp;mode=light" alt="Project source license: MIT" />
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Codex-supported.svg?variant=secondary&amp;size=sm&amp;mode=dark" />
    <img src="https://shieldcn.dev/badge/Codex-supported.svg?variant=secondary&amp;size=sm&amp;mode=light" alt="Supported Agent integration: Codex" />
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Claude_Code-supported.svg?variant=secondary&amp;size=sm&amp;logo=anthropic&amp;mode=dark" />
    <img src="https://shieldcn.dev/badge/Claude_Code-supported.svg?variant=secondary&amp;size=sm&amp;mode=light" alt="Supported Agent integration: Claude Code" />
  </picture>
</p>

OpenAgentSkillsUsage is a local terminal app that shows which Agent Skills appear in Codex and Claude Code sessions. It reads inventories and histories already on your machine and reports aggregated counts without uploading session content.

## Contents

- [Contents](#contents)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Controls and output](#controls-and-output)
- [Invocation Kind](#invocation-kind)
- [Privacy and limitations](#privacy-and-limitations)
- [Removal](#removal)
- [License](#license)
- [Release validation](#release-validation)
- [Downloads](#downloads)
- [Contributors](#contributors)
- [Contributing](#contributing)
- [Disclaimer](#disclaimer)

## Requirements

- Node.js 24 or newer
- Local Codex or Claude Code Skill inventories, Agent Sessions, or both
- An interactive terminal for the default interface

## Quick start

Install globally:

```sh
npm install --global openagentskillsusage
agentskillsusage
```

Or run it without a global installation:

```sh
npx openagentskillsusage
```

`agentskillsusage` is the primary command. `openagentskillsusage` is an alias for the same program.

## Controls and output

Use the arrow keys to change the Agent scope and move through the Skill list. Page Up and Page Down jump by a page. Press `r` to rescan local data, or `q` or Escape to quit.

Example output uses fictional Skill names:

```text
╭──────────────────────────────────────────────────────────────────────────────────────────────╮
│ Open Agent Skills Usage                                                  133 uses · 6 skills │
│ Scope   [All]   Codex   Claude                                                               │
│ SKILL                         USAGE          TOTAL  EXPLICIT AGENT INFERRED                  │
│ brief-builder                 ████████████      48         4     7       37                  │
│ repo-checker                  ████████          31         1     6       24                  │
│ test-runner                   ██████            24         3     2       19                  │
│ release-notes                 █████             18         0     4       14                  │
│ docs-helper                   ███               12         2     1        9                  │
│ unused-example                ·                  0         0     0        0                  │
│ ←→ scope  ↑↓ scroll  PgUp/PgDn page  r rescan  q/Esc quit                                    │
╰──────────────────────────────────────────────────────────────────────────────────────────────╯
```

Choose the initial scope with `--agent all`, `--agent codex`, or `--agent claude`. Use `--json` for scripts and environments without a TTY:

```sh
agentskillsusage --json --agent all
```

JSON output includes the schema version, selected scope, discovered Skills, total usage, per-Agent counts, Invocation Kind counts, and non-sensitive warnings.

## Invocation Kind

Each Skill Use has one Invocation Kind:

| Invocation Kind | Meaning |
| --- | --- |
| `explicit` | The user requested the Skill directly. |
| `agent` | The Agent recorded a Skill activation. |
| `inferred` | Supporting Agent Session evidence indicates that the Skill was used. |

Usage is counted once per Agent Session turn. Installed Skills with no observed usage remain visible with a total of zero.

## Privacy and limitations

OpenAgentSkillsUsage has no telemetry, account, cloud service, database, or sync. It reads local Skill inventories and Agent Session records without modifying them. JSON output omits raw session data and local paths.

Results depend on the local inventories and histories that are readable when a scan runs. Unreadable files and malformed records are skipped with warnings, so partial results remain available. The app cannot recover usage that was never recorded, and `inferred` counts remain evidence-based estimates.

## Removal

```sh
npm uninstall --global openagentskillsusage
```

OpenAgentSkillsUsage does not create or own Codex or Claude Code session data, so removal leaves that local data unchanged.

## License

OpenAgentSkillsUsage is available under the [MIT License](LICENSE).

## Release validation

```sh
npm run check
npm test
npm pack --dry-run
```

The test suite builds the CLI, checks the exact artifact contents, installs the tarball in isolation, exercises both executable names, and validates the owner-gated release workflow without publishing to npm.

## Downloads

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/chart/npm/openagentskillsusage.svg?days=90&amp;theme=violet&amp;mode=dark" />
    <img src="https://shieldcn.dev/chart/npm/openagentskillsusage.svg?days=90&amp;theme=violet&amp;mode=light" alt="OpenAgentSkillsUsage npm downloads over the last 90 days" />
  </picture>
</p>

## Contributors

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/contributors/niebag/OpenAgentSkillsUsage.svg?theme=violet&amp;mode=dark" />
    <img src="https://shieldcn.dev/contributors/niebag/OpenAgentSkillsUsage.svg?theme=violet&amp;mode=light" alt="OpenAgentSkillsUsage contributors" />
  </picture>
</p>

## Contributing

Open an issue before starting a larger change. Run `npm run check` and `npm test` before submitting work. OpenAgentSkillsUsage uses Conventional Commits.

## Disclaimer

OpenAgentSkillsUsage is an independent, unofficial project. It is not affiliated with, endorsed by, or sponsored by OpenAI or Anthropic. OpenAI, Codex, Anthropic, Claude, and Claude Code are trademarks or product names of their respective owners.
