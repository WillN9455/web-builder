// Pure splice logic for BA auto-generated rows — no fs, no Ollama, no db.
//
// The generation job (agent-invoker.ts) parses model output into the row
// inputs below, then this module inserts them into the canonical surfaces —
// story blocks (with their TR rows) appended to user-journeys.md, BR rows
// inserted into prd.md §8 — using the exact renderers and insert-index
// helpers the manual CRUD routes use (requirements-model.ts). Content outside
// the inserted scopes is byte-identical to the input: that is the AC-9 bar,
// and scripts/verify-requirements.ts exercises this module directly to prove
// it.
//
// Generated rows are traceable and mechanically cleanable via the existing
// origin vocabulary: every generated block/row stamps `origin=generated` in
// its meta comment — the same marker the UI already renders as the
// "generated" origin tag. No new marker format is introduced.
//
// IDs are allocated HERE, never by the model — nextFreeId continues the
// on-disk sequence, so the model's text can never collide with an existing
// US/BR/TR id.

import {
  businessReqInsertIndex,
  collectExistingIds,
  insertAfter,
  isReqPriority,
  nextFreeId,
  parseStories,
  renderReqRow,
  renderStoryBlock,
} from './requirements-model.js';

// ── The generation sections (the job's progress units) ─────────────────────
// One Ollama call per section, run in order. Single source of truth for the
// progress total — the status route and the job both read this length.
// (Lives here, in the pure module, so reconcileSectionsDone can name the
// sections without a circular import back into agent-invoker.ts.)

export const REQ_GEN_SECTIONS = ['user stories', 'business requirements'] as const;

export type ReqGenSection = (typeof REQ_GEN_SECTIONS)[number];

export const STORIES_SECTION: ReqGenSection = 'user stories';
export const BUSINESS_SECTION: ReqGenSection = 'business requirements';

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
 * The same read rehydrates the generated story ids (in generation order) so
 * a BR-only retry can still link its BRs to the stories a previous run
 * inserted.
 */
export function reconcileSectionsDone(
  journeys: string,
  prd: string,
  marked: string[],
): { sectionsDone: string[]; storyIds: string[] } {
  const sectionsDone = new Set<string>(marked);
  let storyIds: string[] = [];
  const HAS_MARK = /origin=generated/;
  if (HAS_MARK.test(journeys)) {
    storyIds = parseStories(journeys)
      .stories.filter((s) => s.origin === 'generated')
      .map((s) => s.usId);
    sectionsDone.add(STORIES_SECTION);
  } else {
    sectionsDone.delete(STORIES_SECTION);
  }
  if (HAS_MARK.test(prd)) {
    sectionsDone.add(BUSINESS_SECTION);
  } else {
    sectionsDone.delete(BUSINESS_SECTION);
  }
  return { sectionsDone: [...sectionsDone], storyIds };
}

export type GenStory = {
  title: string;
  asA: string;
  iWantTo: string;
  soThat: string;
  // Raw model output — cleaned via cleanPriority at render time.
  priority: unknown;
  trs: { text: string; priority: unknown }[];
};

export type GenBr = {
  text: string;
  priority: unknown;
  /** 0-based index into the stories generated in the same run — BRs link to a story via the BR meta comment. */
  storyIndex: number | null;
};

import type { ReqPriority } from './requirements-model.js';

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
 * Append generated story blocks (each with its TR rows inside the block) to
 * user-journeys.md. Appending is the same write surface as POST /stories —
 * existing blocks are untouched, byte for byte.
 *
 * Returns the spliced file text plus the allocated US ids (in generation
 * order) and the TR row count, for the job's progress + result counts.
 */
export function spliceStories(
  journeys: string,
  stories: GenStory[],
): { text: string; usIds: string[]; trCount: number } {
  const lines = journeys.split('\n');
  const usIds: string[] = [];
  let trCount = 0;

  for (const story of stories) {
    const usId = nextFreeId(collectExistingIds('', lines.join('\n')).us, 'US');
    const block: string[] = renderStoryBlock({
      usId,
      title: cleanRowText(story.title, 120),
      asA: cleanRowText(story.asA, 200),
      iWantTo: cleanRowText(story.iWantTo, 200),
      soThat: cleanRowText(story.soThat, 200),
      priority: cleanPriority(story.priority),
      status: 'draft',
      owner: 'BA',
      origin: 'generated',
    }).split('\n');

    for (const tr of story.trs) {
      const text = cleanRowText(tr.text, 300);
      if (!text) continue; // a bare ID with no text isn't a row (parser skips it)
      const trId = nextFreeId(collectExistingIds('', lines.join('\n')).tr, 'TR');
      block.push(
        renderReqRow(trId, cleanPriority(tr.priority), 'draft', 'BA', text),
        `<!-- ${trId}: origin=generated -->`,
      );
      trCount++;
    }

    // Same trailing-blank padding as POST /stories, then the block.
    if (lines.length === 0 || lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(...block);
    usIds.push(usId);
  }

  return { text: lines.join('\n'), usIds, trCount };
}

/**
 * Insert generated BR rows (each followed by its meta comment) into prd.md
 * §8 at businessReqInsertIndex — after the last existing row's trailing
 * meta, per QA-5. The index is recomputed per insert because each row pair
 * shifts the lines below it.
 *
 * Returns the spliced file text plus the allocated BR ids (in generation
 * order). Requires storyIds from the same run's spliceStories for
 * `<!-- BR-NNN: story=US-NN, origin=generated -->` links.
 */
export function spliceBusinessReqs(
  prd: string,
  brs: GenBr[],
  storyIds: string[],
): { text: string; brIds: string[] } {
  let lines = prd.split('\n');
  const brIds: string[] = [];

  for (const br of brs) {
    const text = cleanRowText(br.text, 300);
    if (!text) continue;
    const index = businessReqInsertIndex(lines);
    if (index === null) break; // no §8 section to write into — caller reports the failure

    const brId = nextFreeId(collectExistingIds(lines.join('\n'), '').br, 'BR');
    const storyId =
      br.storyIndex !== null && br.storyIndex >= 0 && br.storyIndex < storyIds.length
        ? storyIds[br.storyIndex]
        : null;
    const meta = storyId
      ? `<!-- ${brId}: story=${storyId}, origin=generated -->`
      : `<!-- ${brId}: origin=generated -->`;
    lines = insertAfter(lines, index, [renderReqRow(brId, cleanPriority(br.priority), 'draft', 'BA', text), meta]);
    brIds.push(brId);
  }

  return { text: lines.join('\n'), brIds };
}

// A section whose model call yields zero parseable rows must FAIL the section,
// not advance silently (PR #26 round 4: a silent zero-row 'done' corrupts
// resume — retry skips the section as already done and nothing lands). The job
// wraps both callModelStories and callModelBusinessReqs with this; the thrown
// error lands in the section's catch, which persists the failed state and
// lets Retry regenerate only this section.
export function requireRows<T>(rows: T[], section: string): T[] {
  if (rows.length === 0) {
    throw new Error(`Model returned no ${section} rows — the section failed; retry will generate only this section.`);
  }
  return rows;
}
