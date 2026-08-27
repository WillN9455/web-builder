# Launcher — Update Phase Execution Plan

**Purpose:** the executable plan for the update phase, produced at the end of the sitemap walkthrough on 2026-08-27. Each session picks up a 2-design chunk from the Chunk Tracker below and applies it.

**Paired with:** the locked decisions live in auto-memory `project-launcher-design-standards.md` (read it first — it has the rationale for every choice below). This file is the *what to change and where*; that memory is the *why*.

**Canonical source:** `design/sitemap.md`. **Files to edit:** `design/mockups.html`, `design/background.html`, `design/requirements.html`, `design/sitemap.md`, plus new mockups to create.

---

## Chunked execution model (locked 2026-08-27)

**Rule: 2 new designs per session, no more.** Each design is non-trivial (one is typically a whole new mockup or a major section). Doing 3+ has overrun context on every prior attempt. The Chunk Tracker below records what was done and what's next; every session updates it before exiting.

**Default chunk size = 2.** If a design is unusually large (e.g. a full new tab mockup with rules tab), a session may do just 1. If two are tiny (e.g. two small component additions), a session may do 3 — but only when the next session can verify the previous work cleanly.

**Why chunk:** context stays small, verification is tight, handoff is clear. A session finishes 2 designs, runs the verification sweep, updates the Chunk Tracker, and writes a one-line "next session starts at" note. The next session reads the tracker, picks up the next chunk, and goes.

**Sequencing rule:** N11 (UI kit) before N1–N10 (new tab mockups) so the new components have a visual spec to defer to. N1–N4 (new states in existing files) before N5–N10 (six new tab mockups) so existing-file edits get verified first.

---

## Status — 2026-08-27

**Done in prior sessions:** **Phase 3** (sitemap.md, 18 edits) + **Phase 1** (24-item fix-list across the three existing mockups).

**Two open items resolved this session (2026-08-27):**

| Item | Decision |
|---|---|
| Activity filter set (N9) | **Confirmed proposed default:** `agent` / `stage` / `kind`. |
| Jira config home (N4) | **Confirmed proposed default:** in-Sprint "Connect Jira" setup state. No separate Settings screen. |

**Chunk 1 — DONE:** **N11** (UI kit additions to `#s11`) + **N1** (State D dedicated confirmation view in `background.html`, new `id="sD"` after s14).

**Chunk 2 — DONE:** **N2** (`#s4` blocked-state read-only redesign) + **N3** (`#s8` chat side panel Outstanding questions section, plus new `#s8b` active-state sibling).

**Chunk 3 — DONE:** **N4** (Sprint "Connect Jira" setup state, new `#s6b` in `sprint.html`) + **N5** (Design tab mockup, new `design-tab.html` `#sd`).

**Chunk 4 (2026-08-27) — DONE:** **N6** (Build tab mockup, new `build-tab.html` `#sbu`) + **N7** (QA tab mockup, new `qa-tab.html` `#sq`).

**Verification (Chunk 4):** stale-label sweep = 0 across all 7 mockup files (background / build-tab / design-tab / mockups / qa-tab / requirements / sprint), structural residue = 0, active sidebar markers = Build ✓ on `#sbu`, QA ✓ on `#sq`. Chunk-4 evidence checks = 34/34 ✓ after re-verification (8 false-negatives from over-strict regex re-tested as direct includes — all present). Per-tab new-chunk-specific checks (writeback chip targets, status-pill set, architecture read-only on Build, Playwright-only + screenshots-first-class + Re-run action on QA) all pass.

**Chunk 5 (this session, 2026-08-27) — DONE:** **N8** (Agents tab mockup, new `agents-tab.html` `#sag`) + **N9** (Activity tab mockup, new `activity-tab.html` `#sac`).

**Verification (Chunk 5):** stale-label sweep = 0 across all 9 mockup files (now incl. `agents-tab.html` + `activity-tab.html`), structural residue = 0, active sidebar markers = **Agents ✓** on `#sag` (line 307), **Activity ✓** on `#sac` (line 294). N8 checks: "moved from Sprint" callout present, all 8 agents in roster (BA×2, DA×3, DB×3, C1×9, C2×4, C3×3, QA×2, RV×1), selected Code 1 detail with PR #214 referenced 4×, **0 kit-tabs** (single-half monitor, correct — Agents is always-visible, no Rules half). N9 checks: 3 filter axes (agent / stage / kind, confirmed 2026-08-27), 11 timeline events, 11 kind-tag chips, 9 agent-coloured node selectors per sitemap palette (BA peach, DA sky, DB sea, C1 mint, C2 butter, C3 blush, QA lavender, RV sea, OR navy), 2 pinned rows (orchestrator system + gate events), 0 kit-tabs (single-half monitor, correct). Chunk-5 evidence checks = 22/22 ✓.

**Chunk 6 (this session, 2026-08-27) — DONE:** **N10** (Artifacts tab mockup, new `artifacts-tab.html` `#sar`). **This was a 1-of-2 chunk** — per the 2-per-session rule, "if a design is unusually large (e.g. a full new tab mockup with rules tab), a session may do just 1" — N10 is a full new tab mockup and is the last item in Phase 2, so doing 1 leaves Phase 2 closed rather than half-open for the next session. With Phase 2 complete, the next session has a clean starting point (implementation or known follow-up — see below) instead of a half-finished chunk.

**Verification (Chunk 6):** stale-label sweep = 0 across all 10 mockup files (now incl. `artifacts-tab.html`), structural residue = 0, active sidebar markers = **Artifacts ✓** on `#sar` (line 308) with `count 27` (matches header pill `27 files · 1.4 MB · 28 days`). N10 checks: 27 files grouped into 7 stage groups (Intake 1 + Requirements 15 + Design 3 + Build 4 + Review 0 + QA 3 + Deployed 0 = 27 ✓), 5 distinct kind tags (doc 18 rows, code 2, design 3, evidence 3, config 2), 7 stage headers all present, 5-column row layout (kind / path / size / created_at / open), 28 `.open-btn` instances (1 per row + 1 in selected viewer toolbar), in-app viewer renders selected `idea.md` with H1/H2/ul/code/pinned styling, meta panel shows 9 fields (kind/path/size/created/last opened/stage/writers/read by/status), related panel lists 5 related artifacts, 4 viewer toolbar buttons (Copy path / Reveal in Finder / Close + a Figma open from Design group), 3 filter axes (kind / stage / source — different from Activity's agent/stage/kind because Artifacts is a list, not a timeline), `Open in viewer` is the topbar primary action. **0 kit-tabs, 0 writeback chip** (single-half monitor, correct — Artifacts is read-only, you steer on the stage tab rules). Chunk-6 evidence = 42/42 ✓ (35/42 on first pass + 7 false-negatives re-verified by direct include — 4 plain-text sidebar links + 2 negative checks confirmed + line-count returned a value not an int).

**Next session starts at:** **Phase 2 COMPLETE.** All N1–N11 shipped. No ⬜ Pending items remain. Open follow-up (if any session picks this up): the `requirements.html` topbar gap (no `← Projects` + `Search this project…` — see Known follow-up at the bottom), or start implementation work in the launcher `src/` tree against these mocks. **See Chunk 6 below for the wrap-up record.**

---

## Chunk Tracker

| # | Item | File · Location | Status | Done in |
|---|---|---|---|---|
| N11 | UI kit additions (5 new components) | `mockups.html` · `#s11` | ✅ Done | Chunk 1 · 2026-08-27 |
| N1  | State D confirmation view (new `id="sD"`) | `background.html` · after `s14` | ✅ Done | Chunk 1 · 2026-08-27 |
| N2  | Blocked-state read-only redesign (`#s4`) | `mockups.html` · `#s4` | ✅ Done | Chunk 2 · 2026-08-27 |
| N3  | Outstanding questions section (`#s8` chat side panel) | `mockups.html` · `#s8` (+ `#s8b` active-state sibling) | ✅ Done | Chunk 2 · 2026-08-27 |
| N4  | Sprint "Connect Jira" setup state | `sprint.html` · `#s6b` | ✅ Done | Chunk 3 · 2026-08-27 |
| N5  | Design tab mockup | new `design-tab.html` · `#sd` | ✅ Done | Chunk 3 · 2026-08-27 |
| N6  | Build tab mockup | new `build-tab.html` · `#sbu` | ✅ Done | Chunk 4 · 2026-08-27 |
| N7  | QA tab mockup | new `qa-tab.html` · `#sq` | ✅ Done | Chunk 4 · 2026-08-27 |
| N8  | Agents tab mockup | new `agents-tab.html` · `#sag` | ✅ Done | Chunk 5 · 2026-08-27 |
| N9  | Activity tab mockup (filters: agent / stage / kind) | new `activity-tab.html` · `#sac` | ✅ Done | Chunk 5 · 2026-08-27 |
| N10 | Artifacts tab mockup | new `artifacts-tab.html` · `#sar` | ✅ Done | Chunk 6 · 2026-08-27 |

**Chunk 1 — what was actually shipped:**

- `mockups.html` `#s11` UI kit gained 5 new kit-sections (CSS + markup): **N11a Status/Rules tab switch**, **N11b Locked-tab greyed WCAG treatment** (with hover/focus tooltip "Confirm project context first"), **N11c Outstanding questions** (locked empty state + active read-only list grouped by `Blocker-for:`), **N11d Connect Jira setup state** (with project key, base URL, sync, auth fields), **N11e State D confirmation view** (mint check + 5-band summary + lavender explainer + 17-artifact Approved list + Confirm / Back actions).
- `background.html` gained `id="sD"` section after `s14` rendering State D inside the canonical per-project shell (canonical topbar, 10-tab sidebar with Sprint/Design/Build/QA greyed, Project Background focus). Uses the same `.state-d-*` rules as the kit.

**Chunk 2 — what was actually shipped:**

- `mockups.html` `#s4` Outstanding questions card rewritten: per-question `Open chat to answer →` buttons removed; replaced with read-only `.oq-list` (using kit classes) grouped under a single `Blocker-for: Requirements` heading; subtext now "The BA Agent is waiting on these before finalising requirements. Open the chat to answer."; one panel-level `Open chat →` button resumes the intake BA chat. Pill count bumped from 3 to 7 to match the new list.
- `mockups.html` `#s8` chat side panel gained an **Outstanding questions section** below the Tip box. Uses kit classes (`.oq-empty` with info-icon SVG). No per-item actions — read-only.
- New `mockups.html` `#s8b` active-state sibling: same Screen-8 chrome but with `oq-list` rendered (3 questions grouped under `Blocker-for: Requirements` + 1 under `Blocker-for: Design`), plus a footer hint "Read-only here. Answer in the chat on the left." So the locked-vs-active transition is visible side-by-side.

**Chunk 3 — what was actually shipped:**

- `sprint.html` `#s6b` (new section, sibling to the existing Kanban) renders the **Connect Jira setup state**: full per-project shell chrome with Sprint active in the sidebar (10-tab order), project header pill `Sprint · Blocked` (rose) with `0 Jira tickets · setup required` annotation, lavender `jira-gate` banner explaining why the state exists ("Sprint is the master story board — until a Jira project is linked, the board can't render") + `Learn more →` link, and a `.setup-card` form with 6 fields (Project key, Base URL, Account email, API token, Sync direction dropdown, Auto-create dropdown), a permission-detail help line (`What gets shared` / `What stays local` / `View permission detail →`), and a `Connect Jira` primary + `Use CSV export instead` ghost button row. Below the form, a "After you connect" preview card explains the 4-step flow (BA pushes 14 requirements as TM-1…TM-14, Design A/B pick up stories, Code Agents 1/2/3 build in parallel, 30s two-way sync). Side promo updated to "Jira not connected" with a `Connect Jira →` affordance. The original `#s6` Kanban screen is unchanged. CSS: `.setup-card`, `.setup-h`, `.setup-row`, `.setup-actions`, `.setup-help`, `.setup-divider`, `.jira-gate` (with `.jira-gate .ico`, `.jira-gate b`, `.jira-gate .sub`, `.jira-gate .right`).
- New file `design-tab.html` `#sd` renders the **Design tab Status half**: full per-project shell with Design active, topbar (`← Projects` + `Search this project…` + Filter / Export / `+ New design rule`), project header with `Design` pill + `DSGN-01 … DSGN-14` mono tag, 7-stage stepper with Design active, **`kit-tabs` Status/Rules switch** with `Status` on + `writes to → design-system/` writeback chip, a 4-tile `.ds-stats` summary (Being designed / In peer review / Design complete / Ready for development), a per-story design list with 5 rows each showing the 5-state **inline ds-stepper** (Picked up → In design → Peer review → Design complete → Ready for dev) with done/active styling, a selected story `DSGN-08` expanded into a 2-column detail: **left = hybrid artifacts viewer** (Tokens tab rendering 5 in-app swatches + status pill interaction states in-app + Wireframe `Open in Figma ↗` card with file/page/frame/last-edit metadata), **right = A↔B review thread** (3 comments with disagree callout on the status-pill dot/text-darken debate + compose box). Below: **Design agent strip** with two `.agent-card` (DA + DB) showing agent name, current story, elapsed/ETA, active pill, and a11y chip (4/5 vs 3/5). Footer: rules-preview callout pointing to the Rules tab. CSS: `.kit-tabs`, `.ds-stats`, `.ds-stat`, `.story-row`, `.ds-stepper`, `.art-viewer`, `.art-tabs`, `.figma-card`, `.thread`, `.comment.a/.b`, `.disagree`, `.compose`, `.agent-card`, `.a11y-chip`, `.rules-preview`. Self-contained (no shared CSS), so the file is portable.

**Chunk 4 — what was actually shipped:**

- New file `build-tab.html` `#sbu` renders the **Build tab Status half**: full per-project shell with Build active in the sidebar (10-tab order, Build badge = `14` Jira ticket count), topbar (`← Projects` + search + Filter / Export / `+ New build rule`), project header with `Build` pill + `TM-12 … TM-25` mono tag, 7-stage stepper with Build active (step 4), **`kit-tabs` Status/Rules switch** with `Status` on + `writes to → code-builder/ + skills/coding-guidelines.md` writeback chip, a 4-tile `.bd-stats` summary (Being built / Ready for review / Ready for QA / Deployed to QA env with sub-status `Build · 5 passed · 0 failed · 2 in rework`), a per-story build list with 5 rows each showing the 5-state **inline bd-stepper** (Picked up → Building → Self-review → Ready for review → Ready for QA), a selected story `TM-19` expanded into a 2-column detail: **left = architecture panel (read-only)** with `.ro` "Read-only" badge, `inferred by agents` annotation, and 5 rows (FE / BFF / BE / DB / Host) each with mono code chips and a `lock · edit Rules` hint on Host; **right = per-story code-review thread** for PR #214 (2 comments: Code Agent 1 self-review pass + Reviewer Agent with 2 nits + `✗ 1 unresolved (a11y)` meta line + compose box). Below: **rework queue** mini-card with 2 rows (TM-17 from QA fail + TM-15 from Review fail) showing failed-at pill + `qa-evidence/...` link + `Open →` button. Bottom: **3-Code-Agent strip** (C1/C2/C3) with avatar color-coded (sky/sea/butter), current story, elapsed/ETA, and `pass-rate chip` (4/5, 5/5, 3/5). Footer: rules-preview callout pointing to the Rules tab. Side promo updated to "Build rules · edits to build/deploy rules, environments, and coding guidelines write back to `code-builder/`" with `View code-builder/ →` link. CSS: `.bd-stats`, `.bd-stat`, `.story-row`, `.bd-stepper`, `.arch`, `.arch-card`, `.arch-row`, `.thread`, `.comment.c1/.c2/.c3/.rev`, `.compose`, `.rework-row`, `.agent-card.c1/.c2/.c3`, `.pass-chip`, `.rules-preview`. Self-contained (no shared CSS) following the `design-tab.html` pattern.

- New file `qa-tab.html` `#sq` renders the **QA tab Status half**: full per-project shell with QA active in the sidebar (10-tab order, QA badge = `2` failing/pending test count), topbar (`← Projects` + search + Filter / Export / `Re-run all tests` primary), project header with `QA` pill + `TM-12 … TM-25` mono tag, 7-stage stepper with QA active (step 6), **`kit-tabs` Status/Rules switch** with `Status` on + `writes to → testing/` writeback chip, a 4-tile `.qa-stats` summary (Ready for QA / In QA / Passed / Failed with `8/10 = 80%` + `2/10 = 20%` pass-rate hint in corner), a per-story QA test list with 5 rows each showing the inline `tests-strip` (pass/fail/skip dots + `n/n` count) + screenshot thumbnails (`ok` gradient + `fail` gradient with `✕` overlay + `+N` more) + per-row `Re-run` button, a selected story `TM-17` (failed) expanded into a 2-column detail: **left = screenshot viewer + test list** — the screenshot stage shows a stylized 16:9 frame with a `.annot` callout ("Tab order skips 'Active' chip — focus jumps from 'All' to 'Inactive'") pinned to the failing UI region, with toolbar (Prev / `qa-evidence/...` filename / Download / Open in viewer / Next), followed by a 5-row test list (Render / All chip / Keyboard focus [failed] / Empty state [skipped] / Active chip [skipped]); **right = per-story test thread** (2 comments: QA Agent reporting test 3 fail + Reviewer Agent confirming the a11y regression with `src/components/PropertyListFilters.tsx` ref + compose box). Bottom: **QA tools panel** showing the two config cards — Playwright config (Browser: chromium/firefox/webkit · Headed: false · Trace: on-first-retry · Retries: 2 in CI / 0 locally · Base URL: `qa-env-3d1a.fly.dev`) and Test rules in force (A11y: WCAG 2.1 AA · axe-core · Fidelity: pixel-snap critical screens · Coverage: ≥1 happy + 1 error test · Screens: per-step · 3 most-recent kept). Side promo updated to "QA rules · edits write back to `testing/`" with `View testing/ →` link. CSS: `.qa-stats`, `.qa-stat`, `.qa-row`, `.tests-strip`, `.thumb.ok/.fail`, `.shot-stage`, `.annot`, `.test-list`, `.thread`, `.comment.qa/.rev`, `.compose`, `.tools`, `.tools-card`, `.tools-row`, `.rules-preview`. Self-contained (no shared CSS) following the same portable pattern.

**Consistency wins across Chunks 3–4:** all three new tab files (`design-tab.html`, `build-tab.html`, `qa-tab.html`) share the canonical per-project shell (10-tab sidebar with the right active marker, topbar = `← Projects` + search + tab-specific actions, project header with stage pill + `…-NN` mono tag, 7-stage stepper with the right step active, kit-tabs Status/Rules switch with the right tab on + the right `writes to →` writeback chip). The pattern is now stable — N8 / N9 / N10 should follow it.
- New file `design-tab.html` `#sd` renders the **Design tab Status half**: full per-project shell with Design active, topbar (`← Projects` + `Search this project…` + Filter / Export / `+ New design rule`), project header with `Design` pill + `DSGN-01 … DSGN-14` mono tag, 7-stage stepper with Design active, **`kit-tabs` Status/Rules switch** with `Status` on + `writes to → design-system/` writeback chip, a 4-tile `.ds-stats` summary (Being designed / In peer review / Design complete / Ready for development), a per-story design list with 5 rows each showing the 5-state **inline ds-stepper** (Picked up → In design → Peer review → Design complete → Ready for dev) with done/active styling, a selected story `DSGN-08` expanded into a 2-column detail: **left = hybrid artifacts viewer** (Tokens tab rendering 5 in-app swatches + status pill interaction states in-app + Wireframe `Open in Figma ↗` card with file/page/frame/last-edit metadata), **right = A↔B review thread** (3 comments with disagree callout on the status-pill dot/text-darken debate + compose box). Below: **Design agent strip** with two `.agent-card` (DA + DB) showing agent name, current story, elapsed/ETA, active pill, and a11y chip (4/5 vs 3/5). Footer: rules-preview callout pointing to the Rules tab. CSS: `.kit-tabs`, `.ds-stats`, `.ds-stat`, `.story-row`, `.ds-stepper`, `.art-viewer`, `.art-tabs`, `.figma-card`, `.thread`, `.comment.a/.b`, `.disagree`, `.compose`, `.agent-card`, `.a11y-chip`, `.rules-preview`. Self-contained (no shared CSS), so the file is portable.

**Chunk 5 — what was actually shipped:**

- New file `agents-tab.html` `#sag` renders the **Agents tab** as a single-half monitor (not Status/Rules — Agents is always-visible, no rules half; you steer via the stage tab rules). Full per-project shell with **Agents active** in the sidebar (10-tab order, no badge). Topbar: `← Projects` + search + Filter / Export / `Reroute assignments`. Project header: `6 active` / `2 idle` pills + `8 agents active` annotation. 7-stage stepper with **Build active** (orchestrator's current focus). Below: **8-agent roster** (`.agent-card` × 8 in a 4-column grid) — BA peach, Design A sky, Design B sea, **Code 1 mint (selected)** / Code 2 butter / Code 3 blush (blocked), QA lavender, Reviewer sea — each with avatar / name / role / current task / status pill (active · idle · blocked) / elapsed / ETA / stage. Followed by the **3-Code-Agent strip** callout (`.code-strip` with `moved from Sprint` badge, gradient bg, `View Sprint board →` button, "Sprint is board-only — code progress lives here" hint) holding 3 `.code-card` (C1/C2/C3) with avatar, role colour, current story + sub, progress bar (mint/green or amber), elapsed/ETA, and pass-rate chip (4/5 · 5/5 · 3/5 warn). Below: **selected agent detail** (Code 1) in a 2-column layout — left = `Assignment` meta-card (current story + ETA, PR #214 + 2 nits, rules in force, memory bank) + `Recent work` work-card (5 commits with hash / title / pushed-merged-branch pill / +N −M), right = `Recent activity (last 30m)` activity-card (5 events with tiny avatars) + `Steer here` meta-card (Build rules link, memory bank, Reroute / Pause links). Side promo: "Always visible — Agents is a monitor, not a workspace." CSS: `.roster`, `.agent-card`, `.agent-card.selected`, `.av-ba/.av-da/.av-db/.av-c1/.av-c2/.av-c3/.av-qa/.av-rev/.av-orc`, `.code-strip`, `.code-strip .strip-head .badge`, `.code-card.c1/.c2/.c3`, `.agent-detail`, `.detail-head .av-lg`, `.meta-card`, `.meta-row`, `.work-card`, `.work-row`, `.activity-card`, `.act-row`, `.av-sm.a-*`, `.pass-chip.warn`, `.notes`. Self-contained (no shared CSS), following the `design-tab.html` / `build-tab.html` / `qa-tab.html` portable pattern.

- New file `activity-tab.html` `#sac` renders the **Activity tab** as a single-half monitor (no Rules half — to change what the agents do, edit the stage tab rules). Full per-project shell with **Activity active** in the sidebar (10-tab order, clock icon, no badge). Topbar: `← Projects` + search + Export / `Subscribe →` / `Pin row`. Project header: `Live` pill (sky/blue) + `Updated 4s ago` + `3,418 events · 28 days`. 7-stage stepper with **Build active**. Below: **3-axis filter bar** (`.filters` row) with axis-lbl chips per the confirmed 2026-08-27 set — **Agent** (BA / DA / DB / C1 / C2 / C3 / QA / RV / OR with role-tinted `.av-tiny` + `.on` state for multi-select), **Stage** (Intake / Requirements / Design / Build / Review / QA / Deployed), **Kind** (commit / review / test / design / chat / system / gate) — right-side summary chip showing `3 agents · Build · 2 kinds → 11 of 3,418 events` + Clear all / Save filter. Below: **timeline** (`.timeline`) with **3 day dividers** (Today / Yesterday / 2 days ago, each with `.line` rail and event count) and **11 events** (`.tl-row`) — 2 pinned (orchestrator system + gate events, gradient bg). Each row: 36px role-coloured `.node` avatar in a vertical `.tl-rail` (using sitemap spec palette: BA peach, DA sky, DB sea, C1 mint, C2 butter, C3 blush, QA lavender, RV sea, OR navy), timestamp, body (who + role + msg with `code` chips + story PR links), inline stage pill, kind-tag chip (`.kind-tag.commit/.review/.test/.test.fail/.design/.chat/.system/.gate` with role-tinted SVG icons). Includes 2 rows with **evidence** (`.evid` — 3 thumbnails each, ok/fail gradient, with `qa-evidence/...` link). Footer: `Showing 11 of 3,418 events` + `Load 20 more ↓` + notes callout ("Read-only feed. Pin rows to surface the ones you keep checking; saved filters are per-user and apply to the Overview right-column feed too."). Side promo: "Filter tips — stack filters to narrow down." CSS: `.filters`, `.filters .axis`, `.filters .axis button.on`, `.filters .axis-lbl`, `.av-tiny.*`, `.timeline`, `.day-head`, `.tl-row`, `.tl-rail::before` (vertical connector), `.tl-rail .node.*` (full role palette), `.tl-when`, `.tl-body .who / .msg`, `.tl-body .msg code / .ref`, `.tl-body .evid`, `.evid .thumb.ok / .thumb.fail`, `.tl-stage .pill`, `.tl-kind .kind-tag.commit / .review / .test / .test.fail / .design / .chat / .system / .gate`, `.tl-row.pinned` (gradient bg), `.notes`. Self-contained (no shared CSS), following the same portable pattern.

**Suggested chunk ordering** (one session at a time, in this order):

1. **Chunk 1 ✅** N11 + N1 — UI kit + State D. Gives the next 5 new tab mockups a visual spec to defer to.
2. **Chunk 2 ✅** N2 + N3 — in-flight redesigns in existing files. Small, high-impact, easy verification.
3. **Chunk 3 ✅** N4 + N5 — Connect Jira + Design tab. Sprint setup state + first new full tab. Established the `design-tab.html` pattern (self-contained file, self-contained CSS, one Status half in this session) — N6 / N7 should follow the same pattern (new `build-tab.html` + `qa-tab.html`).
4. **Chunk 4 ✅** N6 + N7 — Build + QA tabs. Both follow the `design-tab.html` self-contained file pattern with their own Status half.
5. **Chunk 5 ✅** N8 + N9 — Agents + Activity tabs. Both single-half monitors (no kit-tabs) — Agents hosts the full 8-agent roster + 3-Code-Agent strip (moved from Sprint per sitemap § Sprint decision 6); Activity uses the confirmed filter set (agent / stage / kind) and the sitemap activity-timeline palette. Established the **single-half monitor pattern** (no kit-tabs, no writeback chip — these are read-mostly, you steer via the stage tab rules) that the next chunk (N10 Artifacts) should follow.
6. **Chunk 6 ✅** N10 — Artifacts tab (last; smallest scope). Single-half monitor pattern (no kit-tabs, no writeback chip). Full-width artifact file tree (kind tag, path, size, created_at) grouped by stage; opens via in-app viewer. **Phase 2 closed.**

Each chunk finishes with: the verification sweep (stale-label sweep + structural residue + active sidebar markers), an UPDATE-PHASE.md Chunk Tracker update, and a one-line "next session starts at" note at the top.

**Chunk 6 — what was actually shipped:**

- New file `artifacts-tab.html` `#sar` renders the **Artifacts tab** as a single-half monitor (no Rules tab — Artifacts is always-visible and read-only; you steer behavior on the stage tab rules). Full per-project shell with **Artifacts active** in the sidebar (10-tab order, 10th position, badge `27`). Topbar: `← Projects` + search (`Search artifacts (path, kind, story ID)…`) + Filter / Export / **`Open in viewer` primary** (the in-app viewer affordance is the top-level action). Project header: `27 files` pill (lavender) + `Updated 6s ago` + `~/Code/tenant-maintenance · 27 files · 1.4 MB · 28 days` annotation. 7-stage stepper with **Build active** (step 4). Below: **3-axis filter bar** (`.filters` row) — **Kind** (doc / code / design / evidence / config / archive with color-coded dots matching the kind-tag palette), **Stage** (Intake / Requirements / Design / Build / Review / QA / Deployed — different from Activity's filter because Artifacts is a list, not a timeline), **Source** (Agent / Human / External — third axis chosen to surface "did a human or an agent write this file"). Right-side summary chip `3 kinds · 4 stages · agent → 18 of 27 files` + Clear all / Save filter. Below: **file tree** (`.tree`) with **7 stage groups** (Intake 1 file, Requirements 15, Design 3, Build 4, Review 0 + empty-state note, QA 3, Deployed 0 + empty-state note) each with a group-head icon + label + count + size + thin underline. Each row: 5-column grid — **kind tag** (color-coded: doc lavender, code butter, design blush, evidence sky, config mint, archive grey) with SVG icon, **file path** mono with `├─ / └─` indent (last-row of each group) + `.ext` muted, **size** mono right-aligned, **created_at** mono, **open actions** (Open button per row + `⋯` more menu). Figma wireframe link gets `Open in Figma ↗` instead of `Open`. Selected row gets a left-border highlight + lavender gradient bg. Below: **in-app viewer** (`.viewer`, 2-col) — left = viewer head (kind tag + filename + path + Copy path / Reveal in Finder / Close toolbar) + `.doc-stage` rendering of `idea.md` with H1, meta, H2, paragraphs, ul, code chips, and a yellow "Pinned" callout for the §MVP summary; right = **Artifact info meta panel** (9 fields: kind, path, size, created, last opened, stage, writers, read by, status with `.pill live`) + **Related artifacts panel** (5 related files with `Open →` / `Open in Figma ↗`). Footer: `Showing 18 of 27 files (filter: …)` + `Load 9 more ↓` + notes callout ("Read-only tree. Artifacts is a monitor — nothing here writes back. To steer what the agents produce, edit the rules on the stage tab. Click any file to open in the in-app viewer (no downloads)."). Side promo: "Everything ever generated — PRD docs, design tokens, code, screenshots, QA evidence — all in one tree. Opens in-app; nothing leaves the project." CSS: `.art-row` (5-col grid + selected state with left border + gradient), `.art-row .kind.doc/code/design/evidence/config/archive` (full kind palette), `.art-row .path .indent` + `.name` + `.ext` (mono path with tree-guide chars), `.group-head` (h + ico + line + ct), `.viewer` 2-col grid, `.doc-stage` (H1/H2/p/ul/code/pinned), `.meta-card` + `.meta-row` + `.related` + `.rel-row` + `.open`, `.notes` (dashed border). Self-contained (no shared CSS) following the same portable pattern as `design-tab.html` / `build-tab.html` / `qa-tab.html` / `agents-tab.html` / `activity-tab.html`.

**Phase 2 — DONE.** All 11 items (N1–N11) shipped across 6 chunks. 6 self-contained tab mockup files now live in `design/`: `design-tab.html` (Design), `build-tab.html` (Build), `qa-tab.html` (QA), `agents-tab.html` (Agents), `activity-tab.html` (Activity), `artifacts-tab.html` (Artifacts). 4 mockups with per-project shell (10-tab sidebar + canonical topbar + project header + 7-stage stepper) updated in place: `mockups.html` (`#s4` blocked-state + `#s8`/`#s8b` chat side panel + `#s11` UI kit), `background.html` (new `#sD` State D gate confirmation), `requirements.html` (canonical shell), `sprint.html` (new `#s6b` Connect Jira setup). **Stable patterns established for implementation:** (a) the canonical per-project shell (10-tab sidebar with the right active marker + topbar = `← Projects` + search + tab-specific actions + project header with stage pill + `…-NN` mono tag + 7-stage stepper with the right step active); (b) the Status/Rules two-halves pattern with `kit-tabs` + `writes to →` writeback chip (Design / Build / QA); (c) the single-half monitor pattern (Agents / Activity / Artifacts — no kit-tabs, no writeback chip, you steer on the stage tab rules); (d) the in-app viewer affordance for opening any file (Artifacts, `View idea.md` from Project Background, Figma for wireframes); (e) the locked-tab greyed WCAG treatment for un-confirmed project context; (f) the `Open chat →` → intake chat resume pattern for blocked-stage outstanding questions.

---

## Verification sweep (run after every chunk)

- **Stale-label sweep** (`PRD stage|PRD · In Progress|Features shipped|next stop is the PRD|file-status completed|>Jira<|class="count">Jira</span>` across all 3 mockups) → **0 matches**.
- **Structural residue** (`Chats</th>`, `Chats<`, `Next milestone`) → **0 matches**.
- **Active sidebar markers**: should match the expected set per file (see Phase 1 ledger row 22).
- **New-chunk-specific checks** (listed in each chunk's handoff note).

**Final sweep (Phase 2 complete — 2026-08-27, Chunk 6):** stale-label = 0 across all **10** mockup files (incl. `artifacts-tab.html`); structural residue = 0; active sidebar markers = exactly 1 per tab-mockup file (Design on `#sd`, Build on `#sbu`, QA on `#sq`, Agents on `#sag`, Activity on `#sac`, Artifacts on `#sar`); all 11 phase-2 chunk evidence totals = 22 + 22 + 34 + 34 + 22 + 42 = **176 / 176** ✓ across the 6 chunks.

---

## Known follow-up (carry forward)

- **`requirements.html` topbar gap.** P2b #21 verified the topbar has no Share / Open-in-Claude-Code (good), but it is also missing `← Projects` + `Search this project…` entirely. Fix as part of whichever Phase 2 task first touches `requirements.html` (none of N1–N11 do — track for a future touch).

---

## Phase 1 — Stale-label fix-list (apply to existing mockups) — **DONE**

Sourced from the full stale-label audit. Verified compliant areas (no action): mockups R1/R3/R4/R6; background R4; requirements R1/R2/R4/R5/R6.

### P0 — Structural (do first)

| # | File:line | Issue | Fix |
|---|---|---|---|
| 1 | `mockups.html` 1841, 1993, 2196, 2298 (×4) | Sidebar missing **Sprint** tab (9 tabs) | Insert Sprint between Requirements & Design |
| 2 | `background.html` 1577, 1809, 2008 (×3) | Sidebar missing Sprint (locked state, pre-confirmation) | Insert Sprint (disabled/greyed WCAG) |
| 3 | `requirements.html` 1565 | Sidebar only 7 tabs — missing **Sprint, Activity, Artifacts** | Add all three in canonical order |
| 4 | `mockups.html` 2303 | Sprint screen `#s6` marks **Build** active | Mark **Sprint** active/focus |
| 5 | `mockups.html` 1699 | **"Next milestone" card** still rendered | Remove (no milestone card, no due dates) |
| 6 | `mockups.html` 1718 (+ cells ~1726, 1739) | **"Chats" column** in table | Remove column + cells |
| 7 | `mockups.html` 1690-1696 | Pipeline ring legend mixes stage names + stale status words | Rebuild around 5 statuses / stage model |

### P1 — Status-pill vocabulary (canonical 5: active, blocked, on_hold, cancelled, done)

| # | File:line | Issue | Fix |
|---|---|---|---|
| 8 | `mockups.html` 1605, 1618, 1631, 1670, 1727, 1740, 1766 | Tiles/table show `In Progress`/`In Review`/`Planning`/`Drafting` as project status | Replace with stage label alone (e.g. `Build`, `Design`, `Requirements`) |
| 9 | `mockups.html` 1644, 1753 | Bare `Blocked` pill | `Stage · Blocked` (rose) |
| 10 | `mockups.html` 1909, 2338 | Overview/Sprint panels `In Progress` | Stage label alone |
| 11 | `mockups.html` 2048 | Overview blocked panel `In Progress` | **`Requirements · Blocked`** (rose) per Section 5 |
| 12 | `background.html` 1598, 1830, 2029 | `PRD · In Progress` project pill | `Requirements` |
| 13 | `background.html` 1568, 1569 | `PRD stage` / `default landing for PRD-stage` | `Requirements stage`; **R6: Overview is the landing** → "focus tab for Requirements-stage" |
| 14 | `background.html` 1582, 1814, 2013; `requirements.html` 1570 | Build badge literal `Jira` | Jira ticket **count** (mockups already uses counts) |

### P2 — UI kit + soft text

| # | File:line | Issue | Fix |
|---|---|---|---|
| 15 | `mockups.html` 2771-2776, 2898 | Kit status pills stale; missing `Cancelled` | Rebuild to canonical 5: `Active (stage alone)` · `Stage · Blocked` · `Stage · On hold` · `Cancelled` · `Deployed` |
| 16 | `mockups.html` 2263 | `Features shipped` caption | `Features deployed` |
| 17 | `mockups.html` 2436, 2441 | Kanban "Done" card label `shipped` | `done` |
| 18 | `mockups.html` 2607 | `next stop is the PRD` | `next stop is Project Background` |

### P2b — Topbar cleanup (Section 4: remove Share + Open in Claude Code from every in-project topbar)

| # | File | Lines | Fix |
|---|---|---|---|
| 19 | `mockups.html` | in-project topbars on `#s3`, `#s4` (2013-2014), `#s5`, `#s6` (2323-2325) | Remove `Share` + `Open in Claude Code →`. Shell topbar = `← Projects` + `Search this project…` only. Relocate tab-specific actions (Filter/Sprint/+Add issue on `#s6`) into the tab's own action bar. |
| 20 | `background.html` | 1599-1600 (+ equivalent topbars in s13 ~1809-area, s14 ~2008-area) | Remove `Share` + `Open in Claude Code →` |
| 21 | `requirements.html` | topbar (1582) | Already clean — verify, no change expected |

### P3 — Code-only class names (optional alignment, not user-visible)

| # | File:line | Issue |
|---|---|---|
| 22 | `mockups.html` 334, 424, 641, 1657, 1779, 2229, 2239, 2777, 2808 | CSS class `.shipped` styles terminal state (visible text already "Deployed") → rename `.deployed` |
| 23 | `background.html` 1616, 2046 | CSS class `.file-status completed` (visible text already "Approved") → rename `.approved` |

### P2c — Open-questions banner repurpose (Section 3)

| # | File:line | Issue | Fix |
|---|---|---|---|
| 24 | `background.html` 1623-1624 | Open-questions banner links `Open prd.md §11 →` | Deep-link into the intake chat's Outstanding questions section (filtered to `Blocker-for: PRD-approval`) |

---

## Phase 2 — New / changed designs to produce

| # | Where | What | Spec source |
|---|---|---|---|
| N1 | `background.html` — new section `id="sD"` after s14 | **State D** — dedicated context-ready confirmation view (mint checkmark header "Project context ready" → 5-band Approved summary 17/17 → lavender explainer → compact 17-artifact Approved list → `Confirm project context →` + `← Back to artifacts`) | Section 6 |
| N2 | `mockups.html` `#s4` (lines 2075-2139) | **Blocked-state read-only redesign** — remove textarea + `Skip — BA decides` + `Send answer` per question; show questions read-only; subtext → "Open the chat to answer."; keep `Open chat →` → resumes intake chat (Screen 8) | Section 5 |
| N3 | `mockups.html` `#s8` chat side panel (lines 2570-2583) | **Outstanding questions section** alongside "Interview progress"; greyed WCAG locked style until questions exist, then active + read-only list grouped by `Blocker-for:`; no per-item action (user is already in chat) | Section 3 |
| N4 | `mockups.html` `#s6` (or new state) | **Sprint "Connect Jira" setup state** — shown when Sprint unlocked but no Jira link; configure project key, base URL, sync, auth here (Jira is required) | Section 8 |
| N5 | new `design-tab.html` (or add to mockups) | **Design tab mockup** — Status/Rules tabs; Status = design summary, per-story list (Picked up→In design→Peer review A↔B→Design complete→Ready for development), Design agent strip A+B, artifacts viewer (hybrid: tokens/states in-app, wireframes/hi-fi → Figma), per-story A↔B review thread; Rules = editable design rules → `design-system/`; everything editable | Section 9 |
| N6 | new `build-tab.html` (or add to mockups) | **Build tab mockup** — Status/Rules tabs; Status = stories-in-build stats, rework queue (failed QA/review + evidence), architecture panel (read-only); Rules = editable build rules → `code-builder/` + `../skills/coding-guidelines.md` | Section 10 |
| N7 | new `qa-tab.html` (or add to mockups) | **QA tab mockup** — Status/Rules tabs; Status = QA summary, per-story test list + screenshots (first-class), QA tools panel (Playwright only), screenshot viewer with failure annotations, manual `Re-run tests` action; Rules = editable QA rules → `testing/` | Section 11 |
| N8 | new `agents-tab.html` (or add to mockups) | **Agents tab mockup** — roster (BA, Design A/B, Code 1/2/3, QA, Reviewer) with status/elapsed/ETA + agent detail; **3-Code-Agent strip moved here from Sprint** | Section 12 |
| N9 | new `activity-tab.html` (or add to mockups) | **Activity tab mockup** — full-width timeline, agent-coloured avatars; filters = **agent / stage / kind** (confirmed 2026-08-27) | Section 12 |
| N10 | new `artifacts-tab.html` (or add to mockups) | **Artifacts tab mockup** — full-width artifact file tree (kind, path, size, created_at); opens via in-app viewer | Section 12 |
| N11 | `mockups.html` `#s11` UI kit | Add new components to the kit: **Status/Rules tab pattern**, **locked-tab greyed WCAG treatment**, **Outstanding questions section** (locked + active states), **Connect Jira setup state**, **State D confirmation view** | Sections 0,3,6,8 |

---

## Phase 3 — `sitemap.md` updates (reflect locked decisions) — **DONE**

Update the canonical doc so it matches what was walked. Sections to revise:

- **Global conventions → Per-project sidebar:** clarify the sidebar stays **10 tabs** — Outstanding questions is NOT a sidebar tab (it lives in Screen 8's chat side panel). Correct any text implying 11.
- **Global conventions → Two halves:** now applies to **Design, Build, QA only** (Sprint is status-only). Add the **tabbed Status/Rules switch** pattern. Add the **locked-tab greyed WCAG** treatment spec.
- **Global conventions → Topbar:** in-project topbar = `← Projects` + `Search this project…` only (remove Share + Open in Claude Code from the contract). In-project search scope = artifacts + requirements (extensible). Projects-screen ⌘F = this-list-only.
- **Screen 1:** default sort `updated_at desc` (user-changeable); notifications bell deferred.
- **Screen 2:** adopt-folder stage inference deferred to implementation.
- **Screen 8:** add the **Outstanding questions section** to the chat side panel (locked→active spec). "Open chat →" = resumes intake chat.
- **Screen 9:** "next stop is Project Background"; `View idea.md` = in-app viewer.
- **Shared shell:** topbar cleaned (above); `Open idea.md →` = in-app viewer.
- **Overview (3/4/5):** blocked panel = read-only questions + `Open chat →` to intake chat (remove inline answer); blocked pill = `Stage · Blocked` (rose); stage-complete gating = **warn but allow** (confirm dialog); done state "Features deployed".
- **Project Background:** add **State D** contract (the dedicated confirmation view); open-questions banner → deep-link to intake chat Outstanding questions; re-lock on revoke = **keep unlocked, warn only**.
- **Requirements:** no change (compliant).
- **Sprint:** status-only (no Rules tab); **Jira required** + Connect Jira setup state; agent strip **moved to Agents tab**.
- **Design:** two-halves; **hybrid** artifacts viewer (tokens/states in-app, wireframes/hi-fi → Figma); **per-story A↔B review thread**; **everything editable**.
- **Build:** two-halves; architecture panel **read-only**.
- **QA:** two-halves; **manual re-run** available; tools **Playwright only**.
- **Agents:** roster + **Code Agent strip moved here from Sprint**.
- **Activity:** filters = agent / stage / kind (confirmed).
- **Artifacts:** in-app viewer.

---

## Suggested starting point for the next session

1. Read this file top-to-bottom so you see the Chunk Tracker + Phase 1 ledger + Phase 2 spec intact.
2. Read `project-launcher-design-standards.md` (auto-memory) — rationale for every locked decision.
3. Check the Chunk Tracker — the first ⬜ Pending item is the next chunk. Pick the next 2.
4. Skim `sitemap.md` § Per-project sidebar and § Topbar to confirm the contract is now aligned with what was built in Phase 1.
5. Tackle the next chunk in the suggested sequencing at the bottom of this doc.
6. Run the verification sweep, update the Chunk Tracker, change "next session starts at" at the top, write a 1-line handoff note.

---

## Open items resolved this session (2026-08-27)

- ~~Activity filter set = agent / stage / kind (proposed default).~~ → **Confirmed.** Use for N9.
- ~~Jira config home: in-Sprint "Connect Jira" setup state (proposed) vs a dedicated global Settings screen — proceed with in-Sprint unless user objects.~~ → **Confirmed in-Sprint.** Build N4 as the setup state.

## Phase 2 wrap-up (2026-08-27, end of Chunk 6)

**All 11 items in Phase 2 are shipped.** The 2-per-session rule held across all 6 chunks. No leftover work, no half-finished tab. The next session (if you pick this up) has three sensible entry points, in order of likely value:

1. **Implementation** — start building the launcher `src/` against the canonical per-project shell. The 6 self-contained tab mockups + the 4 in-place updated mockups are the visual spec; `sitemap.md` is the page contract; `project-launcher-design-standards.md` is the rationale. Sprint (Sprint tab) and Agents (Agents tab) are the two obvious first-implementation tabs because they have the most stable inputs.
2. **Known follow-up: `requirements.html` topbar gap.** P2b #21 verified the topbar has no Share / Open-in-Claude-Code (good), but it is also missing `← Projects` + `Search this project…` entirely. Fix as part of the first task that touches `requirements.html` (none of N1–N11 do — it was a 1-screen pass-through on the canonical shell).
3. **Mockup polish (optional).** The 6 self-contained tab files are portable; a future session could optionally consolidate the shared tokens (the `:root` block is duplicated across all 6) into a single shared stylesheet. **Not required** — each file is intentionally self-contained for portability and review.

If the user explicitly asks for "2 more at a time" before this work is done, the right answer is: Phase 2 is done; pick a new phase or move to implementation. The Chunk Tracker is clean.
