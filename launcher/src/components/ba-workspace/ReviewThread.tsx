// Inline review thread (State C) — ported from background.html #s14's
// `.review-thread` block. Shown beneath the document when the selected file
// is In Review (SA); interleaves SA + BA comments with a Compose box.
import { useState } from 'react';
import type { BaComment } from '../../lib/api';

type ReviewThreadProps = {
  filename: string;
  comments: BaComment[];
  busy: boolean;
  onReply: (body: string) => void;
};

export function ReviewThread({ filename, comments, busy, onReply }: ReviewThreadProps) {
  const [draft, setDraft] = useState('');
  const last = comments.at(-1);

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    onReply(body);
    setDraft('');
  };

  return (
    <div className="review-thread">
      <div className="thread-head">
        Review thread · {filename}
        <span className="who">
          {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
          {last ? ` · last reply ${last.created_at}` : ''}
        </span>
      </div>

      {comments.map((c) => (
        <div className={`comment ${c.author.toLowerCase()}`} key={c.id}>
          <div className="av-sm" aria-hidden="true">
            {c.author}
          </div>
          <div className="body">
            <div className="who">
              {c.author === 'SA' ? 'Solution Architect' : 'BA'} <span>{c.created_at}</span>
            </div>
            <p>{c.body}</p>
          </div>
        </div>
      ))}
      {comments.length === 0 && (
        <div className="comment">
          <div className="body" style={{ color: 'var(--ink-2)' }}>
            No comments yet — reply to the SA below.
          </div>
        </div>
      )}

      <div className="compose">
        <div className="av-sm ba-compose-av" aria-hidden="true">
          BA
        </div>
        <textarea
          aria-label={`Reply on ${filename}`}
          placeholder={`Reply to the SA on ${filename}… (markdown supported)`}
          rows={1}
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          className="btn btn-primary btn-pill"
          disabled={busy || !draft.trim()}
          onClick={submit}
        >
          Reply
        </button>
      </div>
    </div>
  );
}