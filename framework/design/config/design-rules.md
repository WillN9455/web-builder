# Design Rules (rules in force)

Edits from the Design tab Rules half write back to this file. The Design
Agent reads it on every run; changes take effect on its next run.

## Brand & tone

- Palette direction: derived from the project's `design-system/tokens/color.md` — semantic tokens first (success / warning / danger / info), brand accents second, never ad-hoc hex
- Typography direction: type scale comes from `design-system/tokens/typography.md`; no sizes outside the scale
- Voice: product copy is sentence case, plain language, no jargon in user-facing strings; error copy states what happened and the recovery action

## Layout rules

- Density: comfortable default; compact only for data-dense screens (tables, logs)
- Breakpoints: mobile-first — 375px, 768px, 1024px, 1440px (matches shared general-best-practices)
- Grid: 4px base unit; spacing values come from `design-system/tokens/spacing.md` only
- Device widths to preview: 375px (mobile), 768px (tablet), 1440px (desktop) — every story is previewed at all three before Design complete

## Interaction rules

- Motion: subtle and functional only (150–250ms ease-out); no decorative animation
- Feedback: every user action gets visible feedback within 100ms (loading, optimistic UI, or toast)
- Loading behavior: skeleton patterns per `design-system/states/loading.md`; never a blank pane
- Every interactive element implements the states in `design-system/states/interaction.md` (default / hover / focus / active / disabled / focus-visible)

## Design review bar (what counts as "design complete")

- All interaction states documented for every component touched (error, loading, success, empty, validation, disabled, focus)
- WCAG 2.1 AA pass: contrast ≥ 4.5:1 body text, ≥ 3:1 large text and UI components; keyboard nav documented
- Design constraints honored: CSS-implementable only, SVG over raster, proper layer naming
- Peer review: a second design agent has reviewed; open disagreements resolved or escalated to the user
- Handoff artifacts exist: component specs in `design-system/components/`, state docs updated, tokens final

## Per-agent design guidelines

Overrides for individual design agents go here (one `## Design Agent <X>` block per agent).
The launcher's Design tab Rules half appends/edits these blocks.