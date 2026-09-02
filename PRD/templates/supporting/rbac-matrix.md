# RBAC & Permissions Matrix: <Project Name>

> Who can do what to which resource. `data-model.md` has a per-entity
> "Owner (CRUD)" column and PRD §5 has personas; neither is a consolidated
> role × permission matrix. This file is that matrix — the artifact the
> Solution Architect uses to design the auth model and the Code Agents use
> to implement route guards, plus the source `security.md` §IDOR / §RBAC
> checks verify against.

**Project:** <Project Name>
**Last updated:** <Date>
**Owner:** BA Agent
**Reviewer:** Requirements Reviewer
**Read by:** Solution Architect (auth model), Code Agents (route guards), Dev Reviewers (security.md §RBAC check), QA Agent (authz tests)

---

## How to use this matrix

- A **role** is a category of actor (Coach, Client, Admin, Anonymous, System).
  A **persona** (PRD §5) maps to one or more roles.
- A **permission** is `action` on `resource` — e.g., `booking:read`.
- Cells use: **Allow** / **Deny** / **Own** (own record only) / **Group**
  (members of a group the caller belongs to). "Own" is the IDOR boundary —
  it must be enforced server-side, never trusted from the client.
- Default to **Deny**. If a cell is empty, it is Deny, not "unspecified".
- Every **Own** or **Group** cell is a place `security.md` §IDOR requires a
  scoped query (`WHERE owner_id = current_user.id`). The Dev Reviewer checks
  each against code.

---

## Roles & persona mapping

| Role | Maps to persona (PRD §5) | Auth mechanism | Notes |
|------|--------------------------|----------------|-------|
| `anonymous` | (logged-out visitor) | none | public surfaces only |
| `client` | Client Carla | email/password (Auth.js) | books with coaches |
| `coach` | Coach Carmen, Coach Oliver | email/password + Stripe Connect | must be `active` to publish (BR-040) |
| `practice_manager` | Practice Manager Priya (Phase 2) | email/password, org-scoped | Phase 2 — out of MVP |
| `admin` | (Acme staff) | SSO (Okta) per §3b must-use | support + ops; break-glass |
| `system` | (background jobs, webhooks) | service token / webhook signature | not a human role |

---

## Permission matrix

> Rows = resources × actions. Columns = roles. This is the single source
> the route guards are generated from.

| Resource:action | anonymous | client | coach | admin | system |
|-----------------|-----------|--------|-------|-------|--------|
| `coach_profile:read` (public) | Allow | Allow | Allow | Allow | — |
| `coach_profile:write` | Deny | Deny | **Own** | Allow | — |
| `availability:read` | Allow | Allow | Allow | Allow | — |
| `availability:write` | Deny | Deny | **Own** | Allow | — |
| `session_type:read` | Allow | Allow | Allow | Allow | — |
| `session_type:write` | Deny | Deny | **Own** | Allow | — |
| `booking:read` | Deny | **Own** | **Own** (their clients) | Allow | Allow (job) |
| `booking:create` | Deny | Allow (creates own) | Deny | Deny | — |
| `booking:update` (reschedule/cancel) | Deny | **Own** (per BR-011) | **Own** | Allow | Allow (status job) |
| `payment:read` | Deny | **Own** | **Own** | Allow | Allow |
| `payment:refund` | Deny | Deny | Deny (auto per BR-001..003) | Allow | Allow (job) |
| `session_note:read` | Deny | **Group** (if shared) | **Own** | Allow | — |
| `session_note:write` | Deny | Deny | **Own** (per BR-010 lifecycle) | Allow | — |
| `data_export:request` | Deny | **Own** | **Own** | Allow | — |
| `data_erase:request` | Deny | **Own** | **Own** | Allow | — |
| `admin:users:read` | Deny | Deny | Deny | Allow | — |
| `admin:users:write` | Deny | Deny | Deny | Allow | — |

---

## IDOR boundaries (enforce server-side)

> Every `Own` / `Group` cell above. The Code Agent MUST scope these queries;
> the Dev Reviewer checks each one against `security.md` §IDOR.

| Boundary | Scoping rule | Checked against |
|----------|--------------|-----------------|
| `booking:read` for client | `WHERE client_id = current_user.id` | security.md §IDOR |
| `booking:read` for coach | `WHERE coach_id = current_user.id` | security.md §IDOR |
| `booking:update` for client | own booking AND within BR-011 reschedule window | security.md §IDOR + BR-011 |
| `session_note:read` | own booking OR (`visible_to_client` AND client of that booking) | security.md §IDOR |
| `coach_profile:write` | `WHERE id = current_user.id` | security.md §IDOR |

---

## Role escalation & transitions

- A coach who disconnects Stripe → status `pending_payment`; loses
  `availability:write`, `session_type:write`, `booking:create` (BR-040).
- A client who deletes their account → role row removed; bookings retained
  per `data-model.md` retention with tombstone.
- `system` is never a session role; it authenticates via service token /
  webhook signature, never via user session.

---

## Permissions deferred to later phases

| Permission | Phase | Notes |
|------------|-------|-------|
| `practice:read` / `practice:write` | Phase 2 | Priya persona; org-scoped |
| `package:write` / `package_purchase:redeem` | Phase 2 | BR-050 atomic decrement |

---

## Cross-references

- `PRD/<project>/prd.md` §9c — the summary table
- `PRD/<project>/prd.md` §5 — personas → roles mapping
- `PRD/<project>/data-model.md` — per-entity CRUD ownership (this matrix consolidates it)
- `PRD/<project>/business-rules.md` BR-04x — eligibility conditions behind the gating
- `framework/shared/skills/security.md` §IDOR / §RBAC — the implementation checks that verify this matrix
- `PRD/<project>/tech-decision-brief.md` §1.12 — drives the SA's auth model choice

---

*When a route or handler is added, add its permission row here before coding it. A route without a row in this matrix is a security gap the Dev Reviewer will flag. When a role is added (e.g., Phase 2 practice_manager), add the column AND every cell — no empty cells.*