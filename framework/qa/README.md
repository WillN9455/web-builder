# QA stage — export unit

Contract for everything the QA Agent needs at task pickup. (The Reviewer Agent
moved to its own stage — see `../review/`.)

| File | Purpose | Written by |
|---|---|---|
| `skills/testing-guidelines.md` | Test-writing rules and coverage bar | QA · Rules tab |
| `skills/security.md` | Thin binding → `../../shared/skills/security.md` + QA enforcement notes | QA · Rules tab |
| `config/test-rules.md` | Test framework config + rules in force | QA · Rules tab |
| `agents/qa-agent.md` | QA Agent loadout + user steering | Agents tab editor |
| `playwright/` | Playwright harness (helpers, traces, README) | Framework maintainers |

## Inputs (read, not owned)
- PRD §8 user stories (acceptance criteria)
- Build outputs: feature branches, PRs, screenshots (first-class evidence)
- `shared/skills/general-best-practices.md`, `shared/skills/security.md` (audit basis)

## Outputs
- Test results, verdicts, rework round-trips to Build

## Legacy mapping
- `skills/testing-guidelines.md` ← consolidates from repo-root `skills/` + `testing/playwright/README.md`
- `config/test-rules.md` ← new; QA · Rules half previously had no single on-disk target
- `playwright/` ← migrates from `testing/playwright/`