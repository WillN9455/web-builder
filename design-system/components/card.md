# Card Component

## Props API

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'elevated' \| 'filled'` | `'default'` | Visual treatment |
| `interactive` | `boolean` | `false` | Makes entire card clickable |
| `href` | `string` | — | Anchor URL if interactive (renders as `<a>`) |
| `children` | `ReactNode` | — | Card content (header, body, footer slots) |
| `padding` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'` | Internal padding |

## Variants

| Variant | Background | Border | Shadow | Elevation |
|---------|-----------|--------|--------|-----------|
| Default | transparent | 1px neutral-200 | none | 0 |
| Elevated | white | 1px neutral-200 | 0 1px 3px rgba(0,0,0,0.1) | 1 |
| Filled | neutral-100 | none | none | 0 |

## Internal Structure

```
<Card>
  <Card.Header>    /* optional: icon, title, actions */
  <Card.Body>      /* required: main content */
  <Card.Footer>    /* optional: buttons, meta info */
</Card>
```

## Sizes (Padding)

| Size | Padding (px) | Use Case |
|------|-------------|----------|
| none | 0 | Dense data cards, compact lists |
| sm | 12px | Secondary content containers |
| md | 24px | Standard card content |
| lg | 32px | Hero/prominent cards |

## Required States

| State | Visual Treatment | When to Use |
|-------|-----------------|-------------|
| Default | As defined in variants table | Normal display |
| Hover (interactive) | shadow increases to 0 4px 12px rgba(0,0,0,0.15) + cursor pointer | Cards with href or onClick |
| Loading | Skeleton placeholder bars matching card shape | Content not yet fetched |
| Empty | Card body shows empty state illustration + "No data" text | No content to display |
| Error | Red border (2px error-500) + error banner in body | Failed content load |

## Accessibility

- If `interactive`, card must be keyboard-focusable and activatable with Enter/Space
- Cards with complex content should NOT be fully interactive — use contained buttons instead
- Empty state must have actionable CTA (not just text)
- Cards displaying data must have proper heading hierarchy within

## CSS Implementation Notes

```css
.card {
  background: var(--card-bg, transparent);
  border: var(--card-border, 1px solid var(--ds-color-neutral-200));
  border-radius: var(--ds-space-3);
  padding: var(--card-padding, var(--ds-space-6));
}

.card--interactive {
  cursor: pointer;
  transition: box-shadow 150ms ease;
}

.card--interactive:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card--elevated {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
```
