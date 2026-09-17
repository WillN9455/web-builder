# Design Tab — Build Plan (SA2)

**Date:** 2026-09-17 · **Author:** Solution Architect 2 · **Handover:** Code agent 2 (Senior) build → Dev Reviewer 2 review
**Amendment 2026-09-17:** DR2 plan-level security review (F-1…F-6) folded into §3/§6 — SA verified F-1 (validateBaseUrl weakness) and F-4/F-6 (board.ts project-scoping pattern) against source on `origin/feature/sprint-tab` before adopting; all six accepted as written. CA2 builds against this amended plan.
**Inputs:** `launcher/design/design-tab.html` (1969 ln, § D list + § E story detail + § F empty state), `launcher/design/design-story-requirements.md` (v5.5, 469 ln — overrides the mockup where they conflict), `launcher/design/sitemap.md` lines 570–673 (Design tab + Story detail contracts), CLAUDE.md repo rules.

## 1. Branch + sequencing decision (SA call)

**Branch `feature/design-tab`, stacked on `feature/sprint-tab` @ `ab1b8b8` (PR #29 tip) — NOT off origin/main.**

Why: the Design journey is per-story, and the story spine (`PRD/stories.md` US-NN grammar + `kanban_card` read model) only exists on PR #29. On post-#28 main, the requirements model is feature-first (`FE-NN` blocks in `features.md`; `user-journeys.md` US-NN blocks are legacy/migrated) — there is no canonical story list on main. Building the Design tab on features or a duplicate parser guarantees rework the moment #29 merges. PR #29 is SA-converged + DR2-approved at tip, so the stack is low-risk.

Constraints that make the rebase mechanical:
- **Zero edits to sprint-owned files** (`server/story-gen.ts`, `server/board.ts`, `server/jira-link.ts`, sprint client/scss). Design tab is purely additive: new server module, new client components, new scss partial.
- When #29 merges → rebase `feature/design-tab` onto main, re-run all gates at the tip, then open the PR (`gh pr create --base main`, GitHub-hosted — not `buzz pr open`).
- If Will rejects #29's approach wholesale (unlikely), the design server module is independent enough to re-home.

## 2. Scope (v5.5)

Two screens + rules half:

1. **Design list** `/projects/:id/design` — summary stats (counts by design status), in-body status filter pills (All · In design · Peer review · Done — mockup § D body pills **stay**), story rows (id · status pill · title · assignee · `Open story →` row-open button, `data-story` attr, no `.ds-stepper`), design-agent strip (display-only). Rules half via the Status/Rules switch: editable design rules writing back to the project's `design-system/` folder.
2. **Story detail** `/projects/:id/design/:storyId` — back arrow top-left (`aria-label="Back to Design list"`, returns + scrolls source row into view `.story-row.selected`), story header card (`Mark design complete →`, `Request changes` in Peer review only; disabled with `aria-disabled` + fade outside valid states), linked requirement card (left), Add design source card (right, always visible), 4-state preview toggle (Default · Loading · Error · Success) + iframe, linked source card (Replace + Remove → ConfirmDialog → empty state), **Notes thread (human-post-only, replaces the A↔B peer review — no avatars, no disagreement callout)**.
3. **Empty state (§ F / DSGN-11)** — centered empty state, disabled toggle group + compose (`aria-disabled="true"`, `tabindex="-1"`), `Add Figma link` as primary CTA.

### v5.5 overrides of the mockup (requirements doc wins)
- Topbar on every Design screen: **back arrow only** — no search / filter / export / `+ New design rule` buttons (AC-11).
- Notes thread replaces A↔B peer review on story detail (FR-8).
- Rules-half callout: `padding-top` ≥ 16px, **no** `View design-system/` button (AC-13).
- Mockup doc-title / doc-meta / TOC items (AC-14/15) are mockup-document checks, not app checks — headless harness verifies rendered app markers instead.

### Out of scope (v5.5 — do not build)
Real Figma embed (iframe srcdoc/local render only) · drag-and-drop upload (file picker only) · multi-source per story · agent-posted notes · source thumbnails · custom preview states · source version history. Open questions §9 are pre-decided: no confirm modal on Mark design complete, fixed 4 states, standard ConfirmDialog on Remove, no @mentions in notes.

## 3. Server (`server/design.ts`, new — mounted in `server/index.ts` after board routes)

| Route | Behavior |
|---|---|
| `GET /api/projects/:id/design/stories` | Story list from `PRD/stories.md` (reuse #29's story parser — export it from `story-gen.ts` or a shared module; do not re-parse with new grammar) joined with `design_story` state + `kanban_card` (jira key, board status). Requirement links from story meta `reqs=BR-NNN,TR-NNN` resolved to titles via `requirements-model.ts`. |
| `GET /api/projects/:id/design/:storyId` | Story + linked requirement card data + source + notes. 404 unknown story (grammar-validate `:storyId` against `US-\d{2,}` first — mirror `afae9ec` pattern). |
| `POST /api/projects/:id/design/:storyId/source` | `{type:'figma', url}` or `{type:'html', filename, content}`. **Figma (DR2 F-1): dedicated `validateFigmaUrl` — do NOT mirror `validateBaseUrl`** (jira-link's check is http(s)-scheme + creds-rejection only; `https://evil.example.com` passes it). Requirements: https only, host is `figma.com` or ends `.figma.com`, path starts `/file/` or `/design/` → else 422 with the spec's message (design-story-requirements.md:343/345). **HTML (DR2 F-5): server-side enforcement** — 422 on non-`.html`/`.htm` extension, byte cap (spec: 5 MB), reject `../` and NUL in filename, `path.resolve` into the project source store + prefix containment (same guard as rules write-back). JSON body, no multipart dependency. |
| `DELETE /api/projects/:id/design/:storyId/source` | Removes the source (write-back, not destructive delete of story). |
| `POST /api/projects/:id/design/:storyId/notes` | `{body}` — **DR2 F-3: storage purity enforced server-side**: reject bodies containing `<` (422) so storage is guaranteed plain-text (FR-8 is markdown-safe: `**bold**`, `*italic*`); renderer escape-then-markdown, never `dangerouslySetInnerHTML` on raw body. |
| `POST /api/projects/:id/design/:storyId/transition` | `{to}` validated against the design-status enum; 409 invalid transition; flipping to `ready_for_dev` also updates the local `kanban_card` read-model when a card exists (Jira push out of scope — sprint slice 4 owns Jira sync). **DR2 F-4: the card UPDATE must re-scope `WHERE id = ? AND project_id = ?`** (board.ts:244 pattern) — design_status lives in scoped `design_story`, the card is a second table; without the re-check a crafted card id touches another project's card. |
| `GET`/`PUT /api/projects/:id/design/rules` | Read/write design rules to the project's `design-system/` folder (`design-system/design-rules.md`). Path resolved via the project-dir mechanism only — never invent paths; traversal-guarded; size cap. |

Storage: new sqlite tables in `server/db.ts` following the `kanban_card`/`jira_link` pattern —
- `design_story` (project_id, story_id, design_status, source_type, source_value, source_meta, updated_at) — design_status enum CHECK: `not_started | in_design | peer_review | design_complete | ready_for_dev` (map to pill labels In design / Peer review / Design complete / Ready for development).
- `design_note` (project_id, story_id, author, body, created_at).
- If a CHECK rebuild migration is ever needed, follow the `jira_link 'pending'` temp-table rebuild pattern from PR #29 — `CREATE TABLE IF NOT EXISTS` keeps old CHECKs forever.

**DR2 F-6 — IDOR / per-project scoping on every design route (the operative RBAC — web-builder's rbac-matrix is still the 4-line placeholder):** every route does `parseProjectId(req.params.projectId)` → null → reject (board.ts:158/172/215 pattern), and every read/write carries `WHERE project_id = ?`. `GET design/stories` and `GET design/:storyId` must scope the story lookup by project_id (JOIN/WHERE) so a storyId belonging to another project 404s — never returned, never rendered.

## 4. Client

- `App.tsx`: explicit routes `/projects/:id/design` + `/projects/:id/design/:storyId` declared before the `:tab` catch-all (same as existing explicit tab routes). Gating: the existing `ProjectTabScreen` gate logic applies — Design is a gated tab.
- `src/components/design/DesignScreen.tsx` — status half (stats, filter pills, story rows, agent strip) + rules half (Status/Rules switch, rules editor with Save → `PUT design/rules`).
- `src/components/design/DesignStoryScreen.tsx` — full story detail incl. 4-state toggle (ArrowLeft/Right/Home/End roving focus, visible 4px focus ring, `aria-live="polite"` on the preview body), source attach/replace/remove, notes compose.
- `src/lib/api.ts` — design fetchers; surface 422/404/409 distinctly.
- `src/styles/partials/_design.scss` — additive partial only (css-equivalence gate is now a **selector-order-preservation** check post-#31 — additive keeps it green). Port classes from `design-tab.html` § D/E/F.
- WCAG 2.1 AA + all UI states (loading/empty/error/success/validation/focus) per repo rule 4.

## 5. Gates (all at the committed tip, Node 24 only)

1. `npm run typecheck`
2. `npm run verify:requirements` (217/0 baseline preserved)
3. `npm run verify:css-equivalence`
4. Headless walk of the real app — fresh seed (`db:reset`/`db:seed`), own port (**5184 is another session's server; use 5194-style private port; `lsof` the port first, kill stale spawns**), puppeteer-core + cached Playwright Chromium, script in the project dir, wait for rendered markers. Cover: list render + filter pills, drill-down routing + back-arrow row-highlight, 4-state toggle keyboard + aria-live, Figma attach → populated transition, source replace/remove → empty state, notes post, Mark design complete state flip, rules edit → save → disk write-back verify, deep-link to unknown story → 404 state. **Disk-verify destructive endpoints** (assert the file/table mutation, not the 200).

## 6. Risks (SA-R, pre-flagged for Dev Reviewer 2)

- **SA-R-01** Stacked on #29: rebase conflicts if #29 moves again. Mitigation: zero-touch on sprint files; mechanical rebase plan in §1.
- **SA-R-02** Projects with no `stories.md` (sprint slice 4 never run): Design list must render an empty state, **no fallback to features/journeys** — story source divergence is the exact rework this plan avoids.
- **SA-R-03** `server/index.ts:464` on main carries a committed literal NUL byte — grep-based edits silently become binary matches. Use `command grep -a`/python for searches; if that region is touched, restore the `\x00` as an ASCII escape, do not "fix" the file.
- **SA-R-04** Stored-XSS surface: user-supplied HTML source renders in the preview iframe → **DR2 F-2: iframe `sandbox` denies BOTH `allow-same-origin` AND `allow-scripts`** (also no `allow-forms` / `allow-top-navigation`) — with `allow-scripts` a `<script>` inside the srcdoc executes (origin-null but free to phone home). If HTML sources are ever served via GET later: `X-Content-Type-Options: nosniff` + `sandbox` response header, never a same-origin navigable page. Figma URL via dedicated `validateFigmaUrl` (F-1); notes `<`-rejection + escape-then-markdown (F-3); traversal/extension/size guards on upload + rules write-back (F-5).
- **SA-R-05** `kanban_card` cross-write from the design transition endpoint must stay read-model-local (no Jira API call) — Jira sync belongs to sprint slice 4; double-writes would fight its reconcile logic.

## 7. Handover order

1. Code agent 2 (Senior): build per §2–§5 on `feature/design-tab` stacked @ `ab1b8b8`; commit the plan doc (`design/design-tab-build-plan.md`) as the first commit on the branch; push + `gh pr create` (draft ok) when gates are green; report the PR link in this thread.
2. Dev Reviewer 2: review at the pushed tip (worktree HEAD == PR head), security lens per §6 + the standard checklist.