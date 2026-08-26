# Error State

## Types of Errors

| Type | When It Appears | Who Triggers It | Recovery Action |
|------|----------------|-----------------|-----------------|
| API Error | Server returns 4xx/5xx, network timeout | Backend / Network | "Retry" button + logged error ID |
| Form Validation Error | User submits invalid data | Frontend validation | Inline field errors + scroll-to-first-error |
| Page Not Found (404) | Invalid URL / deleted resource | Router | Link to homepage + search box |
| Auth Error | Expired token, invalid credentials | Auth system | "Re-login" or "Refresh session" button |
| Generic/System Error | Unhandled exception, unexpected state | Frontend error boundary | "Try again" + contact support link |

## Error Banner (Page-Level)

```html
<div role="alert" class="error-banner">
  <svg aria-hidden="true"><!-- error icon --></svg>
  <div>
    <strong>Unable to complete your request</strong>
    <p>{{ error message }}</p>
  </div>
  <button aria-label="Dismiss">Close</button>
  <button class="error-banner__action">Retry</button>
</div>
```

### Error Banner Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Background | #FEF2F2 (error-50) | Banner background |
| Border Left | 4px error-500 | Visual indicator stripe |
| Text Color | error-700 (#B91C1C) | Body text |
| Icon Color | error-500 | Warning icon |

### Variants

| Severity | Background | Border | Icon | Use Case |
|----------|-----------|--------|------|----------|
| Critical (fatal) | #FEF2F2 | 4px error-500 full height | Alert triangle | System down, data loss risk |
| Warning | #FFFBEB | 4px warning-500 full height | Exclamation | Degrading functionality |
| Info | #EFF6FF | 4px info-500 full height | Info circle | Non-blocking notice |

## Error Boundary (Component-Level)

```html
<div class="error-boundary">
  <div class="error-boundary__icon" aria-hidden="true">
    <!-- error icon -->
  </div>
  <h3>{{ component title }} encountered an issue</h3>
  <p>The {{ component name }} couldn't be loaded. Please try refreshing the page.</p>
  <button onclick={retry}>Try Again</button>
</div>
```

### Error Boundary Tokens (same as banner)

| Token | Value |
|-------|-------|
| Background | surface-elevated (white card on neutral-100 bg) |
| Min Width | 320px |
| Border Radius | space-3 |
| Padding | space-8 |

## Error Message Format

**Required structure for all error messages:**

```
[Icon] + [What went wrong in plain language] + [What the user can do about it]
```

Examples:
- `Unable to save your changes. Please check your internet connection and try again.`
- `The page you're looking for doesn't exist. Go back to the homepage or search for what you need.`
- `Your session has expired. Please log in again to continue.`

**Never show:** raw error codes, stack traces, SQL errors, internal paths, or technical jargon to end users.

## Error Handling Flow

```
User action → API call fails → 
  ├─ 4xx: Show inline/form-level error (user fixable)
  ├─ 5xx: Show banner error with "Retry" button (temporary)
  └─ Network: Show network error with offline instructions (persistent until recovered)
```

## Testing Requirements

- [ ] Every API endpoint has an error handler
- [ ] Error banners are announced to screen readers (`role="alert"`)
- [ ] Retry buttons show a loading state while retrying
- [ ] Errors dismiss after 10 seconds (with persistent CTA) unless critical
- [ ] Error messages match tone and style in PRD §6d (locale-aware; locale fallback applies)

## Cross-References

### Color tokens used (from `tokens/color.md` §Semantic Palette)
| Token | Shade | Where used |
|-------|-------|-----------|
| `--ds-color-error-50` | `#FEF2F2` | Banner background, filled field bg |
| `--ds-color-error-500` | `#DC2626` | Border-left stripe, icon color, inline error border |
| `--ds-color-error-700` | `#B91C1C` | Banner text, critical severity text |

### Semantic colors used (same file — also apply to states)
| Token | Shade | Where used |
|-------|-------|-----------|
| `--ds-color-warning-500` | `#D97706` | Warning variant banner |
| `--ds-color-warning-700` | `#B45309` | Warning text |
| `--ds-color-info-500` | `#2563EB` | Info variant banner |

### Rules governing this state
| Rule source | Specific requirement |
|-------------|---------------------|
| [`skills/accessibility-guidelines.md`](../../skills/accessibility-guidelines.md) §Screen Reader Support | `role="alert"` on error banners; `aria-invalid="true"` on form fields with errors; focus management to first error |
| [`skills/ui-best-practices.md`](../../skills/ui-best-practices.md) §2 Error States | Move focus to error on form submission failure; never expose raw server errors; distinguish error states from empty states |
| [`../../PRD/templates/prd-template.md`](../../PRD/templates/prd-template.md) §6d Content, copy & localisation | Error-message copy is **mandatory** (§6d "Error-message copy" section) — the [what went wrong] + [what to do] text must be pulled from §6d, locale-aware, with the §6d locale-fallback rule applying. Do not invent error copy. |
| `skills/security.md` §10 No Raw Error Leakage | Never show raw stack traces, SQL errors, or internal paths to clients — sanitize in UI |

### Components that use this state
| Component (from `components/`) | How error appears | Recovery action |
|-------------------------------|------------------|-----------------|
| `button.md` | Danger variant on hover; loading overlay during submit; disabled/error disabled states | Retry button, confirmation dialog for destructive actions |
| `card.md` | 2px error-500 border + error banner in card body when content load fails | "Try Again" button inside the card's error boundary |
| `form-input.md` | 2px error-500 border; error-700 label color; inline field-level error below input | Correct and re-validate on blur/change |
| `navigation.md` | Nav banner if nav data fails to load; active state indicator turns red | "Reconnect" button in banner |

### Downstream consumers (QA test mapping)
| Test type | Playwright file | What it tests | Traces to PRD section |
|-----------|-----------------|--------------|----------------------|
| E2E error path | `features/<feature>/e2e.spec.ts` | API failure → error banner appears, retry works | PRD §8 User Story #N (error acceptance criteria) |
| State test | `features/<feature>/states.spec.ts` | All error states per this doc's Testing Requirements list | This file + component specs |
| A11y test | `features/<feature>/a11y.spec.ts` | `role="alert"` on error banners; focus on first error | `skills/accessibility-guidelines.md` §Screen Reader Support |

### PRD input triggers (when this state is activated)
- PRD Section 6 UX Principles: "Error handling and framework" section defines required error behaviors
- PRD Section 6d Content, copy & localisation: mandatory error-message copy (what went wrong + what to do) — locale-aware, with locale fallback
- PRD Section 8 User Stories: acceptance criteria that specify "when X fails, show Y"
- PRD Section 12 Assumptions: any assumptions about offline behavior or network reliability
