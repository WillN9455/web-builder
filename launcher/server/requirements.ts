// Requirements tab — the 8 CRUD endpoints (requirements.html v5.3 `#spec`,
// API section — non-negotiable). Every mutation writes back to the project's
// on-disk PRD/prd.md (§8, BR- rows) and PRD/user-journeys.md (per-story
// blocks, TR- rows) via surgical line splices: the file is never
// re-serialized, so content outside the edited scope stays byte-identical
// after a save (AC-9, verified by scripts/verify-requirements.ts).
//
// Security notes (framework shared/skills/security.md):
// - The project is resolved by id-or-slug from the DB (shared with #18's
//   ba-workspace); folder_path comes from the row, never from the request.
// - Only prd.md / user-journeys.md inside the resolved PRD/ dir are ever
//   touched (R1 containment). Route-param IDs are validated against the
//   grammar and used for lookup only — never for path construction.
// - Every mutation re-reads the target file immediately before splicing.
// - Writes land atomically (.tmp + rename) via prd-fs.atomicWritePrd, so a
//   crash never leaves a PRD half-updated (spec SEC), and every write
//   serializes through prd-fs's path-keyed mutex (review B1): an async
//   writer holding the PRD lock (the BA auto-draft job's write moment)
//   queues behind, or is queued behind, rather than interleaving.
// TODO(auth): the spec's SEC section wants BA-only writes with 403 for other
// roles, but the launcher has no auth middleware (single-user local app —
// the current user is effectively the BA). Role enforcement is not
// implementable here; every write route below carries the seam (plan §0c).

import express from 'express';
import fs from 'node:fs';
import {
  allowedTransitions,
  businessReqInsertIndex,
  collectExistingIds,
  insertAfter,
  isReqStatus,
  isReqType,
  liveReqIds,
  nextFreeId,
  parseStories,
  parseRequirements,
  renderReqRow,
  renderStoryBlock,
  spliceLine,
  storyReferencesId,
  storyReqInsertIndex,
  validateReqInput,
  validateReqPatch,
  validateStoryInput,
  validateStoryPatch,
  type ParseResult,
  type ReqOwner,
  type ReqPriority,
  type ReqRow,
  type ReqStatus,
  type ReqType,
  type StoryRow,
} from './requirements-model.js';
import { getProjectRow, prdDir } from './ba-workspace.js';
import { atomicWritePrd, prdFilePath } from './prd-fs.js';

// Route-param ID grammars — validated before any lookup (containment: the ID
// is a lookup key, never a path).
const REQ_ID_RE = /^(?:BR|TR)-\d{3}$/;
const US_ID_RE = /^US-\d{2,}$/;

// ── Serialization (internal geometry never leaves the server) ──────────────

function serializeReq(r: ReqRow) {
  return {
    id: r.id,
    type: r.type,
    priority: r.priority,
    status: r.status,
    owner: r.owner,
    text: r.text,
    // Only meaningful for BRs; TRs always carry their block's usId (set by
    // the parse step). The UI uses this to label the row in the right
    // group without re-parsing the file.
    storyUsId: r.storyUsId,
    // 'manual' = BA wrote it via the UI; 'generated' = an agent wrote it;
    // null = legacy row, predates the marker.
    origin: r.origin,
  };
}

function serializeStory(s: StoryRow) {
  return {
    usId: s.usId,
    title: s.title,
    asA: s.asA,
    iWantTo: s.iWantTo,
    soThat: s.soThat,
    priority: s.priority,
    status: s.status,
    owner: s.owner,
    // QA-2: stories carry their own origin tag; null renders as manual in
    // the UI (per the §5 Q1 resolution Will approved — overrides the
    // 2026-09-03 Flag-1 wording).
    origin: s.origin,
    reqs: s.reqs.map(serializeReq),
  };
}

type ProjectRow = { id: number; name: string; slug: string; folder_path: string };

// ── Shared helpers ─────────────────────────────────────────────────────────

function readPrdFile(filePath: string): { text: string; ok: boolean } {
  try {
    return { text: fs.readFileSync(filePath, 'utf-8'), ok: true };
  } catch {
    return { text: '', ok: false };
  }
}

// The status machine, applied to a row/story whose parsed status may be null
// (a metadata-less legacy row has no machine state to violate — setting a
// status becomes the new baseline; plan §2).
function transitionAllowed(current: ReqStatus | null, next: ReqStatus): boolean {
  if (current === null || current === next) return true; // same value = no-op, not a transition
  return allowedTransitions(current).includes(next);
}

// Where the soft-delete marker lives: `<!-- deleted <ISO> by BA -->` (spec
// SEC's 30-day recovery seam — markers only, nothing reaps them, plan §2).
function deleteMarker(note?: string): string {
  return `<!-- deleted ${new Date().toISOString().slice(0, 10)} by BA${note ? ` (${note})` : ''} -->`;
}

// Strike one requirement row in place: `- TR-001 | …` → `- ~~TR-001 | …~~`,
// with the delete marker on its own line directly after (both files' parsers
// treat a struck row as soft-deleted and exclude it from the list).
function strikeRow(lines: string[], row: ReqRow): { lines: string[]; markerAfter: number } {
  const inner = row.raw.trim().replace(/^[-*+]\s+/, '');
  return { lines: spliceLine(lines, row.lineIndex, `- ~~${inner}~~`), markerAfter: row.lineIndex };
}

// Insertion ops collected against original line indexes, applied highest
// index first so earlier indexes stay valid (strike + marker + new-row moves).
function applyInsertions(lines: string[], ops: { after: number; lines: string[] }[]): string[] {
  const sorted = [...ops].sort((a, b) => b.after - a.after);
  let out = lines;
  for (const op of sorted) out = insertAfter(out, op.after, op.lines);
  return out;
}

// Locate a requirement across the two files. TR- rows live inside story
// blocks (their owner story matters for the delete guard); a soft-deleted
// story's rows are absent from the parse and 404 like anything unknown.
function locateReq(
  parsed: ParseResult,
  reqId: string,
): { file: 'prd.md' | 'user-journeys.md'; row: ReqRow; ownerStory: StoryRow | null } | null {
  const br = parsed.businessReqs.find((r) => r.id === reqId);
  if (br) return { file: 'prd.md', row: br, ownerStory: null };
  for (const story of parsed.stories) {
    const tr = story.reqs.find((r) => r.id === reqId);
    if (tr) return { file: 'user-journeys.md', row: tr, ownerStory: story };
  }
  return null;
}

// The delete guard's reference rule (spec VALID): other stories' text that
// mentions the ID — the owner's own block doesn't count.
function referencingStories(parsed: ParseResult, reqId: string, ownerUsId: string | null): string[] {
  return parsed.stories
    .filter((s) => s.usId !== ownerUsId && storyReferencesId(s, reqId))
    .map((s) => s.usId);
}

// Merged row values for re-rendering; a field the patch didn't set and that
// the row never had is a validation failure, not a silent default — the
// server never invents grammar values for a legacy row (plan §6.8).
function mergedReqValues(
  row: ReqRow,
  patch: { text?: string; priority?: ReqPriority; status?: ReqStatus; owner?: ReqOwner },
): { text: string; priority: ReqPriority; status: ReqStatus; owner: ReqOwner } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const text = patch.text ?? row.text;
  const priority = patch.priority ?? row.priority;
  const status = patch.status ?? row.status;
  const owner = patch.owner ?? row.owner;
  if (!text) errors.text = 'Required';
  if (!priority) errors.priority = 'Required — this legacy row has no priority; set one to convert it';
  if (!status) errors.status = 'Required — this legacy row has no status; set one to convert it';
  if (!owner) errors.owner = 'Required — this legacy row has no owner; set one to convert it';
  if (Object.keys(errors).length > 0) return { errors };
  return { text, priority: priority as ReqPriority, status: status as ReqStatus, owner: owner as ReqOwner };
}

// ── Routes ─────────────────────────────────────────────────────────────────

export function registerRequirementsRoutes(app: express.Express): void {
  // GET /requirements — list stories + their BR/TR rows. Missing/unreadable
  // PRD/ is a 200 with the `no-prd` empty state, never a 500 (AC-10).
  app.get('/api/projects/:id/requirements', (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const dir = prdDir(row);
    const prdPath = prdFilePath(dir, 'prd.md');
    const journeysPath = prdFilePath(dir, 'user-journeys.md');
    if (!fs.existsSync(prdPath) && !fs.existsSync(journeysPath)) {
      res.json({ stories: [], businessReqs: [], source: 'no-prd' });
      return;
    }
    const prd = readPrdFile(prdPath);
    const journeys = readPrdFile(journeysPath);
    const parsed = parseRequirements(prd.text, journeys.text);
    const unreadable =
      (!prd.ok && fs.existsSync(prdPath)) || (!journeys.ok && fs.existsSync(journeysPath));
    const parseError = unreadable
      ? 'One of the PRD files could not be read; its requirements are hidden until it is readable.'
      : parsed.parseError;
    res.json({
      stories: parsed.stories.map(serializeStory),
      businessReqs: parsed.businessReqs.map(serializeReq),
      source: 'ok',
      ...(parseError ? { parseError } : {}),
    });
  });

  // POST /stories — append a new US-NN block (story-first add flow, AC-4).
  app.post('/api/projects/:id/stories', async (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const journeysPath = prdFilePath(prdDir(row), 'user-journeys.md');
    if (!fs.existsSync(journeysPath)) {
      res.status(409).json({ error: 'user-journeys.md does not exist yet — it is created with the PRD scaffold' });
      return;
    }
    const validation = validateStoryInput(req.body);
    if (!validation.ok) {
      res.status(422).json({ errors: validation.errors });
      return;
    }
    // Re-read immediately before splicing — the write is built from the file
    // as it exists this instant, not from the GET's snapshot.
    const { text } = readPrdFile(journeysPath);
    // Story IDs allocate from every heading ever written (soft-deleted
    // included) — a deleted story's ID is never reused.
    const usId = nextFreeId(collectExistingIds('', text).us, 'US');
    let lines = text.split('\n');
    if (lines.length === 0 || lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(...renderStoryBlock({ usId, ...validation.value }).split('\n'));
    try {
      await atomicWritePrd(journeysPath, lines.join('\n'));
    } catch {
      res.status(500).json({ error: 'Could not write PRD file' });
      return;
    }
    res.status(201).json({
      ok: true,
      story: serializeStory({
        usId,
        title: validation.value.title,
        asA: validation.value.asA,
        iWantTo: validation.value.iWantTo,
        soThat: validation.value.soThat,
        priority: validation.value.priority,
        status: validation.value.status,
        owner: validation.value.owner,
        // QA-2: every POST stamps origin=manual — the BA is the only writer
        // today; the future auto-draft will stamp origin=generated.
        origin: 'manual',
        reqs: [],
        headingLine: -1,
        metaLine: null,
        bodyLine: null,
        blockEnd: -1,
        deleted: false,
      }),
    });
  });

  // PATCH /stories/:usId — title / As-a / I-want-to / So-that / story-status.
  app.patch('/api/projects/:id/stories/:usId', async (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!US_ID_RE.test(req.params.usId)) {
      res.status(400).json({ error: 'Invalid story id' });
      return;
    }
    const validation = validateStoryPatch(req.body);
    if (!validation.ok) {
      res.status(422).json({ errors: validation.errors });
      return;
    }
    const journeysPath = prdFilePath(prdDir(row), 'user-journeys.md');
    if (!fs.existsSync(journeysPath)) {
      res.status(404).json({ error: 'user-journeys.md does not exist' });
      return;
    }
    const { text } = readPrdFile(journeysPath);
    const story = parseStories(text).stories.find((s) => s.usId === req.params.usId);
    if (!story) {
      res.status(404).json({ error: `Unknown story ${req.params.usId}` });
      return;
    }
    const value = validation.value;
    if (value.status && !transitionAllowed(story.status, value.status)) {
      res.status(422).json({
        errors: { status: `Cannot move ${story.usId} from ${story.status} to ${value.status}` },
      });
      return;
    }

    let lines = text.split('\n');
    const insertions: { after: number; lines: string[] }[] = [];
    if (value.title) {
      lines = spliceLine(lines, story.headingLine, `### ${story.usId} — ${value.title}`);
    }
    if (value.asA !== undefined || value.iWantTo !== undefined || value.soThat !== undefined) {
      const asA = value.asA ?? story.asA ?? '';
      const iWantTo = value.iWantTo ?? story.iWantTo ?? '';
      const soThat = value.soThat ?? story.soThat ?? '';
      const sentence = `**As a** ${asA}, **I want to** ${iWantTo}, **so that** ${soThat}.`;
      if (story.bodyLine !== null) {
        lines = spliceLine(lines, story.bodyLine, sentence);
      } else {
        insertions.push({ after: story.metaLine ?? story.headingLine, lines: [sentence] });
      }
    }
    if (value.priority !== undefined || value.status !== undefined || value.owner !== undefined) {
      // Partial meta comment — only the keys that have a value are written;
      // parseStoryMeta tolerates partial comments on the next read.
      const parts: string[] = [];
      const priority = value.priority ?? story.priority;
      const status = value.status ?? story.status;
      const owner = value.owner ?? story.owner;
      // QA-2: stories carry their own origin tag. A legacy block has no
      // origin in its meta comment; the first PATCH that touches the meta
      // block stamps origin=manual so the tag starts rendering. Future
      // BA auto-draft writes origin=generated.
      const origin: 'manual' | 'generated' = story.origin ?? 'manual';
      if (priority) parts.push(`priority=${priority}`);
      if (status) parts.push(`status=${status}`);
      if (owner) parts.push(`owner=${owner}`);
      parts.push(`origin=${origin}`);
      if (parts.length > 0) {
        const meta = `<!-- story: ${parts.join(' ')} -->`;
        if (story.metaLine !== null) {
          lines = spliceLine(lines, story.metaLine, meta);
        } else {
          insertions.push({ after: story.headingLine, lines: [meta] });
        }
      }
    }
    lines = applyInsertions(lines, insertions);
    try {
      await atomicWritePrd(journeysPath, lines.join('\n'));
    } catch {
      res.status(500).json({ error: 'Could not write PRD file' });
      return;
    }
    res.json({
      ok: true,
      story: serializeStory({
        ...story,
        title: value.title ?? story.title,
        asA: value.asA ?? story.asA,
        iWantTo: value.iWantTo ?? story.iWantTo,
        soThat: value.soThat ?? story.soThat,
        priority: value.priority ?? story.priority,
        status: value.status ?? story.status,
        owner: value.owner ?? story.owner,
        // QA-2: a PATCH that touches the meta comment stamps origin so
        // the tag starts rendering; preserve it otherwise.
        origin: story.origin ?? 'manual',
      }),
    });
  });

  // DELETE /stories/:usId — soft-delete the block: strike its requirement
  // rows, add the delete marker, leave everything recoverable on disk.
  app.delete('/api/projects/:id/stories/:usId', async (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!US_ID_RE.test(req.params.usId)) {
      res.status(400).json({ error: 'Invalid story id' });
      return;
    }
    const journeysPath = prdFilePath(prdDir(row), 'user-journeys.md');
    if (!fs.existsSync(journeysPath)) {
      res.status(404).json({ error: 'user-journeys.md does not exist' });
      return;
    }
    const { text } = readPrdFile(journeysPath);
    const story = parseStories(text).stories.find((s) => s.usId === req.params.usId);
    if (!story) {
      res.status(404).json({ error: `Unknown story ${req.params.usId}` });
      return;
    }
    const lines0 = text.split('\n');
    let lines = lines0;
    const ops: { after: number; lines: string[] }[] = [
      { after: story.headingLine, lines: [deleteMarker()] },
    ];
    for (const r of story.reqs) {
      const struck = strikeRow(lines, r);
      lines = struck.lines;
      ops.push({ after: struck.markerAfter, lines: [deleteMarker()] });
    }
    // Insertions descending so the strike replacements' indexes stay valid.
    lines = applyInsertions(lines, ops);
    try {
      await atomicWritePrd(journeysPath, lines.join('\n'));
    } catch {
      res.status(500).json({ error: 'Could not write PRD file' });
      return;
    }
    res.json({ ok: true, usId: story.usId });
  });

  // POST /stories/:usId/requirements — story-first add (spec VALID: the story
  // is in the path; a body `story` field is rejected, not silently honored).
  app.post('/api/projects/:id/stories/:usId/requirements', async (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!US_ID_RE.test(req.params.usId)) {
      res.status(400).json({ error: 'Invalid story id' });
      return;
    }
    if (req.body?.story !== undefined) {
      res.status(422).json({
        errors: { story: 'Requirements attach to the story in the URL path — story-first, no picker' },
      });
      return;
    }
    const validation = validateReqInput(req.body);
    if (!validation.ok) {
      res.status(422).json({ errors: validation.errors });
      return;
    }
    const value = validation.value;
    const dir = prdDir(row);
    if (value.type === 'BR') {
      const prdPath = prdFilePath(dir, 'prd.md');
      if (!fs.existsSync(prdPath)) {
        res.status(409).json({ error: 'prd.md does not exist yet — it is created with the PRD scaffold' });
        return;
      }
      const { text } = readPrdFile(prdPath);
      const prdLines = text.split('\n');
      const idx = businessReqInsertIndex(prdLines);
      if (idx === null) {
        res.status(409).json({ error: 'prd.md has no §8 section to write business requirements into' });
        return;
      }
      const id = nextFreeId(liveReqIds(parseRequirements(text, '')).filter((x) => x.startsWith('BR-')), 'BR');
      // Always link a BR to its creating story — refinement batch item 2.7.
      // The link lives as `<!-- BR-NNN: story=US-NN, origin=manual -->` directly
      // after the row so the next parse reads it. origin=manual is the BA's
      // stamp today; the future BA auto-draft job will write origin=generated
      // (item 2.6 — this commit only ships the marker plumbing).
      const row1 = renderReqRow(id, value.priority, value.status, value.owner, value.text);
      const meta = `<!-- ${id}: story=${req.params.usId}, origin=manual -->`;
      const lines = insertAfter(prdLines, idx, [row1, meta]);
      try {
        await atomicWritePrd(prdPath, lines.join('\n'));
      } catch {
        res.status(500).json({ error: 'Could not write PRD file' });
        return;
      }
      res.status(201).json({
        ok: true,
        requirement: {
          id,
          type: 'BR',
          priority: value.priority,
          status: value.status,
          owner: value.owner,
          text: value.text,
          storyUsId: req.params.usId,
          origin: 'manual',
        },
      });
      return;
    }
    // TR → the story's block in user-journeys.md.
    const journeysPath = prdFilePath(dir, 'user-journeys.md');
    if (!fs.existsSync(journeysPath)) {
      res.status(409).json({ error: 'user-journeys.md does not exist yet — it is created with the PRD scaffold' });
      return;
    }
    const { text } = readPrdFile(journeysPath);
    const story = parseStories(text).stories.find((s) => s.usId === req.params.usId);
    if (!story) {
      res.status(404).json({ error: `Unknown story ${req.params.usId}` });
      return;
    }
    const id = nextFreeId(liveReqIds(parseRequirements('', text)).filter((x) => x.startsWith('TR-')), 'TR');
    // QA-2: TRs stamp origin=manual on POST — pairs with the BR origin
    // marker, parser reads it via TR_META_RE one line look-ahead.
    const newRow = renderReqRow(id, value.priority, value.status, value.owner, value.text);
    const trMeta = `<!-- ${id}: origin=manual -->`;
    const lines = insertAfter(text.split('\n'), storyReqInsertIndex(story), [newRow, trMeta]);
    try {
      await atomicWritePrd(journeysPath, lines.join('\n'));
    } catch {
      res.status(500).json({ error: 'Could not write PRD file' });
      return;
    }
    res.status(201).json({
      ok: true,
      requirement: { id, type: 'TR', priority: value.priority, status: value.status, owner: value.owner, text: value.text, origin: 'manual' as const },
    });
  });

  // PATCH /requirements/:reqId — text / priority / owner / status (+ type as
  // a move: BR lives in prd.md §8, TR lives in the story block, so a type
  // change strikes the old row and lands a new one in the other file under a
  // freshly allocated ID of the new prefix — the old ID is never edited in
  // place into a vocabulary it doesn't carry).
  app.patch('/api/projects/:id/requirements/:reqId', async (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!REQ_ID_RE.test(req.params.reqId)) {
      res.status(400).json({ error: 'Invalid requirement id' });
      return;
    }
    const validation = validateReqPatch(req.body);
    if (!validation.ok) {
      res.status(422).json({ errors: validation.errors });
      return;
    }
    const dir = prdDir(row);
    const prdPath = prdFilePath(dir, 'prd.md');
    const journeysPath = prdFilePath(dir, 'user-journeys.md');
    const prd = readPrdFile(prdPath);
    const journeys = readPrdFile(journeysPath);
    const parsed = parseRequirements(prd.text, journeys.text);
    const located = locateReq(parsed, req.params.reqId);
    if (!located) {
      res.status(404).json({ error: `Unknown requirement ${req.params.reqId}` });
      return;
    }
    const { row: reqRow, ownerStory } = located;
    const value = validation.value;

    // Type move (spec VALID: type is BR|TR; the plan's PATCH table lists it).
    const targetType: ReqType | null =
      isReqType(req.body?.type) && (req.body.type as ReqType) !== reqRow.type ? (req.body.type as ReqType) : null;
    if (value.status && !transitionAllowed(reqRow.status, value.status)) {
      res.status(422).json({
        errors: { status: `Cannot move ${reqRow.id} from ${reqRow.status} to ${value.status}` },
      });
      return;
    }
    const merged = mergedReqValues(reqRow, value);
    if ('errors' in merged) {
      res.status(422).json({ errors: merged.errors });
      return;
    }

    // Per-file working state: strike/re-render mutate `lines` in place, and
    // insertion ops collected against the original indexes are applied
    // highest-first just before the write. Only files that actually changed
    // are written, so untouched content stays byte-identical on disk (AC-9).
    type Op = { after: number; lines: string[] };
    const prdLines = prd.text.split('\n');
    const journeyLines = journeys.text.split('\n');
    const files: Record<'prd.md' | 'user-journeys.md', { path: string; lines: string[]; ops: Op[] }> = {
      'prd.md': { path: prdPath, lines: prdLines, ops: [] },
      'user-journeys.md': { path: journeysPath, lines: journeyLines, ops: [] },
    };

    if (targetType) {
      // Strike the old row (soft-delete marker notes the move), allocate the
      // new ID from the live rows of the target prefix, land the new row in
      // its home file.
      const home = reqRow.type === 'BR' ? 'prd.md' : 'user-journeys.md';
      const struck = strikeRow(files[home].lines, reqRow);
      files[home].lines = struck.lines;
      files[home].ops.push({
        after: struck.markerAfter,
        lines: [deleteMarker(`moved to ${targetType === 'BR' ? 'prd.md §8' : 'the story block'}`)],
      });
      const live = liveReqIds(
        parseRequirements(files['prd.md'].lines.join('\n'), files['user-journeys.md'].lines.join('\n')),
      ).filter((x) => x.startsWith(targetType));
      const newId = nextFreeId(live, targetType as 'BR' | 'TR');
      const newRow = renderReqRow(newId, merged.priority, merged.status, merged.owner, merged.text);
      // QA-2: type moves stamp origin=manual on the new row — same as POST.
      const newMeta = `<!-- ${newId}: origin=manual -->`;
      if (targetType === 'BR') {
        const idx = businessReqInsertIndex(files['prd.md'].lines);
        if (idx === null) {
          res.status(409).json({ error: 'prd.md has no §8 section to write business requirements into' });
          return;
        }
        files['prd.md'].ops.push({ after: idx, lines: [newRow, newMeta] });
      } else if (ownerStory) {
        files['user-journeys.md'].ops.push({ after: storyReqInsertIndex(ownerStory), lines: [newRow, newMeta] });
      } else {
        // A TR whose owning story is gone (soft-deleted mid-flight) — refuse
        // rather than land the row in an unknown block.
        res.status(404).json({ error: `The story owning ${reqRow.id} no longer exists` });
        return;
      }
    } else {
      const updated = renderReqRow(reqRow.id, merged.priority, merged.status, merged.owner, merged.text);
      const home = reqRow.type === 'BR' ? 'prd.md' : 'user-journeys.md';
      files[home].lines = spliceLine(files[home].lines, reqRow.lineIndex, updated);
      // QA-2: editing a legacy row (origin=null) stamps origin=manual so
      // the dot starts rendering. The marker is glued to the row — the
      // parser's meta-comment look-ahead skips blank lines so a separator
      // between the row and the marker still parses correctly.
      if (reqRow.origin === null) {
        const meta = `<!-- ${reqRow.id}: origin=manual -->`;
        const insertAt = reqRow.lineIndex + 1;
        const next = files[home].lines[insertAt];
        if (next === '' || next === undefined) {
          // Replace the blank line (or fill the trailing gap) with the
          // marker so we don't grow the file with two blank lines.
          files[home].lines = spliceLine(files[home].lines, insertAt, meta);
        } else {
          files[home].lines.splice(insertAt, 0, meta);
        }
      }
    }

    for (const f of Object.values(files)) {
      if (f.ops.length === 0 && f.lines === (f === files['prd.md'] ? prdLines : journeyLines)) continue;
      try {
        await atomicWritePrd(f.path, applyInsertions(f.lines, f.ops).join('\n'));
      } catch {
        res.status(500).json({ error: 'Could not write PRD file' });
        return;
      }
    }
    res.json({
      ok: true,
      requirement: {
        id: reqRow.id,
        type: targetType ?? reqRow.type,
        priority: merged.priority,
        status: merged.status,
        owner: merged.owner,
        text: merged.text,
      },
    });
  });

  // PATCH /requirements/:reqId/status — the dropdown's thin wrapper.
  app.patch('/api/projects/:id/requirements/:reqId/status', async (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!REQ_ID_RE.test(req.params.reqId)) {
      res.status(400).json({ error: 'Invalid requirement id' });
      return;
    }
    if (!isReqStatus(req.body?.status)) {
      res.status(422).json({ errors: { status: 'Must be one of the 8 canonical statuses' } });
      return;
    }
    const dir = prdDir(row);
    const prdPath = prdFilePath(dir, 'prd.md');
    const journeysPath = prdFilePath(dir, 'user-journeys.md');
    const prd = readPrdFile(prdPath);
    const journeys = readPrdFile(journeysPath);
    const parsed = parseRequirements(prd.text, journeys.text);
    const located = locateReq(parsed, req.params.reqId);
    if (!located) {
      res.status(404).json({ error: `Unknown requirement ${req.params.reqId}` });
      return;
    }
    const { row: reqRow } = located;
    const next = req.body.status as ReqStatus;
    if (!transitionAllowed(reqRow.status, next)) {
      res.status(422).json({
        errors: { status: `Cannot move ${reqRow.id} from ${reqRow.status} to ${next}` },
      });
      return;
    }
    // A legacy row missing priority/owner cannot be re-rendered without the
    // server inventing values — refuse and point at the full PATCH, exactly
    // like mergedReqValues (review N1; errors._ is the established key).
    if (reqRow.priority === null || reqRow.owner === null) {
      res.status(422).json({
        errors: { _: 'Set priority + owner on this legacy row before changing status' },
      });
      return;
    }
    const updated = renderReqRow(
      reqRow.id,
      reqRow.priority as ReqPriority,
      next,
      reqRow.owner as ReqOwner,
      reqRow.text,
    );
    if (reqRow.type === 'BR') {
      try {
        await atomicWritePrd(prdPath, spliceLine(prd.text.split('\n'), reqRow.lineIndex, updated).join('\n'));
      } catch {
        res.status(500).json({ error: 'Could not write PRD file' });
        return;
      }
    } else {
      try {
        await atomicWritePrd(journeysPath, spliceLine(journeys.text.split('\n'), reqRow.lineIndex, updated).join('\n'));
      } catch {
        res.status(500).json({ error: 'Could not write PRD file' });
        return;
      }
    }
    res.json({
      ok: true,
      requirement: {
        id: reqRow.id,
        type: reqRow.type,
        priority: reqRow.priority,
        status: next,
        owner: reqRow.owner,
        text: reqRow.text,
      },
    });
  });

  // DELETE /requirements/:reqId — soft-delete with the spec's guard: an
  // approved/done requirement that another story references is kept with a
  // 409 explaining the dependency (AC-11).
  app.delete('/api/projects/:id/requirements/:reqId', async (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!REQ_ID_RE.test(req.params.reqId)) {
      res.status(400).json({ error: 'Invalid requirement id' });
      return;
    }
    const dir = prdDir(row);
    const prdPath = prdFilePath(dir, 'prd.md');
    const journeysPath = prdFilePath(dir, 'user-journeys.md');
    const prd = readPrdFile(prdPath);
    const journeys = readPrdFile(journeysPath);
    const parsed = parseRequirements(prd.text, journeys.text);
    const located = locateReq(parsed, req.params.reqId);
    if (!located) {
      res.status(404).json({ error: `Unknown requirement ${req.params.reqId}` });
      return;
    }
    const { row: reqRow, ownerStory, file } = located;
    if (reqRow.status === 'approved' || reqRow.status === 'done') {
      const referencedBy = referencingStories(parsed, reqRow.id, ownerStory?.usId ?? null);
      if (referencedBy.length > 0) {
        res.status(409).json({
          error: `Cannot delete ${reqRow.id} — it is ${reqRow.status} and referenced by ${referencedBy.join(', ')}`,
          referencedBy,
        });
        return;
      }
    }
    const filePath = file === 'prd.md' ? prdPath : journeysPath;
    const lines = (file === 'prd.md' ? prd : journeys).text.split('\n');
    const struck = strikeRow(lines, reqRow);
    const out = insertAfter(struck.lines, struck.markerAfter, [deleteMarker()]);
    try {
      await atomicWritePrd(filePath, out.join('\n'));
    } catch {
      res.status(500).json({ error: 'Could not write PRD file' });
      return;
    }
    res.json({ ok: true, id: reqRow.id });
  });
}