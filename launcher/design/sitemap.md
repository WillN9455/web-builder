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
| 2 | `Requirements` / `PRD` | Requirements | Two sub-states: `Requirements` = intake chat completed, idea captured, PRD not started (the stepper still shows step 2); `PRD` = BA drafting the 17 PRD files, SA reviews file-by-file; Requirements tab = signed-off BR/TR list | BA + SA |
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

- `project.current_stage` CHECK → `('Intake','Requirements','PRD','Design','Build','Review','QA','Shipped')`
  - implemented: `Requirements` is the intake-complete sub-state between `Intake` and `PRD` (the full `PRD`→`Requirements` / `Shipped`→`Deployed` rename remains deferred)
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
- `POST /api/init` — validates the path only. Folder creation, framework scaffold, and the `project-dir.txt` pin are **deferred to intake completion** (the final idea fence in the chat) — an abandoned interview leaves nothing on disk. *(Owner decision, Web-builder thread 2026-09-02; supersedes the original scaffold-at-pick contract.)*

### Actions
- `Create project folder →` → validates and advances to step 2 (`/new` chat). Nothing is created on disk yet.
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
- From Screen 7 after the folder is picked. Also the target of the **"Open chat →"** link in the Overview-blocked Outstanding-questions panel — that action resumes the intake BA chat (this screen). (The Project Background open-questions banner no longer links here; it now links to Overview via `View questions →`.)

### Purpose
The BA Agent interviews the user about their idea and writes `idea.md`. Two-column: the conversation on the left, what's been captured on the right.

### Zones
1. **Chat thread** (left) — BA ↔ user bubbles; streaming via `POST /api/chat` (NDJSON).
2. **Interview progress** (right) — checklist of captured fields (Problem, Users & scale, MVP scope, Business rules, Brand & design, Tech stack…) with ✓/current/pending states.
3. **Outstanding questions** (right, below Interview progress) — read-only list grouped by `Blocker-for:` (e.g. `Blocker-for: PRD-approval`, `Blocker-for: Design`). **Always visible** in the chat side panel. Uses the same greyed-out WCAG locked-tab treatment (see Global conventions § Locked tabs) while there are no outstanding questions; unlocks to the active style once questions exist. No inline answer surface — but each item is clickable: clicking sends a re-ask request to the BA, who re-asks that question in chat; once the user's answer is captured the BA resolves it (`::oq-resolve::ID::`) and the item leaves the panel. (Owner-approved interaction change over the mockup's original click-to-draft hint, `#s8b`.)
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
4. **"Open chat →" target = this screen** (intake BA chat), not a project-level thread. Applies from the Overview-blocked Outstanding-questions panel. The Project Background open-questions banner now links to Overview (`View questions →`), not here.

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
- On fence: create the project row (`current_stage: Requirements` — intake chat complete), write `idea.md`, append `activity`. The early row created at `/api/init` stays `Intake`; `renameProject` advances it on the fence.

### Actions
- `Open project →` → `/projects/:id` (stage = `Requirements` — intake complete, lands on Overview).
- `View idea.md` → **in-app markdown viewer**.

### Exit → `/projects/:id` · `/projects` (back)

### Decisions locked
1. The early project row is created at `Intake`; on the final fence the row advances to `Requirements` (intake complete). The Overview focus tab is Project Background (next stage), but landing is still Overview.
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

## Project Background tab — screens 12 (draft) · 13 (unsaved edits) · 14 (SA review) + State D (gate)

| | |
|---|---|
| **Route** | `/projects/:id/background` |
| **Sidebar** | per-project shell, **Project Background active** (badge = artifact count, 17 max) |
| **Mockup** | `background.html` (12 draft, 13 unsaved edits, 14 SA review, + State D confirm) |
| **Visible when** | always |
| **Role** | BA authors; SA reviews/edits during `In Review (SA)`; Design/Code/QA read-only. |

**The gate.** Downstream tabs stay locked until the project context is confirmed here.

### Purpose
"Where did this project come from, and is the context ready to build on?" The BA Workspace — the 17-file PRD artifact authoring + SA-review surface, and the place where the whole context is confirmed.

### Zones
1. **Stage banner** — live counts (`9 Draft / 2 In Review / 1 Returned / 3 Approved`), not a bulk action.
2. **Open-questions banner** (butter-yellow) — when `open-questions.md` has `Blocker-for: PRD-approval` items; **links to the Overview screen** (`/projects/:id`, Overview tab) where the Outstanding-questions panel surfaces them. The banner's sole action is `View questions →`. It no longer deep-links into the intake BA chat.
3. **Left rail — 5-band file tree** — Core PRD · Scope & rules · Data & access · Planning & risk · SA handoff. 17 artifacts total. Each row: colored status dot (Draft purple / In Review amber / Returned rose / Approved green), dirty inset (coral) when editing.
4. **Right pane — document editor** — **always editable (no View/Edit mode toggle)**. The selected file renders as a BA monospace textarea in every state where editing is permitted. There is no separate read-only "View" mode; the user edits inline and saves separately. The only exception is `In Review (SA)`, where the body is read-only (SA markup preserved) until the file is returned.
5. **Inline review thread** (State C) — below the document when a file is `In Review (SA)`; interleaves SA + BA comments; Compose box.

### State — A: draft (Screen 12)
- File tree + selected file's body in the editor textarea (always editable; no View/Edit toggle).
- `GET /api/projects/:id/ba-workspace/files` → tree + per-file status + dirty flag.
- `GET /api/projects/:id/ba-workspace/files/:name` → markdown body loaded into the editor.
- Footer: `Save changes` / `Send for review →`.

### State — B: unsaved edits (Screen 13, BA-only)
- Monospace textarea; dirty state in tree (coral inset) + header (`● Unsaved changes`). No View/Edit toggle.
- Footer (status-aware): `Discard` / `Save changes` / `Send for SA review →` (only enabled while the file is `Draft` or `Returned`). Edit locked while `In Review (SA)`.
- `PUT /api/projects/:id/ba-workspace/files/:name` → save body (409 if `In Review (SA)`).

### State — C: SA review (Screen 14)
- Active file is `In Review (SA)`. Body read-only with SA's inline `blockquote` markup preserved. No View/Edit toggle (read-only is implied by the review state, not a tab).
- Footer: `Return to BA` / `Approve ✓` (was "Mark Completed ✓" — renamed; status becomes `Approved`).
- `POST /api/projects/:id/ba-workspace/files/:name/comments` → append reply.
- `GET .../comments` → thread.

### State — D: context-ready / confirm (the gate)
- Reached when all 17 docs are `Approved`. A **dedicated confirmation view** (not a banner/modal) lets the user confirm the whole context.
- **Uses the same per-project shell as the other Project Background screens** — full 10-tab sidebar (Project Background active, downstream tabs still locked pre-confirmation) + topbar (`← Projects`, project name, stage pill) + the State D confirmation card. It does **not** use a stripped-down or alternate chrome.
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
- Browse tree; open a file (editor, always editable); save changes (separate action); send for SA review; return; approve; comment; confirm context (State D).

### Exit → Requirements (derived) · Sprint/Design/Build/QA (on confirm)

### Decisions locked
1. **Project Background is the gate** — two-step, one-shot unlock (see Global conventions).
2. **17 artifacts across 5 bands**; per-file state machine Draft → In Review → Returned → **Approved**.
3. **3 doc states + 1 gate view** (A draft · B unsaved edits · C SA review · D context-ready/confirm).
4. **Stage banner = live counts**, not a bulk action.
5. **Write-back to on-disk `PRD/`**; no destructive deletes.
6. Terminal state renamed "Completed" → "Approved"; button "Mark Completed ✓" → "Approve ✓".
7. **Re-lock on revoke = keep unlocked, warn only** — once confirmed, downstream tabs stay accessible; if a file is later un-Approved, a banner warns "context changed since confirmation". The unlock does not re-arm.
8. **Open-questions banner links to Overview** — the banner's sole action is `View questions →`, navigating to the Overview tab where the Outstanding-questions panel shows the `Blocker-for: PRD-approval` items. It no longer deep-links into the intake BA chat (Screen 8). *(Revises the earlier decision that linked the banner to the intake chat.)*
9. **No View/Edit mode toggle** — the right pane is always an editable textarea (BA monospace) for `Draft` / `Returned` / clean files; the user edits inline and clicks `Save changes` separately. `In Review (SA)` is read-only by virtue of state, not via a View tab. *(Revises the earlier View/Edit tab decision.)*
10. **State D uses the standard per-project shell** — the same 10-tab sidebar + topbar as screens 12–14, with the State D confirmation card in the main column. No alternate/stripped chrome.

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
| **Mockup** | `launcher/design/design-tab.html` (v5.3) — § D (list) + § E (Story detail, populated) + § F (Story detail, empty state) |
| **Role** | The Design stage workspace. Design Agent A + B run the design journey per story. The tab is both the design-output viewer **and** the editable design-rules surface. |

### Purpose
"What's being designed, and how should the design agents run?" Shows per-story design status + produced design artifacts (tokens, wireframes, hi-fi, interaction states, a11y audit), plus editable design rules that write back to the project's `design-system/` folder. Two halves: **status** + **editable rules**. Each row drills down to a **Story detail** page (§ below) where the per-story review surface lives.

### Zones
1. **Design summary / stats** — stories in design (Being designed · Design complete · Ready for development), counts.
2. **Per-story design list** — each story: id · status pill · title · assignee · **`Open story →`** drill-down button. The 5-state design journey is shown via the status pill (not an inline stepper); the full journey is on the Story detail page.
3. **Design agent strip** — Design Agent A + B status (working on which story, peer-review state).
4. **Editable design rules** (steering half) — design guidelines, accessibility rules (WCAG 2.1 AA), component-spec rules, token rules, constraints ("CSS-implementable only", "SVGs over raster"). Edits write back to `design-system/` (map to `../skills/accessibility-guidelines.md`, `../skills/ui-best-practices.md`).

### State
- `GET /api/projects/:id/design/stories` → per-story design status.
- `GET /api/projects/:id/design/rules` + `PUT` → editable design rules; read from / write back to `design-system/`.
- Design agent completes a story → `POST /api/projects/:id/stories/:id/transition` `{to: "Ready for development"}` → reflects on Sprint board.
- Per-story drill-down → `GET /api/projects/:id/design/:storyId` → Story detail page (§ below).

### Actions
- Click `Open story →` on a row → Story detail page for that story.
- Edit design rules → writes to `design-system/` → design agents pick up on next run.
- Design agents autonomously update story status; the user monitors + steers via rules (no manual story moves needed).

### Exit → Story detail (§ below) · Sprint (story status) · Build (once "Ready for development")

### Decisions locked
1. Design tab = design-journey output + editable design rules (two halves — Status / Rules switch).
2. Design agent updates the story to **"Ready for development"** on design complete (ties to the Sprint board).
3. Design rules **write back to the `design-system/` folder** (control-console pattern).
4. Peer review is Design Agent A ↔ B (per the framework), surfaced in the agent strip on the list page and the per-story thread on the Story detail page.
5. **Row UI is flat in v5.3** — no inline stepper, no inline `.story-detail` expansion. The 5-state journey is signalled by the status pill; everything else (artifacts, review thread, interaction states) lives on the dedicated Story detail page.
6. **Per-story review surface = Story detail page** — not inline. A↔B comments + disagreements + a state-toggle preview live on a focused per-story page reachable from each row.
7. **Everything is editable** — the user can edit both the design rules (Rules tab) AND the per-story design checklist/status (not agent-managed-only).

### Open / deferred
- Figma embeds on the Story detail page use a same-origin iframe with inline `srcdoc` for the v5.3 mockup. A true Figma embed URL is a v5.4 deliverable.

---

## Design — Story detail (per-story drill-down)

| | |
|---|---|
| **Route** | `/projects/:id/design/:storyId` |
| **Sidebar** | per-project shell, **Design active** (no badge); side-promo card swaps to the current story's id + status |
| **Visible when** | unlocked after project-context confirmation |
| **Mockup** | `launcher/design/design-tab.html` § E (populated) + § F (empty state) |
| **Requirements** | `launcher/design/design-story-requirements.md` |

### Purpose
"Where do I actually work on this story?" The focused, per-story home for design review. The human and the two design agents (DA + DB) work on one story at a time here — read the linked requirement, see and swap interaction-state previews of the design, attach a source, and post in the A↔B review thread. Replaces the v5.2 inline `.story-detail` expansion that used to sit below the selected row on the Design list.

### Entry
- Per-project sidebar → Design tab → row → `Open story →` button (primary).
- Direct URL: `/projects/:id/design/:storyId` (deep links from Sprint, Activity, agent notifications).
- `Open in Design ↗` from the Sprint board card for a story in any design stage.

### Zones
1. **Story header card** — id · status pill · title · `Mark design complete →` (disabled when not in Peer review / Design complete) · secondary `Request changes` (in Peer review only).
2. **Linked requirement card (left)** — requirement icon · id (TM-XX, monospace) · title · description · **Intended users** chip row (Property manager · Tenant · Admin, each colour-coded) · `Open in Requirements →` link.
3. **Add design source card (right, always visible)** — two attach buttons: `Add Figma link` (reveals URL input + Save) and `Upload HTML` (file picker, v5.3 stub). Acts as the primary CTA on the empty state.
4. **Design preview card** — header with source-type pill + a11y chip + 4-state toggle group (Default · Loading · Error · Success) · body with iframe preview OR empty state. Toggles swap the iframe content; `aria-live="polite"` announces changes.
5. **Linked source card** — when a source is attached: icon (`H` for HTML / `F` for Figma) · file/URL + size + last-edited · `Replace` + `Remove` actions. Replaces with a `+ Add design source` CTA on the empty state.
6. **A↔B peer review thread** — same `.thread` / `.comment` / `.compose` classes as the parent Design tab. Comments with disagreements get an amber callout.

### State
- `GET /api/projects/:id/design/:storyId` → story detail (requirement link, source, thread, status).
- `POST /api/projects/:id/design/:storyId/source` `{type: "figma" | "html", value: "..."}` → attach a source.
- `DELETE /api/projects/:id/design/:storyId/source` → remove the source.
- `POST /api/projects/:id/design/:storyId/thread` → post a comment.
- `POST /api/projects/:id/stories/:id/transition` `{to: "Design complete" | "Ready for development"}` → the `Mark design complete` action.

### Actions
- Toggle between Default / Loading / Error / Success — keyboard arrow keys + Home / End.
- `Add Figma link` / `Upload HTML` — attach a source.
- `Replace` / `Remove` source — confirmed inline before Remove.
- Post a comment in the A↔B thread.
- `Mark design complete →` — flip the story to the next stage.
- `← Back to design list` (side-foot) or click the `Design` segment of the breadcrumb.

### Exit → Design list (`/projects/:id` · Design tab) · Sprint (story status) · Requirements (TM linked from the card)

### Decisions locked
1. **One screen per story, not inline expansion** — keeps the list scannable and the detail focused.
2. **Always-visible Add source controls** — also serve as the empty-state CTA. No hidden "Add source" button.
3. **4-state toggle group above the iframe** — matches the kit-tabs single-active pattern. `aria-live="polite"` on the preview body.
4. **Source card has both Replace and Remove** — Replace reuses the attach UI; Remove shows a confirmation and transitions to the empty state.
5. **Empty state disables the toggle group and the compose box** — `aria-disabled="true"`, `tabindex="-1"`. The `Add Figma link` button becomes primary.
6. **Disabled `Mark design complete`** on stories in `Picked up` / `In design` — visual fade, `aria-disabled="true"`, `cursor: not-allowed`.
7. **A↔B thread reuses the parent Design tab's classes** — no new comment system, no new tokens.

### Open / deferred
- Real Figma embed rendering (v5.3 mockup uses same-origin iframe with inline `srcdoc`; v5.4 wires the true Figma URL).
- Drag-and-drop for HTML upload (v5.3 is file-picker only).
- Multi-source per story (v5.3 is single-source).
- Version history of attached sources (v5.3 keeps only the most recent).

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

## QA tab — mockup at v5.3 (3 screens)

| | |
|---|---|
| **Route** | `/projects/:id` · QA tab · **3 screens**: `#qa` (Status list), `#qasd` (Story QA detail), `#qar` (Rules) |
| **Sidebar** | per-project shell, **QA active** (badge = failing/pending test count). **Cog in the project header opens `#qar`**; **back-arrow on `#qasd` and `#qar`** returns to `#qa` (cog replaces the inline Status/Rules pill switcher). |
| **Visible when** | unlocked after project-context confirmation |
| **Role** | The QA stage workspace. The QA Agent tests feature fidelity against requirements (Playwright). The tab shows test results + screenshot evidence and the editable QA-rules surface. |
| **Mockup** | `launcher/design/qa-tab.html` (v5.3, 3 screens, 1493 lines). |

### Purpose
"What passed/failed QA, and how should the QA agent test?" Three screens — **Status list**, **Story QA detail**, **Rules** — opened from the cog in the project header. Shows per-story test status with **screenshot evidence**, plus editable QA rules (testing framework, rules, guidelines) that write back to the project's `testing/` folder. Two halves (Status / Rules) reached via the cog, not via inline pill switch — parity with the build-tab v5.5 chrome.

### Zones
1. **QA verdict banner** — top of Status list. `9/12 stories Passed · 2 Failed (in rework) · 1 In QA — not ready for deploy`. When all pass: mint variant with `Sign off & deploy to QA env →` (action endpoint: `POST /api/projects/:id/qa/signoff`).
2. **Environment panel** — read-only, deployed from Build. QA env URL, build/commit SHA, deployed-at timestamp, seeded-data reset policy.
3. **QA summary / stats** — 6 tiles (Ready for QA · In QA · Passed · Failed · **Flaky** · **Blocked/Skipped**). Pass rate excludes Flaky (denominator: Passed + Failed + Blocked); footnote documents the rule.
4. **Coverage strip** — `12/15 acceptance criteria covered · 3 untested`. Pivots the tab from dashboard to testing tool.
5. **Per-story test list** — story ID + status pill + test-result strip + screenshot thumbs + open button. Filter chips: All / Ready for QA / In QA / Passed / Failed / Flaky / Blocked (7 buttons). Inline round-trip line when a story has cycled through Build rework (`Failed round 1 → in Build rework → fixed → Ready for QA (round 2)`; escalation hint at ≥3 failed rounds).
6. **Run history per story** — collapsible sub-row on Status list; full table on Story detail (run #, trigger, duration, timestamp, result). Enables flaky detection.
7. **QA agent panel** — mirrors build-tab `.agent-card` (QA Agent + Reviewer). Shows live activity + queue.
8. **QA tools panel** — Playwright config (browser, headed, trace, retries, base URL) + test rules in force (a11y WCAG 2.1 AA, fidelity, coverage, screenshot retention).
9. **Results by dimension** — functional / a11y (axe, WCAG 2.1 AA) / feature-fidelity lanes. Compact on Status list, full per-story on Story detail. A story can pass functionally and fail a11y — split signals.
10. **Story QA detail (`#qasd`)** — drill-down: linked requirement + dimension card, rework round-trip banner (`.rework-banner`), run history table, per-test rows (dimension badge + expected vs actual + Playwright trace + console/network), annotated screenshot viewer (relocated from v5.2 inline), visual diff (gated on failed visual tests; deferred-with-note if out of scope), notes thread (QA Agent + Reviewer + user).
11. **Editable QA rules (`#qar`)** — Playwright config card, test rules in force card, markdown editor (`testing/qa-rules.md`), per-agent guidelines (`QA-AGENT.md`, `REVIEWER-AGENT.md`). Edits write back to `testing/` (map to `../skills/`, `../testing/playwright/`).
12. **UI states** (ui-best-practices C.17–20) — empty ("Build will promote stories here"), running (`Running 7/14 · Test 3 in progress · 1 failure so far`), error (QA env unreachable · retry), no-screenshots ("Screenshots appear after the first run.").

### State
- `GET /api/projects/:id/qa/stories` → per-story QA status + test results.
- `GET /api/projects/:id/qa/tests/:storyId` → tests, steps, screenshots (pass/issue).
- `GET /api/projects/:id/qa/rules` + `PUT` → editable QA rules; read from / write back to `testing/`.
- `GET /api/projects/:id/qa/env` → env URL, commit SHA under test, deployed-at timestamp (read from Build's deploy record).
- `GET /api/projects/:id/qa/coverage` → covered/uncovered acceptance-criterion IDs.
- `GET /api/projects/:id/qa/runs/:storyId` → run history (run #, trigger, duration, timestamp, result).
- `POST /api/projects/:id/qa/runs` → trigger a run (scope selector: full suite / smoke subset / story TM-NN).
- `POST /api/projects/:id/qa/signoff` → when all pass, advance to QA env deploy (Build tab updates deploy status).
- QA agent transitions story: `Ready for QA` → `In QA` → tests → pass (→ deployed to QA environment, Build tab shows deploy status) / fail (→ back to Build rework queue) / **Flaky** (excluded from pass rate, review for quarantine) / **Blocked/Skipped-with-reason** (not blocking deploy).

### Actions
- Open a story's full QA detail (`#qasd`).
- View a failure screenshot with annotation · View expected-vs-actual per step · Open Playwright trace.
- Edit QA rules → writes to `testing/` → QA agent picks up on next run.
- Re-run tests manually (`Re-run all tests` on Status list · `Re-run` on Story detail) — exposed alongside the QA agent's autonomous runs.
- View untested acceptance criteria (coverage strip drill-down).
- Sign off + deploy to QA env (only when all-pass).

### Exit → sibling tabs (Sprint for story status; Build rework queue on fail; Build tab deploy status on pass)

### Decisions locked
1. QA tab = test results + screenshots + editable QA rules (two halves — Status / Rules switch).
2. **Screenshots are first-class** — visible confirmations (pass) and issue screenshots (fail) per test step.
3. QA rules **write back to the `testing/` folder** (control-console pattern).
4. QA pass → **deployed to QA environment** (Build tab shows deploy status); QA fail → **back to Build rework queue**.
5. **Manual re-run available** — a `Re-run tests` action on the QA tab (per story/test) runs alongside the QA agent's autonomous runs.
6. **Tools panel = Playwright only** for now (scope tight); extend later.
7. **Three screens with hash routing** (`#qa`, `#qasd`, `#qar`) — pure anchors, no JS required.
8. **Cog replaces the inline Status/Rules pill switcher** — Rules half opens via cog in the project header (parity with build-tab v5.5 chrome).
9. **New statuses** — **Flaky** (amber on butter, excluded from pass-rate numerator) and **Blocked/Skipped-with-reason** (slate/neutral, distinct from `Failed`'s rose on blush).
10. **Story QA detail shows expected vs actual per step** — plus Playwright trace link, console errors, network failures, dimension badge (functional / a11y / feature-fidelity), and the failing step's AC reference.
11. **Visual diff is gated behind failed visual tests** — expected / actual / diff side-by-side 3-pane. If out of scope, render as deferred-with-note (no broken affordance).

### Open / deferred
- Mockup landed at `launcher/design/qa-tab.html` (v5.3, 3 screens, 1493 lines).
- Screenshot storage/retention — where Playwright screenshots live, how many kept — implementation detail (deferred-to-impl per locked decisions).
- **Flaky quarantine policy** — when does Flaky escalate to Quarantined? Locked policy in `testing/qa-rules.md`: 5 runs with any fail → Quarantine; 3 consecutive pass → remove Flaky flag. Visual diff implementation deferred if out of scope.

---

## Agents tab — v5.3 mockup

| | |
|---|---|
| **Route** | `/projects/:id/agents` |
| **Sidebar** | per-project shell, **Agents active** (no badge) |
| **Visible when** | always |
| **Mockup** | `launcher/design/agents-tab.html` (v5.3, 1 screen `#sag`, 1028 lines) |

### Purpose
"Who is each agent, what is it doing right now, and how is the overall process going?" The single-half monitor of the framework's agents. Always visible. Does **not** split into Status/Rules — steering happens on the stage tabs (Design / Build / QA Rules), and this tab is read-only with pointer links to those surfaces.

### Zones
1. **Process-completion overview strip** (top, above roster) — 6-stage pipeline bar (Requirements → Design → Build → Review → QA → Deployed) with per-stage counts and the active stage highlighted; sprint-level stat row (done / in-flight / blocked / rework loops); top-level blocked banner for any agent waiting on another. Surfaces the project-level state of work, not just per-agent status.
2. **Agent roster** — 8 cards: BA · DA · DB · C1 · C2 · C3 · QA · Reviewer. Each: colored avatar (sitemap color code), name, role line, current task, status pill (active/idle/blocked — dot+text, WCAG), elapsed/ETA footer.
3. **3-Code-Agent strip** — C1/C2/C3 cards with current story, progress bar, pass-rate chip. C3 shows the blocked state. **Moved here from Sprint** (sitemap § Sprint decision 6).
4. **Selected agent detail** (left column) — detail head + **Assignment** card (current story · PR · rules in force with pointer link · memory bank stats) + **About this agent (character sheet)** — role blurb, mini 6-stage pipeline with this agent's stage highlighted, inputs/outputs cards, **adversarial review relationships** (who critiques this agent, who it critiques — from AGENTS.md) + **Configuration · loadout** — model + effort, harness/runtime, trigger/autonomy row (reactive by default; shows the event that summoned this agent + turns taken), context-in-force pointer, steer-here pointer.
5. **Selected agent detail** (right column) — **Context · save file** card (context-budget bar — always-in-context vs on-demand skills per CLAUDE.md § Skill Invocation Rules table) + **Job-board queue · up next** (next 2–3 assignments with blocked items and escalation rows) + **Steer here** (pointer links to stage-tab Rules surfaces, manual override actions) + **Turn trace** (Buzz "Traces" — 4 turns shown, files touched, tools run, PR updates, turn boundaries; subset of the Activity tab).
6. **Notes block** — read-only footer reaffirming single-half monitor semantics.

### State
- `GET /api/projects/:id/agents` → roster + per-agent status.
- `GET /api/projects/:id/agents/:agentId` → selected agent detail (assignment, loadout, context, job-board queue, turn trace).
- Sprint-level stats derive from the Sprint board; pipeline counts derive from the project's story tracker.

### Decisions locked
1. Agent roster lives here.
2. **3-Code-Agent strip moved here from Sprint** so Sprint stays board-only.
3. **Single-half monitor — never splits into Status/Rules.** Steering happens on the stage tabs (Design / Build / QA Rules), which write back to disk. The Agents tab is read-only with pointer links.
4. **Process-completion strip is the answer to "where are we?"** — pipeline bar + sprint stats + blocked banner at the top of the tab, not just per-agent pills.
5. **Character sheet makes each agent legible** — role blurb + mini pipeline (this agent's stage highlighted) + inputs/outputs + adversarial-review relationships. Closes the "what is this agent?" gap.
6. **Loadout card surfaces Buzz-style agent config** (model · effort · harness · trigger/autonomy). Read-only; pointer to the relevant stage-tab Rules surface for any actual edit.
7. **Context / save-file viz** — distinguishes always-in-context (CLAUDE.md, AGENTS.md, framework guidelines) from on-demand skills (per CLAUDE.md § Skill Invocation Rules table). Includes a context-budget bar.
8. **Job-board queue per agent** — next 2–3 assignments + blocked items + escalations. Closes the "what's next?" gap.
9. **Turn trace = a subset of the Activity tab**, scoped to the selected agent. Files touched, tools run, PR updates, turn boundaries. The Activity tab owns the full timeline.
10. **No editor controls anywhere on this tab** — only pointer links to the stage-tab Rules surfaces (Build Rules, Design Rules, QA Rules). The single steering surface stays on the stage tabs.
11. **Status conveyed by text+dot, not color alone** (WCAG). Mono font for timestamps / IDs / commit hashes.

### Open / deferred
- *None beyond the locked decisions.*

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
- `POST /api/init` — folder pick; validates only. Scaffold + `project-dir.txt` pin happen at intake completion (see Screen 7 · State).
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

**Keyboard / focus.** Project Background file tree: arrow keys move selection; `Enter` opens; the selected row gets a 2px coral focus ring distinct from the dark-navy pill. The editor is always a textarea (no View/Edit tab swap); focus moves into the textarea when a file opens; `aria-current="true"` on the selected tree row. Requirements: `⌘F`/`Ctrl-F` focuses search; `Esc` clears; chips are radio/checkbox styled with `aria-pressed`. Inline review thread (14): `Tab` order is SA comment → BA reply → next; `role="log"` on the thread; `aria-live="polite"` on new comments.

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