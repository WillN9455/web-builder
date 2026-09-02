# Assumptions Register: <Project Name>

> Every assumption the BA Agent is making about users, environment, or
> context. PRD §12 is the summary; this file is the full register. The
> Solution Architect and Code Agents must read this before starting work —
> an assumption that turns out to be wrong is the most common source of
> late-stage rework.

**Project:** <Project Name>
**Last updated:** <Date>
**Owner:** BA Agent
**Reviewer:** Requirements Reviewer

---

## How to use this register

For every assumption, capture:
- **The assumption** — the belief we are making
- **Why we believe it** — evidence (research, data, prior experience, user quote)
- **What happens if we're wrong** — concrete impact on the product
- **How we validate** — the cheapest way to confirm before it's too late
- **Owner of validation** — who is accountable for checking
- **Status** — `believed` | `validated` | `broken` | `replaced`

---

## Register

| ID | Assumption | Why we believe it | What if wrong | How to validate | Owner | Status |
|----|------------|-------------------|---------------|-----------------|-------|--------|
| A-001 | <e.g., "Users have a modern browser (last 2 versions)"> | <e.g., "Analytics on comparable product show 98% on evergreen browsers"> | <e.g., "We'd need a polyfill / older-browser support — could delay MVP by 2 sprints"> | <e.g., "Confirm in user research; add a browser-support telemetry event"> | <role> | believed |
| A-002 | <e.g., "Users will accept email-only auth (no social login) at MVP"> | <e.g., "User interviews with 5 of 7 target users preferred email"> | <e.g., "Conversion drops; we'd need to add social login in Phase 2"> | <e.g., "A/B test at launch; check activation rate against §6a target"> | <role> | believed |
| A-003 | ... | ... | ... | ... | ... | ... |

---

## Assumptions grouped by category

**User & persona:**
- <list A-IDs>

**Technical & environment:**
- <list A-IDs>

**Business & commercial:**
- <list A-IDs>

**Legal & compliance:**
- <list A-IDs>

**Operational & support:**
- <list A-IDs>

---

## Validation plan

> When in the project lifecycle does each assumption get checked?
> Examples: "validated in user research before MVP", "instrumented and checked at 30-day post-launch review".

| Assumption ID | When validated | Method | Cost if wrong |
|---------------|----------------|--------|---------------|
| A-001 | <when> | <how> | <impact> |
| A-002 | ... | ... | ... |

---

*Any new assumption discovered during design, code, or QA review MUST be added here with a `believed` status and a validation plan. The Orchestrator escalates assumptions still `believed` at each stage gate.*
