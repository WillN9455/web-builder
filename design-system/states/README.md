# Design System States

Interaction states that define how every element behaves across all conditions. These must be fully documented before any Code Agent begins implementation.

## State Files

| File | Covers | Required Before Implementation? |
|------|--------|-------------------------------|
| `error.md` | Error handling patterns, banners, boundaries | Yes — every page needs error states |
| `loading.md` | Skeletons, spinners, progress bars, file upload loading | Yes — all data-fetching needs loading states |
| `success.md` | Success banners, full-screen confirmations, toasts | Yes — every form/action needs success state |
| `empty.md` | Empty content states, illustrations, CTAs | Yes — every list/table/dashboard needs empty state |
| `validation.md` | Form validation patterns, password strength, error messages | Yes — all forms need validation states |
| `interaction.md` | Hover, focus, active, disabled, read-only, dropdowns, autocomplete | Yes — defines ALL interactive element behaviors |
| `consent.md` | Cookie/analytics banners, marketing opt-in, age-gate interstitials | Yes — whenever PRD §6c lists a consent surface |
| `forbidden.md` | Permission-denied / 403, disabled-by-role controls, feature-locked | Yes — every route/action in `rbac-matrix.md` needs a forbidden state |

## Rules for Design Agents

1. **All states must be defined per component** — don't just define states globally; map them to each component in the PRD
2. **Error and loading states are non-negotiable** on every page that fetches data
3. **Business rule states**: Different user contexts may show different views (e.g., a user with 0 houses vs 3 houses sees different dashboards). Map these per PRD business rules.
4. **Every state must be CSS-implementable** — if it requires JS-only effects, flag it explicitly
5. **State transitions must have timing** — document duration and easing for any animated change

## Business Rule State Mapping Template

For each PRD feature, map business rule states:

```markdown
### Feature: <feature name>

| User Context | State | What Changes | Component Affected |
|-------------|-------|-------------|-------------------|
| User has 0 items | Empty state shown | Full-screen empty illustration + CTA | Dashboard main area |
| User has 1 item | Single-item view | Card shows item details, actions available | Dashboard main area |
| User has 2-10 items | List view | Table/cards with pagination | Dashboard main area |
| User has 10+ items | Paginated list | Pagination controls appear | Dashboard footer |
```

## State Coverage Checklist (QA Agent Reference)

Test every feature against these state categories:

- [ ] Error states (API failures, form errors, page not found) → color tokens from `tokens/color.md` §Semantic Palette (§error-500/700 for border/text)
- [ ] Loading states (page, component, submission, upload) → skeleton colors from `tokens/color.md` §Neutral Palette; spinner colors from brand-primary
- [ ] Success states (banner, full-screen, toast) → color tokens from `tokens/color.md` §Semantic Palette (§success-500/700/100)
- [ ] Empty states (no data, filtered results, fresh start) → neutral-600/400 from `tokens/color.md` §Neutral Palette
- [ ] Validation states (blur, submit, real-time) → semantic error/warning/success colors; links to `components/form-input.md` validation rules
- [ ] Interaction states (hover, focus, active, disabled, read-only) → brand-primary and neutral palette from `tokens/color.md`; accessibility guidelines §Interactive Elements Required States
- [ ] Consent states (cookie banner, marketing opt-in, age-gate) → surface-elevated + warning-500 (opt-out stripe) from `tokens/color.md`; opt-in/out model from PRD §6c; copy from §6d; flow ids from `data-flow.md` §2
- [ ] Forbidden states (403, disabled-by-role, feature-locked) → warning-500 stripe (intentional, not an error) + neutral palette from `tokens/color.md`; access rules from PRD §9c `rbac-matrix.md`; copy from §6d; IDOR-safe per `skills/security.md`
- [ ] Business rule states (user context differences) → PRD Section 6 UX Principles + Section 12 Assumptions; maps to component index via `components/README.md`

## Cross-references for each state file

Each state file below links to its upstream inputs (which tokens define the colors), downstream consumers (which components use this state, which tests verify it). See the individual `.md` files in this directory — each has a "Cross-References" section with:

| Cross-reference type | What it maps |
|---------------------|-------------|
| Color tokens used → `tokens/color.md` | Which semantic colors from the palette appear in this state |
| Rules governing → skill files | Which accessibility and UI best practices rules apply to this state |
| Components that use | Which components in `components/` implement this state, how it appears, recovery action |
| Downstream consumers (QA) | Playwright test mapping: file name, what it tests, PRD section traced |
| PRD input triggers | Which PRD sections activate this state (#8 User Stories, §6 UX Principles, §12 Assumptions) |

## Related Files

| File | Relationship |
|------|-------------|
| `tokens/color.md` §Semantic Palette | All state docs derive their color tokens (error/warning/info/success palettes) from this file |
| `components/README.md` Component Index + Component Rules | Each component must define all states from this directory — rules §2 says "every component must define all interaction states" |
| `components/form-input.md` Required States table | The validation state in `validation.md` directly maps to the form-input component's error and validated states |
| `skills/accessibility-guidelines.md` §Interactive Elements + §Screen Reader Support | WCAG required states table is the foundation for `interaction.md`; screen reader rules apply to all 6 state docs |
| `skills/ui-best-practices.md` (§1-3, §2.5, §7) | UI best practices rules map to each state doc: §1→loading, §2→error, §2.5→empty, §3→success, §7→validation |
| `testing/playwright/README.md` "Tracing test coverage" table | Playwright tests for each state are listed in the individual `.md` files' Cross-References sections |
