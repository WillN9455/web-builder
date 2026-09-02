# Open Questions Log: Acme Coaching

**Project:** Acme Coaching
**Last updated:** 2026-09-02
**Owner:** BA Agent
**Reviewer:** Requirements Reviewer

> Single source of truth for every question raised during requirements
> gathering. The PRD §11 list is the executive summary; this file is
> the full log.

---

## Open

| ID | Question | Raised by | Date | Blocker for | Notes |
|----|----------|-----------|------|-------------|-------|
| OQ-007 | Is the EU-only data residency a hard requirement even if it raises costs? | Carmen (BA interview) | 2026-08-25 | tech | Carmen + Lee to confirm; default is "yes" pending confirmation |
| OQ-008 | Daily.co data residency — can they confirm EU-only data handling? | Lee (compliance review) | 2026-08-30 | tech | Lee is in contact with Daily; expect answer by 2026-09-10 |
| OQ-009 | For the 12-hour-before reschedule cutoff — should we allow coaches to override per session type? | Carmen | 2026-09-01 | design | Coaches may want different rules for different session types |
| OQ-010 | Should MVP support coach team accounts (Practice Manager Priya)? | Carmen (BA interview) | 2026-08-25 | none | Already decided: NO at MVP, YES at Phase 2 (tracked as deferred) |
| OQ-011 | What is the maximum file size for coach profile photo upload? | Priya (design) | 2026-09-01 | code-MVP | Affects R2 presigned URL config |

## In discussion

| ID | Question | Raised by | Date | Blocker for | Current direction | Owner |
|----|----------|-----------|------|-------------|-------------------|-------|
| (none) | | | | | | |

## Resolved

| ID | Question | Resolution | Decided by | Date | Linked artifact |
|----|----------|------------|------------|------|-----------------|
| OQ-001 | What is the primary purpose of the application? | Online booking + session mgmt for independent coaches (replaces Calendly + Stripe + WhatsApp + Drive) | Carmen | 2026-08-15 | PRD §1 |
| OQ-002 | Expected user volume at launch? | ~1k MAU at MVP, 100k at 12 months | Carmen | 2026-08-15 | PRD §3a, `nfr-catalog.md` S-001, S-002 |
| OQ-003 | Existing technology constraints? | Must integrate with Stripe, Postmark, Daily.co; EU-only; no Firebase | Carmen | 2026-08-18 | PRD §3b |
| OQ-004 | Team familiarity with any framework? | React + TypeScript (3 yrs); no PHP, Vue, or Svelte experience | Sam | 2026-08-18 | `tech-decision-brief.md` Part 1 §1.3 |
| OQ-005 | Budget constraints? | <€500/mo at MVP, <€2k/mo at 12 months | Carmen | 2026-08-18 | PRD §3a (S-002 budget) |
| OQ-006 | Should MVP support team accounts? | NO at MVP, YES at Phase 2 (Practice Manager Priya persona) | Carmen | 2026-08-25 | PRD §11, deferred to Phase 2 |
| OQ-009 | (added 2026-09-01) — 12h reschedule override | No override at MVP; revisit in Phase 2 if coaches complain | Carmen | 2026-09-01 | PRD §8 #8 (cut from MVP, in MVP) |

**Note:** OQ-009 was raised 2026-09-01 and resolved 2026-09-01 — moved to Resolved for completeness even though it was quick.

## Wontfix / Deferred

| ID | Question | Why deferred | Revisit when |
|----|----------|--------------|--------------|
| OQ-010 | Practice Manager team accounts at MVP | Priya persona is Phase 2; defer to keep MVP focused | 2027-01-15 (Phase 2 planning) |

## Blocked

| ID | Question | Blocked by | Notes |
|----|----------|------------|-------|
| (none) | | | |

---

## Filter views (used by agents)

**Blocking PRD approval:** 0 (PRD approved 2026-09-02)

**Blocking tech-decision-brief (SA cannot start until these are resolved):**
- OQ-007 (EU-only confirmation) — Carmen + Lee
- OQ-008 (Daily.co EU data residency) — Lee

**Blocking design work:**
- OQ-009 (reschedule override per session type) — resolved 2026-09-01

**Blocking integration plan:**
- OQ-008 (Daily.co EU data residency) — Lee

---

*Every question raised in a PRD review pass, BA interview, or design/code review MUST be added here. If a question is resolved inline, the resolution must still be recorded in the Resolved table so the audit trail is complete.*
