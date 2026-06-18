```yaml
name: ui-best-practices
description: |
  Enforces UI completeness and resilience for every frontend feature. Apply whenever building or  modifying any UI component, form, screen, or route — even small ones. Covers the generic situations  that features consistently miss: loading states, error states with focus management, success feedback,  back/cancel navigation, image failure fallbacks, accessibility (fieldset legends, ARIA roles, keyboard  nav), and form validation. If you're about to write any JSX, HTML, or template code, use this skill.  Trigger on: "add a form", "build a screen", "create a component", "add a button", "upload", "submit",  any UI task, any frontend feature, any route with user interaction.
```

# UI Best Practices

Every feature must handle the full range of real-world situations, not just the happy path.

## The Checklist

Before marking any UI task complete, verify each item applies or is explicitly N/A.

### 1. Loading States

Every async operation needs a visual pending indicator.

- Disable interactive elements during in-flight requests to prevent double-submits.
- Change button labels to reflect the in-progress state ("Saving…", "Uploading…").
- Use the framework's built-in pending state (React Router `useNavigation()`, SvelteKit `$navigating`, etc.) rather than ad-hoc `useState` loading flags — framework state is always accurate.

```tsx
// React Router v7 example
const navigation = useNavigation();
const isSubmitting = navigation.state === 'submitting';

<button type="submit" disabled={isSubmitting}>
  {isSubmitting ? 'Saving…' : 'Save'}
</button>
```

### 2. Error States

Every form and async action must handle failure explicitly.

- Use `role="alert"` on error messages so screen readers announce them immediately when a form is submitted. The role="alert" does not need to be added to inline error messages on input.
- **Move focus to the error** after submission — don't let it appear silently above the fold. A user who submitted via keyboard will otherwise have no indication something failed.

```tsx
const errorRef = useRef<HTMLDivElement>(null);
const prevErrorRef = useRef<string | null>(null);

// Use error.message (a string) not the object reference — object identity
// changes on every render even when the error content is identical, causing
// repeated focus re-triggers.
useEffect(() => {
  if (error && error !== prevErrorRef.current) {
    prevErrorRef.current = error;
    errorRef.current?.focus();
  }
}, [error]);

{error && (
  <div ref={errorRef} role="alert" tabIndex={-1} className="...">
    {error}
  </div>
)}
```

- Never expose raw server error messages or stack traces to the user. Log server-side, show a generic message client-side.
- Distinguish error states from empty states — no data is not an error; render a helpful empty-state message instead.

### 2.5 Empty States

No data is not an error. Render a distinct empty state rather than nothing.

- Never show a spinner in place of an empty state.
- Include a CTA if there is an action the user can take to populate the list.
- Do not reuse the error component — use separate markup and separate copy.

```tsx
{items.length === 0 && !isLoading && !error && (
  <div className="empty-state">
    <p>No items yet.</p>
    <Link to="/new">Add your first item</Link>
  </div>
)}
```

### 3. Success Feedback

After a mutating action succeeds, the user must know.

- For in-page confirmation: use `role="status"` (announces politely, doesn't steal focus).
- For redirect-on-success: the destination must reflect the new persisted state.
- Show the submitted value back to the user when possible so they can verify what was saved.
- Auto-dismiss transient confirmations after 3–5 seconds. Never auto-dismiss if the message contains an action link.

```tsx
const [saved, setSaved] = useState(false);

useEffect(() => {
  if (saved) {
    const id = setTimeout(() => setSaved(false), 4000);
    return () => clearTimeout(id);
  }
}, [saved]);

{saved && (
  <p role="status" className="success-banner">
    Changes saved.
  </p>
)}
```

### 4. Back / Cancel Navigation

Every screen that can be "entered" must be exitable.

- Multi-step flows and forms need a back button or cancel link.
- Use the router's link component (`<Link>`, `<a href>`) — not `window.history.back()` which breaks SSR and is fragile.
- Expanded sections (drawers, slot pickers, modals) need a visible close affordance without scrolling.

**Modal / drawer focus trapping**

- Modals and drawers must trap focus: Tab cycles within the overlay, Escape closes it, and focus returns to the trigger element on close.
- Use a battle-tested primitive (Radix UI Dialog, Headless UI Dialog, or `focus-trap-react`) — don't hand-roll focus trapping.

**Destructive actions**

- Actions that are irreversible (delete, clear, disconnect) must have a confirmation step: either a dialog or an inline confirm/cancel pair.
- Prefer inline confirm over a modal for isolated item deletions to reduce context switching.
- Do not rely on the browser's `confirm()` — it blocks the thread and cannot be styled.

### 5. Image Failure Fallback

Images from external URLs must degrade gracefully. The `onError` event alone isn't enough — images that fail before React hydrates won't fire it.

```tsx
const imgRef = useRef<HTMLImageElement>(null);
const [imgError, setImgError] = useState(false);

// SSR-safe: check after hydration for already-broken images
useEffect(() => {
  if (imgRef.current?.complete && imgRef.current.naturalWidth === 0) {
    setImgError(true);
  }
}, []);

{src && !imgError ? (
  <img ref={imgRef} src={src} alt="..." onError={() => setImgError(true)} />
) : (
  <Fallback />  // initials, placeholder, silhouette
)}
```

### 6. Accessibility

**Error focus** — see §2 above. Move focus to errors on form submission failure.

**Keyboard accessibility**

- All interactive elements must be Tab-reachable and operable by Enter/Space.
- Never use `<div onClick>` or `<span onClick>` for buttons — use `<button>`.
- Collapsible sections: add `aria-expanded` to the trigger.
- Icon-only buttons: add `aria-label`.

**Grouped inputs (radio, checkbox)**

```html
<!-- Correct -->
<fieldset>
  <legend>Preferred contact method</legend>
  <label><input type="radio" name="contact" value="email"> Email</label>
  <label><input type="radio" name="contact" value="phone"> Phone</label>
</fieldset>

<!-- Wrong: aria-label on fieldset is not well-supported -->
<fieldset aria-label="Preferred contact method">...</fieldset>
```

**Field errors — `aria-describedby` and `aria-invalid`**

Link every field error to its input so screen readers announce it when focus is on the input, not just when the error appears:

```tsx
<label htmlFor="email">Email</label>
<input
  id="email"
  aria-describedby={emailError ? 'email-error' : undefined}
  aria-invalid={!!emailError}
/>
{emailError && (
  <p id="email-error" className="field-error">{emailError}</p>
)}
```

**ARIA roles**

- `role="alert"` → errors (reads immediately)
- `role="status"` → success/info (reads politely)
- `aria-live="polite"` → regions that update dynamically
- `aria-hidden="true"` → decorative SVGs and emoji
- `aria-pressed` → toggle buttons
- `aria-expanded` → collapsible triggers

**Heading hierarchy**

- One `<h1>` per page/screen.
- Never skip levels (h1 → h3).

### 7. Form Validation

- Always validate on the server — client validation is UX, not security.
- Use `noValidate` on forms to suppress browser-native validation bubbles and use your own styled errors.
- Show field-level errors adjacent to the relevant input, not just a single top-of-form banner.
- Set `required`, `type`, and `autoComplete` correctly on all inputs.
- Validate on submit (always) and on blur (per field, after first interaction). Do not validate on every keystroke — it flags errors before the user has finished typing.
- Once a field has an error, re-validate on change so the error clears immediately when corrected.

## Pre-Completion Mental Walkthrough

Before calling a UI feature done:

1. Walk through: loading → error → success → empty → back navigation
2. Tab through every interactive element — can you reach them all?
3. Every `<img>` — does it have a fallback?
4. Every radio/checkbox group — is it in a `<fieldset>` with a `<legend>`?
5. Submit button — does it disable or show loading state during submission?
6. Every field error — is it linked via `aria-describedby` and `aria-invalid`?
7. If the screen has a modal or drawer — can you Tab out of it? Does Escape close it?
8. If the list can be empty — is there a distinct empty-state message (not a spinner, not an error)?
9. Any destructive action — does it require confirmation before proceeding?