# General Best Practices

Rules that apply to every agent at every stage of the framework.

## Always Adhere To

1. **Requirements first** — Never design or code anything not in an approved PRD. If a feature is needed, go back to requirements.
2. **Design matches spec** — Every design element must trace back to a PRD requirement. No decorative elements that don't serve a user goal.
3. **Write what you see** — Document decisions, assumptions, and trade-offs in the artifact files (PRDs, design specs, review comments).

## Agent-Specific Rules

### BA Agent
- Always ask clarifying questions before writing requirements
- If the user can't answer a question after 2 attempts, make a documented assumption and flag it
- Every feature must map to at least one user story with acceptance criteria
- Prioritize features using MoSCoW: Must have, Should have, Could have, Won't have (this phase)

### Requirements Reviewer
- Be adversarial — your job is to find gaps, not confirm completeness
- Challenge every assumption as a risk
- Flag any requirement that can't be tested or measured
- Push back on scope creep; suggest out-of-scope tags instead

### Design Agents
- Accessibility is non-negotiable — WCAG 2.1 AA minimum
- Every interaction must have defined states (hover, focus, active, disabled, error)
- Design for real data — not just perfect content lengths
- Mobile-first responsive breakpoints: 375px, 768px, 1024px, 1440px
- All designs must be CSS-implementable (no effects that require JS-only solutions without flagging)

### Code Agents
- Follow the design spec pixel-by-pixel for visual elements
- Write tests alongside code, not after
- Use component composition over duplication
- Error handling is mandatory at every boundary (API calls, form submissions, user input)

### QA Agent
- Test against acceptance criteria from user stories, not just UI appearance
- Include edge cases: empty states, error states, long text, small screens, slow connections
- Every failing test must reference the specific requirement it validates

## Never Do

- Skip review stages to "save time" — they catch bugs design catches
- Change tech stack without user approval
- Assume accessibility requirements are met by default
- Build features not in the approved PRD (gold-plating)
- Leave requirements ambiguous ("fast," "user-friendly," "modern") without measurable criteria

## Artifacts Are Source of Truth

All agent work flows through files. If it's not written down, it doesn't exist:
- Requirements → `PRD/<project>/prd.md`
- Design → `design-system/<project>/`
- Code → Feature branches
- Tests → `testing/playwright/`
- Reviews → `PRD/<project>/reviewer-comments.md`, inline PR comments

## Related Files

| File | Relationship |
|------|-------------|
| [`../PRD/templates/prd-template.md`](../PRD/templates/prd-template.md) §9 Supporting Documents + §13 Review Log | BA Agent uses MoSCoW from this file to prioritize features; PRD template is the artifact produced by general-best-practices rules |
| [`../AGENTS.md`](../AGENTS.md) each agent row | Agent-specific rules in each skill section are implemented by all agents per these general best practices |
| `workflows/README.md` Phase structure | Each workflow phase corresponds to a stage where these best practices must be enforced (e.g., "Gather" phase → BA Agent rules §1-#2; "Approve" phase → Artifacts Are Source of Truth) |
| [`../code-builder/config-rules.md`](../code-builder/config-rules.md) Stack Selection Decision Tree | Tech stack choices from config-rules feed into which general best practices apply (e.g., React → hooks rule; Vue → composables rule) |
