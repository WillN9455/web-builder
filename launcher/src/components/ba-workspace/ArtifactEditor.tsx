// Document editor (right pane) — ported from background.html #s12/#s13/#s14's
// `.ba-doc` block. Sitemap locked decision 9: always a BA monospace textarea,
// no View/Edit mode toggle for Draft/Returned (AC-23 deferred — plan §9.4).
// Read-only rendered views: In Review (SA, s14), Approved (AC-27 — plus the
// Set back to Draft action), and idea.md (AC-22, reference material).
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
  commentCount: number;
  onChange: (value: string) => void;
  onDiscard: () => void;
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
  commentCount,
  onChange,
  onDiscard,
  onSave,
  onSend,
  onReturn,
  onApprove,
  onSetBack,
}: ArtifactEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Screen 13→12 handoff: when a file opens (and its body has loaded), focus
  // moves into the editor — unless the file is read-only (In Review /
  // Approved / idea.md), where focusing a read-only field would be noise.
  useEffect(() => {
    if (!file || bodyLoading) return;
    if (file.readOnly || file.status === 'in_review' || file.status === 'approved') return;
    textareaRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.filename, bodyLoading]);

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
  const readOnly = file.status === 'in_review' || file.status === 'approved' || isIdea;
  // AC-28 — the clean (not-dirty) draft footer stacks: text on top, buttons
  // underneath. The dirty footer keeps Discard/Save/Send side-by-side.
  const footClean = !readOnly && !dirty;

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
      ) : readOnly ? (
        // Rendered markdown — In Review (s14: headings/tables/blockquote SA
        // markup, not monospace), Approved (AC-27), and idea.md (AC-22
        // reference). No View/Edit toggle for Draft/Returned (locked
        // decision 9 — AC-23 deferred, plan §9.4): this is the read-only
        // body of a locked state, not a separate tab.
        <div className="ba-doc-body view" role="document" aria-label={`${file.title} (read-only)`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
        </div>
      ) : (
        // States A/B — always the editable BA monospace textarea (locked
        // decision 9).
        <div className="ba-doc-body edit">
          <textarea
            ref={textareaRef}
            className="ba-edit"
            spellCheck={false}
            aria-label={`${file.title} contents`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
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
        ) : dirty ? (
          <>
            <div className="left">Save keeps the edits on disk; sending reviews only this file.</div>
            <div className="right">
              <button type="button" className="btn btn-ghost btn-pill" onClick={onDiscard}>
                Discard
              </button>
              <button type="button" className="btn btn-soft btn-pill" disabled={saving} onClick={onSave}>
                Save changes
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={onSend}
              >
                Send for SA review →
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="left">Not yet sent for SA review — sending only this file.</div>
            <div className="right">
              <button type="button" className="btn btn-soft btn-pill" disabled={saving} onClick={onSave}>
                Save changes
              </button>
              <button type="button" className="btn btn-primary" onClick={onSend}>
                Send for review →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}