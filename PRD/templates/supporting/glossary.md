# Glossary & Domain Terms: <Project Name>

> Canonical definitions for every domain term used in the PRD, design
> specs, and code. PRD §11a is the summary table; this file is the
> extended glossary with examples, aliases, and counter-examples. Every
> agent reads this before starting work so a term is never interpreted
> two different ways.

**Project:** <Project Name>
**Last updated:** <Date>
**Owner:** BA Agent

---

## How to use this glossary

For each term, capture:
- **Term** — the canonical name (use this exact name in all artifacts)
- **Definition** — what it means, in one sentence
- **Aliases** — other names used informally (mark deprecated aliases with ~~strikethrough~~)
- **Examples** — concrete cases that are clearly inside the definition
- **Counter-examples** — concrete cases that are clearly outside the definition
- **Owner** — who has final say on the definition if there is ambiguity

---

## Glossary

### A

#### Activation
- **Definition:** A User has signed up AND completed at least one Booking
  (or whatever the project's first-value moment is).
- **Aliases:** ~~first-value event~~ (deprecated; "activation" is the
  product-analytics industry standard)
- **Examples:** User signs up via email and books a slot within the same
  session — counts. User signs up but bookmarks without booking — does
  not count.
- **Counter-examples:** User who books without signing up (guest
  booking, if supported) — does not count toward activation.
- **Owner:** Product Owner

### B

#### Booking
- **Definition:** A confirmed reservation between a User and a Slot that
  has been accepted by the Provider (status = `confirmed`).
- **Aliases:** Reservation, Appointment
- **Examples:** User books a 10:00 slot with Provider X, Provider X
  confirms → Booking.
- **Counter-examples:** A `pending` request that the Provider has not
  yet accepted is NOT a Booking (it is a Booking Request).
- **Owner:** Product Owner

#### Booking Request
- **Definition:** A pending reservation that has not yet been accepted
  by the Provider.
- **Status flow:** Booking Request → (accept) → Booking, OR
  Booking Request → (decline / expire) → Cancelled.
- **Owner:** Product Owner

(... continue for every term used in the PRD, design specs, or code ...)

### C

### D

### ...

---

## Acronyms

| Acronym | Expansion | Notes |
|---------|-----------|-------|
| RACI | Responsible, Accountable, Consulted, Informed | See `stakeholder-map.md` |
| NFR | Non-Functional Requirement | See `nfr-catalog.md` |
| MVP | Minimum Viable Product | The smallest release that delivers value |
| KPI | Key Performance Indicator | See PRD §6a |

---

## Deprecated / forbidden terms

> Terms that have been used in the past but must NOT be used in new
> artifacts because they cause ambiguity. If a new contributor uses one,
> gently correct them and add a note here.

| Forbidden term | Use instead | Reason |
|----------------|-------------|--------|
| ~~Customer~~ | `User` (for end users), `Buyer` (for paying accounts) | "Customer" overloaded between sales/support/eng |
| ~~Reservation~~ | `Booking` | Aligns with provider-side terminology |
| ~~Live~~ | `Active` (for accounts), `Running` (for processes) | "Live" overloaded |

---

*When a new term appears in the PRD, design spec, or code, add it here. When a term's meaning changes, update the definition AND mark the old meaning as deprecated rather than rewriting silently — the changelog lives in git.*
