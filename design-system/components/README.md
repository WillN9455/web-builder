# Design System Components

Component specifications that every Code Agent must implement faithfully. Each component includes structure, states, tokens used, and accessibility requirements.

## How to Use This Directory

Each component lives in its own file. Design Agents define these components for the project. Code Agents implement them exactly as specified.

## Component Index

| Component | File | Where Used |
|-----------|------|------------|
| Button | `button.md` | CTAs, actions, navigation |
| Card | `card.md` | Content containers, data displays |
| Consent Banner | `consent-banner.md` | Cookie/analytics banners, consent dialogs, age-gates (PRD §6c) |
| Form Input | `form-input.md` | All user input fields |
| Navigation | `navigation.md` | Headers, footers, sidebars, breadcrumbs |

## Component Rules (All Components)

1. **Every component must accept the `variant` prop** to switch between visual variants defined in the spec
2. **Every component must define all interaction states** from [`states/`](../states/) directory — each state file has color tokens, layout rules, and ARIA requirements that the component spec must reference
3. **All tokens from [`tokens/`](../tokens/) directory are required inputs** — components reference them, never hardcode values; see token README for which colors map to which usage
4. **Each component file must include**: props API, variant table, state table, accessibility notes (per `skills/accessibility-guidelines.md` required states table), and a CSS implementation note listing exact token names used
5. **Components are CSS-implementable only** — if a design requires JavaScript to achieve, flag it explicitly

## Cross-Reference Map: Component → Token → State

| Component | Color tokens used | Spacing tokens used | Typography tokens used | Required states (from `states/`) | Related PRD section (design source) |
|-----------|-------------------|---------------------|-----------------------|----------------------------------|-------------------------------------|
| `button.md` | brand-primary 50–900, brand-secondary 50–900, semantic success/error/warning/info, neutral palette | spacing-4 through spacing-128 (padding, gaps) | All sizes for label text (sm–3xl) | Default, hover, focus, active, disabled, error (`error.md`), loading (`loading.md`) — see `interaction.md` required states table | CTA / action features in PRD §8 User Stories |
| `consent-banner.md` | surface-elevated (bg), neutral-200 (border), warning-500 (opt-out stripe), error-50 (save-failure tint) | spacing-3 through spacing-8 (padding, gap, radius) | sm–base for body/title | Default, hover, focus, disabled (loading during save), error (save failed) — consent semantics per `consent.md`; age-gate adds focus-trap modal state | PRD §6c (consent surfaces) + §6d (locale-aware copy) |
| `card.md` | neutral-50/100 (bgs), surface-default/elevated (borders/shadows) | spacing-8 through spacing-48 (padding, gap) | All sizes for headings/body | Default, hover, focus — see `interaction.md`; empty state (`empty.md`) when card content is absent | Data display / list features in PRD §8 |
| `form-input.md` | semantic success/error/info/warning (validation), brand-primary (focus ring), neutral-200/400 (borders) | spacing-2 through spacing-16 (padding, label-gap) | All sizes for labels + input text | Default, focus (`interaction.md`), error (`error.md`), validation (`validation.md`) — all per `interaction.md` states table | Form features in PRD §8; see also `skills/ui-best-practices.md` §7 form rules |
| `navigation.md` | brand-primary (active indicator), neutral palette, surface-default/elevated | spacing-4 through spacing-32 (nav-height, gaps) | All sizes for nav labels, breadcrumbs, headings | Default, hover, focus (`interaction.md`) — all per `interaction.md` required states table; `loading.md` during page transitions | Header/footer/sidebar features in PRD §6 UX Principles |
