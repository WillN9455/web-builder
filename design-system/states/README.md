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

- [ ] Error states (API failures, form errors, page not found)
- [ ] Loading states (page, component, submission, upload)
- [ ] Success states (banner, full-screen, toast)
- [ ] Empty states (no data, filtered results, fresh start)
- [ ] Validation states (blur, submit, real-time)
- [ ] Interaction states (hover, focus, active, disabled, read-only)
- [ ] Business rule states (user context differences)
