# Code Builder Templates

Starter project scaffolds that each Code Agent can use as a base for the generated application. Templates are chosen based on the user's stack preferences defined in `config-rules.md`.

## Available Templates

| Template | Framework | Best For | Stack |
|----------|-----------|---------|-------|
| `nextjs-starter/` | Next.js 14+ (App Router) | SSR, SEO-heavy sites, most web apps | React + TypeScript + Tailwind |
| `vue-nuxt-starter/` | Nuxt 3 | Vue ecosystem teams, simpler apps | Vue 3 + TypeScript + Pinia |
| `sveltekit-starter/` | SvelteKit | Performance-critical, minimal JS | Svelte 4 + TypeScript |

## Template Structure (All Templates Share This)

```
project-root/
├── src/
│   ├── components/      # Shared UI components (from design-system)
│   ├── pages/           # Route-level pages
│   ├── hooks/           # Custom React hooks (Next.js) / composables (Nuxt)
│   ├── services/        # API service layer
│   ├── utils/           # Pure utility functions
│   ├── lib/             # Framework-specific utilities (Nuxt: modules)
│   └── styles/          # Global CSS, token imports
├── public/              # Static assets (favicons, SVGs)
├── tests/               # Unit + integration tests
├── .env.example         # Environment variable template
├── tailwind.config.js   # Design token configuration
└── tsconfig.json        # TypeScript configuration
```

## Template Selection Rules

When choosing a template, reference `config-rules.md` for the decision tree. Default to **nextjs-starter** unless the user specifies otherwise or their requirements strongly favor another option (e.g., existing Vue team → vue-nuxt-starter).

## How Code Agents Use Templates

1. Confirm tech stack with user via `config-rules.md` questions
2. Copy the chosen template into a new branch
3. Replace all placeholder tokens (`{{PROJECT_NAME}}`, `{{PRIMARY_COLOR}}`, etc.) with project-specific values
4. Implement features per PRD and design spec on top of the scaffold
