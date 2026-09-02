# Code Agents (build/agents/)

One file per agent — `code-agent-C1.md`, `code-agent-C2.md`, `code-agent-C3.md`.
The Agents tab editor's clone/remove actions edit exactly one file; no sibling
is touched. Cloning C1 → C4 is a file copy.

This README holds only the **shared loadout** — the lines identical across all
Code Agents. Anything that differs per agent lives in that agent's own file,
never here.

## Shared loadout (applies to every code-agent-*.md)
- Stage: Build
- Trigger: story assigned on the Sprint board
- Skills in force: `../skills/coding-guidelines.md`, `../skills/code-quality.md`, `../skills/security.md` (binding → `../../shared/skills/security.md`), `../skills/feature-fidelity.md`
- Scaffold from: `../../templates/nextjs-starter/` (per `../config/config-rules.md` stack selection)
- Critiqued by: Reviewer Agent (`../../review/agents/reviewer-agent.md`)

If you find yourself editing this section to steer one agent, put that edit in
the agent's file instead — that is the whole point of the split.