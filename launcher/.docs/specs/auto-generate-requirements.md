# Auto-Generate Requirements from Approved PRD — Implementation Spec

**Status**: Approved by Will (2026-09-06)  
**Author**: Solution Architect Hermes  
**Branch**: `feature/auto-gen-requirements`

## Problem

After all 17 PRD artifacts are approved and the user confirms project context (State D gate), the Sprint/Design/Build/QA tabs unlock — but there's no automatic transition into the next phase. The BA must manually start writing requirements/stories.

## Solution

When the user clicks "Confirm project context" on the State D confirmation card:
1. Context is confirmed (existing behavior)
2. **NEW**: BA Agent is triggered to auto-generate stories + BRs + TRs from the approved artifacts
3. **NEW**: Requirements tab shows a non-blocking progress indicator while generation is in-flight
4. User can still manually add stories/requirements during auto-generation

---

## Server Changes

### 1. New endpoint: GET requirements generation status

**File**: `server/ba-workspace.ts` — after the existing routes

```typescript
app.get('/api/projects/:id/requirements-generation-status', (req, res) => {
  const row = getProjectRow(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const ctx = contextRow(row.id);
  if (!ctx?.confirmed) {
    return res.json({ status: 'idle', progress: { generated: 0, total: 0 } });
  }

  // Check for in-progress generation (read from ba_req_gen state file/DB)
  const state = readRequirementsGenerationState(row.id);
  if (!state) {
    return res.json({ status: 'idle', progress: { generated: 0, total: 0 } });
  }

  let status: 'generating' | 'done' | 'failed' = 'generating';
  if (state.status === 'completed') status = 'done';
  else if (state.status === 'error') status = 'failed';

  res.json({
    status,
    progress: {
      generated: state.generated ?? 0,
      total: state.total ?? BA_ARTIFACTS.length,
    },
    currentFile: state.currentFile,
    elapsedMs: state.startedAt ? Date.now() - state.startedAt : 0,
  });
});
```

### 2. New endpoint: POST trigger requirements generation

**File**: `server/ba-workspace.ts` — after the existing routes

```typescript
app.post('/api/projects/:id/trigger-requirements-generation', (req, res) => {
  const row = getProjectRow(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const ctx = contextRow(row.id);
  if (!ctx?.confirmed) {
    return res.status(409).json({ error: 'Project context not confirmed yet' });
  }

  // Re-check readiness
  const statuses = readStatuses(row.id);
  if (!BA_ARTIFECTS.every((f) => (statuses.get(f) ?? 'draft') === 'approved')) {
    return res.status(409).json({ error: 'Not all artifacts are Approved' });
  }

  // Check for existing generation
  const existing = readRequirementsGenerationState(row.id);
  if (existing && existing.status !== 'completed') {
    return res.json({ ok: true, alreadyRunning: true });
  }
  if (existing?.status === 'completed' || existing?.status === 'error') {
    // Allow re-trigger
    writeRequirementsGenerationState(row.id, {
      status: 'pending',
      generated: 0,
      total: BA_ARTIFACTS.length,
      currentFile: null,
      startedAt: Date.now(),
    });
  }

  const genId = triggerBaRequirementsGeneration(row.id);
  res.json({ ok: true, generationId: genId });
});
```

### 3. BA Agent invocation function

**New file**: `server/agent-invoker.ts`

```typescript
import fs from 'fs';
import path from 'path';

// Reuse existing agent channel pattern (same as existing BA document generation)
// The BA Agent receives a structured prompt:
// - List of all approved artifact filenames + their paths on disk
// - Instructions to lean heavily on PRD §1-§7
// - Output format: user-journeys.md (stories in As-A-I-Want-To-So-That format)
//   and prd.md §8/§9 (BR/TR lines linked via <!-- BR-NNN: story=US-NN -->)
export function triggerBaRequirementsGeneration(projectId: number): { generationId: string } {
  const row = getProjectRow(projectId);
  if (!row) throw new Error('Project not found');

  // Initialize generation state
  writeRequirementsGenerationState(projectId, {
    status: 'pending',
    generated: 0,
    total: BA_ARTIFACTS.length,
    currentFile: null,
    startedAt: Date.now(),
  });

  // Send to BA Agent via existing channel
  // (reuse the same pattern as triggerBaDocumentGeneration in ba-workspace.ts)
  return { generationId: generateId() };
}
```

### 4. Generation state storage

**New file**: `server/req-gen-state.ts`

Simple JSON file per project at `<project-folder>/.req-gen/<projectId>.json`:

```typescript
type ReqGenState = {
  status: 'pending' | 'generating' | 'completed' | 'error';
  generated: number;
  total: number;
  currentFile: string | null;
  startedAt: number;
  result?: { storiesGenerated: number; brsGenerated: number; trsGenerated: number };
};
```

---

## Client Changes

### 1. API function

**File**: `src/lib/api.ts` — after the existing BA functions

```typescript
export type RequirementsGenerationStatus = {
  status: 'idle' | 'generating' | 'done' | 'failed';
  progress: { generated: number; total: number };
  currentFile?: string;
  elapsedMs?: number;
};

export async function fetchRequirementsGenerationStatus(
  idOrSlug: string,
): Promise<RequirementsGenerationStatus> {
  return baFetch(`/api/projects/${encodeURIComponent(idOrSlug)}/requirements-generation-status`);
}

export async function triggerRequirementsGeneration(
  idOrSlug: string,
): Promise<{ ok: true; generationId: string }> {
  return baFetch(`/api/projects/${${encodeURIComponent(idOrSlug)}}/trigger-requirements-generation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}
```

### 2. ProjectBackgroundScreen — trigger auto-gen on confirm

**File**: `src/components/ProjectBackgroundScreen.tsx` — modify `handleConfirmContext`:

```typescript
const handleConfirmContext = useCallback(async () => {
  setBusy(true);
  try {
    await confirmProjectContext(id ?? '');
    onContextConfirmed();
    // NEW: trigger BA Agent to auto-generate stories + requirements
    const triggerResult = await triggerRequirementsGeneration(id ?? '');
    if (!triggerResult.alreadyRunning) {
      showNotice({
        kind: 'success',
        text: `Project context confirmed — Sprint, Design, Build, QA unlocked. Requirements generation started.${triggerResult.generationId ? ' (tracking in progress)' : ''}`,
      });
    } else {
      showNotice({
        kind: 'success',
        text: 'Project context confirmed — Sprint, Design, Build, QA unlocked. Requirements generation already in progress.',
      });
    }
    await loadFiles();
  } catch (err) {
    showNotice({
      kind: 'error',
      text: err instanceof Error ? err.message : 'Could not confirm the project context',
    });
  } finally {
    setBusy(false);
  }
}, [id, loadFiles, onContextConfirmed, showNotice]);
```

### 3. RequirementsScreen — progress indicator bar

**File**: `src/components/requirements/RequirementsScreen.tsx` — new state + effect:

```typescript
// In the component:
const [genStatus, setGenStatus] = useState<RequirementsGenerationStatus | null>(null);

useEffect(() => {
  if (data?.source !== 'ok') return;

  const loadGenStatus = async () => {
    try {
      const status = await fetchRequirementsGenerationStatus(idOrSlug);
      setGenStatus(status);
    } catch { /* silently skip — bar just disappears */ }
  };

  loadGenStatus();

  // Poll every 3s while generating
  if (genStatus?.status === 'generating') {
    const t = setInterval(loadGenStatus, 3000);
    return () => clearInterval(t);
  }
}, [data?.source, idOrSlug, genStatus?.status]);
```

**Render** — add after the Stage banner (line ~675) but before the main content:

```tsx
{genStatus && genStatus.status === 'generating' && (
  <div className="ba-warn req-gen-progress" role="status" aria-live="polite">
    <b>BA Agent generating stories & requirements</b> — {genStatus.currentFile ? `${genStatus.currentFile} · ` : ''}
    {genStatus.progress.generated} of {genStatus.progress.total} artifacts in progress.
    You can still manually add stories in the meantime.
  </div>
)}

{genStatus && genStatus.status === 'done' && (
  <div className="toast" role="status" aria-live="polite">
    <span className="toast-dot" aria-hidden="true" />
    BA Agent finished generating requirements — {genStatus.progress.generated} artifacts ready.
  </div>
)}

{genStatus && genStatus.status === 'failed' && (
  <div className="ba-warn req-gen-failed" role="alert">
    <b>Requirements generation failed</b> — BA Agent encountered an error.
    <button type="button" className="btn btn-soft" style={{ marginLeft: 8 }}
      onClick={() => { /* retry flow — same as background screen's Retry */ }}>
      Retry
    </button>
  </div>
)}
```

**Styling**: reuse existing `.ba-warn` class from `ProjectBackgroundScreen.tsx`. The bar uses butter/amber background color with dark text. No blocking — users can continue working.

### 4. ContextReadyView — update message

**File**: `src/components/ba-workspace/ContextReadyView.tsx` line ~51:

Change:
```
"All 17 background documents are approved. This is the one-shot that locks context into Requirements and opens the four downstream tabs."
```
To:
```
"All 17 background documents are approved. Confirming will unlock Sprint, Design, Build, and QA, and trigger the BA Agent to auto-generate requirements from your PRD."
```

---

## Files Changed

| File | Change |
|------|--------|
| `server/ba-workspace.ts` | Add GET /req-gen-status + POST /trigger-requirements-generation endpoints |
| `server/agent-invoker.ts` | **NEW** — BA Agent invocation for requirements generation |
| `server/req-gen-state.ts` | **NEW** — JSON file-based state storage for in-flight generation |
| `src/lib/api.ts` | Add `fetchRequirementsGenerationStatus` + `triggerRequirementsGeneration` |
| `src/components/ProjectBackgroundScreen.tsx:371-389` | Call `triggerRequirementsGeneration()` after confirm |
| `src/components/requirements/RequirementsScreen.tsx` | Add progress state + effect + render bar |
| `src/components/ba-workspace/ContextReadyView.tsx` | Update confirmation message text |

## New Risks

| ID | Risk | Mitigation |
|----|------|------------|
| SA-R-001 | BA Agent generates incomplete/poor requirements from PRD | Auto-generation is non-blocking — user can still manually add stories; progress bar is informative not blocking |
| SA-R-002 | Race: confirm-context succeeds but generation state writes fail | Confirm-context is idempotent; if generation fails, bar shows "failed" with Retry button |
| SA-R-003 | Requirements page polling adds latency to background screen polling | Reuse same existing `fetchBaFiles` polling pattern (already used every 2s on Background screen) — no additional HTTP cost for users on that tab |
| SA-R-004 | Generation state lost on server restart | JSON file storage is durable across restarts; if truly lost, bar shows "idle" and user can still manually add stories |

## Implementation Order

1. Add `server/req-gen-state.ts` — state storage (file I/O, no deps)
2. Add `server/agent-invoker.ts` — BA Agent invocation
3. Add both endpoints in `server/ba-workspace.ts`
4. Add client API functions in `src/lib/api.ts`
5. Wire into `ProjectBackgroundScreen.tsx` handleConfirmContext
6. Add progress indicator to `RequirementsScreen.tsx` (state + render)
7. Update `ContextReadyView.tsx` message
