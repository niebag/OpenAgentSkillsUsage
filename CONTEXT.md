# OpenAgentSkillsUsage

OpenAgentSkillsUsage gives a local, read-only account of how Agent Skills are used across coding agents.

## Language

**Skill**:
A reusable instruction set that a coding agent can activate while handling a session.
_Avoid_: Tool, plugin

**Skill Use**:
One observed activation of a Skill within an Agent Session. A Skill Use carries an Invocation Kind that states how the activation was established.
_Avoid_: Hit, run

**Agent**:
The coding agent in which a Skill Use occurred. The initial Agents are Codex and Claude Code; this does not describe the Skill's author or origin.
_Avoid_: Publisher, provider, marketplace

**Agent Session**:
A locally recorded interaction history belonging to one Agent.
_Avoid_: Transcript, conversation

**Invocation Kind**:
The evidence classification for a Skill Use: `explicit` when requested directly by the user, `agent` when recorded as an agent action, or `inferred` when reconstructed from supporting session evidence.
_Avoid_: Confidence level

**Usage History**:
The set of Skill Uses observable in all locally available Agent Sessions.
_Avoid_: Analytics, telemetry
