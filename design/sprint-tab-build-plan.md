# Sprint Tab Build Plan — feature/sprint-tab

**Status:** Approved for build (Will, 2026-09-09).
**Owner:** Solution Architect. **Builder:** Code Agent 1 (Senior) in worktree `../launcher-wt-sprint/`. **Reviewer (code complete only):** Dev Reviewer 2.
**Related:** `design/sprint.html` (#s6 connected / #s6b connect), `design/sprint-requirements.md` (spec; this PR's acceptance criteria §10), `design/requirements-redesign.md` (slice 4 of the requirements redesign).

## Decisions (Will, 2026-09-09)

| # | Call | Decision |
|---|------|----------|
| 1 | Jira integration depth | **Real Jira** as designed: Atlassian REST, stored credentials, ~30s polling sync, 401/403/429/offline/409 states. **CSV export CTA is NOT built** ("no need", Will). The board connects to Jira; other board-kanban backends are post-PR. |
| 2 | Branch base | **origin/main** (option c from the plan Q2): board + Jira connector + settings page now. **No stacking** on `feature/requirements-redesign` (unmerged). Requirements consumption ports to the new model after that work merges — out of scope here. |
| 3 | "Generate user stories" | **Deferred** — decision 4 of `requirements-redesign.md`. Not in this PR. The button/surface may be reserved but must not invoke a stub generation flow. |
| 4 | Isolation | Sibling worktree `../launcher-wt-sprint/` on `feature/sprint-tab` from `origin/main`. **Parked checkout (`feature/reopen-approved-artifacts`) stays untouched.** |

## Design inputs (copied into this worktree — intentionally part of this PR)

`design/sprint.html`, `design/sprint-requirements.md` were committed 2026-08-28 (dc85a08) on `feature/reopen-approved-artifacts` (PR #27), which is **not yet on main**. They were copied in so this branch builds against its own spec and the PR is self-contained. Content is identical to #27's copy, so the eventual merge is a non-issue in either order.

## Scope

**Connected (#s6):**
- Jira board header — "Jira board", project name ("Tenant Maintenance Portal"), "Jira connection · Last synced 12s ago"
- Topbar: search, Filter, Sprint chip, "+ Add issue"
- Sync banner (3 variants incl. stale / failed, per `sprint-requirements.md` §4 FR-2)
- 4-column Kanban — keyboard-draggable cards, `aria-live` move feedback
- Code-agent strip — "Build board | Code agents working now"
- Board / Backlog toggle
- Edit-Jira panel (`#jira-config-panel`): fields `jk2/ju2/ja2/jt2`, selects `js2/jauto2`; prefilled; `locked → saving → saved | error` state machine; Esc returns focus to the cog ("Board settings — edit Jira connection for this board")
- Disconnect → confirm modal ("Disconnect")
- "Open in Jira ↗"

**Not connected (#s6b):**
- Connect Jira form (`#connect-jira-form`: `jk/ju/ja/jt`, selects `js/jauto`); buttons "Connect Jira →" ×2, "Help"; cog = "Board settings — connect Jira for this board" (gate-locked tab before: `aria-disabled="true"`)
- "After you connect" promo

## Server

- `jira_link` table + migration (per-project, single link)
- `GET /api/projects/:id/jira/link` · `PATCH ...` · `DELETE ...` (spec §4 FR-6)
- `POST .../jira/link/test` (test-connection)
- Board read-model: story list for the Kanban (mirrors `server/requirements.ts` pattern) — **no Jira client call needed for the board itself until real sync is wired**; sync/status fields reflect the live connection state per design.

## Status-only tab (documented exception)

Per `sprint-requirements.md`, Sprint is **status-only — no Rules half**. This is a recorded exception to the repo's two-halves working rule (`CLAUDE.md`). Do **not** invent an editable rules surface.

## Non-goals (this PR)

- CSV export path (dropped by Will)
- BA story generation / "Generate user stories" trigger
- Jira webhooks (design uses ~30s polling)
- Non-Jira board backends

## Phases

1. **Server** — migration + `jira_link`; link CRUD endpoints; test-connection.
2. **Board UI** — `SprintScreen.tsx` dispatcher (#s6 / #s6b); topbar; sync banner ×3; keyboard-draggable 4-col Kanban; code-agent strip; Edit-Jira panel state machine; disconnect modal.
3. **States + a11y** — all §5 / §7 states (loading skeleton, empty, stale, failed, 401-403, 429, offline, 409); WCAG 2.1 AA checklist §6.
4. **Gates + PR** — `npm run typecheck` at branch tip (Node 24 only — ABI 137; never Node 22); PRD 17-file gate green; add `sprint.html` to the design-assets list in `CLAUDE.md` (currently missing); `gh pr create` (GitHub-hosted repo — do not use `buzz pr`); only then hand to Dev Reviewer 2.

## Gates (hard)

- `npm run typecheck` at branch tip — run from a clean `$` at the tip commit, not a mid-work tree
- PRD 17-file gate stays green
- `CLAUDE.md` design-assets list includes `design/sprint.html`
- WCAG 2.1 AA + all UI states rendered per spec §5/§6/§7
- Verify UI headlessly (DOM markers / API assertions) — never screenshot-read PNGs into context
- Node 24 (never 22)

## Sign-off chain

Solution Architect planned + set up worktree/branch → Code Agent 1 (Senior) implements → gates → Dev Reviewer 2 reviews once code complete → report `gh pr` link in thread `b1fb2167...`.
