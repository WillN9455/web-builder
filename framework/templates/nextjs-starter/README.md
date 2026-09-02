# nextjs-starter

Scaffoldable Next.js 14 (App Router) + TypeScript + Tailwind starter. The
Build stage's Code Agents copy this tree as the base of a new project — see
[`../docs/template-selection.md`](../docs/template-selection.md) and
`../../build/config/config-rules.md` for the selection rules.

## What's wired

- `app/globals.css` — design tokens compiled from the project's
  `design-system/tokens/` (brand / neutral / semantic palettes, type scale,
  spacing). Regenerate when tokens change; never edit the token blocks by hand.
- `app/layout.tsx` — metadata placeholders (`{{PROJECT_NAME}}`,
  `{{DESCRIPTION}}`, `{{PRIMARY_FONT}}`), skip-navigation link, landmark
  structure.
- `tailwind.config.js` — every color/font maps to the CSS custom properties in
  `globals.css`; no hardcoded hex anywhere.
- `next.config.mjs` — security headers per the shared security body §7
  (minimum viable set).
- `.env.example` — secrets template; real values live in the host secrets store.

## Scaffold steps

1. Copy this folder into a new branch as the project root.
2. Replace every `{{PLACEHOLDER}}` token (`{{PROJECT_NAME}}`,
   `{{PROJECT_NAME_SLUG}}`, `{{PRIMARY_FONT}}`, `{{DESCRIPTION}}`,
   `{{PRIMARY_COLOR}}` palette rows in `globals.css`).
3. All color values come from the project's `design-system/tokens/color.md`,
   typography from `typography.md`, spacing from `spacing.md`.
4. `npm install && npm run dev` to verify the scaffold boots before any
   feature work starts.

## Roadmap starters

`vue-nuxt-starter/` and `sveltekit-starter/` are planned but not in the tree —
the manifest's `templates` key only promises this folder.