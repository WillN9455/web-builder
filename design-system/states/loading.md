# Loading State

## Types of Loading

| Type | When It Appears | Duration Expectation | Pattern |
|------|-----------------|---------------------|---------|
| Page loading | Initial page render, navigation between pages | < 3s standard; > 3s needs progress indicator | Full-screen overlay or skeleton |
| Component loading | Data fetch within a page component | < 2s per request | Inline skeleton/spinner |
| Form submission | User clicks submit, await response | Unknown — show progress bar | Spinner + "Processing..." text |
| File upload | Drag-drop or browse for file | Variable (size-dependent) | Per-file progress bar with percentage |
| Infinite scroll / load more | Scrolling past threshold | < 2s per batch | Bottom-of-list spinner |

## Loading Patterns

### Skeleton (preferred for content areas)

```html
<!-- Text skeleton -->
<div class="skeleton skeleton--text" style="width: 80%;" />
<!-- Avatar skeleton -->
<div class="skeleton skeleton--circle" style="width:48px; height:48px;" />
<!-- Image card skeleton -->
<div class="skeleton-card">
  <div class="skeleton skeleton--image" />
  <div class="skeleton skeleton--text" style="width:60%;" />
  <div class="skeleton skeleton--text" style="width:40%;" />
</div>
```

Skeleton token values:
| Token | Value | Purpose |
|-------|-------|---------|
| `--ds-skeleton-bg` | neutral-200 (#E5E5E5) | Base shimmer color |
| `--ds-skeleton-highlight` | neutral-100 (#F5F5F5) | Shimmer animation highlight |
| Animation | 1.5s infinite alternate linear | Gradient shift across skeleton |

### Spinner (for actions, buttons, standalone)

| Size | Diameter | Stroke Width | Use Case |
|------|----------|-------------|----------|
| sm | 16px | 2px | Button loading, inline |
| md | 24px | 3px | Standard component loading |
| lg | 40px | 4px | Page/section loading |

Spinner tokens:
| Token | Value | Purpose |
|-------|-------|---------|
| `--ds-spinner-color` | brand-primary-500 or neutral-600 (page-level) | Spinner color |
| Animation | 0.8s linear infinite | Rotation speed — never faster than 0.6s |

### Progress Bar (for known duration operations)

```html
<div class="progress-bar" role="progressbar" aria-valuenow="45" aria-valuemin="0" aria-valuemax="100">
  <div class="progress-bar__fill" style="width: 45%;" />
</div>
```

Progress bar tokens:
| Token | Value | Purpose |
|-------|-------|---------|
| Height | 4px (thin) / 8px (prominent) | Bar thickness |
| Color | brand-primary-500 or semantic color matching context | Fill color |
| Border radius | space-2 (rounded ends) | Aesthetic polish |

### Full Page Loading

For page-level loading (> 1s):
1. Show centered spinner (lg size, brand-primary-500 color)
2. Below spinner: "Loading..." text with skeletonized page title/heading
3. After 3s: show "This is taking longer than usual" + "Refresh" button option

## File Upload Loading States

| Progress | Display |
|----------|---------|
| 0-25% | Filename + progress bar (thin, blue) + percentage text |
| 26-75% | Filename + progress bar (full width) + percentage text + cancel button |
| 76-99% | Filename + progress bar + "Almost done..." |
| 100% | Checkmark icon (success-green) + filename + "Uploaded" label |

## Loading Accessibility

- **Never use a spinner alone** — always include visible text ("Loading...", "Processing...")
- Use `aria-busy="true"` on loading elements
- Use `role="progressbar"` with aria-valuenow when percentage is known
- Don't block interaction while loading unless it's a full-page action (provide cancel option)
- Skeletons should approximate the layout of content that will appear (maintain structure)

## Testing Requirements

- [ ] All loading states have visible text labels (never icons only)
- [ ] Skeletons match the structural layout of real content
- [ ] Spinner animation is ≤ 0.8s rotation speed (fast enough to not feel stuck, slow enough to not feel frantic)
- [ ] Page-level loading has a recovery option after 3 seconds
- [ ] No blank flashes between loading state and rendered content

## Cross-References

### Color tokens used (from `tokens/color.md`)
| Token | Shade | Where used |
|-------|-------|-----------|
| `--ds-color-neutral-100` | `#F5F5F5` | Skeleton highlight shimmer |
| `--ds-color-neutral-200` | `#E5E5E5` | Skeleton base color |
| `--ds-color-brand-primary-500` | brand variant | Spinner color, progress bar fill |
| `--ds-color-neutral-600` | `#4B5563` | Spinner color (page-level) |

### Rules governing this state
| Rule source | Specific requirement |
|-------------|---------------------|
| [`skills/accessibility-guidelines.md`](../../framework/design/skills/accessibility-guidelines.md) §Screen Reader Support | Use `aria-busy="true"` on loading elements; never block interaction without cancel option |
| [`skills/ui-best-practices.md`](../../framework/design/skills/ui-best-practices.md) §1 Loading States | Disable interactive elements during in-flight requests; change button labels to "Saving…"/"Processing…" during loading |
| `skills/security.md` §9 No Hardcoded Secrets | Spinner/loading color tokens come from CSS custom properties, not hardcoded values |

### Components that use this state
| Component (from `components/`) | How loading appears | Recovery action |
|-------------------------------|--------------------|-----------------|
| `button.md` | Loading overlay on button face; spinner icon; "Saving…"/"Uploading…" label change | Cancel if supported; retry after failure |
| `card.md` | Skeleton placeholder bars matching card shape; inline spinner for component fetch | Refresh data source; navigate away from stale content |
| `form-input.md` | Not typically used on individual inputs — loading appears on submit button instead | See button loading behavior |
| `navigation.md` | Nav shimmer/skeleton during initial SSR or page transition | Auto-resolves when nav data loads; "Reconnect" if persistent failure |

### Downstream consumers (QA test mapping)
| Test type | Playwright file | What it tests | Traces to PRD section |
|-----------|-----------------|--------------|----------------------|
| State test | `features/<feature>/states.spec.ts` | Loading state duration, spinner animation speed, recovery option timing | PRD §6 UX Principles (timing expectations) |
| E2E test | `features/<feature>/e2e.spec.ts` | Full flow: loading → data arrives → content renders; no blank flash between states | PRD §8 User Story #N (happy path timing) |

### PRD input triggers
- PRD Section 6 UX Principles: "Page loading states" and "Specific component loading state" sections define expected behavior
- PRD Section 12 Assumptions: any network latency assumptions (e.g., "API responds within 2s under normal load")
