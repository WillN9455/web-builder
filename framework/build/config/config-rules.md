# Code Builder Configuration Rules

How to choose tech stack, hosting, and tooling based on user input.

## Stack Selection Decision Tree

### Frontend Framework
| Need | Choose | Why |
|------|--------|-----|
| Complex interactivity, component reuse | React + Next.js | Ecosystem, SSR, routing built in |
| Simpler apps, migration from jQuery/Vue 2 | Vue + Nuxt | Gentle learning curve, option API |
| Performance-critical, small bundle needs | Svelte + SvelteKit | Compiles away, no framework overhead |
| Enterprise with established patterns | Angular + Nx | TypeScript-first, strict typing, built-in CLI |

### Database
| Data Pattern | Choose | Why |
|-------------|--------|-----|
| Relational, ACID transactions needed | PostgreSQL | Industry standard, JSON support, full-text search |
| Fast reads, flexible schema | MongoDB | Document model, horizontal scaling |
| Cache + session + real-time data | Redis | In-memory, pub/sub, TTL support |
| File/blob storage | AWS S3 / Cloudflare R2 | Object storage, CDN integration |

### Hosting Platform
| Need | Choose |
|------|--------|
| Full control, custom infra | VPS (DigitalOcean, Hetzner) |
| Serverless frontend + backend | Vercel (Next.js), Netlify (Vue/Svelte) |
| Container orchestration | AWS ECS / GCP Cloud Run |
| Static site only | Cloudflare Pages, GitHub Pages |

### API Communication
- REST: standard CRUD, cacheable resources
- GraphQL: complex nested data queries, mobile clients
- gRPC: internal service-to-service (when microservices needed)
- WebSockets: real-time updates (chat, live feeds)

## User Questions Before Building

1. **What is the primary purpose of this application?** → maps to PRD §1 Main Feature + §2 Problem Alignment; informs framework choice (complex interactivity → React/Next.js per Frontend Framework table)
2. **Expected user volume at launch?** → maps to PRD §3 Timing & Priority (scaling needs); determines hosting platform choice per Hosting Platform table (static only → Cloudflare Pages; full control → VPS)
3. **Any existing technology constraints?** → must feed into PRD §3 Dependencies field; must be reflected in DB selection (must use PostgreSQL → relational table; must use MongoDB → document table)
4. **Team familiarity with any framework?** → informs template selection: Vue team → Nuxt template; Svelte experience → SvelteKit template (per `templates/README.md`)
5. **Budget constraints?** → free tier vs paid infrastructure; maps to hosting platform table and DB table (S3/R2 for file storage on budget; Redis for cache with performance needs)

## Cross-references

| config-rules.md section | Upstream input (from PRD) | Downstream output (to templates/skills) |
|------------------------|--------------------------|---------------------------------------|
| Frontend Framework table → Next.js | PRD §1 (complexity), §6 UX principles (interactivity needs) | `templates/nextjs-starter/`; skill files: `coding-guidelines.md` (React conventions), `accessibility-guidelines.md` (interactive element rules) |
| Database table → PostgreSQL/MongoDB/etc. | PRD §3 Dependencies (existing DB constraints); §5 Target Users (data access patterns) | Schema templates; `security.md` §2 IDOR prevention (per data model) |
| Hosting Platform table | PRD §2 Problem Alignment (scale requirements), user answer #2 (volume) | Deployment config; CI/CD setup |
| API Communication table → REST/GraphQL/gRPC/WebSockets | PRD §5 Target Users (client types — mobile vs web); §6 UX principles (real-time needs) | Route structure in `coding-guidelines.md`; `security.md` §9 secrets management (API key storage) |

## Related Files

| File | Relationship |
|------|-------------|
| [`PRD/templates/prd-template.md`](../../../PRD/templates/prd-template.md) §3 Timing/Priority + §5 Target Users | PRD sections that feed stack selection — constraints, budget, scale requirements from the PRD drive every decision in this file |
| [`templates/README.md`](../../templates/README.md) | Config-rules selects which template is used; templates are filled with token values from design-system |
| `design-system/tokens/color.md` §Brand Palette | Brand colors (primary/secondary) determine the "branding tier" which may influence hosting decisions (e.g., CDN for brand assets) |
| [`skills/coding-guidelines.md`](../skills/coding-guidelines.md) | Coding conventions match the chosen framework — React hooks vs Vue composables vs Svelte stores |
| `workflows/README.md` Workflow 3 Phase "Confirm Stack" | This workflow phase asks the user questions from this file's §User Questions section |
