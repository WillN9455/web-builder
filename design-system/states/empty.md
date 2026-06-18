# Empty State

## When to Show Empty States

| Scenario | Trigger | Example |
|----------|---------|---------|
| No data available | API returns empty array/object | "No projects yet" on a new account |
| Filtered results | All filters applied, nothing matches | "No items match your search" |
| Hidden by permission | User lacks access to see content | "Only admins can view analytics" |
| Fresh start guide | First-time user, no prior data | "Get started — create your first item" |

## Empty State Structure

```html
<div class="empty-state">
  <div class="empty-state__illustration" aria-hidden="true">
    <!-- Simple line-art SVG illustration -->
  </div>
  <h3>{{ title }}</h3>
  <p>{{ description }}</p>
  {{!-- Action is REQUIRED if the empty state is permanent --}}
  <button class="btn btn-primary">Create Your First Item</button>
  <a href="/help" class="link">Learn more about getting started</a>
</div>
```

## Empty State Variants

| Scenario | Illustration Style | Title Pattern | CTA Required? |
|----------|-------------------|--------------|---------------|
| Brand new user | Friendly character/action illustration | "Get started with..." | Yes — primary action button |
| No data (can add more) | Simple icon + abstract shapes | "No [item type] yet" | Yes — "Add first [item]" button |
| Filtered to nothing | Search/magnifying glass icon | "No results for '[query]'" | Yes — clear filters or try different search |
| Permission restricted | Lock/shield icon | "You don't have access" | Maybe — link to request access |

## Empty State Content Guidelines

**Title:**
- Start with the verb or what's missing: "No messages", "Nothing here yet", "No matches found"
- Never say "Empty" — it's not user-facing language
- Keep under 6 words

**Description:**
- Explain why it's empty and what to do about it
- Max 2 sentences
- Use friendly, helpful tone (not robotic)

**CTA:**
| CTA Type | When to Use | Example Text |
|----------|------------|-------------|
| Primary action | Main next step the user should take | "Create your first project" |
| Secondary link | Optional exploration | "See what's possible" or "View demo data" |
| No CTA | Informational empty (no action available) | None — just title + description |

## Empty State Tokens

| Token | Value | Purpose |
|-------|-------|---------|
| `--ds-empty-text` | neutral-600 (#4B5563) | Title color |
| `--ds-empty-description` | neutral-400 (#9CA3AF) | Description color (lighter for hierarchy) |
| Illustration max-width | 200px | Keep illustrations proportional |
| Min padding | space-12 vertical, space-8 horizontal | Generous whitespace around empty content |

## Empty State Testing Requirements

- [ ] Every empty state has an actionable CTA (except permanent informational empties)
- [ ] CTA text clearly states what action will create content
- [ ] Empty illustrations use SVGs (not raster images) — simple, scannable line-art style
- [ ] Empty states are responsive: illustration scales down on mobile, content stacks vertically
- [ ] Placeholder/empty text is not shown as placeholder in actual inputs (only for display areas)
