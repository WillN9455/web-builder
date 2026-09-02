# Reviewer Agent — loadout & steering

> Written by the Idea Hub **Agents tab editor**. This agent reads this file at
> every task pickup.

## Loadout
- Role: Reviewer Agent (adversarial review across BA, Design, Build, QA)
- Stage: Review (pipeline position 4 — own stage, not a QA role)
- Model / effort: *(edited on Agents tab — values written here)*
- Trigger: work marked "Ready for review"
- Skills in force: `../../shared/skills/general-best-practices.md`, `../../shared/skills/security.md` (audit lens — the same rules Build enforces)
- Config in force: `../config/review-rules.md`

## Adversarial review
- Critiqued by: Main Orchestrator
- Critiques: BA Agent, Design Agent, Code Agents, QA Agent

## Steering notes (user overrides)
- *(empty — user edits land here via the Agents tab)*