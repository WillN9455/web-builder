# PII Data-Flow & Trust Boundaries: <Project Name>

> Where personal data moves, and where it crosses a trust boundary. PRD §9a
> and `data-model.md` classify PII *at rest*; this file maps PII *in motion*
> — client → app → DB → third parties — so the Solution Architect can place
> trust boundaries, encryption-in-transit, PCI scope, and residency
> controls before designing the architecture. The SA's runtime diagram
> (Part 2.3) shows components; this file shows the data that crosses them.

**Project:** <Project Name>
**Last updated:** <Date>
**Owner:** BA Agent
**Reviewer:** Requirements Reviewer
**Read by:** Solution Architect (trust boundaries, PCI scope, residency), Dev Reviewers (security.md §in-transit), QA Agent (data-flow tests), Compliance (sign-off)

---

## How to use this map

- A **flow** is data moving from a source to a destination.
- A **trust boundary** is any line where data leaves a zone you control
  (browser → public internet → your API; your API → a third party; your
  service → a background job). Every boundary needs an explicit control.
- For each flow carrying PII, state: what fields, encryption in transit,
  where it's stored, how long, and who can see it on the far side.
- **PCI scope:** card data must NEVER touch your servers. If a flow carries
  raw PAN/CVC, that is a defect, not a design — redirect it to the payment
  provider's hosted form / Stripe Elements.

---

## 1. Trust zones

| Zone | What lives here | Who controls it | Residency |
|------|-----------------|-----------------|-----------|
| `browser` | User input, session token, cached UI | End user | n/a |
| `edge` | CDN cache (public, non-PII) | Hosting provider | <EU per DR-001> |
| `app` | Application code, request handling | Us | <EU> |
| `db` | All persisted entities | Us | <EU> |
| `queue` | Background job payloads | Us | <EU> |
| `third-party:stripe` | Payment intents, payouts | Stripe | <Stripe EU> |
| `third-party:postmark` | Transactional emails | Postmark | <EU> |
| `third-party:dailyco` | Video rooms, participant emails | Daily.co | <verify — OQ-008> |
| `third-party:storage` | Profile photos, exports | R2/S3 | <EU region> |

---

## 2. PII flows (field-level)

> One row per flow. "PII fields" must list every field that crosses the
> boundary — not "user data", the actual columns from `data-model.md`.

| # | Flow (from → to) | PII fields | In-transit encryption | Boundary control | Stored far side? |
|---|------------------|-----------|------------------------|------------------|------------------|
| F-1 | browser → app (signup/login) | email, password | TLS 1.2+ (SEC-002) | rate-limit (SEC-007); validate input | no (app only) |
| F-2 | app → db (write user) | email, name | TLS (private link) | column-level encryption at rest (SEC-001) | yes (db) |
| F-3 | app → stripe (create payment intent) | email, amount, currency | TLS + Stripe SDK | Stripe Elements handles card data — raw PAN never reaches app | Stripe (PCI scope ends at Stripe) |
| F-4 | stripe → app (webhook) | payment_intent_id, amount | TLS + signature verify | idempotent; verify signing secret | no (process + write db) |
| F-5 | app → postmark (send confirmation) | email, name, booking time | TLS + server token | queue (not inline); DLQ on failure | Postmark (transient) |
| F-6 | app → dailyco (create room) | coach email, client email, session time | TLS + API key | minimise — send IDs not names if possible | Daily.co (session-scoped) |
| F-7 | app → storage (profile photo upload) | photo (biometric? face = PII) | presigned URL, TLS | direct browser→storage; app never proxies file | yes (storage, 30d?) |
| F-8 | app → queue (reminder/export job) | email, booking details | in-process / TLS | queue payload = ids, not full PII where possible | transient |
| F-9 | app → user (data export, GDPR Art 20) | all user PII | signed URL, TLS | 24h expiry; one-time link | download only |

---

## 3. PCI DSS scope boundary

> The SA must keep card data out of our systems. State the boundary
> explicitly so the Dev Reviewer can verify no raw card data is logged,
> stored, or proxied.

- **Card data enters:** Stripe Elements / Stripe Checkout (hosted by Stripe) — **never** our form
- **What our servers receive:** a Stripe `payment_intent_id` / token — **not** PAN/CVC
- **What we store:** `stripe_payment_intent_id`, `amount_cents`, `status` — **no** card numbers, **no** CVC, last4 only if returned by Stripe
- **What we log:** never the request body of a payment call; log `payment_intent_id` + status only
- **PCI scope:** our app is **out of PCI-DSS card-data scope** (SA- A scope); Stripe is SA-D. If a flow ever carries raw PAN, it is a P0 defect.

---

## 4. GDPR / residency flows

> Maps to `nfr-catalog.md` DR-001 (EU-only) and SEC-004 (right-to-erasure).

- **EU users:** all flows stay within EU zones (app, db, queue in EU; Stripe/Postmark/Daily.co EU endpoints) — see §1 residency column
- **Cross-border risk:** <e.g., "Daily.co data residency unverified — OQ-008; if non-EU, restrict or mask PII sent to it">
- **Right-to-erasure flow (Art 17):** delete from db (per `data-model.md`) → request deletion from third parties (Stripe customer record, Postmark is transient, Daily.co session-scoped auto-purged) → log tombstone
- **Data export flow (Art 20):** F-9 above; bundle from db only, sign link, 24h expiry

---

## 5. Logging & observability of PII

> Observability NFRs (OBS-*) want structured logs; this section stops PII
> leaking into them.

- **Never logged:** email, name, phone, card data, full addresses, session note content
- **Logged as identifiers only:** `user_id`, `booking_id`, `payment_intent_id`, `request_id`
- **Log sampling:** error bodies scrubbed of PII before emission
- **Log retention:** <e.g., 30 days hot, 90 days cold> — shorter than user data retention

---

## 6. Open data-flow questions

> Filed in `open-questions.md` with `blocker-for: tech` or `blocker-for: integration`.

| OQ-ID | Question | Blocks |
|-------|----------|-------|
| OQ-008 | Daily.co data residency for EU compliance | DR-001, F-6 |
| OQ-### | Profile photo retention period | F-7, SEC-004 |

---

## Cross-references

- `PRD/<project>/prd.md` §9d — the summary table
- `PRD/<project>/data-model.md` — PII classification at rest (this file is in motion)
- `PRD/<project>/nfr-catalog.md` SEC-001..008, DR-001..002 — the controls each boundary must meet
- `PRD/<project>/rbac-matrix.md` — who can initiate each flow (authz)
- `skills/security.md` — in-transit encryption, IDOR, secrets
- `PRD/<project>/tech-decision-brief.md` §1.14 — SA places boundaries + PCI scope from this map; Part 2.3 architecture diagram reflects it

---

*When a new third party is added (new integration in §9b / brief §1.4), add its flows here before coding against it. A flow not listed here is a compliance gap. When a residency requirement changes, re-audit every row's residency column.*