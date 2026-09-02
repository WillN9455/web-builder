# Forbidden State (Permission Denied / 403)

Defines the behaviour when a user reaches a feature, route, or resource they lack permission for. Driven by PRD §9c (Roles & Permissions / RBAC matrix) — every route/handler must have a row in `rbac-matrix.md`, and an unscoped route is an IDOR waiting to happen (per `skills/general-best-practices.md`). Distinct from `empty.md` ("Hidden by permission" — where the UI never renders the item) and `error.md` (something broke): forbidden is a deliberate, recoverable access denial to a feature the user *can* see.

## When the Forbidden State Applies

| Scenario | Trigger | Who Decides | Recovery Action |
|----------|---------|-------------|-----------------|
| Route-level 403 | User navigates to a route their role can't access (per `rbac-matrix.md`) | Auth guard | Inline message + link to a permitted page or "Request access" |
| Action-level denial | User clicks an action (delete, export) their role can't perform | RBAC check on the handler | Disabled control with tooltip OR a confirmation explaining the denial |
| Resource-level denial (IDOR block) | User requests a resource by id they don't own / can't scope | Server scope check | "You don't have access to this" — no detail about whether it exists |
| Feature visible but locked | UI shows a feature the user's plan/role can't use | Plan/role gate | "Upgrade" / "Request access" CTA |

> **Never leak existence.** For an IDOR-blocked resource, the message is identical whether the resource is absent or merely forbidden — otherwise an attacker can enumerate by id. This mirrors `skills/security.md` §IDOR prevention.

## Forbidden State Structure

### Route-level (full-page 403)

```html
<div role="alert" class="forbidden forbidden--page">
  <div class="forbidden__illustration" aria-hidden="true">
    <!-- lock / shield SVG -->
  </div>
  <h2>{{ title — §6d copy, locale-aware }}</h2>
  <p>{{ explanation — what was denied and why, per §6d }}</p>
  <div class="forbidden__actions">
    <a href="/dashboard" class="btn btn-secondary">Go to dashboard</a>
    <a href="/request-access" class="link">Request access</a>
  </div>
</div>
```

### Action-level (disabled control)

```html
<button class="btn" disabled aria-disabled="true" aria-describedby="del-reason" title="{{ §6d denial copy }}">
  Delete
</button>
<span id="del-reason" class="sr-only">{{ why this action is unavailable to this role }}</span>
```

### Feature-locked (plan/role gate)

```html
<div class="forbidden forbidden--locked">
  <span class="forbidden__lock" aria-hidden="true">🔒</span>
  <h3>{{ feature name }}</h3>
  <p>{{ §6d upgrade/request copy }}</p>
  <button class="btn btn-primary">Upgrade to use this</button>
</div>
```

## State Variants

| Variant | Background | Border | Icon | CTA Required? |
|---------|-----------|--------|------|----------------|
| Full-page 403 | surface-default | none | Lock/shield SVG | Yes — link to a permitted page + optional "Request access" |
| Inline banner (route within a layout) | neutral-50 + 4px warning-500 left stripe | warning-500 | Shield | Yes — recovery link |
| Disabled control | (control's bg, opacity 0.6) | neutral-300 | — | No — tooltip/sr-only reason; never a dead disabled button without an explanation |
| Feature-locked card | neutral-100 | 1px neutral-200 + lock badge | Lock | Yes — "Upgrade" / "Request access" |

## Content Guidelines (copy comes from §6d)

- **All forbidden copy comes from PRD §6d** — locale-aware, with the §6d locale-fallback rule. Never hardcode English.
- Denial copy must state *what* was denied and *why* in plain language — but never reveal whether an IDOR-blocked resource exists.
- Distinguish from error copy (per `error.md`): forbidden is an expected, policy-driven outcome, not a system failure. Do not reuse the error-banner component — separate markup and copy (mirrors `empty.md`'s "do not reuse the error component" rule).

## Forbidden State Tokens

| Token | Value | Purpose |
|-------|-------|---------|
| Page bg | surface-default | Full-page 403 background |
| Inline stripe | warning-500 (4px) | Denial indicator (warning, not error — this is intentional, not broken) |
| Illustration/text | neutral-600 (title), neutral-400 (description) | Same hierarchy as `empty.md` |
| Disabled control | neutral-300 (border), neutral-400 (text), opacity 0.6 | Matches `interaction.md` Disabled state |

## Testing Requirements

- [ ] Every route listed in `rbac-matrix.md` returns the forbidden state for disallowed roles (not a 404, not a crash)
- [ ] IDOR-blocked resource returns the same message whether the resource is absent or forbidden (no existence leak)
- [ ] Disabled controls show an accessible reason (`aria-describedby` + visible tooltip or sr-only text) — no dead disabled buttons
- [ ] Full-page 403 has a recovery CTA (link to a permitted page or "Request access")
- [ ] `role="alert"` on full-page/inline forbidden so screen readers announce the denial
- [ ] All copy matches PRD §6d for the active locale; locale fallback renders when translation missing
- [ ] Forbidden is visually distinct from error (`error.md`) — warning stripe, not error-red banner

## Cross-References

### Color tokens used (from `tokens/color.md`)
| Token | Shade | Where used |
|-------|-------|-----------|
| `--ds-color-surface-default` | white / neutral-50 | Full-page 403 background |
| `--ds-color-neutral-600` | `#4B5563` | Forbidden title text |
| `--ds-color-neutral-400` | `#9CA3AF` | Forbidden description text |
| `--ds-color-warning-500` | `#D97706` | Inline banner left stripe (intentional denial, not a system error) |
| `--ds-color-neutral-300` | implied | Disabled-control border |

### Rules governing this state
| Rule source | Specific requirement |
|-------------|---------------------|
| [`../../PRD/templates/prd-template.md`](../../PRD/templates/prd-template.md) §9c | RBAC matrix is the source of truth for who can access what; every route/handler needs a row |
| [`../../PRD/templates/prd-template.md`](../../PRD/templates/prd-template.md) §6d | Source of truth for forbidden copy (locale-aware) + locale fallback |
| [`../../skills/security.md`](../../skills/security.md) §IDOR prevention | Never leak whether an IDOR-blocked resource exists; identical message for absent vs. forbidden |
| [`../../skills/accessibility-guidelines.md`](../../skills/accessibility-guidelines.md) §Screen Reader Support | `role="alert"` on full-page/inline forbidden; `aria-disabled` + `aria-describedby` reason on disabled controls |
| [`../../skills/ui-best-practices.md`](../../skills/ui-best-practices.md) §2 Error States | Forbidden is distinct from error — separate markup and copy; do not reuse the error-banner component |

### Components that use this state
| Component (from `components/`) | How forbidden appears | Recovery action |
|-------------------------------|-----------------------|-----------------|
| `navigation.md` | Route guard renders full-page 403 instead of the disallowed page; disabled nav item uses `aria-disabled` + reason | Link to a permitted page |
| `button.md` | Disabled action button (`aria-disabled="true"`) with `aria-describedby` reason tooltip | "Request access" link or plan-upgrade CTA |
| `card.md` | Feature-locked card variant — lock badge + upgrade CTA over the feature | "Upgrade" / "Request access" button |

### Downstream consumers (QA test mapping)
| Test type | Playwright file | What it tests | Traces to PRD section |
|-----------|-----------------|--------------|----------------------|
| Authz E2E | `features/<feature>/authz.spec.ts` | Each role in `rbac-matrix.md` gets forbidden on disallowed routes/actions; allowed roles succeed | PRD §9c RBAC matrix |
| IDOR test | `features/<feature>/idor.spec.ts` | Requesting another user's resource returns forbidden; message identical whether resource exists or not | `skills/security.md` §IDOR prevention |
| A11y test | `features/<feature>/a11y.spec.ts` | `role="alert"` on full-page 403; disabled controls expose reason via `aria-describedby` | `skills/accessibility-guidelines.md` §Screen Reader Support |

### PRD input triggers
- PRD §9c (Roles & Permissions / RBAC): the role × permission matrix that decides who is forbidden from what
- PRD §6d (Content, copy & localisation): forbidden copy + locale fallback
- PRD §5 (Target Users) → §9c persona→role mapping: which personas hit which forbidden states