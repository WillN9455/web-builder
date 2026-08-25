# Idea Hub — App Plan (v5)

An update to v4. The **initial Projects screen** now opens with no sidebar — there is no global menu until the user opens a specific project. Once a project is open, a left sidebar shows the project's own navigation: Overview, Requirements, Design, Build (Jira Kanban), Agents, QA, Activity, Artifacts. The rest of the v4 visual language is unchanged: lilac gradient ground, one frosted-glass panel, rounded 24px cards, pastel tiles, dark-navy pill for active nav. Earlier `mockups.html` files in `launcher/design/` (including the v4 reference) are intentionally ignored — v5 stands on its own. The plan and mockups are ready for review; backend/DB design is the next conversation.

## What changed from v4

- **No global sidebar.** The initial `/projects` screen is single-column (`app full`). The New idea flow (`/new`) and empty state also have no sidebar — you only see the project menu inside a project.
- **Per-project menu.** When a project is open, the left sidebar shows project-scoped items: **Overview** (default landing), **Requirements** (PRD doc + feature list, with item count), **Design** (design system + wireframes + tokens), **Build** (Jira Kanban board), **Agents** (which framework agents are active), **QA** (test runs), **Activity** (timeline), **Artifacts** (generated files).
- **New Build / Jira Kanban screen.** Replaces the placeholder for "Build stage" — shows a 4-column board (To do / In progress / In review / Done) with Jira ticket IDs (e.g. `TM-18`), Code Agent avatars on each card, a Jira-sync banner, and an "Agent strip" at the bottom showing each of the 3 Code Agents' current work + ETA.
- **Topbar gets a primary CTA.** The initial Projects topbar now has a `+ New idea` button on the right (next to the avatar). Same for the empty state.
- **App shell moved to "reference".** The original v4 sidebar (Dashboard / Projects / Intake / Design Library / QA Runs / Settings) is preserved as Screen 10 — `App shell — reference (legacy v4 chrome)` — so reviewers can compare the old vs new navigation.

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

## Screens (v5 — 11 total)

| # | Screen | Route | Sidebar | Purpose |
|---|--------|-------|---------|---------|
| 1 | Projects — initial (no menu) | `/projects` | none | Single-column. Topbar (logo, search, notif, avatar, **+ New idea**). "Active now" 3×2 pastel tile grid, aggregate pipeline ring chart + status legend + Next milestone card, "All projects" table. |
| 2 | Projects — empty state | `/projects` (first visit) | none | Centered illustration card with `+ New idea` + secondary "Import a folder" CTA. Topbar present, no sidebar. |
| 3 | Project detail — Design active | `/projects/:id · Overview` | project menu (Overview active) | Project header (pastel tile, name, one-liner, mono path, team avatars), 7-stage stepper, "Current stage — Design" panel with checklist + agent callout, right column (Activity + Artifacts). |
| 4 | Project detail — Blocked | `/projects/:id · Requirements` | project menu (Requirements active) | Same chrome, PRD step is rose/red, error banner shows the blocker, "Open questions for you" replaces the checklist, right column shows the last successful stage. |
| 5 | Project detail — Shipped | `/projects/:id · Overview` | project menu (Overview active) | All 7 steps in dark-navy with ✓, "Journey" checklist of every stage, Ship Summary card over Mint + Peach tiles. |
| 6 | Project detail — Build / Jira Kanban | `/projects/:id · Build` | project menu (Build active) | Jira-sync banner, 4-column Kanban board (To do / In progress / In review / Done) with `TM-*` ticket IDs, Code Agent avatars on cards, Agent strip at bottom showing each of the 3 Code Agents. |
| 7 | New idea — folder pick | `/new · step 1` | none | Centered pastel card: "Step 1 of 2" crumb, path input (mono), helper, inline error banner, Cancel + "Create project folder →" actions. |
| 8 | New idea — BA-Agent chat | `/new · step 2` | none (chat-side widget) | Two-column: chat thread (BA ↔ user bubbles) on left, "Interview progress" sidebar on right. |
| 9 | New idea — captured (success) | `/new · final` | none | Big checkmark, project name, summary of what was written, "View idea.md" + "Open project →". |
| 10 | App shell — reference (legacy v4 chrome) | persistent layout | **v4 sidebar** (Dashboard / Projects / Intake / Design Library / QA Runs / Settings) | Preserved verbatim from v4 — kept so reviewers can compare old vs new navigation. Not part of the live product. |
| 11 | UI kit | `/__kit` | none | All design tokens, type scale, buttons, status pills, priority rings, 7-stage stepper, pipeline mini-bar, banner variants, form fields, chat bubbles, Kanban cards, agent avatars, sample project card. |

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

## Per-project menu (new in v5)

The 8 items that appear in the left sidebar whenever a project is open:

| Item | Lands on | What it shows |
|------|----------|---------------|
| **Overview** | `/projects/:id` (default) | Project header, 7-stage stepper, current-stage panel, activity + artifacts |
| **Requirements** | `/projects/:id/requirements` | PRD doc, feature list, open questions (count badge) |
| **Design** | `/projects/:id/design` | Design tokens, wireframes, hi-fi mockups, peer review state |
| **Build** | `/projects/:id/build` | Jira Kanban board (4 columns), Code Agent strip, sync status |
| **Agents** | `/projects/:id/agents` | Active framework agents for this project (BA, Design A/B, Code 1/2/3, QA, Reviewer) with avatars + status |
| **QA** | `/projects/:id/qa` | Test runs, Playwright results, accessibility audits |
| **Activity** | `/projects/:id/activity` | Timeline of everything that happened, agent-coloured |
| **Artifacts** | `/projects/:id/artifacts` | File tree of generated docs, code, designs |

Each item uses a different icon (line SVG, 1.8 stroke, currentColor) — see Screen 3 mockup. The active item gets the dark-navy pill background. Items with a numeric count (Requirements, QA) show a small badge; Build shows a "Jira" pill instead of a number.

Below the menu, a small "Linked project" promo card reminds the user that `idea.md` lives in the framework folder, with a one-click "Open idea.md →" button. A footer adds "← All projects" and "Help & support" links.

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
```

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

## Status

- [x] v5 plan + HTML mockups — `launcher/design/mockups.html` (11 screens, ~123KB, self-contained)
- [ ] Backend / DB design — next conversation
- [ ] Scaffold Vite React app once mockups are approved

## What's in `mockups.html`

| # | Screen | Notes |
|---|--------|-------|
| 1 | Projects — initial (no menu) | Single-column (`app full`). Topbar with logo, search, notifications, avatar, `+ New idea` CTA. Active now tiles, pipeline ring, all projects table. |
| 2 | Projects — empty state | Centered illustration card with `+ New idea` and "Import a folder" CTAs. No sidebar. |
| 3 | Project detail — Design active | Project menu (Overview active). Header + stepper + current-stage panel + activity/artifacts. |
| 4 | Project detail — Blocked | Project menu (Requirements active). Same chrome, blocker banner, "Open questions" replaces checklist. |
| 5 | Project detail — Shipped | Project menu (Overview active). All 7 steps done, Journey checklist, Ship Summary. |
| 6 | Project detail — Build / Jira Kanban | Project menu (Build active). 4-column Kanban, Jira sync banner, Code Agent strip. |
| 7 | `/new` step 1 — folder pick | No sidebar. Path input, helper, Cancel + Create actions. |
| 8 | `/new` step 2 — BA-Agent chat | No sidebar (uses an in-page chat-side widget). Chat thread + Interview progress. |
| 9 | New idea — captured (success) | No sidebar. Big checkmark, project summary, View idea.md + Open project. |
| 10 | App shell — reference (legacy v4 chrome) | v4 sidebar preserved verbatim — Dashboard / Projects / Intake / Design Library / QA Runs / Settings. For comparison only. |
| 11 | UI kit | All design tokens, type scale, buttons (5 variants incl. disabled), status pills (7), priority rings, 7-stage stepper, pipeline mini-bar (4 progress states), 4 banner variants, form fields (default + error), chat bubbles, Kanban cards, agent avatars, sample project card. |

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

When the DB design is approved, these become real endpoints with a chosen storage layer. Until then the React app reads from an in-memory mock so the UI is reviewable.
