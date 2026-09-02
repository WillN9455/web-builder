# framework/ — the exportable unit

Everything under `framework/` is copied **wholesale** into a new project when a
user creates a new idea in the Idea Hub. Nothing outside `framework/` is
exported (the launcher, mockups, and framework-repo docs stay behind).

**Revision 2 — locked consensus** (Thinking model + Solution Architect, 3
revisions total, under the 5-revision budget). Schema for `manifest.json`:
[`MANIFEST.md`](MANIFEST.md).

## Structure

```
framework/
  manifest.json            ← machine-readable export contract (launcher reads this)
  MANIFEST.md              ← schema doc for the manifest
  design/                   ← Design stage
    skills/  config/  agents/
  build/                    ← Build stage (same tri-fold)
  qa/                       ← QA stage (same tri-fold)
    playwright/             ← test harness
  review/                   ← Review stage (same tri-fold; owns no skill bodies)
  shared/
    skills/                 ← cross-stage skill BODIES (2+-consumer rule)
  templates/                ← starter scaffolds — top level, consumed pre-stage
```

Every stage folder has the same tri-fold: **`skills/`** (loaded on demand),
**`config/`** (rules in force, written by the stage Rules tab), **`agents/`**
(one file per agent — loadout + steering, written by the Agents tab editor).

## Settled decisions (rev 2)

1. Stage-first nesting with the tri-fold above; no flat shared skills pool.
2. One file per agent, not a family file — clone/remove edits exactly one file.
   Shared loadout prose lives in the stage's `agents/README.md`.
3. Shared skill bodies live in `shared/skills/` under the 2+-consumer rule;
   consumers keep thin binding files in their own `skills/`. `security.md` is
   shared now (Build enforces; QA and Review audit).
4. `prd/` and `workflows/` stay **outside** `framework/` — different export
   lifecycles; the launcher references them via `manifest.json`
   `outside_export_root`.
5. `templates/` sits at the framework root, not under `build/` — consumed
   before stage assignment (intake previews).
6. Review is a fourth stage (`review/`), not a QA role — its inputs span BA,
   Design, Build, and QA.
7. `manifest.json` is the only launcher contract — no hardcoded `FRAMEWORK_DIRS`
   in `init-frame.js`.

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

## Provenance

Stage skill and config bodies are migrated (not stubs): the former repo-root `skills/` and `code-builder/` rulebooks, QA test rules
consolidated from the former `testing/playwright/README.md`, and the four
per-stage Rules config files filled from the launcher design mockups
(`launcher/design/*-tab.html`). Thin bindings remain the one exception:

```sh
grep -rn "binding:" framework/        # thin bindings → shared bodies
```