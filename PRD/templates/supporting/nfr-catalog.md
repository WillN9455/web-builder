# Non-Functional Requirements Catalog: <Project Name>

> Every NFR as a testable statement with a target and a measurement method.
> PRD §3a is the executive summary table; this file is the full catalog
> the QA Agent uses to write performance / accessibility / security tests,
> and the Solution Architect uses to size the architecture.

**Project:** <Project Name>
**Last updated:** <Date>
**Owner:** BA Agent
**Reviewer:** Requirements Reviewer
**Read by:** Solution Architect, QA Agent, Dev Reviewers

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
| P-001 | p95 page response time | 3G connection, cold cache | < 2.0s | Lighthouse / RUM | Production, weekly rollup | Engineering |
| P-002 | API p95 latency | Normal load | < 300ms | Server-side instrumentation | Production, per-endpoint | Engineering |
| P-003 | First Contentful Paint | Desktop, cold cache | < 1.0s | Lighthouse CI | Per deploy, in CI | Engineering |
| P-004 | Time to Interactive | Mobile, mid-tier device | < 3.0s | Lighthouse / RUM | Production, weekly rollup | Engineering |
| P-005 | Search results returned | 100k records | < 500ms | Server-side instrumentation | Production, per-endpoint | Engineering |

### Accessibility

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| A-001 | WCAG 2.1 AA conformance | All user flows | 100% pass | Automated: axe-core in CI; Manual: NVDA/VoiceOver screen reader test | Per PR (CI), quarterly (manual) | Design + Engineering |
| A-002 | Keyboard navigation | All interactive elements | 100% reachable | Manual test + automated check | Per PR | Design + Engineering |
| A-003 | Color contrast | All text/UI | AA ratio (4.5:1 text, 3:1 UI) | Automated contrast checker in CI | Per PR | Design |
| A-004 | Screen reader labels | All form fields, buttons, icons | 100% labelled | Automated ARIA audit + manual screen reader test | Per PR | Design + Engineering |

### Browser & device support

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| B-001 | Chrome (last 2 versions) | Functional parity | 100% | BrowserStack matrix | Per release | Engineering |
| B-002 | Safari (last 2 versions) | Functional parity | 100% | BrowserStack matrix | Per release | Engineering |
| B-003 | Firefox (last 2 versions) | Functional parity | 100% | BrowserStack matrix | Per release | Engineering |
| B-004 | Edge (last 2 versions) | Functional parity | 100% | BrowserStack matrix | Per release | Engineering |
| B-005 | Mobile Safari + Chrome (last 2 versions) | Functional parity | 100% | BrowserStack matrix | Per release | Engineering |
| B-006 | IE 11 | Not supported | 0% (graceful "please upgrade" message) | N/A | N/A | Engineering |

### Localization

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| L-001 | MVP languages | English only | 100% UI in English | Manual | Per release | Product |
| L-002 | i18n-ready | All user-facing strings | 100% in i18n key files (no hard-coded strings) | Automated lint rule | Per PR | Engineering |
| L-003 | Locale-aware date/time formatting | User in any locale | Dates/numbers formatted per browser locale | Manual test | Per release | Engineering |

### Offline & connectivity

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| O-001 | Read-only offline | User offline | User can view previously loaded pages; banner shown | Manual test | Per release | Engineering |
| O-002 | Write while offline | User offline | Writes queued + synced when online; or rejected with clear message | Manual test | Per release | Engineering |
| O-003 | Connection restored | User comes back online | Queue syncs within 30s | Manual test | Per release | Engineering |

### Scalability

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| S-001 | Concurrent users at MVP launch | 1k simultaneous | p95 latency within targets | Load test in staging | Pre-launch | Engineering |
| S-002 | MAU at 12 months | 100k | Within latency targets | Production RUM | Monthly review | Engineering |
| S-003 | Database size at 24 months | 10M rows in largest table | Query plans remain < 100ms | Production EXPLAIN ANALYZE | Quarterly review | Engineering |
| S-004 | Storage growth | < 500GB total at 24 months | Within S3/R2 budget | Production metrics | Monthly | Engineering |

### Security & compliance

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| SEC-001 | PII encryption at rest | All PII columns | 100% encrypted | Code review + DB inspection | Per PR + quarterly audit | Security |
| SEC-002 | TLS for all traffic | All client-server and service-service | 100% TLS 1.2+ | SSL Labs scan | Monthly | Security |
| SEC-003 | Authentication on protected routes | All routes except public marketing | 100% require auth | Automated route audit in CI | Per PR | Engineering |
| SEC-004 | GDPR right-to-erasure flow | Data subject request | Implemented end-to-end, 30-day SLA | Manual test + DPO sign-off | Pre-launch | Compliance + Engineering |
| SEC-005 | Penetration test | Pre-launch | No high/critical findings | External pen test | Pre-launch | Security |
| SEC-006 | Dependency vulnerability scan | All dependencies | No known high/critical CVEs | Snyk / npm audit in CI | Per PR + weekly | Engineering |
| SEC-007 | Rate limiting | All public endpoints | Implemented per `security-guidelines.md` §Rate Limiting | Automated test in CI | Per PR | Engineering |
| SEC-008 | CSRF protection | All state-changing requests | 100% protected | Automated test in CI | Per PR | Engineering |

### Data residency

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| DR-001 | EU users | All data stored in EU region | 100% EU-only | Cloud provider region config audit | Pre-launch + quarterly | Compliance + Engineering |
| DR-002 | US users (if supported) | All data stored in US region | 100% US-only | Cloud provider region config audit | Pre-launch + quarterly | Compliance + Engineering |

### Availability

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| AV-001 | Monthly uptime | Production | 99.5% | Uptime monitoring | Monthly review | Engineering |
| AV-002 | Degraded mode | External dependency outage | Core flows remain usable (read-only + queue writes) | Manual + chaos test | Pre-launch + quarterly drill | Engineering |
| AV-003 | Recovery Time Objective (RTO) | Major incident | < 4 hours | DR drill | Quarterly drill | Engineering |
| AV-004 | Recovery Point Objective (RPO) | Major incident | < 1 hour data loss | Backup verification | Daily automated + monthly manual | Engineering |

### Observability

| ID | NFR | Condition | Target | Measurement method | Measurement point | Owner |
|----|-----|-----------|--------|--------------------|--------------------|-------|
| OBS-001 | Structured logs | All services | 100% JSON logs with request ID | Log inspection | Per PR | Engineering |
| OBS-002 | Distributed tracing | All cross-service calls | 100% traced | Trace inspection in staging | Per PR | Engineering |
| OBS-003 | Error rate (5xx) | Production | < 0.5% per week | Observability dashboard | Weekly | Engineering |
| OBS-004 | Alerting on error spike | 5xx rate > 1% for 5 minutes | Page on-call within 1 minute | Alert test | Monthly | Engineering |
| OBS-005 | User-facing error visibility | User sees error | Error message is actionable, never leaks stack trace | Manual + automated test | Per PR | Engineering |

---

## NFRs deferred to later phases

> NFRs that apply to Phase 2+ but not MVP, captured here so they are not lost.

| ID | NFR | Phase | Notes |
|----|-----|-------|-------|
| P-006 | Multi-region active-active | Phase 3 | Not required for MVP single-region |

---

## How QA uses this catalog

The QA Agent writes a test plan that maps each NFR to:
- An automated test (CI-runnable) for every NFR that can be automated
- A manual test script for every NFR that cannot be automated (e.g., screen reader test)
- A measurement cadence (per-PR, per-release, quarterly)

Test results are filed against the NFR ID (e.g., "P-001 PASS, 1.8s p95 measured in production week of 2026-09-01") so trends are visible.

---

*When a new NFR is discovered during design, code, or QA, add it here with the testable form. If the NFR cannot be sharpened to a testable form, escalate to the BA — vague NFRs do not ship.*
