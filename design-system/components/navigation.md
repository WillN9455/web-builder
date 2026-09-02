# Navigation Component

## Types

| Type | File Section | Where Used |
|------|-------------|------------|
| Header Nav | Main top navigation | Every page with nav |
| Mobile Menu | Hamburger drawer/overlay | Mobile breakpoint |
| Breadcrumbs | Page-level path indicator | Inner pages (not homepage) |
| Footer Nav | Site-wide footer links | Every page |

## Header Navigation — Props API

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `logo` | `ReactNode` | — | Brand logo (linked to home) |
| `links` | `NavLink[]` | — | Array of nav items |
| `actions` | `ReactNode[]` | — | Right-aligned CTAs (login, signup) |
| `sticky` | `boolean` | `false` | Sticks to top on scroll |

## NavLink Structure

```ts
interface NavLink {
  label: string;
  href: string;
  active?: boolean;    // current page indicator
  children?: NavLink[]; // dropdown items
  external?: boolean;   // opens in new tab
  icon?: string;        // optional leading icon
}
```

## Header Variants

| Variant | Background | Border | Usage |
|---------|-----------|--------|-------|
| Default | transparent | none | Hero sections with background image |
| Solid | white or brand-primary-900 | 1px neutral-200 | Standard pages |
| Frosted | glassmorphism (backdrop-filter) | none | Transparent-over-image header |

## Mobile Menu States

| State | Position | Background | Trigger |
|-------|----------|-----------|---------|
| Closed | Off-screen (-100%) | neutral-50 | Tap hamburger icon |
| Open | Full viewport | neutral-50 + overlay | Tap hamburger icon |
| Scrolling | Locked body scroll | — | Content overflows |

### Mobile Menu Item States

| State | Visual | Touch Target |
|-------|--------|-------------|
| Default | neutral-800, padding 16px | min-height 44px |
| Active/Current | brand-primary-500 left border (4px) | — |
| Hover/Active | neutral-200 background | — |
| With dropdown arrow | Chevron rotates 180° on open | Arrow min-width 44px |

## Breadcrumbs Structure

```html
<nav aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Home</a></li>
    <li><a href="/section">Section</a></li>
    <li aria-current="page">Current Page</li>
  </ol>
</nav>
```

## Breadcrumb States

| State | Visual |
|-------|--------|
| Link | brand-primary-500, underlined on hover |
| Current | neutral-600, no underline, aria-current="page" |
| Separator | neutral-400 chevron or slash between items |

## Footer Navigation Structure

```
<footer>
  <div columns="auto">              /* brand column */
    <Logo>
    <Description>
    <SocialLinks>
  </div>
  <div columns="repeat(4, auto)">  /* link groups */
    <nav aria-label="Product">      /* each group */
      <h3>Product</h3>
      <ul><li><a>Features</a></li></ul>
    </nav>
  </div>
  <div bottom-bar>                  /* legal row */
    <p>© Year Brand. All rights reserved.</p>
    <nav aria-label="Legal">        /* Privacy, Terms links */
  </div>
</footer>
```

## Required States (All Navigation Types)

| State | Visual Treatment | Screen Reader |
|-------|-----------------|---------------|
| Default | per variant table | — |
| Hover | underline or background change | — |
| Focus-visible | 2px ring, offset 2px | — |
| Active/Current | bold text + bottom indicator bar | aria-current="page" on current |
| Disabled (future feature) | neutral-400, cursor not-allowed | aria-disabled="true" |

## Accessibility

- Skip navigation link as first focusable element: `<a href="#main" class="skip-link">Skip to main content</a>`
- Landmarks: `<nav>` with `aria-label` on every navigation region
- Mobile menu: when open, focus moves inside the menu (trap focus); ESC closes it
- Breadcrumbs: `<nav aria-label="Breadcrumb">` with proper list structure
- Footer nav links use semantic `<nav>` elements with labels
- Minimum touch target: 44x44px for all navigation items on mobile
- Logo must be a link to the homepage with `aria-label="Home"`

## CSS Implementation Notes

```css
/* Header base */
.header {
  position: var(--header-position, static);
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 72px;       /* standard header height */
  padding: 0 var(--ds-space-8);
  background: var(--header-bg, transparent);
}

.header--sticky {
  position: sticky;
  z-index: 50;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* Mobile hamburger */
.hamburger {
  display: none;         /* hidden on desktop */
  width: 44px;
  height: 44px;
  background: none;
  border: none;
  cursor: pointer;
}

@media (max-width: 768px) {
  .hamburger { display: flex; }
  .header__nav-desktop { display: none; }
  .header__mobile-menu {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    z-index: 100;
    transform: translateX(-100%);
    transition: transform 200ms ease;
  }
  .header__mobile-menu[open] {
    transform: translateX(0);
  }
}

/* Breadcrumbs */
.breadcrumbs {
  font-size: var(--ds-font-size-sm);
  color: var(--ds-color-neutral-600);
}
.breadcrumbs li + li::before {
  content: "/";
  margin: 0 var(--ds-space-2);
  color: var(--ds-color-neutral-400);
}
```

## Token Mapping (which tokens each component uses)

| Component | Color tokens (from `tokens/color.md`) | Spacing token (from `tokens/spacing.md`) |
|-----------|---------------------------------------|------------------------------------------|
| Header nav | brand-primary-900 (solid bg), neutral-200 (border), brand-primary-500 (active indicator) | height: space-18, padding: 0/space-8 |
| Breadcrumbs | neutral-600 (text), brand-primary-500 (link), neutral-400 (separator) | separator margin: space-2 |
| Footer nav | neutral-600 (links on white bg), neutral-400 (social/icon links) | Column gap per grid spacing |

## Related Files

| File | Relationship |
|------|-------------|
| [`../tokens/color.md`](../tokens/color.md) §Brand + Neutral Palettes | Active state indicator, link colors, hover states, surface bg |
| [`../tokens/spacing.md`](../tokens/spacing.md) | Header height (space-18 = 72px), nav item padding (space-4), breadcrumb separator gap (space-2) |
| [`states/error.md`](../states/error.md) | Navigation error state: banner if nav data fails to load |
| [`states/loading.md`](../states/loading.md) | Nav skeleton/shimmer during SSR or initial fetch |
| [`states/interaction.md`](../states/interaction.md) required states table | Default/hover/focus/active/disabled for all nav items |
| [`skills/accessibility-guidelines.md`](../../framework/design/skills/accessibility-guidelines.md) §Keyboard Accessibility + §Screen Reader Support | Skip navigation link (first focusable), landmark `<nav>` with aria-label, focus trap in mobile menu, ESC closes, touch targets ≥44px |
