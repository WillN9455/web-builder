# Button Component

## Props API

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'primary'` | Visual style variant |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size variant |
| `disabled` | `boolean` | `false` | Disabled state |
| `loading` | `boolean` | `false` | Shows spinner, disables interaction |
| ` fullWidth` | `boolean` | `false` | Takes full container width |
| `children` | `ReactNode` | — | Button label text |

## Variants

| Variant | Background | Text Color | Border | Hover | Use Case |
|---------|-----------|-----------|--------|-------|----------|
| Primary | brand-primary-500 | white | none | brand-primary-700 | Main CTA on page |
| Secondary | transparent | brand-primary-500 | 1px brand-primary-200 | brand-primary-100 bg | Alternate action |
| Ghost | transparent | neutral-600 | none | neutral-200 bg | Tertiary/de-emphasized |
| Danger | error-500 | white | none | error-700 | Destructive actions |

## Sizes

| Size | Padding (h/v) | Font Size | Min Width | Icon Size |
|------|--------------|-----------|-----------|-----------|
| sm | 6px 12px | var(--ds-font-size-sm) | auto | 14px |
| md | 10px 20px | var(--ds-font-body) | auto | 16px |
| lg | 14px 32px | var(--ds-font-size-lg) | auto | 20px |

## Required States

| State | Background | Text | Border | Cursor | Tabindex | Screen Reader |
|-------|-----------|------|--------|--------|----------|--------------|
| Default | per variant | per variant | per variant | pointer | 0 | — |
| Hover | variant shade -10% | adjusted | same | pointer | 0 | — |
| Focus-visible | ring +2px brand-primary-500 | same | same | pointer | 0 | — |
| Active/Pressed | variant shade +10% | same | same | pointer | 0 | aria-pressed for toggles |
| Disabled | neutral-200 | neutral-400 | neutral-300 | not-allowed | -1 | aria-disabled="true" |
| Loading | per variant (opacity 0.7) | same | same | wait | 0 | aria-busy="true" |

## Accessibility

- Minimum touch target: 44x44px on mobile
- Focus ring must be visible at all times (2px solid, 3:1 contrast against surrounding)
- Loading state must include `aria-label` with loading description
- Danger variant must always have confirmatory behavior for destructive actions
- Keyboard accessible: Enter and Space both activate

## CSS Implementation Notes

```css
/* Button base */
background: var(--btn-bg, transparent);
color: var(--btn-color, inherit);
border: var(--btn-border, none);
font-family: var(--ds-font-family-sans);
font-size: var(--btn-size, var(--ds-font-body));
padding: var(--btn-padding, 10px 20px);
min-height: var(--btn-min-h, 40px);
min-width: var(--btn-min-w, 44px); /* mobile touch target */
cursor: pointer;
transition: background 150ms ease, color 150ms ease;
border-radius: var(--ds-space-2);

/* Focus ring */
&:focus-visible {
  outline: 2px solid var(--ds-color-brand-primary-500);
  outline-offset: 2px;
}
```

## Token Mapping (which tokens each variant uses)

| Variant | Color tokens (from `tokens/color.md`) | Spacing token (from `tokens/spacing.md`) | Typography (from `tokens/typography.md`) |
|---------|---------------------------------------|------------------------------------------|----------------------------------------|
| Primary | brand-primary-500 (bg), white (text), brand-primary-700 (hover) | padding: space-1.5/space-4 | font-sm / body / lg per size row |
| Secondary | brand-primary-500 (text/border), brand-primary-100 (hover bg) | Same as primary | Same as primary |
| Ghost | neutral-600 (text), neutral-200 (hover bg) | Same as primary | Same as primary |
| Danger | error-500 (bg), white (text), error-700 (hover) | Same as primary | Same as primary |

## Related Files

| File | Relationship |
|------|-------------|
| [`../tokens/color.md`](../tokens/color.md) §Brand Palette + Semantic Palette | All color tokens for each variant |
| [`../tokens/spacing.md`](../tokens/spacing.md) | Padding values (space-1.5, space-3, space-6, space-8) |
| [`states/error.md`](../states/error.md) | Danger variant error border/icon rules for destructive actions |
| [`states/loading.md`](../states/loading.md) | Spinner overlay CSS on button during in-flight requests |
| [`states/interaction.md`](../states/interaction.md) required states table | Every state the button must implement (default/hover/focus/active/disabled/error/loading) |
| [`skills/accessibility-guidelines.md`](../../skills/accessibility-guidelines.md) §Interactive Elements Required States | Minimum touch target 44x44px, focus ring contrast, keyboard activation |
| [`skills/ui-best-practices.md`](../../skills/ui-best-practices.md) §3 | Success feedback pattern for confirmation banners after button-triggered actions |
