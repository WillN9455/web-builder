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
