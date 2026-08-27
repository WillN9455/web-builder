# Launcher — Update Phase Execution Plan

**Purpose:** the executable plan for the update phase, produced at the end of the sitemap walkthrough on 2026-08-27. A separate session picks this up to apply changes to the mockups and `sitemap.md`.

**Paired with:** the locked decisions live in auto-memory `project-launcher-design-standards.md` (read it first — it has the rationale for every choice below). This file is the *what to change and where*; that memory is the *why*.

**Canonical source:** `design/sitemap.md`. **Files to edit:** `design/mockups.html`, `design/background.html`, `design/requirements.html`, `design/sitemap.md`, plus new mockups to create.

---

## Status — 2026-08-27 (session end)

**Done in this session:** **Phase 3** (sitemap.md, 18 edits) + **Phase 1** (24-item fix-list across the three existing mockups).
**Next session starts here:** **Phase 2** — the new/changed designs (N1–N11 below).
**Out of scope here, but flagged for Phase 2:** `requirements.html` topbar gap — see "Known follow-up" at the bottom of the Phase 1 ledger.

### Phase 1 — per-fix ledger

| # | File | Result |
|---|---|---|
| P0 #1 | mockups.html | ✓ Sprint tab inserted in 4 sidebars (#s3, #s4, #s5, #s6) |
| P0 #2 | background.html | ✓ Sprint tab inserted in 3 sidebars with `aria-disabled="true"` + tooltip (WCAG locked-tab) |
| P0 #3 | requirements.html | ✓ Sprint + Activity + Artifacts tabs added (7 → 10) in canonical order |
| P0 #4 | mockups.html #s6 | ✓ `class="active"` moved Build → Sprint |
| P0 #5 | mockups.html | ✓ "Next milestone" card removed |
| P0 #6 | mockups.html | ✓ Chats column header + 5 body cells removed |
| P0 #7 | mockups.html | ✓ Pipeline ring legend rebuilt (canonical 5 statuses + 7 stages) |
| P1 #8–10 | mockups.html | ✓ 14 status-pill copy-text sites mapped to canonical-5 (stage-label alone, `Stage · Blocked`, etc.) |
| P1 #11 | mockups.html | ✓ Overview blocked pill → `Requirements · Blocked` (rose) |
| P1 #12 | background.html | ✓ `PRD · In Progress` → `Requirements` × 3 |
| P1 #13 | background.html | ✓ `PRD stage` → `Requirements stage`; `default landing` → `focus tab` |
| P1 #14 | background.html + requirements.html | ✓ Build `Jira` literal badge → numeric count (4 sites total) |
| P2 #15 | mockups.html | ✓ UI kit status pills + project card sample rebuilt to canonical-5 |
| P2 #16 | mockups.html | ✓ `Features shipped` → `Features deployed` |
| P2 #17 | mockups.html | ✓ Kanban `kprog shipped` → `kprog done` × 2 |
| P2 #18 | mockups.html | ✓ `next stop is the PRD` → `next stop is Project Background` |
| P2b #19 | mockups.html | ✓ Share + Open-in-Claude-Code removed from 3 in-project topbars; line 2748 UI kit specimen intentionally preserved |
| P2b #20 | background.html | ✓ Share + Open-in-Claude-Code removed from 3 in-project topbars |
| P2b #21 | requirements.html | ⚠ Topbar already clean (no Share, no Open-in-Claude-Code), but missing `← Projects` + `Search this project…` entirely. **See "Known follow-up" below.** |
| P2c #24 | background.html | ✓ Open-questions banner repointed: `Open prd.md §11 →` → `Open in intake chat →` with deep-link `?section=outstanding&filter=Blocker-for%3A%20PRD-approval`. On-disk file stays `prd.md`. |
| P3 #22 | mockups.html | ✗ Skipped intentionally — `.shipped` has 4 distinct semantics (`.pill.shipped`, `.step.shipped`, `.pipeline-mini span.shipped`, copy-words). CSS class rename risk > reward; copy-words handled in P2 #16–17. |
| P3 #23 | background.html + requirements.html | ✓ `.file-status.completed` → `.file-status.approved` (1 CSS rule + 7 markup uses across 2 files — caught only after a stale-label sweep; requirements.html was missed in the original plan) |

### Phase 3 — sitemap.md edits

18 edits applied. Cover: re-lock note; two-halves narrowing to Design/Build/QA; tabbed Status/Rules switch spec; locked-tab greyed WCAG treatment; in-project topbar spec (← Projects + Search only); Screen 1 default sort + deferred bell; Screen 2 adopt-folder defer; Screen 8 Outstanding questions section spec; Screen 9 next-stop + in-app viewer; shared shell topbar + idea.md in-app viewer; Overview blocked state; Project Background banner re-target + re-lock note; Sprint status-only + Jira-required note + agent-strip-moved flag; Design/Build/QA two-halves + per-tab content; Agents code-strip; Activity filters; Artifacts in-app viewer; cross-links.

### Verification

- **Stale-label sweep** (`PRD stage|PRD · In Progress|Features shipped|next stop is the PRD|file-status completed|>Jira<|class="count">Jira</span>` across all 3 mockups) → **0 matches**.
- **Structural residue** (`Chats</th>`, `Chats<`, `Next milestone`) → **0 matches**.
- **Active sidebar markers**: mockups.html — Overview × 3 (s3/s4/s5), Sprint × 1 (s6), Projects × 1 (all-projects sidebar), 2× pipeline ring legends; background.html — Project Background × 3 (pre-confirmation states); requirements.html — Requirements × 1. All correct.
- **Sprint tab counts**: mockups 4, background 3, requirements 1. Correct.
- **`aria-disabled` Sprint sites in background**: 3 (locked/greyed per WCAG). Correct.
- **`git diff --stat`** after this session: `launcher/design/background.html +37/−?`, `launcher/design/mockups.html +80/−?`, `launcher/design/requirements.html +17/−?`, `launcher/design/sitemap.md +146/−?` (final line counts depend on Edits applied during Phase 1; the plan-level +148/−132 figure was the snapshot at ledger creation).

### Known follow-up (carry into Phase 2)

- **`requirements.html` topbar gap.** P2b #21 verified the topbar has no Share / Open-in-Claude-Code (good), but it is also missing `← Projects` + `Search this project…` entirely. The full canonical in-project topbar treatment needs to be applied here in Phase 2 (or as a one-line addition when Phase 2 first touches requirements.html).
- **Activity filter set** is still "proposed default" per the original walkthrough — confirm with the user before building the Activity tab mockup (N9).
- **Jira config home** — Phase 2 N4 (Sprint "Connect Jira" setup state) is the proposed default. Confirm before building.

### Suggested starting point for the next session

1. Read this file top-to-bottom so you see the Phase 1 ledger + the original Phase 2 spec intact below.
2. Read `project-launcher-design-standards.md` (auto-memory) — rationale for every locked decision.
3. Skim `sitemap.md` § Per-project sidebar and § Topbar to confirm the contract is now aligned with what was built in Phase 1.
4. Resolve the two open items (Activity filter set + Jira config home) with the user before starting mockups.
5. Tackle Phase 2 in the suggested sequencing at the bottom of this doc: **N11 (UI kit) → N1–N4 (new states in existing files) → N5–N10 (six new tab mockups).**
6. Fix the `requirements.html` topbar gap as part of whichever Phase 2 task first touches that file (likely N1 or N11).

---

## Phase 1 — Stale-label fix-list (apply to existing mockups)

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
| N9 | new `activity-tab.html` (or add to mockups) | **Activity tab mockup** — full-width timeline, agent-coloured avatars; filters = agent / stage / kind (proposed default — confirm in update phase) | Section 12 |
| N10 | new `artifacts-tab.html` (or add to mockups) | **Artifacts tab mockup** — full-width artifact file tree (kind, path, size, created_at); opens via in-app viewer | Section 12 |
| N11 | `mockups.html` `#s11` UI kit | Add new components to the kit: **Status/Rules tab pattern**, **locked-tab greyed WCAG treatment**, **Outstanding questions section** (locked + active states), **Connect Jira setup state**, **State D confirmation view** | Sections 0,3,6,8 |

---

## Phase 3 — `sitemap.md` updates (reflect locked decisions)

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
- **Activity:** filters = agent / stage / kind (proposed).
- **Artifacts:** in-app viewer.

---

## Suggested sequencing

1. **Phase 3 first (sitemap.md)** — update the canonical doc so it's the source of truth for the work that follows.
2. **Phase 1 (fix-list)** — mechanical edits to the three existing mockups; high confidence, no new design.
3. **Phase 2 N11 (UI kit)** — add the new shared components to `#s11` so the new tab mockups have a visual spec to defer to.
4. **Phase 2 N1–N4** — the new states in existing files (State D, `#s4` redesign, Screen 8 OQ section, Sprint Connect-Jira).
5. **Phase 2 N5–N10** — the six new tab mockups (Design, Build, QA, Agents, Activity, Artifacts).

## Open items to confirm in the update phase (left unconfirmed at walkthrough end)
- Activity filter set = agent / stage / kind (proposed default).
- Jira config home: in-Sprint "Connect Jira" setup state (proposed) vs a dedicated global Settings screen — proceed with in-Sprint unless user objects.