# framework/ — the exportable unit

Everything under `framework/` is copied **wholesale** into a new project when a
user creates a new idea in the Idea Hub. Nothing outside `framework/` is
exported (the launcher, mockups, and framework-repo docs stay behind).

**This is v1 — draft for debate with Solution Architect. Revision count: 1.**

## Structure

```
framework/
  manifest.json            ← machine-readable export contract (launcher reads this)
  design/                   ← Design stage
    skills/                 ← skill files this stage's agents load on demand
    config/                 ← rules-in-force files the Design · Rules tab writes to
    agents/                 ← per-agent loadout + steering files (Agents tab writes here)
  build/                    ← Build stage (same three subfolders)
    templates/              ← starter scaffolds (nextjs-starter, …)
  qa/                       ← QA + Review stage (same three subfolders)
    playwright/             ← test harness
  shared/
    skills/                 ← cross-stage skills (not owned by one stage)
```

## The three-file contract per stage

| Subfolder | Who reads it | Who writes it |
|---|---|---|
| `skills/`   | Stage agents, loaded on demand per CLAUDE.md § Skill Invocation Rules | Human, via the stage Rules tab |
| `config/`   | Stage agents, at task pickup (rules in force) | Human, via the stage Rules tab |
| `agents/`   | The named agent, at task pickup (loadout + steering notes) | Human, via the Agents tab editor |

## Rules

1. **Stage folders are self-contained.** An agent working a Design task never
   needs to reach outside `framework/design/` for its own stage rules — except
   `shared/skills/` and `prd/` artifacts, which are inputs, not rules.
2. **All human steering lands in files, not chat.** Any "update this agent"
   from the user is a file edit in `agents/` or `config/` — durable, diffable,
   and visible on the next task pickup.
3. **The manifest is the only thing the launcher hardcodes.** Export logic,
   write-back targets, and skill→agent mapping all come from `manifest.json`,
   so structure can evolve without launcher code changes.

## Open questions (for the debate)

- Should `prd/` and `workflows/` also move inside `framework/` so the export
  unit is truly one folder? (v1: they stay at repo root; manifest references them.)
- Skills split per stage (v1) vs. one shared `skills/` pool with a stage map
  in the manifest — duplication vs. cohesion.
- One file per agent vs. one file per role-family (v1 uses one file for
  C1–C3 in `build/agents/code-agents.md`).