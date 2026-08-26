# Run-Rate Cost Model: <Project Name>

> What the product costs to run per month, broken down so the Solution
> Architect can trade off choices without blowing the budget. PRD §3 gives
> one budget number; this file breaks it into infra, storage, egress, and
> — critically — third-party per-transaction fees (Stripe %, Postmark
> per-email, Daily.co per-minute) that can exceed infra cost and are
> invisible if not modelled.

**Project:** <Project Name>
**Last updated:** <Date>
**Owner:** BA Agent
**Reviewer:** Requirements Reviewer
**Read by:** Solution Architect (trade-off decisions), Orchestrator (budget gate)

---

## How to use this model

- Fill every line with a monthly figure at MVP and at 12 months.
- Numbers are estimates; mark the source (`vendor pricing page`, `believed`,
  `comparable product`). Cite the date prices were checked.
- **Two columns that must both fit under the PRD §3 budget cap:** infra/run-rate
  AND per-transaction. A product can be "under budget" on infra and still lose
  money per booking.
- Optimistic / pessimistic bands are expected — list the assumption that
  drives each.

---

## 1. Budget cap (from PRD §3)

| Window | Cap | Source |
|--------|-----|--------|
| MVP (per month) | <e.g., €500/mo> | PRD §3 |
| 12 months (per month) | <e.g., €2,000/mo> | PRD §3 |
| Per-transaction margin floor | <e.g., must net > €0 after fees on a €60 booking> | <product decision> |

---

## 2. Infra / run-rate (fixed-ish, scales with usage)

| Line item | MVP (€/mo) | 12 months (€/mo) | Driver | Source / assumption |
|-----------|------------|------------------|--------|---------------------|
| App hosting | <e.g., 20> | <e.g., 100> | <Vercel Pro + function executions> | <vendor pricing, Aug 2026> |
| Database (managed) | <e.g., 35> | <e.g., 175> | <rows + compute; see traffic-profile §1> | <vendor pricing> |
| Cache (managed Redis) | <e.g., 15> | <e.g., 60> | <read:write ratio traffic-profile §2> | <vendor pricing> |
| Object storage (R2/S3) | <e.g., 5> | <e.g., 40> | <profile photos + exports> | <vendor pricing> |
| Egress / CDN | <e.g., 10> | <e.g., 80> | <public profile traffic; traffic-profile §3> | <vendor pricing> |
| Observability (logs/metrics) | <e.g., 0–26> | <e.g., 50> | <NFR OBS-001..004> | <vendor free tier + paid> |
| Email (transactional) | <e.g., 15> | <e.g., 120> | <emails sent; see §3 below> | <vendor pricing> |
| Domain / DNS / misc | <e.g., 5> | <e.g., 10> | — | <fixed> |
| **Infra subtotal** | **<sum>** | **<sum>** | | |

---

## 3. Third-party per-transaction fees (variable, scale with revenue)

> These are the fees the SA's vendor choices directly control. Model the
> worst realistic case (small-ticket, high-volume), not the average.

| Service | Fee model | Cost per €60 booking | Source |
|---------|-----------|----------------------|--------|
| Stripe (payments) | <e.g., 1.5% + €0.20> | <e.g., €1.10> | <stripe.com pricing, Aug 2026> |
| Stripe Connect (payouts) | <e.g., 0.25% + €0.10 / payout> | <e.g., €0.25> | <vendor> |
| Postmark (email) | <e.g., €0.0012/email; ~4 emails/booking> | <e.g., €0.005> | <vendor> |
| Daily.co (video) | <e.g., €0.004/min × 60 min> | <e.g., €0.24> | <vendor> |
| **Per-booking fee subtotal** | | **<e.g., ~€1.60 on €60 = 2.7%>** | |

**Margin check:** €60 booking − €1.60 fees − <coach share> = <net per booking>.
Does this stay above the per-transaction margin floor (§1) at the smallest
common ticket? <yes/no — if no, escalate to product owner>

---

## 4. One-off / launch costs (amortised, not in monthly run-rate)

| Item | Cost | Notes |
|------|------|-------|
| <e.g., Pen test (NFR SEC-005)> | <e.g., €3,000> | <pre-launch, one-time> |
| <e.g., Domain purchase> | <e.g., €20/yr> | <annual> |
| <e.g., BrowserStack matrix (NFR B-*)> | <e.g., €200/mo> | <recurring — move to §2 if ongoing> |

---

## 5. Budget vs model reconciliation

| | MVP (€/mo) | 12 months (€/mo) |
|-|------------|------------------|
| Infra subtotal (§2) | <sum> | <sum> |
| Per-transaction at expected volume (§3 × bookings/mo) | <sum> | <sum> |
| **Total run-rate** | **<sum>** | **<sum>** |
| Budget cap (§1) | <cap> | <cap> |
| **Headroom** | **<cap − total>** | **<cap − total>** |

**If headroom < 0 for any window:** the SA must either (a) pick a cheaper
option in §2.1 of the brief and re-run this model, or (b) escalate to the
Orchestrator to raise the budget cap (requires user re-approval per CLAUDE.md
Rule 8). Do not proceed with a stack choice that breaks the model.

---

## 6. Cost risks (link to `risks.md`)

| Risk | Trigger | Mitigation | R-ID |
|-----|---------|------------|------|
| <e.g., "Daily.co per-minute fee dominates at long sessions"> | <median session > 60 min> | <cap session length; renegotiate volume tier> | R-### |
| <e.g., "Egress spikes on viral coach profile"> | <public profile traffic > traffic-profile §3 estimate> | <CDN cache-all; move large assets to R2> | R-### |

---

## Cross-references

- `PRD/<project>/prd.md` §3 — the budget cap
- `PRD/<project>/traffic-profile.md` — the volumes that drive §2 and §3
- `PRD/<project>/nfr-catalog.md` OBS-* / B-* / SEC-005 — NFRs that force cost lines
- `PRD/<project>/risks.md` — cost risks (R-### above)
- `PRD/<project>/tech-decision-brief.md` §1.13 — the SA reconciles stack choices against this model

---

*Re-run this model whenever the SA changes a vendor in §2.1 of the brief, whenever traffic-profile volumes change, and at the post-launch review (PRD §10 M6). Prices checked on the date in the header — re-verify before each phase exit.*