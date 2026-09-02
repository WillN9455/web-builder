<!-- binding: ../../shared/skills/security.md (rule body lives there) -->
# Security (QA binding)

The security **rule body** lives at `../../shared/skills/security.md` — Build
enforces it, QA and Review audit against it, so no stage owns the definition.

**QA-stage enforcement notes** (this file is the QA tab's to edit):

- The QA Agent turns the shared rule into executable evidence: `authz.spec.ts`
  and `idor.spec.ts` trace directly to the shared rule's §IDOR prevention.
- Security test failures are blockers, never warnings.