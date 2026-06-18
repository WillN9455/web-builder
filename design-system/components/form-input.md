# Form Input Component

## Props API

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `'text' \| 'email' \| 'password' \| 'number' \| 'tel' \| 'url' \| 'search'` | `'text'` | Input type |
| `label` | `string` | — | Visible label text |
| `placeholder` | `string` | — | Placeholder text (does not replace label) |
| `error` | `string \| false` | `false` | Error message or none |
| `helperText` | `string \| false` | `false` | Helper/help text below input |
| `disabled` | `boolean` | `false` | Disabled state |
| `readOnly` | `boolean` | `false` | Read-only state |
| `required` | `boolean` | `false` | HTML required attribute |
| `maxLength` | `number` | — | Max input length |
| `prefix` / `suffix` | `ReactNode` | — | Icons or text before/after input |

## Variants

| Variant | Border | Label Style | Use Case |
|---------|--------|------------|----------|
| Default | 1px neutral-200 | neutral-800, font-sm | Standard inputs |
| Filled | 1px neutral-200 + bg neutral-50 | neutral-600 | Inline/compact forms |
| Error | 2px error-500 | error-700 | Validation failure |
| Success | 2px success-500 | success-700 | Validated input |

## Internal Structure

```
<FormInput>
  <label>              /* always visible or sr-only */
  <input>              /* the actual input element */
  <span class="error"> /* shown when error prop is truthy */
  <span class="helper">/* shown when helperText prop is set */
</FormInput>
```

## Required States

| State | Border | Background | Label | Text Cursor | Tabindex | Screen Reader |
|-------|--------|-----------|-------|------------|----------|--------------|
| Default | 1px neutral-200 | white | neutral-800 | text | 0 | aria-describedby=error/helper id |
| Focus | 2px brand-primary-500 ring (2px) | white | brand-primary-700 | text | 0 | — |
| Hover | 1px neutral-400 | white | neutral-800 | pointer | 0 | — |
| Disabled | 1px neutral-300 | neutral-100 | neutral-400 | not-allowed | -1 | aria-disabled="true" |
| Read-only | 1px neutral-200 | white | neutral-800 | text | 0 | aria-readonly="true" |
| Error | 2px error-500 | white | error-700 | text | 0 | aria-invalid="true", role=alert on error |
| Filled | (see variants) | neutral-100 | — | text | 0 | same as default |

## Text Overflow Handling

When user input exceeds available space:

```css
.form-input {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* But on multi-line (textarea), allow wrapping */
.form-input--textarea {
  white-space: normal;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
```

## Validation Rules

| Rule | Implementation |
|------|---------------|
| Required field | HTML `required` + visual asterisk on label + error message |
| Email format | `type="email"` + pattern validation on submit |
| Password strength | Show strength bar (min 8 chars, mix of upper/lower/number/symbol) |
| Character limit | Show counter: "X / Y characters" below input |
| Numeric input | `type="number"` + min/max attributes |

## Accessibility

- Label is always visible (not placeholder-only) — associated via `for`/`id` or wrapper
- Error messages use `aria-describedby` linking to the input
- On error, focus moves to the first invalid field with a scroll-to
- Error text starts with "Please fix:" and explains the specific issue
- Touch target minimum 44px height for all input states

## CSS Implementation Notes

```css
.form-input {
  width: 100%;
  padding: var(--ds-space-2) var(--ds-space-3);
  border: var(--input-border, 1px solid var(--ds-color-neutral-200));
  border-radius: var(--ds-space-2);
  font-family: var(--ds-font-family-sans);
  font-size: var(--ds-font-body);
  line-height: var(--ds-font-body-line-height);
  min-height: 44px; /* mobile touch target */
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.form-input:focus {
  border-color: var(--ds-color-brand-primary-500);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
  outline: none;
}

.form-input--error {
  border-color: var(--ds-color-error-500);
}

.form-input:disabled {
  background-color: var(--ds-color-neutral-100);
  color: var(--ds-color-neutral-400);
  cursor: not-allowed;
}
```
