# Idea Hub — Canonical Site Map & Page Contracts

**Status:** canonical source of truth for the launcher's structure.
Each screen/tab gets one page contract: **entry · purpose · zones · state · actions · exit · decisions · open items**.
Ordered by route / user journey. The old changelog-layered `plan.md` is archived as `plan.archived.md`; this file replaces it.

The launcher's guiding intention (from `launcher/CLAUDE.md`): a **project information hub** *and* a **steering console** — every stage tab has a status half *and* an editable rules half that writes back to the project's on-disk folder.

---

## Global conventions (canonical — apply to every screen)

### Stages (7) — project pipeline position

A project is always in exactly one stage. This value drives the 7-segment stepper on every project page and which per-project menu tab is the "focus" tab.

| # | Stage key (DB) | Pill label | What happens | Owner |
|---|---|---|---|---|
| 1 | `Intake` | Intake | BA chat interview → `idea.md` | BA |
| 2 | `Requirements` | Requirements | BA drafts 17 PRD files, SA reviews file-by-file; Requirements tab = signed-off BR/TR list | BA + SA |
| 3 | `Design` | Design | Design A+B: tokens, wireframes, all interaction states | Design A/B |
| 4 | `Build` | Build | 3 Code Agents in parallel; Build tab = config/architecture/rework; Sprint tab = the board | Code 1/2/3 |
| 5 | `Review` | Review | Dev reviewers + BA/Design verify code & design quality | Dev reviewers |
| 6 | `QA` | QA | QA Agent tests feature fidelity against requirements (Playwright) | QA |
| 7 | `Deployed` | Deployed | Deployed, summary, known limitations | Orchestrator |

Notes:
- Review and QA stay **separate** — different owners and different gates (code/design quality vs. requirement-fidelity testing). Do not merge.
- Deployment + Go-live are folded into one terminal stage, `Deployed`. A future staged-rollout / kill-switch would be a *sub-state* of Deployed, not a new stage.
- **Stale-label migration:** `PRD` → `Requirements`, `Shipped` → `Deployed` (applied in mockups, DB, and copy).

### Statuses (5) — lifecycle modifier (orthogonal to stage)

A status describes how the current stage is going, not where the project is.

| Status key (DB) | Meaning | Pill rendering |
|---|---|---|
| `active` | working in the current stage | no modifier — stage label alone |
| `blocked` | gated by the work itself (open questions, failed review) | `Stage · Blocked` (rose) |
| `on_hold` | user explicitly paused | `Stage · On hold` |
| `cancelled` | abandoned idea | `Cancelled` overrides stage |
| `done` | terminal — only valid when stage = `Deployed` | `Deployed` (stage label alone) |

### Card pill format

A project card's primary pill shows the **stage label**; a status modifier is appended only when it is not plain `active`/`done`. So: `Requirements`, `Requirements · Blocked`, `Build · On hold`, `Cancelled`, `Deployed`.

### "Active now" vs "All projects"

- **Active now** tiles = status `active` or `blocked` (in-flight, needs attention).
- **All projects** table = every project (active, on hold, cancelled, deployed).

### Default landing = Overview always

When a project is opened, the route lands on **Overview**. The stage's own tab is highlighted as "focus" in the sidebar but does **not** auto-open. *(Revises the earlier convention that the stage tab auto-opens.)*

### Per-project sidebar — 10 tabs + one gate

| # | Tab | Visible | Badge | Focus when stage = |
|---|---|---|---|---|
| 1 | Overview | always | — | any (default landing) |
| 2 | Project Background | always | artifact count (17 max) | Requirements |
| 3 | Requirements | always | requirement count (`BR + TR`) | Requirements |
| 4 | Sprint | unlocked at confirmation | — | Build |
| 5 | Design | unlocked at confirmation | — | Design |
| 6 | Build | unlocked at confirmation | Jira ticket count (was literal "Jira" — now a count) | Build |
| 7 | Agents | always | — | — |
| 8 | QA | unlocked at confirmation | failing/pending test count | QA |
| 9 | Activity | always | — | — |
| 10 | Artifacts | always | — | — |

**The gate (two-step, one-shot unlock).** Downstream tabs (Sprint, Design, Build, QA) are locked until the project context is confirmed.
1. A user transitions all 17 Project Background docs to **Approved**.
2. A dedicated **"Project context ready"** confirmation view (State D — a dedicated view, not a banner/modal) lets the user confirm the whole context.
That confirmation fires a **one-shot unlock** of Sprint + Design + Build + QA and finalizes Requirements. Auto-unlock does **not** fire on the last file approval. Once confirmed, downstream tabs stay accessible even if a file is later un-Approved — a banner warns "context changed since confirmation" but the unlock does not re-arm.

**Requirements is always visible** and auto-updates as Project Background is reviewed (Background is the source; Requirements is derived).

### Every stage tab has two halves

Each **stage tab that has editable rules** (Design, Build, QA) is split into two halves via a tabbed **Status / Rules switch** at the top of the tab body:

- **Status half** — the live status/info view (per-story status, queues, summary stats, evidence viewers).
- **Rules half** — the editable rules surface that **writes back to the project's on-disk folder** (`project-dir.txt` workspace root) so the agents that run each stage pick up the changes. This is the control-console pattern: the launcher is how a human *steers* the agents, not just watches them.

**Sprint is the exception** — it is **status-only** (no Rules tab). The board IS the steerable surface (story moves happen here, not in a Rules half). The 3-Code-Agent strip also moves off Sprint onto the **Agents tab**, leaving Sprint focused on the board.

Rule write-back targets by stage:

| Stage tab | Rules write to |
|---|---|
| Design | `design-system/` (maps to `../skills/accessibility-guidelines.md`, `../skills/ui-best-practices.md`) |
| Build | `code-builder/` + `../skills/coding-guidelines.md` |
| QA | `testing/` (maps to `../skills/`, `../testing/playwright/`) |

### Locked tabs — greyed-out but WCAG-compliant

Tabs gated behind project-context confirmation (Sprint, Design, Build, QA in pre-confirmation) render as **greyed-out but accessible** — never `display:none`, never contrast-disabled. The lock label keeps sufficient contrast, gets `aria-disabled="true"`, an accessible name that names the gate, a tooltip ("Confirm project context first"), and stays keyboard-reachable. Once confirmation fires, the lock lifts and the active style applies.

### In-project topbar — minimal

The in-project topbar is intentionally minimal: `← Projects` (back to `/projects`) · `Search this project…` (artifacts + requirements, extensible). **No Share. No "Open in Claude Code".** Those affordances were removed in the 2026-08-27 walkthrough.

Projects-screen ⌘F (Screen 1) is a **different scope** — it filters the projects list only (not the in-project search). The two scopes stay separate.

### DB migration (deferred to implementation)

- `project.current_stage` CHECK → `('Intake','Requirements','Design','Build','Review','QA','Deployed')`
  - rename data: `PRD` → `Requirements`, `Shipped` → `Deployed`
- `project.status` CHECK → `('active','blocked','on_hold','cancelled','done')`
  - map old → new: `queued`→`active`, `active`→`active`, `review`→`active`, `blocked`→`blocked`, `done`→`done` (or `active` if stage ≠ Deployed), `shipped`→`done` (stage becomes `Deployed`)
- `stage.stage_key` CHECK updated to the same 7 stage keys.

---

## Screen 1 — Projects (initial)

| | |
|---|---|
| **Route** | `/projects` (also the redirect target of `/`) |
| **Sidebar** | none — single-column "workshop dashboard" |
| **Built?** | ✅ `ProjectsScreen`, `Topbar`, `ProjectTile`, `PipelineRing`, `ProjectTable`, `EmptyState`, `Skeletons`, `ConfirmDialog` |

### Entry
- First thing seen on launch; `/` redirects here.
- Reached again via "← All projects" from inside any project, or after cancelling `/new`.

### Purpose
At-a-glance launchpad. Two jobs: **"what should I work on next?"** and **"start a new idea."** No editing happens here — it's a launchpad into projects or `/new`.

### Zones
1. **Topbar** — logo, ⌘F search, 🔔 notifications, avatar, `+ New idea` CTA.
2. **Active now** — pastel tile grid of in-flight projects only (status `active` or `blocked`). Each tile: name, one-liner, status pill (stage + modifier), pipeline mini-bar. "View all →" link jumps to the All-projects table.
3. **Pipeline** — aggregate ring chart (% complete) + status legend. **No "Next milestone" card** (removed).
4. **All projects** — table of every project: Project / Tasks (Jira done/total) / Status / Priority / Stage / Progress. Filter + Sort controls. `+ New Project` action.

### State
- `GET /api/projects` → tiles (active subset), pipeline aggregate, full table.
- `nextMilestone` **removed** from the response and from `PipelineRing` props.

### Actions
- Open a tile: `current_stage === 'Intake'` → `/new?resume=<slug>` (resume interview); else → `/projects/<slug>`.
- `+ New idea` (topbar + empty state) → `/new`.
- Delete project → `DELETE /api/projects/:id` with confirm + type-match; folder on disk kept for recovery.
- Search (⌘F) — filter the list (scope TBD: this list only vs. global; see open items).

### Exit → `/new` · `/new?resume=<slug>` · `/projects/<slug>`

### Decisions locked
1. **Tiles vs table split** — tiles = active-only (active/blocked); table = all projects (active + finished).
2. **Stage vocabulary** — canonical 7 stages + 5 statuses (see Global conventions). Terminal stage = `Deployed`.
3. **Next milestone removed** — pipeline ring shows aggregate % + legend only; no milestone card, no due dates.
4. **Tasks column kept** = Jira cards done/total (shows `—` before Build). **Chats column removed.**
5. **⌘F search scope = this-list-only** — filters the projects list (separate scope from the in-project topbar search).
6. **Default sort = `updated_at desc`** — user-changeable via the Sort control.
7. **Notifications bell** — decorative for now; deferred feature. Future scope: surface blocked projects, SA comments awaiting reply, failed QA.

### Open / deferred
- *(none beyond what is locked)*

---

## Screen 2 — Projects (empty state)

| | |
|---|---|
| **Route** | `/projects` (rendered when `count === 0`) |
| **Sidebar** | none — topbar persists |
| **Built?** | ✅ `EmptyState` |

### Entry
- First visit with no projects, or every project deleted/cancelled. Same route as Screen 1; `count === 0` swaps the body.

### Purpose
"What do I do first?" A calm, single-action onboarding: start one idea, or adopt an existing on-disk project folder.

### Zones
1. **Topbar** — persists (logo, search, notifications, avatar, `+ New idea`).
2. **Centered empty card** — sparkle illustration, headline "Start with one idea", supporting line, two CTAs: `+ New idea` (primary) and `Import a folder` (secondary).

### State
- `GET /api/projects` → `count === 0` triggers this view instead of Screen 1's grid/table.

### Actions
- `+ New idea` → `/new` (BA interview).
- `Import a folder` → **adopt an existing on-disk project folder**: inspect the folder, infer a stage from what's on disk, write a project row, route to `/projects/:id` (no BA interview).

### Exit → `/new` · `/projects/:id` (adopted folder)

### Decisions locked
1. **Empty replaces, not overlays** — when `count === 0` the empty card is the body, not a modal over a hidden grid.
2. **Topbar persists** — no sidebar, but the topbar stays so `+ New idea` and search remain reachable.
3. **Import = adopt folder** — not a file upload. The launcher inspects an on-disk project folder and adopts it.

### Open / deferred
- **Stage-inference rules for an adopted folder** — proposed default: if `PRD/` exists with N approved files → `Requirements`; if `design-system/` populated → `Design`; if code + Jira cards → `Build`; only `idea.md` → `Intake`; nothing recognizable → `Intake` with a warning. **Deferred to implementation** — no post-import confirmation state designed.

---

## Screen 7 — New idea · folder pick

| | |
|---|---|
| **Route** | `/new` (step 1 of 2) |
| **Sidebar** | none |
| **Built?** | ✅ `NewIdeaScreen` → `FolderPick` |
| **Mockup** | `mockups.html` `#s7` |

### Entry
- `+ New idea` (topbar / empty state), or `/new?resume=<slug>` resumes here for an Intake-stage project.

### Purpose
Pick (or create) the on-disk project folder that will hold the framework artifacts. Mirrors today's `POST /api/init`.

### Zones
1. **Centered pastel card** — "Step 1 of 2" crumb, path input (mono), helper text ("Pick a folder outside the framework repo"), inline error banner.
2. **Footer actions** — `Cancel` + `Create project folder →` (and a "Use last folder" shortcut).

### State
- `POST /api/init` — validates path, scaffolds the framework folder, pins `project-dir.txt`.

### Actions
- `Create project folder →` → validates and advances to step 2 (`/new` chat).
- `Cancel` → back to `/projects`.
- `Use last folder` → prefill the last-used path.

### Exit → `/new` (step 2) · `/projects` (cancel)

### Decisions locked
1. No sidebar — the user isn't "in a project" yet.
2. Reuses the existing `/api/init` handler unchanged.

### Open / deferred
- None beyond the global topbar items.

---

## Screen 8 — New idea · BA-Agent chat

| | |
|---|---|
| **Route** | `/new` (step 2 of 2) |
| **Sidebar** | none (chat-side widget instead) |
| **Built?** | ✅ `NewIdeaScreen` → `Chat` + `InterviewProgress` |
| **Mockup** | `mockups.html` `#s8` |

### Entry
- From Screen 7 after the folder is picked. Also the target of the **"Open chat →"** link in Overview-blocked and Project Background open-questions banner — both resume the intake BA chat (this screen).

### Purpose
The BA Agent interviews the user about their idea and writes `idea.md`. Two-column: the conversation on the left, what's been captured on the right.

### Zones
1. **Chat thread** (left) — BA ↔ user bubbles; streaming via `POST /api/chat` (NDJSON).
2. **Interview progress** (right) — checklist of captured fields (Problem, Users & scale, MVP scope, Business rules, Brand & design, Tech stack…) with ✓/current/pending states.
3. **Outstanding questions** (right, below Interview progress) — read-only list grouped by `Blocker-for:` (e.g. `Blocker-for: PRD-approval`, `Blocker-for: Design`). **Always visible** in the chat side panel. Uses the same greyed-out WCAG locked-tab treatment (see Global conventions § Locked tabs) while there are no outstanding questions; unlocks to the active style once questions exist. No per-item action button — the user is already in the chat.
4. **Header** — workspace name = folder path; "← Change folder" link back to step 1.

### State
- `POST /api/chat` — NDJSON stream to the model, `idea` fence detection, `idea.md` write + backup.

### Actions
- Send a message (streams the BA reply).
- `← Change folder` → back to step 1.

### Exit → Screen 9 (on `idea` fence / success) · Screen 7 (change folder)

### Decisions locked
1. Reuses the existing BA-Agent chat (system prompt unchanged) — just hosted in the app shell.
2. Interview progress sidebar surfaces what's been captured.
3. **Outstanding questions section lives here** (chat side panel), NOT as a tab on the per-project sidebar. The 10-tab per-project sidebar is unchanged.
4. **"Open chat →" target = this screen** (intake BA chat), not a project-level thread. Applies from Overview-blocked and the Project Background open-questions banner.

### Open / deferred
- *(none beyond what is locked)*

---

## Screen 9 — New idea · captured (success)

| | |
|---|---|
| **Route** | `/new` (final) |
| **Sidebar** | none |
| **Built?** | ✅ `NewIdeaScreen` → `Captured` |
| **Mockup** | `mockups.html` `#s9` |

### Entry
- BA Agent emits the `idea` fence → success state.

### Purpose
Confirm the idea was captured and hand off into the project. The project record is created here.

### Zones
1. **Centered success card** — big checkmark, project name, summary of what was written (`idea.md` + folder).
2. **Actions** — `View idea.md` + `Open project →`.

### State
- On fence: create the project row (`current_stage: Intake`), write `idea.md`, append `activity`.

### Actions
- `Open project →` → `/projects/:id` (stage = `Intake`, lands on Overview).
- `View idea.md` → **in-app markdown viewer**.

### Exit → `/projects/:id` · `/projects` (back)

### Decisions locked
1. Project is created at `Intake` stage; the Overview focus tab is Project Background (next stage), but landing is still Overview.
2. `View idea.md` = in-app markdown viewer.
3. **Next stop is Project Background** (not the legacy "PRD" surface).

---

## Shared — per-project shell

Every screen inside a project (`/projects/:id/*`) shares this chrome. Tab contracts below do **not** repeat it.

| | |
|---|---|
| **Route** | `/projects/:id/*` |
| **Layout** | two-column: aside (sidebar) + main |

### Zones
1. **Aside — per-project sidebar** — 10-item menu (see Global conventions § Per-project sidebar) with live-tally badges; active item gets the dark-navy pill + `aria-current="page"`; locked tabs use the **greyed-out but WCAG-compliant** treatment (see Global conventions § Locked tabs) — not contrast-disabled, not `display:none`. Tooltip: "Confirm project context first".
2. **Aside foot** — `← All projects`, `Help & support`.
3. **"Linked project" promo** — small card reminding the user that `idea.md` lives at the project root (framework-level, not under `PRD/`), with `Open idea.md →` (in-app markdown viewer).
4. **Topbar** — `← Projects` · `Search this project…` only. **No Share. No "Open in Claude Code"** (removed 2026-08-27). In-project search scope = artifacts + requirements (extensible to other types later).

### State
- `GET /api/projects/:id` — project header (name, one-liner, mono path, team avatars), 7-stage stepper state, current stage/status.
- Badge tallies per tab from their respective endpoints (Project Background artifact count, Requirements count, Build/QA counts).

### Decisions locked
1. **10-item menu with live-tally badges** (see Global conventions).
2. **Default landing = Overview always**; the stage's tab is "focus" but does not auto-open.
3. The shell is shared so each tab contract only describes its main column.
4. **Topbar cleaned** — no Share, no Open in Claude Code.
5. **In-project search scope = artifacts + requirements** (extensible).
6. **"Open idea.md →" promo = in-app markdown viewer.**

---

## Overview tab — collapses plan Screens 3, 4, 5

| | |
|---|---|
| **Route** | `/projects/:id` (default landing) |
| **Sidebar** | per-project shell, **Overview active** (no badge) |
| **Mockup** | `mockups.html` `#s3` (active) · `#s4` (blocked) · `#s5` (done) |
| **Visible when** | always |

One dynamic tab, **three states**: `active` · `blocked` · `done` (Deployed). Screens 3/4/5 in `plan.archived.md` are *states of the same route*, not separate screens.

### Purpose
"Where is this project right now, and what needs my attention?" The status dashboard. Always the landing.

### Zones — shared
- **Project header** — pastel tile, name, one-liner, mono path, team avatars.
- **7-stage stepper** — dense inline numbered chips; `aria-current="step"` on the active segment.
- **Right column** — Activity + Artifacts (Artifacts only in the done state).

### State — active (Screen 3)
- **Current-stage panel** — stage name, status, agent callout, elapsed time.
- **Stage checklist** — ✓ items with timestamps, unchecked items remaining.
- **Footer** — `Mark <stage> complete` · `Pause stage`.
- **Right column** — Activity + Artifacts.

### State — blocked (Screen 4)
- **Current-stage panel** (rose, pill = `Requirements · Blocked` or whichever stage · Blocked) + checklist.
- **Outstanding-questions panel** — **read-only**. Count + each question (asker · age · blocks-story). No inline textarea, no `Skip — BA decides`, no `Send answer`. Subtext: "The BA Agent is waiting on these before finalising requirements. Open the chat to answer." Sole action = `Open chat →` (resumes intake BA chat, see Screen 8).
- **Right column** — Activity + Artifacts.

### State — done / Deployed (Screen 5)
- **Journey timeline** — all 7 stages ✓ + durations + `Deployed to <url>`.
- **Ship summary card** — total time, **features deployed** n/n.
- **Right column** — **Artifacts only** (no Activity).

### State (data)
- `GET /api/projects/:id` → header, stepper, current-stage panel, checklist, outstanding questions, journey timeline (done).

### Actions
- `Mark <stage> complete` → `POST /api/projects/:id/stage` (transition). **Warn but allow**: the button stays enabled even with open blockers; clicking opens a confirm dialog that warns of open outstanding questions, then the user proceeds.
- `Pause stage` → status `on_hold`.
- In blocked: read the question list; `Open chat →` resumes the intake BA chat (Screen 8).

### Exit → sibling tabs (focus tab for the current stage)

### Decisions locked
1. One Overview tab, three states (active/blocked/done) — Screens 3/4/5 collapsed.
2. Blocked state shows **both** checklist and outstanding questions (mockup wins over plan.md "replaces").
3. Done state right column = Artifacts only (no Activity).
4. Default landing = Overview always.
5. **Blocked questions are read-only** — no inline answer affordances; the `Open chat →` action is the sole way to answer.
6. **Blocked pill = `Stage · Blocked`** (rose), e.g. `Requirements · Blocked`. Never bare `Blocked`.
7. **Stage-complete gating = warn-but-allow** — confirm dialog lists open outstanding questions, then the user proceeds.
8. **Done state copy = "Features deployed"** (was "Features shipped").

---

## Project Background tab — screens 12 (view) · 13 (edit) · 14 (SA review) + State D (gate)

| | |
|---|---|
| **Route** | `/projects/:id/background` |
| **Sidebar** | per-project shell, **Project Background active** (badge = artifact count, 17 max) |
| **Mockup** | `background.html` (12 view, 13 edit, 14 SA review) |
| **Visible when** | always |
| **Role** | BA authors; SA reviews/edits during `In Review (SA)`; Design/Code/QA read-only. |

**The gate.** Downstream tabs stay locked until the project context is confirmed here.

### Purpose
"Where did this project come from, and is the context ready to build on?" The BA Workspace — the 17-file PRD artifact authoring + SA-review surface, and the place where the whole context is confirmed.

### Zones
1. **Stage banner** — live counts (`9 Draft / 2 In Review / 1 Returned / 3 Approved`), not a bulk action.
2. **Open-questions banner** (butter-yellow) — when `open-questions.md` has `Blocker-for: PRD-approval` items; **deep-links into the intake BA chat (Screen 8) Outstanding questions section, filtered to `Blocker-for: PRD-approval`** (not `prd.md` §11).
3. **Left rail — 5-band file tree** — Core PRD · Scope & rules · Data & access · Planning & risk · SA handoff. 17 artifacts total. Each row: colored status dot (Draft purple / In Review amber / Returned rose / Approved green), dirty inset (coral) when editing.
4. **Right pane — document viewer** — `View` / `Edit` tabs. View renders markdown; Edit = BA-only monospace textarea.
5. **Inline review thread** (State C) — below the document when a file is `In Review (SA)`; interleaves SA + BA comments; Compose box.

### State — A: view (Screen 12)
- File tree + selected file's markdown body (read-only).
- `GET /api/projects/:id/ba-workspace/files` → tree + per-file status + dirty flag.
- `GET /api/projects/:id/ba-workspace/files/:name` → markdown body.

### State — B: edit (Screen 13, BA-only)
- Monospace textarea; dirty state in tree (coral inset) + header (`● Unsaved changes`).
- Footer (status-aware): `Discard` / `Save changes` / `Send for SA review →` (only enabled while the file is `Draft` or `Returned`). Edit locked while `In Review (SA)`.
- `PUT /api/projects/:id/ba-workspace/files/:name` → save body (409 if `In Review (SA)`).

### State — C: SA review (Screen 14)
- Active file is `In Review (SA)`. Body read-only with SA's inline `blockquote` markup preserved.
- Footer: `Return to BA` / `Approve ✓` (was "Mark Completed ✓" — renamed; status becomes `Approved`).
- `POST /api/projects/:id/ba-workspace/files/:name/comments` → append reply.
- `GET .../comments` → thread.

### State — D: context-ready / confirm (the gate)
- Reached when all 17 docs are `Approved`. A **dedicated confirmation view** (not a banner/modal) lets the user confirm the whole context.
- `POST /api/projects/:id/background/confirm-context` → fires the **one-shot unlock** of Sprint + Design + Build + QA and finalizes Requirements.

### Per-file state machine
```
Draft ──Send for SA review──▶ In Review (SA)
                                  │
                                  ├── Return to BA ──▶ Returned ──▶ (BA edits) ──▶ Draft
                                  │
                                  └── Approve ✓ ──▶ Approved
```
One file at a time; one API call per transition; activity logged; **no destructive deletes** (per smoke-test-safety memory). Terminal state = `Approved` (renamed from "Completed").

### 17 artifacts across 5 bands
Core PRD (`prd.md`, `user-journeys.md`, `personas.md`) · Scope & rules (`glossary.md`, `stakeholder-map.md`, `business-rules.md`, `assumptions.md`, `open-questions.md`) · Data & access (`data-model.md`, `data-flow.md`, `rbac-matrix.md`, `nfr-catalog.md`) · Planning & risk (`phasing-plan.md`, `traffic-profile.md`, `cost-model.md`, `risks.md`) · SA handoff (`tech-decision-brief.md`). Full table in Appendix § BA artifacts.

### Write-back
Edits persist to the project's on-disk `PRD/`. 7 API endpoints in `PROJECT-BACKGROUND-BUILD-PLAN.md`.

### Actions
- Browse tree; open a file (View); edit (BA, Draft/Returned only); send for SA review; return; approve; comment; confirm context (State D).

### Exit → Requirements (derived) · Sprint/Design/Build/QA (on confirm)

### Decisions locked
1. **Project Background is the gate** — two-step, one-shot unlock (see Global conventions).
2. **17 artifacts across 5 bands**; per-file state machine Draft → In Review → Returned → **Approved**.
3. **4 tab states** (A view · B edit · C SA review · D context-ready/confirm).
4. **Stage banner = live counts**, not a bulk action.
5. **Write-back to on-disk `PRD/`**; no destructive deletes.
6. Terminal state renamed "Completed" → "Approved"; button "Mark Completed ✓" → "Approve ✓".
7. **Re-lock on revoke = keep unlocked, warn only** — once confirmed, downstream tabs stay accessible; if a file is later un-Approved, a banner warns "context changed since confirmation". The unlock does not re-arm.
8. **Open-questions banner** deep-links into the intake chat's Outstanding questions section (filtered to `Blocker-for: PRD-approval`), not `prd.md` §11.

### Open / deferred
- Markdown renderer choice (`react-markdown` + `remark-gfm`) — implementation detail.

---

## Requirements tab — screen 15

| | |
|---|---|
| **Route** | `/projects/:id/requirements` |
| **Sidebar** | per-project shell, **Requirements active** (badge = requirement count `BR + TR`) |
| **Mockup** | `requirements.html` (`#s15`) |
| **Visible when** | always — auto-updates as Project Background is reviewed |
| **Role** | BA authors; SA, Design, Code, QA read-only. No one but the BA adds/changes a requirement. |

### Purpose
"What must be built?" The signed-off list of business & technical requirements grouped by user story — the source of truth Design, Build, and QA build against. Background is the "where it came from" surface; Requirements is the "what must be built" surface.

### Zones
1. **Stage banner** — totals (e.g. `9 Business / 6 Technical / 3 Blocked`), links back to Project Background for context.
2. **Filter bar** — All / Business / Technical tabs (radio-style, `aria-pressed`); Open / Approved / Blocked status chips (checkbox-style, multi-select); free-text search (`⌘F`/`Ctrl-F` focuses, `Esc` clears).
3. **Requirements list** — grouped by user story (US-01 …). Each row: stable ID (`BR-xxx` / `TR-xxx`), type tag, MoSCoW priority, status pill, owner.

### State
- Parsed from `prd.md` §8 (`BR-` IDs in per-story frontmatter) and `user-journeys.md` per-story frontmatter (`TR-` IDs). The tab is a **renderer over these two files** — it never owns data.
- `business-rules.md` keeps domain rules and **does not** own `BR-`/`TR-` IDs.

### Actions
- Filter / search the list (read-only for non-BA).
- `Open Project Background →` from the empty state (BA only).

### Exit → Project Background (context) · Sprint (once confirmed → stories created)

### Decisions locked
1. **Always visible**; grows as Project Background is reviewed (Background = source, Requirements = derived).
2. **Renderer over `prd.md` + `user-journeys.md`** — no new endpoints, no new data model.
3. **Two tabs, not one** — Background holds everything the BA drafts; Requirements holds the extracted list Design/Build/QA consume. Conflating them would force scrolling past long-form prose to find a requirement.

### Open / deferred
- None beyond the global topbar items.

---

## Sprint tab — redefined from old Screen 6 (the board)

| | |
|---|---|
| **Route** | `/projects/:id/sprint` |
| **Sidebar** | per-project shell, **Sprint active** (badge = Jira ticket count) |
| **Mockup** | `mockups.html` `#s6` (the old Kanban visual — now labeled Sprint) |
| **Visible when** | unlocked at project-context confirmation |

### Purpose
"Where is every story, and what's Jira saying?" The Jira board. Creates Jira stories from completed requirements; the **master story-status tracker across all stages**. Cross-cutting — Design/Build/QA each show their slice.

### Zones
1. **Jira-sync banner** — `role="status"`; "Two-way Jira sync is on… Status changes in Jira update this board within 30s." + `Open in Jira ↗`.
2. **Kanban board** — 4 columns: To do / In progress / In review / Done. Each card: ticket ID (`TM-*`), title, priority dot, Code Agent avatar, point estimate, live status (in progress / PR open / done — not "shipped").
3. **(Empty/setup state — no Jira link)** When Sprint is unlocked but no Jira link is configured, the Sprint tab shows a **Connect Jira setup state** instead of the board: configure project key, base URL, sync direction, auth. Jira is required for the board to function.

### State
- `GET /api/projects/:id/build/board` (now the Sprint board) → columns + cards.
- `GET /api/projects/:id/jira/sync` → sync status.
- Story lifecycle (Jira status is the spine): `Requirements complete → Sprint creates Jira stories → human BA reviews → transition to Design → … "Ready for QA" → QA agent → "In QA" → tests → pass = deployed to QA env / fail = back to Build rework queue.`

### Actions
- Open a card → story detail.
- `Open in Jira ↗` → external Jira.
- Manual sync (if exposed).
- `Connect Jira` setup actions (project key, base URL, sync, auth) when no link exists.

### Exit → Design (stories in design) · Build (stories in build + rework) · QA (stories in QA)

### Decisions locked
1. **Sprint = the Jira board** (moved out of Build). Master story tracker across all stages.
2. **Jira is integrated via Sprint.**
3. Old Screen 6 contract is the Sprint board; the *Build* tab is no longer the board.
4. **Sprint is status-only — NO Rules tab** (exception to the two-halves pattern). The board IS the steerable surface.
5. **Jira is required** to use the Sprint tab. Without a link, the Connect Jira setup state replaces the board.
6. **3-Code-Agent strip moves to the Agents tab** — Sprint is board-only.

### Open / deferred
- **Jira config home** — proposed default: in-Sprint Connect Jira setup state (locked). Alternative considered: dedicated global Settings screen. To confirm in Phase 2 session.

---

## Design tab — drafted contract (no mockup yet)

| | |
|---|---|
| **Route** | `/projects/:id` · Design tab |
| **Sidebar** | per-project shell, **Design active** (no badge) |
| **Visible when** | unlocked after project-context confirmation |
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
1. Design tab = design-journey output + editable design rules (two halves — Status / Rules switch).
2. Design agent updates the story to **"Ready for development"** on design complete (ties to the Sprint board).
3. Design rules **write back to the `design-system/` folder** (control-console pattern).
4. Peer review is Design Agent A ↔ B (per the framework), surfaced in the agent strip.
5. **Artifacts viewer = hybrid** — tokens + interaction states rendered in-app; wireframes + hi-fi link to Figma.
6. **Peer-review surface = per-story review thread** — A↔B comments + disagreements shown inline per story.
7. **Everything is editable** — the user can edit both the design rules (Rules tab) AND the per-story design checklist/status (not agent-managed-only).

### Open / deferred
- **Mockup not yet created** — design the visual first.

---

## Build tab — redefined (no longer the Kanban)

| | |
|---|---|
| **Route** | `/projects/:id/build` |
| **Sidebar** | per-project shell, **Build active** (badge = Jira ticket count — was literal "Jira", now a count) |
| **Visible when** | unlocked after project-context confirmation |
| **Mockup** | not yet created — mock first. |

### Purpose
"How is this project configured to build, and what came back from QA/review?" Build = **config + architecture + rework**, not a board. Two halves: **status** + **editable rules**.

### Zones
1. **Stories-in-build stats** — stories currently in Build (Being built · Ready for review · Ready for QA), counts. The board itself lives in Sprint; this is the Build slice.
2. **Rework queue** — stories that failed QA or review and came back. Each row: story, failed-at (QA/Review), reason, link to evidence.
3. **Architecture panel** — FE / BE / BFF / DB / host summary.
4. **Editable build rules** (steering half) — build rules, deployment rules, environments, coding guidelines, build lifecycle. Edits write back to the project's on-disk folder (`code-builder/`, `../skills/coding-guidelines.md`).

### State
- `GET /api/projects/:id/build/stories` → Build-slice story status + rework queue.
- `GET /api/projects/:id/build/config` + `PUT` → build/deploy rules, environments, architecture; read from / write back to disk.

### Actions
- Open a rework story → detail + evidence.
- Edit build rules → writes to disk → Code Agents pick up on next run.
- View architecture summary.

### Exit → Sprint (story status) · QA (on "Ready for QA")

### Decisions locked
1. **Build = config + architecture + rework**, not a board. Old Screen 6 contract is **discarded**.
2. Build rules **write back to the project folder** (control-console pattern).
3. QA fail / review fail → back to Build rework queue.
4. **Architecture panel is read-only** — inferred by agents; the user steers build behavior via the Rules tab only (single steering surface). No edit affordances on the architecture row.

### Open / deferred
- **Mockup not yet created** — design the visual first.

---

## QA tab — drafted contract (no mockup yet)

| | |
|---|---|
| **Route** | `/projects/:id` · QA tab |
| **Sidebar** | per-project shell, **QA active** (badge = failing/pending test count) |
| **Visible when** | unlocked after project-context confirmation |
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
1. QA tab = test results + screenshots + editable QA rules (two halves — Status / Rules switch).
2. **Screenshots are first-class** — visible confirmations (pass) and issue screenshots (fail) per test step.
3. QA rules **write back to the `testing/` folder** (control-console pattern).
4. QA pass → **deployed to QA environment** (Build tab shows deploy status); QA fail → **back to Build rework queue**.
5. **Manual re-run available** — a `Re-run tests` action on the QA tab (per story/test) runs alongside the QA agent's autonomous runs.
6. **Tools panel = Playwright only** for now (scope tight); extend later.

### Open / deferred
- **Mockup not yet created** — design the visual first.
- Screenshot storage/retention — where Playwright screenshots live, how many kept — implementation detail.

---

## Agents tab — not yet mocked

| | |
|---|---|
| **Route** | `/projects/:id/agents` |
| **Sidebar** | per-project shell, **Agents active** (no badge) |
| **Visible when** | always |
| **Mockup** | not yet created. |

### Purpose
"Which framework agents are working on this project right now?" The agent roster + status. The Code Agent strip (currently under the Sprint board) may live here instead.

### Zones (proposed)
1. **Agent roster** — BA, Design A/B, Code 1/2/3, QA, Reviewer — avatar, role, current task, status (active/idle/blocked), elapsed/ETA.
2. **Code Agent strip** — the 3 Code Agents' current work + ETA. **Moved here from the Sprint tab** so Sprint stays board-only.
3. **Agent detail** — selected agent's current work + recent activity.

### State
- `GET /api/projects/:id/agents` → currently active agents + status.

### Decisions locked
1. Agent roster lives here.
2. **3-Code-Agent strip moved here from Sprint.**

### Open / deferred
- **Mockup not yet created** — design the visual first.

---

## Activity tab — partial (Overview right column)

| | |
|---|---|
| **Route** | `/projects/:id/activity` |
| **Sidebar** | per-project shell, **Activity active** (no badge) |
| **Visible when** | always |

### Purpose
"What's happened on this project?" Standalone activity feed (the Overview right-column feed, full-width with filters).

### Zones (proposed)
1. **Activity timeline** — agent-coloured avatars (BA peach, Design sky, Code mint, Review butter, QA lavender, Orchestrator navy), message, timestamp.
2. **Filters** — agent / stage / kind (proposed default).

### State
- `GET /api/projects/:id/activity` → timeline (paginated).

### Decisions locked
1. Filters = **agent / stage / kind** (proposed default — confirm during Phase 2 mockup).

### Open / deferred
- **Mockup not yet created** — design the visual first.

---

## Artifacts tab — partial (Overview right column)

| | |
|---|---|
| **Route** | `/projects/:id/artifacts` |
| **Sidebar** | per-project shell, **Artifacts active** (no badge) |
| **Visible when** | always |

### Purpose
"What's been generated?" Standalone artifact list (the Overview right-column list, full-width).

### Zones (proposed)
1. **Artifact file tree** — generated docs, code, designs; kind tag, path, size, created_at. Opens via **in-app viewer**.

### State
- `GET /api/projects/:id/artifacts` → artifact list.

### Decisions locked
1. Opens via **in-app viewer**.

### Open / deferred
- **Mockup not yet created** — design the visual first.

---

## Screen 10 — App shell — reference (legacy v4 chrome)

| | |
|---|---|
| **Route** | persistent layout (reference only — **not live product**) |
| **Mockup** | `mockups.html` `#s10` |

### Purpose
The original v4 global sidebar (Dashboard / Projects / Intake / Design Library / QA Runs / Settings) preserved verbatim so reviewers can compare old vs new navigation. **Not part of the live product.** Documented here as archived.

### Decisions locked
1. Reference only — not reachable in the live app; kept in the mockup for comparison.

---

## Screen 11 — UI kit

| | |
|---|---|
| **Route** | `/__kit` |
| **Sidebar** | none |
| **Mockup** | `mockups.html` `#s11` |

### Purpose
The reference page for the design system: all design tokens, type scale, buttons (5 variants incl. disabled), status pills (7), priority rings, 7-stage stepper, pipeline mini-bar (4 progress states), banner variants, form fields (default + error), chat bubbles, Kanban cards, agent avatars, sample project card.

### Decisions locked
1. `/__kit` is the canonical visual reference; tokens live in `design-system/tokens/`.

---

## Appendix A — Intake flow (folded from plan.archived.md)

Two-step, all on `/new`:

- **Step 1 — Folder pick (Screen 7).** Centered card; validates path; same call shape as today's `/api/init`.
- **Step 2 — BA-Agent chat (Screen 8).** Workspace name becomes the folder path, "← Change folder" link appears. Chat thread left, helper card right. On `idea` fence: success banner → project record created → redirect to `/projects/:id`.

No sidebar on either step — the user isn't "in a project" yet.

Carry-over from `server.js` (to keep working unchanged):
- `POST /api/init` — folder pick + framework scaffold + `project-dir.txt` pin.
- `POST /api/chat` — NDJSON stream, `idea` fence detection, `idea.md` write + backup. The React app consumes the stream with `ReadableStream` + `getReader()`.
- `GET /api/health` — unchanged.

---

## Appendix B — Data model (folded from plan.archived.md)

```
Project    id, name, slug, one_liner, folder_path,
           current_stage, status, created_at, updated_at
Stage      project_id, stage_key, status, started_at, completed_at, meta(json)
Artifact   id, project_id, stage_key, label, path, kind, created_at
Activity   id, project_id, agent, message, kind, ts
Chat       session_id, project_id?, messages(json), folder_path
JiraLink   project_id, jira_project_key, jira_base_url, last_synced_at
KanbanCard id, project_id, ticket_key, title, column, priority,
           points, assignee_agent, status, updated_at

-- BA Workspace: PRD files on disk are the source of truth;
-- a small table tracks each file's review state.
ba_artifact_status   project_id, file_name, status, dirty, updated_at
                     -- status CHECK in ('draft','review','returned','approved')
prd_comment          id, project_id, author_agent, target_file, body, ts
                     -- threaded comments while a file is In Review (SA).
```

Carry-over notes:
- Framework agents (BA, Design, Code, QA) need to **write** stage transitions and activity items — the API surface isn't only user-facing.
- The app should own `project-dir.txt` — write/update it whenever a project is created or focused.
- `JiraLink` and `KanbanCard` support the Sprint board.
- The BA Workspace reads artifact files **directly from `PRD/` on disk**; the SQLite `artifact` table only carries one row per project (the original `idea.md`) so we don't duplicate path-of-truth with the filesystem.

---

## Appendix C — Stack direction (folded from plan.archived.md)

- **Vite + React + TypeScript**, hand-rolled components matching the tokens; WCAG AA per `skills/accessibility-guidelines.md`.
- **React Router** for routes; **TanStack Query** (or plain fetch hooks) for API state.
- A small **Node API** keeps `/api/init`, `/api/chat`, `/api/health` and adds `/api/projects*`, `/api/projects/:id/stage`, `/api/projects/:id/activity`, plus the per-tab endpoints in each contract above. Vite dev server proxies to it.
- Replaces `idea-intake/`.

### Style tokens (unchanged from v4)

| Token | Value |
|-------|-------|
| Ground | Lavender→blue diagonal gradient (`#d9d5ec` → `#c3cde8`) |
| App panel | Frosted white `rgba(255,255,255,.72)` + backdrop blur, radius 28px |
| Cards | Solid whites/tints, radius 20–24px, no hard borders |
| Active nav / primary CTA | Dark navy pill `#322a5c` |
| Tiles | Peach `#fbdcbe`, Sky `#cfe0f4`, Lavender `#e6e1f7`, Mint `#d7efe4`, Butter `#f7edc6` |
| Accents | Coral `#ef7f57`, Blue `#6fa9e0`, Purple `#9b7fde`, Green `#5fbf95` |
| Type | Inter (UI) + JetBrains Mono (paths/IDs) |
| Text | Ink `#2b2547`, secondary `#8b87a5` |

---

## Appendix D — Accessibility & state coverage (folded from plan.archived.md)

Per `skills/ui-best-practices.md` / `skills/accessibility-guidelines.md`:

- **Initial Projects screen** — no sidebar for a calmer first paint; pastel skeleton tiles while loading; error banner with focus management + retry on `/projects`; first-visit empty state has `+ New idea` CTA with focus ring.
- **Project detail screens** — keyboard-navigable per-project menu with `aria-current="page"` on the active item; 7-stage stepper with `aria-current="step"` on the active stage.
- **Sprint / Kanban** — keyboard drag-and-drop with announcement; Jira-sync banner uses `role="status"`.
- **New idea flow** — explicit back/cancel in step 1; "← Change folder" link in step 2.

### Project Background (12–14) + Requirements (15)

**Loading.** Project Background shows a pastel skeleton for the 17-row file tree + a skeleton block for the right-pane document; the stage strip renders immediately from cached counts. Requirements shows a skeleton for user-story groups while parsing frontmatter; the filter bar renders disabled until parse completes.

**Empty.** Project Background on a brand-new project: all 17 rows show the `Draft` status dot and a disabled "no file yet" placeholder; the strip reads `0/17 artifacts · 17 Draft`. Requirements on a brand-new project: an empty-state card "No requirements yet — the BA will draft them in Project Background" with `Open Project Background →` (BA only).

**Error.** Project Background: a rose banner at the top of the right pane on a file fetch failure, with a focus-managed `Retry`; the tree stays interactive; only the failed row is marked `⚠ failed to load`; `aria-live="assertive"`. Requirements: a rose banner with `Retry`; the filter bar stays interactive. Both: a 404 from `…/ba-workspace/:name` routes to a "This file is no longer part of the project" card with `Back to tree`.

**Search / filter no-results.** Requirements: when type + status + search produce zero rows, groups collapse and a centered "No requirements match these filters" card with `Clear filters` appears; `aria-live="polite"`.

**Keyboard / focus.** Project Background file tree: arrow keys move selection; `Enter` opens; the selected row gets a 2px coral focus ring distinct from the dark-navy pill. View ↔ Edit swap: focus moves to the first interactive element of the new pane; `aria-selected` on the tab strip. Requirements: `⌘F`/`Ctrl-F` focuses search; `Esc` clears; chips are radio/checkbox styled with `aria-pressed`. Inline review thread (14): `Tab` order is SA comment → BA reply → next; `role="log"` on the thread; `aria-live="polite"` on new comments.

**Confirmation on destructive transitions.** `Approve ✓` (14) opens an inline confirm with `Cancel` / `Confirm` — focus starts on `Cancel`, `Enter` confirms. `Discard` (13) asks for confirm only if the body has more than 5 lines of changes; otherwise reverts without prompt.

---

## Appendix E — BA artifacts (17 total)

The BA Agent produces 17 files per project, all under `PRD/` inside the project's folder. The Project Background workspace surfaces all 17.

| # | File | Group | Purpose |
|---|------|-------|---------|
| 1 | `prd.md` | Core PRD | Main PRD — problem, users, MVP, success metrics, user journeys. Source of `BR-` IDs in §8. |
| 2 | `glossary.md` | Scope & rules | Domain terms + definitions. |
| 3 | `stakeholder-map.md` | Scope & rules | Who's affected / accountable / consulted / informed. |
| 4 | `business-rules.md` | Scope & rules | Authoritative domain rules (state machines, automations, edge cases). Does **not** own `BR-`/`TR-` IDs. |
| 5 | `assumptions.md` | Scope & rules | BA-made assumptions when the user skipped an intake question. |
| 6 | `open-questions.md` | Scope & rules | Every open / in-discussion / resolved entry with `Blocker-for`. |
| 7 | `data-model.md` | Data & access | Entities, fields, enums + state transitions, PII handling summary. |
| 8 | `data-flow.md` | Data & access | PII data-flow + trust-boundary map. |
| 9 | `rbac-matrix.md` | Data & access | Roles × permissions matrix. |
| 10 | `nfr-catalog.md` | Data & access | Performance / availability / observability targets. |
| 11 | `phasing-plan.md` | Planning & risk | Phases, exit criteria, rollout / kill-switch plan. |
| 12 | `traffic-profile.md` | Planning & risk | Expected access patterns (RPS, seasonality, hot keys). |
| 13 | `cost-model.md` | Planning & risk | Run-rate cost model. |
| 14 | `risks.md` | Planning & risk | Top risks + mitigations + owners. |
| 15 | `tech-decision-brief.md` | SA handoff | Open questions, constraints, candidate stacks, SA's recommended pick + rationale. |
| 16 | `personas.md` | Core PRD | Long-form personas referenced by `prd.md` §5. |
| 17 | `user-journeys.md` | Core PRD | One subsection per user story. Source of `TR-` IDs (frontmatter) and journey diagrams. |

Two more files exist but are written by *other* stages and shown elsewhere: `prd-questions.md` (surfaced in `prd.md` §11) and `idea.md` (Intake — lives at the project root, **not** under `PRD/`; surfaced on Overview and via the "Linked project" promo).

Review comments for a file in `In Review (SA)` are **not** a file — they live on the API (`prd_comment` table) and render inline below the document on screen 14.

---

## Cross-links

- **Design, Build, QA** (the two-halves tabs) reference the **Sprint tab** as the master story tracker.
- Every stage tab references **Project Background** as the gate.
- **Requirements** is derived from **Project Background** and is always visible.
- **Sprint** is status-only (no Rules tab) and references the **Agents tab** for the 3-Code-Agent strip.

---

## One-line summary

The canonical 10-tab launcher site map: Project Background is the gate; Sprint is split from Build; Overview collapses Screens 3/4/5; Design/Build/QA use a Status/Rules two-halves pattern (Rules writes back to disk); Sprint is status-only with a Connect-Jira setup state.