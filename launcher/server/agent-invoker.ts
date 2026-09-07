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
import { spliceBusinessReqs, spliceStories, type GenBr, type GenStory } from './req-gen-splice.js';
import { getProjectRow, resolveProjectFolder, readStatuses, BA_ARTIFACTS, type ProjectRow } from './ba-workspace.js';
import { atomicWritePrd, prdFilePath, withPrdLock } from './prd-fs.js';
import { db } from './db.js';
import { MODEL, OLLAMA } from './intake.js';

// ── The generation sections (the job's progress units) ─────────────────────
// One Ollama call per section, run in order. This is the single source of
// truth for the progress total — the status route reads the same length.

export const REQ_GEN_SECTIONS = ['user stories', 'business requirements'] as const;

type ReqGenSection = (typeof REQ_GEN_SECTIONS)[number];

const STORIES_SECTION: ReqGenSection = 'user stories';
const BUSINESS_SECTION: ReqGenSection = 'business requirements';

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
  // user deleted every generated row, in which case regenerating is safe.
  if (existing && existing.state === 'done' && hasGeneratedRows(row)) {
    return {
      ok: false,
      error: 'Requirements already generated — delete the generated rows to regenerate.',
    };
  }

  // Init state (the trigger owns state init — routes must not pre-write).
  // A failed run's completed sections carry over so the retry only generates
  // the missing ones (no duplicated rows); a done run starts fresh.
  const sectionsDone =
    existing && existing.state === 'failed' ? (existing.sectionsDone ?? []) : [];
  writeReqGenState(projectId, {
    state: 'pending',
    generated: 0,
    total: REQ_GEN_SECTIONS.length,
    currentSection: null,
    startedAt: Date.now(),
    lastHeartbeatAt: Date.now(),
    error: null,
    sectionsDone,
  });

  running.add(projectId);
  void runRequirementsJob(projectId)
    .catch((err) => {
      console.error('[agent-invoker] req-gen job crashed:', err);
      writeReqGenState(projectId, {
        state: 'failed',
        generated: sectionsDone.length,
        total: REQ_GEN_SECTIONS.length,
        currentSection: null,
        startedAt: Date.now(),
        error: 'Generation crashed — retry to continue.',
        sectionsDone,
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

  // A section counts as done only if the previous run recorded it AND its
  // generated rows are still on disk (the user may have deleted them — then
  // the section regenerates).
  const sectionsDone = new Set<string>(existing.sectionsDone ?? []);
  if (sectionsDone.has(STORIES_SECTION) && !fileHasGeneratedRows(journeysPath)) {
    sectionsDone.delete(STORIES_SECTION);
  }
  if (sectionsDone.has(BUSINESS_SECTION) && !fileHasGeneratedRows(prdPath)) {
    sectionsDone.delete(BUSINESS_SECTION);
  }
  const todo = REQ_GEN_SECTIONS.filter((s) => !sectionsDone.has(s));
  if (todo.length === 0) {
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

  // US ids allocated by the 'user stories' section — the 'business
  // requirements' section links BRs to them via storyIndex. Local to this
  // run: concurrent runs for different projects must not cross-link.
  const storyIds: string[] = [];
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
        lastHeartbeatAt: Date.now(),
        error: null,
        sectionsDone: [...sectionsDone],
      });

      try {
        if (section === STORIES_SECTION) {
          const stories = await callModelStories(context);
          if (stories.length > 0) {
            const journeys = fs.readFileSync(journeysPath, 'utf-8');
            const spliced = spliceStories(journeys, stories);
            await withPrdLock(journeysPath, () => atomicWritePrd(journeysPath, spliced.text));
            storyIds.push(...spliced.usIds);
            result.storiesGenerated = spliced.usIds.length;
            result.trsGenerated = spliced.trCount;
          }
        } else {
          const brs = await callModelBusinessReqs(context, storyIds);
          if (brs.length > 0) {
            const prd = fs.readFileSync(prdPath, 'utf-8');
            const spliced = spliceBusinessReqs(prd, brs, storyIds);
            await withPrdLock(prdPath, () => atomicWritePrd(prdPath, spliced.text));
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
        currentSection: todo[i + 1] ?? null,
        lastHeartbeatAt: Date.now(),
        sectionsDone: [...sectionsDone],
      });
    }

    if (sectionsDone.size === REQ_GEN_SECTIONS.length) {
      writeReqGenState(projectId, {
        ...existing,
        state: 'done',
        currentSection: null,
        error: null,
        result,
        sectionsDone: [...sectionsDone],
      });
    } else {
      writeReqGenState(projectId, {
        ...existing,
        state: 'failed',
        currentSection: null,
        error:
          lastError ??
          'Generation finished with missing sections — retry generates only the missing ones.',
        sectionsDone: [...sectionsDone],
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