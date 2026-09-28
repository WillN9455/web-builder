# Code Builder Configuration Rules

How to choose tech stack, hosting, and tooling based on user input.

## Stack Selection Decision Tree

### Frontend Framework
| Need | Choose | Why |
|------|--------|-----|
| **Native iOS/Android app** — device APIs, offline, app-store distribution | **Flutter (Dart)** | One codebase ships both stores; compiles to native; Material 3. Scaffold from `templates/flutter-starter/` |
| Complex interactivity, component reuse | React + Next.js | Ecosystem, SSR, routing built in |
| Simpler apps, migration from jQuery/Vue 2 | Vue + Nuxt | Gentle learning curve, option API |
| Performance-critical, small bundle needs | Svelte + SvelteKit | Compiles away, no framework overhead |
| Enterprise with established patterns | Angular + Nx | TypeScript-first, strict typing, built-in CLI |

**App target decides the axis first:** if the deliverable installs on a device
(app-store listing, offline use, camera/push/Bluetooth), choose Flutter — a
server-rendered web app is not a substitute for a native app, and picking
Next.js because it is listed first is the failure mode this row exists to
prevent. If the deliverable is reached through a browser, use the web rows
below.

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
| Native app distribution (iOS/Android) | App Store Connect + Google Play Console (signing/build config in `templates/flutter-starter/pubspec.yaml`); the app's backend still needs a host from the rows above |

### API Communication
- REST: standard CRUD, cacheable resources
- GraphQL: complex nested data queries, mobile clients
- gRPC: internal service-to-service (when microservices needed)
- WebSockets: real-time updates (chat, live feeds)
- **Public clients (Flutter/native, SPA):** the binary/app bundle is readable by
  anyone who installs it, so the client holds no secret and no service
  credential — build-time config arrives via `--dart-define` and privileged
  operations go behind a server-side BFF. This is what makes `security.md` §9
  secrets management enforceable on a native client, not just a web one.

## User Questions Before Building

1. **What is the primary purpose of this application?** → maps to PRD §1 Main Feature + §2 Problem Alignment; informs framework choice (**native app / app-store delivery → Flutter**; complex interactivity in a browser → React/Next.js per Frontend Framework table). Ask this before naming a framework: a native deliverable routed to a web row is the default this rule prevents.
2. **Expected user volume at launch?** → maps to PRD §3 Timing & Priority (scaling needs); determines hosting platform choice per Hosting Platform table (static only → Cloudflare Pages; full control → VPS; **native app → App Store Connect + Play Console, plus a backend host**)
3. **Any existing technology constraints?** → must feed into PRD §3 Dependencies field; must be reflected in DB selection (must use PostgreSQL → relational table; must use MongoDB → document table)
4. **Team familiarity with any framework?** → informs template selection: **Flutter experience → Flutter (native) template**; Vue team → Nuxt template; Svelte experience → SvelteKit template (per `templates/README.md`)
5. **Budget constraints?** → free tier vs paid infrastructure; maps to hosting platform table and DB table (S3/R2 for file storage on budget; Redis for cache with performance needs)

## Cross-references

| config-rules.md section | Upstream input (from PRD) | Downstream output (to templates/skills) |
|------------------------|--------------------------|---------------------------------------|
| Frontend Framework table → Next.js | PRD §1 (complexity), §6 UX principles (interactivity needs) | `templates/nextjs-starter/`; skill files: `coding-guidelines.md` (React conventions), `accessibility-guidelines.md` (interactive element rules) |
| Frontend Framework table → Flutter (native app) | PRD §1 (deliverable is an app), §5 Target Users (device/app-store reach) | `templates/flutter-starter/`; skill files: `coding-guidelines.md` (Dart/widget conventions), `accessibility-guidelines.md` (Semantics labels, focus order — the native equivalent of ARIA) |
| Database table → PostgreSQL/MongoDB/etc. | PRD §3 Dependencies (existing DB constraints); §5 Target Users (data access patterns) | Schema templates; `security.md` §2 IDOR prevention (per data model) |
| Hosting Platform table | PRD §2 Problem Alignment (scale requirements), user answer #2 (volume) | Deployment config; CI/CD setup; for a native target, store listing + signing config rather than a static host |
| API Communication table → REST/GraphQL/gRPC/WebSockets | PRD §5 Target Users (client types — mobile vs web); §6 UX principles (real-time needs) | Route structure in `coding-guidelines.md`; `security.md` §9 secrets management (API key storage — no secret in a client binary; privileged calls behind a BFF) |

## Related Files

| File | Relationship |
|------|-------------|
| [`PRD/templates/prd-template.md`](../../../PRD/templates/prd-template.md) §3 Timing/Priority + §5 Target Users | PRD sections that feed stack selection — constraints, budget, scale requirements from the PRD drive every decision in this file |
| [`templates/README.md`](../../templates/README.md) | Config-rules selects which template is used; templates are filled with token values from design-system |
| `design-system/tokens/color.md` §Brand Palette | Brand colors (primary/secondary) determine the "branding tier" which may influence hosting decisions (e.g., CDN for brand assets) |
| [`skills/coding-guidelines.md`](../skills/coding-guidelines.md) | Coding conventions match the chosen framework — React hooks vs Vue composables vs Svelte stores |
| `workflows/README.md` Workflow 3 Phase "Confirm Stack" | This workflow phase asks the user questions from this file's §User Questions section |
