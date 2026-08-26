# Glossary & Domain Terms: Acme Coaching

**Project:** Acme Coaching
**Last updated:** 2026-09-02
**Owner:** BA Agent

---

## How to use this glossary

For each term, capture:
- **Term** — the canonical name (use this exact name in all artifacts)
- **Definition** — what it means, in one sentence
- **Aliases** — other names used informally
- **Examples** — concrete cases that are clearly inside the definition
- **Counter-examples** — concrete cases that are clearly outside the definition
- **Owner** — who has final say on the definition if there is ambiguity

---

## Glossary

### A

#### Activation (Coach)
- **Definition:** A Coach has signed up AND has at least one confirmed Booking.
- **Aliases:** first-value event
- **Examples:** Coach signs up, sets availability, receives first booking → counts.
- **Counter-examples:** Coach signs up but never sets availability → does not count.
- **Owner:** Carmen

#### Activation (Client)
- **Definition:** A Client has signed up AND completed at least one Session.
- **Examples:** Client books a session and joins the video call → counts.
- **Counter-examples:** Client books but cancels before the session → does not count toward activation (counts toward booking, not session completion).
- **Owner:** Carmen

#### Availability Block
- **Definition:** A weekly recurring window when a Coach is open for bookings.
- **Aliases:** availability slot, open hours
- **Examples:** "Monday 9am–12pm" → a single block; "Tuesday 2pm–5pm" → another block.
- **Counter-examples:** A specific date override (e.g., "next Tuesday I'm off") is NOT an availability block — it's an unavailability exception.
- **Owner:** Sam (technical), Carmen (business)

### B

#### Booking
- **Definition:** A confirmed reservation between a Coach and a Client that has been paid for via Stripe and accepted by the Coach.
- **Aliases:** Reservation, Appointment
- **Status flow:** Booking Request → (payment + acceptance) → Booking → (session completes) → Completed, OR Booking → (cancel) → Cancelled.
- **Examples:** Client books a 10:00 session and pays → Booking.
- **Counter-examples:** A `pending` request that has not been paid is NOT a Booking (it is a Booking Request).
- **Owner:** Carmen

#### Booking Request
- **Definition:** A pending reservation that has been initiated but not yet paid.
- **Status flow:** Booking Request → (payment succeeds) → Booking, OR Booking Request → (15 min timeout) → Expired.
- **Owner:** Carmen

### C

#### Client
- **Definition:** A person who books and pays for sessions with a Coach.
- **Aliases:** Customer
- **Counter-examples:** The Coach themselves are not their own Client, even if they use Acme Coaching to manage their own sessions.
- **Owner:** Carmen

#### Coach
- **Definition:** An independent practitioner who sells coaching sessions via Acme Coaching.
- **Aliases:** Provider
- **Examples:** Life coach, executive coach, fitness coach, career coach.
- **Counter-examples:** A therapist is NOT a Coach in our taxonomy (different regulatory regime, deferred from MVP).
- **Owner:** Carmen

#### Confirmation Email
- **Definition:** The email sent to both Coach and Client immediately after a Booking is confirmed, containing the session time, video link, calendar invite, and reschedule/cancel instructions.
- **Owner:** Maya

### D

#### Daily.co Room
- **Definition:** A private video room created via Daily.co's API for a single Session, accessible only to the Coach and Client, with the room token expiring 15 minutes after the scheduled session end.
- **Owner:** Sam

### N

#### No-show
- **Definition:** A Client who did not join a Session within 15 minutes of the start time, AND who did not cancel or reschedule before the start time.
- **Counter-examples:** A Client who cancelled 5 minutes before is NOT a no-show (they cancelled).
- **Owner:** Carmen

#### Notification
- **Definition:** A system-generated message sent to a user (Coach or Client) for any reason other than session-confirmation/booking updates (which are Confirmation Emails).
- **Examples:** Daily summary email, GDPR export ready email, payment failed email.
- **Owner:** Maya

### P

#### Package (Phase 2)
- **Definition:** A bundle of N sessions sold by a Coach at a discount (e.g., 6 sessions for the price of 5). A Client who purchases a Package redeems sessions from it; sessions remaining decreases on each booking.
- **Owner:** Carmen

#### Practice Manager (Phase 2)
- **Definition:** A user role that can view all Coaches' calendars and revenue in a small coaching practice (3–5 coaches).
- **Owner:** Carmen

### R

#### Reschedule
- **Definition:** A change of a Booking's time, initiated by the Client, with the original Booking cancelled and a new Booking created at the new time. Allowed up to 12 hours before the original session start.
- **Counter-examples:** A cancel-then-rebook by the same Client within 1 minute is NOT a Reschedule — it's a Cancel + New Booking. The system does not detect this as equivalent to a Reschedule; clients are told "cancel and rebook".
- **Owner:** Carmen

### S

#### Session
- **Definition:** A single 1:1 video call between a Coach and a Client, scheduled and paid for via Acme Coaching.
- **Counter-examples:** A no-show (where no call happened) is NOT a Session.
- **Owner:** Carmen

#### Session Note
- **Definition:** A Coach's markdown write-up after a Session, optionally visible to the Client. Created via Story #10.
- **Owner:** Carmen

#### Session Type
- **Definition:** A bookable offering defined by a Coach (name, duration, price). E.g., "60-min Life Coaching Session, €120".
- **Aliases:** Service
- **Owner:** Carmen

### T

#### Timezone
- **Definition:** The IANA timezone identifier (e.g., `Europe/London`) in which a user operates. All times are stored in UTC and displayed in the viewer's local timezone; a Coach's Availability Blocks are interpreted in the Coach's timezone.
- **Owner:** Sam

---

## Acronyms

| Acronym | Expansion | Notes |
|---------|-----------|-------|
| RACI | Responsible, Accountable, Consulted, Informed | See `stakeholder-map.md` |
| NFR | Non-Functional Requirement | See `nfr-catalog.md` |
| MVP | Minimum Viable Product | The smallest release that delivers value |
| KPI | Key Performance Indicator | See PRD §6a |
| GDPR | General Data Protection Regulation | EU data protection law |
| DPIA | Data Protection Impact Assessment | Required for high-risk processing under GDPR |
| SLA | Service Level Agreement | Provider's uptime commitment (e.g., Daily.co 99.9%) |
| RPO | Recovery Point Objective | Max acceptable data loss in disaster |
| RTO | Recovery Time Objective | Max acceptable downtime in disaster |
| DPO | Data Protection Officer | Person responsible for GDPR compliance |

---

## Deprecated / forbidden terms

| Forbidden term | Use instead | Reason |
|----------------|-------------|--------|
| ~~Customer~~ | `Coach` or `Client` (depending on role) | "Customer" overloaded between sales/support/eng |
| ~~Reservation~~ | `Booking` | Aligns with provider-side terminology |
| ~~Appointment~~ | `Session` (after it happens) or `Booking` (before) | "Appointment" has medical connotations |
| ~~Patient~~ | `Client` | We are not a medical product |
| ~~Live~~ | `Active` (for accounts), `Running` (for processes) | "Live" overloaded |

---

*When a new term appears in the PRD, design spec, or code, add it here. When a term's meaning changes, update the definition AND mark the old meaning as deprecated rather than rewriting silently — the changelog lives in git.*
