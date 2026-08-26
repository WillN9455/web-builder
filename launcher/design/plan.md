# Idea Hub — App Plan (v5.2)

An update to v5.1. **v5.2 relabels the BA Workspace tab to `Project Background`** and adds a new top-level **`Requirements`** tab next to it. Project Background is the BA Workspace — the 17-file authoring + SA-review surface (screens 12–14) where the BA Agent drafts each PRD artifact and the SA Agent reviews it file-by-file. The new Requirements tab shows a curated list of business & technical requirements grouped by user story, read by SA, devs, designers, and QA as the source of truth for what must be built. The BA Workspace's file tree, per-file review workflow, and view/edit tabs are unchanged — only the tab label changes. Earlier `mockups.html` files in `launcher/design/` are intentionally ignored — v5.2 stands on its own.

## What changed in v5.2 (Project Background relabel + Requirements list view)

- **BA Workspace tab relabeled to `Project Background`.** The tab in the per-project side menu previously called Requirements (which opened the BA Workspace) is now called **Project Background**. The contents, file tree, per-file review workflow, and view/edit tabs are unchanged. Screen 12's banner now reads **"15 artifacts"** (not "source documents") to match what the workspace actually holds.
- **New `Requirements` tab next to Project Background.** Holds a curated list of business & technical requirements grouped by user story, rendered from `prd.md` §8 + per-story frontmatter in `user-journeys.md`. Filterable by type (Business / Technical), status (Open / Approved / Blocked), and free-text search. Each row carries a stable ID (`BR-001`, `TR-001`…), a type tag, a MoSCoW priority, a status pill, and an owner.
- **No new endpoints, no new data model.** The requirements list is rendered by parsing `prd.md` and the per-story sections of `user-journeys.md`; `BR-`/`TR-` IDs are stable frontmatter keys on those sections.
- **Role model is per-action, not per-tab.**
  - **Project Background** — BA authors; SA reviews/edits during `In Review (SA)`; Design, Code, QA read-only.
  - **Requirements** — BA authors; everyone else (SA, Design, Code, QA) reads. No one but the BA adds or changes a requirement.
  - Background is the "where it came from" / authoring surface; Requirements is the "what must be built" / signed-off surface.

## What changed from v4

- **No global sidebar.** The initial `/projects` screen is single-column (`app full`). The New idea flow (`/new`) and empty state also have no sidebar — you only see the project menu inside a project.
- **Per-project menu.** When a project is open, the left sidebar shows project-scoped items: **Overview** (default landing), **Project Background** (BA Workspace — 15 PRD artifacts, per-file review; badge = total artifact count for the project), **Requirements** (BR/TR list grouped by user story; badge = total requirement count), **Design** (design system + wireframes + tokens), **Build** (Jira Kanban board), **Agents** (which framework agents are active), **QA** (test runs), **Activity** (timeline), **Artifacts** (generated files).
- **New Build / Jira Kanban screen.** Replaces the placeholder for "Build stage" — shows a 4-column board (To do / In progress / In review / Done) with Jira ticket IDs (e.g. `TM-18`), Code Agent avatars on each card, a Jira-sync banner, and an "Agent strip" at the bottom showing each of the 3 Code Agents' current work + ETA.
- **Topbar gets a primary CTA.** The initial Projects topbar now has a `+ New idea` button on the right (next to the avatar). Same for the empty state.
- **App shell moved to "reference".** The original v4 sidebar (Dashboard / Projects / Intake / Design Library / QA Runs / Settings) is preserved as Screen 10 — `App shell — reference (legacy v4 chrome)` — so reviewers can compare the old vs new navigation.

## What changed in v5.1 (BA Workspace)

- **Replaces the placeholder Project Detail screen.** `/projects/:id` now lands on the **Project Background** menu item (renamed from Requirements in v5.2), which opens the **BA Workspace** (screens 12–14). The v5 placeholder ("Project detail ships in Stage 2") is gone.
- **15-file artifact tree on the left.** Five groups — Core PRD, Scope & rules, Data & access, Planning & risk, SA handoff — give the BA a one-glance view of everything the BA Agent drafted. Each file shows a colored status dot — Draft / In Review / Returned / Completed — so the BA can see at a glance which files the SA still owes feedback on.
- **Markdown viewer + in-place editor on the right.** View renders the markdown with proper headings, lists, tables, code blocks, and blockquotes. Edit swaps the body for a full-pane monospace textarea; dirty state is reflected in both the tree (coral inset bar) and the document header (`● Unsaved changes`).
- **Per-file review workflow — no bulk handoff.** Every artifact moves independently through `Draft → In Review (SA) → Returned / Completed`. The BA can send one file at a time (`Send for SA review →` in the document footer); the SA can edit the file and reply in the inline comment thread; the BA then either marks it `Returned to BA` (hand back for another pass) or `Completed` (accept SA's edits). The stage banner shows live counts (`8 Draft / 3 In Review / 1 Returned / 3 Completed`) instead of a single send-all action.
- **Inline comment thread on every file.** Screen 14 shows what an SA-in-review file looks like from the BA side: the document body is locked while the SA is reading, the SA's inline `blockquote` markup is preserved, and a `Compose` reply box sits below the thread so the BA can answer without leaving the page.
- **Open-questions banner.** Butter-yellow strip under the stage banner when `Blocker-for: PRD-approval` open questions exist; deep-links to `prd.md` §11. Mirrors the BA Agent's review-gate rule in `skills/general-best-practices.md`.
- **Seven new endpoints** under `/api/projects/:id/ba-workspace/*` (per-file transition endpoints replace the v5 bulk `send-to-sa`). No SQLite schema changes — the PRD files on disk are the source of truth, the existing `activity` table logs each edit + transition.

## Concept

Three jobs:

1. **Track** — every idea ever captured becomes a project with its own folder, stage, and history.
2. **Show progress** — the 7-stage pipeline is visible on every project card and drives the project detail page.
3. **Intake** — the existing chat interview (folder pick → BA interview → `idea.md` written) lives inside the app as `/new`, not as a separate tool.

The visual shift: the app reads as a single calm **workshop dashboard** — one pastel tile per idea, aggregate progress as soft ring charts, no chrome competing with the cards. The chrome itself only appears when it earns its place (inside a project).

## Style (unchanged from v4)

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

## Screens (v5.2 — 15 total)

| # | Screen | Route | Sidebar | Purpose |
|---|--------|-------|---------|---------|
| 1 | Projects — initial (no menu) | `/projects` | none | Single-column. Topbar (logo, search, notif, avatar, **+ New idea**). "Active now" 3×2 pastel tile grid, aggregate pipeline ring chart + status legend + Next milestone card, "All projects" table. |
| 2 | Projects — empty state | `/projects` (first visit) | none | Centered illustration card with `+ New idea` + secondary "Import a folder" CTA. Topbar present, no sidebar. |
| 3 | Project detail — Design active | `/projects/:id · Overview` | project menu (Overview active) | Project header (pastel tile, name, one-liner, mono path, team avatars), 7-stage stepper, "Current stage — Design" panel with checklist + agent callout, right column (Activity + Artifacts). |
| 4 | Project detail — Blocked | `/projects/:id · Project Background` | project menu (Project Background active) | Same chrome, PRD step is rose/red, error banner shows the blocker, "Open questions for you" replaces the checklist, right column shows the last successful stage. |
| 5 | Project detail — Shipped | `/projects/:id · Overview` | project menu (Overview active) | All 7 steps in dark-navy with ✓, "Journey" checklist of every stage, Ship Summary card over Mint + Peach tiles. |
| 6 | Project detail — Build / Jira Kanban | `/projects/:id · Build` | project menu (Build active) | Jira-sync banner, 4-column Kanban board (To do / In progress / In review / Done) with `TM-*` ticket IDs, Code Agent avatars on cards, Agent strip at bottom showing each of the 3 Code Agents. |
| 7 | New idea — folder pick | `/new · step 1` | none | Centered pastel card: "Step 1 of 2" crumb, path input (mono), helper, inline error banner, Cancel + "Create project folder →" actions. |
| 8 | New idea — BA-Agent chat | `/new · step 2` | none (chat-side widget) | Two-column: chat thread (BA ↔ user bubbles) on left, "Interview progress" sidebar on right. |
| 9 | New idea — captured (success) | `/new · final` | none | Big checkmark, project name, summary of what was written, "View idea.md" + "Open project →". |
| 10 | App shell — reference (legacy v4 chrome) | persistent layout | **v4 sidebar** (Dashboard / Projects / Intake / Design Library / QA Runs / Settings) | Preserved verbatim from v4 — kept so reviewers can compare old vs new navigation. Not part of the live product. |
| 11 | UI kit | `/__kit` | none | All design tokens, type scale, buttons, status pills, priority rings, 7-stage stepper, pipeline mini-bar, banner variants, form fields, chat bubbles, Kanban cards, agent avatars, sample project card. |
| 12 | **Project Background — view** *(renamed from BA Workspace — view in v5.2)* | `/projects/:id · Project Background` | project menu (Project Background active) | 15-file artifact tree on the left (5 groups: Core PRD, Scope & rules, Data & access, Planning & risk, SA handoff). Every row carries a colored status dot (Draft / In Review / Returned / Completed). Right pane renders the selected source document with `View` / `Edit` tabs (Edit = BA only). Stage banner at top shows live counts (e.g. `8 Draft / 3 In Review / 1 Returned / 3 Completed`). |
| 13 | **Project Background — edit** *(renamed from BA Workspace — edit in v5.2)* | `/projects/:id · Project Background · Edit` | project menu (Project Background active) | Same chrome; right pane switches to a monospace textarea. Dirty file gets a coral indicator in the tree; footer shows the file's current status pill + `Cmd-S` hint + Discard / Save changes / Send for SA review (only enabled while the file is in Draft or Returned). |
| 14 | **Project Background — file in SA review** *(renamed from BA Workspace — file in SA review in v5.2)* | `/projects/:id · Project Background · data-model.md · In Review` | project menu (Project Background active) | Same chrome; the active file is in the `In Review (SA)` state. Body is a read-only preview with the SA's inline `blockquote` markup preserved; footer shows `Return to BA` and `Mark Completed ✓`. Below the document is an inline `.review-thread` — SA + BA comments interleaved with a Compose box — so the BA can answer SA questions without leaving the page. |
| 15 | **Requirements — list of requirements by user story** *(new in v5.2)* | `/projects/:id · Requirements` | project menu (Requirements active) | Read-only list of business & technical requirements, grouped by user story (US-01 …). Filter bar (All / Business / Technical tabs, Open / Approved / Blocked chips, free-text search). Each row carries a stable `BR-xxx` / `TR-xxx` ID, a type tag, MoSCoW priority, status pill, and owner. Stage banner shows totals (e.g. `9 Business / 6 Technical / 3 Blocked`) and links back to Project Background for context. This is the source of truth for what must be built; SA, devs, designers, and QA read it. |

## Project Background + Requirements — design notes (v5.1 BA Workspace, relabeled in v5.2)

The BA Workspace is the **default landing for PRD-stage projects** when the Project Background tab is open. The previous placeholder ("Project detail ships in Stage 2") is gone; the project menu opens directly onto the file tree under Project Background.

In v5.2 the BA Workspace tab is renamed **Project Background**; a brand-new top-level **Requirements** tab is added next to it. They are two different views of the same PRD pack — not the same file tree:

- **Project Background** is the **authoring + review surface** for the 17 PRD files the BA and SA Agents work on (15 PRD artifacts + `personas.md` + `user-journeys.md`). It is the BA Workspace itself: a left-rail file tree grouped into five bands (Core PRD, Scope & rules, Data & access, Planning & risk, SA handoff), each row carrying a per-file status dot, with View/Edit tabs on the right and a per-file review state machine. **BA authors**, **SA reviews/edits during `In Review (SA)`**, **Design/Code/QA read-only**.
- **Requirements** is the **signed-off "what must be built" surface** — a curated list of business & technical requirements grouped by user story. Each row has a stable `BR-xxx` / `TR-xxx` ID, a type tag (Business / Technical), MoSCoW priority, status pill, and owner. **BA authors**; **SA, Design, Code, QA read-only**. This is the source of truth Design, Build, and QA build against.

**Why two tabs, not one.** Project Background holds *everything the BA drafts* (15+2 files), and Requirements holds the *extracted requirement list* Design and Build consume. Conflating them would force the BA to scroll past long-form prose to find a single requirement, and would tempt Design/Code/QA to read the prose instead of the list.

**Source-of-truth rule (resolves naming drift from earlier drafts).**

- `BR-` (business requirements) IDs live in the frontmatter of `prd.md` §8 user-story subsections (one block per story), and each BR row carries `story: US-NN`, `type: business`, MoSCoW, status, owner.
- `TR-` (technical requirements) IDs live in `user-journeys.md` per-story frontmatter, and each TR row carries the same shape with `type: technical`.
- The Requirements tab is a renderer over these two files — it never owns data.
- `business-rules.md` (artifact #4) keeps domain rules (state machines, automations, edge cases) and **does not** own `BR-`/`TR-` IDs. This avoids the earlier confusion between "business rules" (domain logic) and "business requirements" (the signed-off list).
- `idea.md` is a framework-level reference (not under `PRD/`) and is surfaced on the Overview screen, not here. It is the only file in the workspace that lives outside the project's `PRD/` folder.

No new endpoints, no new data model — both tabs read from the on-disk `PRD/` directory.

**Why a workspace, not a doc list.** The BA Agent now produces **15 artifacts** per project (see [BA artifacts](#ba-artifacts-new-in-v51) below), not just one PRD. The Requirements screen has to make every one of them visible at a glance, jump between them without losing context, and clearly show the handoff boundary to the next agent.

**Per-file review workflow (no bulk send).** Every artifact moves through its own state machine, independently:

```
Draft  ──Send for SA review──▶  In Review (SA)
                                     │
                                     ├── Return to BA ──▶ Returned ──▶ (BA edits) ──▶ Draft
                                     │
                                     └── Mark Completed ──▶ Completed
```

The BA picks a single file in the tree and clicks `Send for SA review →` in that file's footer. The project stays at `current_stage: PRD, status: active`; only the file's own state changes. The stage banner at the top is informational — it shows live counts (`8 Draft / 3 In Review / 1 Returned / 3 Completed`) so the BA can see at a glance which files still need the SA's attention. The stage doesn't transition to `review` until **every** file is `Completed` (or the BA moves the project forward manually).

**Three core interactions.**

1. **Browse.** The left rail groups the 15 files into five bands — *Core PRD*, *Scope & rules*, *Data & access*, *Planning & risk*, *SA handoff*. Every row carries a colored status dot — purple (Draft), amber (In Review), rose (Returned), green (Completed). The currently-selected file gets the dark-navy pill; a secondary status pill in the document header mirrors the dot so the BA never loses the file's state.
2. **Read or edit.** The right pane is a single-card document viewer with a View / Edit tab strip. View renders the markdown (headings, lists, tables, code blocks, blockquotes — all the styling is already in `mockups.html`). Edit swaps the body for a full-pane monospace textarea; dirty state shows in both the tree (coral inset bar) and the header (`● Unsaved changes`). Edit is locked while the file is `In Review (SA)` — the BA has to either accept the SA's edits (`Mark Completed`) or hand the file back (`Return to BA`) before resuming editing.
3. **Transition a file.** The document footer's right side is status-aware:
   - On a `Draft` or `Returned` file: `Discard` / `Save changes` / `Send for SA review →`.
   - On an `In Review (SA)` file (BA side): `Return to BA` / `Mark Completed ✓`. Comments live in the inline `.review-thread` rendered below the document (no separate file).
   - On a `Completed` file: `Reopen for editing` only.

   Each transition appends one `activity` row (e.g. `BA Agent · "Sent data-model.md for SA review"` or `SA Agent · "Marked business-rules.md Completed"`).

**Inline comment thread (screen 14).** When a file is in `In Review (SA)`, the SA's inline `blockquote` markup is rendered inside the document body, and a `.review-thread` block appears below the document footer. The thread interleaves SA + BA comments and ends with a Compose box so the BA can answer without leaving the page. Reply submissions go through a small per-file comment endpoint (see [endpoints](#new-endpoints-for-v51-ba-workspace--screens-12-14) below).

**Project stage / status.** The project's own `current_stage` / `status` doesn't change per-file anymore. It stays `current_stage: PRD, status: active` until the BA (or an automated check) decides the PRD pack is ready — typically when all 15 files are `Completed`, or when the BA explicitly moves the project forward. Open questions still gate the project: if any `Blocker-for: PRD-approval` open questions exist, the project is `blocked`, regardless of how many files are `Completed`.

**Open questions banner.** If any `Blocker-for: PRD-approval` open questions exist, the workspace shows a butter-yellow banner under the stage strip with a count + a deep link to `prd.md` §11. This mirrors the BA Agent's review-gate rule in `skills/general-best-practices.md`.

## BA artifacts (v5.2 — 17 total: 15 PRD artifacts + personas + user journeys)

The BA Agent produces 17 files per project, all under `PRD/` inside the project's folder. The Project Background workspace surfaces all 17:

| # | File | Group | Purpose |
|---|------|-------|---------|
| 1 | `prd.md` | Core PRD | The main PRD — problem, users, MVP, success metrics, user journeys. Source of `BR-` IDs in §8. |
| 2 | `glossary.md` | Scope & rules | Domain terms + definitions so SA / Design Agents don't reinvent them. |
| 3 | `stakeholder-map.md` | Scope & rules | Who's affected, who's accountable, who's consulted/informed. |
| 4 | `business-rules.md` | Scope & rules | Authoritative domain business rules (state machines, automations, edge cases). Does **not** own `BR-`/`TR-` IDs. |
| 5 | `assumptions.md` | Scope & rules | BA-made assumptions when the user skipped an intake question. |
| 6 | `open-questions.md` | Scope & rules | The §11 mirror — every open / in-discussion / resolved entry with `Blocker-for`. |
| 7 | `data-model.md` | Data & access | Entities, fields, enums + state transitions, PII handling summary. |
| 8 | `data-flow.md` | Data & access | PII data-flow + trust-boundary map. |
| 9 | `rbac-matrix.md` | Data & access | Roles × permissions matrix (rows = roles, columns = capabilities). |
| 10 | `nfr-catalog.md` | Data & access | Performance / availability / observability targets. |
| 11 | `phasing-plan.md` | Planning & risk | Phases, exit criteria, rollout / kill-switch plan. |
| 12 | `traffic-profile.md` | Planning & risk | Expected access patterns (RPS, seasonality, hot keys). |
| 13 | `cost-model.md` | Planning & risk | Run-rate cost model (infra + per-seat + per-request). |
| 14 | `risks.md` | Planning & risk | Top risks + mitigations + owners. |
| 15 | `tech-decision-brief.md` | SA handoff | Open questions, constraints, candidate stacks, SA's recommended pick + rationale. |
| 16 | `personas.md` | Core PRD | Long-form personas referenced by `prd.md` §5. Read by Design for tone-of-voice; read by Code for permission roles. |
| 17 | `user-journeys.md` | Core PRD | One subsection per user story. Source of `TR-` IDs (frontmatter) and of journey diagrams Design builds from. |

Two more files exist but are written by *other* stages and shown elsewhere:

- `prd-questions.md` (user clarifications; surfaced in §11 of `prd.md`).
- `idea.md` (Intake — lives at the project root, **not** under `PRD/`; surfaced on the Overview screen and via the "Linked project" promo card).

Review comments for a file in `In Review (SA)` are **not** a file — they live on the API (see `prd_comment` table below and the `GET/POST /api/projects/:id/ba-workspace/:name/comments` endpoints) and are rendered inline below the document on screen 14. There is no `reviewer-comments.md` on disk.

**How 15 vs 17 is communicated in the UI.** Screen 12's banner shows **"17 artifacts"** (the actual on-disk count for the BA Workspace). The legacy "15-file artifact tree" wording in v5.1 copy was correct for the PRD pack only; v5.2 reflects the full set. The Requirements tab banner shows **"N business & technical requirements"** (no file count — it's a list, not a file tree).

## Stage model

Unchanged from v4. Seven stages, statuses `queued / active / review / blocked / done` (final reads `shipped`):

```
Intake → PRD → Design → Build → Review → QA → Shipped
```

Maps 1:1 to the framework workflow (CLAUDE.md):

| Stage | Framework stage | Owner |
|-------|-----------------|-------|
| Intake | Idea capture (`idea-intake/server.js` today) | BA Agent |
| PRD | Stage 1 — Requirements Gathering | BA Agent + Reviewer |
| Design | Stage 2 — Design Generation | Design Agent A + B |
| Build | Stage 3 — Code Generation | 3 Code Agents (parallel) — tasks tracked in Jira |
| Review | Stage 4 — Review | Dev + BA + Design reviewers |
| QA | Stage 5 — QA Testing | QA Agent |
| Shipped | Stage 6 — Deployment | Main Orchestrator |

## Per-project menu (new in v5; v5.2 = 9 items)

The 9 items that appear in the left sidebar whenever a project is open. v5.2 splits the old single "Requirements" entry into two tabs (Project Background + Requirements) — see [What changed in v5.2](#what-changed-in-v52-project-background-relabel--requirements-list-view) for context.

| # | Item | Lands on | What it shows | Badge |
|---|------|----------|---------------|-------|
| 1 | **Overview** | `/projects/:id` (default) | Project header, 7-stage stepper, current-stage panel, activity + artifacts | — |
| 2 | **Project Background** | `/projects/:id/background` | BA Workspace — 17-file PRD artifact tree (Core PRD / Scope & rules / Data & access / Planning & risk / SA handoff) with per-file review state, View/Edit panes, open-questions banner | Total artifact count (constant `17` until the BA marks any missing) |
| 3 | **Requirements** | `/projects/:id/requirements` | Read-only list of business & technical requirements grouped by user story (BR-xxx / TR-xxx IDs) | Total requirement count (`BR + TR`) |
| 4 | **Design** | `/projects/:id/design` | Design tokens, wireframes, hi-fi mockups, peer review state | — |
| 5 | **Build** | `/projects/:id/build` | Jira Kanban board (4 columns), Code Agent strip, sync status | "Jira" pill (no number) |
| 6 | **Agents** | `/projects/:id/agents` | Active framework agents for this project (BA, Design A/B, Code 1/2/3, QA, Reviewer) with avatars + status | — |
| 7 | **QA** | `/projects/:id/qa` | Test runs, Playwright results, accessibility audits | Open test-run count |
| 8 | **Activity** | `/projects/:id/activity` | Timeline of everything that happened, agent-coloured | — |
| 9 | **Artifacts** | `/projects/:id/artifacts` | File tree of generated docs, code, designs | — |

**Badge semantics (per item):**

- **Project Background** — count of PRD artifacts that exist on disk out of the 17-name allowlist. New projects show `0` until the BA Agent drafts the first file; the banner reads "0/17 artifacts" instead of just the count.
- **Requirements** — total `BR-*` + `TR-*` rows parsed from `prd.md` §8 and `user-journeys.md` frontmatter.
- **QA** — count of test runs with status ≠ `passed` & ≠ `shipped` (open work only).
- **Build** — never a number; shows "Jira" to surface the integration.

Each item uses a different icon (line SVG, 1.8 stroke, currentColor) — see Screen 3 mockup. The active item gets the dark-navy pill background. `aria-current="page"` is set on the active item; `aria-current="step"` on the 7-stage stepper's active segment.

Below the menu, a small "Linked project" promo card reminds the user that `idea.md` lives at the project root (framework-level reference, not under `PRD/`), with a one-click "Open idea.md →" button. A footer adds "← All projects" and "Help & support" links.

## Project card design

Unchanged from v4. Two elements per card:

1. **Pastel tile** — one of five pastel backgrounds, picked by hashing the project name. Holds project name, one-liner, and a status pill (`Active`, `In review`, `Blocked`, `Shipped`).
2. **Pipeline mini-bar** — 7 horizontal segments below the tile: filled = done, raised/highlighted = active, outlined = queued, warning dot = blocked.

## Intake flow

Unchanged from v4. Two-step, all on `/new`:

- **Step 1 — Folder pick.** Centered card; validates path; same call shape as today's `/api/init`.
- **Step 2 — BA-Agent chat.** Workspace name becomes the folder path, "← Change folder" link appears. Chat thread left, helper card right. On `idea` fence: success banner → project record created → redirect to `/projects/:id`.

No sidebar on either step — the user isn't "in a project" yet.

## Jira / Build integration (new in v5)

The Build screen (Screen 6) introduces a **two-way Jira sync**:

- Issues are created from PRD requirements on entering the Build stage. They get project-prefixed IDs (e.g. `TM-*` for Tenant Maintenance).
- The Kanban board renders 4 columns: **To do / In progress / In review / Done**. Each card shows ticket ID, title, priority dot (rose/amber/grey), Code Agent avatar (mint/sky/butter for C1/C2/C3), point estimate, and live status (in progress / PR open / shipped).
- A persistent banner at the top of the screen states: "Two-way Jira sync is on. Tickets created here appear in the TM Jira project. Status changes in Jira update this board within 30s." A side-promo card in the menu has "Open in Jira ↗".
- An **Agent strip** below the board shows each of the 3 Code Agents working in parallel: avatar, name + current task, elapsed time, ETA, Active pill.

## Data model (for the later DB conversation)

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

-- New in v5.1 — BA Workspace reads these from disk via the artifact table;
-- nothing new in SQLite, the PRD files themselves are the source of truth.
ArtifactEntry   (virtual — from PRD/ folder)
                project_id, name (e.g. 'prd.md'), group, size_bytes,
                exists, dirty (set client-side on edit)
ReviewerNote    id, project_id, author_agent, target_file, body, ts
                -- threaded comments on a PRD artifact while it is In Review (SA).
                -- Written and read via /api/projects/:id/ba-workspace/:name/comments.
                -- Rendered inline on screen 14 — there is no reviewer-comments.md on disk.
```

The BA Workspace reads the artifact files **directly from `PRD/` on disk** — the SQLite `artifact` table only carries one row per project (the original `idea.md`) so we don't duplicate path-of-truth with the BA's filesystem. The 15-file tree is rendered from a fixed list (see *BA artifacts* above) and each row reports `exists` + `size_bytes` based on what `fs.stat` returns. Saves rewrite the file in place and append one `activity` row.

Carry-over notes:

- Framework agents (BA, Design, Code, QA) need to **write** stage transitions and activity items — the API surface isn't only user-facing.
- The app should own `project-dir.txt` — write/update it whenever a project is created or focused, so existing framework flows keep working unchanged.
- The JiraLink and KanbanCard tables are new in v5 to support the Build / Jira Kanban view.

## Stack direction

Unchanged from v4.

- **Vite + React + TypeScript**, hand-rolled components matching the tokens above; WCAG AA per `skills/accessibility-guidelines.md`.
- **React Router** for routes; **TanStack Query** (or plain fetch hooks) for API state.
- A small **Node API** keeps `/api/init`, `/api/chat`, `/api/health` and adds `/api/projects*`, `/api/projects/:id/stage`, `/api/projects/:id/activity`. Vite dev server proxies to it.
- Replaces `idea-intake/`.

## Accessibility & state coverage

Per `skills/ui-best-practices.md` / `skills/accessibility-guidelines.md`:

- The initial Projects screen (no sidebar) gives a calmer first paint — no nested nav competing with content.
- Pastel skeleton tiles while loading, error banner with focus management + retry on `/projects`.
- First-visit empty state has `+ New idea` CTA with focus ring.
- Project detail screens: keyboard-navigable per-project menu with `aria-current="page"` on the active item, 7-stage stepper with `aria-current="step"` on the active stage.
- Build / Kanban: keyboard drag-and-drop with announcement, Jira-sync banner uses `role="status"` so screen readers pick it up.
- New idea flow: explicit back/cancel in step 1, "← Change folder" link in step 2.

### Project Background (screens 12–14) and Requirements (screen 15)

The v5.1 a11y block did not cover the BA Workspace or the Requirements list. v5.2 closes the gap so screens 12–15 ship in a state that matches the rest of the app.

**Loading.**

- Project Background (12) shows a pastel skeleton for the 17-row file tree (group headers + rows) and a separate skeleton block for the right-pane document while the markdown is being read from disk. The stage strip renders immediately from the cached status counts so the BA can see what is owed.
- Requirements (15) shows a skeleton for the user-story groups while parsing `prd.md` and `user-journeys.md` frontmatter. The filter bar renders with all controls disabled until the parse completes.

**Empty.**

- Project Background on a brand-new project (the BA Agent has not drafted anything yet): the file tree shows all 17 rows with the `Draft` status dot and a disabled "no file yet" placeholder in the right pane; the stage strip reads `0/17 artifacts · 17 Draft`. There is no error state.
- Requirements on a brand-new project: a single empty-state card inside the right pane reading "No requirements yet — the BA will draft them in Project Background" with a `Open Project Background →` button (BA only; hidden for other roles).

**Error.**

- Project Background: a single rose banner at the top of the right pane when a file fetch fails, with a focus-managed `Retry` button. The file tree remains interactive; only the failed row is marked `⚠ failed to load`. `aria-live="assertive"` so the failure is announced.
- Requirements: a single rose banner at the top with `Retry`. The filter bar remains interactive (filters the previously-loaded list).
- Both: a 404 from `…/ba-workspace/:name` (file removed between list and fetch) routes the BA to a small "This file is no longer part of the project" card with `Back to tree` instead of crashing the route.

**Search / filter no-results.**

- Requirements (15) filter bar: when type + status + search produce zero rows, the user-story groups collapse and a centered "No requirements match these filters" card appears with a `Clear filters` action. `aria-live="polite"` so the change is announced.

**Keyboard / focus.**

- Project Background file tree: arrow keys move selection between rows; `Enter` opens the file in the right pane; `Space` toggles a future "select for batch view" affordance. The currently-selected file receives focus-visible styling distinct from the dark-navy pill (a 2px coral focus ring) so screen readers and keyboard users don't lose the selection when the pill is applied.
- View ↔ Edit swap (12 → 13): focus moves to the first interactive element of the new pane (the textarea on Edit, the first heading on View). `aria-selected` on the tab strip; `Tab` moves between tabs, not into the body.
- Requirements list (15): `⌘F` / `Ctrl-F` focuses the search input; `Esc` clears it. Filter chips are radio-style (one of `All / Business / Technical`) with `aria-pressed`; status chips are checkbox-style (multi-select).
- Inline review thread on screen 14: `Tab` order is SA comment → BA reply → next SA comment, with `role="log"` on the thread and `aria-live="polite"` on new comments.

**Confirmation on destructive transitions.**

- `Mark Completed ✓` on screen 14 (BA accepts SA's edits) opens a small inline confirm with `Cancel` / `Confirm` — focus starts on `Cancel`, `Enter` confirms.
- `Discard` on screen 13 (revert unsaved edit) asks for confirm only if the body has more than 5 lines of changes; otherwise it reverts without prompt.

## Status

- [x] v5 plan + HTML mockups — `launcher/design/mockups.html` (14 screens, ~165KB, self-contained)
- [x] v5.1 plan + HTML mockups — BA Workspace (screens 12–14, 15 PRD artifacts)
- [x] v5.2 plan + HTML mockups — Project Background tab relabel + Requirements list view (screen 15 new; screens 12–14 now show 17 artifacts including personas + user-journeys; labels + sidebar counts + per-project menu updated)
- [ ] Backend / DB design — next conversation (the v5.1 endpoints are described in the **New endpoints for v5.1** section below; not yet implemented)
- [ ] Scaffold Vite React app once mockups are approved

## What's in `mockups.html`

| # | Screen | Route | Sidebar | Notes |
|---|--------|-------|---------|-------|
| 1 | Projects — initial (no menu) | `/projects` | none | Single-column (`app full`). Topbar with logo, search, notifications, avatar, `+ New idea` CTA. Active now tiles, pipeline ring, all projects table. |
| 2 | Projects — empty state | `/projects` (first visit) | none | Centered illustration card with `+ New idea` and "Import a folder" CTAs. No sidebar. |
| 3 | Project detail — Design active | `/projects/:id · Overview` | project menu (Overview active) | Header + stepper + current-stage panel + activity/artifacts. |
| 4 | Project detail — Blocked | `/projects/:id · Project Background` | project menu (Project Background active) | Same chrome, blocker banner, "Open questions" replaces checklist. |
| 5 | Project detail — Shipped | `/projects/:id · Overview` | project menu (Overview active) | All 7 steps done, Journey checklist, Ship Summary. |
| 6 | Project detail — Build / Jira Kanban | `/projects/:id · Build` | project menu (Build active) | 4-column Kanban, Jira sync banner, Code Agent strip. |
| 7 | `/new` step 1 — folder pick | `/new` | none | Path input, helper, Cancel + Create actions. |
| 8 | `/new` step 2 — BA-Agent chat | `/new` (chat-side widget) | none | Chat thread + Interview progress. |
| 9 | New idea — captured (success) | `/new` final | none | Big checkmark, project summary, View idea.md + Open project. |
| 10 | App shell — reference (legacy v4 chrome) | persistent layout | v4 sidebar (Dashboard / Projects / Intake / Design Library / QA Runs / Settings) | v4 sidebar preserved verbatim — for comparison only, not part of the live product. |
| 11 | UI kit | `/__kit` | none | All design tokens, type scale, buttons (5 variants incl. disabled), status pills (7), priority rings, 7-stage stepper, pipeline mini-bar (4 progress states), 4 banner variants, form fields (default + error), chat bubbles, Kanban cards, agent avatars, sample project card. |
| 12 | **Project Background — view** *(v5.1 BA Workspace, renamed in v5.2)* | `/projects/:id · Project Background` | project menu (Project Background active) | Stage banner with live per-file status counts + 17-file tree (5 groups, each row carrying a colored status dot) + markdown viewer with `View` / `Edit` tabs (Edit = BA only). Banner reads "17 artifacts" (matches the on-disk count). Optional butter-yellow open-questions banner when `Blocker-for: PRD-approval` items exist. |
| 13 | **Project Background — edit** *(v5.1 BA Workspace edit, renamed in v5.2)* | `/projects/:id · Project Background · Edit` | project menu (Project Background active) | Same chrome, full-pane monospace textarea, dirty indicator in tree (coral inset) + header (`● Unsaved changes`), status-aware footer (`Discard` / `Save changes` / `Send for SA review →` for Draft/Returned; edit is locked while the file is `In Review (SA)`). |
| 14 | **Project Background — file in SA review** *(v5.1 BA Workspace review, renamed in v5.2)* | `/projects/:id · Project Background · data-model.md · In Review` | project menu (Project Background active) | Same chrome; active file is `In Review (SA)` — body is read-only with the SA's inline `blockquote` markup preserved, footer shows `Return to BA` and `Mark Completed ✓`. Below the document: inline `.review-thread` interleaving SA + BA comments with a Compose reply box. |
| 15 | **Requirements — list of requirements by user story** *(new in v5.2)* | `/projects/:id · Requirements` | project menu (Requirements active) | Read-only list of business & technical requirements, grouped by user story (US-01 …). Filter bar (All / Business / Technical tabs, Open / Approved / Blocked chips, free-text search). Each row carries a stable `BR-xxx` / `TR-xxx` ID, a type tag, MoSCoW priority, status pill, and owner. Banner shows totals (`9 Business / 6 Technical / 3 Blocked`). |

## Visual decisions confirmed (v5)

- **Menu scope.** Per-project only. The initial `/projects` and `/new` screens use a single-column layout (`app full`). The v4 global sidebar is preserved as Screen 10 for reference but is not part of the live product.
- **Per-project menu items.** Overview, Requirements, Design, Build (Jira Kanban), Agents, QA, Activity, Artifacts — 8 items, each with its own line icon, all using the v4 dark-navy pill for the active state. Count badges use a small mono chip; "Jira" replaces the count for Build.
- **Build screen layout.** Jira sync banner → Kanban board (4 columns) → Agent strip (3 Code Agents). Tells the story of "3 agents working in parallel, synced to Jira, in this exact state right now".
- **Topbar CTA on initial screens.** `+ New idea` (pill, dark navy) sits on the right after the avatar. Same component on the empty state.
- **Lilac gradient ground** (`#d9d5ec` → `#c3cde8`) with a soft radial highlight top-left.
- **Single frosted-glass panel** hosting the entire app.
- **Pastel project tiles** are the hero — name, one-liner, status pill live inside the tile; the pipeline mini-bar sits below as a separate stroke.
- **Active nav and primary CTAs** both use the same dark-navy pill (`#322a5c`).
- **Status pills** (Planning / Drafting / In Progress / In Review / Blocked / Done / Shipped) each get their own pastel — seven small swatches, all readable on white cards.
- **7-stage stepper** is dense and inline: small numbered chips with a 2px connector bar that picks up the previous step's color (green after done, amber after review, rose after blocked).
- **Activity timeline** uses agent-coloured avatars (BA peach, Design sky, Code mint, Review butter, QA lavender, Orchestrator navy).
- **`/new` step 1** mirrors today's `/api/init` exactly: mono path input, "Pick a folder outside the framework repo" warning, "Use last folder" + "Create project folder" actions.
- **`/new` step 2** mirrors the existing BA-Agent chat in `server.js`: system prompt unchanged, but the chat lives in the app shell, the interview progress sidebar shows what's been captured, and the success path lands on screen 9 → `/projects/:id`.

## Carry-over from server.js (to keep working unchanged)

- `POST /api/init` — folder pick + framework scaffold + `project-dir.txt` pin. Reuse the handler, mount the Node API alongside Vite dev server.
- `POST /api/chat` — NDJSON stream to Ollama, `idea` fence detection, `idea.md` write + backup. The React app consumes the stream with `ReadableStream` + `getReader()` and renders the chat.
- `GET /api/health` — unchanged.

## New endpoints (mocked in the React app until DB is designed)

- `GET /api/projects` — list (powers screens 1, 2).
- `GET /api/projects/:id` — detail (powers screens 3, 4, 5).
- `GET /api/projects/:id/build/board` — Kanban board (powers screen 6).
- `POST /api/projects/:id/stage` — stage transition.
- `POST /api/projects/:id/activity` — append activity item.
- `GET /api/projects/:id/activity` — timeline.
- `GET /api/projects/:id/artifacts` — artifact list.
- `GET /api/chat/sessions` + `GET /api/chat/sessions/:id` — chat history.
- `POST /api/projects/:id/jira/sync` — trigger a Jira sync (one-way Jira → app).
- `POST /api/projects/:id/jira/push` — push a Kanban card to Jira.
- `GET /api/projects/:id/agents` — currently active agents for this project.

### New endpoints for v5.1 (BA Workspace — screens 12–14)

The bulk `send-to-sa` endpoint from v5 is **gone**. Each PRD artifact has its own state (`draft | review | returned | completed`) and its own endpoints — file transitions no longer affect the project stage.

- `GET /api/projects/:id/ba-workspace` — list the 15 PRD artifacts with `{name, group, size, exists, dirty, status, statusUpdatedAt, commentCount}`. Reads `PRD/` from `project.folder_path` on disk and the per-file status from a small new SQLite table (see below). No change to the existing `project` / `activity` tables.
- `GET /api/projects/:id/ba-workspace/:name` — read a single file's content as `{name, content, bytes, sha256, updatedAt, status}`. Path-traversal guarded (`name` must match the fixed 15-name allowlist).
- `PUT /api/projects/:id/ba-workspace/:name` — save edited content. Writes to `PRD/<name>` on disk, appends one `activity` row (`BA Agent · "Edited data-model.md (+6 lines)"`), bumps `project.updated_at`. Returns 409 if the file is currently `In Review (SA)` (BA has to return it first).
- `POST /api/projects/:id/ba-workspace/:name/send-for-review` — BA transitions a single file Draft → `In Review (SA)`. Records `BA Agent · "Sent data-model.md for SA review"` and returns `{ok: true, transitionedAt}`. Idempotent.
- `POST /api/projects/:id/ba-workspace/:name/return` — BA returns a file from `In Review (SA)` to `Returned` (or `Draft`). Records `BA Agent · "Returned data-model.md to BA"`. Used when the BA decides SA's edits need another pass.
- `POST /api/projects/:id/ba-workspace/:name/complete` — BA accepts SA's edits; file moves to `Completed`. Records `BA Agent · "Marked data-model.md Completed"`. Used by the green `Mark Completed ✓` button on screen 14.
- `GET /api/projects/:id/ba-workspace/:name/comments` — returns `{comments: [{id, author: 'BA' | 'SA', body, createdAt}]}` for the inline review thread on screen 14.
- `POST /api/projects/:id/ba-workspace/:name/comments` — append a reply. `{author, body}` → `{ok: true, id, createdAt}`. Author is captured from the session; SA-side comments carry `author: 'SA'` and are produced by the SA Agent when it reads the file.
- `GET /api/projects/:id/ba-workspace/:name/open-questions` — convenience endpoint that parses §11 / `open-questions.md` and returns `{total, blockingPRD}` so the workspace can show the butter-yellow banner with the correct count.

**New SQLite table.** A small `prd_artifact` (or `artifact_status`) table is added:

```
project_id   INTEGER NOT NULL  -- FK → project.id
file_name    TEXT    NOT NULL  -- one of the 15 allowlisted names
status       TEXT    NOT NULL  -- CHECK in ('draft','review','returned','completed')
updated_at   TEXT    NOT NULL  -- ISO 8601
PRIMARY KEY (project_id, file_name)
```

The file *content* stays on disk under `PRD/` (the launcher's existing on-disk model). The table just tracks each file's review state. No new tables are needed for comments — `prd_comment` (or a generic `artifact_comment`) keyed on `(project_id, file_name, id)` is enough.

When the DB design is approved, these become real endpoints with a chosen storage layer. Until then the React app reads from an in-memory mock so the UI is reviewable.
