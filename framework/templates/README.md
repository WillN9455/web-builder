# templates/ — starter scaffolds (top-level)

Lives **outside** every stage folder. Reason: templates are consumed before
stage assignment — the Idea Hub previews a "starter" at intake time, before
the user even picks a stage. The Build stage *references* this folder, it
does not *own* it (`build/README.md` § Inputs).

| File | Purpose | Written by |
|---|---|---|
| `nextjs-starter/` | Scaffold the Build stage fills with tokens | Framework maintainers |
| `docs/` | Template selection rules the launcher reads | Framework maintainers |

See `framework/manifest.json` → `templates` for the export wiring.