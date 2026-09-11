// Pure splice logic for BA auto-generated rows — no fs, no Ollama, no db.
//
// The generation job (agent-invoker.ts) parses model output into the row
// inputs below, then this module inserts them into the canonical surfaces —
// feature blocks (with their TR rows inside the block) appended to
// features.md, BR rows inserted into prd.md §8 — using the exact renderers
// and insert-index helpers the manual CRUD routes use (requirements-model.ts).
// Content outside the inserted scopes is byte-identical to the input: that is
// the AC-9 bar, and scripts/verify-requirements.ts exercises this module
// directly to prove it.
//
// Generated rows are traceable and mechanically cleanable via the existing
// origin vocabulary: every generated block/row stamps `origin=generated` in
// its meta comment — the same marker the UI already renders as the
// "generated" origin tag. No new marker format is introduced.
//
// File-of-record (QA-14): BRs ALWAYS land in prd.md §8, linked to their
// feature by `<!-- BR-NNN: feature=FE-NN, origin=generated -->`; TRs always
// land inside their feature block in features.md. The file a row splices
// into is chosen by row type, never by which find() matched.
//
// IDs are allocated HERE, never by the model — nextFreeId continues the
// on-disk sequence, so the model's text can never collide with an existing
// FE/BR/TR id.

import {
  businessReqInsertIndex,
  collectExistingIds,
  insertAfter,
  isReqPriority,
  nextFreeId,
  parseBusinessReqs,
  parseFeatures,
  renderFeatureBlock,
  renderReqRow,
} from './requirements-model.js';
import type {
  FeatureRow,
  ReqOwner,
  ReqPriority,
  ReqRow,
  ReqStatus,
} from './requirements-model.js';

// ── The generation sections (the job's progress units) ─────────────────────
// One Ollama call per section, run in order. Single source of truth for the
// progress total — the status route and the job both read this length.
// (Lives here, in the pure module, so reconcileSectionsDone can name the
// sections without a circular import back into agent-invoker.ts.)

export const REQ_GEN_SECTIONS = ['features', 'business requirements'] as const;

export type ReqGenSection = (typeof REQ_GEN_SECTIONS)[number];

export const FEATURES_SECTION: ReqGenSection = 'features';
export const BUSINESS_SECTION: ReqGenSection = 'business requirements';

// Pure marker check — the fs-reading wrappers live in agent-invoker.ts
// (hasGeneratedRows) and ba-workspace.ts so this module stays fs-free while
// all three consumers share one marker vocabulary.
export function fileHasGeneratedRows(text: string): boolean {
  return /origin=generated/.test(text);
}

/**
 * Bidirectional resume reconcile (runs before the job's section loop):
 *
 * - A section whose `origin=generated` rows are already on disk counts as
 *   done EVEN IF unmarked — a crash between a section's splice write and the
 *   next persisted state write would otherwise re-run it on retry, and
 *   nextFreeId would duplicate the rows (the done-guard only reads the state
 *   file, which says 'failed' after restart).
 * - A marked section whose rows the user deleted regenerates.
 *
 * The same read rehydrates the generated feature ids (in generation order) so
 * a BR-only retry can still link its BRs to the features a previous run
 * inserted.
 */
export function reconcileSectionsDone(
  features: string,
  prd: string,
  marked: string[],
): { sectionsDone: string[]; featureIds: string[] } {
  const sectionsDone = new Set<string>(marked);
  let featureIds: string[] = [];
  const HAS_MARK = /origin=generated/;
  if (HAS_MARK.test(features)) {
    featureIds = parseFeatures(features)
      .features.filter((f) => f.origin === 'generated')
      .map((f) => f.feId);
    sectionsDone.add(FEATURES_SECTION);
  } else {
    sectionsDone.delete(FEATURES_SECTION);
  }
  if (HAS_MARK.test(prd)) {
    sectionsDone.add(BUSINESS_SECTION);
  } else {
    sectionsDone.delete(BUSINESS_SECTION);
  }
  return { sectionsDone: [...sectionsDone], featureIds };
}

export type GenFeature = {
  title: string;
  description: string;
  /** Background-doc source link recorded by the BA agent (design decision 7). */
  source: string | null;
  // Raw model output — cleaned via cleanPriority at render time.
  priority: unknown;
  trs: { text: string; priority: unknown }[];
};

export type GenBr = {
  text: string;
  priority: unknown;
  /** 0-based index into the features generated in the same run — BRs link to a feature via the BR meta comment. */
  featureIndex: number | null;
};

// Model output is untrusted text: single-line, pipe-free (pipes are the row
// grammar's field separator), hard-capped so one runaway row can't bloat the
// PRD files.
function cleanRowText(raw: string, max: number): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '/')
    .trim()
    .slice(0, max)
    .trim();
}

function cleanPriority(raw: unknown): ReqPriority {
  return typeof raw === 'string' && isReqPriority(raw) ? raw : 'should';
}

/**
 * Append generated feature blocks (each with its TR rows inside the block)
 * to features.md. Appending is the same write surface as POST /features —
 * existing blocks are untouched, byte for byte.
 *
 * Returns the spliced file text plus the allocated FE ids (in generation
 * order) and the TR row count, for the job's progress + result counts.
 * Features carry no ACs (decision 6r): those are authored on user stories at
 * story generation (Run 2).
 */
export function spliceFeatures(
  featuresText: string,
  features: GenFeature[],
): { text: string; feIds: string[]; trCount: number } {
  const lines = featuresText.split('\n');
  const feIds: string[] = [];
  let trCount = 0;

  // All ids for one block are pre-allocated before the block is emitted
  // (renderFeatureBlock needs them up-front), so per-block allocations must
  // also see the ids already allocated for THIS block — allocating against
  // only the on-disk snapshot would give two TRs in the same block the
  // same id. The snapshot re-scan already covers previous blocks (they were
  // appended to `lines`).
  const onDiskIds = () => collectExistingIds('', '', lines.join('\n'));

  for (const feature of features) {
    const title = cleanRowText(feature.title, 120);
    const description = cleanRowText(feature.description, 1000);
    // A feature needs a title + description to be a block; a garbled pair
    // must not land as a heading-only stub.
    if (!title || !description) continue;

    const feId = nextFreeId(onDiskIds().fe, 'FE');

    const trs: {
      id: string;
      priority: ReqPriority;
      status: ReqStatus;
      owner: ReqOwner;
      text: string;
      origin: 'generated';
    }[] = [];
    const allocatedTrs: string[] = [];
    for (const tr of feature.trs) {
      const text = cleanRowText(tr.text, 300);
      if (!text) continue;
      const id = nextFreeId([...onDiskIds().tr, ...allocatedTrs], 'TR');
      allocatedTrs.push(id);
      trs.push({
        id,
        priority: cleanPriority(tr.priority),
        status: 'draft',
        owner: 'BA',
        text,
        origin: 'generated',
      });
      trCount++;
    }

    const block: string[] = renderFeatureBlock({
      feId,
      title,
      description,
      source: feature.source ? cleanRowText(feature.source, 200) : null,
      priority: cleanPriority(feature.priority),
      status: 'draft',
      owner: 'BA',
      origin: 'generated',
      trs,
    }).split('\n');

    // Same trailing-blank padding as POST /features, then the block.
    if (lines.length === 0 || lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(...block);
    feIds.push(feId);
  }

  return { text: lines.join('\n'), feIds, trCount };
}

/**
 * Insert generated BR rows (each followed by its meta comment) into prd.md
 * §8 at businessReqInsertIndex — after the last existing row's trailing
 * meta, per QA-5. The index is recomputed per insert because each row pair
 * shifts the lines below it.
 *
 * Returns the spliced file text plus the allocated BR ids (in generation
 * order). Requires featureIds from the same run's spliceFeatures for
 * `<!-- BR-NNN: feature=FE-NN, origin=generated -->` links.
 */
export function spliceBusinessReqs(
  prd: string,
  brs: GenBr[],
  featureIds: string[],
): { text: string; brIds: string[] } {
  let lines = prd.split('\n');
  const brIds: string[] = [];

  for (const br of brs) {
    const text = cleanRowText(br.text, 300);
    if (!text) continue;
    const index = businessReqInsertIndex(lines);
    if (index === null) break; // no §8 section to write into — caller reports the failure

    const brId = nextFreeId(collectExistingIds(lines.join('\n'), '', '').br, 'BR');
    const featureId =
      br.featureIndex !== null && br.featureIndex >= 0 && br.featureIndex < featureIds.length
        ? featureIds[br.featureIndex]
        : null;
    const meta = featureId
      ? `<!-- ${brId}: feature=${featureId}, origin=generated -->`
      : `<!-- ${brId}: origin=generated -->`;
    lines = insertAfter(lines, index, [renderReqRow(brId, cleanPriority(br.priority), 'draft', 'BA', text), meta]);
    brIds.push(brId);
  }

  return { text: lines.join('\n'), brIds };
}

// A section whose model call yields zero parseable rows must FAIL the section,
// not advance silently (PR #26 round 4: a silent zero-row 'done' corrupts
// resume — retry skips the section as already done and nothing lands). The job
// wraps both callModelFeatures and callModelBusinessReqs with this; the thrown
// error lands in the section's catch, which persists the failed state and
// lets Retry regenerate only this section.
export function requireRows<T>(rows: T[], section: string): T[] {
  if (rows.length === 0) {
    throw new Error(`Model returned no ${section} rows — the section failed; retry will generate only this section.`);
  }
  return rows;
}

// ── Reconcile mode (the regenerate path after an approved artifact reverts) ─
//
// The model returns the FULL desired set — echoing the existing id of every
// generated row it wants to keep or update; a row it omits is removed; a row
// without an id (or whose id belongs to a manual/unknown row) is new. This
// module diffs the desired set against the `origin=generated` rows already on
// disk and splices the delta: updates rewrite a block/row in place, removals
// delete the block/row plus its meta comment, additions append splice-style.
// Zero desired rows is legal — "remove everything" — unlike generate mode,
// which requires rows (requireRows).
//
// Manual content is never touched: manual/legacy features and rows are not
// update or removal candidates, and manual TR rows living inside an UPDATED
// generated block (plus that block's soft-deleted rows — the 30-day recovery
// seam, and the delete-marker comments that pair with them) re-render after
// the desired TR rows instead of being clobbered. Known limitation: a
// REMOVED generated block still takes its manual rows with it — the block is
// the unit. A regenerated (rewritten) block also clobbers BA text edits to
// its generated rows: there is no edit baseline to merge against.

export type DesiredTr = {
  /** Echoed TR- id to reuse (must belong to the same generated feature); null or unknown = new row. */
  trId: string | null;
  text: string;
  // Raw model output — cleaned via cleanRowText/cleanPriority at render time.
  priority: unknown;
};

export type DesiredFeature = {
  /** Echoed FE- id to reuse (generated features only); null or unknown = new feature. */
  feId: string | null;
  title: string;
  description: string;
  /** Background-doc source link recorded by the BA agent (design decision 7); null = no source meta. */
  source: string | null;
  // Raw model output — cleaned via cleanRowText/cleanPriority at render time.
  priority: unknown;
  trs: DesiredTr[];
};

export type DesiredBr = {
  /** Echoed BR- id to reuse (generated rows only); null or unknown = new row. */
  brId: string | null;
  text: string;
  // Raw model output — cleaned via cleanPriority at render time.
  priority: unknown;
  /** Resolved by the caller against the post-reconcile feature ids; null = unlinked. */
  featureId: string | null;
};

export type ReconcileOps = { added: number; updated: number; removed: number };

// Grammar regexes mirrored from requirements-model.ts (kept private there):
// struck rows carry the 30-day recovery seam; BR meta comments pair rows to
// features; AC/TR/BR meta comments carry the origin stamp.
const STRUCK_ROW_RE = /^[-*+]\s*~~\s*((?:BR|TR|AC)-\d{3})[\s\S]*~~\s*$/;
const ROW_META_LINE_RE = /^<!--\s*((?:BR|TR|AC)-\d{3}):\s*(.*?)\s*-->$/;
const DELETED_LINE_RE = /^<!--\s*deleted\s+/i;
const FE_ID_RE = /^FE-\d{2,}$/;
const TR_ID_RE = /^TR-\d{3}$/;
const BR_ID_RE = /^BR-\d{3}$/;

// Last non-blank line + 1 within [start, end) — keeps the blank separators
// between a block and the next heading/EOF out of the rewrite/delete ranges.
function contentEnd(lines: string[], start: number, end: number): number {
  for (let i = end - 1; i > start; i--) {
    if (lines[i].trim() !== '') return i + 1;
  }
  return start + 1;
}

// The next non-blank line in [start, end), or null — the parser's
// blank-tolerant meta look-ahead, mirrored.
function nextNonBlank(
  lines: string[],
  start: number,
  end: number,
): { index: number; line: string } | null {
  for (let i = start; i < end; i++) {
    if (lines[i].trim() !== '') return { index: i, line: lines[i] };
  }
  return null;
}

// Compare renders ignoring blank lines and per-line trailing whitespace: an
// unchanged desired row re-renders byte-identical, and the normalized compare
// decides whether a rewrite (and its file write) happens at all.
function normalizedText(block: string[]): string {
  return block.map((l) => l.trim()).filter((l) => l !== '').join('\n');
}

// Manual rows + soft-deleted rows + their delete-marker comments inside one
// feature block, in file order — re-rendered after the desired TR rows on
// UPDATE so BA-owned content inside a generated block survives the rewrite.
// Struck rows are invisible to parseFeatures (recovery seam) and manual rows
// carry no origin stamp, so both are found by scanning the block's raw lines.
// Legacy AC rows (decision 6r: features no longer carry ACs) are handled by
// raw-line scan too — unstamped/manual rows are preserved as pass-through
// content, `origin=generated` rows drop with the rewrite.
const AC_ROW_LINE_RE = /^[-*+]\s+AC-\d{3}\s*(?:\|(.*))?$/;
const AC_SECTION_LINE_RE = /^##\s+Acceptance Criteria\s*$/i;
const GENERATED_META_RE = /^<!--\s*(?:BR|TR|AC)-\d{3}:\s*origin=generated\s*-->$/;

function preservedBlockLines(lines: string[], feature: FeatureRow): string[] {
  const manualReqIds = new Set(
    feature.reqs.filter((r) => r.origin !== 'generated').map((r) => r.id),
  );
  const out: string[] = [];
  for (let i = feature.headingLine; i < feature.blockEnd && i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (STRUCK_ROW_RE.test(trimmed)) {
      out.push(lines[i]);
      const meta = nextNonBlank(lines, i + 1, feature.blockEnd);
      if (meta && ROW_META_LINE_RE.test(meta.line.trim())) {
        out.push(lines[meta.index]);
        i = meta.index;
      }
      continue;
    }
    if (AC_SECTION_LINE_RE.test(trimmed)) continue; // the legacy heading drops with the rewrite
    if (AC_ROW_LINE_RE.test(trimmed)) {
      const meta = nextNonBlank(lines, i + 1, feature.blockEnd);
      if (meta && ROW_META_LINE_RE.test(meta.line.trim())) {
        // A stamped row survives only when it isn't generated-owned; the
        // meta travels with it so the pass-through stays byte-stable.
        if (!GENERATED_META_RE.test(meta.line.trim())) {
          out.push(lines[i], lines[meta.index]);
          i = meta.index;
        } else {
          i = meta.index; // generated row + its meta both drop
        }
        continue;
      }
      out.push(lines[i]); // unstamped row — preserved, no meta to carry
      continue;
    }
    const row = feature.reqs.find((r) => manualReqIds.has(r.id) && r.lineIndex === i);
    if (row) {
      out.push(lines[i]);
      const meta = nextNonBlank(lines, i + 1, feature.blockEnd);
      if (meta && ROW_META_LINE_RE.test(meta.line.trim()) && meta.line.includes(row.id)) {
        out.push(lines[meta.index]);
        i = meta.index;
      }
      continue;
    }
    if (DELETED_LINE_RE.test(trimmed)) out.push(lines[i]);
  }
  return out;
}

function renderDesiredFeatureBlock(
  feId: string,
  d: DesiredFeature,
  existing: FeatureRow | null,
  trOwner: Map<
    string,
    { feId: string; generated: boolean; raw: string; status: ReqStatus | null; owner: ReqOwner | null }
  >,
  preserved: string[],
  allocTr: () => string,
): { block: string[]; trsChanged: number } {
  // Desired TRs — renderFeatureBlock emits them inside the block and stamps
  // each row's origin meta itself. Features carry no ACs (decision 6r); any
  // legacy AC rows worth keeping ride along via `preserved`.
  const trs: {
    id: string;
    priority: ReqPriority;
    status: ReqStatus;
    owner: ReqOwner;
    text: string;
    origin: 'generated';
  }[] = [];
  let trsChanged = 0;
  for (const tr of d.trs) {
    const text = cleanRowText(tr.text, 300);
    if (!text) continue; // a bare ID with no text isn't a row (parser skips it)
    const echo = tr.trId && TR_ID_RE.test(tr.trId) ? trOwner.get(tr.trId) : undefined;
    let trId: string;
    let status: ReqStatus = 'draft';
    let owner: ReqOwner = 'BA';
    let raw: string | null = null;
    if (echo && echo.feId === feId && echo.generated) {
      trId = tr.trId as string;
      status = echo.status ?? 'draft';
      owner = echo.owner ?? 'BA';
      raw = echo.raw;
    } else {
      trId = allocTr();
      trsChanged++; // a non-echoed row inside an updated block is a new row
    }
    const row = renderReqRow(trId, cleanPriority(tr.priority), status, owner, text);
    if (raw !== null && row.trim() !== raw.trim()) trsChanged++;
    trs.push({
      id: trId,
      priority: cleanPriority(tr.priority),
      status,
      owner,
      text,
      origin: 'generated',
    });
  }

  const block: string[] = renderFeatureBlock({
    feId,
    title: cleanRowText(d.title, 120),
    description: cleanRowText(d.description, 1000),
    source: d.source ? cleanRowText(d.source, 200) : null,
    priority: cleanPriority(d.priority),
    // Reused ids keep the BA's status/owner progress — an approved feature
    // must not silently fall back to draft. New ids start draft/BA.
    status: existing?.status ?? 'draft',
    owner: existing?.owner ?? 'BA',
    origin: 'generated',
    trs,
  }).split('\n');
  block.push(...preserved);
  return { block, trsChanged };
}

/**
 * Diff the desired feature set against the generated feature blocks already
 * on disk in features.md, and splice the delta. Echoed generated FE ids are
 * updated in place (status/owner preserved, manual TR rows and struck rows
 * re-rendered); generated features the model omits are removed; everything
 * else appends via spliceFeatures. Manual/legacy blocks are never candidates.
 *
 * Returns the reconciled text (the input unchanged when nothing differs —
 * the caller skips the write), the ops counts, the post-reconcile generated
 * feature ids in DESIRED order (reused first, appended after), and the TR
 * count (changed + appended rows) for the job's result counts.
 */
export function reconcileFeatures(
  featuresText: string,
  desired: DesiredFeature[],
  keepFeIds: string[] = [],
): {
  text: string;
  ops: ReconcileOps;
  featureIds: string[];
  trCount: number;
} {
  const lines = featuresText.split('\n');
  const parsed = parseFeatures(featuresText);
  const byFeId = new Map(parsed.features.map((f) => [f.feId, f]));
  // Block-wide TR ownership — an echoed id may only be reused inside its
  // own generated feature block; every other echo is a new row.
  const trOwner = new Map<
    string,
    { feId: string; generated: boolean; raw: string; status: ReqStatus | null; owner: ReqOwner | null }
  >();
  for (const feature of parsed.features) {
    for (const row of feature.reqs) {
      if (row.type === 'TR') {
        trOwner.set(row.id, {
          feId: feature.feId,
          generated: row.origin === 'generated',
          raw: row.raw,
          status: row.status,
          owner: row.owner,
        });
      }
    }
  }

  const plan: { start: number; end: number; block: string[] | null }[] = [];
  const ops: ReconcileOps = { added: 0, updated: 0, removed: 0 };
  const reusedFeatureIds: string[] = [];
  const desiredFeIds = new Set<string>();
  const allocatedTrs: string[] = [];
  let trCount = 0;
  const adds: GenFeature[] = [];

  // Ids for newly added rows accumulate in allocated* so two echoes inside
  // the same planning pass never collide (the on-disk snapshot can't see
  // them — nothing has been spliced yet).
  const allocTr = (): string => {
    const id = nextFreeId([...collectExistingIds('', '', lines.join('\n')).tr, ...allocatedTrs], 'TR');
    allocatedTrs.push(id);
    return id;
  };

  // Keep-listing lives above the desired loop so a garbled echo can protect
  // its named block from the omission sweep below.
  const keepSet = new Set(keepFeIds);
  for (const d of desired) {
    const title = cleanRowText(d.title, 120);
    const description = cleanRowText(d.description, 1000);
    // Incomplete rows are skipped by the caller's parse (same bar as generate
    // mode); belt-and-braces here — a garbled echo must not wipe a feature.
    const echoId = d.feId && FE_ID_RE.test(d.feId) ? d.feId : null;
    if (!title || !description) {
      // A garbled row that still names an existing generated block keeps that
      // block: the model clearly wants it, the retry pass can re-edit it.
      const garbledExisting = echoId ? byFeId.get(echoId) : undefined;
      if (echoId && garbledExisting?.origin === 'generated') keepSet.add(echoId);
      continue;
    }

    const existing = echoId ? byFeId.get(echoId) : undefined;
    if (echoId && existing && existing.origin === 'generated' && !desiredFeIds.has(echoId)) {
      desiredFeIds.add(echoId);
      reusedFeatureIds.push(echoId);
      const { block, trsChanged } = renderDesiredFeatureBlock(
        echoId,
        d,
        existing,
        trOwner,
        preservedBlockLines(lines, existing),
        allocTr,
      );
      const start = existing.headingLine;
      const end = contentEnd(lines, start, existing.blockEnd);
      if (normalizedText(block) !== normalizedText(lines.slice(start, end))) {
        plan.push({ start, end, block });
        ops.updated++;
        trCount += trsChanged;
      }
      continue;
    }
    // Unknown id, manual-owned id, duplicate echo, or no id → a new feature.
    adds.push({
      title,
      description,
      source: d.source,
      priority: d.priority,
      trs: d.trs,
    });
  }

  // Omitted generated features are removed — the model's desired set is the
  // full replacement. Manual/legacy blocks and keep-listed ids stay untouched.
  for (const feature of parsed.features) {
    if (feature.origin !== 'generated') continue;
    if (desiredFeIds.has(feature.feId) || keepSet.has(feature.feId)) continue;
    plan.push({
      start: feature.headingLine,
      end: contentEnd(lines, feature.headingLine, feature.blockEnd),
      block: null,
    });
    ops.removed++;
  }

  if (plan.length === 0 && adds.length === 0) {
    return { text: featuresText, ops, featureIds: reusedFeatureIds, trCount: 0 };
  }

  // Apply plan ranges in DESCENDING order — every range indexes the ORIGINAL
  // parse; applying bottom-up keeps the earlier indices valid.
  plan.sort((a, b) => b.start - a.start);
  for (const entry of plan) {
    if (entry.block) lines.splice(entry.start, entry.end - entry.start, ...entry.block);
    else lines.splice(entry.start, entry.end - entry.start);
  }

  // Appends reuse the generate-mode splice verbatim — ids are allocated
  // against the already-mutated lines, so pre-allocated TR ids can't
  // collide. spliceFeatures returns no ops object (generate mode counts
  // differently), so the reconcile ops must count the appends themselves.
  const appended = spliceFeatures(lines.join('\n'), adds);
  ops.added += appended.feIds.length;
  return {
    text: appended.text,
    ops,
    featureIds: [...reusedFeatureIds, ...appended.feIds],
    trCount: trCount + appended.trCount,
  };
}

/**
 * Diff the desired BR set against the generated BR rows already on disk in
 * prd.md §8, and splice the delta. Echoed generated BR ids are updated in
 * place (status/owner + feature link re-rendered); generated BRs the model
 * omits are removed; everything else appends via the generate-mode insert
 * path with a freshly allocated id per row.
 *
 * Returns the reconciled text (the input unchanged when nothing differs —
 * the caller skips the write) plus the ops counts.
 */
export function reconcileBusinessReqs(
  prd: string,
  desired: DesiredBr[],
  keepBrIds: string[] = [],
): { text: string; ops: ReconcileOps } {
  let lines = prd.split('\n');
  const parsed = parseBusinessReqs(prd);
  const byBrId = new Map(parsed.rows.map((r) => [r.id, r]));
  const ops: ReconcileOps = { added: 0, updated: 0, removed: 0 };
  const plan: { start: number; end: number; block: string[] | null }[] = [];
  const desiredBrIds = new Set<string>();
  const inserts: DesiredBr[] = [];

  // A BR row's trailing meta comment (blank-line tolerant, same look-ahead as
  // the parser) — its line index, or null when the row has no meta. Reads the
  // ORIGINAL lines: planning runs before any mutation.
  const metaIndexOf = (row: ReqRow): number | null => {
    for (let j = row.lineIndex + 1; j < lines.length; j++) {
      const trimmed = lines[j].trim();
      if (trimmed === '') continue;
      const m = trimmed.match(ROW_META_LINE_RE);
      return m && m[1] === row.id ? j : null;
    }
    return null;
  };

  for (const d of desired) {
    const text = cleanRowText(d.text, 300);
    if (!text) continue;
    const echoId = d.brId && BR_ID_RE.test(d.brId) ? d.brId : null;
    const existing = echoId ? byBrId.get(echoId) : undefined;
    if (echoId && existing && existing.origin === 'generated' && !desiredBrIds.has(echoId)) {
      desiredBrIds.add(echoId);
      const metaIndex = metaIndexOf(existing);
      const end = metaIndex !== null ? metaIndex + 1 : existing.lineIndex + 1;
      const meta = d.featureId
        ? `<!-- ${echoId}: feature=${d.featureId}, origin=generated -->`
        : `<!-- ${echoId}: origin=generated -->`;
      const block = [
        renderReqRow(
          echoId,
          cleanPriority(d.priority),
          existing.status ?? 'draft',
          existing.owner ?? 'BA',
          text,
        ),
        meta,
      ];
      if (normalizedText(block) !== normalizedText(lines.slice(existing.lineIndex, end))) {
        plan.push({ start: existing.lineIndex, end, block });
        ops.updated++;
      }
      continue;
    }
    // Unknown id, manual-owned id, duplicate echo, or no id → a new row.
    inserts.push(d);
  }

  const keepSet = new Set(keepBrIds);
  for (const row of parsed.rows) {
    if (row.origin !== 'generated') continue;
    if (desiredBrIds.has(row.id) || keepSet.has(row.id)) continue;
    const metaIndex = metaIndexOf(row);
    plan.push({
      start: row.lineIndex,
      end: metaIndex !== null ? metaIndex + 1 : row.lineIndex + 1,
      block: null,
    });
    ops.removed++;
  }

  if (plan.length === 0 && inserts.length === 0) {
    return { text: prd, ops };
  }

  plan.sort((a, b) => b.start - a.start);
  for (const entry of plan) {
    if (entry.block) lines.splice(entry.start, entry.end - entry.start, ...entry.block);
    else lines.splice(entry.start, entry.end - entry.start);
  }

  // Inserts recompute the insert index and the free id per row against the
  // already-mutated lines (same discipline as spliceBusinessReqs).
  for (const d of inserts) {
    const index = businessReqInsertIndex(lines);
    if (index === null) break; // no §8 section to write into — caller reports the failure
    const brId = nextFreeId(collectExistingIds(lines.join('\n'), '', '').br, 'BR');
    const meta = d.featureId
      ? `<!-- ${brId}: feature=${d.featureId}, origin=generated -->`
      : `<!-- ${brId}: origin=generated -->`;
    lines = insertAfter(lines, index, [
      renderReqRow(brId, cleanPriority(d.priority), 'draft', 'BA', cleanRowText(d.text, 300)),
      meta,
    ]);
    ops.added++;
  }

  return { text: lines.join('\n'), ops };
}
