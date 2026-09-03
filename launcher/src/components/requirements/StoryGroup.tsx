// A user-story group — the mockup's `.story` block: head (ID, title, sentence,
// story-level actions incl. status dropdown + Add requirement) followed by the
// story's `.req-list`. The InlineForm slot (add req / edit story / edit req)
// renders right under the head, per the mockup's "expanded below" pattern.

import { statusLabel, type ReqStatus } from '../../../server/requirements-model';
import type { RequirementItem, StoryItem } from '../../lib/api';
import { ReqRow } from './ReqRow';
import { StatusDropdown } from './StatusDropdown';
import type { FormState } from './storyModel';

type Props = {
  story: StoryItem;
  openForm: FormState | null; // form slot renders only when it targets this group
  renderForm?: () => React.ReactNode;
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
  // Story groups host edit-story / add-req / edit-req forms. The add-story
  // form lives at the top level of the screen (under the add bar).
  const showForm =
    openForm != null &&
    ((openForm.kind === 'story' && openForm.mode === 'edit' && openForm.usId === story.usId) ||
      (openForm.kind === 'req' && openForm.usId === story.usId));

  return (
    <div className={`story ${flash ? 'story-flash' : ''}`} id={`story-${story.usId}`}>
      <div className="story-head">
        <div className="story-id">{story.usId}</div>
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
          {story.reqs.map((req) => (
            <ReqRow
              key={req.id}
              req={req}
              statusPending={statusPendingReqId === req.id}
              onEdit={() => onReqEdit(req)}
              onDelete={() => onReqDelete(req)}
              onStatusChange={(next) => onReqStatus(req, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}