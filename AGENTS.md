# Agent System

Multi-agent coordination for the idea-to-web-solution framework. Agents are Claude Code agents working in sequence and parallel, communicating through task states and artifacts.

**See also:** [`FRAMEWORK-FLOW.md`](./FRAMEWORK-FLOW.md) for complete file dependency table; [`workflows/README.md`](./workflows/README.md) for orchestration patterns.

## Agent Roles

### Main Orchestrator (1 agent)
- **Trigger**: User provides an initial idea/pain point from `idea.txt`
- **Responsibilities**:
  - Break the idea into a structured task list
  - Assign work to specialized agents
  - Promote tasks through states: `pending → in-progress → review → QA → done`
  - Sync task state back to user (and Jira if configured)
  - Detect when stages are blocked and unblock them
  - Enforce that adversarial review happens at every gate
- **Communication**: Sends tasks, reviews outputs, notifies other agents

### BA Agent (1 agent)
- **Skill Reference**: [`skills/general-best-practices.md`](./skills/general-best-practices.md) (MoSCoW prioritization, "Artifacts Are Source of Truth"); [`skills/coding-guidelines.md`](./skills/coding-guidelines.md) (understand file structure for PRD §13 supporting docs)
- **Trigger**: User's idea/pain point from `idea.txt` → see CLAUDE.md; FRAMEWORK-FLOW.md row "PRD/templates/prd-template.md" | Upstream input: [`idea.txt`](./idea.txt)
- **Responsibilities**:
  - Ask clarifying questions to fill the PRD template (`PRD/templates/prd-template.md`) — every section maps to a design token or component downstream
  - Generate feature list prioritized using MoSCoW (per `skills/general-best-practices.md` §BA Agent) → outputs to PRD §3 Timing & Priority and §8 User Stories
  - Write user stories with acceptance criteria (traces to Playwright test mapping in `testing/playwright/README.md`)
  - Define in-scope and out-of-scope boundaries → feeds Design Agent scope for component selection (`design-system/components/README.md` index)
  - Identify assumptions and risks → flags to Requirements Reviewer (§12 Assumptions, §13 Review Log)
  - Produce the PRD document at `PRD/<project-name>/prd.md`
- **Output**: `PRD/<project-name>/prd.md` → consumes: [`idea.txt`](./idea.txt), user answers | produces: design triggers, QA criteria | see also FRAMEWORK-FLOW.md row "PRD/<project>/prd.md"

### Requirements Reviewer (1 agent)
- **Trigger**: New PRD from BA Agent at `PRD/<project-name>/prd.md` → see FRAMEWORK-FLOW.md row "PRD/<project>/prd.md" | Upstream input: PRD template sections (§8 user stories, §6 UX principles, §9 supporting docs)
- **Responsibilities**:
  - Critically review every section of the PRD — check each against [`skills/general-best-practices.md`](./skills/general-best-practices.md) "Never Do" rules; challenge vague requirements with measurable criteria per `general-best-practices.md` §BA Agent → Requirements Reviewer
  - Challenge vague requirements, missing edge cases, scope creep → check against PRD template section (§8 User Stories → acceptance criteria completeness; §6 UX Principles → CSS-implementable?)
  - Argue with BA Agent until both agree the spec is complete and unambiguous (loop per `workflows/README.md` Workflow 1 "Revise" phase)
  - Flag any requirements that conflict with accessibility guidelines (`[`skills/accessibility-guidelines.md`](./skills/accessibility-guidelines.md)` WCAG AA constraints on PRD §6 UX Principles) or security guidelines (`[`skills/security-guidelines.md`](./skills/security-guidelines.md)` — data access patterns in PRD §5 Target Users, §9 Supporting Documents)
- **Communication**: Sends critique back to BA Agent via `PRD/<project-name>/reviewer-comments.md`; sends "agreed" to Main Orchestrator when resolved → triggers `workflows/README.md` Workflow 1 Phase "Approve"
- **Output**: `PRD/<project-name>/prd.md` (revised, Section 13 review log updated) + `PRD/<project-name>/reviewer-comments.md`

### Design Agents (2 agents, peer review each other)
- **Skill Reference**: [`skills/accessibility-guidelines.md`](./skills/accessibility-guidelines.md) (WCAG AA contrast rules, required states table); [`skills/general-best-practices.md`](./skills/general-best-practices.md) §Design Agents ("Mobile-first responsive breakpoints: 375px, 768px, 1024px, 1440px")
- **Trigger**: Approved PRD from Main Orchestrator → see FRAMEWORK-FLOW.md row "PRD/<project>/prd.md" | Upstream inputs: PRD §6 UX Design Principles (→ typography/spacing scale), PRD §8 User Stories (→ component list via `design-system/components/README.md` index)
- **Responsibilities**:
  - Define design tokens (colors with branding input → [`design-system/tokens/color.md`](./design-system/tokens/color.md); typography → [`design-system/tokens/typography.md`](./design-system/tokens/typography.md); spacing → [`design-system/tokens/spacing.md`](./design-system/tokens/spacing.md)) per `tokens/README.md` rules (Major Third 1.250 ratio, 4px base unit)
  - Create user flows and wireframes for each feature — map each PRD §8 user story to a component from the index in `design-system/components/README.md`
  - Document every interaction state per [`design-system/states/`](./design-system/states/) docs: error (`error.md`), loading (`loading.md`), success (`success.md`), empty (`empty.md`), validation (`validation.md`), interaction (`interaction.md`)
  - Ensure WCAG compliance (contrast ratios from `accessibility-guidelines.md` §Color & Contrast rules; keyboard nav from §Keyboard Accessibility; ARIA labels from §Screen Reader Support) — also check `skills/ui-best-practices.md` for UI completeness
  - Verify designs are CSS-implementable only; SVGs over raster; proper layer naming (per `design-system/components/README.md` Component Rules §5)
  - Peer review each other's work for consistency and completeness → cross-check against: tokens README rules, component index (same variants across all components), state specs (same pattern for error/loading/success/empty in every component)
- **Communication**: Reviewer sends feedback to creator referencing specific token/component/state files; both must approve before output → triggers `workflows/README.md` Workflow 2 Phase "Compile"
- **Output**: [`design-system/<project-name>/`](./design-system/) with tokens (compiled CSS + spec files), components (per component specs), and states — feeds downstream: Code Agents, Playwright tests | see also FRAMEWORK-FLOW.md rows for each token/component/state file

### Code Agents (3 agents, parallel per feature branch)
- **Skill Reference**: [`skills/coding-guidelines.md`](./skills/coding-guidelines.md) (file organization, naming conventions); [`skills/security-guidelines.md`](./skills/security-guidelines.md) (auth, data validation, API security headers); see also `[`skills/security.md`](./skills/security.md)` (detailed security checklist with examples), `[`skills/code-quality.md`](./skills/code-quality.md)` (search before creating, atomic DB ops, timezone rules), `[`skills/feature-fidelity.md`](./skills/feature-fidelity.md)` (read design first, audit existing code, tie UI to persisted state), `[`skills/ui-best-practices.md`](./skills/ui-best-practices.md)` (UI completeness checklist)
- **Trigger**: Approved design + requirements from Main Orchestrator → see FRAMEWORK-FLOW.md row "code-builder/config-rules.md" | Upstream inputs: PRD §8 User Stories (assigned features), [`design-system/tokens/*.md`](./design-system/tokens/) (all token values), `design-system/components/` (component specs per feature), `design-system/states/` (state implementations per feature), [`code-builder/config-rules.md`](./code-builder/config-rules.md) (stack selection via §User Questions), [`code-builder/templates/README.md`](./code-builder/templates/README.md) (template choice)
- **Responsibilities**:
  - Confirm tech stack choices with user (frontend framework → `config-rules.md` §Frontend Framework table; DB → §Database; hosting → §Hosting Platform; APIs → §API Communication) — documented in PRD §3 Dependencies and tech constraints
  - Spin up own feature branch, scaffold from [`code-builder/templates/nextjs-starter/`](./code-builder/templates/nextjs-starter/) (or chosen template per `templates/README.md`) with filled token values from design tokens
  - Implement assigned features following design and requirements exactly → trace each PRD §8 user story to a component in `design-system/components/`; implement all states from `design-system/states/` for that feature; apply all skill files via Skill Invocation Rules table in CLAUDE.md
  - Write unit tests alongside code → test file organization per [`testing/playwright/README.md`](./testing/playwright/README.md) §Test File Organization; trace each test to PRD user story (#N)
  - Follow all accessibility requirements from the design spec → check against `accessibility-guidelines.md` required states table + contrast ratios on token values used
  - Push when complete; mark task as `review`
- **Communication**: Notify Main Orchestrator when their features are ready for review (triggers Dev Reviewers per agent launch order in §Agent Launch Order) → see `workflows/README.md` Workflow 3 Phase "Push & Notify"
- **Output**: Feature branches with implemented code + unit tests → feeds downstream: Dev Reviewers, Playwright tests | see FRAMEWORK-FLOW.md rows for `code-builder/config-rules.md`, each skill file, and testing README

### Dev Reviewers (3 agents)
- **Skill Reference**: [`skills/coding-guidelines.md`](./skills/coding-guidelines.md) §Code Review Checklist (maintainability); [`skills/security.md`](./skills/security.md) + [`skills/security-guidelines.md`](./skills/security-guidelines.md) (security compliance — Pre-Completion Security Review section); [`skills/accessibility-guidelines.md`](./skills/accessibility-guidelines.md) §Testing Requirements (ARIA, keyboard nav, contrast); see also [`skills/code-quality.md`](./skills/code-quality.md) (duplication search), [`skills/feature-fidelity.md`](./skills/feature-fidelity.md) §Design Diff Check
- **Trigger**: Code pushed by a Code Agent (task in `review` state) → see FRAMEWORK-FLOW.md row "skills/coding-guidelines.md" + all skill files | Upstream inputs: feature branch code, design spec (`design-system/components/<feature>.md`), state specs (`design-system/states/`), PRD acceptance criteria (§8 User Stories)
- **Responsibilities**:
  - Review code for maintainability, patterns, and DRY principles → check against `coding-guidelines.md` §Code Review Checklist; verify `code-quality.md` §1 "Search Before Creating" found existing utilities; check feature-fidelity §After Implementation regression checks (does every existing element still render?)
  - Check security compliance (auth, data validation, API safety) → run `security.md` Pre-Completion Security Review checklist (all 10 items); cross-check `security-guidelines.md` headers + secrets management section against code; verify RBAC per PRD §5 Target Users (who is allowed to call this?)
  - Audit accessibility (ARIA, keyboard nav, contrast matches design) → verify all components have all states from `design-system/states/interaction.md` required states table; check token contrast values against `accessibility-guidelines.md` §Color & Contrast; confirm `ui-best-practices.md` Pre-Completion Mental Walkthrough passes
  - Flag issues back to the originating Code Agent referencing specific file + rule (e.g., "button.tsx missing `loading` state from `design-system/states/loading.md`; security.md §3: schema validation missing on /api/endpoint")
  - Approve when code meets all criteria → confirm against CLAUDE.md Skill Invocation Rules table for this feature type
- **Communication**: Consolidated review results to Main Orchestrator via task comments referencing specific files and rules; "all clear" → promotes task to `qa-ready` | see also `workflows/README.md` Workflow 4 Phase "Consolidate Issues"

### BA + Design Reviewers (via Playwright)
- **Trigger**: Code pushed by a Code Agent (task in `review` state) → same trigger as Dev Reviewers (parallel dimension per `workflows/README.md` Workflow 4 Phase "Review via Playwright") | Upstream inputs: deployed feature URL, PRD §8 User Stories (test mapping), design specs (`design-system/components/<feature>.md` + `states/` docs)
- **Responsibilities**:
  - Run Playwright tests against the implemented feature → test organization per [`testing/playwright/README.md`](./testing/playwright/README.md) §Test File Organization; write tests for each PRD user story (#N); add state tests for every `design-system/states/<state>.md` applicable to the feature
  - Compare actual output to design spec and requirements → use `feature-fidelity.md` §Design Diff Check method; check token values used in code against `design-system/tokens/*.md`; verify component props/API match `design-system/components/<component>.md` spec
  - Flag discrepancies back to the Code Agent referencing: PRD section, design file, state doc, and test file that proved the discrepancy

### QA Agent (1 agent)
- **Trigger**: Task in `ready for test` state (after review passes) → see FRAMEWORK-FLOW.md row "testing/playwright/README.md" | Upstream inputs: approved code on feature branch, PRD §8 User Stories + acceptance criteria (test source of truth), design specs (`design-system/components/<feature>.md` + all applicable `states/<state>.md`), accessibility guidelines (§Testing Requirements)
- **Skill Reference**: All skill files — [`skills/accessibility-guidelines.md`](./skills/accessibility-guidelines.md) (WCAG AA testing requirements); [`skills/security-guidelines.md`](./skills/security-guidelines.md) (security headers check); [`skills/ui-best-practices.md`](./skills/ui-best-practices.md) (UI completeness on deployed feature); see also `testing/playwright/README.md` §QA Agent Test Execution Rules
- **Responsibilities**:
  - Review original requirements with BA Agent when questions arise → trace each test to a specific PRD user story (#N, section §8); if PRD is ambiguous, create a documented assumption per `general-best-practices.md` §BA Agent rule #2 (ask twice, then document)
  - Write and execute full Playwright UI test suite → follow `testing/playwright/README.md` requirements: one happy-path test per user story; at least one error path per form/API; edge case tests covering `states/` docs (error, loading, success, empty, validation); keyboard nav tests from `accessibility-guidelines.md` §Testing Requirements
  - Pass → mark task `ready for deployment` → notify user and Main Orchestrator
  - Fail → mark task back to `ready for dev` with tag and failure details in task comments → each failure must reference the specific requirement it validates (PRD section + acceptance criteria) and the design file it contradicts | see also `testing/playwright/README.md` §QA Agent Test Execution Rules
- **Output**: Test results + any bug tickets → feeds back to Code Agents; test suite becomes permanent artifact in `testing/playwright/features/<feature>/` | see FRAMEWORK-FLOW.md row "testing/playwright/README.md"

## Task States & Promotions

```
pending → in-progress → review → qa-ready → done
                    ↘ failed-review → ready-for-dev → (re-enter review)
                                         ↘ failed-qa → ready-for-dev-failed
```

| State | Meaning | Who Acts Next |
|-------|---------|---------------|
| `pending` | Awaiting work | Main Orchestrator assigns |
| `in-progress` | Actively being worked on | Worker agent completes |
| `review` | Code/design ready for review | Dev reviewers + BA/Design reviewers |
| `ready for dev` (revised) | Review found issues | Fix in original stage |
| `ready for dev-failed` | QA failed, high-severity | Fix with failure tag |
| `qa-ready` | Passed review, testing ready | QA Agent tests |
| `ready for deployment` | Tests pass | Deploy to staging/prod |

## Communication Protocol

Agents communicate through:
1. **Task state changes** — The primary mechanism; each agent monitors their assigned tasks. State transitions follow the machine defined in §Task States & Promotions below and `workflows/README.md` phase structure.
2. **Artifact files** — PRDs, design specs, code diffs are written as files others read. See CLAUDE.md; FRAMEWORK-FLOW.md (§"Framework Flow Map — Cross-Reference Index") for complete artifact chain: every file's outputs column shows which downstream files consume it.
3. **Comments/tickets** — Inline comments on task items for specific feedback. Each comment must reference the rule or requirement being checked (e.g., "security.md §2: IDOR — query missing ownerId scope" or "feature-fidelity.md §Before Writing Code: design not read before coding").
4. **Notifications** — When a stage completes, the Main Orchestrator notifies downstream agents → follow `workflows/README.md` Phase structure for notification triggers (e.g., Workflow 1 Phase "Approve" → notify Design Agents; Workflow 2 Phase "Compile" → notify Code Agents).

## Agent Launch Order

Follows `workflows/README.md` Workflow sequences. Each step references the CLAUDE.md; FRAMEWORK-FLOW.md row for artifact dependencies.

| Step | Action | Upstream input (from `FRAMEWORK-FLOW.md`) | Orchestrates (next agent) |
|------|--------|-------------------------------|--------------------------|
| 1 | Main Orchestrator receives user input | `idea.txt` (§Idea-to-Web-Solution Framework doc) | BA Agent |
| 2 | → BA Agent generates PRD | `idea.txt` + user answers → PRD template (`PRD/templates/prd-template.md`) | Requirements Reviewer |
| 3 | → Requirements Reviewer critiques PRD | Approved PRD at `PRD/<project>/prd.md` | BA Agent (revisions) |
| 4 | ← BA Agent revises (loop per `workflows/README.md` Workflow 1 Phase "Revise") | Reviewer comments from `PRD/<project>/reviewer-comments.md` + §13 review log | Main Orchestrator (when agreed) |
| 5 | → Main Orchestrator creates design tasks | Approved PRD (§6 UX Principles → tokens; §8 User Stories → components) | Design Agents |
| 6 | → Design Agents create designs in parallel, peer-review each other | `design-system/tokens/README.md` + all token/component/state files from FRAMEWORK-FLOW.md | Main Orchestrator (when approved) |
| 7 | → Main Orchestrator creates code tasks | Approved design system (`design-system/<project>/`); stack choice from `code-builder/config-rules.md` | Code Agents |
| 8 | → Code Agents build features in parallel (3 at a time) | All skill files via Skill Invocation Rules table; template from `code-builder/templates/nextjs-starter/` | Dev Reviewers + BA/Design reviewers (parallel, step 9) |
| 9 | → Dev Reviewers + BA/Design reviewers review (parallel dimensions per `workflows/README.md` Workflow 4) | Feature branch code; design specs (`design-system/components/<feature>.md`); state specs; PRD acceptance criteria (§8) | QA Agent (when all pass) |
| 10 | → QA Agent tests | PRD (§8 user stories + §13 reviewer comments as test source); `testing/playwright/README.md` patterns | Deployment |
| 11 | → Done | All artifacts documented per CLAUDE.md; FRAMEWORK-FLOW.md "Outputs" column for each file touched | — |
