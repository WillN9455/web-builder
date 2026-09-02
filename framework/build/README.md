# Build stage — export unit

Contract for everything the Code Agents (C1–C3) need at task pickup.

| File | Purpose | Written by |
|---|---|---|
| `skills/coding-guidelines.md` | Coding standards for all Code Agents | Build · Rules tab |
| `skills/code-quality.md` | Quality bar: naming, structure, review gates | Build · Rules tab |
| `skills/security.md` | Security rules for implementation | Build · Rules tab |
| `skills/feature-fidelity.md` | Tie UI to persisted state; audit vs. design | Build · Rules tab |
| `config/config-rules.md` | Stack selection rules (framework/DB/hosting) | Build · Rules tab |
| `config/build-rules.md` | Build lifecycle, environments, deployment rules | Build · Rules tab |
| `agents/code-agents.md` | C1–C3 loadouts + user steering notes | Agents tab editor |
| `templates/` | Starter scaffolds the Code Agents build from | Framework maintainers |

## Inputs (read, not owned)
- SA-signed `PRD/<project>/tech-decision-brief.md`
- Design outputs: tokens, component specs, state docs (from the project's `design-system/`)
- `shared/skills/general-best-practices.md`

## Outputs
- Feature-branch code, PRs, `app/` scaffold in the project

## Legacy mapping
- `skills/*.md` ← migrate from repo-root `skills/`
- `config/config-rules.md` ← migrates from `code-builder/config-rules.md`
- `config/build-rules.md` ← new; Build · Rules half previously had no single on-disk target
- `templates/` ← migrates from `code-builder/templates/`