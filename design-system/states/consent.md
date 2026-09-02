# Consent State

Defines the behaviour of consent surfaces (cookie/analytics banners, marketing opt-in, age-gate interstitials). Driven by PRD §6c (which surfaces exist and their opt-in/opt-out model) and §6d (the locale-aware copy). Implemented visually by the [`consent-banner`](../components/consent-banner.md) component.

## When the Consent State Applies

| Scenario | Trigger | Model (from §6c) | Example |
|----------|---------|-------------------|---------|
| First visit (analytics) | No stored consent record | opt-in (opt-out in some residencies) | Cookie bar appears bottom/top |
| Marketing opt-in | Account creation / settings | opt-in | Checkbox pre-unchecked; never pre-checked |
| Age-gate | Age-restricted content viewed | required (no dismiss without a choice) | Full-screen interstitial |
| Consent withdrawn | User toggles a stored preference off | either | Affected third-party flows disabled within 30s (mirrors `phasing-plan.md` kill-switch rule) |

> **Opt-in vs. opt-out is a PRD §6c decision, not a Design Agent decision.** If §6c does not specify the model for a surface, raise an `open-questions.md` row (`blocker-for: design`) — do not default to opt-in.

## Consent State Structure

```html
<!-- Non-blocking bar -->
<aside role="dialog" aria-modal="false" aria-labelledby="consent-title" class="consent-banner" data-state="undecided">
  ...
</aside>

<!-- Blocking modal / age-gate -->
<div role="dialog" aria-modal="true" aria-labelledby="agegate-title" class="age-gate" data-state="undecided">
  ...
</div>
```

The `data-state` attribute transitions: `undecided` → `saving` → `saved` (or `saving` → `error`).

## State Variants

| State | Visual | Screen Reader | Focus Management |
|-------|--------|---------------|------------------|
| Undecided | Banner/modal renders; choices at defaults (opt-in → off, opt-out → on) | `role="dialog"` announced; title via `aria-labelledby` | On open, focus → title (bar) or first control (modal/age-gate). Bar is not a trap; modal/age-gate **is** a focus trap |
| Saving | Action buttons enter loading state (`loading.md`); interaction blocked | `aria-busy="true"` on banner | Focus stays on the pressed button |
| Saved | Banner/modal fades out (200ms, `interaction.md` timing) | `aria-live="polite"`: "Preferences saved" | Bar: focus → page top; Modal/age-gate: focus → the trigger element |
| Error (save failed) | error-50 bg tint + `role="alert"` message; raw error never shown (see `error.md`) | `role="alert"` announces "Couldn't save your preferences" | Focus stays on banner; Save re-enabled |
| Withdrawn (later session) | No banner re-shown; affected flows disabled | — | Persisted choice loaded before third-party scripts run |

## Consent Toggle States (each checkbox/radio)

| Sub-state | Visual | Screen Reader |
|-----------|--------|---------------|
| Opt-in default | Unchecked, neutral | `aria-checked="false"` |
| Opt-out default | Checked, neutral | `aria-checked="true"` |
| Selected | Checked, brand-primary accent on focus | `aria-checked="true"` |
| Disabled (during save) | Grayed, opacity 0.6, cursor not-allowed | `aria-disabled="true"`, removed from tab order |
| Required-not-yet-chosen (age-gate) | Radio unchecked; submit disabled until a choice | `aria-required="true"` on the group |

## Persistence Rule (non-negotiable)

- The consent record **must be persisted before the banner dismisses**, so a page refresh does not re-prompt the user.
- Third-party analytics/marketing scripts **must not load** until the matching consent choice is `true` — wire this to the `data-flow.md` §2 flow ids. This is the consent-state equivalent of the `phasing-plan.md` kill-switch ≤ 30s rule: withdrawal must disable the flow within 30 seconds.
- The persisted record stores: surface id, model, choice, timestamp, and the policy version accepted.

## Content Guidelines (copy comes from §6d)

- **Title, explanation, and toggle labels all come from PRD §6d** — locale-aware, with the §6d locale-fallback rule applying. Never hardcode English.
- Residency-aware copy: an opt-out region's banner must state the opt-out model ("You can opt out at any time…"), not opt-in language.
- The age-gate copy must state why age is required and what choosing confirms — per §6d age-gate behaviour.

## Consent State Tokens

| Token | Value | Purpose |
|-------|-------|---------|
| Banner bg | surface-elevated | Bar/modal panel background |
| Border | neutral-200 (1px) / warning-500 (4px opt-out stripe) | Bar border; opt-out-region indicator |
| Backdrop (modal/age-gate) | rgba(0,0,0,0.5) | Blocks interaction with page behind |
| Error tint | error-50 | Save-failure bg |
| Toggle accent | brand-primary-500 | Checked/focus accent |

## Testing Requirements

- [ ] Banner appears on first relevant view when no consent record exists; does **not** re-appear after a persisted choice
- [ ] Opt-in surfaces default OFF; opt-out surfaces default ON — matching §6c
- [ ] Modal/age-gate traps focus; ESC does not dismiss the age-gate; Tab cycles only inside it
- [ ] Bar is dismissable and not a focus trap (user can Tab past it)
- [ ] Save persists the record before dismiss; refresh does not re-prompt
- [ ] Third-party flows do not load until their consent choice is true; withdrawal disables them within 30s
- [ ] All copy matches PRD §6d for the active locale; locale fallback renders when translation missing
- [ ] Save failure shows `role="alert"` message, never a raw error
- [ ] Toggles are real `<input>` with visible `<label>` (no `<div onClick>`); 44px touch targets

## Cross-References

### Color tokens used (from `tokens/color.md`)
| Token | Shade | Where used |
|-------|-------|-----------|
| `--ds-color-surface-elevated` | white | Banner/modal/age-gate panel background |
| `--ds-color-neutral-200` | `#E5E5E5` | Bar border |
| `--ds-color-warning-500` | `#D97706` | Opt-out-region persistent stripe |
| `--ds-color-error-50` | `#FEF2F2` | Save-failure tint |
| `--ds-color-brand-primary-500` | brand | Toggle checked/focus accent |

### Rules governing this state
| Rule source | Specific requirement |
|-------------|---------------------|
| [`skills/accessibility-guidelines.md`](../../framework/design/skills/accessibility-guidelines.md) §Keyboard Accessibility + §Screen Reader Support | `role="dialog"` + `aria-modal`; focus trap for modal/age-gate; `aria-labelledby`/`aria-describedby`; visible labels on toggles; 44px touch targets |
| [`skills/ui-best-practices.md`](../../framework/design/skills/ui-best-practices.md) §2 Error States | Save-failure error state; never expose raw save error |
| [`../../PRD/templates/prd-template.md`](../../PRD/templates/prd-template.md) §6c | Source of truth for which consent surfaces exist and their opt-in/opt-out model |
| [`../../PRD/templates/prd-template.md`](../../PRD/templates/prd-template.md) §6d | Source of truth for all consent copy (locale-aware) + locale fallback + age-gate behaviour |
| [`../../PRD/templates/supporting/data-flow.md`](../../PRD/templates/supporting/data-flow.md) §2 | Flow ids the consent record controls; scripts must not load without matching consent |
| [`../../PRD/templates/supporting/phasing-plan.md`](../../PRD/templates/supporting/phasing-plan.md) | Kill-switch ≤ 30s rule applies to consent withdrawal (disable flow within 30s) |

### Components that use this state
| Component (from `components/`) | How consent appears | Dismissable? |
|-------------------------------|---------------------|--------------|
| `consent-banner.md` | Cookie bar / consent modal / age-gate — implements every variant above | Bar: yes; Modal: yes (after choice); Age-gate: no (must choose) |
| `navigation.md` | Footer Privacy link mirrors the banner's policy link destination; no consent UI itself | — |
| `button.md` | Save / Decline actions reuse the button loading + disabled states | — |

### Downstream consumers (QA test mapping)
| Test type | Playwright file | What it tests | Traces to PRD section |
|-----------|-----------------|--------------|----------------------|
| Consent E2E | `features/<feature>/consent.spec.ts` | First-visit banner shows; save persists; no re-prompt after refresh; opt-in defaults off, opt-out on | PRD §6c consent-surfaces table |
| A11y test | `features/<feature>/a11y.spec.ts` | `role="dialog"`/`aria-modal`; focus trap in age-gate; toggles are real inputs with labels; ESC does not close age-gate | `skills/accessibility-guidelines.md` §Keyboard Accessibility |
| Data-flow test | `features/<feature>/consent-flow.spec.ts` | Analytics/marketing scripts do not load before consent; withdrawal disables flow ≤ 30s | `data-flow.md` §2 + `phasing-plan.md` kill-switch rule |

### PRD input triggers
- PRD §6c (Privacy, cookie & consent UX): consent-surfaces table defines which surfaces exist and opt-in/opt-out model
- PRD §6d (Content, copy & localisation): all consent copy, locale fallback, age-gate behaviour
- PRD §9d (PII Data-Flow & Trust Boundaries): the third-party flows consent controls