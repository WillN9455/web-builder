# Site-map restructure — handoff brief

**Purpose.** This file gives a fresh session everything needed to restructure `plan.md` + `sitemap.md` into one canonical site map — a page contract per screen/tab, in route order, with no changelog layers. It captures the walkthrough state on **2026-08-26**. Read this first, then `sitemap.md`, then `plan.md`.

---

## The goal

Turn `design/sitemap.md` into the canonical structure of the launcher:
- A **Global conventions** header (already present — keep and extend).
- **One page contract per screen/tab**, in route order, using the format: `entry · purpose · zones · state · actions · exit · decisions · open items`.
- Retire the v4 → v5 → v5.1 → v5.2 changelog stacking in `plan.md`. Fold its still-valid content (stage model, per-project menu, intake flow, Jira/build, data model, stack) into the sitemap, then archive `plan.md` (e.g. `plan.archived.md`) or delete it.
- Fix `mockups.html`'s broken screen-divider comments (every block is labeled "2 · Projects — empty state"). Either repair them to match the `id="sN"` anchors or remove them and rely on the anchors.

The launcher's guiding intention (from `launcher/CLAUDE.md`): a **project information hub** *and* a **steering console** — every stage tab has a status half *and* an editable rules half that writes back to the project's on-disk folder.

---

## File state today

| File | What's in it | Status |
|---|---|---|
| `sitemap.md` | Global conventions (7 stages, 5 statuses, pill format, Active-now vs All-projects, DB migration notes) + Screen 1 (Projects) full page contract. | Canonical, in progress. Extend this. |
| `plan.md` (v5.2, 15 screens) | Screen table, design notes, stage model, per-project menu (9 items — now 10), intake flow, Jira/build, data model, stack. Changelog-layered. | The mess — restructure/fold into sitemap, then archive. |
| `mockups.html` (145 KB) | Visuals for screens 1–11. Divider comments broken; navigate by `id="s1"…s11"`. | Visual source for screens 1–11. |
| `background.html` | Project Background screens 12–14. | Visual source for 12–14. |
| `requirements.html` | Requirements screen 15. | Visual source for 15 (not yet walked). |
| `PROJECT-BACKGROUND-BUILD-PLAN.md` | Build plan for the Project Background slice (file map, 7 endpoints, phases). | Reference — do not restructure; still valid. |

Also read the memory file `project-launcher-restructure.md` (~/.claude/.../memory/) for the durable decisions.

---

## Screen → anchor map (mockups.html)

`s1` Screen 1 (Projects initial) · `s2` Screen 2 (empty state) · `s3` Overview — Design active · `s4` Overview — Blocked · `s5` Overview — Shipped · `s6` Build/Jira Kanban **(now the Sprint tab — Build is redefined, see below)** · `s7` New idea folder pick · `s8` New idea BA chat · `s9` New idea captured · `s10` legacy v4 chrome (reference only, not live) · `s11` UI kit (`/__kit`).

Project Background = `background.html` (12 view, 13 edit, 14 SA review). Requirements = `requirements.html` (15).

---

## Locked decisions (from the walkthrough — treat as requirements)

### Repo / philosophy
1. **Dual purpose:** the launcher is a web builder *and* a control console. Every stage tab has a status half + an editable rules half; rule edits write back to the on-disk project folder (`project-dir.txt` workspace root).

### Per-project sidebar — restructured to 10 tabs (was 9)
Overview · Project Background · Requirements · **Sprint** (new) · Design · Build (redefined) · Agents · QA · Activity · Artifacts.

2. **Project Background is the gate.** Downstream tabs (Sprint, Design, Build, QA) are locked until the project context is confirmed.
3. **Two-step gate:** (a) a user transitions all 17 Project Background docs to **Approved**; (b) a dedicated **"Project context ready"** confirmation view (State D, dedicated view — not a banner/modal) lets the user confirm the whole context. That confirmation fires a **one-shot unlock** of Sprint + Design + Build + QA and finalizes Requirements. Auto-unlock does **not** fire on the last file approval.
4. **Requirements is always visible** and auto-updates as Project Background is reviewed (Background is the source; Requirements is derived).
5. **Default landing = Overview always.** The stage's own tab is highlighted as "focus" in the sidebar but does not auto-open. *(This revises the earlier sitemap convention at L16-17 — update that line.)*
6. **Sidebar badges = live tallies per tab:** Project Background = artifact count (17 max); Requirements = requirement count; Build = Jira ticket count; QA = failing/pending test count; Design/Agents/Activity/Artifacts = no badge. (Mockup shows Build's badge as the literal "Jira" label — change to a count.)

### Overview tab — collapses plan's Screens 3, 4, 5
7. **One dynamic Overview tab, three states:** active · blocked · done (Deployed). Screens 3/4/5 in `plan.md` are *states of the same route*, not separate screens.
   - **Active:** Current-stage panel (status, agent callout, elapsed) + stage checklist (✓ + timestamps, unchecked); footer `Mark <stage> complete` · `Pause stage`. Right: Activity + Artifacts.
   - **Blocked:** Current-stage panel (rose, Blocked) + checklist, **plus** an Outstanding-questions panel (count, each question with asker/age/blocks-story, inline answer field, `Skip — BA decides` / `Send answer`, `Open chat →`). Right: Activity + Artifacts. *(Mockup shows both checklist and outstanding questions — plan.md said "replaces"; mockup wins.)*
   - **Done/Deployed:** Journey timeline (all 7 stages ✓ + durations + `Deployed to <url>`) + Ship summary card (total time, features n/n). Right: **Artifacts only** (no Activity).

### Sprint tab (new — moved out of Build)
8. **Sprint = the Jira board** (the old Screen 6 Kanban). Creates Jira stories from completed requirements; master story-status tracker across all stages. Cross-cutting; Design/Build/QA show their slice.
9. **Jira is integrated via Sprint.** (Open: whether the board also works standalone without a Jira link — proposed: internal board with optional Jira sync. Settle during restructure.)

### Build tab (redefined — no longer the Kanban)
10. **Build = config + architecture + rework**, not a board: build rules, deployment rules, environments, coding guidelines, build lifecycle, architecture (FE/BE/BFF/DB/host), stories-in-build stats, **rework queue** (stories that failed QA or review and came back). Old Screen 6 contract is **discarded**.

### Story lifecycle (Jira status is the spine)
11. `Requirements complete → Sprint creates Jira stories → **human BA reviews** → transition to Design → Design agent → story "Ready for development" → Developer agent (Build) → "Ready for review" → Review agent → "Ready for QA" → QA agent → "In QA" → tests → pass = deployed to QA env / fail = back to Build rework queue.`

### Project Background specifics
12. **17 artifacts across 5 bands:** Core PRD (prd.md, user-journeys.md) · Scope & rules (glossary, stakeholder-map, business-rules, assumptions, open-questions) · Data & access (data-model, data-flow, rbac-matrix, nfr-catalog) · Planning & risk (phasing-plan, traffic-profile, cost-model, risks) · SA handoff (tech-decision-brief).
13. **Per-file state machine:** Draft → In Review (SA) → Returned → **Approved**. Terminal state renamed from "Completed" (mockup says "Mark Completed ✓" → "Approve ✓" → status `Approved`). One file at a time; one API call per transition; activity logged; **no destructive deletes**.
14. **4 states for the tab:** A view · B edit (BA-only monospace) · C SA review (read-only + inline comment thread) · D context-ready/confirm (the gate).
15. **Stage banner = live counts** (`9 Draft / 2 In Review / 1 Returned / 3 Approved`), not a bulk action.
16. **Open-questions banner** (butter-yellow) when `open-questions.md` has `Blocker-for: PRD-approval` items.
17. **Write-back:** edits persist to the project's on-disk `PRD/`. 7 API endpoints in `PROJECT-BACKGROUND-BUILD-PLAN.md`.

### Projects dashboard (Screens 1, 2)
18. **Screen 1** already contracted in `sitemap.md` — keep.
19. **Screen 2 (empty state):** `count === 0` renders a centered empty card (sparkle, "Start with one idea", two CTAs). Topbar persists. `+ New idea` → `/new`. **"Import a folder" = adopt an existing on-disk project folder** — inspect it, infer a stage from what's on disk, write a project row, route to `/projects/:id` (no BA interview). *(Open: stage-inference rules for an adopted folder — proposed default in the Screen 2 contract.)*

---

## Screen contracts already drafted (port into the sitemap)

These were written in the walkthrough session and are ready to port. They are not yet in `sitemap.md`.

- **Screen 1 — Projects (initial)** — already in `sitemap.md`.
- **Screen 2 — Projects (empty state)** — entry/purpose/zones/state/actions/exit/decisions/open. Locked: empty replaces not overlays; topbar persists; Import = adopt folder.
- **Shared: per-project shell** — two-column aside + main; 10-item menu with live-tally badges; sidebar foot (← All projects, Help); "Linked project" promo; topbar (← Projects, Search this project, Share, Open in Claude Code).
- **Overview tab (collapses 3/4/5)** — three states (active/blocked/done) with full zone/state/action details per state.
- **Project Background tab (12/13/14 + State D)** — 4 states, 5-band/17-file tree, per-file state machine, gate, write-back, 7 endpoints.
- **Sprint tab (redefined from old Screen 6)** — board + agent strip (agent strip may move to the Agents tab; the strip below the Kanban in the mockup is the Code Agents status).
- **Design tab** and **QA tab** — full contracts below (no mockup yet).

---

## Design tab — drafted contract (no mockup yet)

| | |
|---|---|
| **Route** | `/projects/:id` · Design tab |
| **Sidebar** | per-project shell, **Design active** (no badge) |
| **Visible when** | unlocked after project-context confirmation (one-shot unlock) |
| **Role** | The Design stage workspace. Design Agent A + B run the design journey per story. The tab is both the design-output viewer **and** the editable design-rules surface. |

### Purpose
"What's being designed, and how should the design agents run?" Shows per-story design status + produced design artifacts (tokens, wireframes, hi-fi, interaction states, a11y audit), plus editable design rules that write back to the project's `design-system/` folder. Two halves: **status** + **editable rules**.

### Zones
1. **Design summary / stats** — stories in design (Being designed · Design complete · Ready for development), counts.
2. **Per-story design list** — each story: design status (`Picked up → In design → Peer review (A↔B) → Design complete → "Ready for development"`), assigned Design Agent (A/B), produced artifacts (wireframes, hi-fi mockups, state docs).
3. **Design agent strip** — Design Agent A + B status (working on which story, peer-review state).
4. **Design artifacts viewer** — selected artifact: tokens, wireframes, hi-fi mockups, interaction-state docs, accessibility audit. (The Overview "Design checklist" lives here in full and editable.)
5. **Editable design rules** (steering half) — design guidelines, accessibility rules (WCAG 2.1 AA), component-spec rules, token rules, constraints ("CSS-implementable only", "SVGs over raster"). Edits write back to `design-system/` (map to `../skills/accessibility-guidelines.md`, `../skills/ui-best-practices.md`).

### State
- `GET /api/projects/:id/design/stories` → per-story design status.
- `GET /api/projects/:id/design/artifacts` → tokens, wireframes, hi-fi, states, a11y audit.
- `GET /api/projects/:id/design/rules` + `PUT` → editable design rules; read from / write back to `design-system/`.
- Design agent completes a story → `POST /api/projects/:id/stories/:id/transition` `{to: "Ready for development"}` → reflects on Sprint board.

### Actions
- Open a design artifact (viewer).
- Edit design rules → writes to `design-system/` → design agents pick up on next run.
- Design agents autonomously update story status; the user monitors + steers via rules (no manual story moves needed).

### Exit → sibling tabs (Sprint for story status; Build once "Ready for development")

### Decisions locked
1. Design tab = design-journey output + editable design rules (two halves).
2. Design agent updates the story to **"Ready for development"** on design complete (ties to the Sprint board).
3. Design rules **write back to the `design-system/` folder** (control-console pattern).
4. Peer review is Design Agent A ↔ B (per the framework), surfaced in the agent strip.

### Open / deferred
- **Mockup not yet created** — design the visual first.
- Design artifacts viewer: render wireframes/hi-fi in-app (image/SVG) or link to Figma? — open.
- Peer-review (A↔B) surface — how disagreements/revisions shown? — open.
- Design checklist editability — which items are user-editable vs agent-managed? — open.

---

## QA tab — drafted contract (no mockup yet)

| | |
|---|---|
| **Route** | `/projects/:id` · QA tab |
| **Sidebar** | per-project shell, **QA active** (badge = failing/pending test count) |
| **Visible when** | unlocked after project-context confirmation (one-shot unlock) |
| **Role** | The QA stage workspace. The QA Agent tests feature fidelity against requirements (Playwright). The tab shows test results + screenshot evidence and the editable QA-rules surface. |

### Purpose
"What passed/failed QA, and how should the QA agent test?" Shows per-story test status with **screenshot evidence**, plus editable QA rules (testing framework, rules, guidelines) that write back to the project's `testing/` folder. Two halves: **status** + **editable rules**.

### Zones
1. **QA summary / stats** — stories in QA (`Ready for QA · In QA · Passed · Failed`), test counts, pass rate.
2. **Per-story test list** — each story: QA status, tests run, pass/fail per test, with **screenshot confirmations** (pass) or **issue screenshots** (fail) + failure details.
3. **QA tools panel** — tools being used (Playwright), testing framework, rules, guidelines currently in place.
4. **Screenshot viewer** — visible screenshots per test step (confirmation or issue), with annotations on failures.
5. **Editable QA rules** (steering half) — testing framework config, test rules, QA guidelines, accessibility test rules, feature-fidelity rules. Edits write back to `testing/` (map to `../skills/`, `../testing/playwright/`).

### State
- `GET /api/projects/:id/qa/stories` → per-story QA status + test results.
- `GET /api/projects/:id/qa/tests/:storyId` → tests, steps, screenshots (pass/issue).
- `GET /api/projects/:id/qa/rules` + `PUT` → editable QA rules; read from / write back to `testing/`.
- QA agent transitions story: `Ready for QA` → `In QA` → tests → pass (→ deployed to QA environment, Build tab shows deploy status) / fail (→ back to Build rework queue).

### Actions
- Open a story's test results + screenshots.
- View a failure screenshot with annotation.
- Edit QA rules → writes to `testing/` → QA agent picks up on next run.
- Re-run tests manually from the tab (if exposed) — open.

### Exit → sibling tabs (Sprint for story status; Build rework queue on fail)

### Decisions locked
1. QA tab = test results + screenshots + editable QA rules (two halves).
2. **Screenshots are first-class** — visible confirmations (pass) and issue screenshots (fail) per test step.
3. QA rules **write back to the `testing/` folder** (control-console pattern).
4. QA pass → **deployed to QA environment** (Build tab shows deploy status); QA fail → **back to Build rework queue**.

### Open / deferred
- **Mockup not yet created** — design the visual first.
- Screenshot storage/retention — where Playwright screenshots live, how many kept? — open.
- Manual re-run vs fully agent-driven — open.
- QA tools beyond Playwright — open.

> Note: the old **Screen 6 (Build Kanban) contract was discarded** — do not port it. Build is now the config/architecture/rework tab (not yet walked).

---

## Screens still to walk (walk these before or during the restructure)

Read the relevant mockup, then write the page contract.

| Screen / tab | Source | Notes |
|---|---|---|
| 7 — New idea · folder pick | `mockups.html` s7 | Path input, Cancel / Create project folder. Also the "Import a folder" target from Screen 2. |
| 8 — New idea · BA chat | `mockups.html` s8 | Chat thread + Interview progress sidebar. The "Open chat →" link in Overview-blocked points here. |
| 9 — New idea · captured | `mockups.html` s9 | Success → "Open project →" routes to `/projects/:id` (stage = Intake). |
| 15 — Requirements | `requirements.html` | Read-only list of BR/TR by user story, filter bar, stage banner with totals, links back to Project Background. **Always visible; grows as Background is reviewed.** |
| Design tab | drafted, no mockup | Full contract in this brief (§ Design tab). Design agent's design journey + output. Two halves. **Mockup still needed.** |
| Build tab (redefined) | not yet mocked | Config/architecture/rework. Two halves. Mock first. |
| QA tab | drafted, no mockup | Full contract in this brief (§ QA tab). QA stats, tests per story, screenshots, tools, rules, testing framework. Two halves. **Mockup still needed.** |
| Agents tab | not yet mocked | Agent roster/status (the strip). |
| Activity tab | partial (Overview right column) | Standalone activity feed. |
| Artifacts tab | partial (Overview right column) | Standalone artifact list. |
| 10 — legacy v4 chrome | `mockups.html` s10 | Reference only, not live product. Document as archived. |
| 11 — UI kit | `mockups.html` s11 | `/__kit` — design tokens, components, states. Document as the reference page. |

---

## Open items (carry into each contract's "open / deferred")

Global (apply across screens):
- **Topbar search scope** — ⌘F on `/projects` (filter this list vs global) and "Search this project…" on project detail (artifacts? requirements? activity?). Both undecided.
- **Notifications bell** — designed in topbar, no behavior. Surface blocked projects / SA comments awaiting reply / failed QA?
- **"Open in Claude Code →"** — launches the project folder in the CLI? Deep link?
- **"Open idea.md →" promo** — in-app viewer or external editor?
- **"Share"** — share link, invite teammate, or export?
- **Stage-complete gating** — can `Mark <stage> complete` fire with open blockers? Proposed: hard-block with a tooltip listing open questions.
- **"Open chat →" target** (Overview blocked) — resumes intake BA chat (Screen 8) or a project-level thread?
- **Re-lock on revoke** — if a file is un-Approved *after* the project context was confirmed, do Sprint/Design/Build/QA re-lock? Proposed: yes, re-lock + warn.
- **Sprint/Jira standalone** — does the board work without a Jira link? Proposed: internal board, optional Jira sync.

Screen-specific open items live in each drafted contract above.

---

## Restructure recommendations (how to do it)

1. **Order the sitemap by route / user journey:** Global conventions → Screen 1 → Screen 2 → intake (7, 8, 9) → per-project shell (shared) → Overview (3/4/5 as states) → Project Background (12/13/14 + D) → Requirements (15) → Sprint → Design → Build → QA → Agents → Activity → Artifacts → reference (10) → UI kit (11).
2. **Keep a "shared" section for the per-project shell** so each tab contract doesn't repeat the sidebar/topbar.
3. **Port the drafted contracts** (Screen 2, shell, Overview, Project Background) verbatim, then walk the remaining screens and add theirs.
4. **Update Global conventions:** default landing = Overview always (revise L16-17); add the 10-tab sidebar + the one-shot unlock gate; add the "every stage tab = status + editable rules" rule.
5. **Fold `plan.md`'s still-valid sections** (intake flow, data model, stack direction, accessibility/state coverage) into the sitemap as appendices, then archive `plan.md`.
6. **Fix `mockups.html` divider comments** to match `id="sN"` (or remove them).
7. **Reconcile stale labels** in mockups: `PRD` → `Requirements`, `Shipped` → `Deployed` (per the 7-stage vocabulary), `Mark Completed ✓` → `Approve ✓` / status `Approved`, Build badge `Jira` → ticket count.
8. **Cross-link:** each stage tab contract should reference the Sprint tab as the master story tracker, and Project Background as the gate.

## Decisions NOT yet made (raise with the user during the restructure)
- Import-a-folder stage-inference rules.
- Whether un-approve after confirmation re-locks downstream (proposed: yes).
- Whether the board works without Jira (proposed: internal + optional sync).
- Search scope (both surfaces).
- Notifications behavior.
- "Open in Claude Code" / "Open idea.md" / "Share" behaviors.

---

## One-line summary for a fresh session
Restructure `design/sitemap.md` into the canonical page-contract site map for the 10-tab launcher (Project Background is the gate; Sprint split from Build; Overview collapses 3/4/5), folding `plan.md` in and archiving it. Port the drafted contracts from this brief, walk the remaining screens from their mockups, and respect every locked decision above.

---

## Restructure log (applied 2026-08-26)

This section records exactly what the restructure session did. It is appended to the brief so a fresh session can see the delta without diffing files.

### 1. `sitemap.md` — rewritten as the canonical site map
Replaced the Screen-1-only draft with a full page-contract site map, ordered by route / user journey:
- **Global conventions** updated: 7 stages with `PRD`→`Requirements`, `Shipped`→`Deployed` rename notes; 5 statuses; card pill format; "Active now" vs "All projects"; **default landing = Overview always** (revises the old L16-17 convention); **10-tab per-project sidebar** with the one-shot unlock gate; **"every stage tab = status + editable rules"** rule; DB migration notes. Sprint badge set to `—` and Build badge to "Jira ticket count" per locked decision #6.
- **Page contracts added**, in order: Screen 1 (kept) · Screen 2 (empty state) · Screen 7/8/9 (intake) · Shared per-project shell · Overview (3/4/5 collapsed into active/blocked/done states) · Project Background (12/13/14 + State D gate, per-file state machine, 17 artifacts) · Requirements (15) · Sprint (redefined from old Screen 6) · Design (drafted contract) · Build (redefined: config/architecture/rework) · QA (drafted contract) · Agents · Activity · Artifacts · Screen 10 (legacy, archived) · Screen 11 (UI kit).
- **Appendices** folded in from `plan.archived.md`: A intake flow, B data model, C stack direction + style tokens, D accessibility & state coverage, E BA artifacts (17-file table).
- **Cross-links** added: every stage tab references Sprint (master story tracker) and Project Background (the gate).

### 2. `plan.md` — archived
- `plan.md` renamed to `plan.archived.md` (changelog-layered v5.2 history preserved verbatim).
- New `plan.md` is a short pointer stub redirecting readers to `sitemap.md` (canonical) and `plan.archived.md` (history), and summarising the restructure decisions applied.

### 3. `mockups.html` — broken dividers + screen-label nums fixed
- The 11 screen-divider comments (all formerly "2 · Projects — empty state") now match their `id="sN"` anchors: 1 Projects initial · 2 empty state · 3 Overview — Design active · 4 Overview — Blocked · 5 Overview — Deployed · 6 Sprint — Jira Kanban · 7/8/9 intake · 10 legacy · 11 UI kit. (s2's "2 · Projects — empty state" was already correct.)
- Mismatched `.screen-label` `.num` values corrected: s2 3→2, s3 4→3, s4 5→4, s5 6→5, s10 1→10, s11 10→11. Screen-label names updated for s3/s4/s5/s6 to match the new collapsed vocabulary (Overview states, Sprint).
- Top in-page nav (`#s3`–`#s6`) updated to match the new screen labels.

### 4. Stale labels reconciled (brief rec #7)
- `Shipped` → `Deployed` in `mockups.html`: 7-stage stepper labels (s3/s4/s5/s6 step 7), UI-kit stepper, pipeline mini-bar stage point, pipeline legend swatch, status pills, path subtitle. The `class="step shipped"` / `class="pill shipped"` CSS classes were left intact (harmless).
- `PRD` → `Requirements` in `mockups.html` stage vocabulary: 7-stage stepper step-2 labels (s3/s5/s6), UI-kit stepper, pipeline mini-bar stage point, done-state journey checklist. The two `PRD` **artifact file rows** (with `/PRD/…md` on-disk paths) were intentionally left unchanged — those reference the on-disk `PRD/` folder, not the stage.
- Build sidebar badge in `mockups.html`: literal `Jira` → ticket count `12` (4 occurrences). Sprint sidebar item is a separate design task (not yet mocked).
- `background.html`: `Mark Completed ✓` → `Approve ✓`; status `Completed` → `Approved` (count pills, table pill, workflow copy, helper sub). `file-status completed` / `pill done` CSS classes left intact.
- `requirements.html` was already using the canonical vocabulary — no changes needed.

### 5. `launcher/CLAUDE.md` — design-assets section updated
- `sitemap.md` marked as canonical source of truth (all screens contracted, not "Screen 1 walked").
- `plan.md` documented as a pointer stub; `plan.archived.md` added as the history file.
- `mockups.html` note updated: dividers now match anchors (the "broken" warning removed).
- `background.html` note updated with the Approve/Approved label reconciliation.
- `restructure-brief.md` note updated to mention this Restructure log.

### Not done (intentionally — out of scope for this restructure)
- **Sprint tab sidebar item** not added to the `mockups.html` sidebars (screens 3–6 still show the 9-item menu). Adding the 10th sidebar item across screens is a design task that belongs with the Sprint/Build/Agents/QA tab mockup work, not the divider/label fix.
- **New mockups** for Sprint (standalone), Build (redefined), Agents, Activity, Artifacts tabs — still to be designed (flagged as "mockup not yet created" in each contract).
- **Implementation** — none of this touches `src/` or `server/`; it is design-doc restructuring only. The build state in `launcher/CLAUDE.md` (Project Background tab in progress) is unchanged.