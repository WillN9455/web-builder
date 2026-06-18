# Validation State

## When Validation Appears

| Trigger | When It Shows | Duration |
|---------|--------------|----------|
| On blur | User leaves a field without entering valid data | Until corrected |
| On submit | Form submitted with invalid fields | Until all fixed |
| On typing (real-time) | Only for clearly invalid input (e.g., email format) | As long as invalid |
| Password strength | While typing password | While typing |

## Validation Error Structure

```html
<div class="form-field">
  <label id="email-label">Email</label>
  <input
    type="email"
    id="email"
    aria-labelledby="email-label"
    aria-describedby="email-error"
    aria-invalid="true"
    required
  >
  <div id="email-error" class="validation-error" role="alert">
    <!-- Icon -->
    <span>Please enter a valid email address (e.g., name@example.com)</span>
  </div>
</div>
```

## Validation Error Tokens

| Token | Background | Border | Text Color | Icon Color |
|-------|-----------|--------|-----------|-----------|
| Inline field error | transparent | 2px error-500 | error-700 (#B91C1C) | error-500 |
| Field filled error | error-50 | 2px error-500 | error-800 | error-500 |

## Validation Message Format

**Required structure:**

```
[Icon] + [What's wrong] + [How to fix it (specific, not generic)]
```

Good examples:
- `Please enter a valid email address (e.g., name@example.com)`
- `Password must be at least 8 characters and include one uppercase letter`
- `Phone number format should be (XXX) XXX-XXXX`

Bad examples:
- `Invalid input` — too vague
- `Error` — no guidance
- `Please fix this field` — doesn't say what to fix

## Validation States Table

| State | Border | Background | Label Color | Error Text Color | Icon | Aria |
|-------|--------|-----------|------------|-----------------|------|------|
| Valid | 1px neutral-200 | white | neutral-800 | — | success-500 (checkmark) | aria-invalid="false" |
| Error | 2px error-500 | error-50 if filled | error-700 | error-700 | error-500 (exclamation) | aria-invalid="true", role=alert |
| Validated | 2px success-500 | white | success-700 | — | success-500 (checkmark) | aria-invalid="false" |
| Required empty | 1px neutral-200 → error after blur | white | neutral-800 → error-700 after error | error-700 | — | aria-invalid="true" after first error trigger |

## Password Strength Indicator

```html
<div class="password-strength">
  <div class="strength-bar" role="progressbar" aria-valuenow="50" aria-valuemin="0" aria-valuemax="100" style="width: 50%;"></div>
  <span class="strength-text">Weak — add uppercase, numbers, or symbols</span>
</div>
```

| Strength | Bar Color | Text | Criteria Not Met |
|----------|----------|------|-----------------|
| None (empty) | neutral-200 | "Enter a password" | — |
| Weak | error-500 | "Weak" + specific missing criteria | < 8 chars, no uppercase, no number, no symbol |
| Fair | warning-500 | "Fair" + remaining criteria | Missing one criterion |
| Strong | success-500 | "Strong" | — |

## Real-Time Validation Rules

| Field Type | Validate On | Rule | Error If |
|-----------|------------|------|----------|
| Email | blur | RFC 5322 simple regex | Not a valid email format |
| Password | input (every keystroke) | Min length + complexity | < 8 chars OR missing required character types |
| Phone | blur | E.164 or local format | Does not match expected phone pattern |
| URL | blur | URL standard validation | Not a valid URL format |
| Number | blur / input | min/max attributes | Outside allowed range |
| Required text | blur | Length > 0 | Field is empty |

## Validation Accessibility

- Error messages use `role="alert"` for screen reader announcement on first error
- On form submit, focus moves to the first invalid field (with scroll-to)
- Each error is associated with its field via `aria-describedby`
- Error text appears inline below the field, not in a popup or toast
- "Clear all errors" button if there are 5+ validation errors

## Testing Requirements (QA Agent)

- [ ] All form fields have validation on at least blur or submit
- [ ] Error messages explain what to fix, not just that something is wrong
- [ ] Required fields show the asterisk and "required" text near the label
- [ ] Password strength indicator updates in real time as user types
- [ ] Validation errors do not prevent the user from correcting their input
- [ ] Success validation (green checkmark) appears when field becomes valid
