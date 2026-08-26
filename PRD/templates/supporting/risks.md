# Risks Register: <Project Name>

> Every risk to the project — product, technical, legal, market, operational.
> PRD §12a is the summary table; this file is the full register with
> mitigation plans and trigger signals. The Orchestrator reads this at
> every stage gate to decide whether to proceed, replan, or escalate.

**Project:** <Project Name>
**Last updated:** <Date>
**Owner:** BA Agent
**Reviewer:** Requirements Reviewer

---

## How to use this register

For every risk, capture:
- **The risk** — a clear, specific statement of what could go wrong
- **Category** — `product` | `technical` | `legal` | `market` | `operational` | `security` | `data`
- **Likelihood** — `Low` | `Medium` | `High` (qualitative; the team calibrates together)
- **Impact** — `Low` | `Medium` | `High` (what does it cost in time, money, or user trust)
- **Mitigation** — what we are doing to reduce likelihood or impact
- **Trigger** — the early signal that the risk is materialising
- **Owner** — who is accountable for monitoring and acting on the trigger
- **Status** — `open` | `mitigated` | `realised` | `closed`

---

## Register

| ID | Risk | Category | Likelihood | Impact | Mitigation | Trigger | Owner | Status |
|----|------|----------|------------|--------|------------|---------|-------|--------|
| R-001 | <e.g., "Stripe outage blocks bookings during peak hour"> | technical | Medium | High | <queue + retry; user sees "we'll confirm shortly"> | <Stripe status page + our error rate spike> | <role> | open |
| R-002 | <e.g., "GDPR right-to-erasure cascading deletes corrupt analytics aggregates"> | data | Low | High | <soft-delete + tombstone; weekly reconciliation job; analytics rebuilt from event log not joined tables> | <support ticket from data subject + reconciliation mismatch alert> | <role> | mitigated |
| R-003 | ... | ... | ... | ... | ... | ... | ... | ... |

---

## Risks grouped by category

**Product risks:** <list R-IDs>
**Technical risks:** <list R-IDs>
**Legal & compliance risks:** <list R-IDs>
**Market risks:** <list R-IDs>
**Operational risks:** <list R-IDs>
**Security risks:** <list R-IDs>
**Data risks:** <list R-IDs>

---

## Top 5 risks (executive view)

> The five risks the Orchestrator and stakeholders must track actively.
> Ordered by `Likelihood × Impact`.

| Rank | Risk ID | One-line description | Owner | Next review |
|------|---------|----------------------|-------|-------------|
| 1 | <R-###> | <text> | <role> | <date> |
| 2 | ... | ... | ... | ... |
| 3 | ... | ... | ... | ... |
| 4 | ... | ... | ... | ... |
| 5 | ... | ... | ... | ... |

---

## Realised risks (post-incident log)

| ID | Risk | When realised | Impact observed | Lessons learned |
|----|------|---------------|-----------------|-----------------|
| R-### | <text> | <date> | <what happened> | <what we'd do differently> |

---

*Risks are reviewed at every stage gate (PRD approval, SA handoff, MVP launch, post-launch review). A risk that has been realised moves to the "Realised risks" table with a lessons-learned entry.*
