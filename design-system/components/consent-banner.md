# Consent Banner Component

## Types

| Type | File Section | Where Used |
|------|-------------|------------|
| Cookie / Analytics Banner | Bottom or top floating bar | First visit to any page (§6c cookie banner surface) |
| Consent Dialog | Centered modal | Marketing email opt-in, terms acceptance before a gated action |
| Age-Gate Interstitial | Full-screen overlay | Age-restricted content / residency-gated entry (§6c age-gate behaviour) |

> **Source of truth:** PRD §6c (Privacy, cookie & consent UX) defines which consent surfaces exist, their opt-in vs. opt-out model, and the residency-aware copy. The `data-flow.md` §2 analytics flow lists the third parties a banner controls. Do not invent consent surfaces the PRD did not list — raise an `open-questions.md` row (`blocker-for: design`) instead.

## Cookie / Analytics Banner — Props API

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `surfaces` | `ConsentSurface[]` | — | One entry per §6c consent surface (cookie banner, marketing opt-in, etc.) |
| `policyUrl` | `string` | — | Link to privacy/cookie policy (required) |
| `position` | `"bottom" \| "top"` | `"bottom"` | Bar placement |
| `dismissible` | `boolean` | `true` | Whether the user can close without choosing (opt-out regions: `false`) |
| `onSave` | `(choices) => void` | — | Emits the user's choices; Code Agent wires to the consent store |

### ConsentSurface Structure

```ts
interface ConsentSurface {
  id: string;            // matches §6c consent-surfaces table + data-flow.md §2 flow id
  kind: "cookie" | "marketing" | "age-gate";
  model: "opt-in" | "opt-out";  // from §6c — residency-aware
  label: string;         // copy from PRD §6d (locale-aware)
  defaultOn: boolean;    // opt-out → true; opt-in → false
}
```

## Cookie Banner Structure

```html
<aside role="dialog" aria-modal="false" aria-labelledby="consent-title" class="consent-banner">
  <div class="consent-banner__body">
    <h3 id="consent-title">{{ copy from §6d — locale-aware }}</h3>
    <p>{{ explanation of what each surface controls, from §6d copy rules }}</p>
    <fieldset class="consent-banner__choices">
      <legend class="sr-only">Consent choices</legend>
      <label class="consent-toggle">
        <input type="checkbox" name="analytics" />
        <span>Analytics cookies</span>
      </label>
      <label class="consent-toggle">
        <input type="checkbox" name="marketing" />
        <span>Marketing emails</span>
      </label>
    </fieldset>
  </div>
  <div class="consent-banner__actions">
    <a href="/privacy" class="link">Privacy policy</a>
    <button class="btn btn-secondary">Decline all</button>
    <button class="btn btn-primary">Save preferences</button>
  </div>
</aside>
```

## Variants

| Variant | Background | Border | Usage |
|---------|-----------|--------|-------|
| Default (bar) | surface-elevated (white) + 1px neutral-200 top border | 4px neutral-200 | Standard bottom/top cookie bar |
| Persistent (opt-out region) | surface-elevated + 4px warning-500 left stripe | warning-500 | Residency where dismissal alone is not enough (copy must state the opt-out model) |
| Modal (consent dialog) | backdrop: rgba(0,0,0,0.5); panel: surface-elevated | 1px neutral-200 | Marketing opt-in / terms acceptance before a gated action |
| Age-gate (full screen) | surface-default full viewport | none | Age-restricted content; blocks all other interaction until resolved |

## Age-Gate Interstitial

```html
<div role="dialog" aria-modal="true" aria-labelledby="agegate-title" class="age-gate">
  <div class="age-gate__card">
    <h2 id="agegate-title">{{ §6d age-gate copy — residency-aware }}</h2>
    <p>{{ why age is required }}</p>
    <form class="age-gate__form">
      <label class="consent-toggle">
        <input type="radio" name="age" value="confirm" required />
        <span>I am old enough to view this content</span>
      </label>
      <button class="btn btn-primary" type="submit">Continue</button>
    </form>
  </div>
</div>
```

Age-gate **traps focus** and must not be dismissable without a choice (unlike the cookie bar).

## Required States (All Consent Types)

| State | Visual Treatment | Screen Reader | Focus Management |
|-------|-----------------|---------------|-----------------|
| Default (not yet decided) | Visible per variant; bar/modal renders on first relevant view | `role="dialog"`; `aria-labelledby` on title | On open, focus moves to the banner/dialog title or first interactive control |
| Accept / Decline pressed | Bar/modal dismisses with 200ms fade (see `interaction.md` §State Transition Timing) | `aria-live="polite"` announces "Preferences saved" | Focus returns to the element that opened the dialog (modal/age-gate) or to page top (bar) |
| Hover (action buttons) | Per `button.md` hover rule | — | — |
| Focus-visible | 2px brand-primary-500 ring, offset 2px | — | Tab order: choices → links → primary action |
| Disabled (during save) | Buttons enter `loading` state (`loading.md`) — interaction blocked | `aria-busy="true"` on banner | — |
| Error (save failed) | error-50 banner bg tint + `role="alert"` message | `role="alert"` announces failure; do not leak raw error (see `error.md`) | Focus stays on banner; retry re-enabled |

Full state semantics (consent opt-in/opt-out toggles, age-gate, dismiss behaviour) are defined in [`states/consent.md`](../states/consent.md) — this component must implement every state listed there.

## Accessibility

- `<aside role="dialog">` (non-blocking bar) or `<div role="dialog" aria-modal="true">` (modal/age-gate) — the PRD consent-surfaces table determines which.
- `aria-labelledby` points to the banner title (the `h3`/`h2`); `aria-describedby` points to the explanation paragraph.
- Toggle checkboxes are real `<input type="checkbox">` with visible `<label>` — never a `<div onClick>`. Grouped toggles use `<fieldset>` + `<legend class="sr-only">`.
- The age-gate is a modal: focus is trapped while open, ESC does **not** close it (no dismiss without a choice), and `Tab` cycles only within the gate.
- The cookie bar is not a focus trap: the user may Tab past it to the page content; it is dismissable.
- All copy comes from PRD §6d (locale-aware); the locale fallback rule in §6d applies — never hardcode English.
- Consent state must be persisted (per `states/consent.md` persistence rule) before the banner dismisses, so a refresh does not re-prompt.

## CSS Implementation Notes

```css
.consent-banner {
  position: fixed;
  inset: auto 0 0 0;            /* bottom bar; swap to top 0 for position="top" */
  z-index: 60;
  display: flex;
  gap: var(--ds-space-6);
  padding: var(--ds-space-6) var(--ds-space-8);
  background: var(--ds-color-surface-elevated);
  border-top: 1px solid var(--ds-color-neutral-200);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
}
.consent-banner--persistent {              /* opt-out region variant */
  border-left: 4px solid var(--ds-color-warning-500);
}
.consent-banner__choices {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-2);
}
.consent-toggle {
  display: flex;
  align-items: center;
  gap: var(--ds-space-3);
  min-height: 44px;                        /* touch target */
}

/* Modal / age-gate backdrop */
.consent-modal__backdrop,
.age-gate {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.5);
}
.age-gate__card {
  background: var(--ds-color-surface-elevated);
  border: 1px solid var(--ds-color-neutral-200);
  border-radius: var(--ds-space-3);
  padding: var(--ds-space-8);
  max-width: 420px;
  width: calc(100% - var(--ds-space-12));
}
```

## Token Mapping (which tokens each component uses)

| Component part | Color tokens (from `tokens/color.md`) | Spacing tokens (from `spacing.md`) |
|----------------|---------------------------------------|--------------------------------------|
| Banner bar | surface-elevated (bg), neutral-200 (border) | space-6/space-8 padding, space-6 gap |
| Persistent stripe | warning-500 (left stripe) | 4px stripe |
| Modal / age-gate panel | surface-elevated (bg), neutral-200 (border) | space-8 padding, space-3 radius |
| Action buttons | brand-primary (primary), neutral palette (secondary) | see `button.md` |
| Save-failure tint | error-50 (bg) | — |

## Related Files

| File | Relationship |
|------|-------------|
| [`../states/consent.md`](../states/consent.md) | Defines the consent state semantics this component implements (opt-in/opt-out, age-gate, persistence) |
| [`../tokens/color.md`](../tokens/color.md) §Surface + Neutral + Warning | Banner/panel backgrounds, borders, opt-out-region stripe |
| [`button.md`](./button.md) | Save / Decline actions use the button component's primary/secondary variants + loading state |
| [`navigation.md`](./navigation.md) §Footer Nav | Footer links to privacy policy; the banner's policy link should match the footer's Privacy link destination |
| [`../../PRD/templates/prd-template.md`](../../PRD/templates/prd-template.md) §6c | Source of truth for which consent surfaces exist and their opt-in/opt-out model |
| [`../../PRD/templates/prd-template.md`](../../PRD/templates/prd-template.md) §6d | Source of truth for all consent copy (locale-aware) and locale fallback |
| [`../../PRD/templates/supporting/data-flow.md`](../../PRD/templates/supporting/data-flow.md) §2 | Lists the third-party analytics/marketing flows a banner controls — `surfaces[].id` must match these flow ids |
| [`../../framework/design/skills/accessibility-guidelines.md`](../../framework/design/skills/accessibility-guidelines.md) §Keyboard Accessibility + §Screen Reader Support | Focus trap for modal/age-gate; `role="dialog"` + `aria-modal`; visible labels on toggles; 44px touch targets |
| [`../../framework/design/skills/ui-best-practices.md`](../../framework/design/skills/ui-best-practices.md) §2 Error States | Save-failure error state; never expose raw save error to the user |