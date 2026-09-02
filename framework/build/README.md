# Build stage — export unit

Contract for everything the Code Agents (C1–C3) need at task pickup.

| File | Purpose | Written by |
|---|---|---|
| `skills/coding-guidelines.md` | Coding standards for all Code Agents | Build · Rules tab |
| `skills/code-quality.md` | Quality bar: naming, structure, review gates | Build · Rules tab |
| `skills/security.md` | Thin binding → `../../shared/skills/security.md` + Build enforcement notes | Build · Rules tab |
| `skills/feature-fidelity.md` | Tie UI to persisted state; audit vs. design | Build · Rules tab |
| `config/config-rules.md` | Stack selection rules (framework/DB/hosting) | Build · Rules tab |
| `config/build-rules.md` | Build lifecycle, environments, deployment rules | Build · Rules tab |
| `agents/code-agent-C1.md` `-C2.md` `-C3.md` | One file per agent: loadout + steering | Agents tab editor |
| `agents/README.md` | Shared loadout only (nothing per-agent) | Framework maintainers |

## Inputs (read, not owned)
- SA-signed `PRD/<project>/tech-decision-brief.md`
- Design outputs: tokens, component specs, state docs (from the project's `design-system/`)
- `../../templates/` — starter scaffolds (top-level; referenced, not owned)
- `shared/skills/general-best-practices.md`, `shared/skills/security.md` (rule body)

## Outputs
- Feature-branch code, PRs, `app/` scaffold in the project

## Legacy mapping
- `skills/coding-guidelines.md`, `skills/code-quality.md`, `skills/feature-fidelity.md` ← migrate from repo-root `skills/`
- `skills/security.md` ← binding; body migrates from repo-root `skills/security.md` + `skills/security-guidelines.md` into `shared/`
- `config/config-rules.md` ← migrates from `code-builder/config-rules.md`
- `config/build-rules.md` ← new; Build · Rules half previously had no single on-disk target