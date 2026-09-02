# Shared — cross-stage skill bodies

Skills that apply to more than one stage live here instead of being copied
into every stage folder. Stages declare them in `manifest.json` as inputs.

**Settled (rev 2):** the old flat repo-root `skills/` pool does not survive the
export — stage-first nesting won. `shared/` holds only genuinely cross-stage
**rule bodies** under the 2+-consumer rule; consumers keep thin binding files
in their own `skills/`. See `shared/skills/README.md`.