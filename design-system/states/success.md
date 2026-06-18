# Success State

## Types of Success Messages

| Type | When It Appears | Duration | Dismissal |
|------|-----------------|----------|-----------|
| Inline success | Form field validated successfully | Until next edit | Auto-dismiss after 5s or on next input |
| Banner success | Action completed (form submission, save, etc.) | 6 seconds | Auto-dismiss or X button |
| Full screen success | Multi-step flow completion | Until user navigates | CTA to continue / "Done" button |
| Toast notification | Non-blocking action confirmation | 4 seconds | Auto-dismiss, swipe-to-dismiss (mobile) |

## Success Banner Component

```html
<div role="status" class="success-banner">
  <svg aria-hidden="true"><!-- checkmark icon --></svg>
  <div>
    <strong>{{ title }}</strong>
    <p>{{ description }}</p>
  </div>
  <button aria-label="Dismiss">Close</button>
</div>
```

### Success Banner Tokens

| Token | Background | Border Left | Text | Icon |
|-------|-----------|-------------|------|------|
| Banner | #F0FDF4 (#F0FDF4) | 4px success-500 (#059669) | success-800 (#047857) | success-500 |
| Toast | white | none (shadow instead) | neutral-800 | success-500 |

## Full Screen Success Pattern

```html
<div class="success-screen">
  <div class="success-screen__icon" aria-hidden="true">
    <!-- Large animated checkmark, circle bg success-100 -->
  </div>
  <h2>{{ title }}</h2>
  <p>{{ description }}</p>
  <button class="btn btn-primary">Continue</button>
  <a href="/dashboard" class="link">Go to Dashboard</a>
</div>
```

### Full Screen Tokens

| Token | Value | Purpose |
|-------|-------|---------|
| Icon bg | success-100 (#D1FAE5) | Success icon background |
| Icon size | 64px diameter | Prominent visual cue |
| Animation | scale(0.8) → scale(1) in 300ms | Subtle pop-in effect |

## Toast Positioning

| Context | Position | Z-Index |
|---------|----------|---------|
| Standard | Top-right of viewport | 200 |
| Mobile | Top-center, below header | 200 |
| Within layout | Above triggering element | parent container's stacking context |

## Success Message Format

**Required structure:**

```
[Success icon] + [What was completed successfully] + [What happens next (if anything)]
```

Examples:
- `Your profile has been updated. The changes will appear across all your devices.`
- `File uploaded successfully. You can now share it with your team.`
- `Account created! Check your email to verify your address.`

## Accessibility

- Use `role="status"` (not `role="alert"`) for success — they're informational, not urgent
- Success banners auto-dismiss after 6s but remain dismissible via visible X button
- Screen reader announcements should include: "Success. [What was done]"
- Success icon must not be the sole indicator — always paired with text label

## Testing Requirements

- [ ] All success messages include visible text (icon alone is insufficient)
- [ ] Auto-dismiss timers are at least 4 seconds (long enough to read)
- [ ] Success state does not navigate away unexpectedly (unless it's a full-screen success flow)
- [ ] Form submission success shows confirmation of what was submitted
