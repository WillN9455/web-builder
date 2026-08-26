# Traffic & Access-Pattern Profile: <Project Name>

> The shape of load the product must serve, not just the volume. PRD §3a
> and `nfr-catalog.md` give the headline targets (concurrent users, MAU,
> row counts); this file gives the *distribution* the Solution Architect
> needs to size caching, database, queues, and hosting tiers. Without it
> the SA can hit the NFR averages while failing the peaks.

**Project:** <Project Name>
**Last updated:** <Date>
**Owner:** BA Agent
**Reviewer:** Requirements Reviewer
**Read by:** Solution Architect (sizing), Dev Reviewers, QA Agent (load-test plan)

---

## How to use this profile

Fill every row with a number or an explicit estimate band ("~", "low/med/high
band — verify pre-launch"). An empty row is not "not applicable" — it is a gap.
If a dimension genuinely does not apply, write `N/A` with a one-line reason.

Numbers do not need to be precise at requirements time; they need to be
**defensible**. Cite the source for each (analytics, comparable product, user
research, or `believed` per `assumptions.md`).

---

## 1. Load shape

| Dimension | Value (MVP) | Value (12 months) | Source / assumption |
|-----------|-------------|-------------------|---------------------|
| Peak : average request ratio | <e.g., 5:1 (peak during weekday 9–11am)> | <e.g., 3:1 as volume smooths> | <analytics / believed A-###> |
| Peak : average user ratio | <e.g., 4:1> | <...> | <...> |
| Daily active : monthly active (DAU/MAU) | <e.g., 0.20> | <...> | <...> |
| Session duration (median) | <e.g., 4 min> | <...> | <RUM / believed> |
| Requests per session (median) | <e.g., 12> | <...> | <...> |
| Burst profile | <e.g., appointment reminders sent in a 15-min window each hour> | <...> | <...> |

---

## 2. Read / write ratio

> Drives cache strategy and read-replica / primary sizing. "Write" = any
> state-changing request (POST/PUT/PATCH/DELETE, not just DB writes).

| Surface | Read : write ratio | Hot path? | Notes |
|---------|--------------------|-----------|-------|
| <e.g., Public coach profile (`/c/<slug>`)> | <e.g., 100:1> | <Yes — cache> | <logged-out traffic; CDN-able> |
| <e.g., Booking flow> | <e.g., 10:1> | <No — primary> | <writes are payments + bookings> |
| <e.g., Coach dashboard> | <e.g., 20:1> | <Yes for reads> | <per-coach; cache by coach id> |
| <e.g., Availability grid> | <e.g., 50:1> | <Yes> | <changes infrequently; invalidate on save> |

**Net read : write ratio across the app:** <e.g., ~30:1 — read-heavy; cache +
read-replica candidate from MVP>

---

## 3. Hot endpoints & request-rate distribution

> The 20% of endpoints that carry 80% of traffic. The SA sizes these
> specifically; the rest can share default capacity.

| Endpoint / surface | Share of traffic | Peak RPS | Notes |
|--------------------|-------------------|----------|-------|
| <e.g., `GET /c/<slug>` coach profile> | <e.g., 45%> | <e.g., 50> | <public; CDN at edge> |
| <e.g., `GET /api/availability`> | <e.g., 20%> | <e.g., 25> | <cache per coach, 60s TTL> |
| <e.g., `POST /api/bookings`> | <e.g., 5%> | <e.g., 8> | <write path; payment-coupled> |
| <...> | ... | ... | ... |

**Long-tail note:** <e.g., "remaining ~30% spread across 40 admin/setting
endpoints, each <1% — do not pre-optimize">

---

## 4. Geographic distribution

> Drives region selection, CDN PoP, and data-residency scope (ties to
> `nfr-catalog.md` DR-*).

| Region | Share of users at launch | Share at 12 months | Latency target |
|--------|--------------------------|--------------------|----------------|
| <e.g., EU (primary)> | <e.g., 90%> | <e.g., 70%> | <p95 < 300ms from EU edge> |
| <e.g., UK> | <e.g., 60%> | <e.g., 40%> | <included in EU> |
| <e.g., US> | <e.g., 5%> | <e.g., 20%> | <p95 < 500ms; Phase 3 region> |

**Single-region vs multi-region at MVP:** <e.g., "single EU region; US served
from EU edge with acceptable latency; multi-region is Phase 3 (NFR P-006)">

---

## 5. Batch vs realtime & background load

> Load that does not come from users but still consumes capacity — scheduled
> jobs, webhooks, retries, exports.

| Job | Trigger | Frequency | Peak concurrency | Notes |
|-----|---------|-----------|------------------|-------|
| <e.g., Reminder emails (T-24h, T-1h)> | Cron | Hourly | <e.g., 200 sends/batch> | <bursts; queue, do not inline> |
| <e.g., Daily summary email> | Cron | Daily 8pm | <e.g., 1 send/coach> | <off-peak> |
| <e.g., Stripe webhook handling> | Inbound | Event-driven | <e.g., burst on refund batch> | <idempotent; DLQ> |
| <e.g., GDPR export> | User request | On demand | <e.g., rare; 1/day> | <heavy; background job, 24h SLA> |
| <e.g., Reconciliation job> | Cron | Weekly | <e.g., 1> | <off-hours> |

---

## 6. Data-access patterns (joins with `data-model.md`)

> How each entity is typically queried. The SA uses this to design indexes
> and detect hot rows. One row per entity.

| Entity | Primary access path | Secondary access paths | Growth concern |
|--------|---------------------|-------------------------|----------------|
| <e.g., Coach> | by `slug` (public profile) | by `id` (auth), by `email` (login) | low row count |
| <e.g., Booking> | by `coach_id` + `status` (dashboard) | by `client_id`, by `slot_start` | high; 7-yr retention → index depth |
| <e.g., Payment> | by `booking_id` | by `stripe_payment_intent_id` | high; financial audit |
| <...> | ... | ... | ... |

---

## 7. Assumptions underpinning this profile

> Every number above is an estimate. List the load-bearing assumptions here so
> they are reviewed and can be validated. Cross-link to `assumptions.md`.

| Assumption | If wrong, the SA must... | A-ID |
|------------|--------------------------|------|
| <e.g., "Peak traffic is weekday-morning-bounded, not viral"> | <add autoscaling + queue headroom; revisit caching> | A-### |
| <e.g., "Booking writes are <10 RPS at MVP"> | <upgrade primary DB tier earlier; add write queue> | A-### |

---

## Cross-references

- `PRD/<project>/prd.md` §3a — the NFR targets this profile must satisfy
- `PRD/<project>/nfr-catalog.md` S-001, S-002, P-001..P-005 — the testable limits
- `PRD/<project>/data-model.md` §6 — entity access patterns mirror the data model
- `PRD/<project>/assumptions.md` — load-bearing estimates behind the numbers
- `PRD/<project>/tech-decision-brief.md` §1.10 — the SA's executive view of this file

---

*This profile is reviewed at the SA handoff and re-baselined at the post-launch review (PRD §10 M6) using real RUM. If a number here is `believed` at handoff, the SA sizes for the upper band and notes the risk in `risks.md`.*