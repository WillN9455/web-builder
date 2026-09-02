# Build Rules (rules in force)

Edits from the Build tab Rules half write back to this file. Code Agents
C1–C3 read it on every run; changes take effect on their next run.
Stack selections here drive the Configurations card; stack-specific guidance
lives in `config-rules.md` (same folder).

## Build architecture (agents read this on every run)

| Layer | In force | Notes |
|-------|----------|-------|
| FE | React 18 + Vite + TS *(edit per project)* | App-router file organization per `../skills/coding-guidelines.md` |
| BFF | Express (Node) — or "None — FE → BE direct" | Route handlers only; no business logic in FE |
| BE | Node 22 + Express (route handlers) | Swap per project: Fastify / .NET 8 / Go / FastAPI / Rails |
| DB | SQLite (better-sqlite3) — or Postgres (Neon/Supabase) | Migration strategy required before first migration lands |
| Host | Vercel (FE) · Fly.io (BFF + BE) | Environments below must map to real deploy targets |

Changing a layer here updates the stack-aware Configuration section — e.g.
picking `.NET 8` swaps in EF Core migrations, `dotnet test`, MSBuild gates.

## Configurations

**Common (applies to every stack):**

- E2E: Playwright (Chromium minimum; browsers per `qa/config/test-rules.md`)
- Env files: `.env.local` · `.env.{dev,stg,prod}` — committed examples only, real values in the host secrets store
- Secrets handling: host secrets store, never in the repo (shared security §9)
- CI gates: lint + test + typecheck on every PR

**Stack-aware:** FE/BFF/BE/DB/Host-specific configuration is derived from the
architecture table above — the Build tab renders only the fields relevant to
the chosen stack.

## Build lifecycle

- Branch naming: `feature/<story-id>-<slug>`; one story per branch; worktree per agent when in parallel
- Commit/PR conventions: conventional commits; PR links the story ID; description lists files changed, tests added, skills applied
- Merge gates: CI green + reviewer approval; no self-merge on stories with a security or a11y dimension
- Rework: QA fail / review fail → story returns to the rework queue with evidence (screenshot, trace, nits) — fix, re-PR, re-QA

## Environments

- `dev` — local; seeded data reset on demand
- `staging` (QA env) — deployed from Build on PR merge; seeded data reset on every QA run; QA pass required to advance
- `prod` — promoted manually after QA sign-off; never auto-deployed

## Deployment rules

- CI/CD: deploy on merge to main for staging; prod is a manual promotion step
- Hosting constraints follow the Host row above; environment variables configured per environment in the host, never in-repo

## Per-agent guidelines

Overrides for C1/C2/C3 go here (one `## Code Agent <N>` block per agent). The
Build tab Rules half appends/edits these blocks; the shared loadout in
`../agents/README.md` stays the default.