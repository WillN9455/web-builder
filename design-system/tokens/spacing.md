# Spacing Tokens

Define horizontal/vertical rhythm, gap values, and container widths. All spacing derives from a 4px base unit.

## Token Structure

```
--ds-space-<name>
```

## Space Scale

| Token | Value (px) | Value (rem) | Usage |
|-------|-----------|-------------|-------|
| `--ds-space-1` | 4px | 0.25rem | Tight gaps, icon padding |
| `--ds-space-2` | 8px | 0.5rem | Button padding min-width |
| `--ds-space-3` | 12px | 0.75rem | Component internal spacing |
| `--ds-space-4` | 16px | 1rem | Default padding, list gaps |
| `--ds-space-6` | 24px | 1.5rem | Section padding |
| `--ds-space-8` | 32px | 2rem | Card padding (default) |
| `--ds-space-12` | 48px | 3rem | Layout section gaps |
| `--ds-space-16` | 64px | 4rem | Hero/content blocks |
| `--ds-space-24` | 96px | 6rem | Page margins on large screens |
| `--ds-space-32` | 128px | 8rem | Wide-content containers |

## Container Widths

| Token | Max Width | Usage |
|-------|----------|-------|
| `--ds-container-sm` | 640px | Narrow content (blogs, forms) |
| `--ds-container-md` | 768px | Standard layouts |
| `--ds-container-lg` | 1024px | Dashboards, data-heavy pages |
| `--ds-container-xl` | 1280px | Desktop-first applications |
| `--ds-container-2xl` | 1536px | Wide dashboards, media layouts |

## Gap Tokens (for Flexbox/Grid)

| Token | Value | Usage |
|-------|-------|-------|
| `--ds-gap-xs` | 4px | Tight list items |
| `--ds-gap-sm` | 8px | Navigation items |
| `--ds-gap-md` | 16px | Card grids, form rows |
| `--ds-gap-lg` | 24px | Section separators |
| `--ds-gap-xl` | 32px | Page column gutters |

## Responsive Spacing Adjustments

| Screen | Page Margin | Section Gap | Card Padding |
|--------|------------|-------------|-------------|
| 375px (mobile) | space-4 | space-6 | space-6 |
| 768px (tablet) | space-8 | space-8 | space-8 |
| 1024px+ (desktop) | space-12 | space-12 | space-8 |
| 1440px+ (wide) | center with max-width | space-12 | space-8 |

## Validation Checklist

- [ ] All spacing uses token values — no hardcoded pixel/rem values in components
- [ ] Mobile-first responsive adjustments documented
- [ ] Container widths match breakpoint strategy in `states/responsive.md`
- [ ] Minimum touch target padding is 44px on mobile (space-6 or larger)
