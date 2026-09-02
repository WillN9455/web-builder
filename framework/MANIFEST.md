# manifest.json — schema

`manifest.json` is the **only** thing the launcher reads to learn the export
structure. `init-frame.js` must not hardcode folder lists — it reads this file,
so the structure can evolve without launcher code changes. The Idea Hub UI also
uses it in reverse: each `ui_write_back` key says which editing surface owns
which file, so a user edit lands on disk in exactly one place.

## Top-level keys

| Key | Type | Meaning |
|---|---|---|
| `version` | string | Structure schema version (semver; bump on contract changes) |
| `revision` | number | Debate/lock revision of this file. `2` = locked consensus |
| `status` | string | `draft` while under debate, `locked` once agreed |
| `export_root` | path | The folder copied wholesale into a new project on idea creation. Everything under it exports; nothing outside it does |
| `stages` | object | One entry per pipeline stage. Key = stage id |
| `shared` | object | Cross-stage skills and who consumes them |
| `outside_export_root` | object | Repo-root artifacts the launcher references at export time but does **not** copy (different lifecycle than the framework) |

## Per-stage keys (each entry in `stages`)

| Key | Type | Meaning |
|---|---|---|
| `label` | string | Human label shown in the Idea Hub |
| `folder` | path | Stage folder relative to `export_root`. Always contains the tri-fold: `skills/`, `config/`, `agents/` |
| `skills` | list | Skill files the stage's agents load on demand. Binding files appear here too (body in `shared/`) |
| `config` | list | Rules-in-force files the stage's agents read at task pickup |
| `agents` | list | Per-agent loadout + steering files. **One file per agent** — clone/remove edits exactly one file |
| `templates` | list | *(Build only)* starter scaffolds, referenced not owned |
| `shared_inputs` | list | Shared skills this stage consumes without a local binding |
| `ui_write_back` | string | Which UI surface writes this stage's `config/` files |
| `downstream` | string | *(Where present)* what the stage produces and where that output lives instead |

## The tri-fold contract (identical in every stage folder)

| Subfolder | Who reads it | Who writes it |
|---|---|---|
| `skills/` | Stage agents, on demand | Human, via the stage Rules tab |
| `config/` | Stage agents, at task pickup | Human, via the stage Rules tab (`ui_write_back`) |
| `agents/` | The named agent, at task pickup | Human, via the Agents tab editor |

## Shared-skill rule

A skill body lives in `shared/skills/` only when **two or more stages consume
it**. Consumers keep a thin binding file in their own `skills/` that points at
the shared body and adds stage-specific enforcement notes. Current shared
bodies: `general-best-practices.md` (all stages), `security.md` (Build
enforces; QA and Review audit).

## Outside the export root

`prd/` (per-project lifecycle) and `workflows/` (framework-meta the launcher
orchestrates from) stay at the repo root and are referenced via
`outside_export_root`. They are inputs at export time, not part of the copied
unit.