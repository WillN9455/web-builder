# Workflows

Orchestration scripts that manage the flow of work through the framework's stages. These are Claude Code workflow patterns (not executable binaries) that define how agents coordinate across phases.

## Workflow Patterns

Each workflow below is a reusable pattern for the Main Orchestrator to follow. Implement them using Claude Code's `Workflow` tool with the phase structure defined here.

### Workflow 1: Idea → PRD

```
Trigger: User provides an idea/pain point

Phase "Gather"        — Ask user clarifying questions, fill missing PRD sections
Phase "Write PRD"     — BA Agent drafts PRD from collected info
Phase "Critique"      — Requirements Reviewer adversarially reviews PRD
Phase "Revise"        — BA Agent revises based on critique (loop until agreed)
Phase "Approve"       — Both agents agree → PRD is final → notify user
```

**Script pattern:**

```ts
export const meta = {
  name: 'idea-to-prd',
  description: 'Transform an idea into an approved PRD',
  phases: [
    { title: 'Gather' },
    { title: 'Write & Review' },
    { title: 'Revise' },
    { title: 'Approve' },
  ],
};

// Phase: Gather — ask user questions
const idea = await agent('Collect the user\'s idea, pain points, and requirements...', { phase: 'Gather' });
const clarified = parallel([
  () => agent(`Ask clarifying questions about ${idea.painPoint}...`, { phase: 'Gather' }),
  () => agent(`Ask clarifying questions about ${idea.targetUsers}...`, { phase: 'Gather' }),
]);

// Phase: Write PRD
const prd = await agent('Draft the PRD using template from PRD/templates/prd-template.md...', { phase: 'Write PRD', schema: PRD_SCHEMA });

// Phase: Critique
const critique = await agent(`Critically review this PRD. Find gaps, ambiguities, scope creep.`, { phase: 'Critique' });

// Phase: Revise (loop until resolved)
let revisedPrd = prd;
while (critique.openItems.length > 0) {
  revisedPrd = await agent(`Revise PRD to address these critiques: ${critique.items.join(', ')}`, { phase: 'Revise' });
  critique = await agent(`Review the revised PRD. Are there remaining issues?`, { phase: 'Critique' });
}

// Phase: Approve
await agent('Write approved PRD to PRD/<project-name>/prd.md and notify user.', { phase: 'Approve' });
```

### Workflow 2: PRD → Design System

```
Trigger: Approved PRD received

Phase "Define Tokens"   — Create/compile color, typography, spacing tokens
Phase "Create Designs"  — Design Agent A creates wireframes + component specs
Phase "Peer Review"     — Design Agent B reviews Agent A's designs
Phase "Revise"          — Agent A revises (loop until both approve)
Phase "Compile"         — Compile tokens.css, generate component manifest
```

### Workflow 3: Design → Code

```
Trigger: Approved design system received

Phase "Confirm Stack"   — Ask user tech stack questions (config-rules.md)
Phase "Scaffold"        — Copy chosen template, replace project tokens
Phase "Build Features"  — 3 Code Agents build in parallel (one per feature group)
Phase "Unit Tests"      — Each agent writes unit tests alongside code
Phase "Push & Notify"   — Push each branch, notify reviewers
```

### Workflow 4: Code Review

```
Trigger: Code pushed for a feature

Phase "Review Maintainability"  — Dev Reviewer A checks patterns, DRY, architecture
Phase "Review Security"         — Dev Reviewer B checks auth, data validation, API safety
Phase "Review Accessibility"    — Dev Reviewer C checks WCAG compliance, ARIA, keyboard nav
Phase "Review via Playwright"   — BA + Design agents run UI tests against deployed feature
Phase "Consolidate Issues"      — Merge all findings; send back if issues found, approve if clean
```

### Workflow 5: QA Testing

```
Trigger: Feature passes code review

Phase "Clarify Requirements"    — QA Agent reviews PRD with BA Agent (ask questions)
Phase "Write Test Suite"        — Generate full Playwright test suite for the feature
Phase "Execute Tests"           — Run all tests; collect pass/fail results
Phase "Assess Results"          — Pass: move to deployment | Fail: send back to dev with failure details
```

## Workflow Execution Notes

- **Each workflow phase is a Claude Code `phase()` call** within a single Workflow script
- **Agents within a phase can run in parallel** if they don't depend on each other's output
- **Barriers are required between phases** — wait for all agents in a phase before starting the next
- **Loops within phases** — use while loops with dry-counters (e.g., 2 consecutive "no issues" = done)
- **User approval required** before moving between major stages (PRD → Design → Code → Review → QA → Deploy)

## File Dependency Map for Workflows

Each workflow reads from upstream artifacts and produces outputs consumed by downstream workflows. The [`FRAMEWORK-FLOW.md`](../FRAMEWORK-FLOW.md) file has the complete dependency table; this section maps specifically to workflow orchestration.

### Workflow 1 (Idea → PRD)
| Phase | Reads from | Writes to | Triggers |
|-------|-----------|----------|---------|
| Gather | `idea.txt` (§Overall + pain points) | Clarified user input (internal) | — |
| Write PRD | Clarified input + `PRD/templates/prd-template.md` (Section 1, §3-§8, §9, §12) | Draft `PRD/<project>/prd.md` | Requirements Reviewer |
| Critique | Draft PRD; `general-best-practices.md` (§BA Agent → Requirements Reviewer rules); `accessibility-guidelines.md` (WCAG constraint check on UX Principles) | Reviewer comments in `PRD/<project>/reviewer-comments.md` + §13 Review Log | BA Agent (Revise phase) |
| Revise | Reviewer comments; PRD template sections with gaps | Revised `PRD/<project>/prd.md` (sections updated) | Approve phase loop condition checked |
| Approve | Approved PRD; reviewer resolves all §13 items | Final `PRD/<project>/prd.md` | **Workflow 2** — Design Agents receive approved PRD |

### Workflow 2 (PRD → Design System)
| Phase | Reads from | Writes to | Triggers |
|-------|-----------|----------|---------|
| Define Tokens | Approved PRD §6 UX Principles; brand colors from `idea.txt` / user input; WCAG constraints from `accessibility-guidelines.md` §Color & Contrast | `design-system/<project>/tokens/color.md`, `typography.md`, `spacing.md` per token README rules | Component specs |
| Create Designs | Token definitions; PRD §8 User Stories → component selection from `components/README.md` index | `design-system/<project>/components/button.md`, `card.md`, `form-input.md`, `navigation.md` | Peer review by Design Agent B |
| Peer Review | Designer A's outputs vs. token README rules + each component spec file structure rules (§props API, variants table, states table, accessibility notes, CSS implementation notes) | Review comments per component/state file | Designer A revisions (loop until agreed) |
| Revise | Reviewer feedback; design specs | Revised component/state files | Compile phase |
| Compile | All approved tokens + components + states | `tokens.css` (compiled custom properties); manifest.json | **Workflow 3** — Code Agents receive approved design system |

### Workflow 3 (Design → Code)
| Phase | Reads from | Writes to | Triggers |
|-------|-----------|----------|---------|
| Confirm Stack | PRD §3 Dependencies + user answers; `config-rules.md` §User Questions #1-#5 | Stack selection output (frontend, DB, hosting, API) | Template selection |
| Scaffold | Stack choice from config-rules; `templates/nextjs-starter/` (or chosen template per `templates/README.md`); design token files | Scaffolded project with filled token values in CSS/TS files | Feature assignment |
| Build Features | Approved PRD §8 User Stories (assigned features); component specs (`components/<feature>.md`); state specs (`states/*.md`); all skill files via Skill Invocation Rules table | Feature branch code implementing all states, following all rules | Unit tests |
| Unit Tests | Feature spec; `testing/playwright/README.md` §Required Test Coverage; PRD acceptance criteria per user story (#N) | Unit + integration test files in feature's test directory | Push & Notify |
| Push & Notify | Feature branch code + tests | Pushed feature branch | **Workflow 4** — Dev Reviewers begin review |

### Workflow 4 (Code Review)
| Phase | Reads from | Writes to | Triggers |
|-------|-----------|----------|---------|
| Review Maintainability | Code; `coding-guidelines.md` §Code Review Checklist; `code-quality.md` §1 Search Before Creating; `feature-fidelity.md` §After Implementation regression checks | Review comments per file: "X violates Y rule" | Dev Reviewer B (security) + C (a11y) in parallel |
| Review Security | Code; `security.md` Pre-Completion Security Review checklist (§all 10 items); `security-guidelines.md` headers/secrets management section; PRD §5 Target Users (who has access?) | Security audit report: each checklist item passed/failed with file reference | Dev Reviewer C + BA/Design agents |
| Review Accessibility | Code; `accessibility-guidelines.md` §Testing Requirements (keyboard, contrast, screen reader); each component's accessibility section in `components/*.md`; state required states tables per `interaction.md` | Accessibility audit report: each rule passed/failed with file reference | BA/Design Playwright review in parallel |
| Review via Playwright | Code; PRD §8 User Stories (acceptance criteria to verify); design specs (`components/<feature>.md` + all applicable `states/*.md`); test tracing rules from `playwright/README.md` §Tracing test coverage table | Playwright results: pass/fail per user story per state doc | Consolidate issues |
| Consolidate Issues | All three review dimensions' results | Consolidated review output → approve or send back to dev | **Workflow 5** (QA) if all pass; Code Agent (fix) if any fail |

### Workflow 5 (QA Testing)
| Phase | Reads from | Writes to | Triggers |
|-------|-----------|----------|---------|
| Clarify Requirements | PRD §8 User Stories + §13 reviewer comments; BA Agent for ambiguities per `general-best-practices.md` §BA Agent rule #2 (ask twice, then document) | Clarified requirements list | Test suite generation |
| Write Test Suite | Clarified requirements; PRD §8 acceptance criteria per user story (#N); component specs; state docs (all 6 states' Testing Requirements lists); `accessibility-guidelines.md` §Testing Requirements | Playwright test files in `testing/playwright/features/<feature>/` | Test execution |
| Execute Tests | Written tests; deployed/staged feature URL | Test results per feature: pass/fail per user story per state | Assess results |
| Assess Results | Test results per PRD requirement traceability; `playwright/README.md` §QA Agent Test Execution Rules #3-#5 | Final verdict: deploy or send back to dev with failure details | Deployment (if all pass) |

## Related Files

| File | Relationship |
|------|-------------|
| [`../AGENTS.md`](../AGENTS.md) §Agent Launch Order + §Communication Protocol | Defines which agent triggers at each workflow phase boundary; agents follow the launch order in AGENTS.md, workflows define what happens inside each phase |
| [`FRAMEWORK-FLOW.md`](../FRAMEWORK-FLOW.md) | Each workflow's "reads from / writes to" columns reference files in that table |
