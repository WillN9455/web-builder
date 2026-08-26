# Reviewer Comments: Acme Coaching

**Project:** Acme Coaching
**Review pass:** 1 of 1
**Started:** 2026-08-28
**Reviewer:** Requirements Reviewer
**Author:** BA Agent
**Status:** agreed

---

## How to use this file

- The Reviewer adds comments inline, prefixed with `[REVIEWER]` and the date.
- The BA replies inline, prefixed with `[BA]` and the date, and marks the
  comment `RESOLVED` or `DEFERRED` (with reason).
- The Reviewer marks a thread `AGREED` when the BA's response is acceptable.
- The file ends with a **Reviewer Sign-off** block that the Orchestrator
  uses to promote the PRD to the next stage.
- All comments in PRD §13 should resolve to `AGREED` or `DEFERRED (with
  reason and owner)` before the PRD is approved.

---

## Cross-cutting concerns

### C-001 — MVP scope is too large
- [REVIEWER] 2026-08-28 — The MVP currently contains 12 stories including #14 (recurring booking), #15 (packages), and #13 (recording). The team's MVP track record (based on the §3a NFRs and §8a phasing table) suggests a 12-week solo-engineer MVP cannot reliably deliver this. Suggest cutting #14 and #15 to Phase 2. #13 was already discussed and agreed as Phase 2 in §3.
- [BA] 2026-08-28 — Agreed. #14 (recurring) and #15 (packages) are cut to Phase 2. Updated §7, §8, and `phasing-plan.md`. Story #13 was already Phase 2; no change needed.
- Status: **AGREED**

### C-002 — Success metrics missing client-side metrics
- [REVIEWER] 2026-08-29 — The §6a table focuses on coach metrics. What about client activation, client retention, client booking frequency?
- [BA] 2026-08-29 — Added row "Client activation (sign-up → first session completed) ≥ 40% within 30 days". Client retention is implicit in the coach-side metric (no-show rate + repeat-booking rate). Will add explicit client retention metric in Phase 2 once we have a baseline.
- Status: **AGREED**

---

## Section-by-section review

### §1 Main Feature

(no comments — section agreed as-is)

### §2 Problem Alignment

#### 2.1 — "Background evidence" needs sourcing
- [REVIEWER] 2026-08-28 — The 3–6 hours/week admin claim and the 15% no-show claim need citations. Even informal citations (e.g., "Calendly blog post, 2024") strengthen the section.
- [BA] 2026-08-28 — Added citation list to `research/citations.md`. Top three: (1) Calendly State of Scheduling 2024 (3.2 hrs/week admin avg for service businesses); (2) HSG Advisors, "No-show rates across service industries, 2023" (15–20% baseline, 5% with reminders); (3) our own interview notes (12 interviews, 2026-06).
- Status: **AGREED**

### §3 Timing & Priority

(no comments)

### §3a Constraints & NFRs

#### 3a.1 — NFR P-002 is aggressive for MVP
- [REVIEWER] 2026-08-28 — API p95 < 300ms is very aggressive for a greenfield build. Suggest relaxing to <500ms for MVP and tightening in Phase 2.
- [BA] 2026-08-28 — Discussed with Sam. Sam confirmed 300ms is feasible with Vercel edge runtime + Redis cache layer. Stays at 300ms; will be validated in staging load test pre-launch (NFR S-001).
- Status: **AGREED**

### §3b Tech Constraints

#### 3b.1 — Daily.co data residency is uncertain
- [REVIEWER] 2026-08-30 — The "must use Daily.co" constraint in §3b depends on Daily.co confirming EU data handling. If they can't, we either violate GDPR or violate the tech constraint. Filed as OQ-008.
- [BA] 2026-08-30 — Confirmed. OQ-008 filed; Lee is in contact with Daily. If unresolved by 2026-09-10, fallback is Zoom (also has EU region). Updated R-010 in `risks.md`.
- Status: **AGREED** (with follow-up OQ-008)

### §5 Target Users

#### 5.1 — Primary persona should be explicit
- [REVIEWER] 2026-08-28 — The table lists 4 personas. Which one is the primary persona for MVP? Add an explicit "Primary persona for MVP" callout.
- [BA] 2026-08-28 — Added "Primary persona for MVP: Coach Carmen" as a callout below the table. Practice Manager Priya is Phase 2.
- Status: **AGREED**

### §5a Stakeholder Map

(no comments)

### §6 UX Design Principles

#### 6.1 — "No jargon" is good but needs an example
- [REVIEWER] 2026-08-28 — The "no jargon" principle is good. Should we add a "forbidden terms" list to the glossary?
- [BA] 2026-08-28 — Agreed. Added "Deprecated / forbidden terms" section to `glossary.md` with "Customer", "Reservation", "Appointment", "Patient", "Live" as forbidden.
- Status: **AGREED**

### §6a Success Metrics

#### 6a.1 — Client activation metric missing
- [REVIEWER] 2026-08-29 — (See C-002 above.) Resolved.
- Status: **AGREED**

#### 6a.2 — "Coach admin time" is self-reported — risk of bias
- [REVIEWER] 2026-08-29 — The "Coach admin time per week: median < 30 min" metric relies on self-reported weekly survey. Self-report is biased (coaches who struggle over-report, coaches who breeze under-report). Suggest a more objective measurement.
- [BA] 2026-08-29 — Agreed. Will add a proxy metric in Phase 2: time spent in the app per week (server-side RUM). For MVP, the self-reported number is the best we have; we'll pair it with the proxy at +30 days.
- Status: **AGREED** (proxy metric added in Phase 2 scope)

### §7 Scope

#### 7.1 — MVP definition should be a section callout
- [REVIEWER] 2026-08-28 — The MVP definition is buried in the Scope section. Suggest a callout box that says "MVP must include: stories X, Y, Z" so the Orchestrator can scan it in 5 seconds.
- [BA] 2026-08-28 — Added "MVP Definition (the smallest release that delivers value)" subsection with the callout.
- Status: **AGREED**

### §8 User Stories

#### 8.1 — Story #6 acceptance criteria missing video link timing
- [REVIEWER] 2026-09-01 — Story #6 says "receive confirmation email with calendar invite and Daily.co video link". But the video link could leak the room URL to anyone who reads the email. When does the link become "joinable"? 15 min before? 24h?
- [BA] 2026-09-01 — The Daily.co room URL is sent in the confirmation email (low-entropy URL with token). The "join" button is enabled 15 min before the session start; before that, the button shows "Link active 15 min before session". This matches the OQ-009 follow-up (resolved 2026-09-01: no per-session-type override at MVP).
- Status: **AGREED**

#### 8.2 — Story #9 refund policy is a business rule, should be in §9a or a dedicated section
- [REVIEWER] 2026-09-01 — The 24h/12h refund tiers in Story #9 are a business rule, not a user story detail. Should be in §9a Data Model or a dedicated "Business Rules" section.
- [BA] 2026-09-01 — Added to `data-model.md` §Booking "Cancellation refund rules". Cross-referenced from Story #9.
- Status: **AGREED**

#### 8.3 — Story #12 should be a coach story, not a client story
- [REVIEWER] 2026-09-01 — Wait, the table shows Story #12 as "Coach exports data". Looking at §9a, both Coaches and Clients can export. Should there be a Client-side export story too?
- [BA] 2026-09-01 — Yes, missed. The Coach and Client flows are identical (same /settings/export page, same backend). Adding "Client exports data" as a duplicate story was deemed redundant; instead, I'll add a note to the Data Model §GDPR flows that the same flow covers both user types. Updated.
- Status: **AGREED** (with note in data-model.md)

### §8a Phasing & Release Plan

(no comments — clean after C-001 was agreed)

### §9a Data Model

#### 9a.1 — Package entities are Phase 2, should be clearly marked
- [REVIEWER] 2026-09-01 — The §9a table includes `Package` and `PackagePurchase` entities which are Phase 2. Should be marked as such in the table.
- [BA] 2026-09-01 — Added "(Phase 2)" suffix to the entity names and a "Phase 2 only" note at the bottom of the table.
- Status: **AGREED**

### §9b Integrations

#### 9b.1 — Daily.co data residency must be verified for EU compliance
- [REVIEWER] 2026-08-30 — (See 3b.1.) Resolved with OQ-008.
- Status: **AGREED**

### §11 User Clarifications

(no comments — all questions tracked in `open-questions.md`)

### §11a Glossary

#### 11a.1 — "Booking" vs "Booking Request" distinction is important
- [REVIEWER] 2026-08-28 — Good that these are separated. Should add an example showing the state flow.
- [BA] 2026-08-28 — Added status flow under "Booking Request" and clarified under "Booking". Both terms now have full examples.
- Status: **AGREED**

### §12 Assumptions

#### 12.1 — A-003 (Stripe fee) should be validated, not assumed
- [REVIEWER] 2026-08-28 — Assumption A-003 says coaches will tolerate a 3% Stripe fee. This is testable, not a real assumption — it should be a survey, not an assumption.
- [BA] 2026-08-28 — Carmen surveyed 3 pilot coaches before writing the PRD; all 3 said 3% is fine. Updated A-003 with the evidence ("interview participants confirmed") and added to validation plan ("Survey 10 active coaches at 60 days post-launch").
- Status: **AGREED**

### §12a Risks

(no comments)

### §13 Review Log

(no comments — the log is itself the audit trail)

---

## Reviewer Sign-off

**Reviewer:** Requirements Reviewer
**Date:** 2026-09-02
**Pass:** 1 of 1

**Outcome:**
- [x] APPROVED WITH FOLLOW-UPS — PRD can proceed; follow-up items filed in `open-questions.md` (OQ-007 EU-only confirmation, OQ-008 Daily.co EU data residency — both non-blocking for design/code start)

**Comments resolved in this pass:** 14
**Comments deferred (with owner):** 0
**Open questions added to `open-questions.md`:** 2 (OQ-007, OQ-008)

**Reviewer signature:** Requirements Reviewer, 2026-09-02

**Notes for Solution Architect:**
- §3b must-use constraints are non-negotiable; any deviation requires Carmen + Steering Committee approval
- OQ-007 and OQ-008 are blocking the SA's Part 2 work; expected to resolve by 2026-09-10
- NFRs P-001..005 are aggressive but feasible per Sam; will be validated in staging pre-launch

---

*This was review pass 1. Pass 2 will be triggered by any of: (a) a major scope change, (b) a new external constraint from Lee, (c) the SA surfacing a conflict that requires PRD revision.*
