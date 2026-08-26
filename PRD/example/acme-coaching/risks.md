# Risks Register: Acme Coaching

**Project:** Acme Coaching
**Last updated:** 2026-09-02
**Owner:** BA Agent
**Reviewer:** Requirements Reviewer

---

## Register

| ID | Risk | Category | Likelihood | Impact | Mitigation | Trigger | Owner | Status |
|----|------|----------|------------|--------|------------|---------|-------|--------|
| R-001 | Stripe outage blocks bookings during peak hour | technical | Medium | High | Queue writes; user sees "we'll confirm shortly"; alert on-call within 1 min (NFR OBS-004) | Stripe status page + our error rate spike | Sam | open |
| R-002 | GDPR right-to-erasure cascading deletes corrupt analytics aggregates | data | Low | High | Soft-delete + tombstone; analytics rebuilt from event log not joined tables; weekly reconciliation job | Reconciliation job mismatch alert | Lee + Sam | mitigated |
| R-003 | Coaches lose trust if video session fails (Daily.co outage) | technical | Medium | High | Daily.co 99.9% SLA; if it fails, sessions can move to phone; alert on-call; P1 incident response | Daily.co status + session join failure rate >2% | Sam | open |
| R-004 | MVP launch slips past 2026-12-15 | project | Medium | Medium | Story #15 (packages) already cut from MVP; we have a 3-week buffer; weekly burndown review | Sprint burndown miss by >10% for 2 sprints | Carmen | open |
| R-005 | Coach no-show rate stays high despite reminders | product | Medium | High | A/B test reminder timing at 30 days (T-24h vs T-24h+T-1h); consider SMS add-on in Phase 2 | No-show rate >10% at 60 days post-launch | Carmen | open |
| R-006 | EU-only constraint raises costs beyond €400/mo | technical | Low | Medium | R2 EU region adds ~10% to S3 cost; budget already includes buffer; monitor monthly | Monthly infra cost >€400 | Sam | open |
| R-007 | Coaches refuse to verify email (delayed activation) | product | Medium | Medium | Resend verification at 24h and 72h; add in-app "resend" link; SMS not at MVP | Activation funnel shows >30% drop-off at email verification | Carmen | open |
| R-008 | Stripe Connect onboarding is too complex for non-tech coaches | product | Medium | High | Use Stripe's hosted onboarding (no custom flow); add a "what to expect" guide; provide support contact | Coach survey at 30 days: <70% completed onboarding in <10 min | Carmen + Maya | open |
| R-009 | Refund calculation bugs in reschedule flow | data | Low | Medium | Refund logic in dedicated `BookingCancellationPolicy` class with unit tests covering all time-bracket cases; integration test against Stripe test mode | Refund complaint from any coach or client in first 100 cancellations | Sam | open |
| R-010 | Daily.co cannot confirm EU data residency (OQ-008) | legal | Medium | High | Fallback: switch to Zoom (already vetted, has EU region); defer MVP launch if neither is viable | OQ-008 unresolved by 2026-09-10 | Lee + Sam | open |

---

## Risks grouped by category

**Product risks:** R-005, R-007, R-008
**Technical risks:** R-001, R-003, R-006
**Legal & compliance risks:** R-002, R-010
**Market risks:** (none specific at MVP)
**Operational risks:** (none specific at MVP)
**Security risks:** (covered by NFRs SEC-001..010)
**Data risks:** R-002, R-009
**Project risks:** R-004

---

## Top 5 risks (executive view)

| Rank | Risk ID | One-line description | Owner | Next review |
|------|---------|----------------------|-------|-------------|
| 1 | R-010 | Daily.co cannot confirm EU data residency → may force provider switch | Lee + Sam | 2026-09-10 |
| 2 | R-008 | Stripe Connect onboarding too complex → coach drop-off | Carmen + Maya | 2026-10-15 (post-onboarding-feature) |
| 3 | R-005 | No-show rate stays high despite reminders → revenue loss | Carmen | 2027-01-15 (60 days post-launch) |
| 4 | R-003 | Daily.co outage during session → coach trust loss | Sam | Continuous (alert-based) |
| 5 | R-001 | Stripe outage blocks bookings during peak → revenue loss | Sam | Continuous (alert-based) |

---

## Realised risks (post-incident log)

| ID | Risk | When realised | Impact observed | Lessons learned |
|----|------|---------------|-----------------|-----------------|
| (none yet — greenfield project) | | | | |

---

*Risks are reviewed at every stage gate (PRD approval, SA handoff, MVP launch, post-launch review). A risk that has been realised moves to the "Realised risks" table with a lessons-learned entry.*
