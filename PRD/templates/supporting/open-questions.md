# Open Questions Log: <Project Name>

> Maintained by BA Agent, reviewed by Requirements Reviewer, read by
> Solution Architect and Orchestrator. Single source of truth for every
> question raised during requirements gathering. The PRD §11 list is the
> executive summary; this file is the full log.

**Project:** <Project Name>
**Last updated:** <Date>
**Owner:** BA Agent
**Reviewer:** Requirements Reviewer

---

## Status legend

- **Open** — raised, no answer yet
- **In discussion** — being worked through with the user / SME
- **Resolved** — answered; resolution recorded below
- **Wontfix** — out of scope for this phase; explicitly deferred
- **Blocked** — cannot be answered until another question or external dependency resolves

**`blocker-for` values:** `PRD-approval` | `tech` | `integration` | `design` | `qa` | `code-MVP` | `code-phase-2` | `none`

---

## Open

| ID | Question | Raised by | Date | Blocker for | Notes |
|----|----------|-----------|------|-------------|-------|
| OQ-001 | <question text> | <agent / user> | <date> | <blocker-for> | <context, partial info, who we should ask> |
| OQ-002 | ... | ... | ... | ... | ... |

## In discussion

| ID | Question | Raised by | Date | Blocker for | Current direction | Owner |
|----|----------|-----------|------|-------------|-------------------|-------|
| OQ-003 | ... | ... | ... | ... | ... | ... |

## Resolved

| ID | Question | Resolution | Decided by | Date | Linked artifact |
|----|----------|------------|------------|------|-----------------|
| OQ-004 | <question> | <what we decided + why> | <name/role> | <date> | <PRD §N or supporting file> |

## Wontfix / Deferred

| ID | Question | Why deferred | Revisit when |
|----|----------|--------------|--------------|
| OQ-005 | ... | ... | ... |

## Blocked

| ID | Question | Blocked by | Notes |
|----|----------|------------|-------|
| OQ-006 | ... | OQ-### | ... |

---

## Filter views (used by agents)

**Blocking PRD approval (must resolve before §13 sign-off):**
- <list OQ-IDs with `blocker-for: PRD-approval` and status != Resolved>

**Blocking tech-decision-brief (SA cannot start until these are resolved):**
- <list OQ-IDs with `blocker-for: tech` and status != Resolved>

**Blocking design work:**
- <list OQ-IDs with `blocker-for: design` and status != Resolved>

**Blocking integration plan:**
- <list OQ-IDs with `blocker-for: integration` and status != Resolved>

---

*Every question raised in a PRD review pass, BA interview, or design/code review MUST be added here. If a question is resolved inline, the resolution must still be recorded in the Resolved table so the audit trail is complete.*
