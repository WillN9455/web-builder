# Agent System

Multi-agent coordination for the idea-to-web-solution framework. Agents are Claude Code agents working in sequence and parallel, communicating through task states and artifacts.

**See also:** [`FRAMEWORK-FLOW.md`](./FRAMEWORK-FLOW.md) for complete file dependency table; [`workflows/README.md`](./workflows/README.md) for orchestration patterns.

## Agent Roles

### Main Orchestrator (1 agent)
- **Trigger**: User provides an initial idea/pain point from `idea.md`
- **Responsibilities**:
  - Break the idea into a structured task list
  - Assign work to specialized agents
  - Promote tasks through states: `pending → in-progress → review → QA → done`
  - Sync task state back to user (and Jira if configured)
  - Detect when stages are blocked and unblock them
  - Enforce that adversarial review happens at every gate
- **Communication**: Sends tasks, reviews outputs, notifies other agents

### BA Agent (1 agent)
- **Skill Reference**: [`framework/shared/skills/general-best-practices.md`](./framework/shared/skills/general-best-practices.md) (MoSCoW prioritization, "Artifacts Are Source of Truth"); [`framework/build/skills/coding-guidelines.md`](./framework/build/skills/coding-guidelines.md) (understand file structure for PRD §13 supporting docs)
- **Trigger**: User's idea/pain point from `idea.md` → see CLAUDE.md; FRAMEWORK-FLOW.md row "PRD/templates/prd-template.md" | Upstream input: [`idea.md`](./idea.md), `idea-intake/` chat transcript
- **Communication**:
  - **Stage 0 (intake)** — driven by the chat UI in [`idea-intake/server.js`](./idea-intake/server.js). The BA Agent asks 1–3 progressive questions per turn (problem → users → features/scope → rules/data → compliance → brand → tech → timeline — see `idea-intake/README.md` for the full list and topic order). The user may answer, **skip**, or say "you fill it in" — all three are valid. On skip or "fill it in," the BA Agent documents the gap in `idea.md`'s Assumptions section and continues. Finalization writes `idea.md` in the project folder and pins `project-dir.txt` to it (see CLAUDE.md §Workspace Root).
  - **Stage 1 (PRD)** — once the intake is finished, the BA Agent reads `idea.md` and any answers the user gave in the intake chat, then drives a second, lighter pass of clarifying questions to fill the PRD template. These questions are surfaced in `PRD/<project>/open-questions.md` (see `PRD/templates/supporting/open-questions.md`) and PRD §11 is the executive checklist.
  - **Two-pass model** — the BA Agent does **not** require the user to have every detail. At every gate (intake → PRD draft → Reviewer pass → SA hand-off), the BA Agent may ask **a small set of blocking questions** (the minimum needed to keep going) and **a larger set of non-blocking questions** (things that would sharpen the spec but won't gate the next stage). Blocking questions get `blocker-for: PRD-approval` (or `tech`, `design`, etc.); non-blocking questions get `blocker-for: none` and are tracked in `open-questions.md` for the user to answer whenever they want. The BA Agent proceeds without waiting for non-blocking answers.
- **Responsibilities**:
  - **Drive the intake chat** in `idea-intake/server.js` per its SYSTEM_PROMPT (progressive 2–3 questions per turn; 8-topic order; explicit skip / "fill it in" handling that lands gaps in `idea.md`'s Assumptions section). Every chat answer, skip, or assumption is part of the audit trail — do not paraphrase away the user's words.
  - **Carry intake answers forward.** After `idea.md` is written, the BA Agent's Stage 1 pass must read it and treat each Assumptions-section entry as an open question to either resolve (ask the user during PRD review), document more fully in `assumptions.md`, or carry into `open-questions.md` with `blocker-for: PRD-approval` if the BA Agent genuinely cannot proceed without it.
  - Ask clarifying questions to fill the PRD template (`PRD/templates/prd-template.md`) — every section maps to a design token or component downstream. Default to **non-blocking** questions; only escalate to `blocker-for: PRD-approval` when the BA Agent cannot write a defensible section without the answer.
  - **After producing the PRD draft, surface a new list of non-blocking open questions** at `PRD/<project>/open-questions.md` (status: Open, `blocker-for: none`). These questions sharpen the spec but the BA Agent does not wait for them before handing off to the Requirements Reviewer. They inform future iterations of design, code, and QA — not gate them.
  - Generate feature list prioritized using MoSCoW (per `framework/shared/skills/general-best-practices.md` §BA Agent) → outputs to PRD §3 Timing & Priority and §8 User Stories
  - Write user stories with acceptance criteria (traces to Playwright test mapping in `framework/qa/skills/testing-guidelines.md`)
  - Define in-scope and out-of-scope boundaries → feeds Design Agent scope for component selection (`design-system/components/README.md` index)
  - Identify assumptions and risks → flags to Requirements Reviewer (§12 Assumptions, §13 Review Log)
  - Produce the traffic & access-pattern profile at `PRD/<project>/traffic-profile.md` (the load distribution — peak:average, read:write, hot endpoints, geo — the Solution Architect sizes for; without it the SA hits averages and fails peaks)
  - Produce the business-rules register at `PRD/<project>/business-rules.md` (the non-story decisions the code must enforce — refund ladders, cut-offs, status transitions, eligibility — as decision tables, not prose; the SA designs state machines from this)
  - Produce the RBAC & permissions matrix at `PRD/<project>/rbac-matrix.md` (role × permission table, default-deny, with every "own"/"group" cell flagged as an IDOR boundary; consolidates `data-model.md` CRUD column into one matrix the SA designs auth from and the Code Agents implement as route guards)
  - Produce the run-rate cost model at `PRD/<project>/cost-model.md` (break the §3 budget cap into infra vs storage vs egress vs per-transaction fees; a product can be under budget on infra and still lose money per booking — model both so the SA's vendor choices don't break the budget)
  - Produce the PII data-flow map at `PRD/<project>/data-flow.md` (where PII moves and every trust boundary it crosses — client → app → DB → third parties — field-level, with PCI scope and residency per flow; `data-model.md` is PII at rest, this is PII in motion)
  - Stitch the user stories into 2–5 end-to-end journeys in PRD §6b (the lifecycle narrative — core loop + highest-stakes alternate paths — naming the stories, states, integrations, and business rules each journey touches; the Design Agents expand these into flows and the SA sizes state machines from them)
  - Produce the PRD document at `PRD/<project-name>/prd.md`
- **Output**: `PRD/<project-name>/prd.md` → consumes: [`idea.md`](./idea.md), `idea-intake/` chat transcript, user answers during PRD review | produces: design triggers, QA criteria, `PRD/<project>/open-questions.md` (Open, `blocker-for: none`) | see also FRAMEWORK-FLOW.md row "PRD/<project>/prd.md"

### Requirements Reviewer (1 agent)
- **Trigger**: New PRD from BA Agent at `PRD/<project-name>/prd.md` → see FRAMEWORK-FLOW.md row "PRD/<project>/prd.md" | Upstream input: PRD template sections (§8 user stories, §6 UX principles, §9 supporting docs)
- **Responsibilities**:
  - Critically review every section of the PRD — check each against [`framework/shared/skills/general-best-practices.md`](./framework/shared/skills/general-best-practices.md) "Never Do" rules; challenge vague requirements with measurable criteria per `general-best-practices.md` §BA Agent → Requirements Reviewer
  - Challenge vague requirements, missing edge cases, scope creep → check against PRD template section (§8 User Stories → acceptance criteria completeness; §6 UX Principles → CSS-implementable?)
  - Argue with BA Agent until both agree the spec is complete and unambiguous (loop per `workflows/README.md` Workflow 1 "Revise" phase)
  - Flag any requirements that conflict with accessibility guidelines (`[`framework/design/skills/accessibility-guidelines.md`](./framework/design/skills/accessibility-guidelines.md)` WCAG AA constraints on PRD §6 UX Principles) or security guidelines (`[`framework/shared/skills/security.md`](./framework/shared/skills/security.md)` — data access patterns in PRD §5 Target Users, §9 Supporting Documents)
- **Communication**: Sends critique back to BA Agent via `PRD/<project-name>/reviewer-comments.md`; sends "agreed" to Main Orchestrator when resolved → triggers `workflows/README.md` Workflow 1 Phase "Approve"
- **Output**: `PRD/<project-name>/prd.md` (revised, Section 13 review log updated) + `PRD/<project-name>/reviewer-comments.md`

### Solution Architect (1 agent, runs once per project)
- **Skill Reference**: [`framework/shared/skills/general-best-practices.md`](./framework/shared/skills/general-best-practices.md) (decision audit trail); [`framework/build/skills/coding-guidelines.md`](./framework/build/skills/coding-guidelines.md) (file structure for tech-decision-brief output); [`framework/shared/skills/security.md`](./framework/shared/skills/security.md) (must-use/must-avoid feasibility check); [`framework/design/skills/accessibility-guidelines.md`](./framework/design/skills/accessibility-guidelines.md) (NFR feasibility check)
- **Trigger**: PRD approved by Requirements Reviewer → see FRAMEWORK-FLOW.md row "PRD/<project>/tech-decision-brief.md" | Upstream inputs: `PRD/<project>/prd.md` (all sections), `PRD/<project>/nfr-catalog.md`, `PRD/<project>/traffic-profile.md`, `PRD/<project>/cost-model.md`, `PRD/<project>/business-rules.md`, `PRD/<project>/rbac-matrix.md`, `PRD/<project>/data-model.md`, `PRD/<project>/data-flow.md`, `PRD/<project>/open-questions.md` (filtered by `blocker-for: tech`), `PRD/<project>/assumptions.md`, `PRD/<project>/risks.md`, `framework/build/config/config-rules.md` (decision tree + 5 user questions)
- **Responsibilities**:
  - Read the BA's half of `PRD/<project>/tech-decision-brief.md` (Part 1: hard constraints, stack-selection questionnaire, integrations, data sensitivity, compliance, NFRs, blocking open questions, phasing window)
  - Translate requirements into a stack decision: framework, language, DB, hosting, auth, background jobs, observability, CI/CD — one row per choice with rationale, trade-offs accepted, and rejected alternatives
  - Verify every choice in §3b hard constraints is respected; flag any conflict to the Orchestrator (cannot override without user re-approval)
  - Verify every choice can hit the NFRs in `nfr-catalog.md` (especially SEC-*, P-*, AV-*, S-*); if a choice cannot, surface the trade-off and ask the BA/Orchestrator to relax the NFR or pick a different stack
  - Reconcile every choice in §2.1 against `cost-model.md` — infra, egress, and per-transaction fees (Stripe %, Postmark/email, Daily.co/min) must keep headroom ≥ 0 against the PRD §3 budget cap; if a choice breaks the model, pick a cheaper option and re-run it, or escalate to raise the cap (user re-approval). Do not sign §2.8 with a broken cost model
  - Produce an architecture diagram (Mermaid + plain-text fallback) and a high-level schema sketch in Part 2 of the tech-decision-brief — the diagram must reflect the trust boundaries, PCI-scope line, and residency zones from `data-flow.md` (§1.14)
  - Add any architecture-level risks to `PRD/<project>/risks.md` (prefixed `SA-R-NNN` so they are distinguishable from BA risks)
  - Send any newly-raised open questions back to the BA via `PRD/<project>/open-questions.md` (with `blocker-for: tech`)
- **Communication**: Writes Part 2 of `PRD/<project>/tech-decision-brief.md`; obtains BA acknowledgement and Orchestrator sign-off in §2.8 before any Code Agent starts; sign-off is the **gate** that unblocks the Orchestrator's step 7 (creating code tasks)
- **Output**: `PRD/<project>/tech-decision-brief.md` (Part 2 complete, §2.8 signed) → drives `framework/build/config/config-rules.md` template selection, `framework/templates/<chosen-stack>/` choice, and Code Agents' feature briefs; see FRAMEWORK-FLOW.md row "PRD/<project>/tech-decision-brief.md"
- **Cadence**: Once per project, upfront. Re-runs only when scope changes invalidate the stack (e.g., new compliance regime in Phase 2) — in that case the SA appends a new Part 2 section rather than rewriting history, preserving the audit trail

### Design Agents (2 agents, peer review each other)
- **Skill Reference**: [`framework/design/skills/accessibility-guidelines.md`](./framework/design/skills/accessibility-guidelines.md) (WCAG AA contrast rules, required states table); [`framework/shared/skills/general-best-practices.md`](./framework/shared/skills/general-best-practices.md) §Design Agents ("Mobile-first responsive breakpoints: 375px, 768px, 1024px, 1440px")
- **Trigger**: Approved PRD from Main Orchestrator → see FRAMEWORK-FLOW.md row "PRD/<project>/prd.md" | Upstream inputs: PRD §6 UX Design Principles (→ typography/spacing scale), PRD §6b Key User Journeys (→ end-to-end flows/wireframes — each journey expanded into screens), PRD §8 User Stories (→ component list via `design-system/components/README.md` index)
- **Responsibilities**:
  - Define design tokens (colors with branding input → [`design-system/tokens/color.md`](./design-system/tokens/color.md); typography → [`design-system/tokens/typography.md`](./design-system/tokens/typography.md); spacing → [`design-system/tokens/spacing.md`](./design-system/tokens/spacing.md)) per `tokens/README.md` rules (Major Third 1.250 ratio, 4px base unit)
  - Create user flows and wireframes for each feature — map each PRD §8 user story to a component from the index in `design-system/components/README.md`
  - Document every interaction state per [`design-system/states/`](./design-system/states/) docs: error (`error.md`), loading (`loading.md`), success (`success.md`), empty (`empty.md`), validation (`validation.md`), interaction (`interaction.md`), consent (`consent.md` — when PRD §6c lists a consent surface), forbidden (`forbidden.md` — for every route/action in PRD §9c `rbac-matrix.md`)
  - Ensure WCAG compliance (contrast ratios from `accessibility-guidelines.md` §Color & Contrast rules; keyboard nav from §Keyboard Accessibility; ARIA labels from §Screen Reader Support) — also check `framework/design/skills/ui-best-practices.md` for UI completeness
  - Verify designs are CSS-implementable only; SVGs over raster; proper layer naming (per `design-system/components/README.md` Component Rules §5)
  - Peer review each other's work for consistency and completeness → cross-check against: tokens README rules, component index (same variants across all components), state specs (same pattern for error/loading/success/empty in every component)
- **Communication**: Reviewer sends feedback to creator referencing specific token/component/state files; both must approve before output → triggers `workflows/README.md` Workflow 2 Phase "Compile"
- **Output**: [`design-system/<project-name>/`](./design-system/) with tokens (compiled CSS + spec files), components (per component specs), and states — feeds downstream: Code Agents, Playwright tests | see also FRAMEWORK-FLOW.md rows for each token/component/state file

### Code Agents (3 agents, parallel per feature branch)
- **Skill Reference**: [`framework/build/skills/coding-guidelines.md`](./framework/build/skills/coding-guidelines.md) (file organization, naming conventions); [`framework/shared/skills/security.md`](./framework/shared/skills/security.md) (auth, data validation, API security headers); see also `[`framework/shared/skills/security.md`](./framework/shared/skills/security.md)` (detailed security checklist with examples), `[`framework/build/skills/code-quality.md`](./framework/build/skills/code-quality.md)` (search before creating, atomic DB ops, timezone rules), `[`framework/build/skills/feature-fidelity.md`](./framework/build/skills/feature-fidelity.md)` (read design first, audit existing code, tie UI to persisted state), `[`framework/design/skills/ui-best-practices.md`](./framework/design/skills/ui-best-practices.md)` (UI completeness checklist)
- **Trigger**: Approved design + requirements from Main Orchestrator → see FRAMEWORK-FLOW.md row "framework/build/config/config-rules.md" | Upstream inputs: PRD §8 User Stories (assigned features), [`design-system/tokens/*.md`](./design-system/tokens/) (all token values), `design-system/components/` (component specs per feature), `design-system/states/` (state implementations per feature), [`framework/build/config/config-rules.md`](./framework/build/config/config-rules.md) (stack selection via §User Questions), [`framework/templates/docs/template-selection.md`](./framework/templates/docs/template-selection.md) (template choice), **and** SA-signed `PRD/<project>/tech-decision-brief.md` (the definitive stack and integration plan)
- **Responsibilities**:
  - Confirm tech stack choices with user (frontend framework → `config-rules.md` §Frontend Framework table; DB → §Database; hosting → §Hosting Platform; APIs → §API Communication) — documented in PRD §3 Dependencies and tech constraints
  - Spin up own feature branch, scaffold from [`framework/templates/nextjs-starter/`](./framework/templates/nextjs-starter/) (or chosen template per `templates/README.md`) with filled token values from design tokens
  - Implement assigned features following design and requirements exactly → trace each PRD §8 user story to a component in `design-system/components/`; implement all states from `design-system/states/` for that feature; apply all skill files via Skill Invocation Rules table in CLAUDE.md
  - Implement route guards from `PRD/<project>/rbac-matrix.md` — every handler maps to a matrix row; every "own"/"group" cell is a server-side scoped query (not a client trust), per `security.md` §IDOR
  - Write unit tests alongside code → test file organization per [`framework/qa/skills/testing-guidelines.md`](./framework/qa/skills/testing-guidelines.md) §Test File Organization; trace each test to PRD user story (#N)
  - Follow all accessibility requirements from the design spec → check against `accessibility-guidelines.md` required states table + contrast ratios on token values used
  - Push when complete; mark task as `review`
- **Communication**: Notify Main Orchestrator when their features are ready for review (triggers Dev Reviewers per agent launch order in §Agent Launch Order) → see `workflows/README.md` Workflow 3 Phase "Push & Notify"
- **Output**: Feature branches with implemented code + unit tests → feeds downstream: Dev Reviewers, Playwright tests | see FRAMEWORK-FLOW.md rows for `framework/build/config/config-rules.md`, each skill file, and testing README

### Dev Reviewers (3 agents)
- **Skill Reference**: [`framework/build/skills/coding-guidelines.md`](./framework/build/skills/coding-guidelines.md) §Code Review Checklist (maintainability); [`framework/shared/skills/security.md`](./framework/shared/skills/security.md) (the consolidated shared security rulebook — checklist + guidelines in one body) (security compliance — Pre-Completion Security Review section); [`framework/design/skills/accessibility-guidelines.md`](./framework/design/skills/accessibility-guidelines.md) §Testing Requirements (ARIA, keyboard nav, contrast); see also [`framework/build/skills/code-quality.md`](./framework/build/skills/code-quality.md) (duplication search), [`framework/build/skills/feature-fidelity.md`](./framework/build/skills/feature-fidelity.md) §Design Diff Check
- **Trigger**: Code pushed by a Code Agent (task in `review` state) → see FRAMEWORK-FLOW.md row "framework/build/skills/coding-guidelines.md" + all skill files | Upstream inputs: feature branch code, design spec (`design-system/components/<feature>.md`), state specs (`design-system/states/`), PRD acceptance criteria (§8 User Stories)
- **Responsibilities**:
  - Review code for maintainability, patterns, and DRY principles → check against `coding-guidelines.md` §Code Review Checklist; verify `code-quality.md` §1 "Search Before Creating" found existing utilities; check feature-fidelity §After Implementation regression checks (does every existing element still render?)
  - Check security compliance (auth, data validation, API safety) → run `security.md` Pre-Completion Security Review checklist (all 10 items); cross-check `security-guidelines.md` headers + secrets management section against code; verify RBAC per `PRD/<project>/rbac-matrix.md` (PRD §5 persona→role + §9c matrix) — every route must map to a matrix row and every "own"/"group" cell enforced as a server-side scoped query per `security.md` §IDOR
  - Audit accessibility (ARIA, keyboard nav, contrast matches design) → verify all components have all states from `design-system/states/interaction.md` required states table; check token contrast values against `accessibility-guidelines.md` §Color & Contrast; confirm `ui-best-practices.md` Pre-Completion Mental Walkthrough passes
  - Flag issues back to the originating Code Agent referencing specific file + rule (e.g., "button.tsx missing `loading` state from `design-system/states/loading.md`; security.md §3: schema validation missing on /api/endpoint")
  - Approve when code meets all criteria → confirm against CLAUDE.md Skill Invocation Rules table for this feature type
- **Communication**: Consolidated review results to Main Orchestrator via task comments referencing specific files and rules; "all clear" → promotes task to `qa-ready` | see also `workflows/README.md` Workflow 4 Phase "Consolidate Issues"

### BA + Design Reviewers (via Playwright)
- **Trigger**: Code pushed by a Code Agent (task in `review` state) → same trigger as Dev Reviewers (parallel dimension per `workflows/README.md` Workflow 4 Phase "Review via Playwright") | Upstream inputs: deployed feature URL, PRD §8 User Stories (test mapping), design specs (`design-system/components/<feature>.md` + `states/` docs)
- **Responsibilities**:
  - Run Playwright tests against the implemented feature → test organization per [`framework/qa/skills/testing-guidelines.md`](./framework/qa/skills/testing-guidelines.md) §Test File Organization; write tests for each PRD user story (#N); add state tests for every `design-system/states/<state>.md` applicable to the feature
  - Compare actual output to design spec and requirements → use `feature-fidelity.md` §Design Diff Check method; check token values used in code against `design-system/tokens/*.md`; verify component props/API match `design-system/components/<component>.md` spec
  - Flag discrepancies back to the Code Agent referencing: PRD section, design file, state doc, and test file that proved the discrepancy

### QA Agent (1 agent)
- **Trigger**: Task in `ready for test` state (after review passes) → see FRAMEWORK-FLOW.md row "framework/qa/skills/testing-guidelines.md" | Upstream inputs: approved code on feature branch, PRD §8 User Stories + acceptance criteria (test source of truth), design specs (`design-system/components/<feature>.md` + all applicable `states/<state>.md`), accessibility guidelines (§Testing Requirements)
- **Skill Reference**: All skill files — [`framework/design/skills/accessibility-guidelines.md`](./framework/design/skills/accessibility-guidelines.md) (WCAG AA testing requirements); [`framework/shared/skills/security.md`](./framework/shared/skills/security.md) (security headers check); [`framework/design/skills/ui-best-practices.md`](./framework/design/skills/ui-best-practices.md) (UI completeness on deployed feature); see also `framework/qa/skills/testing-guidelines.md` §QA Agent Test Execution Rules
- **Responsibilities**:
  - Review original requirements with BA Agent when questions arise → trace each test to a specific PRD user story (#N, section §8); if PRD is ambiguous, create a documented assumption per `general-best-practices.md` §BA Agent rule #2 (ask twice, then document)
  - Write and execute full Playwright UI test suite → follow `framework/qa/skills/testing-guidelines.md` requirements: one happy-path test per user story; at least one error path per form/API; edge case tests covering `states/` docs (error, loading, success, empty, validation); keyboard nav tests from `accessibility-guidelines.md` §Testing Requirements
  - Pass → mark task `ready for deployment` → notify user and Main Orchestrator
  - Fail → mark task back to `ready for dev` with tag and failure details in task comments → each failure must reference the specific requirement it validates (PRD section + acceptance criteria) and the design file it contradicts | see also `framework/qa/skills/testing-guidelines.md` §QA Agent Test Execution Rules
- **Output**: Test results + any bug tickets → feeds back to Code Agents; test suite becomes permanent artifact in `framework/qa/features/<feature>/` | see FRAMEWORK-FLOW.md row "framework/qa/skills/testing-guidelines.md"

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
2. **Artifact files** — PRDs, design specs, code diffs are written as files others read. Artifact paths are always resolved against the **workspace root** (CLAUDE.md §Workspace Root: `project-dir.txt` if present, else the current repository). See CLAUDE.md; FRAMEWORK-FLOW.md (§"Framework Flow Map — Cross-Reference Index") for the complete artifact chain: every file's outputs column shows which downstream files consume it.
3. **Comments/tickets** — Inline comments on task items for specific feedback. Each comment must reference the rule or requirement being checked (e.g., "security.md §2: IDOR — query missing ownerId scope" or "feature-fidelity.md §Before Writing Any Code: design not read before coding").
4. **Notifications** — When a stage completes, the Main Orchestrator notifies downstream agents → follow `workflows/README.md` Phase structure for notification triggers (e.g., Workflow 1 Phase "Approve" → notify Design Agents; Workflow 2 Phase "Compile" → notify Code Agents).

## Agent Launch Order

Follows `workflows/README.md` Workflow sequences. Each step references the CLAUDE.md; FRAMEWORK-FLOW.md row for artifact dependencies.

| Step | Action | Upstream input (from `FRAMEWORK-FLOW.md`) | Orchestrates (next agent) |
|------|--------|-------------------------------|--------------------------|
| 1 | Main Orchestrator receives user input | `idea.md` (§Idea-to-Web-Solution Framework doc) | BA Agent |
| 2 | → BA Agent generates PRD | `idea.md` + user answers → PRD template (`PRD/templates/prd-template.md`) | Requirements Reviewer |
| 3 | → Requirements Reviewer critiques PRD | Approved PRD at `PRD/<project>/prd.md` | BA Agent (revisions) |
| 4 | ← BA Agent revises (loop per `workflows/README.md` Workflow 1 Phase "Revise") | Reviewer comments from `PRD/<project>/reviewer-comments.md` + §13 review log | Main Orchestrator (when agreed) |
| 4.5 | → Solution Architect writes Part 2 of `tech-decision-brief.md` (runs **once per project** so the stack decision is project-wide) | Approved PRD + `nfr-catalog.md` + `data-model.md` + `open-questions.md` (filter `blocker-for: tech`) + `framework/build/config/config-rules.md` decision tree | Main Orchestrator (when §2.8 signed by SA + BA + Orchestrator) |
| 5 | → Main Orchestrator creates design tasks | Approved PRD (§6 UX Principles → tokens; §8 User Stories → components) **and** SA-signed `tech-decision-brief.md` (so Design Agents know the stack their designs must be implementable in) | Design Agents |
| 6 | → Design Agents create designs in parallel, peer-review each other | `design-system/tokens/README.md` + all token/component/state files from FRAMEWORK-FLOW.md | Main Orchestrator (when approved) |
| 7 | → Main Orchestrator creates code tasks | Approved design system (`design-system/<project>/`); stack choice from `framework/build/config/config-rules.md` | Code Agents |
| 8 | → Code Agents build features in parallel (3 at a time) | All skill files via Skill Invocation Rules table; template from `framework/templates/nextjs-starter/` | Dev Reviewers + BA/Design reviewers (parallel, step 9) |
| 9 | → Dev Reviewers + BA/Design reviewers review (parallel dimensions per `workflows/README.md` Workflow 4) | Feature branch code; design specs (`design-system/components/<feature>.md`); state specs; PRD acceptance criteria (§8) | QA Agent (when all pass) |
| 10 | → QA Agent tests | PRD (§8 user stories + §13 reviewer comments as test source); `framework/qa/skills/testing-guidelines.md` patterns | Deployment |
| 11 | → Done | All artifacts documented per CLAUDE.md; FRAMEWORK-FLOW.md "Outputs" column for each file touched | — |
