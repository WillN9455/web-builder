// A feature group — the redesign's replacement for the story block (plan §6).
// Reuses the mockup's `.story` block vocabulary: head (FE-NN id pill, origin
// chip, title, description, source link, actions incl. status dropdown +
// Add requirement + Add criterion) followed by the feature's `.req-list`
// holding linked BRs and TRs. Per plan §8 slices 1-3 requirements live INSIDE
// the feature block; per decision 6r features carry NO acceptance criteria —
// ACs are authored on each generated user story (Run 2, sprint board
// workstream).
//
// CSS note: verify:css-equivalence pins the compiled stylesheet against the
// pre-split baseline, so this component intentionally reuses only existing
// classes (.story/.req/.add-form vocabulary) — no new selectors.

import { statusLabel, type ReqStatus } from '../../../server/requirements-model';
import type { RequirementItem, FeatureItem } from '../../lib/api';
import { ReqRow } from './ReqRow';
import { StatusDropdown } from './StatusDropdown';
import type { FormState } from './storyModel';

type Props = {
  feature: FeatureItem;
  openForm: FormState | null; // feature-level form slot renders only when it targets this group
  renderForm?: () => React.ReactNode;
  // Per-row edit slot (edit-req). Maps reqId → form node; null/undefined
  // means no form under that row.
  editFormFor?: (reqId: string) => React.ReactNode | null;
  flash?: boolean; // scroll-and-flash target (delete-guard "Open referencing feature")
  statusPendingFeature?: boolean;
  statusPendingReqId?: string | null;
  onEditFeature: () => void;
  onAddReq: () => void;
  onDeleteFeature: () => void;
  onFeatureStatus: (next: ReqStatus) => void;
  onReqEdit: (req: RequirementItem) => void;
  onReqDelete: (req: RequirementItem) => void;
  onReqStatus: (req: RequirementItem, next: ReqStatus) => void;
};

const PRIORITY_LABELS: Record<string, string> = {
  must: 'Must',
  should: 'Should',
  could: 'Could',
  wont: "Won't",
};

export function FeatureGroup({
  feature,
  openForm,
  renderForm,
  editFormFor,
  flash,
  statusPendingFeature,
  statusPendingReqId,
  onEditFeature,
  onAddReq,
  onDeleteFeature,
  onFeatureStatus,
  onReqEdit,
  onReqDelete,
  onReqStatus,
}: Props) {
  // Feature-level forms only: edit-feature and add-req. Edit-req moved to
  // per-row slots below. The add-feature form lives at the top level of the
  // screen. (Decision 6r: no AC forms — features carry no acceptance
  // criteria; ACs belong to generated user stories.)
  const showForm =
    openForm != null &&
    ((openForm.kind === 'feature' &&
      openForm.mode === 'edit' &&
      openForm.feId === feature.feId) ||
      (openForm.kind === 'req' &&
        openForm.mode === 'add' &&
        openForm.feId === feature.feId));

  // QA-2: features carry their own origin tag; null renders as manual
  // (same null→manual rule as req rows).
  const effectiveOrigin: 'manual' | 'generated' = feature.origin ?? 'manual';

  return (
    <div className={`story ${flash ? 'story-flash' : ''}`} id={`feature-${feature.feId}`}>
      <div className="story-head">
        {/* QA-15: the origin chip renders as a SIBLING of the id pill, not
            inside it — same rule the story block followed. */}
        <div className="story-head-id">
          <div className="story-id">{feature.feId}</div>
          <span
            className={`req-origin-chip req-origin-${effectiveOrigin}`}
            title={
              effectiveOrigin === 'generated'
                ? `${feature.feId} was written by a code/design agent`
                : `${feature.feId} was written by the BA`
            }
            aria-label={effectiveOrigin === 'generated' ? 'Auto-generated' : 'Manually written'}
          >
            <span className="req-origin-dot" aria-hidden="true" />
            {effectiveOrigin === 'generated' ? 'Generated' : 'Manual'}
          </span>
        </div>
        <div className="story-body">
          <div className="story-title">{feature.title || 'Untitled feature'}</div>
          {feature.description && <div className="story-as">{feature.description}</div>}
          {feature.source && (
            <div className="story-as">
              <b>Source:</b> <code>{feature.source}</code>
            </div>
          )}
          <div className="story-as">
            {feature.priority && (
              <span className={`req-prio prio-${feature.priority}`}>{PRIORITY_LABELS[feature.priority] ?? feature.priority}</span>
            )}
            {feature.owner && (
              <>
                {' '}· owner <b>{feature.owner}</b>
              </>
            )}
          </div>
          <div className="story-actions">
            <button className="btn btn-soft" type="button" aria-label={`Edit feature ${feature.feId}`} onClick={onEditFeature}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16z M14 6l4 4"/></svg>
              Edit feature
            </button>
            <button className="btn btn-ghost" type="button" aria-label={`Add a requirement to ${feature.feId}`} onClick={onAddReq}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14 M5 12h14"/></svg>
              Add requirement
            </button>
            <StatusDropdown
              status={feature.status}
              label={`${feature.feId} feature status, currently ${statusLabel(feature.status ?? 'draft')}`}
              groupAriaLabel={`Change feature status for ${feature.feId}`}
              disabled={statusPendingFeature}
              onSelect={onFeatureStatus}
            />
            <button className="btn btn-soft story-delete" type="button" aria-label={`Delete feature ${feature.feId}`} title="Delete feature" onClick={onDeleteFeature}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13"/></svg>
            </button>
          </div>
        </div>
        <div className="story-meta">
          <span className="story-count">
            {feature.reqs.length} reqs
          </span>
        </div>
      </div>
      {showForm && renderForm?.()}
      {feature.reqs.length > 0 && (
        <div className="req-list" role="list">
          {/* QA-9 linked-req sort: BRs before TRs, stable within group. Disk
              order is untouched — the move is purely a render-side decision.
              (Decision 6r: no AC rows here — those render on user-story
              blocks in the sprint board workstream.) */}
          {[...feature.reqs]
            .sort((a, b) => (a.type === b.type ? 0 : a.type === 'BR' ? -1 : 1))
            .map((req) => (
              <ReqRow
                key={req.id}
                req={req}
                statusPending={statusPendingReqId === req.id}
                onEdit={() => onReqEdit(req)}
                onDelete={() => onReqDelete(req)}
                onStatusChange={(next) => onReqStatus(req, next)}
                editFormNode={editFormFor?.(req.id) ?? null}
              />
            ))}
        </div>
      )}
    </div>
  );
}