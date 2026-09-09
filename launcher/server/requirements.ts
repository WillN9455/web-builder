// Requirements tab — the feature-first API (requirements redesign slices 1–3,
// design/requirements-redesign.md). Features (FE-NN) are the grouping
// container: feature blocks in PRD/features.md carry acceptance criteria
// (AC-NNN), technical requirements (TR-), and per-feature metadata (source
// link, priority/status/owner); business requirements (BR-) live in PRD/prd.md
// §8 and link to a feature via a `feature=FE-01` marker. Every mutation
// writes back via surgical line splices: the file is never re-serialized, so
// content outside the edited scope stays byte-identical after a save (AC-9,
// verified by scripts/verify-requirements.ts).
//
// Security notes (framework shared/skills/security.md):
// - The project is resolved by id-or-slug from the DB (shared with #18's
//   ba-workspace); folder_path comes from the row, never from the request.
// - Only prd.md / user-journeys.md / features.md inside the resolved PRD/ dir
//   are ever touched (R1 containment). Route-param IDs are validated against
//   the grammar and used for lookup only — never for path construction.
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
  featureAcInsertIndex,
  featureReferencesId,
  featureReqInsertIndex,
  insertAfter,
  isReqStatus,
  isReqType,
  migrateStoriesToFeatures,
  nextFreeId,
  parseFeatures,
  parseRequirements,
  renderAcRow,
  renderFeatureBlock,
  renderReqRow,
  spliceLine,
  validateAcInput,
  validateAcPatch,
  validateFeatureInput,
  validateFeaturePatch,
  validateReqInput,
  validateReqPatch,
  type AcRow,
  type FeatureRow,
  type ParseResult,
  type ReqOwner,
  type ReqPriority,
  type ReqRow,
  type ReqStatus,
  type ReqType,
} from './requirements-model.js';
import { getProjectRow, prdDir } from './ba-workspace.js';
import { atomicWritePrd, prdFilePath } from './prd-fs.js';

// Route-param ID grammars — validated before any lookup (containment: the ID
// is a lookup key, never a path).
const REQ_ID_RE = /^(?:BR|TR)-\d{3}$/;
const FE_ID_RE = /^FE-\d{2,}$/;
const AC_ID_RE = /^AC-\d{3}$/;

// ── Serialization (internal geometry never leaves the server) ──────────────

function serializeAc(a: AcRow) {
  return {
    id: a.id,
    status: a.status,
    text: a.text,
    // 'manual' = BA wrote it via the UI; 'generated' = an agent wrote it;
    // null = legacy row, predates the marker.
    origin: a.origin,
  };
}

function serializeReq(r: ReqRow) {
  return {
    id: r.id,
    type: r.type,
    priority: r.priority,
    status: r.status,
    owner: r.owner,
    text: r.text,
    // Only meaningful for BRs (read from the `feature=FE-NN` marker); TRs
    // always carry their block's feId (stamped by the parse step). The UI
    // uses this to label the row in the right group without re-parsing.
    featureId: r.featureId,
    origin: r.origin,
  };
}

function serializeFeature(f: FeatureRow) {
  return {
    feId: f.feId,
    title: f.title,
    description: f.description,
    source: f.source,
    priority: f.priority,
    status: f.status,
    owner: f.owner,
    origin: f.origin,
    acs: f.acs.map(serializeAc),
    reqs: f.reqs.map(serializeReq),
  };
}

// ── Shared helpers ─────────────────────────────────────────────────────────

function readPrdFile(filePath: string): { text: string; ok: boolean } {
  try {
    return { text: fs.readFileSync(filePath, 'utf-8'), ok: true };
  } catch {
    return { text: '', ok: false };
  }
}

// The status machine, applied to a row/feature whose parsed status may be null
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

// Strike one row in place: `- TR-001 | …` → `- ~~TR-001 | …~~`, with the delete
// marker on its own line directly after (the parsers treat a struck row as
// soft-deleted and exclude it from the list). Works for requirement rows and
// acceptance-criteria rows alike (both carry lineIndex + raw).
function strikeRow<T extends { lineIndex: number; raw: string }>(
  lines: string[],
  row: T,
): { lines: string[]; markerAfter: number } {
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

// Locate a requirement across the two files. TR- rows and linked BR- rows live
// inside feature blocks (their owner feature matters for the delete guard and
// the type-move); a soft-deleted feature's rows are absent from the parse and
// 404 like anything unknown.
//
// QA-10: when the caller knows the feature (the UI tracks feId on every row),
// `scopeFeId` narrows the search to that feature's rows. Unassigned BRs live
// in `parsed.businessReqs` and form their own null-scope pool. Once two
// features both carry a `TR-001`, scopeFeId is the only way to tell them
// apart — omitting it falls back to "first match wins" so legacy callers and
// the verify suite keep working. The UI should always pass the row's feId once
// duplicate display ids exist.
function locateReq(
  parsed: ParseResult,
  reqId: string,
  scopeFeId: string | null | undefined,
): { file: 'prd.md' | 'features.md'; row: ReqRow; ownerFeature: FeatureRow | null } | null {
  if (scopeFeId === null) {
    // Caller is asking for an unassigned BR specifically.
    const br = parsed.businessReqs.find((r) => r.id === reqId);
    if (br) return { file: 'prd.md', row: br, ownerFeature: null };
    return null;
  }
  if (scopeFeId) {
    const feature = parsed.features.find((f) => f.feId === scopeFeId);
    if (!feature) return null;
    // QA-14: map the file by row type, never by which find() matched. The
    // parser puts linked BRs INSIDE feature.reqs, so an untyped find would
    // return a BR stamped as features.md — the PATCH/DELETE then struck
    // features.md at the row's prd.md line index (the real row survived and a
    // phantom strike landed in features.md). BRs always live in prd.md; TRs
    // always live in their feature block in features.md.
    const row = feature.reqs.find((r) => r.id === reqId);
    if (row) {
      return { file: row.type === 'BR' ? 'prd.md' : 'features.md', row, ownerFeature: feature };
    }
    return null;
  }
  // Unscoped lookup — preserve the legacy "first match" behaviour so the
  // status-only PATCH and the verify suite keep working on legacy files.
  const br = parsed.businessReqs.find((r) => r.id === reqId);
  if (br) return { file: 'prd.md', row: br, ownerFeature: null };
  for (const feature of parsed.features) {
    const row = feature.reqs.find((r) => r.id === reqId);
    // QA-14: same file-by-type rule as the scoped branch — unscoped callers
    // can hit linked BRs too.
    if (row) return { file: row.type === 'BR' ? 'prd.md' : 'features.md', row, ownerFeature: feature };
  }
  return null;
}

// The delete guard's reference rule (spec VALID): other features' text that
// mentions the ID — the owner's own block doesn't count.
function referencingFeatures(parsed: ParseResult, reqId: string, ownerFeId: string | null): string[] {
  return parsed.features
    .filter((f) => f.feId !== ownerFeId && featureReferencesId(f, reqId))
    .map((f) => f.feId);
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
  // GET /requirements — list features (with their AC- and TR- rows) plus
  // unassigned BR rows. Missing/unreadable PRD/ is a 200 with the `no-prd`
  // empty state, never a 500 (AC-10).
  app.get('/api/projects/:id/requirements', (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const dir = prdDir(row);
    const prdPath = prdFilePath(dir, 'prd.md');
    const featuresPath = prdFilePath(dir, 'features.md');
    if (!fs.existsSync(prdPath) && !fs.existsSync(featuresPath)) {
      res.json({ features: [], businessReqs: [], source: 'no-prd' });
      return;
    }
    const prd = readPrdFile(prdPath);
    const features = readPrdFile(featuresPath);
    const parsed = parseRequirements(prd.text, features.text);
    const unreadable =
      (!prd.ok && fs.existsSync(prdPath)) || (!features.ok && fs.existsSync(featuresPath));
    const parseError = unreadable
      ? 'One of the PRD files could not be read; its requirements are hidden until it is readable.'
      : parsed.parseError;
    res.json({
      features: parsed.features.map(serializeFeature),
      businessReqs: parsed.businessReqs.map(serializeReq),
      source: 'ok',
      ...(parseError ? { parseError } : {}),
    });
  });

  // POST /features — append a new FE-NN feature block (feature-first add flow;
  // the `## Acceptance Criteria` section is always created empty inside the
  // block, so the section anchor exists for AC inserts — decision 6).
  app.post('/api/projects/:id/features', async (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const featuresPath = prdFilePath(prdDir(row), 'features.md');
    if (!fs.existsSync(featuresPath)) {
      res.status(409).json({ error: 'features.md does not exist yet — it is created with the PRD scaffold' });
      return;
    }
    const validation = validateFeatureInput(req.body);
    if (!validation.ok) {
      res.status(422).json({ errors: validation.errors });
      return;
    }
    // Re-read immediately before splicing — the write is built from the file
    // as it exists this instant, not from the GET's snapshot.
    const { text } = readPrdFile(featuresPath);
    // Feature IDs allocate from every heading ever written (soft-deleted
    // included) — a deleted feature's ID is never reused.
    const feId = nextFreeId(collectExistingIds('', '', text).fe, 'FE');
    let lines = text.split('\n');
    if (lines.length === 0 || lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(...renderFeatureBlock({ feId, ...validation.value, acs: [], trs: [] }).split('\n'));
    try {
      await atomicWritePrd(featuresPath, lines.join('\n'));
    } catch {
      res.status(500).json({ error: 'Could not write PRD file' });
      return;
    }
    res.status(201).json({
      ok: true,
      feature: serializeFeature({
        feId,
        title: validation.value.title,
        description: validation.value.description,
        source: validation.value.source,
        priority: validation.value.priority,
        status: validation.value.status,
        owner: validation.value.owner,
        // QA-2: every POST stamps origin=manual — the BA is the only writer
        // today; the future BA auto-draft job will stamp origin=generated.
        origin: 'manual',
        acs: [],
        reqs: [],
        headingLine: -1,
        metaLine: null,
        sourceLine: null,
        acHeadingLine: null,
        bodyLine: null,
        blockEnd: -1,
        deleted: false,
      }),
    });
  });

  // PATCH /features/:feId — title / description / source / priority / status /
  // owner. The metadata comment (priority/status/owner/origin) is re-rendered
  // in place; a legacy block that never had a meta or source comment gets the
  // missing lines inserted together in ONE op (see the fresh-block note below),
  // and a source cleared to null becomes an empty `<!-- source: -->` comment —
  // same line count, parser reads it as no source (surgical splice, AC-9).
  app.patch('/api/projects/:id/features/:feId', async (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!FE_ID_RE.test(req.params.feId)) {
      res.status(400).json({ error: 'Invalid feature id' });
      return;
    }
    const validation = validateFeaturePatch(req.body);
    if (!validation.ok) {
      res.status(422).json({ errors: validation.errors });
      return;
    }
    const featuresPath = prdFilePath(prdDir(row), 'features.md');
    if (!fs.existsSync(featuresPath)) {
      res.status(404).json({ error: 'features.md does not exist' });
      return;
    }
    const { text } = readPrdFile(featuresPath);
    const feature = parseFeatures(text).features.find((f) => f.feId === req.params.feId);
    if (!feature) {
      res.status(404).json({ error: `Unknown feature ${req.params.feId}` });
      return;
    }
    const value = validation.value;
    if (value.status && !transitionAllowed(feature.status, value.status)) {
      res.status(422).json({
        errors: { status: `Cannot move ${feature.feId} from ${feature.status} to ${value.status}` },
      });
      return;
    }

    let lines = text.split('\n');
    const insertions: { after: number; lines: string[] }[] = [];
    if (value.title) {
      lines = spliceLine(lines, feature.headingLine, `### ${feature.feId} — ${value.title}`);
    }

    // The feature metadata comment — always re-rendered whole (parseFeatureMeta
    // tolerates partial comments, but the write is the canonical form).
    let meta: string | null = null;
    if (value.priority !== undefined || value.status !== undefined || value.owner !== undefined) {
      const parts: string[] = [];
      const priority = value.priority ?? feature.priority;
      const status = value.status ?? feature.status;
      const owner = value.owner ?? feature.owner;
      // QA-2: features carry their own origin tag. A legacy block has no
      // origin in its meta comment; the first PATCH that touches the meta
      // stamps origin=manual so the tag starts rendering. Future BA
      // auto-draft writes origin=generated.
      const origin: 'manual' | 'generated' = feature.origin ?? 'manual';
      if (priority) parts.push(`priority=${priority}`);
      if (status) parts.push(`status=${status}`);
      if (owner) parts.push(`owner=${owner}`);
      parts.push(`origin=${origin}`);
      meta = `<!-- feature: ${parts.join(' ')} -->`;
      if (feature.metaLine !== null) {
        lines = spliceLine(lines, feature.metaLine, meta);
      }
    }

    // The source comment (decision 7). null clears it; a cleared line becomes
    // an empty `<!-- source: -->` comment so the block geometry is unchanged.
    let source: string | null = null;
    if (value.source !== undefined) {
      source = value.source === null ? '<!-- source: -->' : `<!-- source: ${value.source} -->`;
      if (feature.sourceLine !== null) {
        lines = spliceLine(lines, feature.sourceLine, source);
      }
    }

    // Description body — spliced in place when the block has one, else part of
    // the fresh-insertion block below.
    if (value.description !== undefined) {
      if (feature.bodyLine !== null) {
        lines = spliceLine(lines, feature.bodyLine, value.description);
      }
    }

    // Fresh inserts (comments/body the block never had) batch into ONE op so
    // equal anchors can't stack in the wrong order: applyInsertions' desc sort
    // is stable, and a single block sidesteps the question entirely. The anchor
    // is the topmost fresh element's resting place: meta at the heading, source
    // under the meta comment, description under the source comment.
    const fresh: string[] = [];
    if (meta && feature.metaLine === null) fresh.push(meta);
    if (source && feature.sourceLine === null) fresh.push(source);
    if (value.description !== undefined && feature.bodyLine === null) fresh.push(value.description);
    if (fresh.length > 0) {
      const anchor =
        meta && feature.metaLine === null
          ? feature.headingLine
          : source && feature.sourceLine === null
            ? feature.metaLine ?? feature.headingLine
            : feature.sourceLine ?? feature.metaLine ?? feature.headingLine;
      insertions.push({ after: anchor, lines: fresh });
    }

    lines = applyInsertions(lines, insertions);
    try {
      await atomicWritePrd(featuresPath, lines.join('\n'));
    } catch {
      res.status(500).json({ error: 'Could not write PRD file' });
      return;
    }
    res.json({
      ok: true,
      feature: serializeFeature({
        ...feature,
        title: value.title ?? feature.title,
        description: value.description !== undefined ? value.description : feature.description,
        source: value.source !== undefined ? value.source : feature.source,
        priority: value.priority ?? feature.priority,
        status: value.status ?? feature.status,
        owner: value.owner ?? feature.owner,
        // QA-2: a PATCH that touches the meta comment stamps origin so the
        // tag starts rendering; preserve it otherwise.
        origin: feature.origin ?? 'manual',
      }),
    });
  });

  // DELETE /features/:feId — soft-delete the block: feature marker after the
  // heading, TR rows struck inside features.md, linked BR rows struck in
  // prd.md. Everything stays recoverable on disk (30-day seam).
  app.delete('/api/projects/:id/features/:feId', async (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!FE_ID_RE.test(req.params.feId)) {
      res.status(400).json({ error: 'Invalid feature id' });
      return;
    }
    const dir = prdDir(row);
    const prdPath = prdFilePath(dir, 'prd.md');
    const featuresPath = prdFilePath(dir, 'features.md');
    const prd = readPrdFile(prdPath);
    const features = readPrdFile(featuresPath);
    const parsed = parseRequirements(prd.text, features.text);
    const feature = parsed.features.find((f) => f.feId === req.params.feId);
    if (!feature) {
      res.status(404).json({ error: `Unknown feature ${req.params.feId}` });
      return;
    }

    const marker = deleteMarker();
    let prdLines = prd.text.split('\n');
    let featureLines = features.text.split('\n');
    const prdOps: { after: number; lines: string[] }[] = [];
    const featOps: { after: number; lines: string[] }[] = [
      // Feature-level delete marker as the block's first content line — the
      // parser treats a leading delete comment as a soft-deleted feature and
      // excludes the whole block (AC rows included) from the list.
      { after: feature.headingLine, lines: [marker] },
    ];
    let prdChanged = false;
    for (const r of feature.reqs) {
      // QA-14: strike by the row's real home file — BRs in prd.md, TRs in the
      // feature block in features.md.
      if (r.type === 'BR') {
        const struck = strikeRow(prdLines, r);
        prdLines = struck.lines;
        prdOps.push({ after: struck.markerAfter, lines: [marker] });
        prdChanged = true;
      } else {
        const struck = strikeRow(featureLines, r);
        featureLines = struck.lines;
        featOps.push({ after: struck.markerAfter, lines: [marker] });
      }
    }
    try {
      if (prdChanged) {
        await atomicWritePrd(prdPath, applyInsertions(prdLines, prdOps).join('\n'));
      }
      await atomicWritePrd(featuresPath, applyInsertions(featureLines, featOps).join('\n'));
    } catch {
      res.status(500).json({ error: 'Could not write PRD file' });
      return;
    }
    res.json({ ok: true, feId: feature.feId });
  });

  // POST /features/:feId/requirements — feature-first add (the feature is in
  // the path; a body `feature` field is rejected, not silently honored).
  app.post('/api/projects/:id/features/:feId/requirements', async (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!FE_ID_RE.test(req.params.feId)) {
      res.status(400).json({ error: 'Invalid feature id' });
      return;
    }
    if (req.body?.feature !== undefined) {
      res.status(422).json({
        errors: { feature: 'Requirements attach to the feature in the URL path — feature-first, no picker' },
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
    const prdPath = prdFilePath(dir, 'prd.md');
    const featuresPath = prdFilePath(dir, 'features.md');
    if (value.type === 'BR') {
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
      // QA-10: per-feature BR allocation. A BR linked to FE-1 gets the next
      // free BR-NNN relative to that feature's existing linked BRs (so FE-1
      // and FE-2 can both have BR-001). Unassigned BRs keep their own shared
      // pool — they don't belong to any feature, so a global pool is the only
      // sensible allocator for them.
      const featuresForBrScope = fs.existsSync(featuresPath)
        ? readPrdFile(featuresPath).text
        : '';
      const parsedScope = parseRequirements(text, featuresForBrScope);
      const linkedIds =
        parsedScope.features
          .find((f) => f.feId === req.params.feId)
          ?.reqs.filter((r) => r.type === 'BR')
          .map((r) => r.id) ?? [];
      const id = nextFreeId(linkedIds, 'BR');
      // Always link a BR to its creating feature (requirements-redesign §4).
      // The link lives as `<!-- BR-NNN: feature=FE-NN, origin=manual -->`
      // directly after the row so the next parse reads it. origin=manual is
      // the BA's stamp today; the future BA auto-draft job will write
      // origin=generated (this commit only ships the marker plumbing).
      const row1 = renderReqRow(id, value.priority, value.status, value.owner, value.text);
      const meta = `<!-- ${id}: feature=${req.params.feId}, origin=manual -->`;
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
          featureId: req.params.feId,
          origin: 'manual',
        },
      });
      return;
    }
    // TR → the feature's block in features.md.
    if (!fs.existsSync(featuresPath)) {
      res.status(409).json({ error: 'features.md does not exist yet — it is created with the PRD scaffold' });
      return;
    }
    const { text } = readPrdFile(featuresPath);
    const prdForParse = fs.existsSync(prdPath) ? readPrdFile(prdPath).text : '';
    const feature = parseRequirements(prdForParse, text).features.find((f) => f.feId === req.params.feId);
    if (!feature) {
      res.status(404).json({ error: `Unknown feature ${req.params.feId}` });
      return;
    }
    // QA-10: per-feature TR allocation. Allocate from THIS feature's existing
    // TR ids only — so FE-1 and FE-2 can both have TR-001. Storage is already
    // per-feature (TR rows live inside their block on disk); the change is
    // allocation, not storage.
    const featureTrIds = feature.reqs.filter((r) => r.type === 'TR').map((r) => r.id);
    const id = nextFreeId(featureTrIds, 'TR');
    // QA-2: TRs stamp origin=manual on POST — pairs with the BR origin
    // marker, parser reads it via TR_META_RE one line look-ahead.
    const newRow = renderReqRow(id, value.priority, value.status, value.owner, value.text);
    const trMeta = `<!-- ${id}: origin=manual -->`;
    const lines = text.split('\n');
    // QA-5: pass the raw lines so the helper can skip past the previous
    // row's trailing meta comment (otherwise a second POST inserts the new
    // [row, marker] pair between the previous TR and its marker, detaching
    // the previous TR's origin marker on re-parse).
    const out = insertAfter(lines, featureReqInsertIndex(feature, lines), [newRow, trMeta]);
    try {
      await atomicWritePrd(featuresPath, out.join('\n'));
    } catch {
      res.status(500).json({ error: 'Could not write PRD file' });
      return;
    }
    res.status(201).json({
      ok: true,
      requirement: {
        id,
        type: 'TR',
        priority: value.priority,
        status: value.status,
        owner: value.owner,
        text: value.text,
        featureId: req.params.feId,
        origin: 'manual' as const,
      },
    });
  });

  // POST /features/:feId/acceptance-criteria — add an AC row to the feature's
  // `## Acceptance Criteria` section (decision 6). When the block has no AC
  // section yet, the heading and the first AC row are created together.
  app.post('/api/projects/:id/features/:feId/acceptance-criteria', async (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!FE_ID_RE.test(req.params.feId)) {
      res.status(400).json({ error: 'Invalid feature id' });
      return;
    }
    const validation = validateAcInput(req.body);
    if (!validation.ok) {
      res.status(422).json({ errors: validation.errors });
      return;
    }
    const value = validation.value;
    const dir = prdDir(row);
    const prdPath = prdFilePath(dir, 'prd.md');
    const featuresPath = prdFilePath(dir, 'features.md');
    if (!fs.existsSync(featuresPath)) {
      res.status(409).json({ error: 'features.md does not exist yet — it is created with the PRD scaffold' });
      return;
    }
    const { text } = readPrdFile(featuresPath);
    const prdForParse = fs.existsSync(prdPath) ? readPrdFile(prdPath).text : '';
    const feature = parseRequirements(prdForParse, text).features.find((f) => f.feId === req.params.feId);
    if (!feature) {
      res.status(404).json({ error: `Unknown feature ${req.params.feId}` });
      return;
    }
    // AC ids allocate globally across the file (every block's AC- rows).
    const id = nextFreeId(collectExistingIds('', '', text).ac, 'AC');
    const newRow = renderAcRow(id, value.status, value.text);
    const acMeta = `<!-- ${id}: origin=manual -->`;
    const lines = text.split('\n');
    const idx = featureAcInsertIndex(feature, lines);
    // If the block never got an AC heading, create the section + first row
    // together (insertAfter supplies the blank separator under the body).
    const fresh = feature.acHeadingLine === null ? ['## Acceptance Criteria', newRow, acMeta] : [newRow, acMeta];
    const out = insertAfter(lines, idx, fresh);
    try {
      await atomicWritePrd(featuresPath, out.join('\n'));
    } catch {
      res.status(500).json({ error: 'Could not write PRD file' });
      return;
    }
    res.status(201).json({
      ok: true,
      ac: { id, status: value.status, text: value.text, origin: 'manual' },
    });
  });

  // PATCH /acceptance-criteria/:acId — text / met-unmet status.
  app.patch('/api/projects/:id/acceptance-criteria/:acId', async (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!AC_ID_RE.test(req.params.acId)) {
      res.status(400).json({ error: 'Invalid acceptance-criteria id' });
      return;
    }
    const validation = validateAcPatch(req.body);
    if (!validation.ok) {
      res.status(422).json({ errors: validation.errors });
      return;
    }
    const dir = prdDir(row);
    const prdPath = prdFilePath(dir, 'prd.md');
    const featuresPath = prdFilePath(dir, 'features.md');
    if (!fs.existsSync(featuresPath)) {
      res.status(404).json({ error: 'features.md does not exist' });
      return;
    }
    const { text } = readPrdFile(featuresPath);
    const prdForParse = fs.existsSync(prdPath) ? readPrdFile(prdPath).text : '';
    const parsed = parseRequirements(prdForParse, text);
    let ac: AcRow | null = null;
    for (const f of parsed.features) {
      const found = f.acs.find((a) => a.id === req.params.acId);
      if (found) {
        ac = found;
        break;
      }
    }
    if (!ac) {
      res.status(404).json({ error: `Unknown acceptance criterion ${req.params.acId}` });
      return;
    }
    const value = validation.value;
    const status = value.status ?? ac.status;
    if (!status) {
      res.status(422).json({
        errors: { status: 'Required — this legacy row has no status; set one to convert it' },
      });
      return;
    }
    const updatedText = value.text ?? ac.text;
    const updated = renderAcRow(ac.id, status, updatedText);
    let lines = spliceLine(text.split('\n'), ac.lineIndex, updated);
    // QA-2: editing a legacy row (origin=null) stamps origin=manual so the
    // dot starts rendering. The marker is glued to the row.
    if (ac.origin === null) {
      const meta = `<!-- ${ac.id}: origin=manual -->`;
      const insertAt = ac.lineIndex + 1;
      const next = lines[insertAt];
      if (next === '' || next === undefined) {
        lines = spliceLine(lines, insertAt, meta);
      } else {
        lines.splice(insertAt, 0, meta);
      }
    }
    try {
      await atomicWritePrd(featuresPath, lines.join('\n'));
    } catch {
      res.status(500).json({ error: 'Could not write PRD file' });
      return;
    }
    res.json({
      ok: true,
      ac: { id: ac.id, status, text: updatedText, origin: ac.origin ?? 'manual' },
    });
  });

  // DELETE /acceptance-criteria/:acId — soft-delete: strike the row + marker.
  app.delete('/api/projects/:id/acceptance-criteria/:acId', async (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!AC_ID_RE.test(req.params.acId)) {
      res.status(400).json({ error: 'Invalid acceptance-criteria id' });
      return;
    }
    const dir = prdDir(row);
    const prdPath = prdFilePath(dir, 'prd.md');
    const featuresPath = prdFilePath(dir, 'features.md');
    if (!fs.existsSync(featuresPath)) {
      res.status(404).json({ error: 'features.md does not exist' });
      return;
    }
    const { text } = readPrdFile(featuresPath);
    const prdForParse = fs.existsSync(prdPath) ? readPrdFile(prdPath).text : '';
    const parsed = parseRequirements(prdForParse, text);
    let ac: AcRow | null = null;
    for (const f of parsed.features) {
      const found = f.acs.find((a) => a.id === req.params.acId);
      if (found) {
        ac = found;
        break;
      }
    }
    if (!ac) {
      res.status(404).json({ error: `Unknown acceptance criterion ${req.params.acId}` });
      return;
    }
    const struck = strikeRow(text.split('\n'), ac);
    const out = insertAfter(struck.lines, struck.markerAfter, [deleteMarker()]);
    try {
      await atomicWritePrd(featuresPath, out.join('\n'));
    } catch {
      res.status(500).json({ error: 'Could not write PRD file' });
      return;
    }
    res.json({ ok: true, id: ac.id });
  });

  // PATCH /requirements/:reqId — text / priority / owner / status (+ type as
  // a move: BR lives in prd.md §8, TR lives in the feature block, so a type
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
    const featuresPath = prdFilePath(dir, 'features.md');
    const prd = readPrdFile(prdPath);
    const features = readPrdFile(featuresPath);
    const parsed = parseRequirements(prd.text, features.text);
    // QA-10: the UI always sends `feId` on PATCH/DELETE so duplicate ids
    // across features resolve to the right row. The query param is optional —
    // legacy callers and the verify suite still work without it.
    const scopeFeId = typeof req.query.feId === 'string' ? req.query.feId : undefined;
    const located = locateReq(parsed, req.params.reqId, scopeFeId);
    if (!located) {
      res.status(404).json({ error: `Unknown requirement ${req.params.reqId}` });
      return;
    }
    const { row: reqRow, ownerFeature } = located;
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
    const featureLines = features.text.split('\n');
    // `changed` is set explicitly at every mutation site — never inferred from
    // reference identity. The legacy-origin stamp below uses an in-place
    // `lines.splice`, which keeps the same array reference as the split above
    // while still mutating it, so a reference-identity skip would drop a real
    // write (Review B2).
    const files: Record<'prd.md' | 'features.md', { path: string; lines: string[]; ops: Op[]; changed: boolean }> = {
      'prd.md': { path: prdPath, lines: prdLines, ops: [], changed: false },
      'features.md': { path: featuresPath, lines: featureLines, ops: [], changed: false },
    };

    if (targetType) {
      // Strike the old row (soft-delete marker notes the move), allocate the
      // new ID from the live rows of the target prefix, land the new row in
      // its home file.
      const home = reqRow.type === 'BR' ? 'prd.md' : 'features.md';
      const struck = strikeRow(files[home].lines, reqRow);
      files[home].lines = struck.lines;
      files[home].changed = true;
      files[home].ops.push({
        after: struck.markerAfter,
        lines: [deleteMarker(`moved to ${targetType === 'BR' ? 'prd.md §8' : 'the feature block'}`)],
      });
      // QA-10: scope the new id to the row's owning feature (TR) or its
      // linked-feature pool (BR) — duplicate-safe across features. BR rows
      // live in parsedScope.features[*].reqs after parseRequirements
      // distributes them, so filter there for the BR branch.
      const reparse = parseRequirements(files['prd.md'].lines.join('\n'), files['features.md'].lines.join('\n'));
      const scopeIds =
        targetType === 'TR'
          ? reparse.features
              .find((f) => f.feId === (ownerFeature?.feId ?? null))
              ?.reqs.filter((r) => r.type === 'TR')
              .map((r) => r.id) ?? []
          : reparse.features
              .flatMap((f) => f.reqs)
              .filter((r) => r.type === 'BR' && r.featureId === ownerFeature?.feId)
              .map((r) => r.id);
      const newId = nextFreeId(scopeIds, targetType as 'BR' | 'TR');
      const newRow = renderReqRow(newId, merged.priority, merged.status, merged.owner, merged.text);
      // QA-10: a type move that lands a BR inside a feature's pool must
      // carry the feature link in its meta comment, just like POST does
      // — otherwise the new BR becomes an unassigned row.
      const newMeta =
        targetType === 'BR' && ownerFeature
          ? `<!-- ${newId}: feature=${ownerFeature.feId}, origin=manual -->`
          : `<!-- ${newId}: origin=manual -->`;
      if (targetType === 'BR') {
        const idx = businessReqInsertIndex(files['prd.md'].lines);
        if (idx === null) {
          res.status(409).json({ error: 'prd.md has no §8 section to write business requirements into' });
          return;
        }
        files['prd.md'].ops.push({ after: idx, lines: [newRow, newMeta] });
        files['prd.md'].changed = true;
      } else if (ownerFeature) {
        // QA-5: pass the in-flight lines so the helper skips past the
        // previous row's trailing meta comment when inserting the new pair.
        files['features.md'].ops.push({
          after: featureReqInsertIndex(ownerFeature, files['features.md'].lines),
          lines: [newRow, newMeta],
        });
        files['features.md'].changed = true;
      } else {
        // No owning feature: either an unassigned BR being re-typed to TR, or
        // a TR whose feature was soft-deleted mid-flight. Both refuse rather
        // than land a TR outside a feature block.
        res.status(404).json({
          error: `Cannot move ${reqRow.id} to a technical requirement — TR rows must live inside a feature block and no owning feature is resolvable`,
        });
        return;
      }
    } else {
      const updated = renderReqRow(reqRow.id, merged.priority, merged.status, merged.owner, merged.text);
      const home = reqRow.type === 'BR' ? 'prd.md' : 'features.md';
      files[home].lines = spliceLine(files[home].lines, reqRow.lineIndex, updated);
      files[home].changed = true;
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
      if (!f.changed) continue;
      try {
        await atomicWritePrd(f.path, applyInsertions(f.lines, f.ops).join('\n'));
      } catch {
        res.status(500).json({ error: 'Could not write PRD file' });
        return;
      }
    }
    // Serialize through the same shape the GET uses — a type move re-homes
    // the row under the owning feature (TR) or keeps the BR link (BR), and a
    // legacy-row edit's origin stamp is reflected (see the meta insert above).
    res.json({
      ok: true,
      requirement: serializeReq({
        ...reqRow,
        type: targetType ?? reqRow.type,
        priority: merged.priority,
        status: merged.status,
        owner: merged.owner,
        text: merged.text,
        featureId: targetType === 'TR' ? (ownerFeature?.feId ?? null) : reqRow.featureId,
        origin: reqRow.origin ?? 'manual',
      }),
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
    const featuresPath = prdFilePath(dir, 'features.md');
    const prd = readPrdFile(prdPath);
    const features = readPrdFile(featuresPath);
    const parsed = parseRequirements(prd.text, features.text);
    // QA-10: feId query param disambiguates duplicate ids across features.
    const scopeFeId = typeof req.query.feId === 'string' ? req.query.feId : undefined;
    const located = locateReq(parsed, req.params.reqId, scopeFeId);
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
    const file = reqRow.type === 'BR' ? 'prd.md' : 'features.md';
    const path = file === 'prd.md' ? prdPath : featuresPath;
    const src = file === 'prd.md' ? prd : features;
    try {
      await atomicWritePrd(path, spliceLine(src.text.split('\n'), reqRow.lineIndex, updated).join('\n'));
    } catch {
      res.status(500).json({ error: 'Could not write PRD file' });
      return;
    }
    res.json({
      ok: true,
      requirement: serializeReq({ ...reqRow, status: next }),
    });
  });

  // DELETE /requirements/:reqId — soft-delete with the spec's guard: an
  // approved/done requirement that another feature references is kept with a
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
    const featuresPath = prdFilePath(dir, 'features.md');
    const prd = readPrdFile(prdPath);
    const features = readPrdFile(featuresPath);
    const parsed = parseRequirements(prd.text, features.text);
    // QA-10: feId query param disambiguates duplicate ids across features.
    const scopeFeId = typeof req.query.feId === 'string' ? req.query.feId : undefined;
    const located = locateReq(parsed, req.params.reqId, scopeFeId);
    if (!located) {
      res.status(404).json({ error: `Unknown requirement ${req.params.reqId}` });
      return;
    }
    const { row: reqRow, ownerFeature, file } = located;
    if (reqRow.status === 'approved' || reqRow.status === 'done') {
      const referencedBy = referencingFeatures(parsed, reqRow.id, ownerFeature?.feId ?? null);
      if (referencedBy.length > 0) {
        res.status(409).json({
          error: `Cannot delete ${reqRow.id} — it is ${reqRow.status} and referenced by ${referencedBy.join(', ')}`,
          referencedBy,
        });
        return;
      }
    }
    const filePath = file === 'prd.md' ? prdPath : featuresPath;
    const lines = (file === 'prd.md' ? prd : features).text.split('\n');
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

  // POST /requirements/migrate — one-shot story→feature migration (decision 3):
  // every live US-NN block in user-journeys.md becomes an FE-NN block in
  // features.md, BR links re-point `story=` → `feature=`, and the story blocks
  // are soft-deleted. Idempotent — re-running self-heals; a no-op returns
  // `migrated: 0` when no live stories remain.
  app.post('/api/projects/:id/requirements/migrate', async (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const dir = prdDir(row);
    const prdPath = prdFilePath(dir, 'prd.md');
    const journeysPath = prdFilePath(dir, 'user-journeys.md');
    const featuresPath = prdFilePath(dir, 'features.md');
    const prd = fs.existsSync(prdPath) ? readPrdFile(prdPath).text : '';
    const journeys = fs.existsSync(journeysPath) ? readPrdFile(journeysPath).text : '';
    const features = fs.existsSync(featuresPath) ? readPrdFile(featuresPath).text : '';
    const result = migrateStoriesToFeatures(prd, journeys, features);
    if (!result) {
      res.json({ ok: true, migrated: 0 });
      return;
    }
    try {
      // Write order features.md → prd.md → journeys.md; a crash between the
      // writes self-heals on the next run (the US→FE map is derived from
      // already-migrated features' `<!-- source: migrated from US-NN -->`).
      // prd.md is only re-written when it exists and its re-links changed.
      await atomicWritePrd(featuresPath, result.featuresText);
      if (fs.existsSync(prdPath) && result.prdText !== prd) {
        await atomicWritePrd(prdPath, result.prdText);
      }
      await atomicWritePrd(journeysPath, result.journeysText);
    } catch {
      res.status(500).json({ error: 'Could not write PRD file' });
      return;
    }
    res.json({ ok: true, migrated: result.migrated });
  });
}
