// A user-story group — the mockup's `.story` block: head (ID, title, sentence,
// story-level actions incl. status dropdown + Add requirement) followed by the
// story's `.req-list`. The story-level InlineForm slot (edit story / add req)
// renders right under the head. Per-row edit forms (refinement batch item
// 2.8) render directly under their ReqRow — not at a shared group slot.

import { statusLabel, type ReqStatus } from '../../../server/requirements-model';
import type { RequirementItem, StoryItem } from '../../lib/api';
import { ReqRow } from './ReqRow';
import { StatusDropdown } from './StatusDropdown';
import type { FormState } from './storyModel';

type Props = {
  story: StoryItem;
  openForm: FormState | null; // story-level form slot renders only when it targets this group
  renderForm?: () => React.ReactNode;
  // Per-row edit slot (edit-req). Maps reqId → form node; null/undefined
  // means no form under that row.
  editFormFor?: (reqId: string) => React.ReactNode | null;
  flash?: boolean; // scroll-and-flash target (delete-guard "Open referencing story")
  statusPendingStory?: boolean;
  statusPendingReqId?: string | null;
  onEditStory: () => void;
  onAddReq: () => void;
  onDeleteStory: () => void;
  onStoryStatus: (next: ReqStatus) => void;
  onReqEdit: (req: RequirementItem) => void;
  onReqDelete: (req: RequirementItem) => void;
  onReqStatus: (req: RequirementItem, next: ReqStatus) => void;
};

export function StoryGroup({
  story,
  openForm,
  renderForm,
  editFormFor,
  flash,
  statusPendingStory,
  statusPendingReqId,
  onEditStory,
  onAddReq,
  onDeleteStory,
  onStoryStatus,
  onReqEdit,
  onReqDelete,
  onReqStatus,
}: Props) {
  // Story-level forms only: edit-story and add-req. Edit-req moved to per-row
  // slots below. The add-story form lives at the top level of the screen.
  const showForm =
    openForm != null &&
    ((openForm.kind === 'story' && openForm.mode === 'edit' && openForm.usId === story.usId) ||
      (openForm.kind === 'req' && openForm.mode === 'add' && openForm.usId === story.usId));

  // QA-2: stories carry their own origin tag; null renders as manual
  // (same null→manual rule as req rows).
  const effectiveOrigin: 'manual' | 'generated' = story.origin ?? 'manual';

  return (
    <div className={`story ${flash ? 'story-flash' : ''}`} id={`story-${story.usId}`}>
      <div className="story-head">
        <div className="story-id">
          {story.usId}
          <span
            className={`req-origin-dot req-origin-${effectiveOrigin}`}
            title={
              effectiveOrigin === 'generated'
                ? `${story.usId} was written by a code/design agent`
                : `${story.usId} was written by the BA`
            }
            aria-label={effectiveOrigin === 'generated' ? 'Auto-generated' : 'Manually written'}
          />
        </div>
        <div className="story-body">
          <div className="story-title">{story.title || 'Untitled story'}</div>
          {story.asA && (
            <div className="story-as">
              <b>As a</b> {story.asA}, <b>I want to</b> {story.iWantTo}, <b>so that</b> {story.soThat}.
            </div>
          )}
          <div className="story-actions">
            <button className="btn btn-soft" type="button" aria-label={`Edit user story ${story.usId}`} onClick={onEditStory}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16z M14 6l4 4"/></svg>
              Edit story
            </button>
            <button className="btn btn-ghost" type="button" aria-label={`Add a requirement to ${story.usId}`} onClick={onAddReq}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14 M5 12h14"/></svg>
              Add requirement
            </button>
            <StatusDropdown
              status={story.status}
              label={`${story.usId} story status, currently ${statusLabel(story.status ?? 'draft')}`}
              groupAriaLabel={`Change story status for ${story.usId}`}
              disabled={statusPendingStory}
              onSelect={onStoryStatus}
            />
            <button className="btn btn-soft story-delete" type="button" aria-label={`Delete user story ${story.usId}`} title="Delete story" onClick={onDeleteStory}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13"/></svg>
            </button>
          </div>
        </div>
        <div className="story-meta">
          <span className="story-count">{story.reqs.length} reqs</span>
        </div>
      </div>
      {showForm && renderForm?.()}
      {story.reqs.length > 0 && (
        <div className="req-list" role="list">
          {/* QA-9: render linked BRs first, then TRs, preserving within-group
              file order (Array.prototype.sort is stable). Disk order is
              untouched — the move is purely a render-side decision. */}
          {[...story.reqs]
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