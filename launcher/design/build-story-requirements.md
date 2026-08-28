# Build — Story detail & Rules · Requirements

> **Scope:** Build tab screen set — `#bu` (Build — Status list), `#bur` (Build —
> Rules, now a full screen), and `#busd` (Build — Story detail, drill-down from
> a Status-list row). Mirrors the Design tab's three-screen shape (list / detail /
> rules). v5.4 of the Build tab.
> **Source mockups:** `launcher/design/build-tab.html`
> **Sitemap contract:** `launcher/design/sitemap.md` § Build tab — redefined
> **Related memory:** `project-launcher-restructure.md`,
> `project-launcher-design-standards.md`
> **v5.4 changes:** topbar search / filter / export / `+ New build rule` buttons
> are removed from every screen on the Build tab; the Story detail page shows a
> **back arrow** at the top left (replacing the `Build / TM-XX` crumb) that returns
> to the Build Status list; the code-review thread on the Story detail is replaced
> by a simple **Notes** thread (post-only by humans — reviews happen in GitHub /
> PRs, not on this page); the Rules-half callout gets extra top padding and the
> extra `View code-builder/` button is removed.

---

## 1. Purpose

The **Build tab** answers three questions:

1. **What's building, and what's the current state of each story?** — the
   **Status list** (screen BU).
2. **What files, BFF routes, and BE endpoints does this story touch?** — the
   **Story detail** (screen BUSD), reached by drilling into a row.
3. **What's the overall build architecture, and what rules steer it?** — the
   **Rules screen** (screen BUR), the editable steering surface that writes
   back to `code-builder/` and `../skills/coding-guidelines.md`.

The Build tab is **never a board** — that lives in Sprint. Build = **config +
architecture + rework + per-story code surface**, with a focused drill-down
for each story so a new developer or reviewer can see exactly which files,
BFF routes, and BE endpoints a story is responsible for.

### v5.3 changes vs v5.2
- **Status list rows** lose the inline 5-node build stepper
  (`Picked up → Building → Self-review → For review → Ready for QA`). Each
  row now shows **only its current status** (a single pill, e.g. `Building`,
  `Ready for review`), and a drill-down arrow to the Story detail page.
  The lifecycle is implicit in the status text — the Sprint board is the
  authoritative source for step-by-step state.
- **Build Rules** is promoted from a sub-tab to a **full top-level screen**
  (screen BUR). It carries the overall build architecture (FE / BFF / BE /
  DB / host) so a new dev can understand the chosen stack in one place,
  plus the editable build/deploy rules, configurations, and per-agent
  guidelines that used to live behind the Rules tab.
- **Story detail** (screen BUSD) is a new drill-down screen, matching
  `design-tab.html` § E. It lists the **FE files**, **BFF APIs**, and
  **BE APIs** the story is editing or calling — the per-story code
  surface. Architecture (DB, host) lives on the Rules screen, not here.

---

## 2. Entry / Exit

### Entry points
- **Per-project sidebar → Build tab** — primary entry. The badge is the
  Jira ticket count (`14`), matching the Design tab's per-tab badge.
- **Direct URL:**
  - `/projects/:id/build` — Status list (BU).
  - `/projects/:id/build/rules` — Rules screen (BUR).
  - `/projects/:id/build/:storyId` — Story detail (BUSD).
- **Deep links** from the Sprint board (`Open in Build →`), Activity feed,
  and agent notifications route straight to the Story detail screen.
- **Sibling tab** navigation (Overview, Project Background, Requirements,
  Sprint, Design, Agents, QA, Activity, Artifacts) via the per-project
  sidebar.

### Exit points
- **Status / Rules** kit-tabs at the top of the Build tab switch between
  the Status list and the Rules screen.
- **`← Back to Build list`** in the top-left of the Story detail page
  (a `.back-arrow` link at the top of the main column) — returns to
  the Status list (`#bu`) with the source row scrolled into view.
  This is the primary exit from Story detail and replaces the
  previous `Build / TM-XX` crumb (v5.4).
- **`← Back to build list`** in the side-foot of the Story detail screen
  — secondary exit, same target as the top-left back arrow.
- Sibling tabs (above) via the per-project sidebar.

---

## 3. User Stories

| ID     | As a…           | I want to…                                                                       | So that…                                                          |
|--------|-----------------|----------------------------------------------------------------------------------|-------------------------------------------------------------------|
| BUST-01| PM              | See every in-build story with its current status pill (not a 5-node timeline)    | I can scan who's where without reading each step                  |
| BUST-02| PM              | Click a row's drill-down arrow to open the Story detail screen                   | I can focus on one story without the list collapsing around me    |
| BUST-03| Code agent      | Edit the list of **FE files** this story owns                                    | The next dev (or reviewer) can find the change set fast           |
| BUST-04| Code agent      | Edit the list of **BFF APIs** this story calls                                   | The contract with the BFF layer is explicit, not inferred         |
| BUST-05| Code agent      | Edit the list of **BE APIs** this story calls                                    | Hand-off to BE is clear; no "where does this call go?" surprises  |
| BUST-06| New developer   | Open the Build Rules screen and see the overall architecture in one card         | I can onboard in 5 minutes without reading source                 |
| BUST-07| New developer   | See the per-agent coding guidelines on the Rules screen                          | I write code that matches the existing style                      |
| BUST-08| PM              | Edit build/deploy rules and the build lifecycle on the Rules screen              | The rules reflect how the project actually ships                  |
| BUST-09| Code agent      | Post a **note** about this story on the Story detail (decisions, reminders)      | Lightweight context lives with the story; formal review happens in GitHub |
| BUST-10| PM              | See the rework queue (failed QA / review) with evidence links                   | Failed work is visible and triagable                              |
| BUST-11| PM              | See a live 3-Code-Agent status strip (3 active / 5 reviews)                     | I can spot idle agents and load imbalance                         |
| BUST-12| PM              | Click the **back arrow** at the top-left of the Story detail page                | I can return to the Build Status list with one click              |
| BUST-13| PM              | Switch Status ↔ Rules via the kit-tabs pill switch                               | The Rules surface is one click away, not a separate route         |

---

## 4. Functional Requirements

### FR-1 Status list — per-story row

- Each story row uses the same compact 3-column layout as the Design
  list: `id + status pill | title + sub | Open story →`.
- The row **does not** render the 5-node `.bd-stepper` (Picked up →
  Building → Self-review → For review → Ready for QA). Lifecycle lives
  on the Sprint board; the Build list shows only the current status.
- The id column shows: `TM-XX` (monospace) + a single status pill
  (`Picked up` / `Building` / `Self-review` / `Ready for review` /
  `Ready for QA` / `Deployed · QA env` / `Rework`). The pill colour
  matches the existing palette (`todo` / `inprog` / `review` / `done` /
  `blocked`).
- The title column shows: title + a sub-line (`From DSGN-XX · 3 pts ·
  High priority` or `From DSGN-XX · 5 pts · PR #214 open`).
- The right side is an `<a class="row-open" href="#busd-{id}">` button
  with a chevron, matching `.row-open` in `design-tab.html`. The button
  carries `data-story="TM-XX"` for analytics / test harnesses.
- The row no longer has the inline "Story architecture / Code review
  thread" expansion block. The architecture panel moves to the Rules
  screen; the code-review thread moves to the Story detail screen.

### FR-2 Build summary stats (4 tiles)

- 4 tile card on the Status list: **Being built** (Code Agents currently
  working), **Ready for review** (PR open, Reviewer pending),
  **Ready for QA** (count of stories reflected on QA tab), **Deployed
  to QA env** (5 stories with `Build · X passed · Y failed · Z in
  rework`).
- Same `.bd-stats` / `.bd-stat` class kit as v5.2 — no visual change.

### FR-3 Rework queue (failed QA / review)

- Same as v5.2 — surfaced on the Status list as a separate card with
  rows: id / why / failed-at pill / evidence link / `Open →` button.
- Lives below the per-story list, above the Code agent strip.

### FR-4 Code agent strip (3 active agents)

- Same as v5.2 — 3 cards (C1, C2, C3) with avatar / current work /
  status pill / review pass-rate chip.

### FR-5 Status / Rules kit-tabs

- The pill switch at the top of the Build tab (`.kit-tabs`) is
  **single source of truth** for "status vs rules". Default `Status`.
- Clicking `Rules` swaps the entire main area to the Rules screen
  (screen BUR). It is **not** a deep-link to `/projects/:id/build/rules`
  in the same tab — the kit-tab is a UI-only mode switch. The
  `/rules` URL is still the deep-link target for bookmarks and direct
  routing.

### FR-6 Rules screen — overall layout

- Same per-project shell (248px sidebar / 1-col main) as the Status
  list.
- Sidebar side-promo: `Build rules` card explaining that edits to
  build/deploy rules, environments, and coding guidelines write back
  to `code-builder/` and `../skills/coding-guidelines.md`. The
  callout itself has extra top padding (v5.4 — `.rules-preview`
  `padding-top` ≥ 16px so the heading clears the card edge). The
  callout does **not** carry a `View code-builder/` button (removed
  in v5.4); the body text alone tells the user where the writes
  land.
- Topbar: only the `← Projects` breadcrumb. No search, filter,
  export, or `+ New build rule` button (all removed in v5.4 across
  the Build tab). No `Mark build complete` style primary action —
  the Rules screen is editing, not stage-gating.
- **No 7-stage stepper on the Rules screen.** The stepper belongs to
  the Status list only; the Rules screen is config + arch, not
  stage position.
- The Rules screen has **four zones**, stacked:
  1. **Build architecture** (read-only card) — FE / BFF / BE / DB /
     host. **Why a new dev opens this tab first** — the architecture
     is the single card that answers "what is this project built
     on?".
  2. **Configurations** (editable) — package manager, Node version,
     linter, formatter, test runner, env vars, secrets handling. Each
     row is `key : value` with an inline edit pencil.
  3. **Build & deploy rules** (editable) — lifecycle steps, CI gates,
     deploy targets, branch policy, PR review policy. Markdown body
     with a small `Edit` button that opens an in-place editor.
  4. **Per-agent coding guidelines** (editable list) — one collapsible
     card per agent (Code 1 / Code 2 / Code 3 / Reviewer). Each
     expands to the same markdown editor as the build rules.

### FR-7 Rules screen — Build architecture (read-only)

- Single white card, no edit affordances.
- Rows: `FE` / `BFF` / `BE` / `DB` / `Host`. Each row has a small
  uppercase label (`.k`) and a `.v` body with monospace tokens
  (`React 18`, `Express`, `Node 22`, `SQLite (better-sqlite3)`,
  `Vercel + Fly.io`).
- A small `lock` icon on the `Host` row (and a hover tooltip `Edit
  Rules`) indicates the architecture is read-only and changes are
  steered via the rules below.
- Below the card, a one-line caption:
  *Architecture is inferred by agents. To change stack or hosting,
  edit the rules below — your steering surface is one place, not two.*

### FR-8 Rules screen — Configurations (editable)

- A grid of `key : value` rows, label-above-input, 2-column on
  desktop.
- Each row: key (e.g. `Package manager`) + value chip / input
  (e.g. `pnpm 9`).
- A right-aligned pencil icon switches the cell to edit mode (input
  with `Save` / `Cancel` mini-buttons). Saving writes back to the
  project's on-disk config (`code-builder/config-rules.md` or similar).
- Edits flush through `PUT /api/projects/:id/build/config` and update
  the local `code-builder/` file. The Code Agents pick up the new
  config on the next run.

### FR-9 Rules screen — Build & deploy rules (editable)

- A card with a single markdown body. Header row: title + `Edit` ghost
  button.
- The body is rendered from `code-builder/build-rules.md`. By default
  it shows the build lifecycle (5 steps), CI gates, deploy targets, and
  branch policy as a markdown list.
- Clicking `Edit` swaps the body for a `<textarea>` with the raw
  markdown, plus a small toolbar (`Save` / `Cancel` / markdown hint).
- `Save` writes the new markdown back to `code-builder/build-rules.md`
  and re-renders the rendered view.
- `Cmd/Ctrl+Enter` submits. `Esc` cancels.

### FR-10 Rules screen — Per-agent coding guidelines (editable)

- A list of collapsible cards, one per agent: **Code 1** / **Code 2** /
  **Code 3** / **Reviewer**. Each card has:
  - Agent name + avatar (C1 / C2 / C3 / RV, matching the Build list's
    colour kit).
  - `Active now` pill (e.g. `Building TM-23` / `Reviewing TM-19`).
  - A `Read guidelines` button that expands the card.
- Expanded card: a single markdown body (the agent's coding guidelines)
  with the same `Edit` / `Save` / `Cancel` flow as the build rules.
- Defaults are the contents of `../skills/coding-guidelines.md`
  sectioned by agent, plus any project-specific rules the user has
  added.

### FR-11 Story detail — top-level layout

- Same 248px sidebar / 1-col main shell. Sidebar's `Build` item is
  marked active.
- Side-promo: `TM-XX · {status}` card with one-line status + an
  `Open in Sprint board →` link.
- Topbar: a single **back arrow** link (`← Back to Build list`,
  styled `.back-arrow`) flush-left — replaces the previous
  `Build / TM-XX` crumb. No search, no filter, no export, no
  `+ New build rule` button (all removed in v5.4 across the Build
  tab). The back arrow carries `aria-label="Back to Build list"`
  and returns to `/projects/:id/build#tm-{id}` with the source row
  scrolled into view.
- The story header card sits directly below the back arrow:
  - id (TM-XX), status pill, and a 56px icon block (peach).
  - Title + subtitle (`From DSGN-XX · N pts · priority`).
  - Right-side action group: `Re-PR` (ghost), `Mark Ready for QA →`
    (primary) when eligible. When the story is in `Rework`, the
    primary action swaps to `Send back to Build →`.

### FR-12 Story detail — linked requirement card (left col)

- Same shape as the Design Story detail (`.req-card`).
- Header row: requirement icon (purple) · "Linked requirement" · id
  (`DSGN-XX` / `TM-XX` in monospace) · `Open in Requirements →` link
  (right).
- Description paragraph: full requirement description, 1-3 paragraphs.
  Bold and italics preserved.
- "Intended users" chip row: `Property manager` (lavender) · `Tenant`
  (sky) · `Admin` (peach) — same chip kit as Design.
- If the requirement has no description, the body collapses to: `No
  description — open in Requirements to write one.`

### FR-13 Story detail — FE files (right col, top)

- A `.files-card` panel titled **FE files this story edits**.
- Header row: icon (sky) · "FE files" · `+ Add file` button (right).
- The body is an editable list of file paths
  (`src/pages/RequestDetail.tsx`, `src/lib/photoUpload.ts`,
  `src/styles/request-detail.css`, …). Each row:
  - monospace path
  - small `Open in Figma ↗` / `View diff →` link (right, secondary)
  - trash icon (right-most) to remove
- Empty state: centered icon + heading `No FE files tagged yet` + body
  `Tag the files this story edits. Reviewers and the next dev will
  see them in one place.` + `+ Add file` primary button.
- The `+ Add file` button opens an inline input (`path/to/file.ext` +
  `Add`). The path is validated as a relative path (no `..`, no
  leading `/`); invalid paths show inline error
  `Paths must be relative and inside the project folder.`
- The list is the source of truth for the story's FE surface; the Code
  Agent can mark a path as "new" or "modified" via a small chip.

### FR-14 Story detail — BFF APIs (right col, middle)

- A `.api-card` panel titled **BFF APIs this story calls**.
- Header row: icon (sea) · "BFF APIs" · `+ Add route` button.
- Body is a list of BFF route entries. Each row:
  - method chip (`GET` green, `POST` blue, `PUT` amber, `DELETE` rose)
  - monospace path (`/api/requests/:id/status`)
  - one-line description (italic, muted)
  - right-side trash icon
- Empty state: `No BFF routes tagged yet. Add the routes this story
  hits so the BFF hand-off is explicit.`
- `+ Add route` opens an inline form: method dropdown + path input +
  description input + `Add` / `Cancel`.

### FR-15 Story detail — BE APIs (right col, bottom)

- A `.api-card` panel titled **BE APIs this story calls** (the
  `route-handler` style BE endpoints under `server/`, since the
  project uses Express + Node 22 — see Rules · Build architecture).
- Visually identical to the BFF card but with a different
  colour-coded icon (peach) to distinguish it.
- Empty state copy: `No BE endpoints tagged yet. Add the route
  handlers this story calls.`
- The BFF and BE panels together answer the question
  *What is this story calling, and where?* — Reviewers and new devs
  read the Story detail and know the contract in 30 seconds.

### FR-16 Story detail — Notes thread (replaces code-review thread)

- Below the BE APIs panel, a **Notes thread** lets the user post
  lightweight notes attached to the story (decisions, reminders,
  context for the next dev). Formal review (code review, PR
  discussion, agent ↔ reviewer back-and-forth) happens in GitHub
  / the PR — this thread is **not** a review surface and carries
  no PR id, no CI status, no unresolved-count, and no agent
  avatars.
- The thread reuses the `.thread` / `.comment` / `.compose` classes
  from the parent Build tab. No new design tokens.
- Each note shows: author avatar (`W` for the current user) ·
  author name (`Will`) · timestamp · body (markdown-safe, supports
  `**bold**` and `*italic*`).
- Compose box: `<textarea>` + `Posting as Will` label + `Post`
  primary button (disabled when empty). `Cmd/Ctrl+Enter` submits.
- The thread header reads: `Notes` + `N notes · last reply Nm ago`.
  (Was `Code review · PR #NNN` + `N comments · CI ✓ · M unresolved`
  in v5.3.)
- The thread is **per-story** — opening a different story shows a
  different thread. The thread scrolls to the bottom on open.
- In v5.4 the seed notes in the mockup are author = `Will`
  (previously `Code Agent 1` / `Reviewer`). The thread is
  post-only by humans; agents do not auto-post here.

### FR-17 Story detail — empty / early-state copy

- When the story is `Picked up` (very early), the FE files / BFF APIs /
  BE APIs panels render but the lists are empty. The `+ Add file` /
  `+ Add route` buttons are the primary CTAs for the Code Agent to
  tag the surface as it goes.
- When the story is in `Rework`, the primary action becomes
  `Send back to Build →` and a small banner at the top of the story
  detail reads:
  *`{id}` came back from {QA|Review} with {N} issues. Fix and re-PR.*
  Each issue links to the QA evidence or PR review comment.

---

## 5. UI States

| State                       | Where                       | What renders                                                                                                                  |
|-----------------------------|-----------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| **Loading stories**         | Status list                 | Skeleton rows: 5 rows × (110px id-pill shell + 2 title lines + 24px open arrow) with shimmer                                  |
| **No stories in Build**     | Status list                 | Centered empty state: `No stories in Build yet` + body + `Open Sprint board →` CTA                                           |
| **Story row · Picked up**   | Status list                 | Lavender pill + `Open story →`                                                                                                |
| **Story row · Building**    | Status list                 | Sky pill + `Open story →`                                                                                                     |
| **Story row · Ready for QA**| Status list                 | Mint pill + `Open story →`                                                                                                    |
| **Story row · Rework**      | Status list                 | Blush pill + `Open story →`                                                                                                   |
| **Story detail · populated**| Story detail                | Header + Linked requirement + FE files list + BFF APIs list + BE APIs list + code-review thread                              |
| **Story detail · early**    | Story detail                | All 3 lists render as empty state with `+ Add file` / `+ Add route` primary CTAs                                             |
| **Add file open**           | Story detail · FE files     | Inline input + `Add` / `Cancel` mini-buttons; invalid path shows inline error                                                 |
| **Add route open (BFF)**    | Story detail · BFF APIs     | Inline form: method dropdown + path input + description input + `Add` / `Cancel`                                              |
| **Add route open (BE)**     | Story detail · BE APIs      | Same shape as BFF, peach icon                                                                                                 |
| **Remove file/confirm**     | Story detail                | Inline confirmation strip: `Remove {path}?` + `Cancel` / `Remove` (destructive, focus on Cancel)                              |
| **Rework banner**           | Story detail · Rework story | Top banner: `{id} came back from QA|Review with N issues. Fix and re-PR.`                                                    |
| **Mark Ready for QA disabled** | Story header             | Button faded, `aria-disabled="true"`, hover tooltip `Move the story past Self-review first.`                                  |
| **Rules · architecture**    | Rules screen                | Read-only card with FE / BFF / BE / DB / host rows; lock icon on Host; one-line caption below                                |
| **Rules · edit cell**       | Rules screen                | Input replaces value chip; `Save` / `Cancel` mini-buttons; `Esc` cancels                                                     |
| **Rules · edit markdown**   | Rules screen                | `<textarea>` with monospace font, `Save` / `Cancel` toolbar, `Cmd/Ctrl+Enter` submits                                        |
| **Rules · expanded agent**  | Rules screen                | One card per agent; `Read guidelines` expands; `Edit` swaps body to textarea                                                 |
| **Notes empty**             | Story detail                | `No notes yet` in the thread head; compose box enabled (can post first note)                                                 |
| **Notes (no PR / CI)**      | Story detail                | Thread header reads `Notes` + count — no PR id, no CI status, no unresolved-count                                            |
| **Back arrow hover**        | top-left (Story detail)     | Background fills with `rgba(255,255,255,0.6)`, label colour bumps to `var(--ink)`; 4px focus ring on keyboard focus           |
| **Focus**                   | every interactive element   | Visible 4px navy focus ring on the active element (matches the rest of the system)                                           |

---

## 6. Accessibility (WCAG 2.1 AA)

- All form fields (config key/value, file path, route method/path/desc,
  markdown body) have programmatic `<label>` association — no
  placeholder-as-label.
- The status / rules kit-tabs use the existing `role="tablist"` +
  `role="tab"` + `aria-selected` pattern (matches design-tab.html).
- The `Open story →` row-open button is a real `<a>` with a
  descriptive `aria-label="Open story TM-19 in Build"`. Keyboard
  reachable via `Tab`; `Enter` / `Space` activates.
- The `+ Add file` and `+ Add route` buttons have descriptive
  `aria-label`s: `"Add an FE file"` / `"Add a BFF route"` /
  `"Add a BE endpoint"`.
- The method chip on each route uses `aria-label` to read the method
  in full (`"HTTP method: GET"`), not just the colour or the letter.
- The Notes thread uses semantic `<article>` per note with the
  author's name as the heading. (Was the code-review thread in v5.3
  — now a simple notes surface; same DOM, no PR / CI / unresolved
  meta on each note.)
- The **back arrow** at the top-left of the Story detail is a real
  `<a>` (or `<Link>` in production) with
  `aria-label="Back to Build list"`. Keyboard reachable, visible
  4px navy focus ring, hover state bumps colour to `var(--ink)`
  on a soft white background.
- The remove confirmation uses `role="alertdialog"` with focus trapped
  on `Cancel` (safe default) and `Remove` as a `destructive` action.
  `Esc` closes the dialog and returns focus to the trash icon.
- The rework banner uses `role="status"` so screen readers announce it
  without interrupting.
- The rules `Edit` markdown textarea has a labelled
  `aria-label="Edit build rules (markdown)"`.
- Keyboard escape: `Esc` from anywhere on the Story detail page
  returns focus to the row's `Open story →` button on the parent
  list (so the user can re-orient).
- All focusable elements have a visible 4px navy focus ring.
- Colour contrast: every pill (status, method, agent), the rework
  banner, and the disabled `Mark Ready for QA` button all pass 4.5:1
  on the white card background.

---

## 7. Edge cases & errors

- **Empty list (`+ Add file` validation)** — path validation rejects
  `..`, leading `/`, and absolute paths. Inline error:
  `Paths must be relative and inside the project folder.`
- **Duplicate path** — adding `src/pages/RequestDetail.tsx` twice
  surfaces an inline warning: `This file is already in the list.`
  The duplicate is **not** added; the user is asked to remove the
  existing one first.
- **Route path invalid (BFF/BE)** — paths must start with `/`; methods
  are limited to `GET / POST / PUT / PATCH / DELETE`. Inline errors
  per field.
- **Network offline** — every `Save` / `Add` button is disabled. A
  footer caption reads `Offline — your changes are saved locally and
  will sync when you're back.`
- **Concurrent edit on a file/route list** — last-write-wins per row.
  A toast at the top: `Someone else updated TM-19 — reload to see
  their changes.`
- **Mark Ready for QA clicked on a story still in `Building`** —
  button is `aria-disabled="true"`; clicking does nothing. Hover
  tooltip: `Move the story past Self-review first.`
- **Sending a Rework story back to Build without fixing all issues** —
  primary action is enabled, but a confirmation modal
  (`Send back to Build? {N} issues unresolved`) blocks the action
  until confirmed. `Cancel` is the default focus.

---

## 8. Out of scope (v5.4)

- Visual diffs of FE files inside the Story detail (the link goes to
  the host git provider).
- Editing BFF or BE route handlers from the Build tab — the tab
  surfaces the contract only; the actual code is edited by the Code
  Agent or human dev.
- Multi-BFF / multi-BE architecture (project currently uses one BFF +
  one BE; multi-runtime is a v5.5 consideration).
- Real-time co-editing of the file/route lists (currently last-write-
  wins per row).
- Versioning the rules markdown (only the most recent is shown; full
  history is in git).
- Per-environment overrides (dev / staging / prod). The Rules screen
  shows the project-wide config; per-environment overrides are a v5.5
  follow-up.
- **Code review / PR discussion on this page** — review lives in
  GitHub; this page carries no PR id, no CI status, no unresolved
  thread, and no agent ↔ reviewer separation.
- **Agent-posted notes** — the Notes thread is human-post-only in
  v5.4. Agent commentary, if any, belongs on the parent Build tab
  thread.

---

## 9. Open questions

1. **Should the FE files / BFF / BE lists be a single combined
   "Surface" card** rather than three separate panels? Decision: three
   separate panels in v5.4 — they answer three different questions
   (what files? what BFF? what BE?) and reviewers read them in
   different orders. Re-evaluate if the screen scrolls too long.
2. **Should the Build architecture card on the Rules screen be the
   same as the (now removed) inline architecture panel on the Status
   list?** Decision: yes — same data, different location. The
   per-row inline panel is gone; the project-wide one lives on the
   Rules screen so a new dev can find it in one predictable place.
3. **Should the `+ Add file` button also support pasting a glob**
   (e.g. `src/pages/RequestDetail/**`)? Decision: no in v5.4 — single
   paths only. Globs are a v5.5 consideration.
4. **Should the Notes thread surface the GitHub PR link**
   (e.g. "PR #214 — 3 unresolved")? Decision: no in v5.4 — the
   thread is plain text only; PR links belong in the parent Build
   tab thread or in the Notes body. Reviewers follow the PR through
   GitHub. Revisit if note → PR traceability becomes a pattern.
5. **Should the per-agent coding guidelines be a flat list or
   collapsible cards?** Decision: collapsible cards in v5.4 — keeps
   the page compact when the user lands on it; expands to full
   markdown on click.

---

## 10. Acceptance criteria

A v5.4 Build tab with Story detail and Rules is considered done when:

1. The Build tab document has **3 screen sections**: `#bu` (Status
   list), `#bur` (Rules), `#busd` (Story detail). The TOC lists all
   three.
2. The Status list shows **no inline `.bd-stepper`** on any story row.
   Each row shows only: id + status pill + title + sub + `Open story →`
   arrow.
3. The inline `.story-detail` (architecture + thread expansion) is
   gone from the Status list. The architecture panel lives on the
   Rules screen; the Notes thread lives on the Story detail.
4. Clicking `Open story →` on the TM-19 row scrolls to (or routes to)
   the Story detail screen with id `TM-19`, status `Ready for review`,
   and the linked requirement DSGN-08.
5. The Story detail shows three editable lists: **FE files**,
   **BFF APIs**, **BE APIs**. Each list has a working `+ Add …` flow
   and a working trash icon with a remove confirmation.
6. The Rules screen has four zones: **Build architecture** (read-only
   card with FE / BFF / BE / DB / host rows), **Configurations**
   (editable grid), **Build & deploy rules** (editable markdown),
   **Per-agent coding guidelines** (4 collapsible cards: C1 / C2 /
   C3 / Reviewer).
7. The Rules `Edit` markdown flow opens a `<textarea>`, supports
   `Save` / `Cancel` / `Cmd+Enter` / `Esc`, and writes back to the
   project's on-disk `code-builder/build-rules.md` and
   `code-builder/agents/{name}.md` files.
8. The kit-tabs Status / Rules pill switch swaps the main area
   between the Status list and the Rules screen. The default is
   `Status`.
9. **Topbar on every Build screen (status list, rules, story
   detail) shows no search, filter, export, or `+ New build rule`
   buttons.** On Status and Rules, the only top-of-page control is
   the `← Projects` breadcrumb; on Story detail, the back arrow is
   the sole top-of-page control.
10. **Story detail back arrow** is a `.back-arrow` link at the
    top-left with `aria-label="Back to Build list"`. Clicking it
    returns to the Status list with the source row scrolled into
    view.
11. **Notes thread** (replaces the v5.3 code-review thread)
    renders the seed notes with author `Will` and a working compose
    box. No PR id, no CI status, no unresolved-count, no agent
    avatars.
12. **Rules-half callout** (side-promo card on the Rules screen)
    has top padding (`padding-top` ≥ 16px in the `rules-preview`
    style) and renders **without** a `View code-builder/` button.
13. The doc-title is `Idea Hub — Build tab (v5.4)` and the doc-meta
    reads `3 screens (Build · Status list + Rules + Story detail)`.
14. All interactive elements are keyboard-reachable with a visible
    focus ring. No interactive element is hidden behind a
    `pointer-events: none` rule without an `aria-disabled="true"` or
    `disabled` attribute.
15. The architecture card on the Rules screen has the same content as
    the v5.2 inline architecture panel (FE React 18 / TS / Vite; BFF
    Express /api/*; BE Node 22 / tsx watch; DB SQLite better-sqlite3;
    Host Vercel + Fly.io) and includes the `lock` icon on `Host` and
    the `inferred by agents` caption.
16. The 3-Code-Agent strip and the rework queue remain on the Status
    list (no functional change from v5.2).
