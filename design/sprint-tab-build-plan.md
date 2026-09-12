# Sprint Tab Build Plan — feature/sprint-tab

**Status:** Approved for build (Will, 2026-09-09); **scope A + Jira auto-create + per-project board added (Will, 2026-09-11, decision 5)**.
**Owner:** Solution Architect. **Builder:** Code Agent 1 (Senior) in worktree `../launcher-wt-sprint/`. **Reviewer (code complete only):** Dev Reviewer 2.
**Related:** `design/sprint.html` (#s6 connected / #s6b connect), `design/sprint-requirements.md` (spec; this PR's acceptance criteria §10), `design/requirements-redesign.md` (slice 4 of the requirements redesign).

## Decisions (Will, 2026-09-09; decision 5 added 2026-09-11)

| # | Call | Decision |
|---|------|----------|
| 1 | Jira integration depth | **Real Jira** as designed: Atlassian REST, stored credentials, ~30s polling sync, 401/403/429/offline/409 states. **CSV export CTA is NOT built** ("no need", Will). The board connects to Jira; other board-kanban backends are post-PR. |
| 2 | Branch base | **origin/main** (option c from the plan Q2): board + Jira connector + settings page now. **No stacking** on `feature/requirements-redesign` (unmerged). Requirements consumption ports to the new model after that work merges — out of scope here. |
| 3 | "Generate user stories" | **Deferred at plan time — SUPERSEDED by decision 5 (2026-09-11).** Originally decision 4 of `requirements-redesign.md`, deferred out of this PR. |
| 4 | Isolation | Sibling worktree `../launcher-wt-sprint/` on `feature/sprint-tab` from `origin/main`. **Parked checkout (`feature/reopen-approved-artifacts`) stays untouched.** |
| 5 | **Story generation folds into THIS workstream → then auto-create Jira issues** (Will, 2026-09-11) | Scope **A**: user-story generation (BA Run 2) ships **as part of this work**, not a separate PR. After generation, the connector **auto-creates Jira issues** and the generated stories are **stored locally**. **Every project has its own board** — board ↔ Jira project is 1:1 (each project's board connects to its own Jira project / issuetype). Requirements-redesign slice 4 (story level, per-story ACs per decision 6r) is folded in here. |

### Scope-A detail (decision 5) — story generation slice, folded into this workstream

- **Generation (BA Run 2, slice 4):** "Generate user stories" button (Sprint tab) triggers BA-agent story generation from approved requirements/PRD/user journeys — gated on requirements being fleshed out (Run 1 done). Stories carry `reqs=` derived-from links **and their own `## Acceptance Criteria` section** (per-story AC-NNN items — requirements-redesign decision **6r**, on main since `8c15aa1`). Output is **stored locally** (on-disk generated stories, feature model FE-NN → derived stories).
- **Auto-create Jira issues:** after generation, the connector creates one Jira issue per generated story via the project's stored Jira credentials (Atlassian REST). Persist the Jira issue key ↔ local story mapping locally (in the project's local store), so state stays in sync without round-tripping through the board.
- **Separate board per project:** board ↔ Jira project/issuetype mapping is 1:1 per project. Every project gets its own board; the Edit/Connect-Jira panels (`#jira-config-panel`, `#connect-jira-form`) are per-project. No shared/cross-project board.
- **Story → Jira issue is the default path** (Will: "auto create jira issues via connector, store it locally and generate it"). The board's "+ Add issue" and drag flows operate on the locally-stored mapping, Jira is the source of truth via ~30s polling (decision 1).
- **Baseline prerequisite:** rebase `feature/sprint-tab` onto advanced main (`8c15aa1` + merged #30 model-default + merged #31 css-gate) **before** building the generation slice, so CA1 builds on the post-8c15aa1 requirements model (no `acs[]` on features).

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
- Jira webhooks (design uses ~30s polling)
- Non-Jira board backends
- ~ (BA story generation was a non-goal at plan time; **decision 5 (2026-09-11) folds it in** — it is now in scope, see "Scope-A detail" above.) ~

## Phases

1. **Server** — migration + `jira_link`; link CRUD endpoints; test-connection.
2. **Board UI** — `SprintScreen.tsx` dispatcher (#s6 / #s6b); topbar; sync banner ×3; keyboard-draggable 4-col Kanban; code-agent strip; Edit-Jira panel state machine; disconnect modal.
3. **States + a11y** — all §5 / §7 states (loading skeleton, empty, stale, failed, 401-403, 429, offline, 409); WCAG 2.1 AA checklist §6.
4. **Slice 4 — story generation + Jira auto-create (decision 5)** — BA Run 2 story generation (features model, per-story ACs per 6r); auto-create one Jira issue per generated story via connector; persist Jira-key ↔ story mapping **locally**; **separate board per project** (1:1 board ↔ Jira project/issuetype). Rebase `feature/sprint-tab` onto advanced main **before** this phase.
5. **Gates + PR** — `npm run typecheck` at branch tip (Node 24 only — ABI 137; never Node 22); PRD 17-file gate green; add `sprint.html` to the design-assets list in `CLAUDE.md` (currently missing); `gh pr create` (GitHub-hosted repo — do not use `buzz pr`); only then hand to Dev Reviewer 2.

## Gates (hard)

- `npm run typecheck` at branch tip — run from a clean `$` at the tip commit, not a mid-work tree
- PRD 17-file gate stays green
- `CLAUDE.md` design-assets list includes `design/sprint.html`
- WCAG 2.1 AA + all UI states rendered per spec §5/§6/§7
- Verify UI headlessly (DOM markers / API assertions) — never screenshot-read PNGs into context
- Node 24 (never 22)

## Sign-off chain

Solution Architect planned + set up worktree/branch → Code Agent 1 (Senior) implements → gates → Dev Reviewer 2 reviews once code complete → report `gh pr` link in thread `b1fb2167...`.
