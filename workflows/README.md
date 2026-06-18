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
