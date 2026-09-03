// Document editor (right pane) — ported from background.html #s12/#s13/#s14's
// `.ba-doc` block.
//
// View/edit toggle (plan §9.5 AC-30 — reverses the §9.4 deferral of locked
// decision 9): Draft/Returned open on the rendered markdown read view; Edit
// switches to the BA monospace textarea (Discard / Save changes). Send for SA
// review appears only in the read view AND only once an edit has been saved
// (`editedSinceSend` — server-tracked on ba_artifacts_status, so it survives a
// reload; the transition endpoint enforces the same rule). In Review (s14),
// Approved (AC-27 + Set back to Draft), and idea.md (AC-22) stay read-only.
// The footer is status-aware per AC-5; the clean footer stacks its buttons
// below the text per AC-28.
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { BaFile } from '../../lib/api';

type ArtifactEditorProps = {
  file: BaFile | null;
  // Saved body while loading; the live textarea value otherwise.
  bodyLoading: boolean;
  value: string;
  dirty: boolean;
  saving: boolean;
  // AC-30 — the screen's view/edit mode. Only meaningful for Draft/Returned;
  // every other state renders the read view regardless.
  editing: boolean;
  commentCount: number;
  onChange: (value: string) => void;
  onDiscard: () => void;
  // Enter the edit view from the read view (Draft/Returned only).
  onEdit: () => void;
  onSave: () => void;
  onSend: () => void;
  onReturn: () => void;
  onApprove: () => void;
  // Approved → Draft (AC-27). The screen owns the ConfirmDialog.
  onSetBack: () => void;
};

const PILL_CLASS: Record<BaFile['status'], string> = {
  draft: 'pill draft',
  in_review: 'pill review',
  returned: 'pill blocked',
  approved: 'pill done',
};

const STATUS_LABEL: Record<BaFile['status'], string> = {
  draft: 'Draft',
  in_review: 'In Review',
  returned: 'Returned',
  approved: 'Approved',
};

export function ArtifactEditor({
  file,
  bodyLoading,
  value,
  dirty,
  saving,
  editing,
  commentCount,
  onChange,
  onDiscard,
  onEdit,
  onSave,
  onSend,
  onReturn,
  onApprove,
  onSetBack,
}: ArtifactEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Screen 13→12 handoff: focus moves into the textarea when the edit view
  // opens — never on the initial file open (that lands on the read view) and
  // never for locked files, where focusing a read-only field would be noise.
  // (Declared before the early return below — hooks cannot be conditional.)
  const isEditingCalc = !file?.readOnly && (editing || dirty) && (file?.status === 'draft' || file?.status === 'returned');
  useEffect(() => {
    if (!file || bodyLoading || !isEditingCalc) return;
    textareaRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditingCalc, file?.filename, bodyLoading]);

  if (!file) {
    return (
      <div className="ba-doc" aria-live="polite">
        <div className="ba-doc-empty">
          <h3>No artifact selected</h3>
          <p>Pick a file from the PRD artifacts tree to read or edit it.</p>
        </div>
      </div>
    );
  }

  const isIdea = file.readOnly === true;
  const locked = file.status === 'in_review' || file.status === 'approved' || isIdea;
  // AC-30 — only Draft/Returned have an edit view, and only while the screen
  // is in edit mode. dirty implies the textarea already ran (edits exist), so
  // it keeps the editor open even if the mode flag were stale.
  const isEditing = isEditingCalc;
  // AC-28 — the clean (not-dirty) Draft/Returned footer stacks: text on top,
  // buttons underneath. The dirty footer keeps Discard/Save side-by-side.
  // The locked-state footers keep their row layout (they read as status bars,
  // not action rows).
  const footClean = !locked && !isEditing && !dirty;

  return (
    <div className="ba-doc">
      <div className="ba-doc-head">
        <div>
          <div className="crumbs">
            Project Background / · <b>{file.filename}</b>
            <span className={`pill ${PILL_CLASS[file.status]}`} style={{ padding: '2px 8px', fontSize: '10.5px' }}>
              <span className="dot" aria-hidden="true" /> {STATUS_LABEL[file.status]}
            </span>
          </div>
          <div className="title">{file.title}</div>
        </div>
        <div className="meta">
          {dirty ? (
            <span style={{ color: 'var(--coral)', fontWeight: 600 }}>● Unsaved changes</span>
          ) : file.status === 'in_review' && commentCount > 0 ? (
            <span>
              {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
            </span>
          ) : null}
        </div>
      </div>

      {bodyLoading ? (
        <div className="ba-doc-body" aria-busy="true">
          <div className="skeleton" style={{ height: 24, width: '40%' }} />
          <div className="skeleton" style={{ height: 14 }} />
          <div className="skeleton" style={{ height: 14, width: '92%' }} />
          <div className="skeleton" style={{ height: 14, width: '78%' }} />
          <div className="skeleton" style={{ height: 14, width: '85%' }} />
        </div>
      ) : isEditing ? (
        // AC-30 edit view — the BA monospace textarea. Entered via Edit;
        // Discard/Save exit back to the read view (where Send lives).
        <div className="ba-doc-body edit">
          <textarea
            ref={textareaRef}
            className="ba-edit"
            spellCheck={false}
            aria-label={`${file.title} contents (editing)`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      ) : (
        // Rendered markdown read view — the default for every state: Draft/
        // Returned preview (AC-30), In Review (s14: headings/tables/blockquote
        // SA markup, not monospace), Approved (AC-27), and idea.md (AC-22
        // reference).
        <div className="ba-doc-body view" role="document" aria-label={`${file.title} (read-only)`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
        </div>
      )}

      <div className={`ba-doc-foot${footClean ? ' clean' : ''}`}>
        {file.status === 'in_review' ? (
          <>
            <div className="left">
              Read-only preview of the SA review state — the full editor unlocks once you{' '}
              <b>Return to BA</b>.
            </div>
            <div className="right">
              <button
                type="button"
                className="btn btn-soft btn-pill"
                style={{ background: 'var(--blush)', color: 'var(--ink)' }}
                onClick={onReturn}
              >
                Return to BA
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: 'var(--green)' }}
                onClick={onApprove}
              >
                Approve ✓
              </button>
            </div>
          </>
        ) : file.status === 'approved' ? (
          // AC-27 — approved is no longer terminal: the read view keeps the
          // file locked for edits (PUT 409s), but the BA can set it back to
          // Draft to re-open it (the screen confirms first). Un-approving
          // after the State D confirm trips the existing warning banner.
          <>
            <div className="left">
              <b>Approved</b> — this artifact is locked for editing until it is set back to Draft.
            </div>
            <div className="right">
              <button
                type="button"
                className="btn btn-soft btn-pill"
                style={{ background: 'var(--blush)', color: 'var(--ink)' }}
                onClick={onSetBack}
              >
                Set back to Draft
              </button>
            </div>
          </>
        ) : isIdea ? (
          // AC-22 — reference material from intake; outside the review loop.
          <div className="left">
            <b>Project idea</b> — reference material from intake. It is not one of the 17 artifacts
            and has no review lifecycle.
          </div>
        ) : isEditing ? (
          // AC-30 edit view — Discard / Save only. Send lives in the read
          // view so a half-typed draft can't be shipped to review.
          <>
            <div className="left">
              <b>Editing</b> — save to keep the changes on disk; Send reappears on the read view.
            </div>
            <div className="right">
              <button type="button" className="btn btn-ghost btn-pill" onClick={onDiscard}>
                Discard
              </button>
              <button type="button" className="btn btn-soft btn-pill" disabled={saving} onClick={onSave}>
                Save changes
              </button>
            </div>
          </>
        ) : file.status === 'returned' ? (
          // AC-30 — Returned read view: edit to rework; the save itself moves
          // the file back to Draft (the state machine's Returned ──▶ Draft
          // edge) and unlocks Send there.
          <>
            <div className="left">
              <b>Returned</b> by the SA — <b>Edit</b> to rework it; saving moves it back to Draft
              and unlocks Send.
            </div>
            <div className="right">
              <button type="button" className="btn btn-soft btn-pill" onClick={onEdit}>
                Edit
              </button>
            </div>
          </>
        ) : file.editedSinceSend ? (
          // AC-30 — the edit-complete gate has fired: Send is available (read
          // view only, per the plan).
          <>
            <div className="left">Not yet sent for SA review — sending only this file.</div>
            <div className="right">
              <button type="button" className="btn btn-soft btn-pill" onClick={onEdit}>
                Edit
              </button>
              <button type="button" className="btn btn-primary" onClick={onSend}>
                Send for SA review →
              </button>
            </div>
          </>
        ) : (
          // AC-30 — never-edited draft: no Send. Every document gets at least
          // one BA edit-save before it can go to review (the on-record
          // consequence Will confirmed via the plan).
          <>
            <div className="left">
              <b>Preview</b> — send unlocks after you edit and save this document once.
            </div>
            <div className="right">
              <button type="button" className="btn btn-soft btn-pill" onClick={onEdit}>
                Edit
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}