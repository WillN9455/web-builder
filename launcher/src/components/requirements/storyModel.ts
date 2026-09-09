// Client-side helpers for the Requirements tab — filtering, totals, and the
// next-ID preview. Pure, unit-testable. The status machine + vocabularies
// come from server/requirements-model.ts (the shared grammar module) so the
// dropdown can never drift from the server.
//
// Requirements redesign (slices 1-3): features (FE-NN) are the grouping
// containers — stories are a derived artifact owned by the sprint board
// workstream and no longer exist in this tab.

import {
  nextFreeId,
  statusLabel,
  type ReqStatus,
} from '../../../server/requirements-model';
import type {
  RequirementsResponse,
  RequirementItem,
  FeatureItem,
} from '../../lib/api';

// ── Filter state (AC-3) ────────────────────────────────────────────────────

export type TypeFilter = 'all' | 'business' | 'technical';
export type FilterState = {
  type: TypeFilter;
  // Multi-select status chips — empty set = no status filtering.
  statuses: ReqStatus[];
  query: string;
};

export const EMPTY_FILTER: FilterState = { type: 'all', statuses: [], query: '' };

// Which InlineForm is open. One at a time across the whole screen (spec UX).
// - add-req targets a specific feature (the form mounts under its block);
//   edit-req additionally carries the reqId. The feature anchor is what the
//   API path needs (createRequirement is feature-scoped in the URL) and what
//   QA-10's ?feId= disambiguator needs on edit/delete/status mutations.
export type FormState =
  | { mode: 'add'; kind: 'feature' }
  | { mode: 'edit'; kind: 'feature'; feId: string }
  | { mode: 'add'; kind: 'req'; feId: string }
  // Edit-req keeps feId nullable: unassigned BRs (no home feature) are still
  // editable — the ?feId= disambiguator is simply omitted, exactly as the
  // pre-redesign usId-null path worked.
  | { mode: 'edit'; kind: 'req'; reqId: string; feId: string | null }
  | { mode: 'add'; kind: 'ac'; feId: string }
  | { mode: 'edit'; kind: 'ac'; feId: string; acId: string };

// ── Stage-banner totals (LEGEND: re-derived on every render, no statics) ───

export type ReqTotals = {
  features: number;
  acs: number;
  business: number;
  technical: number;
  blocked: number;
  total: number;
};

// Blocked = features OR requirements currently in blocked/returned (LEGEND).
// ACs have no blocked state (met/unmet only) so they don't contribute.
export function deriveTotals(data: RequirementsResponse): ReqTotals {
  const isBlocked = (st: ReqStatus | null) => st === 'blocked' || st === 'returned';
  let acs = 0;
  let business = 0;
  let technical = 0;
  let blocked = data.features.filter((f) => isBlocked(f.status)).length;
  for (const f of data.features) {
    acs += f.acs.length;
    for (const r of f.reqs) {
      if (r.type === 'BR') business += 1;
      else technical += 1;
      if (isBlocked(r.status)) blocked += 1;
    }
  }
  business += data.businessReqs.length;
  for (const r of data.businessReqs) {
    if (isBlocked(r.status)) blocked += 1;
  }
  const total = data.features.length + acs + business + technical;
  return { features: data.features.length, acs, business, technical, blocked, total };
}

// ── Filtering (client-side over the parsed list — plan §0b) ────────────────

function reqMatchesQuery(req: RequirementItem, q: string): boolean {
  return req.text.toLowerCase().includes(q) || req.id.toLowerCase().includes(q);
}

function acMatchesQuery(text: string, id: string, q: string): boolean {
  return text.toLowerCase().includes(q) || id.toLowerCase().includes(q);
}

export function applyFilters(
  data: RequirementsResponse,
  filter: FilterState,
): { features: FeatureItem[]; businessReqs: RequirementItem[] } {
  const q = filter.query.trim().toLowerCase();
  const statusSet = new Set(filter.statuses);
  const typeFor = (t: 'BR' | 'TR') =>
    filter.type === 'all' || (filter.type === 'business' ? t === 'BR' : t === 'TR');
  const statusFor = (st: ReqStatus | null) => statusSet.size === 0 || (st !== null && statusSet.has(st));

  const businessReqs = data.businessReqs.filter(
    (r) => typeFor('BR') && statusFor(r.status) && (!q || reqMatchesQuery(r, q)),
  );
  const features = data.features
    .map((feature) => {
      // QA-12 carries over: each row's own type decides inclusion — a
      // feature block can hold both BRs and TRs, and the Technical filter
      // must hide the BRs without hiding the TRs in the same block.
      const rows = feature.reqs.filter(
        (r) => typeFor(r.type) && statusFor(r.status) && (!q || reqMatchesQuery(r, q)),
      );
      // ACs respond to search text only — they have no type or status
      // vocabulary the chips filter on (met/unmet is not a ReqStatus).
      const acs =
        q || filter.statuses.length > 0
          ? feature.acs.filter((a) => acMatchesQuery(a.text, a.id, q))
          : feature.acs;
      // The feature itself matches search on its own text; status chips
      // apply to the feature itself (it has a ReqStatus) but not its type
      // (it has none).
      const selfMatch =
        (!q ||
          [feature.title, feature.description, feature.feId]
            .filter(Boolean)
            .some((t) => (t as string).toLowerCase().includes(q))) &&
        (q || statusSet.size === 0 || (feature.status !== null && statusSet.has(feature.status)));
      // When only the AC list matches (search typed, no row matches), keep
      // the block visible with its ACs so the hit isn't invisible.
      if (!selfMatch && rows.length === 0) {
        if (q && acs.length > 0) return { ...feature, acs, reqs: rows };
        return null;
      }
      return { ...feature, acs, reqs: rows };
    })
    .filter((f): f is FeatureItem => f !== null);
  return { features, businessReqs };
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

export function nextFeatureIdPreview(features: { feId: string }[]): string {
  return nextFreeId(features.map((f) => f.feId), 'FE');
}

// QA-10 carry-over: per-feature ID preview. Add-req forms mount under a
// specific feature's block, so BR pools scope to that feature's linked BRs
// and TR pools to that feature's TRs. (Unassigned BRs keep the global
// unassigned pool — they aren't created from inside a feature block.)
export function nextReqIdPreview(
  type: 'BR' | 'TR',
  data: RequirementsResponse,
  feId: string,
): string {
  const feature = data.features.find((f) => f.feId === feId);
  const ids = feature
    ? feature.reqs.filter((r) => r.type === type).map((r) => r.id)
    : [];
  return nextFreeId(ids, type);
}