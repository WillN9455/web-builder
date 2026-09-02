# Non-Functional Requirements Catalog: Acme Coaching

**Project:** Acme Coaching
**Last updated:** 2026-09-02
**Owner:** BA Agent
**Reviewer:** Requirements Reviewer
**Read by:** Solution Architect, QA Agent, Dev Reviewers

> Every NFR as a testable statement with a target and a measurement method.
> PRD §3a is the executive summary table; this file is the full catalog
> the QA Agent uses to write performance / accessibility / security tests,
> and the Solution Architect uses to size the architecture.

---

## How to write a testable NFR

Every NFR in this catalog follows the form:
> **When** <condition>, **the system shall** <observable behaviour>, **measured by** <how we measure it>, **with a target of** <number>.

If an NFR cannot be written in this form, it is not ready for QA — the BA must either sharpen it or remove it. Vague NFRs ("the system should be fast") are not testable and will be rejected at review.

---

## Catalog

### Performance

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| P-001 | p95 page response time | 3G connection, cold cache | < 2.0s | Lighthouse / RUM | Production, weekly rollup | Sam |
| P-002 | API p95 latency | Normal load | < 300ms | Server-side instrumentation | Production, per-endpoint | Sam |
| P-003 | First Contentful Paint | Desktop, cold cache | < 1.0s | Lighthouse CI | Per deploy, in CI | Sam |
| P-004 | Time to Interactive | Mobile, mid-tier device | < 3.0s | Lighthouse / RUM | Production, weekly rollup | Sam |
| P-005 | Booking creation latency | Coach or client submits booking | p95 < 500ms | Server-side instrumentation | Production, per-endpoint | Sam |

### Accessibility

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| A-001 | WCAG 2.1 AA conformance | All user flows | 100% pass | Automated: axe-core in CI; Manual: NVDA/VoiceOver screen reader test | Per PR (CI), quarterly (manual) | Priya + Sam |
| A-002 | Keyboard navigation | All interactive elements | 100% reachable | Manual test + automated check | Per PR | Priya + Sam |
| A-003 | Color contrast | All text/UI | AA ratio (4.5:1 text, 3:1 UI) | Automated contrast checker in CI | Per PR | Priya |
| A-004 | Screen reader labels | All form fields, buttons, icons | 100% labelled | Automated ARIA audit + manual screen reader test | Per PR | Priya + Sam |
| A-005 | Form errors announced | Form submission error | Error announced via `aria-live` polite | Manual + automated test | Per PR | Priya + Sam |

### Browser & device support

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| B-001 | Chrome (last 2 versions) | Functional parity | 100% | BrowserStack matrix | Per release | Sam |
| B-002 | Safari (last 2 versions) | Functional parity | 100% | BrowserStack matrix | Per release | Sam |
| B-003 | Firefox (last 2 versions) | Functional parity | 100% | BrowserStack matrix | Per release | Sam |
| B-004 | Edge (last 2 versions) | Functional parity | 100% | BrowserStack matrix | Per release | Sam |
| B-005 | Mobile Safari + Chrome (last 2 versions) | Functional parity | 100% | BrowserStack matrix | Per release | Sam |
| B-006 | IE 11 | Not supported | 0% (graceful "please upgrade" message) | N/A | N/A | Sam |

### Localization

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| L-001 | MVP languages | English only | 100% UI in English | Manual | Per release | Carmen |
| L-002 | i18n-ready | All user-facing strings | 100% in i18n key files (no hard-coded strings) | Automated lint rule | Per PR | Sam |
| L-003 | Timezone handling | Coach and client in different timezones | All times shown in viewer's local timezone; stored in UTC | Manual test with multiple timezones | Per release | Sam |

### Offline & connectivity

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| O-001 | Read-only offline | User offline, previously loaded page | User can view previously loaded pages; banner shown "you're offline" | Manual test | Per release | Sam |
| O-002 | Write while offline | User submits booking while offline | Submission queued; banner "will send when online"; user can retry manually | Manual test | Per release | Sam |
| O-003 | Connection restored | User comes back online | Queued submissions sync within 30s | Manual test | Per release | Sam |

### Scalability

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| S-001 | Concurrent users at MVP launch | 1k simultaneous | p95 latency within targets | Load test in staging | Pre-launch | Sam |
| S-002 | MAU at 12 months | 100k | Within latency targets | Production RUM | Monthly review | Sam |
| S-003 | Database size at 24 months | 1M bookings in largest table | Query plans remain < 100ms | Production EXPLAIN ANALYZE | Quarterly review | Sam |
| S-004 | Storage growth | < 200GB total at 24 months | Within R2 budget | Production metrics | Monthly | Sam |

### Security & compliance

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| SEC-001 | PII encryption at rest | All PII columns | 100% encrypted | Code review + DB inspection | Per PR + quarterly audit | Lee + Sam |
| SEC-002 | TLS for all traffic | All client-server and service-service | 100% TLS 1.2+ | SSL Labs scan | Monthly | Sam |
| SEC-003 | Authentication on protected routes | All routes except `/c/<slug>` and `/signup` | 100% require auth | Automated route audit in CI | Per PR | Sam |
| SEC-004 | GDPR right-to-erasure flow | Data subject request | Implemented end-to-end, 30-day SLA | Manual test + DPO sign-off | Pre-launch | Lee + Sam |
| SEC-005 | Penetration test | Pre-launch | No high/critical findings | External pen test | Pre-launch | Lee |
| SEC-006 | Dependency vulnerability scan | All dependencies | No known high/critical CVEs | Snyk / npm audit in CI | Per PR + weekly | Sam |
| SEC-007 | Rate limiting | All public endpoints | Implemented per `security-guidelines.md` §Rate Limiting (100 req/min per IP on /api/*) | Automated test in CI | Per PR | Sam |
| SEC-008 | CSRF protection | All state-changing requests | 100% protected | Automated test in CI | Per PR | Sam |
| SEC-009 | Stripe webhook signature verification | Every Stripe webhook | 100% verified before processing | Automated test | Per PR | Sam |
| SEC-010 | Daily.co room privacy | Every session room | Room is private; only the two participants can join; access token expires after session end | Manual + automated test | Per PR | Sam |

### Data residency

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| DR-001 | EU users | All data stored in EU region | 100% EU-only (DB, object storage, video infrastructure) | Cloud provider region config audit + Daily.co region check | Pre-launch + quarterly | Lee + Sam |

### Availability

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| AV-001 | Monthly uptime | Production | 99.5% | Uptime monitoring | Monthly review | Sam |
| AV-002 | Degraded mode | External dependency (Stripe, Daily, Postmark) outage | Core flows (browse, view bookings) remain usable; booking write surfaces "we'll confirm shortly" | Manual + chaos test | Pre-launch + quarterly drill | Sam |
| AV-003 | Recovery Time Objective (RTO) | Major incident | < 4 hours | DR drill | Quarterly drill | Sam |
| AV-004 | Recovery Point Objective (RPO) | Major incident | < 1 hour data loss | Backup verification | Daily automated + monthly manual | Sam |

### Observability

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| OBS-001 | Structured logs | All services | 100% JSON logs with request ID | Log inspection | Per PR | Sam |
| OBS-002 | Distributed tracing | All cross-service calls | 100% traced | Trace inspection in staging | Per PR | Sam |
| OBS-003 | Error rate (5xx) | Production | < 0.5% per week | Observability dashboard | Weekly | Sam |
| OBS-004 | Alerting on error spike | 5xx rate > 1% for 5 minutes | Page on-call within 1 minute | Alert test | Monthly | Sam |
| OBS-005 | User-facing error visibility | User sees error | Error message is actionable, never leaks stack trace | Manual + automated test | Per PR | Sam |
| OBS-006 | PII access logging | Any read of PII column | Logged with user, timestamp, reason | Audit log inspection | Per PR + quarterly audit | Lee + Sam |

---

## NFRs deferred to later phases

| ID | NFR | Phase | Notes |
|----|-----|-------|-------|
| P-006 | Multi-region active-active | Phase 3 | Not required for MVP single-region |
| A-006 | Multi-language screen reader test (non-English) | Phase 3 | English-only at MVP |
| S-005 | 1M MAU | Phase 3 | S-002 covers 12 months |

---

## How QA uses this catalog

The QA Agent writes a test plan that maps each NFR to:
- An automated test (CI-runnable) for every NFR that can be automated
- A manual test script for every NFR that cannot be automated
- A measurement cadence (per-PR, per-release, quarterly)

Test results are filed against the NFR ID (e.g., "P-001 PASS, 1.8s p95 measured in production week of 2026-09-01") so trends are visible.

---

*When a new NFR is discovered during design, code, or QA, add it here with the testable form. If the NFR cannot be sharpened to a testable form, escalate to the BA — vague NFRs do not ship.*
