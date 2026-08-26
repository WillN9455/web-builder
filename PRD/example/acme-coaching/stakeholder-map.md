# Stakeholder Map & RACI: Acme Coaching

**Project:** Acme Coaching
**Last updated:** 2026-09-02
**Owner:** BA Agent

---

## Stakeholders

| Name / Role | Contact | Interest | Influence | Preferred channel | Response time SLA |
|-------------|---------|----------|-----------|-------------------|--------------------|
| **Carmen Diaz** — Product Owner (and primary user) | carmen@acme-coaching.example | Scope, value, ROI for coaches | High | Slack DM, email | 4 working hours |
| **Sam Wright** — Engineering Lead | sam@acme-coaching.example | Feasibility, quality, tech debt | High | Slack DM | 4 working hours |
| **Priya Patel** — Design Lead | priya@acme-coaching.example | UX, accessibility, brand | Medium | Slack #design channel | 1 business day |
| **Lee Brennan** — Compliance Advisor (fractional) | lee@compliance-advisors.example | GDPR, security, data residency | Medium (veto on compliance) | Email | 2 business days |
| **Maya Hassan** — Customer Success Lead | maya@acme-coaching.example | Support load, churn, user feedback | Low | Slack #cs channel | 1 business day |
| **Steering Committee** (Carmen, Sam, 1 board advisor) | n/a | Strategic direction, budget | High (final escalation) | Monthly meeting | Per meeting cadence |

---

## RACI for each user story

> **RACI definitions:**
> - **R**esponsible — does the work
> - **A**ccountable — owns the outcome (one per row, the buck stops here)
> - **C**onsulted — gives input before the work is done
> - **I**nformed — told after the work is done

| Story # | Story summary | R (who builds) | A (who signs off) | C (consulted) | I (informed) |
|---------|---------------|----------------|-------------------|---------------|--------------|
| #1 | Coach signs up with email | Code Agent A | Carmen | Sam (auth approach), Lee (data handling), Priya (signup UX) | Maya |
| #2 | Coach connects Stripe | Code Agent B | Carmen | Sam (Stripe integration), Lee (financial data flow) | Maya |
| #3 | Coach sets weekly availability | Code Agent A | Carmen | Sam (timezone handling), Priya (calendar UI) | Maya |
| #4 | Coach defines session type | Code Agent B | Carmen | Priya (form UX), Sam (validation) | Maya |
| #5 | Client browses coach's profile | Code Agent C | Carmen | Priya (profile page design), Sam (public-route security) | Maya |
| #6 | Client books a session | Code Agent A | Carmen | Sam (Stripe payment + Daily.co), Lee (PII flow), Priya (booking UX) | Maya |
| #7 | Coach sees upcoming sessions | Code Agent B | Carmen | Priya (dashboard layout) | Maya |
| #8 | Client reschedules booking | Code Agent A | Carmen | Sam (slot logic), Priya (reschedule UX) | Maya |
| #9 | Client cancels booking | Code Agent A | Carmen | Sam (refund logic), Lee (financial data) | Maya |
| #10 | Coach writes session notes | Code Agent C | Carmen | Priya (note editor UX) | Maya |
| #11 | Coach daily summary email | Code Agent B | Carmen | Maya (email content), Sam (Postmark setup) | Lee |
| #12 | Coach exports data (GDPR) | Code Agent C | Lee | Sam (export pipeline), Carmen (UX) | Maya |
| #13 | Record video session (Phase 2) | TBD | Carmen | Lee (consent + recording laws), Sam (Daily.co recording API) | Priya, Maya |
| #14 | Recurring weekly booking (Phase 2) | TBD | Carmen | Priya (UX), Sam (cron/scheduler) | Maya |
| #15 | Coach defines package (Phase 2) | TBD | Carmen | Sam (payment + PackagePurchase flow), Lee (financial data) | Priya, Maya |
| #16 | Track client outcomes (Phase 3) | TBD | Carmen | Priya (chart UX), Sam (data model), Maya (what coaches want to see) | Lee |
| #17 | Practice manager view (Phase 2) | TBD | Carmen | Priya (multi-coach UI), Sam (auth + permissions) | Maya |
| #18 | Re-engagement nudge (Phase 3) | TBD | Carmen | Maya (tone), Priya (email design) | Sam |

---

## Decision rights

| Decision type | Who can decide alone | Who must be consulted | Escalation if disagreement |
|---------------|----------------------|----------------------|------------------------------|
| Scope (add/remove story) | Carmen | Sam, Priya | Steering Committee |
| Tech stack choice | Sam | Carmen, Lee | Architecture review board (Sam + 1 external advisor) |
| Design sign-off | Priya | Carmen | Carmen has final say on user-facing copy |
| Compliance / legal | Lee (veto) | Sam, Carmen | External legal counsel (€2k per engagement, budgeted) |
| Launch go/no-go | Carmen | All leads | Steering Committee |
| Budget over €500/month | Carmen | Sam | Steering Committee |

---

## Communications cadence

| Forum | Frequency | Attendees | Purpose | Output |
|-------|-----------|-----------|---------|--------|
| Daily standup | Daily, 9:30 UK | Code Agents, Sam | Status, blockers | Updated task board |
| Sprint review | Bi-weekly, Friday 14:00 UK | All stakeholders | Demo completed work, accept/reject | Updated backlog, scope decisions |
| Risk review | Weekly, Monday 10:00 UK | Carmen, Sam, Lee | Walk top 5 risks | Updated `risks.md` |
| Stage gate review | Per stage (PRD, architecture, design, MVP launch) | All leads | Promote to next stage | Sign-off in `prd.md` §13 or `tech-decision-brief.md` §2.8 |
| Post-launch review | +30 days post-launch | All stakeholders | Review §6a KPIs vs targets | Backlog reprioritisation, decision on Phase 2 priorities |
| Steering Committee | Monthly, first Tuesday | Carmen, Sam, board advisor | Strategic direction, budget | Updated roadmap |

---

## Escalation path

1. **Agent-to-agent** (Code → Code, Code → Design, etc.) — disagreements raised in the shared `reviewer-comments.md` thread; aim to resolve within 24h.
2. **Agent-to-lead** — if unresolved, escalate to the appropriate lead (Code → Sam, Design → Priya, BA → Carmen). Lead decides or escalates within 48h.
3. **Lead-to-stakeholder** — if the lead cannot decide (e.g., scope vs compliance conflict), escalate to the stakeholder review meeting.
4. **Stakeholder-to-steering** — only when stakeholder review cannot reach consensus; steering committee has the final call. Lee has compliance veto at any level.

**Example flow for "should we add a new feature mid-sprint?":**
1. Code Agent raises in daily standup → Sam
2. Sam asks Carmen → Carmen (PO) decides scope
3. If Carmen and Sam disagree → Steering Committee

**Example flow for "is this approach GDPR-compliant?":**
1. Sam asks Lee directly (no agent-to-agent step needed for compliance questions)
2. Lee says yes/no; if no, design must change — no further escalation needed (Lee has veto)

---

*This stakeholder map is the source of truth for "who do I ask?". When a name changes or a role is added, update this file AND the §5a summary in `prd.md` so the two stay in sync.*
