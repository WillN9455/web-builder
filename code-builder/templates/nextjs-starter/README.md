# Next.js Starter — Idea-to-Web-Solution Framework

A **complete, functional** Next.js 15 starter project. Copy this directory into a new branch and adapt it for your project — every file is production-ready code, not placeholders.

## What's Included

| Layer | Files | Purpose |
|-------|-------|---------|
| **Config** | `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs` | Dependencies, framework settings, Tailwind theming |
| **Env** | `.env.example` | All environment variables documented with descriptions and generation commands |
| **App Layer** | `app/layout.tsx`, `app/page.tsx`, `app/globals.css` | Root layout (SessionProvider, skip nav), landing page, design tokens |
| **Auth** | `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts` | NextAuth v4 config with Google + Email + Credentials providers |
| **DB Setup** | `src/lib/db.ts`, `src/schema.ts`, `drizzle.config.ts`, `prisma/schema.prisma`, `prisma/seed.ts` | Drizzle ORM client, schema definitions, migration config, Prisma equivalent, seed script |
| **Routing** | `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/app/dashboard/page.tsx` | Auth pages + authenticated dashboard with session guard |
| **API Patterns** | `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts` | Protected GET/PATCH endpoints with auth, RBAC, IDOR prevention, Zod validation |
| **Middleware** | `src/middleware.ts` | Route guards (auth + admin), X-User headers on every request |
| **Lib** | `src/lib/validations.ts`, `src/lib/utils.ts`, `src/lib/security.ts` | Zod schemas, utilities (cn, formatDate, UUID), bcrypt helpers |
| **Components** | `src/components/ui/button.tsx`, `card.tsx`, `input.tsx` | Reusable accessible UI components with Tailwind |
| **Auth Components** | `src/components/auth/login-form.tsx`, `register-form.tsx` | Client-side forms with react-hook-form + Zod validation, error states, loading spinners |

## Getting Started

```bash
# 1. Copy the template to a new directory
cp -r code-builder/templates/nextjs-starter my-project && cd my-project

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env — fill in DATABASE_URL and NEXTAUTH_SECRET at minimum

# 4. Create your PostgreSQL database (local or Neon/Supabase/Railway)

# 5. Generate migrations and run them
npm run db:generate
npm run db:migrate

# 6. Seed the database with sample users
npm run db:seed

# 7. Start development server
npm run dev
```

## Project Structure

```
nextjs-starter/
├── app/                      # Next.js App Router root
│   ├── layout.tsx            # Root layout (SessionProvider, typography, skip nav)
│   ├── page.tsx              # Landing page (public)
│   └── globals.css           # Design tokens + base styles
├── src/
│   ├── app/
│   │   ├── api/auth/[...nextauth]/route.ts  # NextAuth route handler
│   │   ├── api/users/route.ts                 # GET /api/users (admin)
│   │   ├── api/users/[id]/route.ts            # GET/PATCH /api/users/:id
│   │   ├── dashboard/page.tsx                 # Authenticated dashboard
│   │   ├── login/page.tsx                     # Login page
│   │   └── register/page.tsx                  # Registration page
│   ├── components/
│   │   ├── auth/            # Auth-specific client components
│   │   └── ui/              # Shared accessible UI primitives
│   ├── lib/                 # Core utilities & config
│   │   ├── auth.ts          # NextAuth configuration
│   │   ├── db.ts            # Drizzle ORM + postgres pool
│   │   ├── validations.ts  # Zod schemas (all input validation)
│   │   ├── utils.ts         # cn(), formatDate(), UUID generator
│   │   └── security.ts     # bcrypt helpers
│   ├── schema.ts            # Drizzle table definitions (single source of truth)
│   └── middleware.ts        # Auth + RBAC route guards
├── prisma/
│   ├── schema.prisma        # Prisma equivalent (reference only)
│   ├── seed.ts              # Seed script with bcrypt passwords
│   └── migrations/          # Generated Drizzle migrations
├── .env.example             # Documented env variables
├── .eslintrc.json           # ESLint config
├── .gitignore               # Standard Next.js ignores
├── drizzle.config.ts        # Drizzle Kit configuration
├── next.config.ts           # Next.js config (headers, redirects, images)
├── package.json             # Dependencies + scripts
├── tailwind.config.ts       # Tailwind theme with design tokens
└── tsconfig.json            # TypeScript config with path aliases
```

## Design Decisions

- **ORM: Drizzle** — Lightweight, type-safe SQL queries. Prisma equivalent included for reference if you prefer ORMs.
- **Auth: NextAuth v4** — Battle-tested, supports Google/OAuth/Email/Credentials. JWT strategy (stateless).
- **Validation: Zod** — Single schema source used by both server API routes and client forms via `@hookform/resolvers/zod`.
- **Styling: Tailwind + CSS custom properties** — Tokens from design-system compiled to CSS variables, mapped to Tailwind theme.
- **Security: Defaults on** — CSRF (NextAuth handles), rate limiting (Redis optional), CSP headers in next.config.ts, IDOR checks on every endpoint.

## Adding New Features

1. **New route**: Create `src/app/<feature>/page.tsx` (Server Component) or `layout.tsx` (with `'use client'`)
2. **New API endpoint**: Create `src/app/api/<resource>/route.ts` — follow the users/ pattern for auth + validation
3. **New table**: Add to `src/schema.ts`, run `npm run db:generate && npm run db:migrate`
4. **New component**: Add to `src/components/ui/` or `src/components/features/`
