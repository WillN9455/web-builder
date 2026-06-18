# Design Tokens

Design tokens are the atomic building blocks of the visual design system. Each token category lives in its own file and must be fully defined before any Code Agent begins implementation.

## Token Categories

| Category | File | Purpose |
|----------|------|---------|
| Colors | `color.md` | Brand colors, semantic colors, neutral palette |
| Typography | `typography.md` | Font families, sizes, weights, line heights, scales |
| Spacing | `spacing.md` | Horizontal/vertical rhythm, gap values, container widths |

## Rules for Design Agents

1. **Colors must be defined in CSS custom properties** — all values traceable to a PRD requirement
2. **Ask the user for brand colors** before defining the color palette (primary, secondary, accent)
3. **Typography scale follows 1.250 ratio** (Major Third) unless the PRD specifies otherwise
4. **Spacing scale is based on a 4px base unit**: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128
5. **All tokens must be CSS-implementable** — no platform-specific values
6. **Document every token with its semantic name AND the PRD section it satisfies**

## Downstream Consumers (where token values are used)

All component specs in `design-system/components/` must use these token names — never hardcode hex values. Code Agents fill template CSS files with computed values from the token definitions:

- [`code-builder/templates/nextjs-starter/app/globals.css`](../code-builder/templates/nextjs-starter/app/globals.css) → receives all color + typography tokens as `@layer base` custom properties
- [`code-builder/config-rules.md`](../../code-builder/config-rules.md) → brand colors from PRD input feed stack choice (primary/secondary determine branding tier)
- Each component spec file in `design-system/components/` → references specific token names in its CSS implementation notes
- QA Agent → contrast check against `skills/accessibility-guidelines.md` §Color & Contrast using computed values

## Output

Design agents produce:
- `design-system/<project>/tokens/tokens.css` — compiled CSS custom properties
- Each individual token file above as reference/spec
- A manifest file listing all tokens and their usage counts

**See also:** [`CLAUDE.md`](../../CLAUDE.md) Framework Flow Map for each token file's upstream inputs (PRD sections, user brand color input) and downstream consumers.
