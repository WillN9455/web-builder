# Idea-to-Web-Solution Framework

An intelligent multi-agent system that takes a business idea and produces a fully specified, designed, coded, and tested web application.

## Philosophy

1. **Start with the problem, not the solution** — Every project begins with a user's pain points and needs.
2. **Requirements first** — Product requirements drive features, which drive design, which drive code. No shortcuts.
3. **Design before implementation** — Wireframes, interactions, states, and tokens are defined before any code is written.
4. **Agents collaborate and critique** — Roles don't just produce; they review each other's work adversarially.
5. **Accessibility and quality are non-negotiable** — WCAG compliance, security, and maintainability are built in, not bolted on.
6. **Ideas evolve** — `idea.md` is a living document. Update it as the vision clarifies.

## Workspace Root

**Where artifacts go.** At session start, every agent resolves the workspace root:

1. If `project-dir.txt` exists in the current directory, the **first non-empty line** is an absolute path to the project folder — **all reads and writes of project artifacts** (`idea.md`, `PRD/`, `design-system/`, app code, tests, reviews) must target that directory, not the current repository. Verify the path exists before writing; if it is missing or unreadable, stop and ask the user whether to update or remove `project-dir.txt` — do not silently fall back.
2. If no `project-dir.txt` exists, the current repository **is** the project — write artifacts relative to the repository root as usual.

The two cases map to two different repos:

- **This repository (the framework repo)** contains `framework/` — the stage rulebooks, skills, configs, agent briefs, and the nextjs-starter template — plus the launcher and intake tooling. It is a *rules library*, not a project. When running from here (e.g. via `idea-intake/server.js`), `project-dir.txt` pins the separate project folder that receives artifacts.
- **An exported project repo** already has `framework/` copied in at export time (per `framework/manifest.json`). It has no `project-dir.txt`: the repository root is the workspace, `framework/` supplies the rules, and `PRD/`, `design-system/`, app code, and tests are written here.

`project-dir.txt` is written by `idea-intake/server.js` when a user picks a project folder in the intake chat (it is git-ignored — it is machine-local state, not project content). Never commit it, and never invent a project path if the file is absent.

## Project Structure

```
<project-repo>/
├── CLAUDE.md              # This file — framework docs
├── AGENTS.md              # Agent roles, coordination, and communication
├── FRAMEWORK-FLOW.md      # File dependency table (upstream inputs → downstream consumers)
├── idea.md                # Living idea document (source of truth)
├── PRD/
│   └── templates/         # Product Requirements Document templates (incl. supporting docs)
├── framework/             # The stage rule library (copied at export time; manifest: framework/manifest.json)
│   ├── design/            #   Design stage — skills (a11y, UI), config, agent brief
│   ├── build/             #   Build stage — skills (coding, quality, fidelity), config, agent briefs
│   ├── qa/                #   QA stage — testing guidelines + playwright helpers, config, agent brief
│   ├── review/            #   Review stage — review bar, severity ladder, agent brief
│   ├── shared/            #   Rule bodies consumed by 2+ stages (security, general best practices)
│   └── templates/         #   Starter scaffolds (nextjs-starter) + template-selection doc
├── design-system/         # Design stage OUTPUT — tokens/, components/, states/ for this project
├── workflows/             # Orchestration patterns for agent coordination
└── launcher/, idea-intake/  # Framework-repo only: the Buzz launcher app and intake chat (not exported)
```

## Workflow Overview

Each project flows through these stages:

### Stage 1: Requirements Gathering
- **Agent**: BA Agent + Requirements Reviewer (adversarial)
- The framework asks the user clarifying questions to fill out the PRD template
- BA Agent writes requirements; Reviewer Agent critiques and argues until agreement
- Output: Approved PRD with features, user stories, scope, priorities

### Stage 2: Design Generation
- **Agent**: Design Agents A + B (peer review)
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
- Code follows all relevant skill files (see Skill Invocation Rules below):
  - `framework/build/skills/coding-guidelines.md` — structure and naming
  - `framework/shared/skills/security.md` — security from day one (the consolidated checklist + guidelines body)
  - `framework/design/skills/accessibility-guidelines.md` — WCAG compliance
  - `framework/build/skills/code-quality.md` — no duplication, atomic DB ops, correct timezones
  - `framework/build/skills/feature-fidelity.md` — match design exactly, preserve existing code
  - `framework/design/skills/ui-best-practices.md` — all UI states handled
  - `framework/shared/skills/general-best-practices.md` — requirements-first discipline
- Scaffold from `framework/templates/nextjs-starter/` (or chosen stack per `framework/templates/docs/template-selection.md`)
- Output: Feature-ready code pushed to branch

### Stage 4: Review
- **Agents**: Dev Reviewers review code (maintainability, security, accessibility) per `framework/review/config/review-rules.md`
- **Agents**: BA Agent + Design Agents verify via Playwright runs
- Issues tagged and sent back if needed; approved features move to final review

### Stage 5: QA Testing
- **Agent**: QA Agent (per `framework/qa/`)
- Tests against original requirements (questions BA Agent when needed)
- Full Playwright UI test suite for each feature (test rules in `framework/qa/skills/testing-guidelines.md`)
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

Skills live in stage folders under `framework/` — a body shared by 2+ stages lives in `framework/shared/skills/`; single-stage skills live in that stage's `skills/` folder.

### Framework Guidelines (always active)

These apply at every stage. Every agent reads them before working:

- **`framework/build/skills/coding-guidelines.md`** — Coding standards, patterns, file organization
- **`framework/shared/skills/security.md`** — Security best practices (auth, data, API) — the consolidated body of the former `security-guidelines.md` + `security.md`
- **`framework/design/skills/accessibility-guidelines.md`** — WCAG compliance requirements
- **`framework/shared/skills/general-best-practices.md`** — Platform-wide rules (always adhere to requirements and designs)

### Feature Skills (triggered during build / large updates)

These are activated when building or modifying features. See **Skill Invocation Rules** below for when each fires:

- **`framework/build/skills/code-quality.md`** — Prevents duplication, race conditions, and timezone bugs. Search before creating; use atomic DB operations; format on client, not server.
- **`framework/build/skills/feature-fidelity.md`** — Prevents design drift and regression. Read the design first, audit existing code before touching it, tie UI to persisted state.
- **`framework/shared/skills/security.md`** — Comprehensive security checklist with examples. Auth guards, IDOR prevention, input validation, RBAC, CSRF, rate limiting, file uploads, error leakage.
- **`framework/design/skills/ui-best-practices.md`** — UI completeness and resilience. Loading states, error states with focus management, success feedback, empty states, back/cancel navigation, image fallbacks, form validation.

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
| Any data access or query | `security.md` (IDOR prevention), security guidelines in the shared body |
| Designing a screen or interaction | `accessibility-guidelines.md`, `ui-best-practices.md` |
| Code review | All skills reviewed adversarially against the changes |

**How to activate:** Before writing any code for a feature, the agent should read and follow the relevant skill file(s) from the table above (resolve each name via the paths in **Skills / Guidelines**). The skill's rules become part of the task requirements — they are not optional guidelines.

## Rules

1. Never skip the PRD stage — even rough requirements are better than none
2. Design must include all interaction states before code begins
3. Every agent references the relevant skill before working
4. Adversarial review is mandatory at every stage — not optional
5. Accessibility requirements come from design, not implementation
6. Code agents cannot start until design is approved by both design agents
7. Features cannot move to QA without full review clearance
8. The user always has final approval before moving between stages
9. All artifact writes go to the workspace root — the path in `project-dir.txt` if it exists, otherwise the current repository (see Workspace Root)

## How This Framework Grows

- Update `idea.md` as the vision evolves
- Add new skills when gaps are discovered during projects — shared bodies in `framework/shared/skills/`, stage-specific ones in `framework/<stage>/skills/`
- Extend the PRD template as requirements patterns emerge
- Add new design tokens and components to the design system
- Create new code templates for different stacks (see `framework/templates/docs/template-selection.md`)

## Framework Flow Map

Complete file dependency table lives in [`FRAMEWORK-FLOW.md`](./FRAMEWORK-FLOW.md). It maps every upstream input and downstream output across the framework.
**When you touch any file, check its "Outputs" column in that table to see which artifacts may need updating.**