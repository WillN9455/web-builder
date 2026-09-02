# Stakeholder Map & RACI: <Project Name>

> Detail view of PRD §5a. Captures the full RACI for every feature, the
> communications cadence, and the escalation path. The Code Agents,
> Solution Architect, and QA Agent read this to know who to ask when they
> need a decision.

**Project:** <Project Name>
**Last updated:** <Date>
**Owner:** BA Agent

---

## Stakeholders

| Name / Role | Contact | Interest | Influence | Preferred channel | Response time SLA |
|-------------|---------|----------|-----------|-------------------|--------------------|
| <e.g., Product Owner — Jane> | <email/Slack> | <scope, value, ROI> | High | <channel> | <e.g., 1 business day> |
| <e.g., Engineering Lead — Sam> | <email/Slack> | <feasibility, quality> | High | <channel> | <e.g., 4 working hours> |
| <e.g., Design Lead — Priya> | <email/Slack> | <UX, accessibility> | Medium | <channel> | <e.g., 1 business day> |
| <e.g., Compliance — Lee> | <email/Slack> | <GDPR, security> | Medium (veto on compliance) | <channel> | <e.g., 2 business days> |
| <e.g., Customer Success — Maya> | <email/Slack> | <support load, churn> | Low | <channel> | <e.g., 1 business day> |

---

## RACI for each user story

> **RACI definitions:**
> - **R**esponsible — does the work
> - **A**ccountable — owns the outcome (one per row, the buck stops here)
> - **C**onsulted — gives input before the work is done
> - **I**nformed — told after the work is done

| Story # | Story summary | R (who builds) | A (who signs off) | C (consulted) | I (informed) |
|---------|---------------|----------------|-------------------|---------------|--------------|
| #1 | <e.g., User signs up with email> | <Code Agent> | <Product Owner> | <Design, Compliance> | <Customer Success> |
| #2 | ... | ... | ... | ... | ... |
| #3 | ... | ... | ... | ... | ... |

---

## Decision rights

| Decision type | Who can decide alone | Who must be consulted | Escalation if disagreement |
|---------------|----------------------|----------------------|------------------------------|
| Scope (add/remove story) | Product Owner | Engineering Lead, Design Lead | Stakeholder review meeting |
| Tech stack choice | Engineering Lead | Product Owner, Compliance | Architecture review board |
| Design sign-off | Design Lead | Product Owner | Design review meeting |
| Compliance / legal | Compliance (veto) | Engineering Lead, Product Owner | Legal counsel |
| Launch go/no-go | Product Owner | All leads | Steering committee |

---

## Communications cadence

| Forum | Frequency | Attendees | Purpose | Output |
|-------|-----------|-----------|---------|--------|
| Daily standup | Daily | Code Agents, SA | Status, blockers | Updated task board |
| Sprint review | Bi-weekly | All stakeholders | Demo completed work | Acceptance / change requests |
| Risk review | Weekly | BA, SA, Engineering Lead | Walk top 5 risks | Updated `risks.md` |
| Stage gate review | Per stage | All leads | Promote to next stage | Sign-off in `prd.md` §13 |
| Post-launch review | +30 days post-launch | All stakeholders | Review §6a KPIs | Backlog reprioritisation |

---

## Escalation path

> When an agent or stakeholder disagrees with a decision and cannot resolve
> it at their level, this is the path. The first step should always be a
> synchronous conversation, not a written argument.

1. **Agent-to-agent** — code/design/BA agents raise disagreements in the
   shared `reviewer-comments.md` thread; aim to resolve within 24h.
2. **Agent-to-lead** — if unresolved, escalate to the appropriate lead
   (Code → Eng Lead, Design → Design Lead, BA → Product Owner). Lead
   decides or escalates further within 48h.
3. **Lead-to-stakeholder** — if the lead cannot decide (e.g., scope vs
   compliance conflict), escalate to the stakeholder review meeting.
4. **Stakeholder-to-steering** — only when stakeholder review cannot reach
   consensus; steering committee has the final call.

---

*This stakeholder map is the source of truth for "who do I ask?". When a name changes or a role is added, update this file AND the §5a summary in `prd.md` so the two stay in sync.*
