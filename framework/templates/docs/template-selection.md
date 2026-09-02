# Template selection rules (Build stage)

Starter project scaffolds that each Code Agent can use as a base for the generated application. Templates are chosen based on the user's stack preferences defined in [`../../build/config/config-rules.md`](../../build/config/config-rules.md).

## Available Templates

| Template | Framework | Best For | Stack |
|----------|-----------|---------|-------|
| `nextjs-starter/` | Next.js 14+ (App Router) | SSR, SEO-heavy sites, most web apps | React + TypeScript + Tailwind |
| `vue-nuxt-starter/` | Nuxt 3 *(roadmap — not yet in the tree)* | Vue ecosystem teams, simpler apps | Vue 3 + TypeScript + Pinia |
| `sveltekit-starter/` | SvelteKit *(roadmap — not yet in the tree)* | Performance-critical, minimal JS | Svelte 4 + TypeScript |

The manifest's `templates` key only promises `nextjs-starter/` — the roadmap rows are intentionally not in the contract until they exist.

## Template Structure (All Templates Share This)

```
project-root/
├── app/                 # Route-level pages (App Router)
├── src/
│   ├── components/      # Shared UI components (from design-system)
│   ├── hooks/           # Custom React hooks
│   ├── services/        # API service layer
│   ├── utils/           # Pure utility functions
│   ├── lib/             # Framework-specific utilities
│   └── styles/          # Global CSS, token imports
├── public/              # Static assets (favicons, SVGs)
├── tests/               # Unit + integration tests
├── .env.example         # Environment variable template
├── tailwind.config.js   # Design token configuration
└── tsconfig.json        # TypeScript configuration
```

## Template Selection Rules

When choosing a template, reference `../../build/config/config-rules.md` for the decision tree. Default to **nextjs-starter** unless the user specifies otherwise or their requirements strongly favor another option (e.g., existing Vue team → vue-nuxt-starter, once it exists).

### Cross-references for template selection
| config-rules section | Template file | What it fills in |
|------------------------|---------------|-----------------|
| Frontend Framework table → "React + Next.js" | [`../nextjs-starter/app/layout.tsx`](../nextjs-starter/app/layout.tsx) | SSR setup, App Router structure |
| Database table → PostgreSQL/MongoDB | `../nextjs-starter/` DB config file | Connection string from PRD §3 Dependencies; user credentials from `.env.example` |
| Hosting Platform table → Vercel/Netlify | `../nextjs-starter/` deployment config | Edge region, build output, runtime config |
| API Communication table → REST/GraphQL | `../nextjs-starter/app/` route structure | Route pattern per coding-guidelines.md file organization |

## How Code Agents Use Templates

1. Confirm tech stack with user via `../../build/config/config-rules.md` questions
2. Copy the chosen template into a new branch
3. Replace all placeholder tokens (`{{PROJECT_NAME}}`, `{{PRIMARY_COLOR}}`, etc.) with project-specific values — **all color values must come from the project's `design-system/tokens/color.md`**, all typography from `typography.md`, all spacing from `spacing.md`
4. Implement features per PRD and design spec on top of the scaffold — each feature maps to a user story in PRD §8 + a component from the project's `design-system/components/README.md` index
5. Every skill file (coding-guidelines, security, accessibility, code-quality, feature-fidelity, ui-best-practices) must be applied during scaffold fill and feature implementation

## Template → Skill Mapping

Skill files live in `../../build/skills/` unless noted.

| File in template | Skill file that governs it | Specific rules |
|-----------------|---------------------------|---------------|
| `app/layout.tsx` | `coding-guidelines.md` (naming, components) + shared `security.md` §Headers & Configuration | Component organization; security headers |
| `globals.css` / token imports | project `design-system/tokens/README.md` + `color.md` + `typography.md` | All custom properties match token names and values |
| `src/components/` files | `feature-fidelity.md` §Read the Design First; project `ui-best-practices.md` (all sections) | Each component traces to a design spec in the project's `design-system/components/`; all states from state docs implemented |
| `src/services/` files | shared `security.md` (all rules); `code-quality.md` (§search before creating, atomic DB ops, timezone rules) | Auth guards first; IDOR prevention; validation schemas; no predictable IDs |
| `tests/` files | [`../../qa/skills/testing-guidelines.md`](../../qa/skills/testing-guidelines.md) §Test File Organization | Test naming per PRD user story (#N); every test traces to a requirement |
