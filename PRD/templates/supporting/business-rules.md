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

## Lifecycle edge cases (mandatory enumeration)

> **The BA Agent must enumerate every lifecycle edge case the product
> could hit, even if the answer is "out of scope, see BR-###."** A
> product that hasn't decided what happens when a coach is deleted
> with upcoming bookings will discover it in production. Forcing the
> decision into this table means the Code Agent can implement the
> chosen behaviour, the SA can size any background work it implies,
> and the QA Agent can write a regression test for each.
>
> The default for every row below is **`unspecified`** until the BA
> Agent fills it. An `unspecified` row is a Requirements Reviewer defect.

### Categories (use these to spark the brainstorm)

1. **Account / entity lifecycle** — account deleted, deactivated, role changed, ownership transferred mid-flow.
2. **Payment failure modes** — card declined, 3DS abandoned, partial capture, webhook lost, refund issued, chargeback.
3. **Concurrency / state conflicts** — two parties act on the same record within seconds (cancel + reschedule, double-book, refund + dispute).
4. **Time / clock edges** — daylight saving boundaries, leap seconds, midnight UTC for local-time business, deadline crossed mid-request.
5. **Integration / third-party failures** — payment provider down, email provider down, video provider room creation fails after payment succeeded.
6. **Trust / permission edges** — user loses access mid-flow (org removed, subscription lapsed), admin override, audit log required.
7. **Data / privacy edges** — GDPR erasure hits a record that has financial implications (must keep tax-relevant data), anonymisation vs deletion.
8. **Operational edges** — deploy during peak, scheduled job double-runs, queue backlog, idempotency key reuse.

### Edge-case register

| Edge case | Category | Affected entities | Required behaviour | BR-### | Status |
|-----------|----------|-------------------|--------------------|--------|--------|
| Coach account is deleted while there are upcoming bookings | 1 | User, Booking | <e.g., "Auto-cancel bookings ≥ 24h away; refund per BR-103; notify clients"> | <BR-### or `unspecified`> | <open / approved> |
| Client cancels after they've already started the session | 1, 4 | Booking | <e.g., "No refund; flag for coach review"> | <BR-### or `unspecified`> | <open / approved> |
| Payment succeeds but video-room creation fails | 5 | Booking, Session | <e.g., "Queue retry job; surface 'join by phone' fallback; alert on-call"> | <BR-### or `unspecified`> | <open / approved> |
| Card declined on a recurring booking | 2 | Payment, Subscription | <e.g., "Retry with exponential backoff; suspend after N failures; notify"> | <BR-### or `unspecified`> | <open / approved> |
| User requests GDPR erasure but has tax-relevant transactions | 7 | User, Payment | <e.g., "Anonymise PII fields; retain transactional records per BR-###"> | <BR-### or `unspecified`> | <open / approved> |
| Two clients book the same slot before availability locks | 3 | Booking | <e.g., "DB unique constraint on (coach_id, slot_start); second write returns 409"> | <BR-### or `unspecified`> | <open / approved> |
| Scheduled job runs twice (clock skew, manual rerun) | 8 | <varies> | <e.g., "Idempotency key per (entity, action, day); second run no-ops"> | <BR-### or `unspecified`> | <open / approved> |
| <edge case N> | <category> | <entities> | <behaviour> | <BR-###> | <status> |

### How the BA Agent fills this table

1. Walk each user story in PRD §8 and ask "what can go wrong on or after this step?"
2. Walk each business rule (BR-###) and ask "what's the failure mode of this rule?"
3. Walk each integration in PRD §9b and ask "what does this look like when the integration is down or slow?"
4. Walk each enum transition in `data-model.md` §Enums & state transitions and ask "what does this look like at 23:59:59 the day before?"
5. For each edge case, the required behaviour is one of: (a) a `BR-###` reference, (b) `out of scope` with rationale, (c) `unspecified` — but `unspecified` rows are review defects and must be eliminated before §13 sign-off.

### How downstream consumers read this table

- **Solution Architect** — sizes queues, retries, idempotency, and background jobs from the "Required behaviour" column. Rows that imply infrastructure (queues, schedulers) feed the architecture diagram.
- **Code Agents** — implement the behaviour as route guards, DB constraints, queue jobs, and `data-model.md` enum defaults.
- **QA Agent** — writes a regression test per row. An `unspecified` row is an untestable requirement and fails the test plan.
- **Requirements Reviewer** — rejects the PRD if any row is `unspecified` at §13 sign-off.

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