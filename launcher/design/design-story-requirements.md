# Design — Story detail · Requirements

> **Scope:** New Story detail screen on the Design tab — `/projects/:id/design/:storyId`. Replaces the previously inline per-story detail block on the Design list page.
> **Source mockups:** `launcher/design/design-tab.html` § E (DSGN-08, populated) and § F (DSGN-11, empty state)
> **Sitemap contract:** `launcher/design/sitemap.md` § Design — Story detail
> **Related memory:** `project-launcher-restructure.md`,
> `project-launcher-design-standards.md`

---

## 1. Purpose

The **Story detail screen** is the focused, per-story home for design
review. Where the Design list page shows every story as a scannable row,
the Story detail page is where the human and the two design agents
(DA + DB) actually **work on one story at a time** — read the linked
requirement, see and swap interaction-state previews of the design,
attach a source, and post in the A↔B review thread.

The page is **always reached from a story row on the Design list**, via
the `Open story →` button on each row (replacing the v5.2 inline
`.story-detail` expansion that sat below the selected row). It can also
be reached directly via the URL `/projects/:id/design/:storyId` for
deep links from notifications, the Sprint board, or the Activity feed.

The Story detail screen is **status-only** — there is no Rules half
on this page. The Rules tab on the parent Design tab remains the
editable surface for design-system rules.

---

## 2. Entry / Exit

### Entry points

- **Per-project sidebar → Design tab → row → `Open story →` button** —
  the primary entry. The button is on every row of the Design list.
- **Direct URL:** `/projects/:id/design/:storyId`. Used by deep links
  from the Sprint board, Activity feed, or agent notifications.
- **"Open in Design ↗"** from the Sprint board card for a story in
  any design stage (Picked up → Ready for dev).
- **"Open story"** from the agent's comment thread on the parent
  Design list (when agents @-mention a story).

### Exit points

- **`← Back to design list`** in the side-foot (bottom of the
  sidebar) — returns to the Design list with the story's row
  scrolled into view.
- **Breadcrumb `Design / DSGN-XX`** — the `Design` segment of the
  crumb also links back to the Design list.
- **Sibling tabs** (Overview, Project Background, Requirements,
  Sprint, Build, Agents, QA, Activity, Artifacts) via the per-project
  sidebar — same behaviour as the parent Design tab.

---

## 3. User Stories

| ID    | As a…      | I want to…                                                              | So that…                                                       |
|-------|------------|--------------------------------------------------------------------------|----------------------------------------------------------------|
| DST-01 | PM         | Click an arrow on a Design-list row to open that story's detail page     | I can focus on one story without the list collapsing around me  |
| DST-02 | Designer   | Read the linked requirement (title, description, intended users) inline  | I have the spec in front of me while I design                  |
| DST-03 | Designer   | Preview the design in-app without opening Figma in another tab          | I can iterate without context-switching                        |
| DST-04 | Designer   | Toggle the preview between **Default / Loading / Error / Success**      | I can validate every interaction state in one place            |
| DST-05 | Designer   | Attach a **Figma URL** or **upload an HTML file** as the design source   | The preview always reflects the latest source                  |
| DST-06 | Designer   | See and post in the A↔B review thread on the same page                   | Design decisions stay attached to the design, not in Slack      |
| DST-07 | Designer   | **Replace** the linked source when a newer version is available         | The preview updates without re-doing the attach flow           |
| DST-08 | Designer   | **Remove** the linked source                                             | A story can be re-scoped without a stale preview lying around  |
| DST-09 | Designer   | See an empty-state CTA when no design is attached yet                   | I know exactly what to do to unblock peer review               |
| DST-10 | Reviewer   | Open a story from a deep link (Sprint, Activity, notification)           | I can land directly in the right place                          |
| DST-11 | PM         | See the **Mark design complete** action once peer review resolves       | I can flip a story to the next stage without leaving the page  |

---

## 4. Functional Requirements

### FR-1 Story list row — drill-down arrow

- Every story row in the Design list has an `Open story →` button on
  the right.
- The button uses the existing `.row-open` style: pill, navy text,
  light background, chevron icon, flush-right.
- The button is an `<a href="#dsgn-{id}">` anchor that jumps to the
  Story detail screen section in the Design tab document. In the
  production app, this is a `<Link to={"/projects/:id/design/" + id}>`
  on the React side.
- The button has `data-story="DSGN-XX"` so a future test harness or
  analytics listener can wire the click without re-parsing text.
- Clicking the button scrolls to (or routes to) the Story detail page
  and visually marks the source row so the user knows where they
  came from (`.story-row.selected` style — purple-tinted background).

### FR-2 Story detail — top-level layout

- The Story detail page uses the same 248px sidebar / 1-col main shell
  as the rest of the Design tab. The sidebar's `Design` item is
  marked active. The side-promo card shows the current story's id +
  status and an **Open in Sprint board →** link.
- The topbar shows a **crumb** (`Design / DSGN-08`) instead of the
  `← Projects` breadcrumb on the parent tab. Search / Filter / Export
  / `+ New design rule` buttons match the parent tab.
- The story header card sits directly below the topbar:
  - id (DSGN-08), status pill (e.g. `Peer review`), and a
    `Mark design complete →` primary action.
  - When the story is in an earlier stage (e.g. `Picked up`), the
    Mark complete button is **disabled** (visually faded,
    `aria-disabled="true"`, `cursor: not-allowed`).
  - A secondary `Request changes` button is shown when the story is
    in `Peer review`.

### FR-3 Linked requirement card (left column)

- The card always shows the requirement that this story was created
  from (e.g. TM-19). The card contents:
  - **Header row:** requirement icon (purple) · "Linked requirement" ·
    requirement id (`TM-19`, monospace) · `Open in Requirements →`
    link (right).
  - **Description paragraph:** the full requirement description, 1-3
    paragraphs. Bold and italics are preserved.
  - **"Intended users"** chip row at the bottom: a label
    ("Intended users") + user chips. Each chip is a pill with a
    colour-coded dot. Three possible user types:
    - **Property manager** — lavender dot (purple).
    - **Tenant** — sky dot (blue).
    - **Admin** — peach dot (coral).
  - If the requirement has no description, the description block
    collapses to a single line: `No description — open in
    Requirements to write one.`

### FR-4 Add design source (right column)

- The card always shows two attach controls:
  - **`+ Add Figma link`** — clicking it reveals an inline URL input
    + `Save` button below the two attach buttons. The input has
    `type="url"`, `placeholder="https://www.figma.com/file/…"`, and
    a descriptive `aria-label`. Pressing `Enter` in the input or
    clicking `Save` saves the link and re-renders the preview.
  - **`+ Upload HTML`** — opens a native file picker (filtered to
    `.html` / `.htm`). Selected file is uploaded and re-renders the
    preview. This is a stub in v5.3 (no real backend upload yet —
    the file is referenced by name and the preview iframe shows a
    placeholder state until the build wires it up).
- The card is **always visible** — even on the empty-state screen
  (§ F), it acts as the primary CTA for adding the first source.
- The card has a `?` help link in the header that jumps to the
  sitemap § Design — Story detail for documentation.

### FR-5 Design preview card

- Header row contains: title (`Design preview`) · a source-type pill
  (`HTML · design-system/preview/dsgn-08.html` or
  `Figma · 03 · Request detail`) · an a11y chip (e.g. `4/5 a11y`) ·
  the 4-state toggle group (right-aligned).
- Body contains **one** of:
  - **The iframe preview** (when a source is linked): 4 iframes,
    only one visible at a time, swapped by the toggle. Each iframe
    is `min-height: 360px`, full container width, with `srcdoc`
    inline HTML samples. The iframe's `title` attribute matches the
    active state (e.g. `Request detail — loading state`) so screen
    readers announce the state change.
  - **The empty state** (when no source is linked): centered icon
    + heading `No design attached yet` + body + a primary
    `+ Add design source` button that scrolls to / focuses the
    add-source card.
- The body wrapper has `aria-live="polite"` and `aria-atomic="true"`
  so screen readers announce the state change when the active
  toggle is changed.

### FR-6 4-state interaction toggle

- The toggle group has 4 pill buttons: **Default · Loading · Error ·
  Success**, single-active (matches the kit-tabs pattern).
- Toggling:
  1. Updates the active button's `.on` class and `aria-selected`.
  2. Hides all 4 iframes and shows the one matching the active
     button.
  3. The previously-active button's `tabindex` is set to `-1`; the
     new active button's `tabindex` is `0` so keyboard focus moves
     with it.
- Keyboard:
  - `ArrowRight` / `ArrowDown` — move to the next toggle, wrapping.
  - `ArrowLeft` / `ArrowUp` — move to the previous toggle, wrapping.
  - `Home` / `End` — jump to first / last toggle.
  - `Enter` / `Space` — already handled by the browser for buttons.
- All 4 toggle buttons have `role="tab"`, the container has
  `role="tablist"` and an `aria-label` (e.g. `Interaction state`).
  **Note:** because the iframes are independent (not a true tab
  panel set with shared focus), the WAI-ARIA tablist pattern is
  applied loosely — `role="tablist"` on the container, `role="tab"`
  on the buttons, no `aria-controls` on the buttons (each iframe is
  a separate resource, not a panel).
- The `aria-live` on the body wrapper carries the state change to
  assistive tech.

### FR-7 Linked source card (Replace + Remove)

- Sits below the preview card. Shows the currently-linked source:
  - **HTML source:** green icon (`H`) · `Linked source` heading ·
    `design-system/preview/dsgn-08.html` (monospace) · file size +
    last-edited time + by-line.
  - **Figma source:** orange icon (`F`) · `Linked source` heading ·
    `03 · Request detail` (frame name) · file URL.
- Two actions on the right:
  - **`Replace`** — opens the same flow as `Add Figma link` /
    `Upload HTML` (replace vs. add differs only in whether the
    source card already exists; the attach UI is reused).
  - **`Remove`** — opens a small confirmation: `Remove source?
    Reviewers won't be able to preview the design until a new
    source is linked.` with `Cancel` / `Remove`. The Remove action
    transitions the page to the empty state (§ F).
- The card uses a subtle gradient background
  (`#fff` → `mint`) so the "linked" state is visible at a glance.

### FR-8 A↔B peer review thread

- Below the source card, the thread reuses the
  `.thread` / `.comment` / `.compose` classes from the parent Design
  tab. No new design tokens.
- Each comment shows: agent avatar (DA / DB) · agent name ·
  timestamp · body (markdown-safe, supports `**bold**` and
  `*italic*`).
- A disagreement callout (`.disagree`, amber-bordered) is shown on
  any comment marked as a `Disagreement` by the posting agent.
  The callout text is configurable per project.
- The compose box at the bottom:
  - `<textarea>` for the reply, growing to max 6 lines.
  - `Posting as Will` label.
  - `Post` primary button (disabled when textarea is empty).
  - `Cmd/Ctrl+Enter` submits.
- The thread header shows the live count: `3 comments · 1
  disagreement · last reply 38m ago`.

### FR-9 Empty state (§ F — DSGN-11)

- Triggered when the user navigates to a Story detail page with no
  linked source.
- Differences from the populated state:
  - The `Mark design complete` button is disabled.
  - The preview card shows the **empty state** (icon + heading +
    body + `+ Add design source` primary CTA) instead of the iframe
    preview.
  - The 4-state toggle group is **disabled** (visually faded,
    `aria-disabled="true"`, `pointer-events: none`, `tabindex="-1"`
    on every button).
  - The compose textarea is disabled with placeholder text
    `Open the thread when a design is attached — comments unlock
    here.`.
  - The `Add Figma link` button in the add-source card is
    **primary** (not soft) — it's the page's main CTA.
  - The footer caption ends with `· no source linked`.
- The side-promo card copy changes to *"Design Agent A just picked
  this up. Attach a Figma frame or HTML preview so reviewers can
  validate the design."*

---

## 5. UI States

| State                       | Where                       | What renders                                                                                                          |
|-----------------------------|-----------------------------|-----------------------------------------------------------------------------------------------------------------------|
| **Loading source**          | preview card                | Shimmer skeleton inside the iframe (3 stacked bars)                                                                  |
| **Source linked · default** | preview card                | Filled status detail with timeline, status pill, scheduled visit, status history                                     |
| **Source linked · loading** | preview card                | Skeleton shimmer: 1 line (id+pill) + 1 H2 + 1 subline + 2 card placeholders                                          |
| **Source linked · error**   | preview card                | Centered error card: icon + heading `Couldn't load the request` + body + `Try again` button + `View offline copy` link |
| **Source linked · success** | preview card                | Centered success card: green check icon + heading `Status updated` + REQ-id confirmation                             |
| **No source linked**        | preview card                | Centered icon + heading `No design attached yet` + body + `+ Add design source` primary button                        |
| **Add Figma input open**    | add-source card             | Figma URL input + `Save` button revealed below the two attach buttons                                                 |
| **Replace open**            | source card                 | Same UI as `Add Figma input open`, pre-filled with the existing source                                                |
| **Remove confirm**          | source card                 | Inline confirmation strip: `Remove source?` + `Cancel` / `Remove`                                                    |
| **Toggling state**          | preview card                | Iframe swaps; previous iframe hidden, new iframe shown; `aria-live="polite"` announces change                          |
| **Mark complete disabled**  | story header                | Button faded, `aria-disabled="true"`, `cursor: not-allowed`                                                          |
| **Thread empty**            | thread                      | `No comments yet` in the thread head; compose box enabled (can post a first comment)                                  |
| **Thread + disagreement**   | thread                      | Disagreement callout on the disagreeing comment                                                                      |
| **Reviewer keyboard nav**   | toggle group                | Arrow keys move active toggle, Home/End jump, focus ring visible                                                      |
| **Focus**                   | every interactive element   | Visible 4px navy focus ring on the active element (matches the rest of the system)                                   |

---

## 6. Accessibility (WCAG 2.1 AA)

- All form fields (Figma URL input, compose textarea) have
  programmatic `<label>` association — no placeholder-as-label. The
  Figma URL input has an explicit `aria-label="Figma file URL"`.
- The 4-state toggle group is a `role="tablist"` with `role="tab"`
  buttons. `ArrowLeft` / `ArrowRight` / `Home` / `End` are wired
  per the WAI-ARIA tabs pattern (loosely, since each iframe is
  independent).
- The preview body has `aria-live="polite"` and
  `aria-atomic="true"` so screen readers announce the state change
  when the active toggle is changed. The iframe's `title` attribute
  carries the new state name.
- The Mark complete button, when disabled, has
  `aria-disabled="true"` (not just visual disabled). The disabled
  toggle group in the empty state has
  `aria-disabled="true"` on the container plus
  `tabindex="-1"` on each button.
- The empty state CTA `+ Add design source` is a real
  `<button>`, focusable, with a visible focus ring. It scrolls to
  the add-source card and focuses the Figma URL input.
- The Remove confirmation uses `role="alertdialog"` with focus
  trapped on `Cancel` (safe default) and `Remove` as a
  `destructive` action. `Esc` closes the dialog and returns focus
  to the `Remove` link.
- The peer review thread uses semantic
  `<article>` per comment with the agent's name as the heading.
- Colour contrast: every pill (status, user, source-type), the
  disagreement callout, and the source card gradient all pass 4.5:1
  on the white card background. The disabled toggle group falls
  back to 3:1 on its text (acceptable for disabled UI per WCAG 1.4.3
  exception) but the action itself is unreachable.
- Keyboard escape: `Esc` from anywhere on the Story detail page
  returns focus to the row's `Open story →` button on the parent
  list (so the user can re-orient).

---

## 7. Edge cases & errors

- **Figma URL invalid** — Save shows inline error
  `That doesn't look like a Figma URL. Expected
  https://www.figma.com/file/…` under the input. Other fields
  preserved.
- **Figma URL valid but file is private** — Save returns 403, card
  shows `We can't access that Figma file. Check the file's sharing
  settings — anyone with the link should be able to view it.`
- **HTML upload > 5 MB** — rejected client-side with
  `Files must be 5 MB or smaller. The current file is 6.2 MB.`
- **HTML upload wrong file type** — rejected client-side with
  `Only .html or .htm files are supported.`
- **Source removed while another reviewer has the page open** — the
  reviewer sees the empty state on next action; a soft toast at
  the top of the page says `The source was removed by Will.`
- **Network offline** — Save buttons disabled; footer shows
  `Offline — your changes are saved locally and will sync when
  you're back.`
- **Concurrent edit on the thread** — last-write-wins per
  comment. A `Someone else just posted — reload to see their
  message` banner appears with a `Reload` button.
- **Mark complete clicked on a story still in `Picked up`** —
  button is `aria-disabled="true"`; clicking does nothing. The
  hover tooltip is `Move the story to Peer review first.`

---

## 8. Out of scope (v5.3)

- Real Figma embed rendering (the preview is a same-origin iframe
  with inline `srcdoc` for the v5.3 mockup; a true Figma embed URL
  is a v5.4 deliverable).
- Drag-and-drop for HTML upload (only file picker for now).
- Multi-source (linking multiple files / frames to one story).
- Story-level comments that are not on the A↔B thread (e.g.
  internal-only notes, @-mentions of non-DA/DB agents).
- Embedding non-HTML, non-Figma sources (e.g. Sketch, XD, image
  PDFs).
- Version history of attached sources (only the most recent is
  shown).

---

## 9. Open questions

1. **Where does the Mark design complete action live** if the user
   reaches the Story detail page from a deep link (Sprint board
   / notification)? The action is always visible at the top of
   the page, so it should be fine, but a confirmation modal
   ("Flip to design complete — this notifies DA and DB") might be
   needed. Decision: ship without confirm in v5.3; revisit if
   accidental flips become a pattern.
2. **Should the 4-state toggle group also let the user add custom
   states** (e.g. "Disabled", "Focus")? Decision: no, in v5.3 the
   group is fixed at the 4 canonical states per
   `skills/ui-best-practices.md`. Custom states are a v5.4
   consideration.
3. **Should the source card show a thumbnail** of the design
   (e.g. first 240px tall screenshot of the iframe)? Decision: no
   in v5.3 — the preview card already shows the live design. A
   thumbnail would be a v5.4 "design index" feature.
4. **Should removing a source require typing the story id** as a
   destructive-action guard? Decision: standard yes/no confirm
   for v5.3; revisit if accidental removes become a pattern.

---

## 10. Acceptance criteria

A v5.3 Design tab with Story detail is considered done when:

1. Every story row on the Design list shows an `Open story →`
   arrow on the right. No `.ds-stepper` is rendered on any row.
2. The inline `.story-detail` block is gone from the Design list
   page. The artifacts viewer + A↔B review thread that used to
   live there now live on the Story detail page.
3. Clicking `Open story →` on the DSGN-08 row scrolls to (or
   routes to) the Story detail screen with id `DSGN-08`, status
   `Peer review`, and the linked requirement TM-19.
4. The 4-state toggle group swaps the preview iframe content
   (Default · Loading · Error · Success). Only one iframe is
   visible at a time. `aria-live="polite"` announces the change.
5. Keyboard `ArrowLeft` / `ArrowRight` / `Home` / `End` move the
   active toggle. Visible 4px focus ring on the active toggle.
6. The Add Figma link button reveals a URL input + Save button
   below the two attach buttons. Saving a valid Figma URL
   transitions the page from empty state to populated state.
7. The linked source card shows the source path / URL + file
   size + last-edited metadata. Replace re-opens the attach UI;
   Remove opens a confirmation and transitions to empty state.
8. The A↔B review thread renders the 3 design agent comments
   with disagreement callout and a working compose box.
9. The empty-state screen (DSGN-11) renders with the centered
   empty state, disabled toggle group, disabled compose box, and
   the Figma link button as the primary CTA.
10. All interactive elements are keyboard-reachable with a
    visible focus ring. No interactive element is hidden behind
    a `pointer-events: none` rule without an
    `aria-disabled="true"` or `disabled` attribute.
11. The doc-title is `Idea Hub — Design tab (v5.3)` and the
    doc-meta reads `2 screens (Design · list + Story detail)`.
12. The TOC at the top of the document lists both screens
    (`D` for the Design list, `E` for the populated Story
    detail, `F` for the empty-state Story detail).
