<!-- migrate-from: skills/security.md + skills/security-guidelines.md (consolidate both) -->
# Security (shared — Build enforces, QA and Review audit)

> **Rule body lives here.** Build (implementation), QA (authz/IDOR tests), and
> Review (audit) all consume this rule, so no single stage owns it. Stage
> folders keep thin binding files that point here and add stage-specific
> enforcement notes.

> **v2 draft stub.** Content migrates from repo-root `skills/security.md` and
> `skills/security-guidelines.md` (consolidated into one rule) once the
> migration lands. Known consumers today: the Code Agents (implementation),
> `testing/authz.spec.ts` + `idor.spec.ts` (QA), and `design-system/forbidden.md`
> §IDOR prevention cross-references it.