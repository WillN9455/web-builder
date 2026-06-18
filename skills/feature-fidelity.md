```yaml
name: feature-fidelity
description: |
  Prevents two recurring failure modes when implementing features: (1) design drift — the code "works"  but doesn't match the spec; (2) regression — adding a new feature silently removes or breaks an  existing one. Apply before implementing any new feature, extending an existing component or route,  or modifying shared code. Critical for: following designs faithfully, preserving existing UI/behaviour,  and ensuring UI state is persisted to the database rather than living only in ephemeral React/component  state. Trigger on: "build a screen", "implement screen", "build a feature", "add X to the existing Y", "extend", "modify", "update the screen", any feature  that touches an already-written file.
```

# Feature Fidelity

Two recurring failure modes this skill prevents:

1. **Design drift** — the implementation is functionally OK but visually or behaviourally wrong.
2. **Regression** — a new feature quietly removes or alters something that was already working.

---

## Before Writing Any Code

### 1. Read the Design First

The design document is the source of truth for output. Before writing any code:

- Open the relevant design file (Figma export, HTML mockup, spec doc, whatever exists).
- If no design file exists, derive the expected screen states from the spec or conversation and list them explicitly before continuing. Treat that list as your design source of truth.
- List every screen **state** the design shows (e.g. AVAILABLE, OFFLINE, LOADING, EMPTY, ERROR, booked, confirmed, etc.). You will implement all of them.
- Note exact copy — button labels, section headings, error messages. Do not paraphrase.
- Note exact visual tokens — colours, spacing, border radii. Use these values; do not substitute similar ones.

### 2. Audit the Existing Code Before Touching It

Before modifying any existing file:

1. **Read the entire file** — not just the section you plan to change.
2. List every UI element currently rendered.
3. List every state variable and where it's initialised from.
4. List every action/mutation handler (form submits, API calls, event handlers).

After your change, none of those items may be missing or silently altered unless explicitly required.

If the design and existing code conflict, flag the discrepancy in your response before proceeding. Do not silently resolve it by picking one — surface it to the user.

This matters most for:

- **Files with multiple action intents** — adding a new one must not break existing ones.
- **Shared components** — changes affect every caller.
- **Loaders/data-fetching** — adding a new field must not lose existing fields.

### 3. Tie UI to Persisted State, Not Ephemeral State

If the feature involves persisting something (a booking, a preference, a step flag), the UI must reflect the database value — not just local component state. Local state is lost on page refresh.

**Wrong — state is ephemeral:**

```tsx
const [confirmed, setConfirmed] = useState(false);
// Lost on refresh. User who navigates away sees wrong state.
```

**Right — state is derived from server/DB:**

```tsx
// In loader: read confirmedAt from DB → pass in loaderData
// In component:
const confirmed = (actionData?.ok ? true : null) ?? loaderData.confirmedAt !== null;
// actionData.ok wins immediately post-submit; loaderData covers all other renders.
```

The pattern: action response wins immediately (so the UI feels instant); loader data covers page reload, direct navigation, and anything after the action response is gone.

---

## During Implementation

### Follow All Design States

For each state you listed in step 1, implement an explicit code path. Do not skip states because they seem unlikely or edge-case. Common omissions:

- Error/fallback states (no data, API failure, empty list)
- Confirmation/booked states (feature already applied)
- Offline or degraded states

### Match Copy and Layout Exactly

- Copy section labels, button text, banner copy verbatim from the design.
- If the design specifies element ordering — replicate it.
- If the design shows both a "pending" and a "confirmed" visual state of the same element — implement both.

### Do Not Remove Existing Elements

If a component currently renders a progress indicator, a warning banner, a tag list, a secondary CTA, or anything else — it must still render after your change. If you're unsure whether an element is intentional, it is. Leave it.

---

## After Implementation

### Regression Check

Walk through every flow the modified file is part of:

- Does the primary happy path still work end-to-end?
- Do all existing action intents still respond correctly?
- Does every existing UI element still render?
- Does page refresh show correct state (loader-driven, not local state)?

### Design Diff Check

Compare your output to the design side-by-side mentally:

- Is every section from the design present?
- Is the element order correct?
- Are exact visual token values used?

### Loader Completeness

If you added a new persisted field, confirm:

- The loader reads it from the DB.
- The component receives it from the loader.
- A page refresh shows the same state as the post-action render.
```

## Related Files

| File | Relationship |
|------|-------------|
| [`../PRD/templates/prd-template.md`](../PRD/templates/prd-template.md) §8 User Stories | PRD is the source of truth for what was built — every feature maps to a user story; fidelity check against acceptance criteria in each story |
| [`../design-system/components/button.md`](../design-system/components/button.md), [`card.md`](../design-system/components/card.md), [`form-input.md`](../design-system/components/form-input.md), [`navigation.md`](../design-system/components/navigation.md) | These are the design specs that feature-fidelity.md's §1 "Read the Design First" rule references; component specs define exact visual tokens and states to verify |
| [`../design-system/states/error.md`](../design-system/states/error.md), [`loading.md`](../design-system/states/loading.md), [`success.md`](../design-system/states/success.md), [`empty.md`](../design-system/states/empty.md), [`validation.md`](../design-system/states/validation.md), [`interaction.md`](../design-system/states/interaction.md) | State docs define every state the component must implement — these are what "list every screen state" in §1 refers to |
| `design-system/tokens/color.md`, `spacing.md`, `typography.md` | Token files define the exact CSS values used — §1 "Note exact visual tokens" references these |
| [`ui-best-practices.md`](./ui-best-practices.md) | UI best practices + feature fidelity work together: ui-best-practices defines what states must exist; feature-fidelity verifies the implementation matches the design spec exactly |