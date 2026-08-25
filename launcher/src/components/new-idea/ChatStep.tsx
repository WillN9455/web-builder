import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { streamChat, type ChatDoneEvent, type ChatEvent, type ChatMessage } from '../../lib/api';
import { InterviewProgress, type InterviewStep } from './InterviewProgress';

type Props = {
  sessionId: string;
  projectDir: string;
  onChangeFolder: () => void;
  onCaptured: (done: ChatDoneEvent) => void;
  onCancel: () => void;
  // Deep-link out of the chat to the project record once one exists. The
  // parent owns the navigation; we only pass the slug through.
  onOpenProject: (slug: string | undefined) => void;
};

const BA_OPENER =
  "Hey! Tell me about the idea you'd like to build — what problem are you trying to solve, and who's feeling it?";

// Default 7-step interview checklist shown in the sidebar. The first 3
// flip to "done" once a project row has been created and the BA Agent has
// greeted + asked clarifying questions.
function buildSteps(): InterviewStep[] {
  return [
    { label: 'Project folder set', detail: 'Workspace pinned.', state: 'done' },
    { label: 'Problem', detail: 'Describe the pain point.', state: 'current' },
    { label: 'Users & scale', detail: 'Who feels this most?', state: 'pending' },
    { label: 'MVP scope', detail: 'Smallest shippable version.', state: 'pending' },
    { label: 'Business rules', detail: 'Permissions, automations.', state: 'pending' },
    { label: 'Brand & design', detail: 'Style, references.', state: 'pending' },
    { label: 'Tech stack', detail: 'Optional — we can recommend.', state: 'pending' },
  ];
}

// Screen 8 — BA-Agent chat. Streams tokens as they arrive, lets the user
// reply, and when the server emits the `idea` fence in the final reply it
// advances the parent to the captured step.
export function ChatStep({ sessionId, projectDir, onChangeFolder, onCaptured, onCancel, onOpenProject }: Props) {
  // Seed the BA opener locally — we don't call /api/chat on mount because the
  // server requires a non-empty `messages` array (otherwise the user sees the
  // "Body must include a non-empty messages array" error before they've typed
  // anything). The first request to /api/chat fires only after the user has
  // submitted their first reply.
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: BA_OPENER },
  ]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneEvent, setDoneEvent] = useState<ChatDoneEvent | null>(null);
  const [steps, setSteps] = useState<InterviewStep[]>(buildSteps);
  // The slug of the project row that the server created on the first BA
  // reply (Task 2.1). Once set, the header shows an "Open project →" link
  // so the user can leave the chat and come back to the (still-in-progress)
  // project any time.
  const [projectSlug, setProjectSlug] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Helper: append a token to the last assistant message (or create one).
  const appendAssistantToken = useCallback((token: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant') {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: last.content + token };
        return updated;
      }
      return [...prev, { role: 'assistant', content: token }];
    });
  }, []);

  const handleEvent = useCallback(
    (evt: ChatEvent) => {
      if (evt.type === 'token') {
        appendAssistantToken(evt.content);
      } else if (evt.type === 'error') {
        setError(evt.message);
        setStreaming(false);
      } else if (evt.type === 'done') {
        setDoneEvent(evt);
        setStreaming(false);
        // Capture the slug of the project row that the server created on
        // the first BA reply. The header link uses this to deep-link back
        // into the project.
        if (evt.projectSlug) setProjectSlug(evt.projectSlug);
        // Promote the interview steps: once idea.md is on disk and a
        // project row exists, the BA has enough to mark the early steps
        // as captured. This is purely visual.
        if (evt.ideaWritten) {
          setSteps((s) => {
            const next = [...s];
            if (next[1]) next[1] = { ...next[1], state: 'done', detail: 'Captured.' };
            if (next[2]) next[2] = { ...next[2], state: 'done', detail: 'Captured.' };
            if (next[3]) next[3] = { ...next[3], state: 'current' };
            return next;
          });
        }
      }
    },
    [appendAssistantToken],
  );

  // Kick off the first assistant greeting when the chat mounts.
  // (Removed: we now seed the opener locally to avoid the server-side
  // "Body must include a non-empty messages array" error appearing
  // before the user has typed anything. The first /api/chat call fires
  // from `send()` once the user has entered text and clicked Send.)

  // Once the stream completes and we have a captured result, advance the parent.
  useEffect(() => {
    if (doneEvent?.ideaWritten) {
      onCaptured(doneEvent);
    }
  }, [doneEvent, onCaptured]);

  // Auto-scroll the chat body to the bottom on new tokens.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setError(null);
    setDraft('');
    const next = [...messages, { role: 'user' as const, content: trimmed }];
    setMessages(next);
    setStreaming(true);
    // Optimistically append an empty assistant bubble so tokens land in it.
    setMessages((p) => [...p, { role: 'assistant', content: '' }]);
    try {
      await streamChat(sessionId, next, handleEvent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed');
      setStreaming(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    }
  }

  return (
    <div className="chat-grid" style={{ padding: '26px 36px 40px' }}>
      <section className="chat" aria-label="BA Agent interview">
        <header className="chat-head">
          <button type="button" className="back" onClick={onChangeFolder}>
            ← Change folder
          </button>
          <span className="sep" aria-hidden>/</span>
          <span className="crumb">
            Project · <b>{projectDir}</b>
          </span>
          {projectSlug && !doneEvent?.ideaWritten && (
            <button
              type="button"
              className="btn-link"
              style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600 }}
              onClick={() => onOpenProject(projectSlug)}
            >
              Open project →
            </button>
          )}
          <div className="ba-meta">
            <div className="av" aria-hidden>BA</div>
            <div className="meta">
              <b>BA Agent</b>
              <br />
              <span>{streaming ? 'Thinking…' : 'Online'}</span>
            </div>
          </div>
        </header>

        {error && (
          <div className="chat-error" role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5 M12 16h.01" />
            </svg>
            <div>{error}</div>
          </div>
        )}

        <div className="chat-body" ref={bodyRef}>
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className="av-sm" aria-hidden>
                {m.role === 'assistant' ? 'BA' : 'WN'}
              </div>
              <div className="bubble">
                {m.content.split('\n').map((line, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    {line}
                  </span>
                ))}
                {m.role === 'assistant' && streaming && i === messages.length - 1 && m.content === '' && (
                  <span className="typing-dots" aria-hidden>
                    <span /> <span /> <span />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="chat-foot">
          <textarea
            className="ta"
            placeholder={streaming ? 'BA Agent is typing…' : 'Reply to the BA Agent…'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={streaming && !doneEvent}
            rows={5}
            aria-label="Reply to the BA Agent"
          />
          <button
            className="btn btn-primary"
            onClick={() => void send(draft)}
            disabled={!draft.trim() || streaming}
          >
            Send
          </button>
        </div>
      </section>

      <InterviewProgress steps={steps} doneCount={steps.filter((s) => s.state === 'done').length} />

      <button type="button" className="btn-link chat-back-link" onClick={onCancel}>
        ← All projects
      </button>
    </div>
  );
}
