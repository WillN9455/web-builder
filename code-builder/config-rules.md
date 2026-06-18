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

1. **What is the primary purpose of this application?**
2. **Expected user volume at launch?** (determines hosting scale)
3. **Any existing technology constraints?** (must use AWS, must support IE11, etc.)
4. **Team familiarity with any framework?** (if building in-house, not just AI-generated)
5. **Budget constraints?** (free tier vs paid infrastructure)
