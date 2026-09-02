# Assumptions Register: Acme Coaching

**Project:** Acme Coaching
**Last updated:** 2026-09-02
**Owner:** BA Agent
**Reviewer:** Requirements Reviewer

---

## Register

| ID | Assumption | Why we believe it | What if wrong | How to validate | Owner | Status |
|----|------------|-------------------|---------------|-----------------|-------|--------|
| A-001 | Coaches have a modern browser (last 2 versions) | Analytics on comparable products (Calendly, Acuity) show 98%+ on evergreen browsers; interview participants all used current Chrome/Safari | We'd need a polyfill layer and a browser-support NFR — could delay MVP by 1 sprint | Browser support telemetry event in production; first-1000-coach report | Sam | believed |
| A-002 | Email is sufficient as the primary communication channel at MVP | All 12 interview participants preferred email for coach↔client communication; only 2 of 12 wanted SMS (and only for reminders, not for the core flow) | If wrong, we'd need SMS/WhatsApp in Phase 2 — defers, doesn't block MVP | Add "preferred channel" question to onboarding survey at 30 days; check if SMS demand >20% | Carmen | believed |
| A-003 | Coaches will tolerate a 3% Stripe processing fee | Industry standard; Carmen confirmed 3% is acceptable for MVP (vs 2.9% Stripe default + 0.5% international surcharge) | If wrong, need a fee-pass-through discussion; could add a "platform fee" line item | Survey 10 active coaches at 60 days post-launch | Carmen | believed |
| A-004 | EU-only data residency is achievable within budget | R2 EU region adds ~10% to S3 cost; Vercel EU region available; Daily.co EU region available (pending OQ-008) | If wrong, we need a multi-region architecture from day 1 (raises MVP cost by ~2x) | Infra cost projection at week 2 of MVP build; compare to budget | Sam | believed |
| A-005 | Daily.co's API is reliable enough for a real-time video session | Daily.co 99.9% historical SLA; same provider used by major coaching platforms (e.g., BetterUp) | If wrong, we need a fallback (Zoom, Jitsi); also impacts compliance (OQ-008) | Monitor Daily.co status + our session join failure rate in production | Sam | believed |
| A-006 | Coaches are willing to write session notes after a session (no more than 5 minutes) | Interview participants said 5–10 min was the max they'd spend; Carmen has tested with 3 pilot coaches who averaged 4 min | If wrong, need a "voice note" feature in Phase 2 (transcribe via Whisper API) | Time session notes in production (timestamp note creation) | Carmen | believed |
| A-007 | Coaches will be comfortable with a USD pricing display in MVP (we are EU-based) | MVP launch is UK + EU only; Carmen agreed GBP + EUR support is Phase 2 | If wrong, need multi-currency at MVP (raises cost and complexity) | Survey first 100 coaches about currency preference | Carmen | believed |
| A-008 | Coaches have stable, fast home internet | All interview participants reported stable home internet; coaching is a home-based profession | If wrong, we need a "low-bandwidth mode" (audio-only fallback) | Capture connection quality telemetry in first 1000 sessions | Sam | believed |

---

## Assumptions grouped by category

**User & persona:**
- A-001, A-002, A-006, A-008

**Technical & environment:**
- A-004, A-005, A-008

**Business & commercial:**
- A-003, A-007

**Legal & compliance:**
- A-004 (overlaps)

**Operational & support:**
- (none specific)

---

## Validation plan

| Assumption ID | When validated | Method | Cost if wrong |
|---------------|----------------|--------|---------------|
| A-001 | Post-launch +30 days | Browser telemetry report | High — 1 sprint of polyfill work |
| A-002 | Post-launch +30 days | Onboarding survey | Medium — Phase 2 SMS feature |
| A-003 | Post-launch +60 days | Coach survey | Low — fee pass-through is additive |
| A-004 | Pre-launch (week 2 of build) | Infra cost projection | High — 2x infra cost |
| A-005 | Post-launch +30 days | Daily.co status + session failure rate | High — provider switch is costly |
| A-006 | Post-launch +30 days | Note-creation time telemetry | Medium — voice note feature in Phase 2 |
| A-007 | Post-launch +100 coaches | Currency preference survey | Medium — multi-currency at MVP |
| A-008 | Post-launch +1000 sessions | Connection quality telemetry | Medium — audio-only fallback |

---

*Any new assumption discovered during design, code, or QA review MUST be added here with a `believed` status and a validation plan. The Orchestrator escalates assumptions still `believed` at each stage gate.*
