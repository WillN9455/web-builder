// A feature group — the redesign's replacement for the story block (plan §6).
// Reuses the mockup's `.story` block vocabulary: head (FE-NN id pill, origin
// chip, title, description, source link, actions incl. status dropdown +
// Add requirement + Add criterion) followed by the feature's `.req-list`
// holding ACs first, then linked BRs and TRs. Per plan §8 slices 1-3 the ACs
// and requirements live INSIDE the feature block; user stories are a derived
// artifact owned by the sprint board workstream.
//
// CSS note: verify:css-equivalence pins the compiled stylesheet against the
// pre-split baseline, so this component intentionally reuses only existing
// classes (.story/.req/.add-form vocabulary) — no new selectors.

import { Fragment } from 'react';
import { statusLabel, type ReqStatus } from '../../../server/requirements-model';
import type { RequirementItem, FeatureItem, AcItem } from '../../lib/api';
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
  // Per-row edit slot for AC rows (edit-ac) — same pattern as editFormFor,
  // mapped by acId.
  editFormForAc?: (acId: string) => React.ReactNode | null;
  flash?: boolean; // scroll-and-flash target (delete-guard "Open referencing feature")
  statusPendingFeature?: boolean;
  statusPendingReqId?: string | null;
  acPendingId?: string | null; // AC row whose status toggle is in flight
  onEditFeature: () => void;
  onAddReq: () => void;
  onAddAc: () => void;
  onDeleteFeature: () => void;
  onFeatureStatus: (next: ReqStatus) => void;
  onReqEdit: (req: RequirementItem) => void;
  onReqDelete: (req: RequirementItem) => void;
  onReqStatus: (req: RequirementItem, next: ReqStatus) => void;
  onAcEdit: (ac: AcItem) => void;
  onAcDelete: (ac: AcItem) => void;
  onAcStatus: (ac: AcItem, next: 'met' | 'unmet') => void;
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
  editFormForAc,
  flash,
  statusPendingFeature,
  statusPendingReqId,
  acPendingId,
  onEditFeature,
  onAddReq,
  onAddAc,
  onDeleteFeature,
  onFeatureStatus,
  onReqEdit,
  onReqDelete,
  onReqStatus,
  onAcEdit,
  onAcDelete,
  onAcStatus,
}: Props) {
  // Feature-level forms only: edit-feature and add-req/add-ac. Edit-req and
  // edit-ac moved to per-row slots below. The add-feature form lives at the
  // top level of the screen.
  const showForm =
    openForm != null &&
    ((openForm.kind === 'feature' &&
      openForm.mode === 'edit' &&
      openForm.feId === feature.feId) ||
      ((openForm.kind === 'req' || openForm.kind === 'ac') &&
        openForm.mode === 'add' &&
        openForm.feId === feature.feId) ||
      // Edit-ac slots at the feature level too — the form node itself is
      // rendered under the matching AC row below, but the mount/discard
      // decision (one form open at a time) is made here.
      (openForm.kind === 'ac' &&
        openForm.mode === 'edit' &&
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
            <button className="btn btn-ghost" type="button" aria-label={`Add an acceptance criterion to ${feature.feId}`} onClick={onAddAc}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14 M5 12h14"/></svg>
              Add criterion
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
            {feature.reqs.length} reqs · {feature.acs.length} ACs
          </span>
        </div>
      </div>
      {showForm && renderForm?.()}
      {(feature.acs.length > 0 || feature.reqs.length > 0) && (
        <div className="req-list" role="list">
          {/* ACs first (they gate the feature), then the QA-9 linked-req sort:
              BRs before TRs, stable within group. Disk order is untouched —
              the move is purely a render-side decision. */}
          {feature.acs.map((ac) => {
            const pending = acPendingId === ac.id;
            const editAcFormNode =
              openForm != null &&
              openForm.kind === 'ac' &&
              openForm.mode === 'edit' &&
              openForm.feId === feature.feId &&
              openForm.acId === ac.id
                ? editFormForAc?.(ac.id) ?? null
                : null;
            return (
              <Fragment key={ac.id}>
              <div className={`req ${pending ? 'req-pending' : ''}`} role="listitem">
                <div className="req-id">
                  <span>{ac.id}</span>
                  {(() => {
                    const o = ac.origin ?? 'manual';
                    return (
                      <span
                        className={`req-origin-chip req-origin-${o}`}
                        title={`${ac.id} was written by the ${o === 'generated' ? 'agent' : 'BA'}`}
                      >
                        <span className="req-origin-dot" aria-hidden="true" />
                        {o === 'generated' ? 'Generated' : 'Manual'}
                      </span>
                    );
                  })()}
                </div>
                <div className="req-text">{ac.text}</div>
                <div className="req-type">AC</div>
                <div className="req-prio" aria-hidden="true" />
                {/* met/unmet is not a ReqStatus (no blocked/draft machine) —
                    it renders as plain text and toggles via the action. */}
                <div className="req-owner">{ac.status === 'met' ? 'Met' : 'Unmet'}</div>
                <div className="req-actions">
                  <button
                    className="req-action"
                    type="button"
                    aria-label={`Edit acceptance criterion ${ac.id}`}
                    title="Edit criterion"
                    onClick={() => onAcEdit(ac)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16z M14 6l4 4"/></svg>
                  </button>
                  <button
                    className="req-action"
                    type="button"
                    aria-label={`${ac.status === 'met' ? 'Mark unmet' : 'Mark met'} — ${ac.id}`}
                    title={ac.status === 'met' ? 'Mark unmet' : 'Mark met'}
                    onClick={() => onAcStatus(ac, ac.status === 'met' ? 'unmet' : 'met')}
                  >
                    {ac.status === 'met' ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18 M7 14l4-5 3 3 5-7"/></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
                    )}
                  </button>
                  <button
                    className="req-action danger"
                    type="button"
                    aria-label={`Delete acceptance criterion ${ac.id}`}
                    title="Delete criterion"
                    onClick={() => onAcDelete(ac)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13"/></svg>
                  </button>
                </div>
              </div>
              {editAcFormNode}
              </Fragment>
            );
          })}
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