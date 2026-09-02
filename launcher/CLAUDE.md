# Idea Hub — Launcher

The **launcher** is the front-end + API for the Idea-to-Web-Solution framework (the parent repo, `../`). It does two things at once:

1. **Web builder** — takes a business idea and drives it through the framework pipeline (Intake → Requirements → Design → Build → Review → QA → Deployed) to a shipped web app.
2. **Control console** — every stage tab is both a *status view* and an *editable rules surface*. Edits made in the UI **write back to the relevant on-disk project folder** (the framework's `project-dir.txt` workspace-root mechanism), so the agents that run each stage pick up the changes. The launcher is how a human *steers* the agents, not just watches them.

This is the guiding intention for everything in this repo: the launcher is a project information hub **and** a steering console. When you build or touch any screen, ask "what does this show?" **and** "what does this let the user steer?"

## Stack
- **Web:** Vite + React 18 + TypeScript, `react-router-dom` v6, fetchers in `src/lib/api.ts`.
- **API:** Express + `better-sqlite3`, run with `tsx watch server/index.ts`.
- **Run:** `npm run dev` (web + api together). **Build:** `npm run build`. **Typecheck:** `npm run typecheck`.
- **DB scripts:** `npm run db:reset` / `db:wipe` / `db:seed`.

## Workspace root — where artifacts live
The launcher does **not** store project artifacts inside itself. It reads/writes the project folder resolved by the parent framework's `project-dir.txt` (see `../CLAUDE.md` § Workspace Root). If `project-dir.txt` is absent, fall back to the parent repo. **Never invent a project path.** This is what makes the "control console" real: UI edits persist to the project's on-disk `PRD/`, `design-system/`, etc., and the agents read those files.

## Routes (current)
`/` → `/projects` · `/new` (intake: FolderPick → Chat → Captured) · `/projects/:id` (project detail with the per-project sidebar below).

## Per-project model — 10 tabs + one gate
A project has a per-project sidebar with 10 tabs. **Project Background is the gate**: until the project context is confirmed, the downstream tabs stay locked.

| Tab | Visible | Purpose |
|---|---|---|
| Overview | always | Status dashboard (stage, current-stage panel, activity, artifacts). One dynamic tab, three states: active / blocked / done (Deployed). Default landing. |
| Project Background | always | BA workspace — 17 PRD artifacts across 5 bands, reviewed file-by-file (Draft → In Review → Returned → **Approved**). **The gate.** |
| Requirements | always | Source of truth by user story. Always visible; grows as Project Background is reviewed. |
| Sprint | unlocked at confirmation | The Jira board. Creates Jira stories from completed requirements; master story-status tracker across all stages. |
| Design | unlocked at confirmation | Design agent's design journey + output. |
| Build | unlocked at confirmation | Build config + architecture: build rules, deployment rules, environments, coding guidelines, build lifecycle, architecture (FE/BE/BFF/DB/host), stories-in-build stats, rework queue (failed QA/review). |
| Agents | always | Agent roster / status. |
| QA | unlocked at confirmation | QA stats, tests per story, screenshot confirmations/issues, tools, rules, testing framework. |
| Activity | always | Activity feed. |
| Artifacts | always | Artifact list. |

**The gate (two-step):** (1) a user transitions all 17 Project Background docs to **Approved**; (2) a dedicated **"Project context ready"** confirmation view lets the user confirm the whole context. That confirmation fires a **one-shot unlock** of Sprint + Design + Build + QA and finalizes Requirements. Auto-unlock does **not** fire on the last file approval.

## Story lifecycle — Jira story status is the spine
`Requirements complete → Sprint creates Jira stories → human BA reviews → Design → "Ready for development" → Developer agent (Build) → "Ready for review" → Review agent → "Ready for QA" → QA agent → "In QA" → tests → pass = deployed to QA env / fail = back to Build rework queue.`

The **Sprint tab is the master board** (every story, every status); Design/Build/QA each show the slice of stories currently in that stage plus their editable rules.

## Stage + status model (global — applies to every project page)
- **7 pipeline steps, 8 stage keys:** Intake · Requirements · Design · Build · Review · QA · Deployed. The Requirements step has two sub-states: `Requirements` (intake chat completed, idea captured, PRD not started) and `PRD` (requirements documents in progress).
- **5 statuses:** active · blocked · on_hold · cancelled · done.
- Canonical source: `design/sitemap.md` § Global conventions.

## Working in this repo — rules
1. **Design before code.** Mockups + page contracts in `design/` are the source of truth. Do not implement a screen that hasn't been designed.
2. **Write-back, never delete.** Edits in a stage tab persist to the project's on-disk folder. Never delete files/rows to "reset" — insert throwaway data to test destructive paths (memory: smoke-test-safety).
3. **Every stage tab has two halves** — a status/info half and an editable rules half. When you build a stage tab, wire both; the rules half writes to disk.
4. **WCAG 2.1 AA + all UI states** (loading, empty, error, success, validation, focus) on every screen — see `../skills/`.
5. **Match the design exactly** — read `design/sitemap.md` page contracts and the relevant mockup before touching code.
6. **Follow the parent framework** — `../CLAUDE.md`, `../skills/`, `../AGENTS.md` govern agent behavior, security, accessibility, and code quality.

## Design assets (in `design/`)
- `sitemap.md` — **canonical site map & page contracts** (entry · purpose · zones · state · actions · exit · decisions · open items), one contract per screen/tab in route order. This is the source of truth for the launcher's structure.
- `plan.md` — pointer stub. The changelog-layered v5.2 app plan is preserved verbatim as `plan.archived.md` for history; `sitemap.md` replaces it.
- `plan.archived.md` — the v5.2 app plan (changelog-layered, archived). Read only for history.
- `mockups.html` — visuals for screens 1–11. Screen-divider comments now match the `id="s1"…s11"` anchors; navigate by anchor.
- `background.html` — Project Background (screens 12–14). Labels reconciled: "Mark Completed ✓" → "Approve ✓", status "Completed" → "Approved".
- `requirements.html` — Requirements (screen 15).
- `PROJECT-BACKGROUND-BUILD-PLAN.md` — focused build plan for the Project Background slice (file map, 7 endpoints, phases).
- `restructure-brief.md` — handoff for the sitemap restructure; includes a Restructure log at the end recording what was done.

## Current build state
- **Built:** `ProjectsScreen`, `Topbar`, `ProjectTile`, `ProjectTable`, `PipelineRing`, `EmptyState`, `Skeletons`, `ConfirmDialog`, `NewIdeaScreen` (FolderPick/Chat/InterviewProgress/Captured), `ProjectDetailScreen` (v5 placeholder menu).
- **In progress** (branch `feature/product-requirements-ui`): Project Background tab.
- **Not started:** Sprint, Design, Build (redefined), QA tabs, Requirements (15).