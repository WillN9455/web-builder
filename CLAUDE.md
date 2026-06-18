# Idea-to-Web-Solution Framework

An intelligent multi-agent system that takes a business idea and produces a fully specified, designed, coded, and tested web application.

## Philosophy

1. **Start with the problem, not the solution** — Every project begins with a user's pain points and needs.
2. **Requirements first** — Product requirements drive features, which drive design, which drive code. No shortcuts.
3. **Design before implementation** — Wireframes, interactions, states, and tokens are defined before any code is written.
4. **Agents collaborate and critique** — Roles don't just produce; they review each other's work adversarially.
5. **Accessibility and quality are non-negotiable** — WCAG compliance, security, and maintainability are built in, not bolted on.
6. **Ideas evolve** — `idea.txt` is a living document. Update it as the vision clarifies.

## Project Structure

```
claude-coding-framework/
├── CLAUDE.md              # This file — framework docs
├── idea.txt               # Living idea document (source of truth)
├── AGENTS.md              # Agent roles, coordination, and communication
├── PRD/
│   └── templates/         # Product Requirements Document templates
├── design-system/         # Design generation rules and outputs
│   ├── tokens/            # Color, spacing, typography tokens
│   ├── components/        # Component specifications
│   └── states/            # State definitions (error, loading, empty, etc.)
├── skills/                # Agent skill base — guidelines every agent follows
│   ├── coding-guidelines.md           # File organization, naming, code standards
│   ├── security-guidelines.md         # Security checklist (auth, data, API)
│   ├── accessibility-guidelines.md    # WCAG 2.1 AA requirements
│   ├── general-best-practices.md      # Cross-agent rules
│   ├── code-quality.md                # Duplication prevention, race conditions, timezone handling
│   ├── feature-fidelity.md            # Design drift prevention, regression checks
│   ├── security.md                    # Detailed security checklist with examples
│   └── ui-best-practices.md           # UI completeness and resilience patterns
├── code-builder/          # Code generation rules and templates
│   ├── templates/         # Starter project scaffolds
│   └── config-rules.md    # How to choose frameworks, DBs, hosting
├── testing/               # Test creation and execution
│   └── playwright/        # Automated UI test generation
└── workflows/             # Orchestration scripts for agent coordination
```

## Workflow Overview

Each project flows through these stages:

### Stage 1: Requirements Gathering
- **Agent**: BA Agent + Reviewer Agent (adversarial)
- The framework asks the user clarifying questions to fill out the PRD template
- BA Agent writes requirements; Reviewer Agent critiques and argues until agreement
- Output: Approved PRD with features, user stories, scope, priorities

### Stage 2: Design Generation
- **Agent**: Design Agent A + Design Agent B (peer review)
- Design system tokens defined (colors, typography, spacing)
- User flows, wireframes, interactive prototypes specified
- All interaction states documented (error, loading, success, empty, validation, edit, disabled, focus)
- WCAG compliance checked (contrast, keyboard nav, ARIA)
- Design constraints: CSS-implementable only, SVGs over raster, proper layer naming
- Output: Complete design spec ready for implementation

### Stage 3: Code Generation
- **Agent**: 3 Code Agents (parallel, each on own branch)
- Framework choices confirmed (frontend, DB, hosting, APIs)
- Each agent builds their assigned feature with unit tests
- Code follows all relevant skill files (see Skill Invocation Rules above):
  - `skills/coding-guidelines.md` — structure and naming
  - `skills/security.md` + `skills/security-guidelines.md` — security from day one
  - `skills/accessibility-guidelines.md` — WCAG compliance
  - `skills/code-quality.md` — no duplication, atomic DB ops, correct timezones
  - `skills/feature-fidelity.md` — match design exactly, preserve existing code
  - `skills/ui-best-practices.md` — all UI states handled
  - `skills/general-best-practices.md` — requirements-first discipline
- Output: Feature-ready code pushed to branch

### Stage 4: Review
- **Agents**: All dev agents review code (maintainability, security, accessibility)
- **Agents**: BA Agent + Design Agent verify via Playwright runs
- Issues tagged and sent back if needed; approved features move to final review

### Stage 5: QA Testing
- **Agent**: QA Agent
- Tests against original requirements (questions BA Agent when needed)
- Full Playwright UI test suite for each feature
- Pass → ready for deployment | Fail → back to dev with tag and failure details

### Stage 6: Deployment
- Task marked done; all artifacts documented
- Summary of what was built, tested, and any known limitations

## Agent Reference

See `AGENTS.md` for detailed agent specifications, communication protocols, and task promotion rules.

| Agent | Role | Count | Key Skill(s) |
|-------|------|-------|-------------|
| Main Orchestrator | Creates tasks, tracks progress, promotes PRs, manages Jira sync | 1 | workflow-orchestration |
| BA Agent | Writes product requirements from ideas/personas | 1 | requirements-engineering |
| Requirements Reviewer | Critiques and adversarially challenges BA output | 1 | critical-analysis |
| Design Agents | Create designs per feature, peer review each other | 2 | ui-design |
| Code Agents | Build features in parallel on separate branches | 3 | code-generation |
| Dev Reviewers | Check code maintainability, security, accessibility | 3 | code-review |
| QA Agent | Tests features against requirements with Playwright | 1 | qa-testing |

## Skills / Guidelines

### Framework Guidelines (always active)

These apply at every stage. Every agent reads them before working:

- **`skills/coding-guidelines.md`** — Coding standards, patterns, file organization
- **`skills/security-guidelines.md`** — Security best practices (auth, data, API)
- **`skills/accessibility-guidelines.md`** — WCAG compliance requirements
- **`skills/general-best-practices.md`** — Platform-wide rules (always adhere to requirements and designs)

### Feature Skills (triggered during build / large updates)

These are activated when building or modifying features. See **Skill Invocation Rules** below for when each fires:

- **`skills/code-quality.md`** — Prevents duplication, race conditions, and timezone bugs. Search before creating; use atomic DB operations; format on client, not server.
- **`skills/feature-fidelity.md`** — Prevents design drift and regression. Read the design first, audit existing code before touching it, tie UI to persisted state.
- **`skills/security.md`** — Comprehensive security checklist with examples. Auth guards, IDOR prevention, input validation, RBAC, CSRF, rate limiting, file uploads, error leakage.
- **`skills/ui-best-practices.md`** — UI completeness and resilience. Loading states, error states with focus management, success feedback, empty states, back/cancel navigation, image fallbacks, form validation.

### Skill Invocation Rules

When an agent is performing a **build**, **implementation**, or **large update**, it MUST activate the appropriate skills from the table below. These are not optional — they are enforced at every stage of the framework.

| Trigger | Activated Skills |
|---------|-----------------|
| Building any new feature (code generation) | `code-quality.md`, `feature-fidelity.md`, `security.md`, `ui-best-practices.md` |
| Modifying an existing feature / updating code | `code-quality.md`, `feature-fidelity.md`, `security.md`, `ui-best-practices.md` |
| Writing a route, endpoint, or API handler | `security.md` (all rules), `code-quality.md` (race conditions) |
| Building or modifying a UI component / screen / form | `ui-best-practices.md` (all states), `feature-fidelity.md` (design fidelity) |
| Creating a new utility function, helper, or component | `code-quality.md` (search before creating) |
| Working with dates, times, or scheduling | `code-quality.md` (timezone rules) |
| Any data access or query | `security.md` (IDOR prevention), `security-guidelines.md` |
| Designing a screen or interaction | `accessibility-guidelines.md`, `ui-best-practices.md` |
| Code review | All 8 skills reviewed adversarially against the changes |

**How to activate:** Before writing any code for a feature, the agent should read and follow the relevant skill file(s) from the table above. The skill's rules become part of the task requirements — they are not optional guidelines.

## Rules

1. Never skip the PRD stage — even rough requirements are better than none
2. Design must include all interaction states before code begins
3. Every agent references the relevant skill before working
4. Adversarial review is mandatory at every stage — not optional
5. Accessibility requirements come from design, not implementation
6. Code agents cannot start until design is approved by both design agents
7. Features cannot move to QA without full review clearance
8. The user always has final approval before moving between stages

## How This Framework Grows

- Update `idea.txt` as the vision evolves
- Add new skills when gaps are discovered during projects
- Extend the PRD template as requirements patterns emerge
- Add new design tokens and components to the design system
- Create new code templates for different stacks (React, Vue, Svelte, etc.)
