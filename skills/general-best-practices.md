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
- Produce the full supporting artifact set, not just `prd.md` — each maps to a downstream consumer and each is a reviewable artifact:
  - `nfr-catalog.md` — every NFR as a testable statement ("When… the system shall… measured by… with a target of…"). Vague NFRs ("fast", "scalable") are not testable and will be rejected at review. Sharpen or remove them.
  - `traffic-profile.md` — the load *distribution* (peak:average, read:write, hot endpoints, geo, batch load), not just the averages. Estimate defensively with cited sources; mark `believed` estimates so the SA sizes for the upper band.
  - `business-rules.md` — every non-story decision the code enforces (refund ladders, cut-offs, status transitions, eligibility, money handling) as **decision tables with thresholds and precedence**, never prose. A rule not written here does not exist.
  - `rbac-matrix.md` — a default-deny role × permission matrix with every "own"/"group" cell flagged as an IDOR boundary. Every route gets a row before it is coded; empty cells are Deny, not "unspecified".
  - `cost-model.md` — break the budget cap into infra, storage, egress, and per-transaction fees (Stripe %, email/email, video/min). A product can be under budget on infra and still lose money per booking — model both.
  - `data-flow.md` — PII in motion field-by-field across every trust boundary, the PCI-scope line (card data never reaches our servers), and residency per flow. `data-model.md` is PII at rest; this is PII in motion.
  - §6b key user journeys — stitch stories into 2–5 end-to-end journeys naming the stories, states, integrations, and rules each touches. Narrative altitude only; screen-level flow is the Design Agents' job.
- Volume and cost estimates do not need to be precise at requirements time — they need to be **defensible**. Cite the source for every number; if the source is a belief, it goes in `assumptions.md` with a validation plan.

### Requirements Reviewer
- Be adversarial — your job is to find gaps, not confirm completeness
- Challenge every assumption as a risk
- Flag any requirement that can't be tested or measured
- Push back on scope creep; suggest out-of-scope tags instead
- Reject any NFR not written in the testable "When… shall… measured by… target of…" form — "fast" and "scalable" are not requirements
- Reject any business rule written as prose — thresholds belong in a decision table with explicit precedence
- Reject the RBAC matrix if any route is missing a row, any "own"/"group" cell lacks a server-side IDOR scoping statement, or the default is not deny
- Reject `data-flow.md` if there is no PCI-scope line stating card data never reaches our servers, or any third-party flow lacks a residency note
- Check §6b journeys cover at least one failure/alternate path per journey, not just the happy path
- Check `cost-model.md` headroom is ≥ 0 for every window; a model that breaks the budget cap is a blocker for SA handoff, not a follow-up

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
- Ship a route/handler without a row in `rbac-matrix.md` — an unscoped route is an IDOR waiting to happen
- Send PII to a third party not listed in `data-flow.md`, or let raw card data touch your servers
- Sign the SA handoff (`tech-decision-brief.md` §2.8) while `cost-model.md` headroom is negative

## Artifacts Are Source of Truth

All agent work flows through files. If it's not written down, it doesn't exist.

**Location rule (from CLAUDE.md §Workspace Root):** every path below is relative to the
workspace root — the directory in `project-dir.txt` if that file exists, otherwise the
current repository. Never write artifacts to both places.

- Requirements → `PRD/<project>/prd.md`
- Design → `design-system/<project>/`
- Code → Feature branches
- Tests → `testing/playwright/`
- Reviews → `PRD/<project>/reviewer-comments.md`, inline PR comments

## Related Files

| File | Relationship |
|------|-------------|
| [`../PRD/templates/prd-template.md`](../PRD/templates/prd-template.md) §9 Supporting Documents + §13 Review Log | BA Agent uses MoSCoW from this file to prioritize features; PRD template is the artifact produced by general-best-practices rules |
| [`../PRD/templates/supporting/`](../PRD/templates/supporting/) (nfr-catalog, traffic-profile, business-rules, rbac-matrix, cost-model, data-flow) | The BA Agent §rules above mandate these supporting artifacts; the Requirements Reviewer §rules reject incomplete versions of them |
| [`../AGENTS.md`](../AGENTS.md) each agent row | Agent-specific rules in each skill section are implemented by all agents per these general best practices |
| `workflows/README.md` Phase structure | Each workflow phase corresponds to a stage where these best practices must be enforced (e.g., "Gather" phase → BA Agent rules §1-#2; "Approve" phase → Artifacts Are Source of Truth) |
| [`../code-builder/config-rules.md`](../code-builder/config-rules.md) Stack Selection Decision Tree | Tech stack choices from config-rules feed into which general best practices apply (e.g., React → hooks rule; Vue → composables rule) |
