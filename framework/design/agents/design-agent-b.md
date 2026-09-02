# Design Agent B — loadout & steering

> Written by the Idea Hub **Agents tab editor**. This agent reads this file at
> every task pickup. All user steering for Design Agent B lives here.

## Loadout
- Role: Design Agent B (DA-B)
- Stage: Design
- Model / effort: *(edited on Agents tab — values written here)*
- Trigger: Main Orchestrator handoff after PRD approval
- Skills in force: `../skills/accessibility-guidelines.md`, `../skills/ui-best-practices.md`

## Peer review
- Design Agents A and B run peer review on every story (see the Design tab
  mockup, `launcher/design/design-tab.html`): B reviews A's token, component,
  and state output and vice versa. Both must approve before the design system
  is compiled — see `AGENTS.md` §Design Agents.
- Critiqued by: Reviewer Agent
- Critiques: BA Agent (PRD fidelity)

## Steering notes (user overrides)
- *(empty — user edits land here via the Agents tab)*