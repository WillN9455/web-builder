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
- [ ] Error messages match tone and style in PRD
