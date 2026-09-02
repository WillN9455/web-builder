# Color Tokens

Define the complete color palette before design or implementation begins.

**Cross-references:** Inputs from [`idea.md`](../../idea.md) (§Overall — user brand colors); PRD Section 6 UX Design Principles (brand tone → color selection); `skills/accessibility-guidelines.md` §Color & Contrast (WCAG AA constraint on all semantic colors). Outputs consumed by: all component specs in `design-system/components/`; QA Agent contrast audit; [`code-builder/templates/nextjs-starter/app/globals.css`](../../framework/templates/nextjs-starter/app/globals.css) compilation.

## Token Structure

Each token follows this naming convention:
```
--ds-color-<category>-<name>-<shade>
```

Categories: `brand`, `neutral`, `semantic`, `surface`

## Required Tokens

### Brand Palette (ask user for these)

| Token | Value | Usage |
|-------|-------|-------|
| `--ds-color-brand-primary-50` | <TBD> | Backgrounds, hover states |
| `--ds-color-brand-primary-100` | <TBD> | Light interactive elements |
| `--ds-color-brand-primary-500` | <TBD> | Primary buttons, links, active states |
| `--ds-color-brand-primary-700` | <TBD> | Text, borders, icons |
| `--ds-color-brand-primary-900` | <TBD> | Headings, dark overlays |
| `--ds-color-brand-secondary-*` | Same scale | Secondary CTAs, accents |

### Neutral Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--ds-color-neutral-50` | #FAFAFA | Page backgrounds |
| `--ds-color-neutral-100` | #F5F5F5 | Card backgrounds |
| `--ds-color-neutral-200` | #E5E5E5 | Borders, dividers |
| `--ds-color-neutral-400` | #9CA3AF | Placeholder text |
| `--ds-color-neutral-600` | #4B5563 | Secondary text |
| `--ds-color-neutral-800` | #1F2937 | Primary text |
| `--ds-color-neutral-900` | #111827 | Headings, high-emphasis content |

### Semantic Palette (WCAG AA required)

| Token | Value | Usage | Minimum Contrast |
|-------|-------|-------|-----------------|
| `--ds-color-success-500` | #059669 | Success messages, checkmarks | 3:1 on light bg |
| `--ds-color-success-700` | #047857 | Success text, icons | 4.5:1 |
| `--ds-color-warning-500` | #D97706 | Warning banners | 3:1 on light bg |
| `--ds-color-warning-700` | #B45309 | Warning text | 4.5:1 |
| `--ds-color-error-500` | #DC2626 | Error borders, icons | 3:1 on light bg |
| `--ds-color-error-700` | #B91C1C | Error text, links | 4.5:1 |
| `--ds-color-info-500` | #2563EB | Info banners, links | 3:1 on light bg |
| `--ds-color-info-700` | #1D4ED8 | Info text | 4.5:1 |

### Surface Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--ds-color-surface-default` | White / neutral-50 | Page background |
| `--ds-color-surface-elevated` | White | Cards, modals, drawers |
| `--ds-color-surface-inverted` | neutral-900 | Dark sections |

## Validation Checklist

- [ ] Every brand color passes WCAG AA contrast (4.5:1 for text, 3:1 for large text/UI) — check against [`skills/accessibility-guidelines.md`](../../framework/design/skills/accessibility-guidelines.md) §Color & Contrast rules
- [ ] Semantic colors are distinguishable by non-color cues (icon, pattern) — required per `accessibility-guidelines.md` "Never use color alone" rule
- [ ] Color palette supports both light and dark modes if required — check PRD §6 UX Design Principles for mode requirements
- [ ] All tokens documented with CSS custom property names
- [ ] PRD section mapped to each color decision

## Related Files

| File | Relationship |
|------|-------------|
| [`typography.md`](./typography.md) | Typography uses brand-primary colors for links, active states — must maintain contrast after pairing |
| [`spacing.md`](./spacing.md) | Spacing tokens used with elevated surfaces (neutral-50 → neutral-100 depth) |
| `states/error.md` | Semantic error colors (error-500/error-700) define error state borders and text |
| `states/success.md` | Semantic success colors (success-500/success-700) define success state colors |
| `states/info.md` (if exists) | Semantic info colors (info-500/info-700) for informational banners |
| [`components/button.md`](../components/button.md) | Button primary/secondary variants use brand-primary/brand-secondary palette |
| [`components/form-input.md`](../components/form-input.md) | Form field borders, focus rings, validation colors use semantic and neutral palette |
| [`skills/ui-best-practices.md`](../../framework/design/skills/ui-best-practices.md) §2 Error States | Error color must pair with `role="alert"` for screen reader announcement |
