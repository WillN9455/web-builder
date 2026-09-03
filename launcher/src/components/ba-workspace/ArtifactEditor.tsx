// Document editor (right pane) — ported from background.html #s12/#s13/#s14's
// `.ba-doc` block. Sitemap locked decision 9: always a BA monospace textarea,
// no View/Edit mode toggle. The body is read-only only when the file is
// In Review (SA) (implied by state) — and stays read-only once Approved.
// The footer is status-aware per AC-5.
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
}: ArtifactEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Screen 13→12 handoff: when a file opens (and its body has loaded), focus
  // moves into the editor — unless the file is read-only (In Review /
  // Approved), where focusing a read-only field would be noise.
  useEffect(() => {
    if (!file || bodyLoading) return;
    if (file.status === 'in_review' || file.status === 'approved') return;
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

  const readOnly = file.status === 'in_review' || file.status === 'approved';

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
      ) : readOnly && file.status === 'in_review' ? (
        // State C — rendered markdown (screen 14 shows headings/tables/
        // blockquote SA markup, not monospace). No View/Edit toggle: this is
        // the review state's read-only body, not a separate tab.
        <div className="ba-doc-body view" role="document" aria-label={`${file.title} (read-only)`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
        </div>
      ) : (
        // States A/B — always the editable BA monospace textarea (locked
        // decision 9). Approved files render read-only in the same textarea.
        <div className={`ba-doc-body edit${readOnly ? ' view' : ''}`}>
          <textarea
            ref={textareaRef}
            className="ba-edit"
            spellCheck={false}
            aria-label={`${file.title} contents`}
            value={value}
            readOnly={readOnly}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )}

      <div className="ba-doc-foot">
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
          <div className="left">
            <b>Approved</b> — this artifact is locked. Re-review starts by returning it from the SA.
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