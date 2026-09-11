// Requirements-generation invocation — triggers the BA Agent to auto-generate
// user stories (with their TR rows) + business requirements from approved
// Project Background artifacts, splicing them into the canonical Requirements
// surfaces via requirements-model's insert helpers (req-gen-splice.ts):
//   - story blocks + TR rows → user-journeys.md (same write surface as
//     POST /stories — append-only, existing blocks byte-identical)
//   - BR rows → prd.md §8 (after the last existing row's trailing meta)
// The targets are members of the 17-artifact approval gate, so regeneration
// by file replacement would destroy approved content — splicing is the whole
// design (SA P0 call). Generated rows stamp origin=generated so they are
// traceable and mechanically cleanable.

import fs from 'node:fs';
import path from 'node:path';
import { readReqGenState, writeReqGenState } from './req-gen-state.js';
import {
  BUSINESS_SECTION,
  reconcileBusinessReqs,
  reconcileSectionsDone,
  reconcileStories,
  requireRows,
  REQ_GEN_SECTIONS,
  spliceBusinessReqs,
  spliceStories,
  STORIES_SECTION,
  type DesiredBr,
  type DesiredStory,
  type DesiredTr,
  type GenBr,
  type GenStory,
} from './req-gen-splice.js';
import { getProjectRow, resolveProjectFolder, readStatuses, BA_ARTIFACTS, type ProjectRow } from './ba-workspace.js';
import { parseBusinessReqs, parseStories, type ReqRow, type StoryRow } from './requirements-model.js';
import { atomicWritePrd, prdFilePath } from './prd-fs.js';
import { db } from './db.js';
import { MODEL, OLLAMA } from './intake.js';

// ── The generation sections (the job's progress units) ─────────────────────
// One Ollama call per section, run in order. This is the single source of
// truth for the progress total — the status route reads the same length.

// The section list + reconcile live in the pure module (req-gen-splice.ts);
// re-exported here — ba-workspace.ts reads the length as the progress total.
export { REQ_GEN_SECTIONS };

// ── Timings ────────────────────────────────────────────────────────────────
// A local model can spend minutes per section; a heartbeat interval (not
// section boundaries) keeps lastHeartbeatAt fresh for the reconciled read in
// req-gen-state.ts (stale → failed → re-triggerable).
const HEARTBEAT_MS = 30_000;
const CALL_TIMEOUT_MS = 15 * 60_000;
const MAX_CONTEXT_CHARS = 48_000; // idea.md + all approved artifact bodies

// ── In-process guard: one req-gen run per project at a time. ───────────────

const running = new Set<number>();

// ── Public API ──────────────────────────────────────────────────────────────

export type TriggerResult = { ok: true; generationId: string } | { ok: false; error: string };

/**
 * Trigger requirements generation for a project. Idempotent within one
 * heartbeat — returns alreadyRunning when a fresh invocation races with an
 * in-flight run that has no persisted terminal state yet.
 */
export function triggerRequirementsGeneration(projectId: number): TriggerResult {
  if (running.has(projectId)) return { ok: false, error: 'Already running' };

  const row = getProjectRow(String(projectId));
  if (!row) return { ok: false, error: 'Project not found' };

  // Check all 17 are approved
  const statuses = readStatuses(row.id);
  for (const artifact of BA_ARTIFACTS) {
    if ((statuses.get(artifact) ?? 'draft') !== 'approved') {
      return { ok: false, error: `Artifact ${artifact} is not Approved` };
    }
  }

  // Check context is confirmed
  const ctx = db
    .prepare('SELECT confirmed FROM ba_context WHERE project_id = ?')
    .get(projectId) as { confirmed: number } | undefined;
  if (!ctx || !ctx.confirmed) {
    return { ok: false, error: 'Project context not confirmed yet' };
  }

  // Re-check on disk (the DB status can lag the file system after manual edits)
  const prdDirPath = path.join(resolveProjectFolder(row), 'PRD');
  for (const artifact of BA_ARTIFACTS) {
    if (!fs.existsSync(path.join(prdDirPath, artifact))) {
      return { ok: false, error: `Artifact ${artifact} is missing from disk` };
    }
  }

  const existing = readReqGenState(projectId);
  // Stale pending/generating states were already reconciled to failed by the
  // read, so a server restart mid-run is re-triggerable here.
  if (existing && (existing.state === 'pending' || existing.state === 'generating')) {
    return { ok: false, error: 'Already running' };
  }
  // A completed run 409s rather than silently duplicating rows — unless the
  // user deleted every generated row, or an approved artifact reverted since
  // the run finished (artifactsChanged, set by the transition routes), in
  // which case the next run runs in reconcile mode: diff against the existing
  // origin=generated rows instead of appending duplicates.
  const reconcile = Boolean(existing?.artifactsChanged);
  if (existing && existing.state === 'done' && hasGeneratedRows(row) && !reconcile) {
    return {
      ok: false,
      error: 'Requirements already generated — delete the generated rows to regenerate.',
    };
  }

  // Init state (the trigger owns state init — routes must not pre-write).
  // A failed run's completed sections carry over so the retry only generates
  // the missing ones (no duplicated rows); a done run starts fresh. A
  // reconcile run always starts fresh — "pass through all" is the contract
  // (every section reconsiders the full desired set, not just missing ones).
  // A failed reconcile retry also re-enters reconcile: the flag below keeps
  // `artifactsChanged` true on the failed state, so this must not depend on
  // the previous run's state being 'done'.
  const reconcileMode = reconcile;
  const sectionsDone =
    !reconcileMode && existing && existing.state === 'failed' ? (existing.sectionsDone ?? []) : [];
  writeReqGenState(projectId, {
    state: 'pending',
    generated: 0,
    total: REQ_GEN_SECTIONS.length,
    currentSection: null,
    startedAt: Date.now(),
    lastHeartbeatAt: Date.now(),
    error: null,
    sectionsDone,
    // Carry the stale flag through the run — every mid-run write spreads the
    // last persisted state, so dropping it here would lose it on a failed
    // run (only terminal 'done' clears it explicitly, below).
    artifactsChanged: reconcileMode,
    // Persisted so the status route can label the run and a crashed job's
    // retry (failed state) still knows how it was running.
    mode: reconcileMode ? 'reconcile' : 'generate',
  });

  running.add(projectId);
  void runRequirementsJob(projectId)
    .catch((err) => {
      console.error('[agent-invoker] req-gen job crashed:', err);
      // Spread the job's last persisted write so mode + artifactsChanged
      // survive a crash — a retry must resume the same mode, and a reconcile
      // run must stay re-triggerable from the confirmed card (a failed run
      // never clears the flag; only terminal 'done' does).
      const last = readReqGenState(projectId);
      const done = last?.sectionsDone ?? sectionsDone;
      writeReqGenState(projectId, {
        ...last,
        state: 'failed',
        generated: done.length,
        total: REQ_GEN_SECTIONS.length,
        currentSection: null,
        startedAt: last?.startedAt ?? Date.now(),
        error: 'Generation crashed — retry to continue.',
        sectionsDone: done,
      });
    })
    .finally(() => running.delete(projectId));

  return { ok: true, generationId: `${projectId}-${Date.now()}` };
}

function fileHasGeneratedRows(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && /origin=generated/.test(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return true; // can't prove the rows are gone — fail safe against duplication
  }
}

// Any persisted origin=generated marker (story meta, TR meta, or BR meta)
// means generated rows are still present on disk.
function hasGeneratedRows(row: ProjectRow): boolean {
  const dir = path.join(resolveProjectFolder(row), 'PRD');
  return (
    fileHasGeneratedRows(path.join(dir, 'user-journeys.md')) ||
    fileHasGeneratedRows(path.join(dir, 'prd.md'))
  );
}

// ── Context assembly (approved artifacts as prompt context, PRD-weighted) ──

function buildContext(row: ProjectRow): string | null {
  try {
    const lines: string[] = [];
    const folder = resolveProjectFolder(row);
    const prdDirPath = path.join(folder, 'PRD');

    // Read idea.md first — it is the primary seed.
    const ideaPath = path.join(folder, 'idea.md');
    if (fs.existsSync(ideaPath)) {
      lines.push('## Project Idea (seed)');
      lines.push(fs.readFileSync(ideaPath, 'utf-8').trim());
      lines.push('');
    }

    // PRD-weighted ordering (spec §3): the core-PRD artifacts the output
    // leans on come immediately after the seed, so the character cap below
    // truncates the tail bands — never the PRD.
    const coreFirst = ['prd.md', 'user-journeys.md', 'personas.md'];
    const ordered = [
      ...coreFirst.filter((f) => BA_ARTIFACTS.includes(f)),
      ...BA_ARTIFACTS.filter((f) => !coreFirst.includes(f)),
    ];
    for (const artifact of ordered) {
      const filePath = path.join(prdDirPath, artifact);
      if (!fs.existsSync(filePath)) continue;
      lines.push(`## ${artifact}`);
      lines.push(fs.readFileSync(filePath, 'utf-8').trim());
      lines.push('');
    }

    const full = lines.join('\n').slice(0, MAX_CONTEXT_CHARS);
    return full || null;
  } catch (err) {
    console.error('[agent-invoker] failed to build context:', err);
    return null;
  }
}

// ── The async generation job ───────────────────────────────────────────────

async function runRequirementsJob(projectId: number): Promise<void> {
  const row = getProjectRow(String(projectId));
  if (!row) {
    writeReqGenState(projectId, {
      state: 'failed',
      generated: 0,
      total: REQ_GEN_SECTIONS.length,
      currentSection: null,
      startedAt: Date.now(),
      error: 'Project not found for generation',
    });
    return;
  }

  const prdDirPath = path.join(resolveProjectFolder(row), 'PRD');
  const journeysPath = prdFilePath(prdDirPath, 'user-journeys.md');
  const prdPath = prdFilePath(prdDirPath, 'prd.md');

  const existing = readReqGenState(projectId);
  if (!existing) {
    writeReqGenState(projectId, {
      state: 'failed',
      generated: 0,
      total: REQ_GEN_SECTIONS.length,
      currentSection: null,
      startedAt: Date.now(),
      error: 'No generation state found — this should not happen.',
    });
    return;
  }

  const context = buildContext(row);
  if (!context) {
    writeReqGenState(projectId, {
      ...existing,
      state: 'failed',
      currentSection: null,
      error: 'Could not assemble prompt context',
    });
    return;
  }

  // Bidirectional resume reconcile (pure fn in req-gen-splice.ts): rows on
  // disk ⇒ done even if the crash lost the marker (retry must not re-run the
  // section — nextFreeId would duplicate); marked but rows deleted ⇒
  // regenerate. Also rehydrates the generated story ids so a BR-only retry
  // still links its BRs. A reconcile run bypasses the resume *decision* but
  // keeps the story-id rehydration: its seed set below starts EMPTY because
  // rows on disk are its INPUT, not evidence of completion — every section
  // always runs ("pass through all" is the reconcile contract), and seeding
  // the completion set from disk would classify a run whose first section
  // failed as done (set pre-populated full → done write → clears
  // artifactsChanged → stale flag lost on a failed reconcile).
  const isReconcile = existing.mode === 'reconcile';
  const reconciled = reconcileSectionsDone(
    fs.existsSync(journeysPath) ? fs.readFileSync(journeysPath, 'utf-8') : '',
    fs.existsSync(prdPath) ? fs.readFileSync(prdPath, 'utf-8') : '',
    isReconcile ? [] : (existing.sectionsDone ?? []),
  );
  const sectionsDone = new Set<string>(isReconcile ? [] : reconciled.sectionsDone);
  const todo = isReconcile
    ? [...REQ_GEN_SECTIONS]
    : REQ_GEN_SECTIONS.filter((s) => !sectionsDone.has(s));
  if (!isReconcile && todo.length === 0) {
    writeReqGenState(projectId, { ...existing, state: 'done', currentSection: null, error: null });
    return;
  }

  // Heartbeat: keeps lastHeartbeatAt fresh while an Ollama call runs, so the
  // stale-detection window in req-gen-state.ts stays tight without
  // false-failing slow-but-alive jobs. startedAt stays pinned for elapsedMs.
  const startedAt = existing.startedAt;
  const heartbeat = setInterval(() => {
    try {
      const s = readReqGenState(projectId);
      if (s) writeReqGenState(projectId, { ...s, startedAt, lastHeartbeatAt: Date.now() });
    } catch { /* heartbeat is best-effort */ }
  }, HEARTBEAT_MS);

  // US ids for BR linking: rehydrated from the previous run's generated
  // stories when the stories section carried over, else filled by this run's
  // stories section. A reconcile run REPLACES this with the post-reconcile
  // desired-order ids (reconcileStories returns the full set). Local to this
  // run: concurrent runs for different projects must not cross-link.
  let storyIds: string[] = [...reconciled.storyIds];
  // Written into EVERY persisted state write below (entry, completion,
  // terminal) so the phase-aware banner shows live row counts mid-run — a
  // generating run's result is "what has landed so far", not just the
  // finished run's counts.
  const result = { storiesGenerated: 0, brsGenerated: 0, trsGenerated: 0 };
  let lastError: string | null = null;

  try {
    for (let i = 0; i < todo.length; i++) {
      const section = todo[i];
      writeReqGenState(projectId, {
        ...existing,
        state: 'generating',
        generated: sectionsDone.size,
        currentSection: section,
        // Bounds this section at SECTION_STALL_MS for the stale-read — a
        // wedged run with fresh heartbeats must still fail (the round-4
        // deadlock had exactly that shape for 3.4h).
        sectionStartedAt: Date.now(),
        lastHeartbeatAt: Date.now(),
        error: null,
        result,
        sectionsDone: [...sectionsDone],
      });

      try {
        if (section === STORIES_SECTION) {
          // Fresh read at section start — nothing else writes during a run
          // (the transition routes 409 while a run is active), so reading
          // before the model call is equivalent to reading after.
          const journeys = fs.readFileSync(journeysPath, 'utf-8');
          const existingGenStories = isReconcile
            ? parseStories(journeys).stories.filter((s) => s.origin === 'generated')
            : [];
          if (isReconcile && existingGenStories.length > 0) {
            // Reconcile path: the model returns the FULL desired set (echoed
            // ids stay, omitted ids are removed, new ones are appended).
            // Unchanged content outside touched scopes stays byte-identical
            // (the AC-9 bar); a zero-diff result writes nothing.
            const { entries, keepUsIds } = await callModelStoriesReconcile(context, existingGenStories);
            const rec = reconcileStories(journeys, entries, keepUsIds);
            if (rec.text !== journeys) {
              // Direct write — atomicWritePrd takes the PRD lock itself. PR
              // #26 round-4 bug: wrapping it in an outer withPrdLock on the
              // SAME path was a nested same-key acquire that queued behind
              // its own slot forever (non-reentrant mutex, deadlock).
              await atomicWritePrd(journeysPath, rec.text);
            }
            storyIds = rec.storyIds;
            result.storiesGenerated = rec.ops.added + rec.ops.updated;
            result.trsGenerated = rec.trCount;
          } else {
            // requireRows: a call that yields zero parseable rows must FAIL
            // the section — a silent empty advance would be marked done and
            // retry would skip it forever, generating nothing. (Reconcile
            // skips this only when NO generated rows exist — that degenerate
            // case is plain generation and keeps the same protection.)
            const stories = requireRows(await callModelStories(context), 'user stories');
            const spliced = spliceStories(journeys, stories);
            if (spliced.usIds.length !== stories.length) {
              throw new Error('Story splice inserted fewer blocks than the model generated');
            }
            // Same round-4 fix: atomicWritePrd locks; never nest withPrdLock.
            await atomicWritePrd(journeysPath, spliced.text);
            storyIds.push(...spliced.usIds);
            result.storiesGenerated = spliced.usIds.length;
            result.trsGenerated = spliced.trCount;
          }
        } else {
          const prd = fs.readFileSync(prdPath, 'utf-8');
          // FRESH read: in reconcile mode this reflects the stories section's
          // post-reconcile file, so BR linking resolves against the final
          // story set.
          const existingGenBrs = isReconcile
            ? parseBusinessReqs(prd).rows.filter((r) => r.origin === 'generated')
            : [];
          if (isReconcile && existingGenBrs.length > 0) {
            const { entries, keepBrIds } = await callModelBusinessReqsReconcile(context, storyIds, existingGenBrs);
            const rec = reconcileBusinessReqs(prd, entries, keepBrIds);
            if (rec.text !== prd) {
              // Same round-4 fix: atomicWritePrd locks; never nest withPrdLock.
              await atomicWritePrd(prdPath, rec.text);
            }
            result.brsGenerated = rec.ops.added + rec.ops.updated;
          } else {
            const brs = requireRows(await callModelBusinessReqs(context, storyIds), 'business requirements');
            const spliced = spliceBusinessReqs(prd, brs, storyIds);
            if (spliced.brIds.length !== brs.length) {
              // businessReqInsertIndex found no §8 to write into — nothing
              // landed, so failing the section is safe (no partial insert).
              throw new Error('BR splice inserted fewer rows than the model generated — prd.md has no §8 section');
            }
            // Same round-4 fix: atomicWritePrd locks; never nest withPrdLock.
            await atomicWritePrd(prdPath, spliced.text);
            result.brsGenerated = spliced.brIds.length;
          }
        }
        sectionsDone.add(section);
      } catch (err) {
        lastError = `Could not generate ${section}: ${err instanceof Error ? err.message : String(err)}`;
        break; // a failed section stops the run — retry generates only the rest
      }

      writeReqGenState(projectId, {
        ...existing,
        state: 'generating',
        generated: sectionsDone.size,
        // Next section started at the completion write — the elapsed clock
        // ticks from here (undefined on the last section, which is null).
        sectionStartedAt: todo[i + 1] ? Date.now() : undefined,
        currentSection: todo[i + 1] ?? null,
        lastHeartbeatAt: Date.now(),
        result,
        sectionsDone: [...sectionsDone],
      });
    }

    if (sectionsDone.size === REQ_GEN_SECTIONS.length) {
      writeReqGenState(projectId, {
        ...existing,
        state: 'done',
        currentSection: null,
        sectionStartedAt: undefined,
        error: null,
        result,
        sectionsDone: [...sectionsDone],
        // The pre-run `existing` spread carries artifactsChanged: true — a
        // completed reconcile/generate run has now absorbed the artifact
        // changes, so the stale flag clears here and ONLY here (a failed run
        // keeps it true so the reconcile stays re-triggerable).
        artifactsChanged: false,
      });
    } else {
      writeReqGenState(projectId, {
        ...existing,
        state: 'failed',
        currentSection: null,
        sectionStartedAt: undefined,
        error:
          lastError ??
          'Generation finished with missing sections — retry generates only the missing ones.',
        result,
        sectionsDone: [...sectionsDone],
        // artifactsChanged stays true via the spread — retry re-enters
        // reconcile so the remaining sections still diff, not append.
      });
    }
  } finally {
    clearInterval(heartbeat);
  }
}

// ── Prompt + Ollama call ────────────────────────────────────────────────────
// The model NEVER writes file text — it returns JSON row inputs, and the
// server allocates ids and renders the grammar (req-gen-splice.ts). Asking
// for the markdown grammar directly would risk malformed rows that the
// Requirements parser silently drops.

function modelSystemPrompt(): string {
  return (
    'You are the Business Analyst agent of the Idea-to-Web-Solution framework. ' +
    'Respond with a single JSON object and nothing else — no markdown fences, no commentary. ' +
    'Ground every detail in the project context provided — never invent features not described.'
  );
}

async function callModelStories(context: string): Promise<GenStory[]> {
  const user =
    `## Context (all approved artifacts)\n\n${context}\n\n## Task\n\n` +
    `Write the user stories for this project. Respond with JSON: ` +
    `{"stories":[{"title":"short story title","asA":"role","iWantTo":"capability","soThat":"benefit",` +
    `"priority":"must|should|could","trs":[{"text":"technical requirement supporting this story",` +
    `"priority":"must|should|could"}]}]}\n\n` +
    `Include 5-10 stories covering the happy paths and the main failure paths. ` +
    `Each story needs at least one technical requirement.`;
  const parsed = await callModelJson(user);
  const rawStories = Array.isArray(parsed?.stories) ? parsed.stories : [];
  const stories: GenStory[] = [];
  for (const s of rawStories) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    const title = str(o.title);
    const asA = str(o.asA);
    const iWantTo = str(o.iWantTo);
    const soThat = str(o.soThat);
    if (!title || !asA || !iWantTo || !soThat) continue; // incomplete story → skipped, not half-inserted
    const trs = Array.isArray(o.trs)
      ? o.trs
          .map((t) =>
            t && typeof t === 'object'
              ? { text: str((t as Record<string, unknown>).text), priority: (t as Record<string, unknown>).priority }
              : null,
          )
          .filter((t): t is { text: string; priority: unknown } => !!t && !!t.text)
      : [];
    stories.push({ title, asA, iWantTo, soThat, priority: o.priority, trs });
  }
  return stories;
}

async function callModelBusinessReqs(context: string, storyIds: string[]): Promise<GenBr[]> {
  const storyList = storyIds.length
    ? `\n\nThe following user stories were just generated (index → id): ` +
      storyIds.map((id, i) => `${i} → ${id}`).join(', ') +
      `\nLink each business requirement to the story it serves via "storyIndex" (the number before the arrow), or null when it serves none.`
    : '';
  const user =
    `## Context (all approved artifacts)\n\n${context}\n\n## Task\n\n` +
    `Write the business requirements for this project — testable statements grouped by functional area. ` +
    `Respond with JSON: {"requirements":[{"text":"requirement text","priority":"must|should|could","storyIndex":null}]}${storyList}`;
  const parsed = await callModelJson(user);
  const rawReqs = Array.isArray(parsed?.requirements) ? parsed.requirements : [];
  const brs: GenBr[] = [];
  for (const r of rawReqs) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const text = str(o.text);
    if (!text) continue;
    const idx = o.storyIndex;
    const storyIndex =
      typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < storyIds.length ? idx : null;
    brs.push({ text, priority: o.priority, storyIndex });
  }
  return brs;
}

// ── Reconcile-mode calls ────────────────────────────────────────────────────
// The model sees the CURRENT generated rows and returns the FULL desired set:
// echoed ids stay (reused or revised), omitted ids are removed, id-less
// entries are new. It never writes grammar — reconcileStories/
// reconcileBusinessReqs own ids, ids allocation and file text.

function renderExistingStoryForPrompt(s: StoryRow): string {
  const trs = s.reqs
    .map((r) => `  - ${r.id} [${r.priority}]: ${r.text}`)
    .join('\n');
  return `${s.usId} [${s.priority}]: As a ${s.asA}, I want to ${s.iWantTo}, so that ${s.soThat}.${trs ? `\n${trs}` : ''}`;
}

async function callModelStoriesReconcile(
  context: string,
  existing: StoryRow[],
): Promise<{ entries: DesiredStory[]; keepUsIds: string[] }> {
  const current =
    existing.length
      ? `\n\n## Current generated user stories (id → current definition)\n\n` +
        existing.map(renderExistingStoryForPrompt).join('\n\n') +
        `\n\n## Task\n\nReconcile these user stories against the context above. Return the FULL desired set as JSON: ` +
        `{"stories":[{"usId":"US-01","title":"short story title","asA":"role","iWantTo":"capability","soThat":"benefit",` +
        `"priority":"must|should|could","trs":[{"trId":"TR-001","text":"technical requirement","priority":"must|should|could"}]}]}\n` +
        `- Echo "usId" (and each TR's "trId") for a story you are keeping — unchanged or revised. Keep ids stable unless the story's meaning changed.\n` +
        `- Omit a story (or a TR inside one) to REMOVE it — removal is expected when the updated artifacts no longer support it. Removing all stories is valid.\n` +
        `- A new story or TR has no id.\n` +
        `- Echo ONLY ids from the generated list above — human-authored stories are managed by people, never touch them.\n` +
        `- Every previously generated story is reconsidered: keep, update, remove, or add as the context requires.`
      : '';
  const user =
    `## Context (all approved artifacts)\n\n${context}\n\n## Task\n\n` +
    `Write the user stories for this project. Respond with JSON: ` +
    `{"stories":[{"title":"short story title","asA":"role","iWantTo":"capability","soThat":"benefit",` +
    `"priority":"must|should|could","trs":[{"text":"technical requirement supporting this story",` +
    `"priority":"must|should|could"}]}]}` + current;
  const parsed = await callModelJson(user);
  const rawStories = Array.isArray(parsed?.stories) ? parsed.stories : [];
  const entries: DesiredStory[] = [];
  // Echoed ids are recorded even when their entry is skipped for
  // incompleteness — one garbled entry must not silently delete an existing
  // generated row (the reconcile keeps every echoed id that still parses).
  const keepUsIds: string[] = [];
  for (const s of rawStories) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    const usId = str(o.usId);
    if (usId) keepUsIds.push(usId);
    const title = str(o.title);
    const asA = str(o.asA);
    const iWantTo = str(o.iWantTo);
    const soThat = str(o.soThat);
    // Same completeness bar as generate mode: an incomplete entry is dropped.
    if (!title || !asA || !iWantTo || !soThat) continue;
    const trs = Array.isArray(o.trs)
      ? o.trs
          .map((t) =>
            t && typeof t === 'object'
              ? { trId: str((t as Record<string, unknown>).trId) || null, text: str((t as Record<string, unknown>).text), priority: (t as Record<string, unknown>).priority }
              : null,
          )
          .filter((t): t is DesiredTr => !!t && !!t.text)
      : [];
    entries.push({ usId: usId || null, title, asA, iWantTo, soThat, priority: o.priority, trs });
  }
  return { entries, keepUsIds };
}

function renderExistingBrForPrompt(r: ReqRow): string {
  return `${r.id}${r.storyUsId ? ` (serves ${r.storyUsId})` : ''} [${r.priority}]: ${r.text}`;
}

async function callModelBusinessReqsReconcile(
  context: string,
  storyIds: string[],
  existing: ReqRow[],
): Promise<{ entries: DesiredBr[]; keepBrIds: string[] }> {
  const storyList = storyIds.length
    ? `\n\nThe post-reconcile user stories (index → id): ` +
      storyIds.map((id, i) => `${i} → ${id}`).join(', ') +
      `\nLink each business requirement to the story it serves via "storyIndex" (the number before the arrow), or null when it serves none.`
    : '';
  const current =
    existing.length
      ? `\n\n## Current generated business requirements (id → current definition)\n\n` +
        existing.map(renderExistingBrForPrompt).join('\n') +
        `\n\n## Task\n\nReconcile these business requirements against the context above. Return the FULL desired set as JSON: ` +
        `{"requirements":[{"brId":"BR-001","text":"requirement text","priority":"must|should|could","storyIndex":null}]}\n` +
        `- Echo "brId" for a requirement you are keeping — unchanged or revised.\n` +
        `- Omit a requirement to REMOVE it — removal is expected when the updated artifacts no longer support it. Removing all is valid.\n` +
        `- A new requirement has no id.\n` +
        `- Echo ONLY ids from the generated list above — human-authored requirements are managed by people, never touch them.\n` +
        `- Every previously generated requirement is reconsidered: keep, update, remove, or add as the context requires.` +
        storyList
      : '';
  const user =
    `## Context (all approved artifacts)\n\n${context}\n\n## Task\n\n` +
    `Write the business requirements for this project — testable statements grouped by functional area. ` +
    `Respond with JSON: {"requirements":[{"text":"requirement text","priority":"must|should|could","storyIndex":null}]}${current}`;
  const parsed = await callModelJson(user);
  const rawReqs = Array.isArray(parsed?.requirements) ? parsed.requirements : [];
  const entries: DesiredBr[] = [];
  const keepBrIds: string[] = [];
  for (const r of rawReqs) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const brId = str(o.brId);
    if (brId) keepBrIds.push(brId);
    const text = str(o.text);
    if (!text) continue;
    const idx = o.storyIndex;
    const storyIndex =
      typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < storyIds.length ? idx : null;
    entries.push({
      brId: brId || null,
      text,
      priority: o.priority,
      storyUsId: storyIndex === null ? null : (storyIds[storyIndex] ?? null),
    });
  }
  return { entries, keepBrIds };
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// Tolerant JSON extraction: the model is asked for a bare object, but a
// fenced or prose-wrapped response still parses (first '{' to last '}').
async function callModelJson(user: string): Promise<Record<string, unknown> | null> {
  const raw = await callOllama(modelSystemPrompt(), user);
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function callOllama(system: string, user: string): Promise<string> {
  const res = await fetch(OLLAMA + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });

  if (!res.ok || !res.body) {
    throw new Error(
      res.status === 404
        ? `Model '${MODEL}' not found — pull it with: ollama pull ${MODEL}`
        : `Ollama error (HTTP ${res.status})`,
    );
  }

  let full = '';
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let evt: { message?: { content?: string }; error?: string };
      try {
        evt = JSON.parse(line) as typeof evt;
      } catch {
        continue;
      }
      if (evt.error) throw new Error(evt.error);
      if (evt.message?.content) full += evt.message.content;
    }
  }
  return full;
}

// ── Helpers exported for testing / introspection ────────────────────────────

export function calculateElapsedMs(projectId: number): number {
  const s = readReqGenState(projectId);
  if (!s || !s.startedAt) return 0;
  return Date.now() - s.startedAt;
}
