# Interaction State Reference

## Edit States (Dropdowns, Selects, Autocomplete)

### Dropdown / Select

| Property | Requirement |
|----------|------------|
| Option sorting | Alphabetical A-Z by default; sortable if the PRD specifies a different sort order |
| Long text overflow | Truncate with ellipsis (`text-overflow: ellipsis`) after ~60 characters or 2 lines |
| Search option | Only when there are > 15 options OR the PRD specifies searchable |
| Max visible without scrolling | 8 items before scrollbar appears |
| Multiselect | Show selected as chips; "select all" header if checkbox variant |

### Autocomplete / Combobox

| Property | Requirement |
|----------|------------|
| Trigger | Begins typing (min 2 characters) or focus + down arrow |
| Results | Up to 10 results; "No results" state if nothing matches |
| Keyboard navigation | Arrow keys to navigate, Enter to select, Escape to close |
| Highlighting | Matched portion of text highlighted in bold within results |

## Interaction States (All Elements)

### Required States Table

Every clickable/selectable element must implement all states below:

| State | Visual Treatment | Screen Reader | Focus Management |
|-------|-----------------|---------------|-----------------|
| Default | Normal appearance per component spec | `aria-disabled="false"` | Tab order position |
| Hover | Visual change (color shift, underline, shadow) or increased opacity | No announcement needed | — |
| Focus-visible | 2px ring, offset 2px, minimum 3:1 contrast vs surrounding | No announcement needed | Ring visible on all focusable elements |
| Active/Pressed | Background darkens or shifts, text shifts down 1px | `aria-pressed` for toggle buttons | — |
| Disabled | Grayed out (neutral-200 bg), cursor: not-allowed, opacity 0.6 | `aria-disabled="true"`, tabindex="-1" | Removed from tab order |
| Error | Red border (2px error-500) or red background tint (error-50) | `aria-invalid="true"` + error message announced via role=alert | Focus on first error element on submit |
| Loading | Content dims (opacity 0.5), spinner overlay, interaction blocked | `aria-busy="true"` | Interaction disabled while loading |

### Hover State Rules

| Element Type | Hover Treatment |
|-------------|-----------------|
| Button | Background shifts ±10% from base variant color |
| Link | Underline appears (if not already underlined); text color shifts to brand-primary-700 |
| Card | Shadow increases; if interactive, cursor: pointer |
| Nav item | Bottom border or background highlight on current section |
| Input field | Border color shifts to brand-primary-500 |

### Focus State Rules

| Rule | Implementation |
|------|---------------|
| All focusable elements must have visible focus ring | `outline: 2px solid var(--ds-color-brand-primary-500); outline-offset: 2px;` |
| Focus ring contrast ≥ 3:1 against surrounding background | Verified in token design |
| No `outline: none` without replacement | Custom focus styles required if default outline doesn't match design |
| Focus moves logically through tab order | Matches visual reading order (top→bottom, left→right) |
| Skip navigation link is first tab stop | `<a href="#main" class="skip-link">Skip to main content</a>` |

### Read-Only State

| Property | Value |
|----------|-------|
| Background | white (same as editable) |
| Border | 1px neutral-200 (same as default, no hover effect) |
| Cursor | default (not text) — indicates not editable |
| `tabindex` | `-1` if standalone; `0` if part of form group |
| Screen reader | `aria-readonly="true"` |

### Disabled State

| Property | Value |
|----------|-------|
| Cursor | `not-allowed` for buttons/inputs; `default` for text |
| Opacity | 0.6 (reduced visibility) |
| Background | neutral-100 or neutral-200 depending on element type |
| Text color | neutral-400 (for labels/links) or neutral-600 (for body text) |
| Border | neutral-300 |
| `pointer-events` | none (on container-level disabled groups) |
| `tabindex` | -1 (removed from tab order) |
| Screen reader | `aria-disabled="true"` |

### Active / Pressed State

| Property | Value |
|----------|-------|
| Background | Base color shifted darker (~10%) |
| Transform | `translateY(1px)` for button press effect |
| Shadow | none or reduced shadow |
| Duration | 50-100ms transition (fast feel) |

## State Transition Timing

| Transition | Duration | Easing |
|-----------|----------|--------|
| Color changes | 150ms | ease-out |
| Width/height/scale animations | 200ms | ease-in-out |
| Modal/dialog open/close | 250ms | ease-out (open), ease-in (close) |
| Tooltip appearance | 100ms | ease-out |
| Loading spinner rotation | 800ms per full rotation | linear |

## Cross-References

### Color tokens used (from `tokens/color.md`)
| Token | Shade | Where used |
|-------|-------|-----------|
| `--ds-color-brand-primary-500` | brand variant | Focus ring, link hover color, nav active indicator |
| `--ds-color-brand-primary-700` | brand variant | Link hover text color |
| `--ds-color-neutral-100` | `#F5F5F5` | Disabled button bg |
| `--ds-color-neutral-200` | `#E5E5E5` | Disabled button (stronger), tooltip border, hover bg |
| `--ds-color-neutral-300` | (implied) | Disabled border |
| `--ds-color-neutral-400` | `#9CA3AF` | Disabled text |

### Rules governing this state
| Rule source | Specific requirement |
|-------------|---------------------|
| [`skills/accessibility-guidelines.md`](../../skills/accessibility-guidelines.md) §Interactive Elements Required States | Every clickable/selectable element MUST define all states: default/hover/focus/active/disabled/error/loading — with exact screen reader announcements per the table |
| [`skills/accessibility-guidelines.md`](../../skills/accessibility-guidelines.md) §Keyboard Accessibility | All interactive elements reachable via keyboard; focus ring ≥3:1 contrast against surrounding; skip navigation link as first tab stop |
| [`skills/ui-best-practices.md`](../../skills/ui-best-practices.md) §6 Accessibility | All interactive elements must be Tab-reachable and operable by Enter/Space; use `<button>` not `<div onClick>`; fieldset/legend for grouped inputs; aria-describedby for field errors |

### Components that implement all required states
| Component (from `components/`) | States table reference | Notes |
|-------------------------------|----------------------|-------|
| `button.md` | Required States table (§32–40) — 7 states: default/hover/focus/active/disabled/loading | Also implements error state via danger variant + loading overlay |
| `card.md` | Default/hover (interactive cards); loading via skeleton; empty state per `empty.md`; error via error-boundary | Non-interactive cards only need default state |
| `form-input.md` | Required States table (§40–48) — 7 states: default/focus/hover/disabled/readonly/error/filled | Plus validation variant per `validation.md` |
| `navigation.md` | Required States table (§101–109) — default/hover/focus/active-disabled for all nav items | Mobile menu adds drawer state (open/close animation timing from §92–100) |

### Downstream consumers (QA test mapping)
| Test type | Playwright file | What it tests | Traces to PRD section |
|-----------|-----------------|--------------|----------------------|
| State test | `features/<feature>/states.spec.ts` | All required states for each component verified: hover shows, focus visible, disabled blocked, error displays | Component specs (`components/*.md`) + this file's states table |
| A11y test | `features/<feature>/a11y.spec.ts` | Focus ring contrast ≥3:1; skip-nav link present; keyboard navigation through all interactive elements; no focus traps | `skills/accessibility-guidelines.md` §Keyboard Accessibility + §Focus |

### PRD input triggers
- PRD Section 6 UX Principles: "Interactions with each clickable element" section defines per-element behavior
- PRD Section 12 Assumptions: any assumptions about touch target requirements (e.g., "target audience uses mobile devices")
