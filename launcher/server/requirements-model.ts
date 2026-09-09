// Requirements tab — the data model behind `PRD/prd.md` §8 (business reqs),
// `PRD/features.md` (feature blocks with acceptance criteria + technical
// reqs), and the legacy story blocks in `PRD/user-journeys.md` (migrated to
// features by `migrateStoriesToFeatures`).
//
// This module is PURE: no fs, no db, no express. The grammar lives here so
// both the parser and the write-back splices share one implementation, and so
// scripts/verify-requirements.ts can exercise it without booting the API, and
// the client components import the same state machine so the status dropdown
// can never drift from the server's machine (one grammar, two consumers).
//
// Grammar (requirements redesign, design/requirements-redesign.md §3-§4):
//
//   ### FE-01 — List an item for lending
//   <!-- feature: priority=must status=approved owner=BA origin=manual -->
//   <!-- source: user-journeys.md §3 -->
//   Household owners can list an item for lending so that neighbors can borrow it.
//
//   ## Acceptance Criteria
//   - AC-001 | met | The list form persists the listing with photo + condition
//   <!-- AC-001: origin=manual -->
//   - TR-001 | should | draft | DEV | Persist listing with photo + condition
//   <!-- TR-001: origin=manual -->
//
// Requirement rows (prd.md §8 for BR-, feature blocks for TR-):
//   - <ID> | <must|should|could|wont> | <status> | <BA|SA|DEV|QA> | <text>
//
// Parse rules:
// - Tolerant: anything unrecognized passes through untouched on write-back
//   (surgical line-splice — never re-serialize the whole file, mirroring the
//   contents-API reformat-churn lesson).
// - `### FE-NN` headings open feature scopes. `<!-- feature: … -->`,
//   `<!-- source: … -->`, and `<!-- deleted … -->` comments carry metadata.
//   Struck-through (`~~…~~`) rows with a delete comment parse as soft-deleted
//   and are excluded from the list (the row stays on disk for the 30-day
//   recovery seam — no purge job exists, plan §2).

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

export const REQ_OWNERS = ['BA', 'SA', 'DEV', 'DES', 'QA'] as const;
export type ReqOwner = (typeof REQ_OWNERS)[number];

export type ReqType = 'BR' | 'TR';

// Acceptance-criteria statuses (feature-level, requirements redesign §4).
// Deliberately NOT the 8-status machine — an AC is either met or unmet.
export const AC_STATUSES = ['met', 'unmet'] as const;
export type AcStatus = (typeof AC_STATUSES)[number];

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

export function isAcStatus(v: unknown): v is AcStatus {
  return typeof v === 'string' && (AC_STATUSES as readonly string[]).includes(v);
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
  // Link to a feature (requirements redesign §4). For TRs this is implicit —
  // they live inside a feature block in features.md. For BRs it's read from
  // an optional comment line that follows the row:
  //   - BR-001 | must | approved | BA | The list form…
  //   <!-- BR-001: feature=FE-01 -->
  // When null the BR is "unassigned" and lives in its own standalone group
  // in the UI until the BA attaches it.
  featureId: string | null;
  // Where this requirement came from (refinement batch item 2.6):
  //   manual    — written by the BA via the UI
  //   generated — written by a code/design agent (the future BA auto-draft
  //               job, plan §6); the BA can promote / edit / delete them
  //               like any other row
  // null on legacy rows that pre-date the marker.
  origin: 'manual' | 'generated' | null;
  lineIndex: number;
  raw: string;
};

// One acceptance-criteria row inside a feature block (requirements redesign
// §4). `lineIndex` points at the row's raw line in features.md.
export type AcRow = {
  id: string; // AC-001
  status: AcStatus | null;
  text: string;
  origin: 'manual' | 'generated' | null;
  lineIndex: number;
  raw: string;
};

export type FeatureRow = {
  feId: string; // FE-01
  title: string;
  description: string | null;
  source: string | null; // background-doc link, e.g. "user-journeys.md §3"
  priority: ReqPriority | null;
  status: ReqStatus | null;
  owner: ReqOwner | null;
  // Origin tag (QA-2): manual = BA wrote the feature; generated = an agent
  // wrote it; null = legacy block predating the meta-comment extension.
  origin: 'manual' | 'generated' | null;
  acs: AcRow[];
  reqs: ReqRow[]; // TR- rows + linked BR- rows
  // Block geometry in features.md (0-based line indexes):
  headingLine: number; // the `### FE-NN …` heading
  metaLine: number | null; // the `<!-- feature: … -->` comment, when present
  sourceLine: number | null; // the `<!-- source: … -->` comment, when present
  acHeadingLine: number | null; // the `## Acceptance Criteria` heading
  bodyLine: number | null; // the description paragraph, when present
  blockEnd: number; // exclusive — first line after the block
  deleted: boolean; // soft-deleted (excluded from the list)
};

// Legacy story block (pre-migration user-journeys.md grammar). Kept so
// `migrateStoriesToFeatures` can read the old files; nothing else uses it.
export type StoryRow = {
  usId: string; // US-01
  title: string;
  asA: string | null;
  iWantTo: string | null;
  soThat: string | null;
  priority: ReqPriority | null;
  status: ReqStatus | null;
  owner: ReqOwner | null;
  origin: 'manual' | 'generated' | null;
  reqs: ReqRow[];
  headingLine: number;
  metaLine: number | null;
  bodyLine: number | null;
  blockEnd: number;
  deleted: boolean;
};

export type ParseResult = {
  features: FeatureRow[]; // soft-deleted features excluded
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

const FE_HEADING_RE = /^###\s+(FE-\d{2,})\s*[—–-]\s*(.+)$/;
const FE_META_RE = /^<!--\s*feature:\s*(.*?)\s*-->$/;
const FE_DELETED_RE = /^<!--\s*deleted\s+/i;
const SOURCE_META_RE = /^<!--\s*source:\s*(.*?)\s*-->$/;
const AC_SECTION_RE = /^##\s+Acceptance Criteria\s*$/i;
const AC_ROW_RE = /^[-*+]\s+(AC-\d{3})\s*(?:\|(.*))?$/;
const AC_DELETED_RE = /^[-*+]\s*~~\s*(AC-\d{3})[\s\S]*~~\s*$/;

// Legacy story grammar (pre-migration user-journeys.md).
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

// AC rows carry `status | text` (met/unmet), not the priority|status|owner
// triple of BR/TR rows. A row with no recognizable status degrades to a
// status-less row (`—` default) rather than being dropped.
function parseAcRow(segs: string[]): { status: AcStatus | null; text: string } {
  const textOf = (parts: string[]) => parts.join('|').trim();
  if (segs.length >= 2) {
    const [st] = segs;
    const status = isAcStatus(st) ? st : null;
    const text = textOf(segs.slice(1));
    if (text) return { status, text };
    if (!status) return { status: null, text: textOf(segs) };
    return { status, text: '' };
  }
  return { status: null, text: textOf(segs) };
}

// `priority=must status=approved owner=BA origin=manual` inside the feature
// comment. Origin was added in QA-2 — same vocabulary as BR/TR meta comments
// so a future BA-auto-draft job can stamp it consistently.
function parseFeatureMeta(raw: string): Partial<Pick<FeatureRow, 'priority' | 'status' | 'owner' | 'origin'>> {
  const out: Partial<Pick<FeatureRow, 'priority' | 'status' | 'owner' | 'origin'>> = {};
  for (const m of raw.matchAll(/(\w+)\s*=\s*([^\s]+)\s*(?:,|$|(?=\w+=))/g)) {
    const key = m[1].toLowerCase();
    const val = m[2].replace(/,$/, '');
    if (key === 'priority' && isReqPriority(val)) out.priority = val;
    else if (key === 'status' && isReqStatus(val)) out.status = val;
    else if (key === 'owner' && isReqOwner(val)) out.owner = val;
    else if (key === 'origin' && (val === 'manual' || val === 'generated')) out.origin = val;
  }
  return out;
}

// Legacy story meta — same grammar as parseFeatureMeta, different comment.
function parseStoryMeta(raw: string): Partial<Pick<StoryRow, 'priority' | 'status' | 'owner' | 'origin'>> {
  const out: Partial<Pick<StoryRow, 'priority' | 'status' | 'owner' | 'origin'>> = {};
  for (const m of raw.matchAll(/(\w+)\s*=\s*([^\s]+)\s*(?:,|$|(?=\w+=))/g)) {
    const key = m[1].toLowerCase();
    const val = m[2].replace(/,$/, '');
    if (key === 'priority' && isReqPriority(val)) out.priority = val;
    else if (key === 'status' && isReqStatus(val)) out.status = val;
    else if (key === 'owner' && isReqOwner(val)) out.owner = val;
    else if (key === 'origin' && (val === 'manual' || val === 'generated')) out.origin = val;
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

// Match the comment line that follows a BR row to associate it with a feature
// (or capture the origin marker — batch item 2.6, future batch).
//   <!-- BR-001: feature=FE-01, origin=generated -->
const BR_META_RE = /^<!--\s*(BR-\d{3}):\s*(.*?)\s*-->$/;

// Match the comment line that follows a TR row to read its origin marker
// (Will QA-2: TRs now carry origin just like BRs — the BA stamps
// origin=manual on every POST; the future TR auto-draft job will write
// origin=generated). Pairs one-to-one with BR_META_RE — same grammar,
// different prefix.
const TR_META_RE = /^<!--\s*(TR-\d{3}):\s*(.*?)\s*-->$/;

// Same shape for AC rows inside a feature block.
const AC_META_RE = /^<!--\s*(AC-\d{3}):\s*(.*?)\s*-->$/;

// Split a `<!-- BR-NNN: k=v, k=v -->` body into key/value pairs. Unknown keys
// are ignored silently so this stays forward-compatible with new markers.
// The `feature=` key is canonical (requirements redesign §4); a legacy
// `story=` key (pre-migration) is kept in `other` — the migration rewrites
// those links before the parser ever sees them.
function parseBrMeta(body: string): {
  featureId: string | null;
  origin: 'manual' | 'generated' | null;
  other: Record<string, string>;
} {
  const other: Record<string, string> = {};
  let featureId: string | null = null;
  let origin: 'manual' | 'generated' | null = null;
  for (const m of body.matchAll(/(\w+)\s*=\s*([^,\s]+)(?:,|$)/g)) {
    const key = m[1].toLowerCase();
    const val = m[2];
    if (key === 'feature' && /^FE-\d{2,}$/.test(val)) {
      featureId = val;
    } else if (key === 'origin' && (val === 'manual' || val === 'generated')) {
      origin = val;
    } else if (/^[a-z][a-z0-9_]*$/i.test(key)) {
      other[key] = val;
    }
  }
  return { featureId, origin, other };
}

// Shared origin-only meta parser for TR and AC rows — TR/AC meta comments
// don't carry a feature link (they implicitly live in their block).
function parseOriginMeta(body: string): { origin: 'manual' | 'generated' | null } {
  let origin: 'manual' | 'generated' | null = null;
  for (const m of body.matchAll(/(\w+)\s*=\s*([^,\s]+)(?:,|$)/g)) {
    const key = m[1].toLowerCase();
    const val = m[2];
    if (key === 'origin' && (val === 'manual' || val === 'generated')) {
      origin = val;
    }
  }
  return { origin };
}

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

    // Look one line ahead for the row's metadata comment. Comments are
    // tolerated as missing — unlinked BRs default to featureId=null and
    // origin-less BRs default to null (legacy rows; new writes stamp
    // origin=manual, the future BA auto-draft will stamp origin=generated).
    // QA-2: blank lines between row and marker are tolerated so the
    // look-ahead survives whichever insertion pattern (POST inserts two
    // adjacent lines; a legacy PATCH may sit next to a pre-existing blank).
    let featureId: string | null = null;
    let origin: 'manual' | 'generated' | null = null;
    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j];
      if (candidate.trim() === '') continue;
      const cm = candidate.trim().match(BR_META_RE);
      if (cm && cm[1] === m[1]) {
        const meta = parseBrMeta(cm[2]);
        featureId = meta.featureId;
        origin = meta.origin;
      }
      break;
    }

    rows.push({
      id: m[1],
      type: 'BR',
      ...fields,
      featureId,
      origin,
      lineIndex: i,
      raw,
    });
  }
  return { rows, parseError: null };
}

// Parse features.md into feature blocks with their AC- and TR- rows.
export function parseFeatures(features: string): { features: FeatureRow[]; parseError: string | null } {
  const lines = features.split('\n');
  const out: FeatureRow[] = [];

  const openAt = (start: number): FeatureRow | null => {
    const hm = lines[start].trim().match(FE_HEADING_RE);
    if (!hm) return null;
    const feature: FeatureRow = {
      feId: hm[1],
      title: hm[2].trim(),
      description: null,
      source: null,
      priority: null,
      status: null,
      owner: null,
      origin: null,
      acs: [],
      reqs: [],
      headingLine: start,
      metaLine: null,
      sourceLine: null,
      acHeadingLine: null,
      bodyLine: null,
      blockEnd: lines.length,
      deleted: false,
    };
    // Tracks whether any committed-content line has appeared yet (description
    // OR an AC/TR row, struck or not). A `<!-- deleted … -->` marker is a
    // feature-level delete iff it appears *before* that content — the
    // DELETE-features endpoint writes it on its own line directly after the
    // heading; the DELETE-requirements endpoint writes its marker directly
    // after a struck row, which is NOT a feature delete.
    let seenFirstContent = false;
    let inAcSection = false;
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^###\s+FE-/.test(line.trim())) {
        feature.blockEnd = i;
        break;
      }
      const trimmed = line.trim();
      if (FE_META_RE.test(trimmed) && feature.metaLine === null) {
        feature.metaLine = i;
        Object.assign(feature, parseFeatureMeta(trimmed.match(FE_META_RE)![1]));
        continue;
      }
      if (SOURCE_META_RE.test(trimmed) && feature.sourceLine === null) {
        feature.sourceLine = i;
        feature.source = trimmed.match(SOURCE_META_RE)![1].trim() || null;
        continue;
      }
      // A delete marker is a feature-level delete iff it is the first content
      // line in the block (see `seenFirstContent` above).
      if (FE_DELETED_RE.test(trimmed) && !seenFirstContent) {
        feature.deleted = true;
        continue;
      }
      if (AC_SECTION_RE.test(trimmed)) {
        feature.acHeadingLine = i;
        inAcSection = true;
        seenFirstContent = true;
        continue;
      }
      if (inAcSection) {
        // AC row (AC-) — struck rows are skipped but still count as content.
        if (AC_DELETED_RE.test(trimmed)) {
          seenFirstContent = true;
          continue;
        }
        const am = trimmed.match(AC_ROW_RE);
        if (am) {
          const fields = parseAcRow(am[2] ? am[2].split('|').map((s) => s.trim()) : []);
          if (fields.text) {
            // Look one line ahead for the row's metadata comment (origin).
            let origin: 'manual' | 'generated' | null = null;
            for (let j = i + 1; j < lines.length; j++) {
              const candidate = lines[j];
              if (candidate.trim() === '') continue;
              const cm = candidate.trim().match(AC_META_RE);
              if (cm && cm[1] === am[1]) {
                origin = parseOriginMeta(cm[2]).origin;
              }
              break;
            }
            feature.acs.push({
              id: am[1],
              status: fields.status,
              text: fields.text,
              origin,
              lineIndex: i,
              raw: line,
            });
            seenFirstContent = true;
          }
          continue;
        }
        // TR rows live inside the feature block, after the AC section.
        if (DELETED_ROW_RE.test(trimmed)) {
          seenFirstContent = true;
          continue;
        }
        const rm = trimmed.match(REQ_ROW_RE);
        if (rm && rm[1].startsWith('TR-')) {
          const fields = parseRowSegments(rm[2] ? rm[2].split('|').map((s) => s.trim()) : []);
          if (fields.text) {
            let origin: 'manual' | 'generated' | null = null;
            for (let j = i + 1; j < lines.length; j++) {
              const candidate = lines[j];
              if (candidate.trim() === '') continue;
              const cm = candidate.trim().match(TR_META_RE);
              if (cm && cm[1] === rm[1]) {
                origin = parseOriginMeta(cm[2]).origin;
              }
              break;
            }
            feature.reqs.push({
              id: rm[1],
              type: 'TR',
              ...fields,
              // TRs implicitly live in their feature block; the featureId is
              // the block's heading id, set after parseFeatures collects them.
              featureId: null,
              origin,
              lineIndex: i,
              raw: line,
            });
            seenFirstContent = true;
          }
          continue;
        }
        // Anything else inside the AC section: unknown content — passes
        // through untouched (we never rewrite whole blocks).
        continue;
      }
      // Not in the AC section yet: a BR/TR row here — struck or not — is
      // still committed content: it freezes the feature-delete position
      // (item B2) exactly as it does inside the AC section.
      if (REQ_ROW_RE.test(trimmed) || DELETED_ROW_RE.test(trimmed)) seenFirstContent = true;
      // The description paragraph is the first non-meta, non-heading,
      // non-row content line.
      if (
        feature.bodyLine === null &&
        trimmed !== '' &&
        !REQ_ROW_RE.test(trimmed) &&
        !DELETED_ROW_RE.test(trimmed)
      ) {
        feature.bodyLine = i;
        feature.description = trimmed;
        seenFirstContent = true;
        continue;
      }
      // Anything else: unknown content — passes through untouched.
    }
    return feature;
  };

  for (let i = 0; i < lines.length; i++) {
    if (!/^###\s+FE-/.test(lines[i])) continue;
    const feature = openAt(i);
    if (!feature) continue;
    if (!feature.deleted) out.push(feature);
    i = feature.blockEnd - 1; // jump past the block
  }
  return { features: out, parseError: null };
}

// Parse user-journeys.md into story blocks with their TR- rows. Legacy
// grammar — kept only for `migrateStoriesToFeatures` to read pre-migration
// files (and the soft-deleted blocks the migration leaves behind).
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
      origin: null,
      reqs: [],
      headingLine: start,
      metaLine: null,
      bodyLine: null,
      blockEnd: lines.length,
      deleted: false,
    };
    let seenFirstContent = false;
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
      if (STORY_DELETED_RE.test(trimmed) && !seenFirstContent) {
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
            seenFirstContent = true;
            continue;
          }
        }
      }
      if (DELETED_ROW_RE.test(trimmed)) {
        seenFirstContent = true;
        continue;
      }
      const rm = trimmed.match(REQ_ROW_RE);
      if (rm && rm[1].startsWith('TR-')) {
        const fields = parseRowSegments(rm[2] ? rm[2].split('|').map((s) => s.trim()) : []);
        if (fields.text) {
          let origin: 'manual' | 'generated' | null = null;
          for (let j = i + 1; j < lines.length; j++) {
            const candidate = lines[j];
            if (candidate.trim() === '') continue;
            const cm = candidate.trim().match(TR_META_RE);
            if (cm && cm[1] === rm[1]) {
              origin = parseOriginMeta(cm[2]).origin;
            }
            break;
          }
          story.reqs.push({
            id: rm[1],
            type: 'TR',
            ...fields,
            featureId: null,
            origin,
            lineIndex: i,
            raw: line,
          });
          seenFirstContent = true;
        }
      }
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

export function parseRequirements(prd: string, features: string): ParseResult {
  const b = parseBusinessReqs(prd);
  const f = parseFeatures(features);
  // Stamp TR rows with their owning feature's feId (block-based assignment;
  // not a comment-line lookup) so the UI can group BRs + TRs under the
  // right feature.
  for (const feature of f.features) {
    for (const tr of feature.reqs) tr.featureId = feature.feId;
  }
  // Collect the set of valid feature ids for the BR-link validation below.
  const knownFeatureIds = new Set(f.features.map((fe) => fe.feId));
  // Linked BRs move into their feature's reqs list; unlinked stay in
  // businessReqs so the UI can render an "Unassigned" group.
  const linked: typeof b.rows = [];
  const unlinked: typeof b.rows = [];
  for (const br of b.rows) {
    if (br.featureId && knownFeatureIds.has(br.featureId)) {
      const feature = f.features.find((fe) => fe.feId === br.featureId)!;
      feature.reqs.push(br);
      linked.push(br);
    } else {
      // Feature link is invalid (FE id no longer exists) → treat as unassigned
      // rather than orphan the row in a vanished block.
      br.featureId = null;
      unlinked.push(br);
    }
  }
  return {
    features: f.features,
    businessReqs: unlinked,
    parseError: b.parseError ?? f.parseError,
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

export function renderAcRow(id: string, status: AcStatus, text: string): string {
  return `- ${id} | ${status} | ${text}`;
}

// A feature block exactly as the grammar draws it — appended to features.md
// on POST /features. QA-2: features stamp origin=manual on first write; PATCH
// preserves the existing origin (or stamps manual when the caller explicitly
// sets it). The `## Acceptance Criteria` section is always emitted (even
// when empty) so the block's section anchor exists for AC inserts.
export function renderFeatureBlock(input: {
  feId: string;
  title: string;
  description: string;
  source: string | null;
  priority: ReqPriority;
  status: ReqStatus;
  owner: ReqOwner;
  origin?: 'manual' | 'generated';
  acs: { id: string; status: AcStatus; text: string; origin?: 'manual' | 'generated' }[];
  trs: { id: string; priority: ReqPriority; status: ReqStatus; owner: ReqOwner; text: string; origin?: 'manual' | 'generated' }[];
}): string {
  const lines = [
    `### ${input.feId} — ${input.title}`,
    `<!-- feature: priority=${input.priority} status=${input.status} owner=${input.owner} origin=${input.origin ?? 'manual'} -->`,
  ];
  if (input.source) lines.push(`<!-- source: ${input.source} -->`);
  lines.push(input.description);
  lines.push('', '## Acceptance Criteria');
  for (const ac of input.acs) {
    lines.push(renderAcRow(ac.id, ac.status, ac.text));
    lines.push(`<!-- ${ac.id}: origin=${ac.origin ?? 'manual'} -->`);
  }
  for (const tr of input.trs) {
    lines.push(renderReqRow(tr.id, tr.priority, tr.status, tr.owner, tr.text));
    lines.push(`<!-- ${tr.id}: origin=${tr.origin ?? 'manual'} -->`);
  }
  return lines.join('\n');
}

// ── ID allocation (spec DATA section) ──────────────────────────────────────
// Lowest free number, never renumbered on delete. `prefix` is 'BR' | 'TR' |
// 'US' | 'FE' | 'AC'; ids are zero-padded to 3 (BR/TR/AC) or 2 (US/FE) digits.

export function nextFreeId(existingIds: string[], prefix: 'BR' | 'TR' | 'US' | 'FE' | 'AC'): string {
  const width = prefix === 'US' || prefix === 'FE' ? 2 : 3;
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
  featureTitle: { min: 4, max: 120 },
  description: { min: 4, max: 1000 },
  source: { min: 2, max: 200 },
  acText: { min: 4, max: 500 },
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

export type FeatureInput = {
  title: string;
  description: string;
  source: string | null;
  priority: ReqPriority;
  status: ReqStatus;
  owner: ReqOwner;
};

export function validateFeatureInput(
  body: Record<string, unknown> | undefined,
): { ok: true; value: FeatureInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const title = checkField(errors, 'title', body?.title, LIMITS.featureTitle);
  const description = checkField(errors, 'description', body?.description, LIMITS.description);
  let source: string | null = null;
  if (body?.source !== undefined && body.source !== null) {
    const v = checkField(errors, 'source', body.source, LIMITS.source);
    if (v !== null) source = v;
  }
  const priority = isReqPriority(body?.priority) ? body.priority : null;
  if (!priority) errors.priority = 'Must be must | should | could | wont';
  const status = isReqStatus(body?.status) ? body.status : null;
  if (!status) errors.status = 'Must be one of the 8 canonical statuses';
  const owner = isReqOwner(body?.owner) ? body.owner : null;
  if (!owner) errors.owner = 'Must be BA | SA | DEV | QA';
  if (Object.keys(errors).length > 0 || title === null || description === null || !priority || !status || !owner) {
    return { ok: false, errors };
  }
  return { ok: true, value: { title, description, source, priority, status, owner } };
}

// Partial feature patch — only the fields present in the body are validated.
export type FeaturePatch = Partial<Omit<FeatureInput, 'feId'>>;

export function validateFeaturePatch(
  body: Record<string, unknown> | undefined,
): { ok: true; value: FeaturePatch } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const value: FeaturePatch = {};
  const fields: ['title' | 'description', unknown, { min: number; max: number }][] = [
    ['title', body?.title, LIMITS.featureTitle],
    ['description', body?.description, LIMITS.description],
  ];
  for (const [key, raw, limits] of fields) {
    if (raw === undefined) continue;
    const v = checkField(errors, key, raw, limits);
    if (v !== null) value[key] = v;
  }
  if (body?.source !== undefined) {
    if (body.source === null) value.source = null;
    else {
      const v = checkField(errors, 'source', body.source, LIMITS.source);
      if (v !== null) value.source = v;
    }
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

export type AcInput = {
  text: string;
  status: AcStatus;
};

export function validateAcInput(
  body: Record<string, unknown> | undefined,
): { ok: true; value: AcInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const text = checkField(errors, 'text', body?.text, LIMITS.acText);
  const status = isAcStatus(body?.status) ? body.status : null;
  if (!status) errors.status = 'Must be met | unmet';
  if (Object.keys(errors).length > 0 || text === null || !status) {
    return { ok: false, errors };
  }
  return { ok: true, value: { text, status } };
}

export type AcPatch = Partial<AcInput>;

export function validateAcPatch(
  body: Record<string, unknown> | undefined,
): { ok: true; value: AcPatch } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const value: AcPatch = {};
  if (body?.text !== undefined) {
    const v = checkField(errors, 'text', body.text, LIMITS.acText);
    if (v !== null) value.text = v;
  }
  if (body?.status !== undefined) {
    if (isAcStatus(body.status)) value.status = body.status;
    else errors.status = 'Must be met | unmet';
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
  if (!isReqOwner(body?.owner)) errors.owner = `Must be one of ${REQ_OWNERS.join(' | ')}`;
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
//
// QA-5: each BR row may be followed by a `<!-- BR-NNN: feature=FE-NN -->` meta
// comment (refinement batch item 2.7). The new row pair must land *after*
// the previous row's trailing meta, otherwise the previous row's
// `feature=FE-NN` link detaches and the BR falls into "Unassigned
// requirements" on the next parse. The helper walks forward from the last
// row, skipping blank lines, and returns the meta-comment line index when
// one is present.
export function businessReqInsertIndex(prdLines: string[]): number | null {
  const range = section8Range(prdLines);
  if (!range) return null;
  let lastRow = -1;
  for (let i = range.start + 1; i < range.end; i++) {
    if (REQ_ROW_RE.test(prdLines[i].trim())) lastRow = i;
  }
  if (lastRow !== -1) {
    return markerIndexAfter(prdLines, lastRow, range.end, BR_META_RE);
  }
  for (let i = range.end - 1; i > range.start; i--) {
    if (prdLines[i].trim() !== '') return i;
  }
  return range.start;
}

// Where a new TR row lands inside a feature block: after the block's last
// requirement row (or, after QA-5, after that row's trailing meta comment),
// else after the block's last AC row (or its trailing meta), else right under
// the AC section heading (or the body/meta/heading when the block has no AC
// section yet — new rows belong below the prose, not above it). Skipping the
// trailing meta is essential: without it, the next POST inserts between the
// previous TR and its `<!-- TR-NNN: origin=manual -->` marker, the marker's id
// no longer matches the row above it on re-parse, and the previous TR's
// origin reads as null on disk.
export function featureReqInsertIndex(feature: FeatureRow, lines?: string[]): number {
  const lastReq = feature.reqs[feature.reqs.length - 1];
  if (lastReq) {
    if (lines) {
      return markerIndexAfter(lines, lastReq.lineIndex, Infinity, TR_META_RE, lastReq.id);
    }
    return lastReq.lineIndex;
  }
  const lastAc = feature.acs[feature.acs.length - 1];
  if (lastAc) {
    if (lines) {
      return markerIndexAfter(lines, lastAc.lineIndex, Infinity, AC_META_RE, lastAc.id);
    }
    return lastAc.lineIndex;
  }
  return feature.acHeadingLine ?? feature.bodyLine ?? feature.metaLine ?? feature.headingLine;
}

// Where a new AC row lands inside a feature block: after the block's last AC
// row (or its trailing meta), else right under the AC section heading (or the
// body/meta/heading when the block has no AC section yet — the route creates
// the section when acHeadingLine is null).
export function featureAcInsertIndex(feature: FeatureRow, lines?: string[]): number {
  const lastAc = feature.acs[feature.acs.length - 1];
  if (lastAc) {
    if (lines) {
      return markerIndexAfter(lines, lastAc.lineIndex, Infinity, AC_META_RE, lastAc.id);
    }
    return lastAc.lineIndex;
  }
  return feature.acHeadingLine ?? feature.bodyLine ?? feature.metaLine ?? feature.headingLine;
}

// Scan forward from `after` for the next non-blank line that matches
// `metaRe` (whose capture group 1 matches `expectedId` when supplied).
// Returns that line's index when found, otherwise `after`. Used by the
// two insert helpers above to keep trailing meta comments glued to their
// owning row.
function markerIndexAfter(
  lines: string[],
  after: number,
  limit: number,
  metaRe: RegExp,
  expectedId?: string,
): number {
  for (let j = after + 1; j < Math.min(limit, lines.length); j++) {
    const t = lines[j].trim();
    if (t === '') continue;
    const m = t.match(metaRe);
    if (m && (expectedId === undefined || m[1] === expectedId)) return j;
    break;
  }
  return after;
}

// A feature's ID referenced in another feature's free text (the delete guard's
// reference rule, plan §2): the ID appears as a word in the feature's title,
// description, AC text, or any of its requirement rows' text.
export function featureReferencesId(feature: FeatureRow, reqId: string): boolean {
  if (feature.feId === reqId) return false;
  const haystacks = [
    feature.title,
    feature.description ?? '',
    ...feature.acs.map((a) => a.text),
    ...feature.reqs.map((r) => r.text),
  ];
  return haystacks.some((h) => h.includes(reqId));
}

// ── ID collection for allocation ───────────────────────────────────────────
// nextFreeId allocates from the LIVE rows only (soft-deleted rows' numbers
// are free again — spec DATA: "the next add reuses the lowest free number"),
// but the feature-ID scan must see every heading (a soft-deleted FE-NN block
// still holds its ID's line on disk). These scanners are tolerant: they walk
// raw lines, not parsed rows, so they work on partially-unparseable files.

export function collectExistingIds(
  prd: string,
  journeys: string,
  features: string,
): { br: string[]; tr: string[]; fe: string[]; ac: string[] } {
  const br: string[] = [];
  const tr: string[] = [];
  const fe: string[] = [];
  const ac: string[] = [];
  const rowScan = (text: string) => {
    for (const line of text.split('\n')) {
      const m = line.trim().match(REQ_ROW_RE);
      if (!m) continue;
      (m[1].startsWith('BR-') ? br : tr).push(m[1]);
    }
  };
  rowScan(prd);
  rowScan(journeys);
  rowScan(features);
  for (const line of features.split('\n')) {
    const m = line.trim().match(/^###\s+(FE-\d{2,})/);
    if (m) fe.push(m[1]);
    const am = line.trim().match(AC_ROW_RE);
    if (am) ac.push(am[1]);
    const dm = line.trim().match(AC_DELETED_RE);
    if (dm) ac.push(dm[1]);
  }
  return { br, tr, fe, ac };
}

// ── Live-ID variants for allocation ────────────────────────────────────────
// Convenience over the parse results: the live (non-deleted) IDs only.
export function liveReqIds(parsed: ParseResult): string[] {
  return [
    ...parsed.businessReqs.map((r) => r.id),
    ...parsed.features.flatMap((f) => f.reqs.map((r) => r.id)),
  ];
}

// ── Migration: story blocks → feature blocks (requirements redesign slice 1) ─
//
// Existing projects group BRs/TRs under US-NN story blocks in user-journeys.md.
// The redesign groups them under FE-NN feature blocks in features.md. This
// migration converts a project in place:
//
//   1. Every live US-NN block becomes an FE-NN block in features.md (title
//      preserved, description re-framed from the As-a/I-want-to/So-that
//      sentence, TR rows moved inside, `<!-- source: migrated from US-NN -->`
//      recorded as the idempotency key).
//   2. BR rows in prd.md re-link from `story=US-NN` to `feature=FE-NN`.
//   3. The story blocks in user-journeys.md are soft-deleted (delete marker
//      after the heading, TR rows struck) — the 30-day recovery seam keeps
//      them on disk.
//
// Idempotent: re-running on a partially-migrated project self-heals. The
// US→FE mapping is derived from existing feature blocks' source lines, so a
// crash between the three file writes never double-migrates. The route writes
// features.md → prd.md → journeys.md in that order; every partial state
// (features written, or features+prd written) self-heals on the next run.

// Re-frame a story's As-a/I-want-to/So-that sentence as a feature description
// (requirements redesign §4: "description kept but re-framed: strip 'As a… I
// want to… so that…' framing, keep substance"). Falls back to the title when
// the story has no body sentence.
export function reframeStoryDescription(story: StoryRow): string {
  const { asA, iWantTo, soThat } = story;
  if (asA && iWantTo) {
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const base = `${cap(asA)} can ${iWantTo}`;
    return soThat ? `${base} so that ${soThat}.` : `${base}.`;
  }
  return story.title;
}

// Soft-delete the given live story blocks in user-journeys.md: insert a
// `<!-- deleted … -->` marker directly after each heading and strike the TR
// rows. Everything else (meta comments, prose, unknown content) is preserved.
// Blocks are processed in descending headingLine order so inserted markers
// never shift the indexes of blocks we haven't touched yet; within a block,
// TR rows are struck (descending) before the marker is inserted.
export function softDeleteStories(journeys: string, live: StoryRow[]): string {
  const lines = journeys.split('\n');
  const ordered = [...live].sort((a, b) => b.headingLine - a.headingLine);
  for (const story of ordered) {
    const trs = [...story.reqs].sort((a, b) => b.lineIndex - a.lineIndex);
    for (const tr of trs) {
      lines[tr.lineIndex] = lines[tr.lineIndex].replace(/^(\s*[-*+]\s+)(.*)$/, '$1~~$2~~');
    }
    const marker = `<!-- deleted ${new Date().toISOString().slice(0, 10)} by migration -->`;
    lines.splice(story.headingLine + 1, 0, marker);
  }
  return lines.join('\n');
}

// The migration itself — pure, idempotent, returns null when there is nothing
// to migrate (no live story blocks left in user-journeys.md).
export function migrateStoriesToFeatures(
  prd: string,
  journeys: string,
  features: string,
): { featuresText: string; prdText: string; journeysText: string; migrated: number } | null {
  const live = parseStories(journeys).stories;
  if (live.length === 0) return null;

  // Derive the US→FE mapping from already-migrated feature blocks (the
  // idempotency key), then allocate fresh FE ids for the rest.
  const usToFe = new Map<string, string>();
  const existing = parseFeatures(features).features;
  for (const fe of existing) {
    const m = fe.source?.match(/^migrated from (US-\d{2,})$/);
    if (m) usToFe.set(m[1], fe.feId);
  }
  const usedFe = new Set(existing.map((f) => f.feId));
  const newBlocks: string[] = [];
  for (const story of live) {
    if (usToFe.has(story.usId)) continue; // already migrated — block exists
    const feId = nextFreeId([...usedFe], 'FE');
    usedFe.add(feId);
    usToFe.set(story.usId, feId);
    newBlocks.push(
      renderFeatureBlock({
        feId,
        title: story.title,
        description: reframeStoryDescription(story),
        source: `migrated from ${story.usId}`,
        priority: story.priority ?? 'must',
        status: story.status ?? 'draft',
        owner: story.owner ?? 'BA',
        origin: story.origin ?? 'manual',
        acs: [],
        trs: story.reqs.map((tr) => ({
          id: tr.id,
          priority: tr.priority ?? 'should',
          status: tr.status ?? 'draft',
          owner: tr.owner ?? 'DEV',
          text: tr.text,
          origin: tr.origin ?? 'manual',
        })),
      }),
    );
  }

  const featuresText =
    newBlocks.length > 0
      ? (existing.length > 0 ? features.replace(/\s*$/, '') + '\n\n' : features.replace(/^\s*/, '')) +
        newBlocks.join('\n\n') +
        '\n'
      : features;

  // Re-link BR rows in prd.md: `story=US-NN` → `feature=FE-NN`. Idempotent —
  // no `story=` links remain after the first pass.
  const prdLines = prd.split('\n');
  let prdChanged = false;
  for (let i = 0; i < prdLines.length; i++) {
    const m = prdLines[i].trim().match(BR_META_RE);
    if (!m) continue;
    const sm = m[2].match(/(story=)(US-\d{2,})/);
    if (sm && usToFe.has(sm[2])) {
      prdLines[i] = prdLines[i].replace(sm[0], `feature=${usToFe.get(sm[2])}`);
      prdChanged = true;
    }
  }
  const prdText = prdChanged ? prdLines.join('\n') : prd;

  // Soft-delete the story blocks. Idempotent — parseStories only returns
  // non-deleted blocks, so already-soft-deleted blocks are never re-touched.
  const journeysText = softDeleteStories(journeys, live);

  return { featuresText, prdText, journeysText, migrated: newBlocks.length };
}
