# Phasing Plan: <Project Name>

> Detailed release phasing with dependency graph and parallelisable-work
> markers. PRD §8a is the executive table; this file is the deep plan
> the Orchestrator uses to schedule Code Agents, and the QA Agent uses
> to scope test cycles per phase.

**Project:** <Project Name>
**Last updated:** <Date>
**Owner:** BA Agent
**Reviewer:** Requirements Reviewer

---

## Phase definitions

| Phase | Goal | Definition of done | Target window |
|-------|------|--------------------|----------------|
| **MVP** | First release; smallest thing that delivers user value | All user stories marked MVP in PRD §8 are implemented, tested, deployed to production, and meeting §6a KPI baselines | <date range> |
| **Phase 2** | High-value follow-ups after product-market fit signal | All Phase 2 stories implemented; KPI uplift measured | <date range> |
| **Phase 3** | Growth and scale features | All Phase 3 stories implemented; sustained KPI improvement | <date range> |
| **Backlog** | Captured but unscheduled | N/A | TBD |

---

## User stories by phase (mirror of PRD §8)

### MVP (must ship)

| Story # | Summary | Story points | Dependencies on other stories | Can be built in parallel? |
|---------|---------|--------------|-------------------------------|----------------------------|
| #1 | <text> | S | None | Yes (with #2, #3) |
| #2 | <text> | M | None | Yes (with #1, #3) |
| #3 | <text> | M | #1 (needs auth) | No (depends on #1) |
| ... | ... | ... | ... | ... |

**Total MVP story points:** <sum>

### Phase 2

| Story # | Summary | Story points | Dependencies | Notes |
|---------|---------|--------------|--------------|-------|
| #5 | <text> | L | MVP | <why deferred from MVP> |
| ... | ... | ... | ... | ... |

### Phase 3

| Story # | Summary | Story points | Dependencies | Notes |
|---------|---------|--------------|--------------|-------|
| #8 | <text> | XL | MVP + Phase 2 | <why Phase 3> |
| ... | ... | ... | ... | ... |

### Backlog (captured, unscheduled)

| Story # | Summary | Notes |
|---------|---------|-------|
| #10 | <text> | <what's needed to schedule — e.g., "validate with users first"> |
| ... | ... | ... |

---

## Dependency graph

> Use a Mermaid diagram (rendered natively in GitHub, GitLab, and most
> markdown viewers). The Orchestrator parses this to schedule Code Agents.

```mermaid
graph LR
    S1[Story #1<br/>User signs up] --> S3[Story #3<br/>User books]
    S2[Story #2<br/>User browses] --> S3
    S3 --> S4[Story #4<br/>Provider confirms]
    S4 --> S5[Story #5<br/>Email notification]
    S5 --> S6[Story #6<br/>Reminder flow]
    S3 --> S7[Story #7<br/>User cancels]

    classDef mvp fill:#c8e6c9,stroke:#2e7d32,color:#000
    classDef phase2 fill:#fff9c4,stroke:#f9a825,color:#000
    classDef phase3 fill:#ffcdd2,stroke:#c62828,color:#000

    class S1,S2,S3,S4,S7 mvp
    class S5 phase2
    class S6 phase3
```

**Plain-text fallback (for non-Mermaid renderers):**

```
S1 ──► S3 ──► S4 ──► S5 ──► S6
S2 ──► S3     │      │
              ▼      ▼
              S7    (S5 also feeds reminder flow)
```

**Legend:**
- `S1 → S3` means "S1 must be done before S3 can start"
- Green = MVP, Yellow = Phase 2, Red = Phase 3

---

## Parallelisation rules

The Orchestrator schedules Code Agents to maximise parallel work without
violating dependencies. Rules:

1. **A story can be built in parallel with another story** if neither
   has a dependency on the other (i.e., no shared ancestor in the
   dependency graph that the other does not also have).
2. **A Code Agent's branch is per-story**, not per-phase. The branch
   name follows the pattern `feature/<story-number>-<short-name>`.
3. **Cross-story refactors** (e.g., introducing a shared component)
   must be done in the earliest story that needs them, so later
   stories can build on top.
4. **Phase boundaries are review boundaries.** A phase is not
   "done" until every story in it has passed QA and the cumulative
   KPIs from §6a have been measured.

---

## Phase exit criteria

### MVP exit

- [ ] All MVP stories implemented and merged
- [ ] All MVP stories have passing Playwright tests traced to their story ID
- [ ] NFR catalog: all P0 NFRs (SEC-*, A-001, B-001..006) passing in production
- [ ] Pen test completed with no high/critical findings
- [ ] DPIA (Data Protection Impact Assessment) signed off by Compliance
- [ ] Production deploy successful
- [ ] Monitoring + alerting live
- [ ] Runbook + on-call rotation established
- [ ] §6a KPIs baselined (post-launch, 7 days)

### Phase 2 exit

- [ ] All Phase 2 stories implemented and merged
- [ ] KPI uplift measured against baseline (target uplift per §6a)
- [ ] All P1 NFRs from catalog passing

### Phase 3 exit

- [ ] All Phase 3 stories implemented and merged
- [ ] All P2 NFRs from catalog passing
- [ ] Architecture review for Phase 4 (if planned)

---

## Rollout, kill-switches & feature flags

> **Purpose:** the phasing plan defines *what* ships in each phase.
> This section defines *how* a feature goes live and *how it comes
> back* if it goes wrong. Without it, every incident response starts
> with "how do we turn this off?" — which is the wrong question at
> the wrong time.
>
> **The BA Agent owns the rollout shape and the kill-switch decision
> per feature; the Solution Architect picks the flag/infra mechanism;
> the Code Agents wire it; the QA Agent verifies the kill-switch works.**
> A feature in the phasing plan without a row in this table is a
> deployment-time incident waiting to happen.

### Per-phase rollout strategy

For every phase below, fill the table or it fails §13 sign-off.

| Phase | Rollout shape (% of traffic or cohort) | Feature flags required | Kill-switch mechanism | Rollback metric (auto-rollback trigger) | Owner |
|-------|----------------------------------------|------------------------|------------------------|------------------------------------------|-------|
| MVP | <e.g., "100% to internal coaches week 1; 10% of public traffic week 2; 100% week 4"> | <flag names + default state> | <flag toggle + on-call runbook link> | <e.g., "5xx > 1% for 5 min" or "booking_completion < 50% of baseline"> | <role> |
| Phase 2 | ... | ... | ... | ... | ... |
| Phase 3 | ... | ... | ... | ... | ... |

### Per-feature flag & kill-switch matrix

> One row per feature that ships to users. "Internal only" or "no user-visible behaviour change" features may use the row `N/A` with rationale.

| Feature | Story # | Flag name | Default state in prod | Default state for internal/QA | Kill-switch behaviour (≤ 30s to disable) | Linked metric |
|---------|---------|-----------|----------------------|--------------------------------|-------------------------------------------|---------------|
| <feature> | #N | <flag-id> | <on/off/%> | <on> | <e.g., "Flag → off hides CTA + blocks POST endpoint with 503"> | <§6a KPI or §6a.1 event> |
| ... | ... | ... | ... | ... | ... | ... |

### Rollout rules (BA Agent enforces)

1. **Every user-visible feature gets a row.** Internal-only changes may group under one row with `N/A` flag and rationale.
2. **Default off in prod for new features.** A new feature ships with the flag off in prod, on for QA/internal. The Code Agent flips it on only after the SA signs off on the rollout window.
3. **Kill-switch ≤ 30 seconds.** The kill-switch must disable the feature (UI + endpoint) within 30 seconds of a flag flip. If it cannot, the SA rejects the rollout plan.
4. **Auto-rollback metrics are defined up front.** Each row's "Rollback metric" is a measured signal — not "if something looks bad." Vague rollback criteria are review defects.
5. **Gradual rollout has a halt criterion.** If the rollback metric fires, the rollout halts and the flag goes off. No human-in-the-loop to "decide if it's bad enough."
6. **One-way doors flagged.** Any feature that is hard to reverse (data model changes, paid commitments, public API contracts) must be tagged `one-way door` and require the Orchestrator's sign-off before rollout — not just the SA's.

### Cross-references

- `PRD/<project>/risks.md` — every "one-way door" feature gets a risk row.
- `PRD/<project>/nfr-catalog.md` Observability + Availability — rollback metrics depend on the observability stack.
- `code-builder/config-rules.md` — the SA's flag mechanism choice (LaunchDarkly, Unleash, env vars, custom) lives there.

---

## Risks to the phasing plan

> Anything that could push a phase out. Mirrored from `risks.md` but
> focused on schedule impact.

| Risk | Affected phase | Mitigation |
|------|----------------|------------|
| <e.g., "Auth provider integration harder than estimated"> | MVP | <e.g., "Build auth with a fallback library in case integration is delayed"> |
| ... | ... | ... |

---

*When a story moves between phases, update this file AND the §8 / §8a tables in `prd.md` AND the dependency graph. The three must stay in sync.*
