# Sprint Tab — Requirements

> **Scope:** Sprint tab screens — `#s6` (Sprint — Jira Kanban) and `#s6b`
> (Sprint — Connect Jira setup state), plus the new Settings cog and Edit-Jira
> in-screen panel added in v5.2.
> **Source mockups:** `launcher/design/sprint.html`
> **Sitemap contract:** `launcher/design/sitemap.md` § Sprint tab
> **Related memory:** `project-launcher-restructure.md`,
> `project-launcher-design-standards.md`

---

## 1. Purpose

The **Sprint tab is the master story board** for a project. Every requirement,
design pickup, build task, review, and QA run is reflected on it as a Jira
ticket. It is the single source of truth for *what is happening* across all
downstream stages.

Because the board depends on a Jira link, the tab has two top-level states:

- **Connected** (screen 6) — Kanban board renders, agents are working, sync
  is on.
- **Not connected** (screen 6b) — board is replaced by the Connect Jira
  setup form. Sprint is effectively blocked.

The Sprint tab is **status-only** — there is no Rules half (exception to the
two-halves pattern that Design / Build / QA follow). The board itself is the
steerable surface: story moves happen here, not in a separate rules tab.

---

## 2. Entry / Exit

### Entry points
- Per-project sidebar — clicking **Sprint** (badge = Jira ticket count when
  connected, no badge when not connected).
- After **Project context confirmation**, Sprint becomes unlocked (along with
  Design, Build, QA). Until that gate fires, Sprint renders as a
  `aria-disabled="true"` greyed-out label.
- Direct URL: `/projects/:id/sprint`.

### Exit points
- Sibling tabs (Overview / Project Background / Requirements / Design /
  Build / Agents / QA / Activity / Artifacts) via the per-project sidebar.
- **"Open in Jira ↗"** side-promo button — opens the linked Jira project in a
  new tab.
- After disconnecting Jira, Sprint returns to the screen 6b setup state.

---

## 3. User Stories

| ID | As a… | I want to… | So that… |
|----|-------|------------|----------|
| ST-01 | PM | See every story and its current stage on one board | I can answer "where are we?" in under 5 seconds |
| ST-02 | PM | See which Code Agent is working on what | I can spot blockers and load imbalance early |
| ST-03 | BA | Have approved Requirements auto-create Jira tickets | I don't manually copy-paste stories into Jira |
| ST-04 | BA | Override the auto-create rule (manual mode) | A human can triage each ticket before it lands in Sprint |
| ST-05 | PM | Open any ticket in Jira directly | I can read full ticket detail and history |
| ST-06 | PM | **Change the Jira project key after connection** | I can re-point Sprint to a different Jira project without losing state |
| ST-07 | PM | **Rotate the API token after connection** | I can revoke a leaked token without losing the link |
| ST-08 | PM | **Switch sync direction (two-way ↔ one-way)** | I can run a read-only Sprint during a freeze window |
| ST-09 | PM | **Edit the auto-create rule after connection** | I can change policy without disconnecting |
| ST-10 | PM | Disconnect Jira cleanly | The board returns to the setup state with no orphan data |
| ST-11 | PM | Find board settings **on the board itself**, not in the topbar | I never confuse Sprint settings with project-wide settings |

---

## 4. Functional Requirements

### FR-1 Sprint tab topbar
- Always shows: **← Projects** breadcrumb, search box (placeholder only in
  mockup), **Filter**, **Sprint** scope chip, **+ Add issue**.
- The Sprint topbar is intentionally **free of project-wide Settings** —
  this tab's cog lives on the board card itself (see FR-6) so that it
  reads as "this board's settings", not as project-wide settings.

### FR-2 Jira-sync banner (screen 6 only)
- Persistent banner at the top of the board reads:
  **"Two-way Jira sync is on. Tickets created here appear in the `TM` Jira
  project. Status changes in Jira update this board within 30s."**
- When sync direction is one-way, the banner text reflects the active
  direction.
- When sync fails, the banner swaps to an error variant with a **Retry**
  button.

### FR-3 Kanban board (screen 6)
- Four columns: **To do · In progress · In review · Done**.
- Each card shows: ticket id (`TM-*`), title, priority dot (rose/amber/grey),
  assigned Code Agent avatar (mint/sky/butter for C1/C2/C3), point estimate,
  live status badge (`in progress` / `PR open` / `shipped`).
- Column headers show the count of cards.
- Cards are keyboard-draggable; drag-and-drop announces the move via
  `aria-live="polite"`. (See sitemap § Sprint accessibility.)

### FR-4 Code-agent status strip (screen 6)
- Three rows under the board, one per Code Agent.
- Each row: agent avatar, name, current ticket, elapsed time, ETA, Active
  pill.
- Lives here only in the mockup — sitemap records that the strip will move
  to the Agents tab in a future release. The Sprint tab stays board-only.

### FR-5 Connect Jira setup state (screen 6b)
- Replaces the board when no Jira link exists.
- Includes a **Jira-gate banner** explaining why the state exists:
  *"Sprint is the master story board — every Requirements item, Design
  pickup, Build task, and QA run is reflected here as a Jira ticket. Until
  a Jira project is linked, the board can't render."*
- The setup form has these fields (stacked, label-above-input):
  - **Project key** — short prefix used for tickets (e.g. `TM`).
  - **Base URL** — Atlassian Cloud or self-hosted URL.
  - **Account email** — owner of the API token.
  - **API token** — Atlassian API token, `type="password"`. Link to
    id.atlassian.com token page in help text.
  - **Sync direction** — three options: Two-way (recommended) /
    Launcher → Jira / Jira → Launcher.
  - **Auto-create** — two options: auto-create on Requirements →
    Sprint-ready, or manual.
- Each field has its own **help line** explaining the choice.
- **Permission detail** link expands what is shared (project name, ticket
  IDs, status changes, agent commits) and what stays local (artifact files,
  design-system rules, activity feed).
- Primary CTA: **Connect Jira**. Secondary: **Use CSV export instead**.
- A **"After you connect"** preview list shows the 4 steps that fire on
  successful link.

### FR-6 Settings cog + Edit-Jira panel **(NEW v5.2)**
- The ⚙ Settings cog lives **inside the board card**, not in the topbar.
  This is intentional: the visual placement says "this board's settings"
  (Jira connection, sync, auto-create), not project-wide Settings.
- **Screen 6 (connected):** the cog sits in the Build board card header,
  on the right side, immediately before the Board / Backlog view toggles.
  Clicking ⚙ toggles the **Edit-Jira panel** (`#jira-config-panel`)
  in-line below the sync banner. The board remains visible below the
  panel for context.
- **Screen 6b (not connected):** the cog sits in the Connect Jira setup
  card header, right-aligned next to the title row. Clicking ⚙ scrolls
  smoothly to the existing setup form (`#connect-jira-form`); the cog
  stays in the `aria-pressed="true"` state while the user is in the
  setup flow.
- The cog has a descriptive `aria-label`
  (`"Board settings — edit Jira connection for this board"` /
  `"Board settings — connect Jira for this board"`), `aria-pressed` for
  toggle state, `aria-controls` referencing the target id, and a
  `title` tooltip.
- The Edit-Jira panel shows the **same field set** as the setup form,
  pre-filled with current values. A live status pill reads
  *"Last synced 12s ago"* with a green dot (or amber if stale > 2 min).
- Panel footer has three buttons: **Disconnect** (ghost, rose hover),
  **Cancel** (soft), **Edit** (primary).
- Clicking **Edit** unlocks all fields (removes `readonly` class on the
  card). Buttons become **Cancel** + **Save changes** (primary).
- **Save** posts to `PATCH /api/projects/:id/jira/link` and re-fetches sync
  status. **Cancel** reverts to the locked view.
- **Disconnect** opens a confirmation dialog
  (`Are you sure? Existing tickets stay in Jira; this board will return to
  setup.`). Confirm calls `DELETE /api/projects/:id/jira/link`.

### FR-7 Side-promo card
- Screen 6 — **Jira board** card with **Open in Jira ↗** CTA.
- Screen 6b — **Jira not connected** card with **Connect Jira →** CTA that
  scrolls to the form.

---

## 5. UI States

| State | Where | What renders |
|-------|-------|--------------|
| **Loading** | screen 6, board fetch | Skeleton board: 4 column shells, 2 placeholder cards each, with shimmer. Topbar + project header render fully. |
| **Empty / no tickets yet** | screen 6, board | Empty state inside the board card: *"No tickets yet. Connect a Requirements doc or add an issue to start."* with **+ Add issue** CTA. |
| **Connected + healthy** | screen 6 | Sync banner green dot, board renders, agent strip shows 3 active agents. |
| **Connected + sync stale (> 2 min)** | screen 6 | Sync banner amber dot, banner text *"Last sync 3 min ago — retrying."* with **Retry** link. |
| **Connected + sync failed** | screen 6 | Sync banner rose variant, **Retry sync** button. Board continues to render last-known state with a warning badge per card. |
| **Not connected** | screen 6b | Jira-gate banner + setup form + After-you-connect preview. Sprint pill reads **Blocked**. |
| **Editing Jira config** | screen 6, panel open | Edit-Jira panel unlocked; Save CTA enabled only when a field has changed. |
| **Validation error** | screen 6b or panel | Per-field error message under the input. Project key: 2-10 uppercase chars. Base URL: must parse as URL with protocol. Email: RFC 5322 shape. API token: ≥ 24 chars (Atlassian minimum). |
| **Permission denied (403)** | screen 6b | Error banner: *"You don't have access to that Jira project. Ask the project admin to invite `<email>`."* |
| **Rate limited (429)** | screen 6b | Inline error with retry-after countdown. |
| **Disconnect confirm** | screen 6, panel | Modal: *"Disconnect Jira? Existing tickets stay in Jira; the Sprint board will return to setup."* with Cancel / Disconnect. |
| **Focus** | both screens | First interactive element of the form gets focus on mount (or on ⚙ click for the panel). Esc closes the panel and returns focus to the cog. |

---

## 6. Accessibility (WCAG 2.1 AA)

- All form fields have programmatic `<label for="…">` association — no
  placeholder-as-label.
- Help text is linked via `aria-describedby` on each input.
- Cog button has a descriptive `aria-label` that names the action
  (`"Sprint settings — edit Jira connection"` or
  `"Sprint settings — connect Jira"`), not just "settings".
- Cog button uses `aria-pressed` (not just visual state) for toggle state.
- Sync banner uses `role="status"` so screen readers announce sync changes
  without interrupting.
- Kanban cards are keyboard-draggable; drag-and-drop announces the move
  (sitemap § Sprint accessibility).
- Colour contrast: the `Blocked` pill on screen 6b passes 4.5:1 against the
  blush tile; the `Last synced` green dot + label pass 4.5:1 on white.
- The locked / disabled state of the Sprint tab before Project Background
  confirmation is `aria-disabled="true"`, never `display:none`; the lock
  label keeps sufficient contrast, has an accessible name that names the
  gate, and is keyboard-reachable.
- Esc closes the Edit-Jira panel and returns focus to the ⚙ cog.
- Focus is trapped inside the disconnect-confirm modal until resolved.

---

## 7. Edge cases & errors

- **Token revoked while editing** — Save returns 401, panel shows
  *"Your API token was rejected. Re-enter it and try again."* All other
  field values are preserved.
- **Project key collision** — Jira already has tickets with a different
  prefix. Banner: *"A Jira project with the key `TM2` doesn't exist. Create
  it in Jira first or pick a different key."*
- **Network offline** — Save is disabled, footer shows
  *"Offline — your changes are saved locally and will sync when you're
  back."*
- **Concurrent edit** — Two users editing the same link → second save
  returns 409, panel shows *"Someone else updated the Jira link. Reload to
  see their changes."* with **Reload** button.

---

## 8. Out of scope (v5.2)

- Multiple Jira projects per Launcher project (roadmap).
- Sprint-level permissions (view-only roles) — Roadmap.
- Custom field mapping (epic link, story points label, custom workflow).
- Webhook-driven push (currently polling-based 30s sync).
- Moving the Code-Agent strip to the Agents tab (sitemap records this as a
  future change; the mockup keeps it on Sprint for now).

---

## 9. Open questions

1. Should the Edit-Jira panel **replace** the board when opened, or stack
   below it as in the current mockup? Current decision: stack (preserves
   board context during edits). Revisit if users complain about scroll
   length.
2. Should the disconnect action require **typing the project key** to
   confirm (destructive-action guard)? Current decision: standard
   yes/no confirm dialog. Revisit if accidental disconnects become a
   pattern.
3. Should the panel support **per-field permission scopes** (read-only
   fields for view-only users)? Out of scope for v5.2.

---

## 10. Acceptance criteria

A v5.2 Sprint tab is considered done when:

1. ⚙ Settings cog is visible **inside the Build board card header** on
   screen 6 and **inside the Connect Jira setup card header** on screen
   6b, and **absent from the topbar** on both screens.
2. Clicking ⚙ on screen 6 reveals the Edit-Jira panel with all 6 fields
   pre-filled from `GET /api/projects/:id/jira/link`.
3. Clicking ⚙ on screen 6b scrolls to / focuses the setup form.
4. The Edit-Jira panel passes through these states: **locked → editing →
   saving → saved | error**, all with proper focus management.
5. Esc closes the panel and returns focus to the cog.
6. The stacked field layout matches the design — labels above inputs,
   18px vertical gap between fields, help text under each input.
7. All form fields have associated labels and help text (aria-describedby).
8. Disconnect confirmation uses a modal with focus trap.
9. No ticket data is lost when disconnecting — Jira keeps the tickets, the
   Launcher board returns to the setup state.
10. Sync banner reflects live sync state and changes text + colour
    appropriately.
11. The cog's `aria-label` includes "Board settings" (not "Project
    settings") so screen-reader users don't confuse it with project-wide
    settings.
