# Data Model Brief: Acme Coaching

**Project:** Acme Coaching
**Last updated:** 2026-09-02
**Owner:** BA Agent (requirements) → Solution Architect (detailed schema)

> High-level entity model that captures the requirements (not the schema)
> for the data the product needs. PRD §9a is the executive table; this
> file is the deep brief the Solution Architect uses to design the
> schema, the Code Agents use to build the data layer, and the QA Agent
> uses to verify data integrity.

---

## Entity overview

| Entity | Purpose | Volume at MVP (rows) | Growth profile | PII classification |
|--------|---------|----------------------|----------------|--------------------|
| `Coach` | A user who sells coaching | 1k active | linear with signups (~50/wk MVP) | Direct PII |
| `Client` | A user who books coaching | 5k active | linear with bookings (~200/wk MVP) | Direct PII |
| `SessionType` | A bookable offering by a coach | 3–5 per coach | low | No PII |
| `AvailabilityBlock` | A weekly recurring availability window | 1–2 per coach | low | No PII |
| `Booking` | A confirmed session between Coach and Client | 100k | linear with bookings | Indirect PII (links to Coach + Client) |
| `SessionNote` | A coach's post-session write-up | 1 per completed booking | linear | Indirect PII |
| `Payment` | A Stripe charge linked to a booking | 100k | linear with bookings | Direct PII (financial) |
| `Package` (Phase 2) | A bundle of N sessions for a discount | 5–10 per coach | low | No PII |
| `PackagePurchase` (Phase 2) | A client buying a package | 500 | linear | Indirect PII |

**PII classification definitions:**
- **Direct PII** — directly identifies a person (name, email, phone, address)
- **Indirect PII** — only identifies a person in combination (booking linked to a user)
- **No PII** — never identifies a person (a session type is just a name + duration + price)

---

## Entity detail

### Coach

**Purpose:** Represents a user who sells coaching sessions.

**Key fields:**
- `id` (UUID) — primary key
- `email` (string, unique, indexed) — login + comms
- `name` (string) — display name
- `bio` (markdown, nullable) — public profile
- `photo_url` (string, nullable) — public profile photo
- `timezone` (IANA string) — for availability interpretation
- `status` (enum: `pending_verification` | `pending_stripe` | `active` | `suspended` | `deleted`)
- `stripe_account_id` (string, nullable) — Stripe Connect account
- `created_at` (timestamp) — for cohort analysis
- `deleted_at` (timestamp, nullable) — soft delete for GDPR right-to-erasure
- `email_verified_at` (timestamp, nullable) — for email auth flow

**PII fields:** `email`, `name`, `bio` (may contain personal anecdotes), `photo_url` (if real photo)

**Retention rules:**
- Active coaches: retained indefinitely while account is active
- After `deleted_at`: 30-day grace period, then hard delete + tombstone in audit log

**CRUD ownership:**
- **Create:** self-registration; admin invite
- **Read:** coach (own record), admin
- **Update:** coach (own non-PII fields), admin (all)
- **Delete:** coach (self), admin, DPO (right-to-erasure)

**Indexes needed:** `email` (unique), `status` (filtering), `created_at` (cohort), `deleted_at` (cleanup)

---

### Client

**Purpose:** Represents a user who books coaching sessions.

**Key fields:**
- `id` (UUID) — primary key
- `email` (string, unique, indexed) — login + comms
- `name` (string) — display name
- `timezone` (IANA string) — for booking display
- `created_at` (timestamp)
- `deleted_at` (timestamp, nullable)
- `email_verified_at` (timestamp, nullable)

**PII fields:** `email`, `name`

**Retention rules:**
- Active clients: retained indefinitely while account is active
- After `deleted_at`: 30-day grace period, then hard delete + tombstone in audit log

**CRUD ownership:**
- **Create:** self-registration at first booking (or pre-emptively to save preferences)
- **Read:** client (own), coach (only for clients who have booked them), admin
- **Update:** client (own), admin
- **Delete:** client (self), admin, DPO

**Indexes needed:** `email` (unique), `created_at`, `deleted_at`

---

### SessionType

**Purpose:** A bookable offering defined by a Coach (e.g., "60-min Life Coaching Session, €120").

**Key fields:**
- `id` (UUID)
- `coach_id` (UUID, FK → Coach) — owner
- `name` (string) — e.g., "60-min Life Coaching"
- `duration_min` (int, one of 15, 30, 60, 90, 120) — to keep UI simple
- `price_cents` (int)
- `currency` (string, ISO 4217; MVP = USD only, see A-007)
- `is_active` (boolean) — soft delete for session types

**PII fields:** none

**Retention rules:** retained until coach deletes or account closure (cascade to `deleted`)

**CRUD ownership:** coach (CRUD on own), admin (R)

**Indexes needed:** `coach_id`, `is_active`

---

### AvailabilityBlock

**Purpose:** A weekly recurring time window when a Coach is open for bookings.

**Key fields:**
- `id` (UUID)
- `coach_id` (UUID, FK → Coach)
- `day_of_week` (int, 0–6 where 0 = Sunday)
- `start_time` (time, in coach's timezone)
- `end_time` (time, in coach's timezone)
- `created_at`, `updated_at`

**PII fields:** none

**Retention rules:** retained until coach deletes

**CRUD ownership:** coach (CRUD on own), admin (R)

**Indexes needed:** `coach_id`, `day_of_week`

**Computed slot generation:** At read time, generate concrete bookable slots by intersecting AvailabilityBlocks with the next 8 weeks, excluding any existing Bookings, and respecting the coach's timezone. This is computed, not stored.

---

### Booking

**Purpose:** A confirmed reservation between a Coach and a Client.

**Key fields:**
- `id` (UUID)
- `coach_id` (UUID, FK → Coach)
- `client_id` (UUID, FK → Client)
- `session_type_id` (UUID, FK → SessionType)
- `slot_start` (timestamp, UTC) — when the session starts
- `slot_end` (timestamp, UTC) — when the session ends
- `status` (enum: `pending` | `confirmed` | `cancelled` | `completed` | `no_show`)
- `video_url` (string, nullable) — Daily.co room link
- `price_cents` (int) — at time of booking (denormalised from SessionType)
- `currency` (string)
- `created_at`, `confirmed_at` (nullable), `cancelled_at` (nullable)
- `cancellation_reason` (string, nullable)

**PII fields:** none direct; the row indirectly identifies both a Coach and a Client

**Retention rules:**
- Bookings retained for 7 years (financial record / tax requirement)
- After 7 years, anonymise: replace `coach_id` and `client_id` with tombstones, keep aggregate fields only (price, currency, status, slot times)

**CRUD ownership:**
- **Create:** client (for self), coach (manual entry on behalf of client), admin
- **Read:** client (own), coach (own bookings), admin
- **Update:** system (status transitions on time/payment triggers), admin
- **Delete:** never (use status + tombstone)

**Indexes needed:** `coach_id`, `client_id`, `session_type_id`, `status`, `slot_start` (for "upcoming" queries), `created_at`

**Status transitions:**
```
pending → confirmed (on payment success)
pending → expired (on 15min payment timeout)
confirmed → completed (after slot_end + 1h, no cancellation)
confirmed → cancelled (on cancel/reschedule)
confirmed → no_show (after slot_end + 15min, no join)
```

**Cancellation refund rules (per Story #9):**
- >24h before: 100% refund
- 12–24h before: 50% refund
- <12h before: 0% refund

---

### SessionNote

**Purpose:** A Coach's markdown write-up after a Session, optionally visible to the Client.

**Key fields:**
- `id` (UUID)
- `booking_id` (UUID, FK → Booking, unique) — one note per booking
- `coach_id` (UUID, FK → Coach) — denormalised for permission checks
- `content_markdown` (text) — the note
- `visible_to_client` (boolean, default false) — coach controls visibility
- `created_at`, `updated_at`

**PII fields:** content may contain client details discussed in session (indirect PII)

**Retention rules:** same as Booking (cascade to tombstone when Booking is anonymised)

**CRUD ownership:**
- **Create:** coach (for own bookings)
- **Read:** coach (own), client (only if `visible_to_client = true`)
- **Update:** coach (own), until 30 days after session (then immutable for audit)
- **Delete:** never (audit requirement)

**Indexes needed:** `booking_id` (unique), `coach_id`

---

### Payment

**Purpose:** A Stripe charge linked to a Booking.

**Key fields:**
- `id` (UUID)
- `booking_id` (UUID, FK → Booking, unique)
- `stripe_payment_intent_id` (string, unique) — for webhook reconciliation
- `stripe_charge_id` (string, nullable) — set after charge succeeds
- `amount_cents` (int)
- `currency` (string)
- `status` (enum: `pending` | `succeeded` | `failed` | `refunded` | `partially_refunded`)
- `refunded_amount_cents` (int, default 0)
- `created_at`, `succeeded_at` (nullable), `refunded_at` (nullable)

**PII fields:** none direct; links to Booking → Client

**Retention rules:** 7 years (financial record)

**CRUD ownership:** system (create on Stripe webhook), admin (read for support)

**Indexes needed:** `booking_id` (unique), `stripe_payment_intent_id` (unique), `status`

**Reconciliation:** Daily cron job verifies all `succeeded` payments have a corresponding Stripe charge (and vice versa) to catch dropped webhooks.

---

### Package (Phase 2)

**Purpose:** A bundle of N sessions sold at a discount.

**Key fields:**
- `id` (UUID)
- `coach_id` (UUID, FK → Coach)
- `name` (string)
- `session_count` (int)
- `price_cents` (int)
- `currency` (string)
- `is_active` (boolean)
- `created_at`, `updated_at`

**PII fields:** none

**Retention rules:** retained until coach deletes

**CRUD ownership:** coach (CRUD on own)

**Indexes needed:** `coach_id`, `is_active`

---

### PackagePurchase (Phase 2)

**Purpose:** A Client's purchase of a Package, with `sessions_remaining` decreasing on each booking.

**Key fields:**
- `id` (UUID)
- `package_id` (UUID, FK → Package)
- `client_id` (UUID, FK → Client)
- `payment_id` (UUID, FK → Payment) — the original package purchase payment
- `sessions_remaining` (int)
- `created_at`, `expires_at` (nullable) — packages may expire

**PII fields:** none direct; links to Client and Payment

**Retention rules:** 7 years (financial record)

**CRUD ownership:**
- **Create:** system (on package purchase payment success)
- **Read:** client (own), coach (purchases of their packages), admin
- **Update:** system (decrement `sessions_remaining` on booking)
- **Delete:** never

**Indexes needed:** `package_id`, `client_id`

---

## Relationships

```
Coach 1───N SessionType
Coach 1───N AvailabilityBlock
Coach 1───N Booking
Client 1───N Booking
SessionType 1───N Booking
Booking 1───1 SessionNote
Booking 1───1 Payment
Coach 1───N Package
Package 1───N PackagePurchase
Client 1───N PackagePurchase
```

**Cardinality rationale:**
- A Coach can have many SessionTypes and many AvailabilityBlocks (the actual booking slots are computed at read time)
- A Client can have many Bookings (over their lifetime with the platform)
- Each Booking has at most one SessionNote and one Payment (1:1)

**Cascade behaviour on Coach deletion:**
- Soft-delete Coach → soft-cancel all future Bookings (status → `cancelled`, reason "coach deleted") → Bookings retained 7 years for financial record but with `coach_id` replaced by tombstone
- After 30 days: hard delete Coach + tombstone in audit log
- AvailabilityBlocks and SessionTypes: hard delete with the coach
- SessionNotes: cascade to "no coach" with tombstone

**Cascade behaviour on Client deletion:**
- Soft-delete Client → soft-cancel all future Bookings → Bookings retained 7 years but with `client_id` replaced by tombstone
- After 30 days: hard delete + tombstone
- PackagePurchases: cascade to "no client" with tombstone

---

## PII handling summary

| Field | Entity | Encrypted at rest? | Logged? | Returned in API by default? |
|-------|--------|--------------------|---------|------------------------------|
| `email` | Coach, Client | Yes (column-level) | No (only `user_id`) | No (explicit allow-list required) |
| `name` | Coach, Client | Yes | No | Only when caller is the user themselves |
| `bio` | Coach | Yes (may contain personal details) | No | Yes (it's public) |
| `photo_url` | Coach | N/A (URL only) | No | Yes (it's public) |
| `content_markdown` | SessionNote | Yes (indirect PII) | No | Only if `visible_to_client = true` and caller is the client, or always if caller is the coach |

**Encryption:**
- Column-level encryption for all PII columns (`email`, `name`, `bio`, `content_markdown`)
- Key rotation annually
- Keys stored in KMS, not in application config

**API responses:**
- API responses use explicit field allow-lists per role
- `*` (return everything) is forbidden by lint rule
- PII fields require the caller to be authorised for the specific record (e.g., Coach can only read Client details for clients who have an active or past booking with them)

---

## Deletion & GDPR flows

**Right to erasure (Article 17):**
1. User (Coach or Client) requests deletion via /settings/delete or via DPO email
2. DPO verifies identity (24h SLA)
3. User row soft-deleted (`deleted_at` set)
4. Cascade:
   - Coach deletion → future Bookings soft-cancelled with reason "coach deleted"
   - Client deletion → future Bookings soft-cancelled with reason "client deleted"
5. After 30 days: hard delete User + tombstone in audit log
6. Anonymised aggregate data (counts, revenue per coach) preserved

**Data export (Article 20):**
1. User requests export via /settings/export
2. System generates JSON + CSV bundle within 24h
3. Bundle delivered via signed download link (24h expiry)
4. Bundle includes: account data, all bookings, all session notes (coach only), all payments

**Data portability for cancelled accounts:** export is available for 30 days after `deleted_at`, then only tombstone remains.

---

## Cross-references

- PRD §9a — the executive entity table
- `tech-decision-brief.md` — SA's choice of DB engine and ORM
- `nfr-catalog.md` — performance and scalability targets
- `assumptions.md` — assumptions about data volumes, retention, and access patterns

---

*This is a requirements document, not a schema. The Solution Architect translates this into the actual table/collection schema in their `tech-decision-brief.md` Part 2.4.*
