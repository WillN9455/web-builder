# templates/ — starter scaffolds (top-level)

Lives **outside** every stage folder. Reason: templates are reused across
build/templates, but also inspected at intake time (the Idea Hub needs to
preview a "starter" before the user even picks a stage). The Build stage
*references* this one, it does not *own* it.

| File | Purpose | Written by |
|---|---|---|
| `nextjs-starter/` | Scaffold the Build stage fills with tokens | Framework maintainers |
| `docs/` | Template selection rules the launcher reads | Framework maintainers |

See `framework/manifest.json` → `templates` for the export wiring.