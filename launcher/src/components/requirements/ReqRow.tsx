// One requirement row — the mockup's `.req` grid listitem (64px 1fr 86px
// 64px 130px 50px + hover-revealed actions). Metadata-less legacy rows show
// "—" for priority/status/owner (plan §2). Status changes are optimistic
// server-side; the parent passes `statusPending` to flag the flip in flight.
//
// The edit form slot (refinement batch item 2.8) renders right under this
// row, not at a shared "business requirements" slot — so each row owns its
// own edit affordance.

import { statusLabel, type ReqStatus } from '../../../server/requirements-model';
import type { RequirementItem } from '../../lib/api';
import { StatusDropdown } from './StatusDropdown';

type Props = {
  req: RequirementItem;
  statusPending?: boolean; // optimistic status flip in flight → "Saving…" badge
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (next: ReqStatus) => void;
  // When set, render the InlineForm directly under this row (edit-req slot
  // is per-row, not per-group).
  editFormNode?: React.ReactNode;
};

const PRIO_LABELS: Record<string, string> = {
  must: 'Must',
  should: 'Should',
  could: 'Could',
  wont: "Won't",
};

export function ReqRow({ req, statusPending, onEdit, onDelete, onStatusChange, editFormNode }: Props) {
  // QA-2: every req row carries an origin dot — null renders as 'manual'
  // (the §5 resolution Will approved), so legacy rows with no marker still
  // surface the tag. The dot is purely presentational and screen-readable
  // (aria-label differentiates manual/generated).
  const effectiveOrigin: 'manual' | 'generated' = req.origin ?? 'manual';
  return (
    <>
      <div className={`req ${statusPending ? 'req-pending' : ''}`} role="listitem">
        <span className="req-id">
          {req.id}
          <span
            className={`req-origin-dot req-origin-${effectiveOrigin}`}
            title={
              effectiveOrigin === 'generated'
                ? `${req.id} was written by a code/design agent`
                : `${req.id} was written by the BA`
            }
            aria-label={effectiveOrigin === 'generated' ? 'Auto-generated' : 'Manually written'}
          />
        </span>
        <span className="req-text">{req.text}</span>
        <span className={`req-type ${req.type === 'BR' ? 'type-br' : 'type-tr'}`}>
          {req.type === 'BR' ? 'Business' : 'Technical'}
        </span>
        <span className={`req-prio ${req.priority ? `prio-${req.priority}` : ''}`}>
          {req.priority ? PRIO_LABELS[req.priority] : '—'}
        </span>
        <StatusDropdown
          status={req.status}
          label={`${req.id} status, currently ${statusLabel(req.status ?? 'draft')}`}
          groupAriaLabel={`Change status for ${req.id}`}
          disabled={statusPending}
          onSelect={onStatusChange}
        />
        <span className="req-owner">{req.owner ?? '—'}</span>
        <div className="req-actions">
          <button className="req-action" type="button" aria-label={`Edit ${req.id}`} title="Edit" onClick={onEdit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16z M14 6l4 4"/></svg>
          </button>
          <button className="req-action danger" type="button" aria-label={`Delete ${req.id}`} title="Delete" onClick={onDelete}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13"/></svg>
          </button>
        </div>
      </div>
      {editFormNode}
    </>
  );
}