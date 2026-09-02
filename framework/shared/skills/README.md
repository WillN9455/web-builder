# Shared skills — rule bodies

- `general-best-practices.md` — cross-cutting practices every stage consults
- `security.md` — security rule body (Build enforces; QA and Review audit)

**Rule:** a skill body lands here only when two or more stages consume it.
Single-stage skills live in that stage's `skills/` folder. Consumers keep a
thin binding file in their own `skills/` that points here and adds
stage-specific enforcement notes — the binding file, not this body, is what
the stage's Rules tab edits.

Candidates to watch: `accessibility-guidelines.md` and `ui-best-practices.md`
currently have one consumer (Design). If QA or Review starts consuming either,
the body moves here and Design keeps a binding file.