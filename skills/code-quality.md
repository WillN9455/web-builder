```yaml
name: code-quality
description: |
  Prevents three persistent quality issues across codebases: (1) duplication — utilities and components  get recreated instead of reused; (2) race conditions — read-then-write DB patterns without atomic guards;  (3) timezone bugs — mixing server time and client local time. Apply before creating any new utility  function, helper, or component; and when writing any DB operation that reads then conditionally writes.  Also apply when the feature involves dates, times, scheduling, or timezone-sensitive display.  Trigger on: "create a helper", "add a utility", "format a date", "check if already exists", "only once",  "claim", "lock", "reserve", any scheduling feature, any DB read-before-write pattern,  "build a feature", "implement a feature", "add a feature", "edit a feature", "update a feature",  "create a component", "add a screen", any new feature work, any modification to an existing feature.
```

# Code Quality

Three persistent quality issues this skill addresses:

1. **Duplication** — recreating utilities and components instead of reusing existing ones
2. **Race conditions** — read-then-write DB patterns without atomic guards
3. **Timezone bugs** — mixing server UTC and client local time

---

## 1. Search Before Creating

Before writing any new utility function, helper, service, or component — search for existing ones.

```bash
# Search for existing implementations
grep -r "formatDate\|formatTime\|formatSlot" src/
grep -r "function isAvailable\|computeNext" src/
find src/ -type f \( -name "*.ts" -o -name "*.tsx" \) | xargs grep -l "Avatar\|Placeholder\|Fallback"
```

Check these locations specifically (adapt to your project structure):

- `src/utils/` or `src/lib/` — low-level helpers
- `src/services/` or `src/helpers/` — domain logic
- Existing components in sibling route/page files — often candidates for extraction
- Shared component libraries or `src/components/`

**Rule:** If a function does the same thing as an existing one, use the existing one. Do not create a variant with a slightly different name.

If you find the same logic duplicated across 3+ files, consolidate it into a shared location before adding another copy.

### Where to Put New Shared Code

| Type | Location |
| --- | --- |
| Pure utility (formatting, parsing, math) | `src/lib/` or `src/utils/` |
| Domain logic (business rules, API calls) | `src/services/` |
| UI primitives (Button, Card, Avatar) | `src/components/` |
| Route-specific helpers | Keep in the route file until needed by 2+ routes |

---

## 2. Prevent Race Conditions in DB Operations

### The Problem

Separate read and write operations are not atomic. Between your `findOne` and your `update`, another request can mutate the same document.

```tsx
// DANGEROUS — race window between read and write
const record = await Model.findById(id);
if (!record.claimed) {
  // Another request can slip in here and also see claimed=false
  await Model.findByIdAndUpdate(id, { claimed: true });
}
```

### The Fix: Atomic Conditional Update

Embed the condition in the filter predicate. For example, MongoDB executes the check and set as a single atomic operation.

```tsx
// SAFE — atomic
const result = await Model.findOneAndUpdate(
  { _id: id, claimed: false },     // condition in the filter
  { $set: { claimed: true, claimedAt: new Date() } },
  { new: true }
);

if (!result) {
  // Someone else claimed it first, or record doesn't exist
  return { error: 'Already claimed' };
}
```

### Atomic "Create If Not Exists"

For insert-once patterns, use `upsert` with `$setOnInsert` — not a read followed by a conditional insert:

```tsx
// SAFE — atomic "create if not exists"
await Model.findOneAndUpdate(
  { userId, type: 'signup-bonus' },
  { $setOnInsert: { createdAt: new Date(), amount: 100 } },
  { upsert: true, new: true }
);
// If the document already exists, $setOnInsert is a no-op
```

### Idempotency Keys

For operations that must not be duplicated (event logging, webhooks, payments), use an idempotency key with a unique index. The index must be declared in the schema — just storing the field is not enough:

```tsx
// Schema must declare the unique index:
idempotencyKey: { type: String, unique: true }

await EventLog.create({
  userId: id,
  eventType: 'ItemClaimed',
  idempotencyKey: `${id}:ItemClaimed`,
  payload: { ... }
});
// Catch duplicate key error (code 11000) — it means "already done", not a real error.
```

### When to Use Transactions

Use a database transaction when two or more writes must succeed or fail together (e.g., create a record + update a foreign reference). Most single-document operations don't need a transaction — atomic update operators (e.g. `$set`, `$inc`, `$push` in MongoDB) within one document are already atomic.

When you do use a transaction, always abort explicitly on failure and end the session in a `finally` block. Without an explicit abort, a failed transaction holds locks until it times out:

```tsx
const session = await db.startSession();
session.startTransaction();
try {
  await RecordA.create([{ ... }], { session });
  await RecordB.findByIdAndUpdate(id, { $set: { ... } }, { session });
  await session.commitTransaction();
} catch (err) {
  await session.abortTransaction(); // releases locks immediately
  throw err;                        // re-throw so the caller handles it
} finally {
  session.endSession();             // always runs, even on commit success
}
```

- `abortTransaction()` must be called on any error — not silently swallowed
- `endSession()` belongs in `finally` so it always runs regardless of outcome
- Transient write-conflict errors (e.g. MongoDB code `112`) are safe to retry; all other errors should be re-thrown

---

## 3. Timezone Handling

### The Core Problem

`new Date()` on the server returns UTC. Formatting that date for display on the server uses the server's timezone (typically UTC), not the user's timezone. The result is wrong for any user not in UTC.

### Rules

**Store and transmit time as UTC ISO strings always.** Never store a time formatted to a local timezone.

**Format for display on the client, not on the server.** The browser's `toLocaleString` / `toLocaleTimeString` default to the user's local timezone.

```tsx
// WRONG — formats on the server in UTC
// In loader:
return { displayTime: new Date(slot).toLocaleTimeString('en-US') }  // UTC, wrong for users

// RIGHT — return raw UTC, format in component (runs in browser)
// In loader:
return { slot: isoString }  // raw UTC ISO string

// In component:
function formatForDisplay(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
    // No timeZone override = defaults to browser local time ✓
  });
}
```

**SSR hydration warning (RR7/Remix and similar frameworks):** Components render on the server first. If `toLocaleTimeString` runs during SSR it uses Node's UTC context, producing a different string than the browser renders — causing a React hydration mismatch. Gate date formatting behind a `useEffect` / `useState(null)` initial value so it only runs client-side:

```tsx
const [displayTime, setDisplayTime] = useState<string | null>(null);
useEffect(() => {
  setDisplayTime(new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }));
}, [iso]);
```

**For scheduling features where explicit timezone matters** (e.g., "coach is available 9am–5pm in Sydney"), store the timezone string (e.g., `"Australia/Sydney"`) and use it explicitly in all calculations:

```tsx
// Store: { availabilityStart: '09:00', timezone: 'Australia/Sydney' }
// Calculate in a timezone-aware library (date-fns-tz, Temporal API, Luxon)
```

**For day comparisons** ("is this today?"), compare year/month/date components individually after constructing `Date` objects, not by comparing ISO string prefixes — the ISO prefix depends on UTC, which may be a different calendar day than local time.

---

## TypeScript Hygiene

- Run type-check and linter before considering any task complete.
- Loader/action return types (e.g. `useLoaderData()`, `useActionData()` in RR7/Remix) must be typed — define an interface, don't use `as any`.
- Enum-like values and model field names come from the model/schema definitions — don't hardcode strings that should reference a type.

## Related Files

| File | Relationship |
|------|-------------|
| [`../PRD/templates/prd-template.md`](../PRD/templates/prd-template.md) §12 Assumptions | Avoid over-engineering per PRD scope — if PRD says "simple search," don't add full-text indexing; feature-fidelity.md cross-checks design against actual requirements |
| [`design-system/tokens/color.md`](../design-system/tokens/color.md) §Validation Checklist | Semantic color tokens must use CSS custom properties, not hardcoded hex values — aligns with token-driven approach in this skill's "search before creating" rule |
| [`../code-builder/templates/nextjs-starter/`](../code-builder/templates/nextjs-starter/) | Templates follow file organization conventions from `coding-guidelines.md` which this skill builds on (src/lib, src/services, etc.) |
| [`testing/playwright/README.md`](../testing/playwright/README.md) §Required Test Coverage | Timezone bugs should be tested in state tests — e.g., "should display correct date/time for user's timezone" per the edge case test requirement |