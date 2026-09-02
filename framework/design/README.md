# Design stage — export unit

Contract for everything the Design stage's agents need at task pickup.

| File | Purpose | Written by |
|---|---|---|
| `skills/accessibility-guidelines.md` | A11y rules the Design Agent applies to tokens, components, flows | Design · Rules tab |
| `skills/ui-best-practices.md` | UI completeness checklist for wireframes/specs | Design · Rules tab |
| `config/design-rules.md` | Rules in force for the Design stage | Design · Rules tab |
| `agents/design-agent.md` | Design Agent loadout + user steering notes | Agents tab editor |

## Inputs (read, not owned)
- Approved PRD at `PRD/<project>/prd.md` (§6b journeys, §8 user stories)
- `shared/skills/general-best-practices.md`

## Outputs (land in the project workspace, not in this export unit)
- Design tokens, component specs, state docs (`design-system/` in the project)

## Legacy mapping
- `skills/accessibility-guidelines.md` — a11y rule body (migrated from the former repo-root `skills/`)
- `skills/ui-best-practices.md` — UI completeness checklist (migrated from the former repo-root `skills/`)
- `config/design-rules.md` ← new; Design · Rules half previously had no single on-disk target