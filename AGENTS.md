# Agent System

Multi-agent coordination for the idea-to-web-solution framework. Agents are Claude Code agents working in sequence and parallel, communicating through task states and artifacts.

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
- **Skill Reference**: `skills/general-best-practices.md`, `skills/coding-guidelines.md`
- **Trigger**: Receives user's idea/pain point from Main Orchestrator
- **Responsibilities**:
  - Ask clarifying questions to fill the PRD template (`PRD/templates/prd-template.md`)
  - Generate feature list prioritized by impact vs effort
  - Write user stories with acceptance criteria
  - Define in-scope and out-of-scope boundaries
  - Identify assumptions and risks
  - Produce the PRD document
- **Output**: `PRD/<project-name>/prd.md`

### Requirements Reviewer (1 agent)
- **Trigger**: New PRD from BA Agent
- **Responsibilities**:
  - Critically review every section of the PRD
  - Challenge vague requirements, missing edge cases, scope creep
  - Argue with BA Agent until both agree the spec is complete and unambiguous
  - Flag any requirements that conflict with accessibility or security guidelines
- **Communication**: Sends critique back to BA Agent; sends "agreed" to Main Orchestrator when resolved
- **Output**: `PRD/<project-name>/prd.md` (revised) + `PRD/<project-name>/reviewer-comments.md`

### Design Agents (2 agents, peer review each other)
- **Skill Reference**: `skills/accessibility-guidelines.md`, `skills/general-best-practices.md`
- **Trigger**: Approved PRD from Main Orchestrator
- **Responsibilities**:
  - Define design tokens (colors with branding input, typography, spacing)
  - Create user flows and wireframes for each feature
  - Document every interaction state (error, loading, success, empty, validation, edit, disabled, focus)
  - Ensure WCAG compliance (contrast ratios, keyboard nav, ARIA labels)
  - Verify designs are CSS-implementable only; SVGs over raster; proper layer naming
  - Peer review each other's work for consistency and completeness
- **Communication**: Reviewer sends feedback to creator; both must approve before output
- **Output**: `design-system/<project-name>/` with tokens, components, and states

### Code Agents (3 agents, parallel per feature branch)
- **Skill Reference**: `skills/coding-guidelines.md`, `skills/security-guidelines.md`
- **Trigger**: Approved design + requirements from Main Orchestrator
- **Responsibilities**:
  - Confirm tech stack choices with user (frontend framework, DB, hosting, APIs)
  - Spin up own feature branch
  - Implement assigned features following design and requirements exactly
  - Write unit tests alongside code
  - Follow all accessibility requirements from the design spec
  - Push when complete; mark task as `review`
- **Communication**: Notify Main Orchestrator when their features are ready for review
- **Output**: Feature branches with implemented code + unit tests

### Dev Reviewers (3 agents)
- **Skill Reference**: `skills/coding-guidelines.md`, `skills/security-guidelines.md`, `skills/accessibility-guidelines.md`
- **Trigger**: Code pushed by a Code Agent (task in `review` state)
- **Responsibilities**:
  - Review code for maintainability, patterns, and DRY principles
  - Check security compliance (auth, data validation, API safety)
  - Audit accessibility (ARIA, keyboard nav, contrast matches design)
  - Flag issues back to the originating Code Agent
  - Approve when code meets all criteria

### BA + Design Reviewers (via Playwright)
- **Trigger**: Code pushed by a Code Agent (task in `review` state)
- **Responsibilities**:
  - Run Playwright tests against the implemented feature
  - Compare actual output to design spec and requirements
  - Flag discrepancies back to the Code Agent

### QA Agent (1 agent)
- **Trigger**: Task in `ready for test` state (after review passes)
- **Skill Reference**: All skill files
- **Responsibilities**:
  - Review original requirements with BA Agent when questions arise
  - Write and execute full Playwright UI test suite
  - Pass → mark task `ready for deployment`
  - Fail → mark task back to `ready for dev` with tag and failure details in task comments
- **Output**: Test results + any bug tickets

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
1. **Task state changes** — The primary mechanism; each agent monitors their assigned tasks
2. **Artifact files** — PRDs, design specs, code diffs are written as files others read
3. **Comments/tickets** — Inline comments on task items for specific feedback
4. **Notifications** — When a stage completes, the Main Orchestrator notifies downstream agents

## Agent Launch Order

1. Main Orchestrator receives user input
2. → BA Agent generates PRD
3. → Requirements Reviewer critiques PRD
4. ← BA Agent revises (loop until agreed)
5. → Main Orchestrator creates design tasks
6. → Design Agents create designs in parallel, peer-review each other
7. → Main Orchestrator creates code tasks
8. → Code Agents build features in parallel (3 at a time)
9. → Dev Reviewers + BA/Design Reviewers review (parallel dimensions)
10. → QA Agent tests
11. → Done
