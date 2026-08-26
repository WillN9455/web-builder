# Data Model Brief: <Project Name>

> High-level entity model that captures the requirements (not the schema)
> for the data the product needs. PRD §9a is the executive table; this
> file is the deep brief the Solution Architect uses to design the
> schema, the Code Agents use to build the data layer, and the QA Agent
> uses to verify data integrity.

**Project:** <Project Name>
**Last updated:** <Date>
**Owner:** BA Agent (requirements) → Solution Architect (detailed schema)

---

## Entity overview

| Entity | Purpose | Volume at MVP (rows) | Growth profile | PII classification |
|--------|---------|----------------------|----------------|--------------------|
| <e.g., User> | <purpose> | <e.g., 10k> | <e.g., linear with signups> | <Direct PII / Indirect PII / No PII> |
| <e.g., Booking> | <purpose> | <e.g., 100k> | <e.g., linear with bookings> | <...> |
| <e.g., Provider> | <purpose> | <e.g., 500> | <e.g., low, manual onboarding> | <...> |
| <e.g., Slot> | <purpose> | <e.g., 50k active> | <e.g., daily churn of expired slots> | <No PII> |
| <e.g., Payment> | <purpose> | <e.g., 100k> | <e.g., linear with bookings> | <Direct PII (financial)> |

**PII classification definitions:**
- **Direct PII** — directly identifies a person (name, email, phone, address)
- **Indirect PII** — only identifies a person in combination (booking linked to a user)
- **No PII** — never identifies a person (a slot is just a time)

---

## Entity detail

### User

**Purpose:** Represents a person who can sign in and book.

**Key fields:**
- `id` (UUID) — primary key
- `email` (string, unique, indexed) — login + comms
- `name` (string) — display name
- `created_at` (timestamp) — for cohort analysis
- `deleted_at` (timestamp, nullable) — soft delete for GDPR right-to-erasure
- `email_verified_at` (timestamp, nullable) — for email auth flow

**PII fields:** `email`, `name`

**Retention rules:**
- Active users: retained indefinitely while account is active
- After `deleted_at`: 30-day grace period, then hard delete + tombstone in audit log

**CRUD ownership:**
- **Create:** self-registration; admin invite
- **Read:** user (own record), admin
- **Update:** user (own non-PII fields), admin (all)
- **Delete:** user (self), admin, GDPR processor (right-to-erasure)

**Indexes needed:** `email` (unique), `created_at` (cohort queries), `deleted_at` (cleanup job)

---

### Booking

**Purpose:** A confirmed reservation between a User and a Slot.

**Key fields:**
- `id` (UUID) — primary key
- `user_id` (UUID, FK → User) — who booked
- `slot_id` (UUID, FK → Slot) — what was booked
- `status` (enum: `pending` | `confirmed` | `cancelled` | `completed` | `no_show`) — lifecycle
- `created_at` (timestamp) — booking time
- `confirmed_at` (timestamp, nullable)
- `cancelled_at` (timestamp, nullable)
- `cancellation_reason` (string, nullable)

**PII fields:** none direct, but the row indirectly identifies a User

**Retention rules:**
- Bookings retained for 7 years (financial / tax record requirement)
- After 7 years, anonymise: replace `user_id` with tombstone, keep aggregate fields only

**CRUD ownership:**
- **Create:** User (for self), admin
- **Read:** User (own bookings), Provider (bookings for their slots), admin
- **Update:** System (status transitions), admin
- **Delete:** never (use status + tombstone)

**Indexes needed:** `user_id`, `slot_id`, `status`, `created_at` (for reporting)

**Status transitions:**
```
pending → confirmed
pending → cancelled
confirmed → completed
confirmed → cancelled
confirmed → no_show
```

---

(... continue for every entity ...)

---

## Relationships

```
User 1───N Booking
Booking N───1 Slot
Slot N───1 Provider
User N───N Provider (via "favourite" — optional)
```

**Cardinality rationale:** <why these cardinalities>

**Cascade behaviour on User deletion:** soft-delete user → soft-cascade to bookings (status → `cancelled` with reason "user deleted") → after grace period, hard delete with audit log.

---

## PII handling summary

| Field | Entity | Encrypted at rest? | Logged? | Returned in API by default? |
|-------|--------|--------------------|---------|------------------------------|
| `email` | User | Yes (column-level) | No (only `user_id`) | No (explicit allow-list required) |
| `name` | User | Yes | No | Only when caller is the user themselves |
| `phone` | User (if collected) | Yes | No | No |

**Encryption:**
- Column-level encryption for all PII columns
- Key rotation annually
- Keys stored in KMS, not in application config

**API responses:**
- API responses use explicit field allow-lists per role
- `*` (return everything) is forbidden by lint rule
- PII fields require the caller to be authorised for the specific record

---

## Deletion & GDPR flows

**Right to erasure (Article 17):**
1. User requests deletion via settings or via DPO email
2. DPO verifies identity (24h SLA)
3. User row soft-deleted (`deleted_at` set)
4. Cascade: bookings soft-cancelled with reason "user deleted"
5. After 30 days: hard delete User + tombstone in audit log
6. Anonymised aggregate data (counts, revenue) preserved

**Data export (Article 20):**
1. User requests export via settings
2. System generates JSON + CSV bundle within 7 days
3. Bundle delivered via signed download link (24h expiry)

**Data portability for cancelled accounts:** export is available for 30 days after `deleted_at`, then only tombstone remains.

---

## Cross-references

- PRD §9a — the executive entity table
- `tech-decision-brief.md` — SA's choice of DB engine and ORM, which the schema must fit
- `nfr-catalog.md` — performance and scalability targets (query latency, row counts)
- `assumptions.md` — assumptions about data volumes, retention, and access patterns

---

*This is a requirements document, not a schema. The Solution Architect translates this into the actual table/collection schema in their `tech-decision-brief.md` (and, if the project warrants it, a separate schema migration plan).*
