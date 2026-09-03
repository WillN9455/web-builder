// Requirements tab — the data model behind `PRD/prd.md` §8 (business reqs)
// and the per-story blocks in `PRD/user-journeys.md` (technical reqs).
//
// This module is PURE: no fs, no db, no express. The grammar lives here so
// both the parser and the write-back splices share one implementation, and so
// scripts/verify-requirements.ts can exercise it without booting the API, and
// the client components import the same state machine so the status dropdown
// can never drift from the server's machine (one grammar, two consumers).
//
// Grammar (build plan PLANS/PROJECT_REQUIREMENTS_TAB.md §3.1, from
// launcher/design/requirements.html v5.3 — the `#spec` block is binding):
//
//   ### US-01 — List an item for lending
//   <!-- story: priority=must status=approved owner=BA -->
//   **As a** household owner, **I want to** list an item …, **so that** …
//   - TR-001 | should | draft | DEV | Persist listing with photo + condition
//
//   Requirement rows (prd.md §8 for BR-, story blocks for TR-):
//   - <ID> | <must|should|could|wont> | <status> | <BA|SA|DEV|QA> | <text>
//
// Parse rules:
// - Tolerant: anything unrecognized passes through untouched on write-back
//   (surgical line-splice — never re-serialize the whole file, mirroring the
//   contents-API reformat-churn lesson).
// - `### US-NN` headings open story scopes. `<!-- story: … -->` and
//   `<!-- deleted … -->` comments carry metadata. Struck-through (`~~…~~`)
//   rows with a delete comment parse as soft-deleted and are excluded from
//   the list (the row stays on disk for the 30-day recovery seam — no purge
//   job exists, plan §2).

// ── Canonical vocabularies (spec STATE / VALID sections — 8 statuses) ──────

export const REQ_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'done',
  'blocked',
  'returned',
  'on_hold',
  'cancelled',
] as const;
export type ReqStatus = (typeof REQ_STATUSES)[number];

export const REQ_PRIORITIES = ['must', 'should', 'could', 'wont'] as const;
export type ReqPriority = (typeof REQ_PRIORITIES)[number];

export const REQ_OWNERS = ['BA', 'SA', 'DEV', 'QA'] as const;
export type ReqOwner = (typeof REQ_OWNERS)[number];

export type ReqType = 'BR' | 'TR';

// ── State machine (spec STATE section, exactly as the plan locks it) ───────
//
//   draft ──▶ in_review ──▶ approved ──▶ done
//   in_review ──▶ returned ──▶ draft
//   in_review ──▶ blocked
//   approved ◀──▶ on_hold
//   draft ──▶ cancelled
//
// `done`, `blocked`, and `cancelled` have no outgoing edges. (The mockup's
// sample menus show a few out-of-machine options — sample-data drift; the
// spec's STATE section is the authority and the plan locks this machine.)

export const ALLOWED_TRANSITIONS: Readonly<Record<ReqStatus, readonly ReqStatus[]>> = {
  draft: ['in_review', 'cancelled'],
  in_review: ['approved', 'returned', 'blocked'],
  approved: ['done', 'on_hold'],
  on_hold: ['approved'],
  done: [],
  blocked: [],
  returned: ['draft'],
  cancelled: [],
};

export function allowedTransitions(status: ReqStatus): readonly ReqStatus[] {
  return ALLOWED_TRANSITIONS[status] ?? [];
}

export function isReqStatus(v: unknown): v is ReqStatus {
  return typeof v === 'string' && (REQ_STATUSES as readonly string[]).includes(v);
}

export function isReqPriority(v: unknown): v is ReqPriority {
  return typeof v === 'string' && (REQ_PRIORITIES as readonly string[]).includes(v);
}

export function isReqOwner(v: unknown): v is ReqOwner {
  return typeof v === 'string' && (REQ_OWNERS as readonly string[]).includes(v);
}

export function isReqType(v: unknown): v is ReqType {
  return v === 'BR' || v === 'TR';
}

// Status → display label + the .file-status dot class the mockups use.
// `blocked`/`returned` share the rose dot; `on_hold`/`cancelled` are neutral.
export function statusLabel(status: ReqStatus): string {
  switch (status) {
    case 'draft': return 'Draft';
    case 'in_review': return 'In review';
    case 'approved': return 'Approved';
    case 'done': return 'Done';
    case 'blocked': return 'Blocked';
    case 'returned': return 'Returned';
    case 'on_hold': return 'On hold';
    case 'cancelled': return 'Cancelled';
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

// One requirement row. `lineIndex` points at the row's raw line inside its
// source file (0-based) — the write-back splice target.
export type ReqRow = {
  id: string; // BR-001 / TR-001
  type: ReqType;
  priority: ReqPriority | null;
  status: ReqStatus | null;
  owner: ReqOwner | null;
  text: string;
  lineIndex: number;
  raw: string;
};

export type StoryRow = {
  usId: string; // US-01
  title: string;
  asA: string | null;
  iWantTo: string | null;
  soThat: string | null;
  priority: ReqPriority | null;
  status: ReqStatus | null;
  owner: ReqOwner | null;
  reqs: ReqRow[];
  // Block geometry in user-journeys.md (0-based line indexes):
  headingLine: number; // the `### US-NN …` heading
  metaLine: number | null; // the `<!-- story: … -->` comment, when present
  bodyLine: number | null; // the `**As a** …` sentence, when present
  blockEnd: number; // exclusive — first line after the block
  deleted: boolean; // soft-deleted (excluded from the list)
};

export type ParseResult = {
  stories: StoryRow[]; // soft-deleted stories excluded
  businessReqs: ReqRow[]; // BR- rows parsed from prd.md
  // Non-fatal parse notes — a row whose fields don't fit the vocabulary still
  // renders (with `—` defaults) rather than vanishing. Fatal for one file
  // only; the GET handler still returns 200.
  parseError: string | null;
};

// ── Row regexes ────────────────────────────────────────────────────────────

// `- BR-001 | must | draft | BA | text…` — the canonical row. Also tolerates
// `*`/`+` bullets and metadata-less legacy rows: the segments after the ID are
// split on `|` and matched against the vocabularies positionally, and a row
// whose segments don't fit the grammar degrades to a metadata-less row
// (`—` defaults per plan §2) rather than being dropped.
const REQ_ROW_RE = /^[-*+]\s+((?:BR|TR)-\d{3})\s*(?:\|(.*))?$/;

// Soft-deleted row: the same shape wrapped in `~~…~~`.
const DELETED_ROW_RE = /^[-*+]\s*~~\s*((?:BR|TR)-\d{3})[\s\S]*~~\s*$/;

const STORY_HEADING_RE = /^###\s+(US-\d{2,})\s*[—–-]\s*(.+)$/;
const STORY_META_RE = /^<!--\s*story:\s*(.*?)\s*-->$/;
const STORY_DELETED_RE = /^<!--\s*deleted\s+/i;
const STORY_BODY_RE = /^\*\*As a\*\*\s*(.+)$/is;

// Split the post-ID segments of a row into metadata + text. Canonical rows
// carry `priority | status | owner | text`; anything shorter (or whose first
// three segments hold no vocabulary words) is a legacy free-text row.
function parseRowSegments(segs: string[]): Pick<ReqRow, 'priority' | 'status' | 'owner' | 'text'> {
  const textOf = (parts: string[]) => parts.join('|').trim();
  if (segs.length >= 4) {
    const [p, st, ow] = segs;
    const priority = isReqPriority(p) ? p : null;
    const status = isReqStatus(st) ? st : null;
    const owner = isReqOwner(ow) ? ow : null;
    const text = textOf(segs.slice(3));
    if (text) return { priority, status, owner, text };
    // No text after a full metadata triple → a bare ID isn't a row (caller
    // skips); but an all-free-text 4-segment line is still legacy prose.
    if (!priority && !status && !owner) {
      return { priority: null, status: null, owner: null, text: textOf(segs) };
    }
    return { priority, status, owner, text: '' };
  }
  return { priority: null, status: null, owner: null, text: textOf(segs) };
}

// `priority=must status=approved owner=BA` inside the story comment.
function parseStoryMeta(raw: string): Partial<Pick<StoryRow, 'priority' | 'status' | 'owner'>> {
  const out: Partial<Pick<StoryRow, 'priority' | 'status' | 'owner'>> = {};
  for (const m of raw.matchAll(/(\w+)\s*=\s*([^\s]+)\s*(?:,|$|(?=\w+=))/g)) {
    const key = m[1].toLowerCase();
    const val = m[2].replace(/,$/, '');
    if (key === 'priority' && isReqPriority(val)) out.priority = val;
    else if (key === 'status' && isReqStatus(val)) out.status = val;
    else if (key === 'owner' && isReqOwner(val)) out.owner = val;
  }
  return out;
}

// The `**As a** X, **I want to** Y, **so that** Z` sentence → its three parts.
function parseStoryBody(raw: string): { asA: string; iWantTo: string; soThat: string } | null {
  const re = /\*\*As a\*\*\s*(.*?)(?:,\s*\*\*I want to\*\*\s*(.*?))?(?:,\s*\*\*so that\*\*\s*(.*?))?(?:\.|$)/is;
  const m = raw.match(re);
  if (!m || !m[1]) return null;
  return {
    asA: (m[1] ?? '').trim(),
    iWantTo: (m[2] ?? '').trim(),
    soThat: (m[3] ?? '').trim(),
  };
}

// ── Parsers ────────────────────────────────────────────────────────────────

// Parse the BR- rows out of prd.md. Tolerant: scans every list item in the
// file whose first token matches the ID grammar — §8 is the contract's home
// but legacy files that scattered rows elsewhere still surface.
export function parseBusinessReqs(prd: string): { rows: ReqRow[]; parseError: string | null } {
  const lines = prd.split('\n');
  const rows: ReqRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (DELETED_ROW_RE.test(raw.trim())) continue; // soft-deleted → excluded
    const m = raw.trim().match(REQ_ROW_RE);
    if (!m || !m[1].startsWith('BR-')) continue;
    const fields = parseRowSegments(m[2] ? m[2].split('|').map((s) => s.trim()) : []);
    if (!fields.text) continue; // a bare ID with no text isn't a row
    rows.push({
      id: m[1],
      type: 'BR',
      ...fields,
      lineIndex: i,
      raw,
    });
  }
  return { rows, parseError: null };
}

// Parse user-journeys.md into story blocks with their TR- rows.
export function parseStories(journeys: string): { stories: StoryRow[]; parseError: string | null } {
  const lines = journeys.split('\n');
  const stories: StoryRow[] = [];

  const openAt = (start: number): StoryRow | null => {
    const hm = lines[start].trim().match(STORY_HEADING_RE);
    if (!hm) return null;
    const story: StoryRow = {
      usId: hm[1],
      title: hm[2].trim(),
      asA: null,
      iWantTo: null,
      soThat: null,
      priority: null,
      status: null,
      owner: null,
      reqs: [],
      headingLine: start,
      metaLine: null,
      bodyLine: null,
      blockEnd: lines.length,
      deleted: false,
    };
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^###\s+US-/.test(line.trim())) {
        story.blockEnd = i;
        break;
      }
      const trimmed = line.trim();
      if (STORY_META_RE.test(trimmed) && story.metaLine === null) {
        story.metaLine = i;
        Object.assign(story, parseStoryMeta(trimmed.match(STORY_META_RE)![1]));
        continue;
      }
      if (STORY_DELETED_RE.test(trimmed)) {
        // A delete marker anywhere in the block soft-deletes the whole story.
        story.deleted = true;
        continue;
      }
      if (story.bodyLine === null) {
        const bm = trimmed.match(STORY_BODY_RE);
        if (bm) {
          const parts = parseStoryBody(trimmed);
          if (parts) {
            story.bodyLine = i;
            story.asA = parts.asA || null;
            story.iWantTo = parts.iWantTo || null;
            story.soThat = parts.soThat || null;
            continue;
          }
        }
      }
      // Requirement row (TR-) — struck rows are skipped.
      if (DELETED_ROW_RE.test(trimmed)) continue;
      const rm = trimmed.match(REQ_ROW_RE);
      if (rm && rm[1].startsWith('TR-')) {
        const fields = parseRowSegments(rm[2] ? rm[2].split('|').map((s) => s.trim()) : []);
        if (fields.text) {
          story.reqs.push({
            id: rm[1],
            type: 'TR',
            ...fields,
            lineIndex: i,
            raw: line,
          });
        }
      }
      // Anything else: unknown content — passes through untouched (we never
      // rewrite whole blocks; every mutation splices specific lines).
    }
    return story;
  };

  for (let i = 0; i < lines.length; i++) {
    if (!/^###\s+US-/.test(lines[i])) continue;
    const story = openAt(i);
    if (!story) continue;
    if (!story.deleted) stories.push(story);
    i = story.blockEnd - 1; // jump past the block
  }
  return { stories, parseError: null };
}

export function parseRequirements(prd: string, journeys: string): ParseResult {
  const b = parseBusinessReqs(prd);
  const s = parseStories(journeys);
  return {
    stories: s.stories,
    businessReqs: b.rows,
    parseError: b.parseError ?? s.parseError,
  };
}

// ── Renderers (the write side of the grammar) ──────────────────────────────

export function renderReqRow(
  id: string,
  priority: ReqPriority,
  status: ReqStatus,
  owner: ReqOwner,
  text: string,
): string {
  return `- ${id} | ${priority} | ${status} | ${owner} | ${text}`;
}

// A story block exactly as the grammar draws it — appended to
// user-journeys.md on POST /stories.
export function renderStoryBlock(input: {
  usId: string;
  title: string;
  asA: string;
  iWantTo: string;
  soThat: string;
  priority: ReqPriority;
  status: ReqStatus;
  owner: ReqOwner;
}): string {
  return [
    `### ${input.usId} — ${input.title}`,
    `<!-- story: priority=${input.priority} status=${input.status} owner=${input.owner} -->`,
    `**As a** ${input.asA}, **I want to** ${input.iWantTo}, **so that** ${input.soThat}.`,
  ].join('\n');
}

// ── ID allocation (spec DATA section) ──────────────────────────────────────
// Lowest free number, never renumbered on delete. `prefix` is 'BR' | 'TR' |
// 'US'; ids are zero-padded to 3 (BR/TR) or 2 (US) digits.

export function nextFreeId(existingIds: string[], prefix: 'BR' | 'TR' | 'US'): string {
  const width = prefix === 'US' ? 2 : 3;
  const used = new Set<number>();
  for (const id of existingIds) {
    const m = id.match(new RegExp(`^${prefix}-(\\d{${width}})$`));
    if (m) used.add(parseInt(m[1], 10));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `${prefix}-${String(n).padStart(width, '0')}`;
}

// ── Server-side validation (spec VALID section; client checks are not
// trusted) ──────────────────────────────────────────────────────────────────

export const LIMITS = {
  storyTitle: { min: 4, max: 120 },
  asA: { min: 2, max: 80 },
  iWantTo: { min: 4, max: 200 },
  soThat: { min: 4, max: 200 },
  reqText: { min: 10, max: 500 },
} as const;

// Single-line fields: control characters (incl. newlines) are rejected, so a
// crafted value can't inject extra grammar lines into the markdown files.
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/;

export type FieldErrors = Record<string, string>;

function checkField(
  errors: FieldErrors,
  field: string,
  value: unknown,
  limits: { min: number; max: number },
): string | null {
  if (typeof value !== 'string') {
    errors[field] = 'Required';
    return null;
  }
  const trimmed = value.trim();
  if (CONTROL_CHARS_RE.test(trimmed)) {
    errors[field] = 'Contains invalid characters';
    return null;
  }
  if (trimmed.length < limits.min || trimmed.length > limits.max) {
    errors[field] = `Must be ${limits.min}–${limits.max} characters`;
    return null;
  }
  return trimmed;
}

export type StoryInput = {
  title: string;
  asA: string;
  iWantTo: string;
  soThat: string;
  priority: ReqPriority;
  status: ReqStatus;
  owner: ReqOwner;
};

export function validateStoryInput(
  body: Record<string, unknown> | undefined,
): { ok: true; value: StoryInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const title = checkField(errors, 'title', body?.title, LIMITS.storyTitle);
  const asA = checkField(errors, 'asA', body?.asA, LIMITS.asA);
  const iWantTo = checkField(errors, 'iWantTo', body?.iWantTo, LIMITS.iWantTo);
  const soThat = checkField(errors, 'soThat', body?.soThat, LIMITS.soThat);
  const priority = isReqPriority(body?.priority) ? body.priority : null;
  if (!priority) errors.priority = 'Must be must | should | could | wont';
  const status = isReqStatus(body?.status) ? body.status : null;
  if (!status) errors.status = 'Must be one of the 8 canonical statuses';
  const owner = isReqOwner(body?.owner) ? body.owner : null;
  if (!owner) errors.owner = 'Must be BA | SA | DEV | QA';
  if (Object.keys(errors).length > 0 || title === null || asA === null || iWantTo === null || soThat === null || !priority || !status || !owner) {
    return { ok: false, errors };
  }
  return { ok: true, value: { title, asA, iWantTo, soThat, priority, status, owner } };
}

// Partial story patch — only the fields present in the body are validated.
export type StoryPatch = Partial<Omit<StoryInput, 'usId'>>;

export function validateStoryPatch(
  body: Record<string, unknown> | undefined,
): { ok: true; value: StoryPatch } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const value: StoryPatch = {};
  const fields: ['title' | 'asA' | 'iWantTo' | 'soThat', unknown, { min: number; max: number }][] = [
    ['title', body?.title, LIMITS.storyTitle],
    ['asA', body?.asA, LIMITS.asA],
    ['iWantTo', body?.iWantTo, LIMITS.iWantTo],
    ['soThat', body?.soThat, LIMITS.soThat],
  ];
  for (const [key, raw, limits] of fields) {
    if (raw === undefined) continue;
    const v = checkField(errors, key, raw, limits);
    if (v !== null) value[key] = v;
  }
  if (body?.priority !== undefined) {
    if (isReqPriority(body.priority)) value.priority = body.priority;
    else errors.priority = 'Must be must | should | could | wont';
  }
  if (body?.status !== undefined) {
    if (isReqStatus(body.status)) value.status = body.status;
    else errors.status = 'Must be one of the 8 canonical statuses';
  }
  if (body?.owner !== undefined) {
    if (isReqOwner(body.owner)) value.owner = body.owner;
    else errors.owner = 'Must be BA | SA | DEV | QA';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(value).length === 0) return { ok: false, errors: { _: 'Nothing to update' } };
  return { ok: true, value };
}

export type ReqInput = {
  type: ReqType;
  text: string;
  priority: ReqPriority;
  status: ReqStatus;
  owner: ReqOwner;
};

export function validateReqInput(
  body: Record<string, unknown> | undefined,
): { ok: true; value: ReqInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const text = checkField(errors, 'text', body?.text, LIMITS.reqText);
  if (!isReqType(body?.type)) errors.type = 'Must be BR or TR';
  if (!isReqPriority(body?.priority)) errors.priority = 'Must be must | should | could | wont';
  if (!isReqStatus(body?.status)) errors.status = 'Must be one of the 8 canonical statuses';
  if (!isReqOwner(body?.owner)) errors.owner = 'Must be BA | SA | DEV | QA';
  if (Object.keys(errors).length > 0 || text === null || !isReqType(body?.type)) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      type: body.type as ReqType,
      text,
      priority: body.priority as ReqPriority,
      status: body.status as ReqStatus,
      owner: body.owner as ReqOwner,
    },
  };
}

export type ReqPatch = Partial<Omit<ReqInput, 'type'>>;

export function validateReqPatch(
  body: Record<string, unknown> | undefined,
): { ok: true; value: ReqPatch } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const value: ReqPatch = {};
  if (body?.text !== undefined) {
    const v = checkField(errors, 'text', body.text, LIMITS.reqText);
    if (v !== null) value.text = v;
  }
  if (body?.priority !== undefined) {
    if (isReqPriority(body.priority)) value.priority = body.priority;
    else errors.priority = 'Must be must | should | could | wont';
  }
  if (body?.status !== undefined) {
    if (isReqStatus(body.status)) value.status = body.status;
    else errors.status = 'Must be one of the 8 canonical statuses';
  }
  if (body?.owner !== undefined) {
    if (isReqOwner(body.owner)) value.owner = body.owner;
    else errors.owner = 'Must be BA | SA | DEV | QA';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(value).length === 0) return { ok: false, errors: { _: 'Nothing to update' } };
  return { ok: true, value };
}

// ── Splice helpers (surgical line edits — the file is never re-serialized) ─

export function spliceLine(lines: string[], index: number, replacement: string): string[] {
  const next = lines.slice();
  next[index] = replacement;
  return next;
}

// Insert `insertion` (a block of lines) after line index `after`, keeping a
// blank separator line when the anchor isn't already followed by one.
export function insertAfter(lines: string[], after: number, insertion: string[]): string[] {
  const next = lines.slice();
  const pad = next[after + 1] !== undefined && next[after + 1].trim() === '' ? [] : [''];
  next.splice(after + 1, 0, ...pad, ...insertion);
  return next;
}

// The §8 section of prd.md — heading `/^##\s*8[\.\):—-]/` (e.g. "## 8. User
// Stories") through the next level-2 heading or EOF. Null when absent.
export function section8Range(prdLines: string[]): { start: number; end: number } | null {
  const start = prdLines.findIndex((l) => /^##\s*8[\.\):—-]/.test(l));
  if (start === -1) return null;
  let end = prdLines.length;
  for (let i = start + 1; i < prdLines.length; i++) {
    if (/^##\s/.test(prdLines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

// Where a new BR row lands inside §8: after the last existing BR/TR row in
// the section, else after the section's last non-blank line (the template
// file's §8 is a table — the new list item goes below it), else right under
// the heading. Null when there is no §8 to write into.
export function businessReqInsertIndex(prdLines: string[]): number | null {
  const range = section8Range(prdLines);
  if (!range) return null;
  let lastRow = -1;
  for (let i = range.start + 1; i < range.end; i++) {
    if (REQ_ROW_RE.test(prdLines[i].trim())) lastRow = i;
  }
  if (lastRow !== -1) return lastRow;
  for (let i = range.end - 1; i > range.start; i--) {
    if (prdLines[i].trim() !== '') return i;
  }
  return range.start;
}

// Where a new TR row lands inside a story block: after the block's last
// requirement row, else right under the heading (or the body/meta line when
// the block has one — new rows belong below the prose, not above it).
export function storyReqInsertIndex(story: StoryRow): number {
  const lastReq = story.reqs[story.reqs.length - 1];
  if (lastReq) return lastReq.lineIndex;
  return story.bodyLine ?? story.metaLine ?? story.headingLine;
}

// A story's ID referenced in another story's free text (the delete guard's
// reference rule, plan §2): the ID appears as a word in the story's title or
// As-a/I-want-to/So-that sentence — or in any of its requirement rows' text.
export function storyReferencesId(story: StoryRow, reqId: string): boolean {
  if (story.usId === reqId) return false;
  const haystacks = [
    story.title,
    story.asA ?? '',
    story.iWantTo ?? '',
    story.soThat ?? '',
    ...story.reqs.map((r) => r.text),
  ];
  return haystacks.some((h) => h.includes(reqId));
}

// ── ID collection for allocation ───────────────────────────────────────────
// nextFreeId allocates from the LIVE rows only (soft-deleted rows' numbers
// are free again — spec DATA: "the next add reuses the lowest free number"),
// but the story-ID scan must see every heading (a soft-deleted US-NN block
// still holds its ID's line on disk). These scanners are tolerant: they walk
// raw lines, not parsed rows, so they work on partially-unparseable files.

export function collectExistingIds(prd: string, journeys: string): { br: string[]; tr: string[]; us: string[] } {
  const br: string[] = [];
  const tr: string[] = [];
  const us: string[] = [];
  const rowScan = (text: string) => {
    for (const line of text.split('\n')) {
      const m = line.trim().match(REQ_ROW_RE);
      if (!m) continue;
      (m[1].startsWith('BR-') ? br : tr).push(m[1]);
    }
  };
  rowScan(prd);
  rowScan(journeys);
  for (const line of journeys.split('\n')) {
    const m = line.trim().match(/^###\s+(US-\d{2,})/);
    if (m) us.push(m[1]);
  }
  return { br, tr, us };
}

// ── Live-ID variants for allocation ────────────────────────────────────────
// Convenience over the parse results: the live (non-deleted) IDs only.
export function liveReqIds(parsed: ParseResult): string[] {
  return [
    ...parsed.businessReqs.map((r) => r.id),
    ...parsed.stories.flatMap((s) => s.reqs.map((r) => r.id)),
  ];
}