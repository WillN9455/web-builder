# Accessibility Guidelines (WCAG 2.1 AA)

Accessibility requirements every Design Agent and Code Agent must enforce. This is not optional — these are hard constraints on every deliverable.

## Color & Contrast

- **Normal text**: minimum 4.5:1 contrast ratio against background
- **Large text** (18px bold / 24px regular): minimum 3:1 contrast ratio
- **UI components and graphics**: minimum 3:1 contrast ratio against adjacent colors
- Never use color alone to convey information (always pair with text, icon, or pattern)
- All interactive elements must have visible focus indicators (minimum 3:1 against surrounding)

## Keyboard Accessibility

- Every interactive element must be reachable and operable via keyboard alone
- Logical tab order that matches visual layout
- No keyboard traps — user can always navigate away
- Custom focus management for modals, drawers, tooltips
- Visible focus ring on all focusable elements (outline or box-shadow)
- Skip navigation link as first tab stop

## Screen Reader Support

- All images have meaningful alt text (empty alt for decorative images)
- Form inputs have associated `<label>` elements (visible or sr-only)
- Errors have `role="alert"` and are announced to screen readers
- ARIA roles, states, and properties used correctly (match native semantics where possible)
- Live regions for dynamic content updates
- Heading hierarchy is logical (h1 → h2 → h3, no skipping levels)

## Interactive Elements — Required States

Every clickable or selectable element MUST define all of these states:

| State | Visual Treatment | Screen Reader |
|-------|-----------------|---------------|
| Default | Normal appearance | `aria-disabled="false"` |
| Hover | Visual change (color, shadow, underline) | No announcement needed |
| Focus | Visible ring/outline | No announcement needed |
| Active | Pressed visual state | `aria-pressed` for toggle buttons |
| Disabled | Grayed out, cursor not-allowed | `aria-disabled="true"`, `tabindex="-1"` |
| Error | Red border/warning icon | `aria-invalid="true"`, error message announced |
| Loading | Spinner or skeleton | `aria-busy="true"` |

## Content & Layout

- All pages have a single `<h1>` that describes the page purpose
- Forms have clear labels (not just placeholders); placeholders don't replace labels
- Error messages explain what went wrong and how to fix it — don't just say "invalid"
- Form fields associate errors directly to the relevant input via `aria-describedby`
- Touch targets are minimum 44x44px on mobile

## Responsive & States

### Business Rule States
Different user contexts render different views:
- User with multiple items vs. single item vs. no items → different landing page content
- Empty states show actionable messaging, not just "no data"

### Framework States (must exist everywhere)
| State | Where it appears | Treatment |
|-------|----------------|----------|
| Error | Every API call, form submission, page load | Distinct error screen with recovery action |
| Loading | Page transitions, component fetches | Skeleton or spinner; never blank |
| Success | Form submissions, completions | Confirmation banner or screen |
| Empty | Lists, tables, dashboards | Actionable text + CTA to add content |
| Validation | Forms on submit or blur | Inline error message next to field |
| Edit | Dropdowns, selects, autocomplete | Sorted choices, search option, ellipsis for overflow |
| Interaction | Read-only, disabled, active, focus | Per the required states table above |

## Testing Requirements (QA Agent)

- Test keyboard-only navigation through every user flow
- Test with a screen reader (VoiceOver or NVDA) at minimum one critical path
- Check contrast ratios on all text/background combinations
- Verify responsive behavior at breakpoints: 375px, 768px, 1024px, 1440px
- Playwright tests must include `keyboard` test cases alongside `mouse` ones

## Related Files

| File | Relationship |
|------|-------------|
| [`../design-system/tokens/color.md`](../design-system/tokens/color.md) §Validation Checklist | Token contrast decisions (WCAG AA 4.5:1 for text, 3:1 for large text/UI) are the foundation; this skill defines what to build with those tokens |
| [`../design-system/states/interaction.md`](../design-system/states/interaction.md) required states table | Every interactive element state is defined here — this is the implementation spec that components must follow |
| [`../design-system/states/error.md`](../design-system/states/error.md) accessibility rules | `role="alert"` for error banners; focus management to first invalid field |
| [`../design-system/components/README.md`](../design-system/components/README.md) Component Rules §5 | Components must implement all states per this guideline — not just default/hover/focus but also disabled/error/loading |
| [`../design-system/states/validation.md`](../design-system/states/validation.md) accessibility rules | `aria-describedby` and `aria-invalid` linkage on form fields; focus management |
| `skills/ui-best-practices.md` §6 Accessibility | UI-specific accessibility rules (fieldset/legend for grouped inputs, heading hierarchy, icon-only aria-labels) — complementary to this skill's broader guidelines |
