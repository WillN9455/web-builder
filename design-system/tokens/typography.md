# Typography Tokens

Define font families, sizes, weights, and scales. All values must be achievable with web-safe fonts or Google Fonts (or specified self-hosted fonts).

## Token Structure

```
--ds-font-<category>-<name>
```

Categories: `family`, `size`, `weight`, `line-height`, `letter-spacing`

## Font Families

| Token | Value | Usage |
|-------|-------|-------|
| `--ds-font-family-sans` | '"Inter", system-ui, -apple-system, sans-serif' | Body text, UI |
| `--ds-font-family-mono` | '"JetBrains Mono", "Fira Code", monospace' | Code, data tables |
| `--ds-font-family-heading` | *<TBD, ask user preference>* | Page headings only |

> **Design Agent Rule:** Ask the user for heading font preference. Default to using the sans-serif family if none specified.

## Type Scale (Major Third — 1.250)

| Token | Size (rem) | Size (px) | Weight | Line Height | Usage |
|-------|-----------|-----------|--------|-------------|-------|
| `--ds-font-size-xs` | 0.75rem | 12px | 400 | 1.5 | Captions, helper text |
| `--ds-font-size-sm` | 0.875rem | 14px | 400 | 1.5 | Labels, small body |
| `--ds-font-body` | 1rem | 16px | 400 | 1.625 | Body text (default) |
| `--ds-font-size-lg` | 1.25rem | 20px | 400 | 1.5 | Subheadings |
| `--ds-font-size-xl` | 1.563rem | 25px | 500 | 1.4 | Section headings |
| `--ds-font-size-2xl` | 1.953rem | 31px | 500 | 1.3 | Page headings (h2) |
| `--ds-font-size-3xl` | 2.441rem | 39px | 600 | 1.3 | Large section headings (h1) |
| `--ds-font-size-4xl` | 3.052rem | 49px | 600 | 1.2 | Hero/headline text |

## Font Weights

| Token | Value | Usage |
|-------|-------|-------|
| `--ds-font-weight-normal` | 400 | Body text, labels |
| `--ds-font-weight-medium` | 500 | Semi-bold for emphasis, buttons |
| `--ds-font-weight-semibold` | 600 | Subheadings, h2-h3 |
| `--ds-font-weight-bold` | 700 | Headings, strong emphasis |

## Letter Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--ds-font-tracking-tight` | -0.025em | Large headings |
| `--ds-font-tracking-normal` | 0em | Body text (default) |
| `--ds-font-tracking-wide` | 0.025em | Uppercase labels, badges |

## Token Composition Examples

```css
/* Heading 1 */
font-family: var(--ds-font-family-heading);
font-size: var(--ds-font-size-3xl);
font-weight: var(--ds-font-weight-bold);
line-height: 1.2;
letter-spacing: var(--ds-font-tracking-tight);

/* Body text */
font-family: var(--ds-font-family-sans);
font-size: var(--ds-font-body);
font-weight: var(--ds-font-weight-normal);
line-height: 1.625;
```

## Validation Checklist

- [ ] All fonts are web-available (Google Fonts, CDN, or self-hosted)
- [ ] Font files total < 200KB per variant (performance check)
- `@font-face` includes font-display: swap
- [ ] Fallback stack matches each primary family
- [ ] Type scale is mathematically consistent (1.250 ratio or PRD-specified ratio)
- [ ] All headings use semibold (600) or bold (700) — never regular for heading text
