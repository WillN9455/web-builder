# Coding Guidelines

Coding standards every Code Agent and Dev Reviewer must follow.

## File Organization

```
src/
├── components/     # Reusable UI components (one file per component)
├── pages/          # Page-level components (routes)
├── hooks/          # Custom React/useContext hooks
├── services/       # API calls, data fetching, business logic
├── utils/          # Pure utility functions
├── types/          # TypeScript type definitions
├── styles/         # Global styles, CSS modules
└── constants/      # App-wide constants and config
```

## Naming Conventions

- **Components**: PascalCase (`UserProfile`, `DataTable`)
- **Files**: kebab-case (`user-profile.tsx`, `data-table.css`)
- **Hooks**: camelCase with `use` prefix (`useAuth`, `useFormValidation`)
- **Services**: camelCase (`fetchUserData`, `submitOrder`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`, `API_BASE_URL`)
- **Tests**: Same name as source + `.test.ts` or `.spec.ts` suffix

## Code Standards

### Components
- One component per file, exported as default
- TypeScript interfaces for all props — no `any` types (except in test mocks)
- Props interface must list every required prop with a comment if non-obvious
- Extract logic into custom hooks when a component exceeds ~200 lines

### Functions
- Max 50 lines per function. If longer, extract sub-functions.
- One level of nesting preferred; flat over deep.
- Early returns over nested conditionals (guard clause pattern).

### State Management
- Local state first, lift only when shared across uncles/aunts
- Prefer derived state over redundant state sources of truth
- Document the single source of truth for every piece of state

### API Calls
- All API calls go through `services/` — never inline in components
- Define success/error types for every endpoint
- Handle loading, error, and empty states at the component level
- Timeout all requests (default 10s); retry on transient errors (max 3x with exponential backoff)

### Testing
- Unit tests: every utility function and custom hook
- Integration tests: every component that has state or user interactions
- Test names describe behavior, not implementation: `should display error when API fails` not `calls showError`
- Use the same language as the PRD's acceptance criteria when possible

## Code Review Checklist

- [ ] Follows file organization and naming conventions
- [ ] TypeScript types are explicit (no `any`, no implicit `unknown`)
- [ ] Component props documented with JSDoc if non-obvious
- [ ] Error handling at every boundary (API, forms, user input)
- [ ] Tests cover happy path, error path, and edge cases
- [ ] No hardcoded strings — use constants or i18n keys
- [ ] Console.log removed (use logger or remove entirely)
- [ ] Complexity: cyclomatic complexity ≤ 5 per function

## Related Files

| File | Relationship |
|------|-------------|
| [`../code-builder/templates/nextjs-starter/`](../code-builder/templates/nextjs-starter/) | Coding conventions define `src/` file organization that templates must follow exactly |
| [`design-system/components/README.md`](../design-system/components/README.md) Component Rules §5 | Components are CSS-implementable only — templates must not introduce JS-only effects |
| [`testing/playwright/README.md`](../testing/playwright/README.md) §Test File Organization | Test file naming convention (`.test.ts` / `.spec.ts`) and organization mirrors source structure per these conventions |
| [`skills/security.md`](./security.md) | All route handlers/API calls defined here must also pass security.md checklist |
| `workflows/README.md` Workflow 4 Phase "Review Maintainability" | Dev Reviewer A uses this checklist as the review criteria |
