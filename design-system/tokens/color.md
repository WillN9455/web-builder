# Color Tokens

Define the complete color palette before design or implementation begins.

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

- [ ] Every brand color passes WCAG AA contrast (4.5:1 for text, 3:1 for large text/UI)
- [ ] Semantic colors are distinguishable by non-color cues (icon, pattern)
- [ ] Color palette supports both light and dark modes if required
- [ ] All tokens documented with CSS custom property names
- [ ] PRD section mapped to each color decision
