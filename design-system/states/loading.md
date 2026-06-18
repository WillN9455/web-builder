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
