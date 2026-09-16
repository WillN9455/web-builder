// Story generation — BA Agent Run 2 (sprint tab, slice 4).
//
// Derives user stories from the project's fleshed-out requirements (Run 1
// output) + approved Project Background artifacts, and stores them locally at
// PRD/stories.md (build-plan decision 5, requirements-redesign decision 6r).
// Each generated story follows the derived-story grammar
// (server/requirements-model.ts):
//   - `### US-NN — title` heading (US-NN zero-padded to 2 digits)
//   - `<!-- story: priority=… status=draft owner=BA origin=generated reqs=… -->`
//     meta — the `origin=generated` stamp makes the set mechanically cleanable,
//     and the `reqs=` field records the derived-from links (BR-/TR-/FE- ids)
//   - a `**As a** X, **I want to** Y, **so that** Z.` body (STORY_BODY_RE)
//   - the story's own `## Acceptance Criteria` section with `- AC-0NN | …`
//     rows (AC_ROW_RE) — ACs belong to stories, never features (6r)
//
// Generation also auto-creates one To-do kanban card per story (server-derived
// ticket keys via board.ts nextTicketKey), persisting the US ↔ issue-key
// mapping locally (data/story-gen/<projectId>.mapping.json) so the Phase-2
// Jira connector has a lookup table and a regenerate can REPLACE — never
// duplicate — the previous run's cards.
//
// Run 2 is a single Ollama derivation pass (no per-section progress like Run
// 1's req-gen), but the state/heartbeat/reconcile-stale shape mirrors
// req-gen-state.ts so the sprint card's spinner can never pin forever after a
// server restart: a pending/generating state whose heartbeat (or active
// section) outlives its budget resolves to failed on read and becomes
// re-triggerable.

import fs from 'node:fs';
import path from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response, Application } from 'express';
import { db } from './db.js';
import { parseProjectId } from './jira-link.js';
import { getProjectRow, resolveProjectFolder } from './ba-workspace.js';
import { parseRequirements, isReqPriority, type ReqPriority } from './requirements-model.js';
import { atomicWritePrd, prdFilePath } from './prd-fs.js';
import { buildContext, callOllama } from './agent-invoker.js';
import { nextTicketKey } from './board.js';

// ── Timings ────────────────────────────────────────────────────────────────
// The local model can take minutes for one derivation pass; a heartbeat (not
// section boundaries — there is none) keeps lastHeartbeatAt fresh for the
// reconciled read. SECTION_STALL_MS sits ABOVE the call budget (15 min) so a
// slow-but-alive fetch can never false-fail.
const HEARTBEAT_MS = 30_000;
const STALE_MS = 120_000;
const SECTION_STALL_MS = 20 * 60_000;

// Single-line, pipe-free, capped model text — pipes are the row grammar's
// field separator and a runaway value must not bloat the markdown files.
const TITLE_MAX = 120;
const BODY_MAX = 300;
const AC_MAX = 300;

// ── State file (data/story-gen/<projectId>.json) ───────────────────────────
type StoryGenState = {
  state: 'pending' | 'generating' | 'done' | 'failed';
  generated: number;
  total: number;
  currentSection: string | null;
  startedAt: number;
  lastHeartbeatAt?: number;
  sectionStartedAt?: number;
  error: string | null;
  result?: { storiesGenerated: number; issuesCreated: number };
};

// The US ↔ issue-key mapping of the LAST run. Regenerate reads this to delete
// the previous run's cards before inserting the fresh set, so every story maps
// to exactly one live board card at a time.
type StoryIssueMapping = {
  stories: { us: string; ticketKey: string; cardId: number }[];
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, '..', 'data', 'story-gen');

function stateFilePath(projectId: number): string {
  return path.join(DIR, `${projectId}.json`);
}

function writeAtomic(filePath: string, value: unknown): void {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  } catch {
    /* dir already exists or permission-denied — best-effort */
  }
  // Atomic (.tmp + rename) so a crash mid-write never leaves a half-written
  // state file that would parse as null → idle → double-trigger race.
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(value), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

// Pending/generating → failed (persisted once) when the active run is stale:
// section outlived SECTION_STALL_MS (a wedged run) or the heartbeat is older
// than STALE_MS (the run did not survive a server restart). Mirrors
// req-gen-state.ts reconcileStale.
function reconcileStale(projectId: number, state: StoryGenState): StoryGenState {
  if (state.state !== 'pending' && state.state !== 'generating') return state;
  const heartbeatAge = Date.now() - (state.lastHeartbeatAt ?? state.startedAt);
  let error: string | null = null;
  if (state.currentSection && state.sectionStartedAt) {
    const sectionAge = Date.now() - state.sectionStartedAt;
    if (sectionAge > SECTION_STALL_MS) {
      error = `Story generation stalled (no progress in ${Math.round(sectionAge / 60_000)} min) — the run was interrupted mid-write. Retry to continue.`;
    } else if (heartbeatAge > STALE_MS) {
      error = 'Story generation was interrupted before it finished (server restart). Retry to continue.';
    }
  } else if (heartbeatAge > STALE_MS) {
    error = 'Story generation was interrupted before it finished (server restart). Retry to continue.';
  }
  if (!error) return state;
  const failed: StoryGenState = {
    ...state,
    state: 'failed',
    currentSection: null,
    sectionStartedAt: undefined,
    error,
  };
  try {
    writeAtomic(stateFilePath(projectId), failed);
  } catch {
    /* best-effort — the read still reports failed */
  }
  return failed;
}

function readState(projectId: number): StoryGenState | null {
  const filePath = stateFilePath(projectId);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StoryGenState;
    return reconcileStale(projectId, parsed);
  } catch {
    return null;
  }
}

function writeState(projectId: number, state: StoryGenState): void {
  try {
    writeAtomic(stateFilePath(projectId), state);
  } catch {
    /* state persistence is best-effort — the job keeps running */
  }
}

// ── Mapping file (data/story-gen/<projectId>.mapping.json) ──────────────────

function readMapping(projectId: number): StoryIssueMapping {
  const filePath = path.join(DIR, `${projectId}.mapping.json`);
  if (!fs.existsSync(filePath)) return { stories: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StoryIssueMapping;
    return parsed.stories ? parsed : { stories: [] };
  } catch {
    return { stories: [] };
  }
}

function writeMapping(projectId: number, mapping: StoryIssueMapping): void {
  try {
    writeAtomic(path.join(DIR, `${projectId}.mapping.json`), mapping);
  } catch {
    /* best-effort — a stale mapping only causes a no-op delete next run */
  }
}

// ── Wire shape (server/index.ts mount) ──────────────────────────────────────

type StoryGenStatusWire = {
  status: 'idle' | 'generating' | 'done' | 'failed';
  progress: { generated: number; total: number };
  currentSection?: string;
  sectionStartedAt?: number;
  error?: string;
  result?: { storiesGenerated: number; issuesCreated: number };
};

function toWire(state: StoryGenState | null): StoryGenStatusWire {
  if (!state) return { status: 'idle', progress: { generated: 0, total: 0 } };
  // 'pending' is an internal pre-job instant; the client only knows 'generating'.
  const wire = state.state === 'pending' ? 'generating' : state.state;
  return {
    status: wire,
    progress: { generated: state.generated, total: state.total },
    currentSection: state.currentSection ?? undefined,
    sectionStartedAt: state.sectionStartedAt,
    error: state.error ?? undefined,
    result: state.result,
  };
}

// ── In-process guard: one story-gen run per project at a time ───────────────

const running = new Set<number>();

// ── Trigger (the route-visible gate) ────────────────────────────────────────

export type TriggerResult = { ok: true; generationId: string } | { ok: false; error: string };

export function triggerStoryGeneration(projectId: number): TriggerResult {
  if (running.has(projectId)) return { ok: false, error: 'Story generation is already running.' };

  const row = getProjectRow(String(projectId));
  if (!row) return { ok: false, error: 'Project not found' };

  // Context gate — the same gate the Sprint tab's deep-link enforces.
  const ctx = db
    .prepare('SELECT confirmed FROM ba_context WHERE project_id = ?')
    .get(projectId) as { confirmed: number } | undefined;
  if (!ctx || !ctx.confirmed) {
    return { ok: false, error: 'Project context not confirmed yet.' };
  }

  // Requirements gate — stories derive from the Run-1 feature/BR/TR output, so
  // an empty model 409s instead of wasting a local-model derivation pass.
  const prdDirPath = path.join(resolveProjectFolder(row), 'PRD');
  const prdText = fs.existsSync(prdFilePath(prdDirPath, 'prd.md'))
    ? fs.readFileSync(prdFilePath(prdDirPath, 'prd.md'), 'utf-8')
    : '';
  const featuresText = fs.existsSync(prdFilePath(prdDirPath, 'features.md'))
    ? fs.readFileSync(prdFilePath(prdDirPath, 'features.md'), 'utf-8')
    : '';
  const parsed = parseRequirements(prdText, featuresText);
  if (parsed.features.length === 0 && parsed.businessReqs.length === 0) {
    return { ok: false, error: 'Requirements are not fleshed out yet — generate them in the Requirements tab first.' };
  }

  const existing = readState(projectId);
  // A stale pending/generating state was already reconciled to failed by the
  // read, so a server restart mid-run is re-triggerable here.
  if (existing && (existing.state === 'pending' || existing.state === 'generating')) {
    return { ok: false, error: 'Story generation is already running.' };
  }
  // Regeneration while 'done' is ALLOWED — the sprint card's "Regenerate to
  // re-draft" contract: the new run replaces stories.md and the prior cards.

  // Init state (the trigger owns state init — routes must not pre-write).
  writeState(projectId, {
    state: 'pending',
    generated: 0,
    total: 0, // the story count is unknown until the model returns
    currentSection: 'stories',
    sectionStartedAt: Date.now(),
    startedAt: Date.now(),
    lastHeartbeatAt: Date.now(),
    error: null,
  });

  running.add(projectId);
  void runStoryGenJob(projectId)
    .catch((err) => {
      console.error('[story-gen] job crashed:', err);
      const last = readState(projectId);
      const fallback: StoryGenState = {
        state: 'generating',
        generated: 0,
        total: 0,
        currentSection: null,
        startedAt: Date.now(),
        error: null,
      };
      writeState(projectId, {
        ...(last ?? fallback),
        state: 'failed',
        currentSection: null,
        sectionStartedAt: undefined,
        error: 'Story generation crashed — retry to continue.',
      });
    })
    .finally(() => running.delete(projectId));

  return { ok: true, generationId: `${projectId}-${Date.now()}` };
}

// ── Context assembly for the derivation pass ────────────────────────────────

type ModelStory = {
  usId: string;
  title: string;
  asA: string;
  iWantTo: string;
  soThat: string;
  priority: ReqPriority;
  reqs: string[];
  acs: string[];
};

function cleanText(raw: string, max: number): string {
  return raw.replace(/\s+/g, ' ').replace(/\|/g, '/').trim().slice(0, max).trim();
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const REQ_ID_RE = /^(BR|TR|FE)-\d{2,3}$/;

// Board cards use a different priority vocabulary than requirements
// (kanban_card CHECK: high/med/low). Derive the card priority from the story's
// requirement priority so a generated card is still board-sortable: must → high,
// should → med, could/wont → low. The derivation is deliberate (documented at
// the call site) — the board must never receive a must/should/could/wont value.
function cardPriority(p: ReqPriority): 'high' | 'med' | 'low' {
  if (p === 'must') return 'high';
  if (p === 'should') return 'med';
  return 'low';
}

// The model may only cite ids from the derived index (never invent them) — any
// reqs id not seen on disk is dropped silently (forward-compatible, garble-
// tolerant). Stories are numbered US-01… positionally: stories.md is a wholly
// generated file, so regenerate renumbers in place.
function parseModelStories(parsed: Record<string, unknown> | null, reqIds: Set<string>): ModelStory[] {
  if (!parsed) return [];
  const raw = Array.isArray(parsed.stories) ? parsed.stories : [];
  const out: ModelStory[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const title = cleanText(str(o.title), TITLE_MAX);
    const asA = cleanText(str(o.asA), BODY_MAX);
    const iWantTo = cleanText(str(o.iWantTo), BODY_MAX);
    const soThat = cleanText(str(o.soThat), BODY_MAX);
    // A story without a title or actor is incomplete output — skipped, not
    // half-rendered (same requireRows spirit as Run 1's splice).
    if (!title || !asA) continue;
    const priority: ReqPriority = isReqPriority(o.priority) ? o.priority : 'should';
    const reqs = Array.isArray(o.reqs)
      ? o.reqs
          .map((r) => (typeof r === 'string' ? r.trim() : ''))
          .filter((r): r is string => !!r && REQ_ID_RE.test(r) && reqIds.has(r))
      : [];
    // Per-story ACs may be absent (tolerated) — the prompt demands 3-5, but a
    // body-only story still renders and can be edited rather than vanishing.
    const acs = Array.isArray(o.acceptanceCriteria)
      ? o.acceptanceCriteria.map((a) => cleanText(str(a), AC_MAX)).filter(Boolean)
      : [];
    out.push({ usId: '', title, asA, iWantTo, soThat, priority, reqs, acs });
  }
  return out.map((s, i) => ({ ...s, usId: `US-${String(i + 1).padStart(2, '0')}` }));
}

// The derived requirements index fed to the model — the EXACT ids (and current
// texts) it may derive stories from. Built from the same parseRequirements the
// trigger gate uses, so the index can never be empty while generation runs.
function buildDerivedIndex(prdDirPath: string): { index: string; reqIds: Set<string> } {
  const prdText = fs.existsSync(prdFilePath(prdDirPath, 'prd.md'))
    ? fs.readFileSync(prdFilePath(prdDirPath, 'prd.md'), 'utf-8')
    : '';
  const featuresText = fs.existsSync(prdFilePath(prdDirPath, 'features.md'))
    ? fs.readFileSync(prdFilePath(prdDirPath, 'features.md'), 'utf-8')
    : '';
  const parsed = parseRequirements(prdText, featuresText);
  const reqIds = new Set<string>();
  const lines: string[] = [];
  for (const fe of parsed.features) {
    reqIds.add(fe.feId);
    lines.push(`${fe.feId} [${fe.priority ?? 'should'}]: ${fe.title}`);
    for (const req of fe.reqs) {
      reqIds.add(req.id);
      lines.push(`  - ${req.id} [${req.priority ?? 'should'}]: ${req.text}`);
    }
  }
  for (const br of parsed.businessReqs) {
    reqIds.add(br.id);
    lines.push(`- ${br.id} [${br.priority ?? 'should'}]: ${br.text}`);
  }
  return { index: lines.join('\n'), reqIds };
}

// ── The async generation job ────────────────────────────────────────────────

async function runStoryGenJob(projectId: number): Promise<void> {
  const row = getProjectRow(String(projectId));
  if (!row) {
    writeState(projectId, {
      state: 'failed',
      generated: 0,
      total: 0,
      currentSection: null,
      startedAt: Date.now(),
      error: 'Project not found for generation',
    });
    return;
  }

  const existing = readState(projectId);
  if (!existing) {
    writeState(projectId, {
      state: 'failed',
      generated: 0,
      total: 0,
      currentSection: null,
      startedAt: Date.now(),
      error: 'No generation state found — this should not happen.',
    });
    return;
  }

  const prdDirPath = path.join(resolveProjectFolder(row), 'PRD');
  const storiesPath = path.join(prdDirPath, 'stories.md');

  const context = buildContext(row);
  if (!context) {
    writeState(projectId, { ...existing, state: 'failed', currentSection: null, error: 'Could not assemble prompt context' });
    return;
  }
  const derived = buildDerivedIndex(prdDirPath);
  if (!derived.index) {
    writeState(projectId, { ...existing, state: 'failed', currentSection: null, error: 'Requirements are not fleshed out yet' });
    return;
  }

  // Heartbeat: keeps lastHeartbeatAt fresh while the Ollama call runs so the
  // stale-detection window stays tight without false-failing slow jobs.
  const startedAt = existing.startedAt;
  const heartbeat = setInterval(() => {
    try {
      const s = readState(projectId);
      if (s) writeState(projectId, { ...s, startedAt, lastHeartbeatAt: Date.now() });
    } catch {
      /* heartbeat is best-effort */
    }
  }, HEARTBEAT_MS);

  // Rowids created THIS run — rolled back in catch so a retry starts clean.
  let created: number[] = [];

  try {
    writeState(projectId, {
      ...existing,
      state: 'generating',
      generated: 0,
      total: 0,
      currentSection: 'stories',
      sectionStartedAt: Date.now(),
      lastHeartbeatAt: Date.now(),
      error: null,
    });

    const parsed = await callStoryModelJson(context, derived.index);
    const stories = parseModelStories(parsed, derived.reqIds);
    // A call that yields zero complete stories must FAIL the run — a silent
    // empty advance would write a header-only file and mark it done.
    if (stories.length === 0) {
      throw new Error('Model returned no user stories — retry to generate again.');
    }

    // Whole-file rewrite — "Regenerate to re-draft, overwritten in place".
    writeState(projectId, { ...existing, state: 'generating', total: stories.length, currentSection: 'stories', lastHeartbeatAt: Date.now(), result: { storiesGenerated: stories.length, issuesCreated: 0 }, error: null });
    await atomicWritePrd(storiesPath, renderStoriesFile(stories));

    // Replace the previous run's auto-created cards (never duplicate them).
    const prev = readMapping(projectId);
    for (const prior of prev.stories) {
      db.prepare('DELETE FROM kanban_card WHERE id = ? AND project_id = ?').run(prior.cardId, projectId);
    }
    const issues: { us: string; ticketKey: string; cardId: number }[] = [];
    for (const story of stories) {
      const project = { id: projectId };
      const ticketKey = nextTicketKey(project);
      const info = db
        .prepare(
          `INSERT INTO kanban_card (project_id, ticket_key, title, column, priority, points, assignee_agent, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(projectId, ticketKey, story.title, 'todo', cardPriority(story.priority), 0, '', '');
      const cardId = Number(info.lastInsertRowid);
      created.push(cardId);
      issues.push({ us: story.usId, ticketKey, cardId });
      // Live progress: the sprint banner counts stories as cards land.
      writeState(projectId, {
        ...existing,
        state: 'generating',
        generated: issues.length,
        total: stories.length,
        currentSection: 'stories',
        lastHeartbeatAt: Date.now(),
        result: { storiesGenerated: stories.length, issuesCreated: issues.length },
        error: null,
      });
    }
    writeMapping(projectId, { stories: issues });

    writeState(projectId, {
      ...existing,
      state: 'done',
      generated: stories.length,
      total: stories.length,
      currentSection: null,
      sectionStartedAt: undefined,
      lastHeartbeatAt: Date.now(),
      error: null,
      result: { storiesGenerated: stories.length, issuesCreated: issues.length },
    });
  } catch (err) {
    // Roll back this run's partial card inserts so a retry starts clean (the
    // previous run's cards were already deleted above and live in no mapping).
    for (const cardId of created) {
      db.prepare('DELETE FROM kanban_card WHERE id = ? AND project_id = ?').run(cardId, projectId);
    }
    const message = err instanceof Error ? err.message : String(err);
    writeState(projectId, {
      ...existing,
      state: 'failed',
      generated: 0,
      currentSection: null,
      sectionStartedAt: undefined,
      error: message,
    });
  } finally {
    clearInterval(heartbeat);
  }
}

// ── Rendering the stories file (the write side of the story grammar) ─────────

function renderStoriesFile(stories: ModelStory[]): string {
  const header =
    '# User Stories\n' +
    '\n' +
    'Derived stories (Run 2) — generated by the Business Analyst agent from the\n' +
    'approved Project Background artifacts and the Run-1 requirements. Each story\n' +
    'links the requirements it derives from (`reqs=` in the story meta) and carries\n' +
    'its own `## Acceptance Criteria` section (decision 6r). Regenerating from the\n' +
    'Sprint tab replaces this file in place.\n';
  const blocks = stories.map((s) => {
    // Generated rows stamp origin=generated (mechanically cleanable) and
    // status=draft (Run 1's generated rows do the same — a generated row is a
    // draft until a human reviews it). Unknown meta keys (incl. reqs) are
    // ignored by parseStoryMeta, so they round-trip as documentation.
    const meta = `<!-- story: priority=${s.priority} status=draft owner=BA origin=generated${s.reqs.length ? ` reqs=${s.reqs.join(',')}` : ''} -->`;
    const parts = [`**As a** ${s.asA}`];
    if (s.iWantTo) parts.push(`**I want to** ${s.iWantTo}`);
    if (s.soThat) parts.push(`**so that** ${s.soThat}`);
    const body = `${parts.join(', ')}.`;
    const lines = [`### ${s.usId} — ${s.title}`, meta, body];
    if (s.acs.length) {
      lines.push('', '## Acceptance Criteria');
      lines.push(...s.acs.map((a, i) => `- AC-${String(i + 1).padStart(3, '0')} | ${a}`));
    }
    return lines.join('\n');
  });
  return `${header}\n${blocks.join('\n\n')}\n`;
}

// ── Prompt + Ollama call ─────────────────────────────────────────────────────
// The model NEVER writes file text — it returns JSON story inputs; the server
// renders the grammar (US/AC ids, meta stamps). Asking for markdown directly
// would risk malformed blocks the story parser silently drops.

function storySystemPrompt(): string {
  return (
    'You are the Business Analyst agent of the Idea-to-Web-Solution framework. ' +
    'Respond with a single JSON object and nothing else — no markdown fences, no commentary. ' +
    'Ground every story in the project context and the Derived requirements index provided — ' +
    'never invent capabilities the requirements do not describe.'
  );
}

// Tolerant JSON extraction, mirroring agent-invoker's callModelJson: a fenced
// or prose-wrapped response still parses (first '{' to last '}').
async function callStoryModelJson(context: string, derivedIndex: string): Promise<Record<string, unknown> | null> {
  const user =
    `## Context (all approved artifacts)\n\n${context}\n\n` +
    `## Derived requirements (index — the only ids you may cite)\n\n${derivedIndex}\n\n` +
    `## Task\n\n` +
    `Write the user stories this project needs: a story is one user-facing capability with a testable outcome. ` +
    `Respond with JSON: ` +
    `{"stories":[{"title":"short story title","asA":"the actor","iWantTo":"the action","soThat":"the benefit",` +
    `"priority":"must|should|could|wont","reqs":["BR-001","TR-002"],"acceptanceCriteria":["testable outcome 1","testable outcome 2","testable outcome 3"]}]}\n\n` +
    `Include 3-8 stories covering the primary user journeys and the main failure paths. ` +
    `- "reqs" links this story to the requirements it derives from — cite ONLY ids from the Derived requirements index; empty array when none. ` +
    `- "acceptanceCriteria" is the story's own ## Acceptance Criteria — 3-5 concrete, testable statements, the acceptance tests a developer must satisfy.`;
  const raw = await callOllama(storySystemPrompt(), user);
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

// ── Route handlers ─────────────────────────────────────────────────────────

function handleGetStatus(req: Request, res: Response): void {
  const projectId = parseProjectId(req.params.projectId);
  if (projectId === null) {
    res.status(400).json({ error: 'Valid project ID is required.' });
    return;
  }
  // No state file → idle (the sprint card sits on "Generate" until clicked).
  res.json(toWire(readState(projectId)));
}

function handlePostGenerate(req: Request, res: Response): void {
  const projectId = parseProjectId(req.params.projectId);
  if (projectId === null) {
    res.status(400).json({ error: 'Valid project ID is required.' });
    return;
  }
  const result = triggerStoryGeneration(projectId);
  if (!result.ok) {
    // Gate not met / already running — 409 so the client's reqFetch surfaces
    // the reason verbatim instead of misreading it as "generation started".
    res.status(409).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
}

// ── Route registration ─────────────────────────────────────────────────────

export function registerStoryGenRoutes(app: Application): void {
  const prefix = '/api/projects/:projectId/stories';
  app.get(`${prefix}/status`, handleGetStatus);
  app.post(`${prefix}/generate`, handlePostGenerate);
}
