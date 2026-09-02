<!-- binding: ../../shared/skills/security.md (rule body lives there) -->
# Security (Build binding)

The security **rule body** lives at `../../shared/skills/security.md` — Build
enforces it, QA and Review audit against it, so no stage owns the definition.

**Build-stage enforcement notes** (this file is the Build tab's to edit):

- Code Agents apply the shared rule at implementation time: input validation,
  authz checks on every mutation, no secrets in client code.
- The shared rule's §IDOR prevention section is binding on every feature that
  touches user-scoped data (see `design-system/forbidden.md` cross-refs).