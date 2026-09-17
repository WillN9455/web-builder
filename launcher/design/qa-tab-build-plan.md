# QA Tab — Build Plan (SA5)

**Date:** 2026-09-17 · **Author:** Solution Architect 5 · **Handover:** Code Agent 1 (Senior) build → Dev Reviewer 4 review
**Inputs:** `launcher/design/qa-tab.html` (v5.3, 1493 ln — 3 screens), `launcher/design/sitemap.md` § QA (lines 716–770 — **source of truth**, overrides the mockup where they diverge), `launcher/design/mockups.html` (QA chrome refs), design-tab precedent (`PR #32` @ `00307a2`), CLAUDE.md repo rules.

---

## 1. Branch + sequencing decision (SA call)

**Branch `feature/qa-tab`, stacked on `feature/design-tab` @ `00307a2` (PR #32 tip) — which is stacked on `feature/sprint-tab` @ `ab1b8b8` (PR #29). NOT off origin/main.**

Why:
1. The **story spine** (`kanban_card` read model, `PRD/stories.md` US-NN grammar, acceptance criteria) only exists on PR #29. The QA tab is per-story end to end (per-story test list, story QA detail, coverage of acceptance criteria, run history per story). Building it on post-#28 main means building against the legacy feature-first model — guaranteed rework when #29 merges.
2. The **tab chrome + server conventions** this build mirrors (gated tab route pattern, back-arrow drill-down, rules half with write-back, additive SCSS partial, server module + body-gate seam) were established on PR #32.
3. Both PRs are MERGEABLE, SA-converged, and DR-approved at tip — the stack is low-risk.

**Merge order: #29 → #32 → qa-tab.** Rebases are mechanical because the PR is purely additive:
- **Zero edits to sprint-owned files** (`server/story-gen.ts`, `server/board.ts`, `server/jira-link.ts`, sprint client/SCSS).
- **Zero edits to design-owned files** (`server/design.ts`, `src/components/design/*`).
- When #29 merges → #32 rebases onto main (its promotion path, incl. F-SEC-1/2 fixes) → qa-tab rebases onto the new #32 tip, re-runs all gates at the committed tip, then ships.

Known rebase collision points (SA-R-107): `server/db.ts` (table DDL additions), `server/index.ts` (route mounts), `src/App.tsx` (route declarations) — all additive in separate regions; mechanical resolution, no logic merges.

---

## 2. Scope (v5.3 — sitemap § QA is the contract)

### Routes / screens
| Screen | Route | Zones |
|---|---|---|
| Status list | `/projects/:id/qa` | 1–9 (verdict banner, env panel, 6 tiles, coverage strip, per-story list, run history, agent panel, tools panel, dimensions) |
| Story QA detail | `/projects/:id/qa/:storyId` | zone 10 (rework banner, run table, per-test rows, screenshot viewer, notes thread) |
| Rules | `/projects/:id/qa/rules` | zone 11 — opened from the **cog in the project header** (not an inline pill switch — parity with build-tab v5.5 chrome); back-arrow returns to Status list |

### In scope (v1)
- Verdict banner — `N/M stories Passed · …`; all-pass mint variant with `Sign off & deploy to QA env →` → `POST /qa/signoff`.
- Environment panel — read-only; renders the **"Not deployed yet" empty state** until Build ships a deploy record (SA-R-102).
- 6 stat tiles (Ready for QA · In QA · Passed · Failed · **Flaky** · **Blocked/Skipped**). Pass-rate denominator = Passed + Failed + Blocked — **excludes Flaky**, with the footnote.
- Coverage strip — `X/Y acceptance criteria covered · Z untested`, drill-down list of untested AC IDs.
- Per-story test list — story ID + status pill + test-result strip + screenshot thumbs + Open. 7 filter chips (All / Ready for QA / In QA / Passed / Failed / Flaky / Blocked). Inline round-trip line on Build-rework cycles; escalation hint at ≥3 failed rounds.
- Run history — collapsible sub-row on Status list; full table on Story detail (run #, trigger, duration, timestamp, result). Enables flaky detection.
- QA agent panel — **display-only** (activity + queue), mirrors build-tab `.agent-card`.
- QA tools panel — Playwright config display (browser, headed, trace, retries, base URL) + test rules in force, read from `testing/`.
- Results by dimension — functional / a11y (axe, WCAG 2.1 AA) / feature-fidelity lanes; compact on list, full per-story on detail. A story can pass functionally and fail a11y — split signals.
- Story QA detail — linked requirement + dimension card, rework round-trip banner, run history table, per-test rows (dimension badge + expected vs actual + Playwright trace + console/network paths), annotated screenshot viewer, notes thread (QA Agent + Reviewer + user).
- Rules screen — Playwright config card, test-rules-in-force card, markdown editor → `testing/qa-rules.md`, per-agent guidelines editors → `testing/QA-AGENT.md` + `testing/REVIEWER-AGENT.md`.
- Story state machine — `Ready for QA → In QA →` pass (→ QA-env deploy stage) / fail (→ Build rework queue, round-trip +1) / Flaky / Blocked-with-reason.
- **Flaky policy (locked in sitemap):** 5 runs with any fail → Quarantine; 3 consecutive passes → clear Flaky. v1: flaky **flagging + display only**; quarantine escalation is display-only.
- All four UI states (empty / running / error / no-screenshots) per C.17–20.
- Manual `Re-run all tests` (Status list) + `Re-run` (Story detail) → `POST /qa/runs`.

### Out of scope (v1 — do not build)
1. **The QA agent's actual Playwright execution runtime.** `POST /qa/runs` records a *requested* run (queued) and the run state machine is real; executing Playwright suites belongs to the QA Agent runtime — the same line the design-tab build drew (display-only agent strip, no agent runtime).
2. **Screenshot retention enforcement** (3 most-recent/step) — storage laid down, pruning deferred (the mockup itself defers this).
3. **Visual diff implementation** — sitemap explicitly allows deferred-with-note; render the gated card with a deferral note.
4. **Multi-browser matrix execution** — chromium/firefox/webkit live in `testing/qa-rules.md` as config text; no executor.

---

## 3. Server — `server/qa.ts` (new; mounted in `server/index.ts` after design routes)

All routes project_id-scoped. Security conventions carried forward from the design-tab review (DR2 F-1…F-6 + F-SEC-1/2, now repo conventions):

| Endpoint | Notes |
|---|---|
| `GET /api/projects/:id/qa/stories` | per-story QA status + test-result strips + coverage counts |
| `GET /api/projects/:id/qa/tests/:storyId` | tests, steps (JSON), screenshot paths (pass/issue), trace/console paths |
| `GET + PUT /api/projects/:id/qa/rules` | fixed filename allowlist (`qa-rules.md`, `QA-AGENT.md`, `REVIEWER-AGENT.md`) + `resolveInside` containment under `testing/` — **no red-herring `..` checks** (F-SEC-2 resolution); 2 MB caps; 422 with spec message; `testing/` is created on first write if absent |
| `GET /api/projects/:id/qa/env` | null-shaped until Build ships a deploy record (SA-R-102); client renders the empty state |
| `GET /api/projects/:id/qa/coverage` | AC IDs from the #29 story spine vs recorded `qa_test` rows → covered/untested lists |
| `GET /api/projects/:id/qa/runs/:storyId` | run history (run #, trigger, duration, timestamp, result) |
| `POST /api/projects/:id/qa/runs` | scope selector validated (`full`\|`smoke`\|`story TM-NN`) else 422; records a queued run |
| `POST /api/projects/:id/qa/signoff` | 409 unless all-pass (denominator rule); advances stage via the scoped `kanban_card`/stage UPDATE (F-4 pattern); `ensureQaState` helper so first transition persists (`ensureDesignRow` lesson) |
| `GET /api/projects/:id/qa/screenshots/:testId/:n` | **serve by id, never by raw client path**; `resolveInside` under `qa-evidence/` (SA-R-106) |

Security requirements (day one, not fix-later):
- **Story-membership check (`stories.some` → 404) on EVERY route**, including reads and the notes POST — F-SEC-1 was a post-hoc fix on design.ts; QA ships with it everywhere from the first commit.
- Notes POST: `<` rejection + 10 KB body cap (parity with design notes).
- Screenshots are written server-side by run recording, never uploaded by clients → **no body-gate change in `index.ts` needed** (all QA bodies fit the global 1 MB gate; rules caps enforced server-side).
- `project_id` scoping on every query and every UPDATE (F-4/F-6 pattern).
- Markdown rendering on the client: escape-then-markdown, never `innerHTML` on raw bodies.

---

## 4. Data model (`server/db.ts` — additive, same migration pattern as design_tab; CHECK rebuild caution applies)

| Table | Columns |
|---|---|
| `qa_story_state` | `project_id`, `story_id`, `status` CHECK `('ready_for_qa','in_qa','passed','failed','flaky','blocked_skipped')`, `rework_rounds`, `round_trip` JSON, `flaky_since`, UNIQUE(`project_id`,`story_id`) |
| `qa_run` | `id` PK, `project_id`, `story_id`, `run_no`, `trigger` CHECK `('auto','manual','agent')`, `started_at`, `duration_ms`, `result` CHECK `('passed','failed','flaky','blocked','partial')`, `summary`; index on (`project_id`,`story_id`) |
| `qa_test` | `id` PK, `run_id` FK, `project_id`, `story_id`, `name`, `dimension` CHECK `('functional','a11y','fidelity')`, `status` CHECK `('pass','fail','skip','flaky','blocked')`, `expected`, `actual`, `trace_path`, `steps` JSON (per-step screenshot paths); index on (`project_id`,`story_id`) |

- Screenshots live on disk at `<project>/qa-evidence/<story-slug>/run-<n>/…`; DB stores paths only (disk-verify pattern applies to any prune/cleanup endpoint later).
- `kanban_card`: QA transitions update `qa_story_state` **and** `kanban_card` via the same scoped-UPDATE pattern `design.ts` uses (F-4). **Pre-flag (SA-R-101):** the `kanban_card` status CHECK may not accept QA-stage vocabulary — verify against the DDL at `00307a2` before wiring. If a QA status is outside the CHECK, do **not** widen sprint's CHECK in this PR: `qa_story_state` stays authoritative for QA statuses, the kanban update is dropped with a code comment, and the deviation is reported in the PR body for DR4/SA adjudication.

---

## 5. Client

- `src/App.tsx` — explicit routes `qa`, `qa/:storyId`, `qa/rules` declared **before** the `:tab` catch-all (same as design/sprint); gated per the `ProjectTabScreen` gate logic (QA unlocks after project-context confirmation).
- `src/components/qa/QaScreen.tsx` — Status list (zones 1–9, 7 filter chips, round-trip lines).
- `src/components/qa/QaStoryScreen.tsx` — detail (back arrow returns + scrolls the source row into view, as design does).
- `src/components/qa/QaRulesScreen.tsx` — rules half (back arrow; three editors with Save → PUT → disk write-back).
- Cog in the project header → `qa/rules`: **minimal additive edit** in `ProjectDetailScreen`'s header (one conditional affordance navigating to `qa/rules`) — the only shared-file logic-adjacent touch (SA-R-104, pre-flagged for DR4).
- `src/components/ProjectSidebar.tsx` — additive one-liner: QA nav entry, gated, count badge = failing + pending test count.
- `src/lib/api.ts` — QA fetchers; surface 409 / 422 / 404 distinctly.
- `src/styles/partials/_qa.scss` — additive partial only (css-equivalence is a **selector-order-preservation** check post-#31; additive keeps it green). Port classes from `qa-tab.html` (pills, pass-chips, `qa-dim` badges, state cards, shot toolbar, rework banner, agent-md-card).
- WCAG 2.1 AA + all four UI states; `aria-live` on the running-state progress; escape-then-markdown for notes; screenshots as `<img>` with meaningful alt.

---

## 6. Risks (SA-R, pre-flagged for Dev Reviewer 4)

| ID | Risk | Mitigation / ask |
|---|---|---|
| SA-R-101 | `kanban_card` status CHECK may reject QA vocabulary | Verify DDL at build time; if out of vocabulary, `qa_story_state` authoritative + kanban update dropped with comment; report in PR body |
| SA-R-102 | Build deploy record doesn't exist yet | `/qa/env` returns null-shaped data; UI renders "Not deployed yet" empty state |
| SA-R-103 | Coverage join depends on #29's AC grammar | Verify AC-ID shape on the story spine at build time; coverage endpoint tolerates stories without ACs (0/0 state) |
| SA-R-104 | Shared-file edits (`App.tsx`, `ProjectDetailScreen`, `ProjectSidebar`, `index.ts`, `db.ts`) | Additive-only discipline; css-equivalence gate run at the committed tip |
| SA-R-105 | Flaky heuristic (5-runs/3-pass policy) computed from run history | v1 = flag + display; quarantine escalation is display-only; policy text lives in `testing/qa-rules.md` |
| SA-R-106 | Screenshot path traversal | Serve by test id + step index; `resolveInside` under `qa-evidence/`; unknown ids → 404 |
| SA-R-107 | Rebase collisions in `db.ts` / `index.ts` / `App.tsx` when the chain rebases | Additive in separate regions; mechanical resolution; re-run gates at committed tip |

---

## 7. Gates (all at the committed tip, Node 24 only)

1. `npm run typecheck`
2. `npm run verify:requirements` (217/0 baseline preserved)
3. `npm run verify:css-equivalence`
4. New `scripts/verify-qa.ts` → `npm run verify:qa` — endpoint matrix: scope-selector 422s, rules PUT containment + caps + write-back, signoff 409 on not-all-pass, story-membership 404 on every route, screenshot id 404/containment, coverage counts.
5. Headless walk of the real app — fresh seed (`db:reset`/`db:seed`), own port (`lsof` first, kill stale spawns; **5184 is another session's server**), puppeteer-core + cached Playwright Chromium, script in the project dir, wait for rendered markers. Cover: list render + 7 filter chips, stat tiles + pass-rate footnote, drill-down routing + back-arrow, rework banner on a failed story, rules edit → save → **disk write-back verified** (`testing/qa-rules.md` mutation asserted, not the 200), runs trigger → queued run recorded, signoff 409 → state flip on an all-pass fixture, coverage strip counts, empty + no-screenshots states. **Disk-verify destructive/stateful endpoints.**

---

## 8. Handover order

1. **Code Agent 1 (Senior):** build per §2–§7 on `feature/qa-tab` stacked @ `00307a2`; commit this plan (`design/qa-tab-build-plan.md`) as the first commit on the branch; push + `gh pr create --base main` (draft ok) when gates are green; report the PR link in the Web-builder thread.
2. **Dev Reviewer 4:** review at the pushed tip (worktree HEAD == PR head), security lens per §6 — priority: SA-R-106 screenshot path traversal, rules-PUT containment, story-membership on all routes, scoped kanban transitions — plus the standard checklist.

**Promotion path:** after #29 merges → #32 rebases onto main (incl. F-SEC-1/2) → rebase `feature/qa-tab` onto the new #32 tip → re-run all gates at the committed tip → ready for review/merge.

---

## 9. Audit trail (append-only)

- **2026-09-17 build handover:** SA5 planning commissioned by Will (event `a2b2b544…`); inputs read (`qa-tab.html` v5.3, `sitemap.md` § QA lines 716–770, `mockups.html` QA chrome refs, design-tab precedent `00307a2`, sprint spine `ab1b8b8`); plan written to `PLANS/2026-09-17-qa-tab-build-plan.md`; Code Agent 1 + Dev Reviewer 4 assigned by Will in the same event. No `blocker-for: tech` open questions remain from BA artifacts for this tab.