# Partials map

`app.scss` `@use`s these partials in the list below — that chain **is** the
original rule order of the former `app.css` (cascade order is behavior; do not
reorder without running `scripts/verify-css-equivalence.mjs`).

The partials are **contiguous line ranges of the original file, in original
order** — not topic groupings. Grouping by topic would interleave selectors
and change the compiled cascade (this is why `heading` styles live in
`_layout.scss` and skeleton styles live in `_projects.scss`).

| Partial | Source range in pre-split `app.css` | Covers |
|---|---|---|
| `../tokens.scss` | `tokens.css` verbatim + `$tokens` map | Runtime `:root` custom properties (unchanged), compile-time mirror map (consumed from phase B) |
| `_layout.scss` | 1–147 | File header comment, two-column `.app` frame, topbar, section heading |
| `_projects.scss` | 148–438 | Screen 1: active-now tiles, pipeline ring + legend, all-projects table, loading/error skeletons |
| `_intake.scss` | 439–976 | Screens 7–9: new-idea flow, chat screen, chat sidebar (interview progress `.chat-side .step`), captured step, responsive collapse |
| `_shared-ui.scss` | 977–1136 | Delete-project flows: destructive button variants, popover menu, modal, toast, keyframes |
| `_empty-state.scss` | 1137–1162 | Screen 2 empty state (standalone — kept its own tiny partial) |
| `_project-menu.scss` | 1163–1337 | Screen 3: per-project sidebar, count chip, locked-gate tabs |
| `_background.scss` | 1338–1974 | BA workspace (background.html s12–s14), State D confirmation view, its responsive block |
| `_requirements.scss` | 1975–2418 | Screen 15 requirements tab: filter bar, story groups, rows, inline form, origin chips, file status |
| `_icons.scss` | *new* (N3 consolidation) | The one declared exception to byte-equality: `fe-icon` mixin over `.req-action svg`, `.req-add-bar .btn-primary svg`, `.req-empty .btn-primary svg` — appended last, after the requirements rules |

Baseline commit for the equivalence gate: `5c08322` (the last commit that
contained `app.css` / `tokens.css`).

## Selector homes worth knowing

- **`.step`** — today lives only in `_intake.scss`, always scoped as
  `.chat-side .step` (interview progress list). When the Overview stepper
  styles arrive (`_stepper.scss`, phase C), they must carry a parent scope
  that disambiguates them from the chat-side stepper — map both homes here.
- **Icons** — the shared stroke convention (`fe-icon` mixin, width 1.8,
  round cap + join) is in `_icons.scss`. The JSX still carries per-icon
  presentation attributes; the CSS layer is the consistency authority (CSS
  presentation rules win over SVG presentation attributes).
- **Shared mixins** live in `../_mixins.scss`; partials `@use '../mixins'`
  and include through the `mixins.*` namespace. The mixin contract is
  output-identical expansion — a mixin adoption never moves a selector or
  reorders declarations, and the equivalence gate proves it per-commit:
  - `fe-icon($width)` — shared SVG stroke convention (see Icons above).
  - `fe-focus-ring($color)` — keyboard focus ring; include inside a
    `:focus-visible` / `:focus` rule.
  - `fe-panel($border, $radius, $shadow)` — the shared white-surface card
    recipe (`background: tokens.$white; border: 1px solid $border;
    border-radius: $radius;` + optional shadow). Adopt **only** where the
    site already emits declarations in exactly that order — the gate is
    byte-level, so reordering inside a block is a delta even when inert.
  - `fe-below($bp)` — max-width media query; breakpoint values live only in
    the `$breakpoints` map in `../tokens.scss` (`md: 980px` today), never as
    bare px literals in a partial.
- **Section heading** styles sit inside `_layout.scss` (they precede the
  screen-1 banner in the original file); they are not a partial of their own.
- **Skeletons** sit inside `_projects.scss` for the same reason.
- **Delete flows** (modal, popover, toast, destructive buttons) sit inside
  `_shared-ui.scss` even though they appear on several screens — they were
  one contiguous block in the original file.