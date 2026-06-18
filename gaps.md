# Framework Review: Viability as a Reusable Web-Solution Builder

## Executive Summary

The framework has **excellent documentation depth** but is **not yet ready to be invoked as a standalone builder**. It is a comprehensive *specification document* for how agents should work together, but it lacks the scaffolding, templates, bootstrap mechanism, and executable orchestration logic needed to actually produce complete code repositories from scratch.

---

## What Works Well

### Strength 1: Documentation Depth (Score: 9/10)

The skill files are **exceptionally well-written**. Each one reads like it was written by a senior engineer who has seen real bugs in production:

- `skills/security.md` — 12 sections with concrete code examples for every rule (IDOR, CSRF, rate limiting, file upload validation, error leakage)
- `skills/code-quality.md` — Addresses real persistent issues (race conditions with atomic DB ops, timezone UTC vs client-local, duplication prevention)
- `skills/ui-best-practices.md` — Covers the full state range (loading → error → success → empty → back navigation) with actual code patterns
- `skills/feature-fidelity.md` — The "audit existing code before touching it" and "tie UI to persisted state not ephemeral" rules are battle-tested

### Strength 2: Agent Roles & Communication (Score: 8/10)

- AGENTS.md clearly defines triggers, responsibilities, outputs, and communication protocols for each role
- Task state machine (`pending → in-progress → review → qa-ready → done`) with failure paths is well-specified
- The adversarial review model (BA + Reviewer loop, Design A + B peer review) is correctly modeled

### Strength 3: PRD Template (Score: 7/10)

The template structure is comprehensive (13 sections covering features, problem alignment, user stories, scope, milestones). But it's **pure placeholder** — no filled example exists.

---

## Critical Gaps That Prevent It from Working as a Builder

### Gap 1: No Bootstrap/Initialization Mechanism

There is **no way to invoke this framework in a new directory**. A user would have to manually copy files and figure out which ones go where. Missing:

- A bootstrap script (e.g., `bootstrap.sh` or `init-frame.js`) that copies the framework into a target directory and asks initial questions
- No entry point — how does the Main Orchestrator "start"? There's no `start.md`, `invoke.md`, or `ONBOARDING.md` that says "when you receive this, do X first"
- No project scaffolding instructions — how to create `PRD/<project-name>/`, `design-system/<project-name>/`, etc.

### Gap 2: Code Templates Are Incomplete / Non-functional

The Next.js starter is **barely a scaffold**:

- `app/layout.tsx` has `TODO` placeholders (`{{PROJECT_NAME}}`, `{{PRIMARY_FONT}}`) and only ~30 lines
- `app/globals.css` exists but its content was not read (it's likely empty or minimal)
- No `package.json`, `next.config.ts`, `tsconfig.json`, `.env.example`, or any dependency list
- Only 2 files exist in the entire `code-builder/templates/nextjs-starter/` directory — a real starter project would have routes, API patterns, auth scaffolding, database schema setup
- No templates for other stacks mentioned in config-rules.md (Vue/Nuxt, Svelte/SvelteKit, Angular)

### Gap 3: No Decision Logic for Stack Selection

`code-builder/config-rules.md` has **tables of options** but no actual decision flow:

- It lists "when to choose X vs Y" tables, which is good reference material
- But there's no mechanism to ask the user questions and select based on answers
- No weighted scoring or guided questionnaire pattern
- Config rules are static reference docs, not an interactive decision process

### Gap 4: Workflows Are Pseudo-Code, Not Executable

The workflow patterns in `workflows/README.md`:

- Show TypeScript-like pseudo-code that **cannot actually run** (references undefined schemas, arbitrary agent calls)
- No phase structure that maps to Claude Code's `Workflow` tool API
- No error handling or fallback paths defined as actual logic
- Essentially "design document for workflows" not "workflow implementations"

### Gap 5: Design System Is Descriptive, Not Functional

The design system tokens and components are **written specifications**, not usable assets:

- Color tokens show `--ds-color-brand-primary-500` → `<TBD>` — no actual brand colors defined
- No compiled CSS output (no `tokens.css`, no custom property generation)
- Component specs (`button.md`) describe properties but don't include implementation code
- No design manifest or schema validation to check if a component spec is complete
- Would require agents to write all CSS from scratch each time — nothing to copy/compile

### Gap 6: Missing Inter-File References (Siloed Files)

The files **don't reference each other**. Each skill file, design doc, and template is an island. A usable framework needs cross-references so that:

- The PRD template references which design tokens to fill
- The code templates reference which skill files apply
- The workflow patterns reference which artifacts to read/write
- Example: `code-builder/config-rules.md` should link to the relevant section of the PRD where stack constraints are captured

### Gap 7: No User Onboarding / First-Time Use Guide

A new user has **no starting point**:

- README says "Run the framework — Claude Code agents will guide you through each stage" but doesn't say how
- No `QUICKSTART.md` or `FIRST-STEPS.md`
- No example walkthrough (e.g., "Here's how to build a simple todo app using this framework")
- The `idea.txt` file contains notes about the framework itself, not an actual business idea — confusing signal

### Gap 8: Missing Structural Components for a Complete Builder

To actually produce a complete repository, the framework is missing guidance on:

| Area | What's Missing |
|------|---------------|
| Database setup | No migration patterns, schema templates, or seeding instructions |
| Authentication | No auth flow diagrams, provider options (OAuth, email/password, SSO), session management templates |
| API patterns | No REST/GraphQL route structure conventions beyond the config table |
| Deployment | No CI/CD configuration, hosting environment setup, or staging/production pipeline docs |
| Environment config | No `.env` variable reference with descriptions |
| Project configuration | No ESLint, Prettier, or lint-staged config templates |

---

## What Would Need to Be Added Before This Works as a Builder

### Minimum Viable Additions (Priority Order)

1. **Bootstrap mechanism** — A script or documented process that initializes the framework in a new directory
2. **`QUICKSTART.md`** — "How to use this framework" with step-by-step first-time setup
3. **Filled example PRD** — One completed PRD so agents know what "done" looks like (not just template placeholders)
4. **Complete code template** — A runnable Next.js starter with package.json, auth scaffold, API route example, DB connection, and all required files present
5. **Token compiler** — Script that converts `design-system/tokens/*.md` into a usable CSS file with custom properties
6. **Stack selection questionnaire** — Interactive flow that asks user questions and picks the right template/stack from config-rules.md
7. **Workflow scripts** — Actual Claude Code Workflow scripts (not pseudo-code) for each stage transition
8. **Cross-reference links** — Every major file should link to the files it depends on

### Ideal Additions (Beyond MVP)

- Example project walkthrough (end-to-end, from idea.txt to deployed solution)
- `.env.example` with every variable documented
- CI/CD configuration templates (GitHub Actions)
- Database schema template library (Prisma, Drizzle, etc.)
- Auth pattern library (NextAuth, Clerk, Supabase, custom JWT)
- Deployment guide per hosting platform listed in config-rules.md

---

## Overall Assessment

| Dimension | Score | Notes |
|-----------|-------|-------|
| Documentation quality | 9/10 | Exceptional depth and specificity |
| Agent role design | 8/10 | Well-defined roles, clear handoff points |
| Workflow logic | 7/10 | Sound stage transitions, but pseudo-code not executable |
| Template completeness | 3/10 | Barely functional — mostly placeholders |
| Bootstrap / invocation | 2/10 | No way to invoke or initialize from a new directory |
| Design system usability | 4/10 | Good specs, no compiled output |
| Self-contained operation | 4/10 | Files don't reference each other; no orchestration entry point |
| **Overall readiness as a builder** | **4/10** | Strong theory, weak scaffolding |

The framework excels at **describing how to build** but lacks the machinery to **actually build**. It would work great if paired with an agent that has full Claude Code Workflow capabilities and human-guided execution through each stage — the documentation is rich enough for a skilled orchestrator to produce complete solutions. But as a standalone, copy-to-directory, invoke-and-go tool, it needs significant additions before it's usable.
