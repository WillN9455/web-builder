# Review Rules (rules in force)

Edits from the Agents tab Reviewer panel (Rules half) write back to this
file. The Reviewer Agent reads it on every run.

## Review bar per stage

What counts as "pass" — the Reviewer audits stage outputs against the rules
in force for that stage:

- **BA output** — PRD complete per template: §8 user stories testable, supporting docs (nfr-catalog, rbac-matrix, data-flow) present; open questions resolved or listed with owners
- **Design output** — all interaction states documented, tokens used (no ad-hoc hex), a11y pass recorded, peer review resolved
- **Build output** — PR scoped to one story; tests per PRD §8 acceptance criteria; security checklist (`../../shared/skills/security.md`) walked; no debug code; CI green
- **QA output** — evidence complete (run output, screenshots, traces); a11y 100%; verdict traceable to PRD story numbers

## Severity ladder

| Severity | Definition | Consequence |
|----------|-----------|-------------|
| Blocker | Security hole, data loss, RBAC/IDOR gap, a11y failure, broken core flow | Must fix before merge/deploy — forces rework round-trip |
| Major | Design drift, missing state, unhandled error path, missing tests for a PRD criterion | Forces rework round-trip |
| Minor | Nit: naming, comment density, small polish | Noted on the PR; does not block |

## Evidence rules — what a critique must cite

Every critique cites its evidence, or it does not stand:

- **File + line** for code critiques
- **Test name + output** for correctness critiques
- **Screenshot / trace** for UI and a11y critiques (QA evidence path)
- **PRD section** for requirements critiques
- **Design file** (component spec or state doc) for fidelity critiques

"Feels off" is not a review comment. If you cannot cite it, ask a question instead.

## Per-agent guidelines

Overrides for the Reviewer Agent go here. The Agents tab Reviewer panel
appends/edits these blocks.