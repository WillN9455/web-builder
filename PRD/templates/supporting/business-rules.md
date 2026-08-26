# Business Rules & Decision Register: <Project Name>

> Every decision the product makes that is not a user story but that the
> code must enforce — refund ladders, cut-off times, no-show definitions,
> status transitions, eligibility, rounding, and the like. PRD §8b is the
> summary table; this file is the full register the Solution Architect
> uses to design state machines and validation, and the Code Agents use to
> implement the rules without re-deriving them from user stories.

**Project:** <Project Name>
**Last updated:** <Date>
**Owner:** BA Agent
**Reviewer:** Requirements Reviewer
**Read by:** Solution Architect (state machines, validation), Code Agents (enforcement), QA Agent (rule tests)

---

## How to use this register

For every rule, capture:
- **ID** — `BR-NNN`, stable across the project
- **Rule** — a single, unambiguous statement the code can enforce
- **Trigger** — when the rule fires (event, state change, time, user action)
- **Decision** — the outcome(s) the system produces, with thresholds if any
- **Source** — where the rule came from (user interview, regulation, competitive norm, product decision)
- **Owner** — who has authority to change the rule
- **Status** — `proposed` | `approved` | `challenged` | `deprecated`

If a rule has thresholds, write them as a decision table — ambiguity here
becomes a bug in code. If two rules can fire on the same trigger, state the
**precedence** explicitly.

---

## Register

### Refunds & cancellations

| ID | Rule | Trigger | Decision | Source | Owner | Status |
|----|------|---------|----------|--------|-------|--------|
| BR-001 | Full refund if cancelled > 24h before session start | Client cancels | Refund 100% of charge; booking → `cancelled` | User interview (coaches, June 2026) | Product Owner | approved |
| BR-002 | 50% refund if cancelled 12–24h before start | Client cancels | Refund 50%; booking → `cancelled` | <source> | <owner> | approved |
| BR-003 | No refund if cancelled < 12h before start | Client cancels | Refund 0%; booking → `cancelled`; coach paid | <source> | <owner> | approved |

**Precedence:** BR-001 → BR-002 → BR-003, evaluated by time-to-start. First
match wins; do not cascade.

---

### Session lifecycle

| ID | Rule | Trigger | Decision | Source | Owner | Status |
|----|------|---------|----------|--------|-------|--------|
| BR-010 | A booking is a `no_show` if the client does not join within 15 min of start | 15 min after `slot_start` | booking → `no_show`; coach paid; client not charged back | Industry no-show norm | Product Owner | approved |
| BR-011 | Reschedule allowed up to 12h before start | Client requests reschedule | Allowed; booking moves to new slot; refund/recharge per BR-001..003 not triggered | <source> | <owner> | approved |
| BR-012 | A `completed` session requires both parties to have joined | Session end | status → `completed` only if join events recorded for both | <source> | <owner> | proposed |

**Status transition map:**
```
pending → confirmed → completed
                    ↘ no_show
        → cancelled (with BR-001..003)
```

---

### Booking & availability

| ID | Rule | Trigger | Decision | Source | Owner | Status |
|----|------|---------|----------|--------|-------|--------|
| BR-020 | A slot is bookable by one client at a time | Concurrent booking attempts | First confirmed wins; others see "slot taken" | <source> | <owner> | approved |
| BR-021 | Availability blocks repeat weekly until removed | Coach saves availability | Recurring; no per-week re-entry | <source> | <owner> | approved |

---

### Payments & money

| ID | Rule | Trigger | Decision | Source | Owner | Status |
|----|------|---------|----------|--------|-------|--------|
| BR-030 | Store all money as integer minor units (cents) | Any money write | `amount_cents` + `currency`; never float | <source> | <owner> | approved |
| BR-031 | Coach payout after session `completed` + 24h | Cron | Trigger payout; hold for dispute window | <source> | <owner> | proposed |

---

### Eligibility & permissions

> Cross-link to `rbac-matrix.md` for who-can-do-what. Rules here are the
> domain conditions, not the role gating.

| ID | Rule | Trigger | Decision | Source | Owner | Status |
|----|------|---------|----------|--------|-------|--------|
| BR-040 | Coach must have `active` status to publish availability | Coach saves availability | Rejected unless status = `active` (Stripe connected) | <source> | <owner> | approved |
| BR-041 | Client can only cancel/reschedule their own bookings | Client action | IDOR guard; see `rbac-matrix.md` + `security.md` §IDOR | <source> | <owner> | approved |

---

## Rules deferred to later phases

| ID | Rule | Phase | Why deferred |
|----|------|-------|--------------|
| BR-050 | Package session redemption decrements `sessions_remaining` atomically | Phase 2 | packages are Phase 2 |
| BR-051 | VAT/sales tax calculated via Stripe Tax | Phase 2 | tax complexity deferred |

---

## Challenged / open rules

> Rules the Requirements Reviewer flagged or the BA is unsure about. Each
> must resolve to `approved` or `deprecated` before the SA finalises the
> state machine, or be filed in `open-questions.md` with `blocker-for: tech`.

| ID | Rule | Challenge | Filed as |
|----|------|-----------|----------|
| BR-012 | "Completed requires both joined" | How do we detect join if Daily.co webhook is late? | OQ-### |

---

## Cross-references

- `PRD/<project>/prd.md` §8b — the summary table
- `PRD/<project>/rbac-matrix.md` — role gating for eligibility rules (BR-04x)
- `PRD/<project>/data-model.md` — status enums and transition targets
- `PRD/<project>/open-questions.md` — challenged rules filed as `blocker-for: tech`
- `PRD/<project>/tech-decision-brief.md` §1.11 — SA's executive view; drives state-machine + validation design

---

*A rule not written here does not exist. When code enforces a behaviour that is not in this register, add the rule here (or remove the behaviour) — the register and the code must agree. When a rule changes, append a new row with a new ID and mark the old one `deprecated`, do not rewrite history.*