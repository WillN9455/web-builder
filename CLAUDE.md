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

## Framework Flow Map — Cross-Reference Index

This section defines every file dependency in the framework. Each row shows what a file reads from (upstream), what it produces (outputs consumed downstream), and related files that should link to each other. **When you touch any file, check its "Outputs" column to see which downstream artifacts may need updating.**

| File | Reads From (inputs) | Produces (outputs consumed by) |
|------|---------------------|-------------------------------|
| [`idea.txt`](./idea.txt) | User's business idea/pain point/persona | PRD template fill (Section 1 Main Feature, Section 5 Target Users) | [`PRD/templates/prd-template.md`](./PRD/templates/prd-template.md) |
| [`PRD/templates/prd-template.md`](./PRD/templates/prd-template.md) | `idea.txt` content; user answers to every section | Approved PRD at `PRD/<project>/prd.md`; tech constraints for [`code-builder/config-rules.md`](./code-builder/config-rules.md) (Section 3 timing → priority, Section 5 target users → audience needs) | [`design-system/tokens/README.md`](./design-system/tokens/README.md) §6 UX principles; [`AGENTS.md`](./AGENTS.md) BA Agent trigger; PRD reviewer at `§13` |
| [`PRD/<project>/prd.md`](./PRD/) | Approved template + reviewer comments from `§13` | Design Agent triggers for tokens and components; QA acceptance criteria (user stories §8) | All token files, all component specs, all state docs, [`skills/accessibility-guidelines.md`](./skills/accessibility-guidelines.md), [`testing/playwright/README.md`](./testing/playwright/README.md) user story test mapping |
| [`design-system/tokens/color.md`](./design-system/tokens/color.md) | PRD branding requirements; WCAG AA contrast rules from [`skills/accessibility-guidelines.md`](./skills/accessibility-guidelines.md); user brand color input | Semantic color tokens → CSS custom properties; token list for components | [`code-builder/templates/nextjs-starter/app/globals.css`](./code-builder/templates/nextjs-starter/app/globals.css); `tailwind.config.js` (brand colors); all component specs (`design-system/components/*.md`) |
| [`design-system/tokens/typography.md`](./design-system/tokens/typography.md) | PRD typography requirements; brand contrast from `color.md`; Major Third scale (1.250) | Typography scale → CSS custom properties | All component specs; token README (§3); code templates' global CSS |
| [`design-system/tokens/spacing.md`](./design-system/tokens/spacing.md) | PRD layout requirements; 4px base unit rule | Spacing scale → CSS custom properties | All component specs; `tailwind.config.js` spacing config |
| [`design-system/components/README.md`](./design-system/components/README.md) | Component index table; token files; state docs | Component selection guide for Code Agents | Each component spec file; PRD feature list (§8 user stories → components used) |
| [`design-system/components/button.md`](./design-system/components/button.md) | Token files (all color + spacing); all states (`error`, `loading`, `success`, `interaction`); WCAG from accessibility guidelines | Button variant table, state table, props API | PRD feature list (CTAs); QA state tests (playwright) |
| [`design-system/components/card.md`](./design-system/components/card.md) | Token files; states (empty is the key one for cards) | Card spec with data display rules | Content-heavy features in PRD §8 user stories |
| [`design-system/components/form-input.md`](./design-system/components/form-input.md) | Tokens; `validation.md`; `error.md`; [`skills/ui-best-practices.md`](./skills/ui-best-practices.md) §7 form validation | Form field spec with all states | PRD forms/features; Playwright `helpers/form.ts` patterns |
| [`design-system/components/navigation.md`](./design-system/components/navigation.md) | Tokens; accessibility guidelines (§keyboard nav, skip links); `interaction.md` state | Nav bar/specs for header/footer/sidebar/breadcrumbs | PRD §6 UX principles; layout template in code-builder |
| [`design-system/states/error.md`](./design-system/states/error.md) | PRD error requirements; `color.md` semantic error palette; accessibility guidelines (§error ARIA, focus); UI best practices (§2 error states) | Error screen and inline spec with recovery actions | All component specs; Playwright `states.spec.ts` error tests |
| [`design-system/states/loading.md`](./design-system/states/loading.md) | PRD loading requirements; tokens for skeleton colors | Loading state spec (skeleton, spinner) | Code templates' built-in pending states; UI best practices §1 |
| [`design-system/states/success.md`](./design-system/states/success.md) | PRD success requirements; `color.md` semantic success palette; accessibility guidelines (§status role); UI best practices (§3) | Success state spec with confirmation patterns | Form submissions in PRD features; Playwright state tests |
| [`design-system/states/empty.md`](./design-system/states/empty.md) | PRD empty state requirements; component specs that need empty states (card, navigation) | Empty state spec with CTA rules | Components with data lists; Playwright edge case tests |
| [`design-system/states/validation.md`](./design-system/states/validation.md) | PRD validation rules; `form-input` component; UI best practices (§7); accessibility guidelines (`aria-invalid`, `aria-describedby`) | Validation state spec with inline error patterns | All form features in PRD §8; Playwright helpers/form.ts |
| [`design-system/states/interaction.md`](./design-system/states/interaction.md) | Accessibility guidelines required states table (default→hover→focus→active→disabled→error→loading); component specs | Complete interaction state spec for every clickable element | All components; accessibility audit; Playwright `states.spec.ts` |
| [`code-builder/config-rules.md`](./code-builder/config-rules.md) | PRD tech constraints (timing/priority, budget §3); user answers to Section "User Questions"; feature complexity → framework choice | Tech stack decision output | `code-builder/templates/README.md` (template selection); [`idea.txt`](./idea.txt) user preferences; [`skills/coding-guidelines.md`](./skills/coding-guidelines.md) for chosen stack conventions |
| [`code-builder/templates/nextjs-starter/`](./code-builder/templates/nextjs-starter/) | Stack choice from `config-rules.md`; design tokens (color, typography, spacing); coding guidelines (file organization) | Scaffolded project with filled tokens | [`AGENTS.md`](./AGENTS.md) Code Agent trigger; each skill file (all standards applied during scaffold fill) |
| [`skills/coding-guidelines.md`](./skills/coding-guidelines.md) | Framework standards; file structure conventions from code templates | Reviewed code standards check | Code templates' `src/` layout; testing patterns in playwright README |
| [`skills/security.md`](./skills/security.md) + [`skills/security-guidelines.md`](./skills/security-guidelines.md) | PRD data/access requirements (Section 5 users, Section 9 supporting docs); framework rules | Auth guards, IDOR scopes, input validation output for every route/handler | Every file touched in generated code; QA security tests; agent launch trigger (`AGENTS.md`) |
| [`skills/accessibility-guidelines.md`](./skills/accessibility-guidelines.md) | Design token contrast decisions (§color); state docs (§interaction, §error); component specs | Accessibility audit output for every UI element | All components; state specs; Playwright a11y helpers (if they exist); QA Agent test plan |
| [`skills/code-quality.md`](./skills/code-quality.md) | Framework standards; existing codebase state | Duplication/race-condition/timezone review | PRD requirements (avoid over-engineering per §1–§2); skill invocation rules table (§above in this doc) |
| [`skills/feature-fidelity.md`](./skills/feature-fidelity.md) | Design specs for the feature; existing code before modification | Feature fidelity check (no design drift, no regression) | All component specs; state docs; PRD section mapping per feature |
| [`skills/ui-best-practices.md`](./skills/ui-best-practices.md) | State docs (§error, §loading, §success, §empty, §validation); accessibility guidelines | UI completeness checklist output for every screen/route with user interaction | PRD features (every user flow); state docs; component specs |
| [`skills/general-best-practices.md`](./skills/general-best-practices.md) | Framework standards | Cross-agent governance rules | MoSCoW prioritization (PRD §3); agent-specific rules (`AGENTS.md` each agent row); all artifact paths in "Artifacts Are Source of Truth" section |
| [`testing/playwright/README.md`](./testing/playwright/README.md) | PRD user stories §8 + acceptance criteria; design state docs (§all states); accessibility guidelines (§Testing Requirements) | Playwright test suite mapped to requirements | Test naming traces back to PRD sections (`§8 User Story #N`); state files (error/loading/success/empty/validation tests per spec); component specs (data-testid targets) |
| [`workflows/README.md`](./workflows/README.md) | All upstream artifacts (PRD, design system, skills, token outputs) | Orchestration patterns for each stage transition | `AGENTS.md` agent launch order (§Agent Launch Order); framework flow map above (file dependencies) |
| [`AGENTS.md`](./AGENTS.md) | Framework standards; user input / idea.txt content | Task assignments, state promotions, review outcomes | Each agent row references its skill files; PRD template (§13 review log); workflow patterns (§Workflow Execution Notes in workflows/README.md) |

**How to use this table:** When building a feature, trace the chain: `idea.txt` → PRD §N → design component/state → skill → code implementation → test. If any link is missing, that's Gap 6 — fill it by adding cross-references in both directions (upstream points down, downstream points up).
