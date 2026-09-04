// Client-side helpers for the Requirements tab — filtering, totals, and the
// next-ID preview. Pure, unit-testable. The status machine + vocabularies
// come from server/requirements-model.ts (the shared grammar module) so the
// dropdown can never drift from the server.

import {
  nextFreeId,
  statusLabel,
  type ReqStatus,
} from '../../../server/requirements-model';
import type { RequirementsResponse, RequirementItem, StoryItem } from '../../lib/api';

// ── Filter state (AC-3) ────────────────────────────────────────────────────

export type TypeFilter = 'all' | 'business' | 'technical';
export type FilterState = {
  type: TypeFilter;
  // Multi-select status chips — empty set = no status filtering.
  statuses: ReqStatus[];
  query: string;
};

export const EMPTY_FILTER: FilterState = { type: 'all', statuses: [], query: '' };

// Which InlineForm is open. One at a time across the whole screen (spec UX);
// `usId: null` for BR rows (they live in prd.md §8, not inside a story).
export type FormState =
  | { mode: 'add'; kind: 'story' }
  | { mode: 'edit'; kind: 'story'; usId: string }
  | { mode: 'add'; kind: 'req'; usId: string }
  | { mode: 'edit'; kind: 'req'; reqId: string; usId: string | null };

// ── Stage-banner totals (LEGEND: re-derived on every render, no statics) ───

export type ReqTotals = { business: number; technical: number; blocked: number; total: number };

// Blocked = requirements OR stories currently in blocked/returned (LEGEND).
export function deriveTotals(data: RequirementsResponse): ReqTotals {
  const business = data.businessReqs.length;
  const technical = data.stories.reduce((n, s) => n + s.reqs.length, 0);
  const isBlocked = (st: ReqStatus | null) => st === 'blocked' || st === 'returned';
  const blocked =
    data.businessReqs.filter((r) => isBlocked(r.status)).length +
    data.stories.reduce((n, s) => n + (s.reqs.filter((r) => isBlocked(r.status)).length + (isBlocked(s.status) ? 1 : 0)), 0);
  return { business, technical, blocked, total: business + technical };
}

// ── Filtering (client-side over the parsed list — plan §0b) ────────────────

function reqMatchesQuery(req: RequirementItem, q: string): boolean {
  return req.text.toLowerCase().includes(q) || req.id.toLowerCase().includes(q);
}

export function applyFilters(
  data: RequirementsResponse,
  filter: FilterState,
): { businessReqs: RequirementItem[]; stories: StoryItem[] } {
  const q = filter.query.trim().toLowerCase();
  const statusSet = new Set(filter.statuses);
  const typeFor = (t: 'BR' | 'TR') =>
    filter.type === 'all' || (filter.type === 'business' ? t === 'BR' : t === 'TR');
  const statusFor = (st: ReqStatus | null) => statusSet.size === 0 || (st !== null && statusSet.has(st));

  const businessReqs = data.businessReqs.filter(
    (r) => typeFor('BR') && statusFor(r.status) && (!q || reqMatchesQuery(r, q)),
  );
  const stories = data.stories
    .map((story) => {
      // QA-12: each row's own type decides inclusion — a story can hold both
      // BRs (linked from prd.md §8) and TRs, and the Technical filter must
      // hide the linked BRs without hiding the TRs in the same block.
      const rows = story.reqs.filter(
        (r) => typeFor(r.type) && statusFor(r.status) && (!q || reqMatchesQuery(r, q)),
      );
      // The story itself matches search on its own text; status/type chips
      // apply to rows only (a story has no type of its own).
      const selfMatch =
        (!q ||
          [story.title, story.asA, story.iWantTo, story.soThat, story.usId]
            .filter(Boolean)
            .some((t) => (t as string).toLowerCase().includes(q))) &&
        (q || statusSet.size === 0 || (story.status !== null && statusSet.has(story.status)));
      if (!selfMatch && rows.length === 0) return null;
      return { ...story, reqs: rows };
    })
    .filter((s): s is StoryItem => s !== null);
  return { businessReqs, stories };
}

// ── Status → mockup dot class ──────────────────────────────────────────────
// The mockup's `.file-status` vocabulary (draft/review/returned/approved) is
// extended with on_hold/cancelled dots in app.css; blocked and returned share
// the rose dot per the mockup.

export function statusDotClass(status: ReqStatus | null): string {
  switch (status) {
    case 'draft': return 'draft';
    case 'in_review': return 'review';
    case 'approved':
    case 'done': return 'approved';
    case 'blocked':
    case 'returned': return 'returned';
    case 'on_hold': return 'on_hold';
    case 'cancelled': return 'cancelled';
    default: return 'draft';
  }
}

export { statusLabel };

// ── Next-ID preview for the InlineForm's form-id line ──────────────────────
// Same allocator as the server, run against the client's live copy — the
// preview is advisory only; the server re-derives the real ID on write.

export function nextStoryIdPreview(stories: { usId: string }[]): string {
  return nextFreeId(stories.map((s) => s.usId), 'US');
}

export function nextReqIdPreview(type: 'BR' | 'TR', data: RequirementsResponse): string {
  const existing = [
    ...data.businessReqs.map((r) => r.id),
    ...data.stories.flatMap((s) => s.reqs.map((r) => r.id)),
  ].filter((id) => id.startsWith(type));
  return nextFreeId(existing, type);
}