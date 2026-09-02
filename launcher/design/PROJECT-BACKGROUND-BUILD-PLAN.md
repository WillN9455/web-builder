# Build Plan — Project Background Page (BA Workspace, screens 12–14 + State D)

Source of truth: `launcher/design/background.html` (v5.3). Plan brief: `launcher/design/plan.md`. Page contract: `launcher/design/sitemap.md` § Project Background tab. Workspace root = current repo (no `project-dir.txt`). Branch: `feature/product-requirements-ui`.

## Goal

Implement the **Project Background** tab inside a project — replaces the v5 placeholder. Landing for `/projects/:id` when the new sidebar menu item "Project Background" is active. Builds screens 12 (draft), 13 (unsaved edits), and 14 (file in SA review with inline thread) of the v5.3 plan, plus the State D context-ready confirmation view.

Out of scope this round: the new top-level **Requirements** tab (screen 15), the **Design / Build / Agents / QA / Activity / Artifacts** tabs, and any SQLite schema migration beyond a small per-file state table.

## Scope (what "done" looks like)

1. A new sidebar item **Project Background** sits between Overview and Requirements on the per-project menu, with badge = total artifact count for the project.
2. Clicking it routes to `/projects/:id/background` and renders the screen from `background.html` — five-band file tree on the left (Core PRD / Scope & rules / Data & access / Planning & risk / SA handoff), **document editor on the right (always a textarea — no View/Edit mode toggle)**.
3. Per-file review state machine works end-to-end:
   - `Draft` → `In Review (SA)` → `Returned` → `Approved`
   - Every transition is a single API call; no bulk handoff.
4. **No View/Edit tabs.** The right pane is always an editable BA monospace textarea for `Draft` / `Returned` / clean files; the user edits inline and clicks `Save changes` as a separate action. The footer is status-aware: clean Draft → `Save changes` / `Send for review →`; dirty → `Discard` / `Save changes` / `Send for SA review →` (Send only enabled while `Draft` or `Returned`). The editor is **read-only only when the file is `In Review (SA)`** — that read-only state is implied by review state, not by a View tab.
5. SA-in-review pane (screen 14) shows the read-only body, `Return to BA` / `Approve ✓` footer, and an inline comment thread with Compose box.
6. Stage banner shows live counts (`8 Draft / 3 In Review / 1 Returned / 3 Approved`).
7. **Open-questions banner (butter-yellow) links to Overview.** It appears when `open-questions.md` has `Blocker-for: PRD-approval` items; its sole action is `View questions →`, which navigates to the Overview tab (`/projects/:id`) where the Outstanding-questions panel surfaces the items. It does **not** deep-link into the intake BA chat.
8. **State D (context-ready confirmation view)** renders when all 17 docs are `Approved`. It uses the **same per-project shell** as screens 12–14 (full 10-tab sidebar with Project Background active + downstream tabs locked, topbar with `← Projects` + project name + stage pill) with the State D confirmation card in the main column. `Confirm project context →` calls `POST /api/projects/:id/background/confirm-context` (one-shot unlock). No alternate/stripped chrome.
9. All states from `skills/ui-best-practices.md` covered: loading, empty, error (network + per-file 404), success (transition toast), validation (textarea dirty guards), focus (visible focus ring on tree rows, `aria-current="true"` on selected; focus moves into the textarea when a file opens).
10. WCAG 2.1 AA per `skills/accessibility-guidelines.md`: contrast on the coral inset bar and rose error states, keyboard nav across the tree (`Up`/`Down`/`Enter`/`Home`/`End`), screen-reader labels on every status dot.
11. A Playwright smoke test that loads a sample project, opens Project Background, edits and saves a Draft file, switches it to In Review, posts a comment, marks it Approved, and — once all 17 are Approved — confirms context on State D.

## File map (added / modified)

```
launcher/
├── src/
│   ├── App.tsx                              # add /projects/:id/background route
│   ├── components/
│   │   ├── ProjectDetailScreen.tsx          # wire new "Project Background" menu item + badge
│   │   ├── ProjectBackgroundScreen.tsx      # NEW — screen 12/13/14 shell (handles draft, dirty, SA-review states)
│   │   ├── ba-workspace/
│   │   │   ├── FileTree.tsx                 # NEW — 5 bands, status dot, dirty inset
│   │   │   ├── ArtifactEditor.tsx           # NEW — always-editable monospace textarea (read-only flag only when In Review)
│   │   │   ├── ReviewThread.tsx             # NEW — inline comments + Compose
│   │   │   ├── StageBanner.tsx              # NEW — live counts banner
│   │   │   ├── OpenQuestionsBanner.tsx      # NEW — butter-yellow strip, "View questions →" links to /projects/:id (Overview)
│   │   │   ├── ContextReadyView.tsx         # NEW — State D confirmation card (reuses the standard sidebar/topbar shell)
│   │   │   └── StatusDot.tsx                # NEW — small colored dot with sr label
│   │   ├── SidebarMenu.tsx                  # NEW (or extract from ProjectDetailScreen) — per-project menu with badges
│   │   └── Skeletons.tsx                    # add <FileTreeSkeleton/> + <DocumentSkeleton/>
│   ├── lib/
│   │   └── api.ts                           # add ba-workspace fetchers (TanStack Query) + confirm-context call
│   └── styles/
│       └── app.css                          # add .ba-workspace* + .state-d* classes (no new tokens)
├── server/
│   ├── index.ts                             # add 7 ba-workspace routes + POST /background/confirm-context
│   ├── ba-workspace.ts                      # NEW — file tree assembly, status state, transition logic, confirm-context unlock
│   └── db.ts                                # add ba_artifacts_status table + helpers
└── testing/
    └── playwright/
        └── project-background.spec.ts       # NEW — round-trip smoke test incl. State D confirm
```

**Removed vs. earlier plan:** there is no separate `ArtifactViewer.tsx` (markdown-render "View" tab). One `ArtifactEditor.tsx` serves every editable state; read-only is a prop driven by the file's `In Review (SA)` state.

No new top-level tokens. All visual values are in `src/styles/tokens.css` already (per `design-system/tokens/color.md`): `--navy`, `--coral`, `--mint`, `--peach`, `--sky`, `--lavender`, `--purple`, `--butter`. Component states reuse `design-system/components/button.md`, `card.md`, `navigation.md`.

## Phase breakdown

### Phase 1 — Shell, tokens, route, menu (≈30 min)

- Read `background.html` end-to-end and extract: 5-band file tree structure (15 file rows + 2 personas/journeys per v5.2 = 17 total), status dot color map, view/edit tab copy, stage banner copy, footer buttons.
- Add `/projects/:id/background` route to `App.tsx` (nested under `ProjectDetailScreen`).
- Extract (or add) `SidebarMenu.tsx` from `ProjectDetailScreen.tsx` so it can render the new "Project Background" item with a badge. Badge = `GET /api/projects/:id/ba-workspace/files` returning total + per-band counts.
- Wire the existing 9-item menu items from the v5.2 plan; only "Project Background" and "Overview" actually navigate to real screens this round. The other 7 can stay disabled placeholders with `aria-disabled` + a tooltip — same as the current v5 placeholder pattern in `ProjectDetailScreen.tsx`.

**Agent:** single Code Agent (no parallel work yet — small scope, no contention).

### Phase 2 — Server: 7 endpoints (≈45 min)

Add to `server/index.ts`, backing logic in new `server/ba-workspace.ts`, schema bump in `server/db.ts`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/projects/:id/ba-workspace/files` | Tree + per-file status + dirty flag |
| `GET` | `/api/projects/:id/ba-workspace/files/:filename` | Markdown body |
| `PUT` | `/api/projects/:id/ba-workspace/files/:filename` | Save body (BA only) |
| `POST` | `/api/projects/:id/ba-workspace/files/:filename/transition` | Body `{to: "in_review"\|"returned"\|"completed"}` |
| `GET` | `/api/projects/:id/ba-workspace/files/:filename/comments` | Thread |
| `POST` | `/api/projects/:id/ba-workspace/files/:filename/comments` | Append comment |
| `GET` | `/api/projects/:id/ba-workspace/open-questions` | Open-questions banner data |

Source of truth = the project's on-disk `PRD/` directory (already created by intake). State lives in a tiny `ba_artifact_status(filename TEXT PRIMARY KEY, status TEXT, dirty INT, updated_at)` table. `activity` rows are appended on every edit + transition. **No destructive file deletes**, ever — per the smoke-test-safety feedback in memory.

**Agent:** single Server Agent.

### Phase 3 — Frontend: ProjectBackgroundScreen + subcomponents (≈1.5 h)

This is the meat. Split across **two parallel Code Agents** on **separate branches** to honor the "3 Code Agents on own branches" rule from the framework, but with only 2 here because the surface is smaller:

- **Branch A — `feat/ba-shell-tree-banner`** → `ProjectBackgroundScreen.tsx`, `FileTree.tsx`, `StageBanner.tsx`, `OpenQuestionsBanner.tsx`, `ContextReadyView.tsx`, `StatusDot.tsx`, `SidebarMenu.tsx`. These touch the same files (screen shell + State D), so they need to land together. Assign to **one** agent.
- **Branch B — `feat/ba-document-panel`** → `ArtifactEditor.tsx` (always-editable textarea; read-only when `In Review (SA)`), `ReviewThread.tsx`. Independent file set.
- **Branch C — `feat/ba-api-hooks`** → `src/lib/api.ts` TanStack Query hooks + types. Foundation branch.

Merge order (sequential, not parallel): **C → A → B**. C provides the API surface A and B depend on. A and B can then land together.

Each branch ships a unit test colocated (`*.test.tsx`) using the existing Vitest setup if present; otherwise add it.

### Phase 4 — QA + accessibility + Playwright (≈30 min)

- `skills/accessibility-guidelines.md` audit pass on the new screen: tab order, focus ring contrast, `role="tree"` + `role="treeitem"` + `aria-current="true"` on selected row, `aria-label` on each status dot (`Draft`, `In Review`, `Returned`, `Approved`).
- `skills/ui-best-practices.md` state coverage: loading skeleton, empty tree (no PRD folder), error banner with retry button (network failure on `GET /files`), success toast after `Send for SA review`, validation (textarea dirty guard before navigating away / sending for review), back/cancel navigation preserved.
- `testing/playwright/project-background.spec.ts`: load a fixture project, open background tab, click first Draft file (editor opens, no View/Edit toggle), change one word, click `Save changes`, click `Send for SA review`, assert banner count shifts, post a comment, assert it appears in thread, click `Approve ✓`, assert status dot becomes Approved. Once all 17 are Approved, assert State D renders in the standard shell and `Confirm project context →` unlocks the downstream tabs.

**Agent:** QA Agent (single).

## Agent assignments (4 total)

| Agent | Phase | Branch | Worktree? |
|---|---|---|---|
| Code Agent 1 (shell) | Phase 1 + 3A | `feat/ba-shell-tree-banner` | yes |
| Code Agent 2 (server) | Phase 2 | `feat/ba-server-ba-workspace` | yes |
| Code Agent 3 (document panel) | Phase 3B | `feat/ba-document-panel` | yes |
| QA Agent | Phase 4 | `feat/ba-qa-a11y` | yes |

Dev Reviewer runs after Phase 3 lands, before Phase 4 starts. Security check on every API surface (`skills/security.md`): IDOR prevention (file is scoped by `:id` + project membership), input validation (filename regex), no destructive operations.

## Risks / open questions

1. **`SidebarMenu.tsx` extraction** — current `ProjectDetailScreen.tsx` likely has the menu inline. Extracting is a refactor that should land in Phase 1 with a single small PR; if the extraction proves risky, fall back to adding the new item inline and revisit.
2. **Open-questions banner data source** — design says it deep-links to `prd.md` §11. Phase 2 endpoint parses frontmatter on read; no new schema. If parsing gets messy we fall back to a `project_meta` table row.
3. **Markdown renderer** — `background.html` shows headings/lists/tables/code/blockquote. Use `react-markdown` + `remark-gfm`. Add as a dep in Phase 3B.
4. **Sample project fixture for Playwright** — need a project with the full 17-file PRD tree on disk. Reuse `PRD/example/` as the seed; copy into a temp dir per test.

## Permission prompts (approve while away)

Add to `launcher/.claude/settings.json` and `launcher/.claude/settings.local.json` (project-scoped):

```json
{
  "permissions": {
    "allow": [
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(pnpm:*)",
      "Bash(yarn:*)",
      "Bash(playwright:*)",
      "Bash(curl:*)",
      "Bash(git:*)",
      "Bash(ls:*)",
      "Bash(find:*)",
      "Bash(grep:*)",
      "Bash(rg:*)",
      "Bash(mkdir:*)",
      "Bash(cp:*)",
      "Bash(mv:*)",
      "Bash(sed:*)",
      "Bash(awk:*)",
      "Bash(jq:*)",
      "Bash(tsc:*)",
      "Bash(vite:*)",
      "Bash(vitest:*)",
      "Bash(eslint:*)",
      "Bash(prettier:*)",
      "Bash(cat:*)",
      "Bash(head:*)",
      "Bash(tail:*)",
      "Bash(wc:*)",
      "Bash(diff:*)",
      "Bash(echo:*)",
      "Read(launcher/**)",
      "Read(design-system/**)",
      "Read(skills/**)",
      "Read(PRD/**)",
      "Read(coding/**)",
      "Read(workflows/**)",
      "Read(AGENTS.md)",
      "Read(CLAUDE.md)",
      "Read(idea.md)",
      "Read(FRAMEWORK-FLOW.md)",
      "Edit(launcher/src/**)",
      "Edit(launcher/server/**)",
      "Edit(launcher/testing/**)",
      "Edit(launcher/index.html)",
      "Edit(launcher/package.json)",
      "Edit(launcher/tsconfig*.json)",
      "Edit(launcher/vite.config.ts)",
      "Write(launcher/src/**)",
      "Write(launcher/server/**)",
      "Write(launcher/testing/**)",
      "Agent(general-purpose)",
      "Agent(Explore)"
    ],
    "deny": [
      "Bash(rm -rf /)",
      "Bash(rm -rf ~)",
      "Bash(rm -rf /Users/willnguyen/Documents/Claude coding)",
      "Bash(sudo:*)",
      "Bash(chmod 777:*)"
    ]
  }
}
```

Also enable:

- `Plan` agent (no extra permission — already in the registry).
- Workflows: not strictly needed for this scope; skip unless the user asks.

## Approval checklist for when you're back

1. Plan accepted as-is, or edits requested.
2. Phase 1 PR landed, sidebar item visible.
3. Phase 2 PR landed, endpoints respond on `curl`.
4. Phase 3 PRs merged, screen renders against fixture.
5. Phase 4 Playwright test green.
6. Dev reviewer cleared.
7. Ready to merge `feature/product-requirements-ui` into the main branch for the next stage.

## Next concrete action

Run this once you approve:

```
claude --worktree feat/ba-shell-tree-banner   # Code Agent 1 starts Phase 1 + 3A
claude --worktree feat/ba-server-ba-workspace # Code Agent 2 starts Phase 2 in parallel
claude --worktree feat/ba-document-panel      # Code Agent 3 starts Phase 3B after Phase 2 lands
```

QA Agent waits for all three PRs to be reviewed.
