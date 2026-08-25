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

// Default 7-step interview checklist shown in the sidebar. Step 0 ("Project
// folder set") is fixed-done. Steps 1-6 map to the BA Agent's question order
// — see intake.ts §SYSTEM_PROMPT. The client cursor (`currentStepIndex`)
// tracks which step the BA is currently asking about; each user message
// (real answer or skip) advances the cursor.
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

// Index of the first user-driven step (Problem) in buildSteps().
const FIRST_TOPIC_INDEX = 1;

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
  // Cursor pointing at whichever step the BA Agent is currently asking
  // about. Each user message (real or skip) marks the current step done and
  // advances to the next pending one.
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(FIRST_TOPIC_INDEX);
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
        // When the BA emits the final idea fence, any steps still in
        // pending/current state are now captured by the document — collapse
        // them all to done. Skipped steps stay as "skipped" for transparency.
        if (evt.ideaWritten) {
          setSteps((s) =>
            s.map((step) =>
              step.state === 'pending' || step.state === 'current'
                ? { ...step, state: 'done', detail: 'Captured.' }
                : step,
            ),
          );
        }
      }
    },
    [appendAssistantToken],
  );

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
    // Detect a typed "skip" — the user might type "skip", "Skip this one",
    // or "no idea, skip". We mark the current step as skipped and forward
    // a short note to the BA so it logs the skip in the assumptions list.
    const isSkip = /^\s*skip\b/i.test(trimmed);
    const payload = isSkip ? 'Skip — please fill this in yourself.' : trimmed;

    setError(null);
    setDraft('');
    const next = [...messages, { role: 'user' as const, content: payload }];
    setMessages(next);
    setStreaming(true);
    // Optimistically append an empty assistant bubble so tokens land in it.
    setMessages((p) => [...p, { role: 'assistant', content: '' }]);
    advanceStep(isSkip ? 'skipped' : 'done');
    try {
      await streamChat(sessionId, next, handleEvent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed');
      setStreaming(false);
    }
  }

  // Skip button — same effect as typing "skip", but clears any partial draft
  // the user may have typed. We don't forward an empty message (the BA
  // wouldn't have anything to acknowledge), so we just advance the cursor.
  function skip() {
    if (streaming) return;
    // Surface the skip in the chat transcript so the BA and the user can
    // both see it in the conversation log.
    const next = [...messages, { role: 'user' as const, content: 'Skip — please fill this in yourself.' }];
    setMessages(next);
    setDraft('');
    setStreaming(true);
    setMessages((p) => [...p, { role: 'assistant', content: '' }]);
    advanceStep('skipped');
    void streamChat(sessionId, next, handleEvent).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Chat failed');
      setStreaming(false);
    });
  }

  // Mark the step at `currentStepIndex` as `next` (done or skipped), then
  // advance the cursor to the next pending topic.
  function advanceStep(next: 'done' | 'skipped') {
    setSteps((s) => {
      const arr = [...s];
      const at = arr[currentStepIndex];
      if (at && (at.state === 'current' || at.state === 'pending')) {
        arr[currentStepIndex] = {
          ...at,
          state: next,
          detail: next === 'skipped' ? 'Skipped.' : 'Captured.',
        };
      }
      // Promote the next pending step to current.
      const upcoming = arr.findIndex((x, i) => i > currentStepIndex && x.state === 'pending');
      if (upcoming >= 0) {
        arr[upcoming] = { ...arr[upcoming], state: 'current' };
        setCurrentStepIndex(upcoming);
      }
      return arr;
    });
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
            placeholder={streaming ? 'BA Agent is typing…' : 'Reply to the BA Agent (type "skip" to skip this question)…'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={streaming && !doneEvent}
            rows={5}
            aria-label="Reply to the BA Agent"
          />
          <button
            type="button"
            className="btn-skip"
            onClick={skip}
            disabled={streaming || !!(doneEvent && doneEvent.ideaWritten)}
            title="Mark the current question as skipped — BA will fill it in"
          >
            Skip
          </button>
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
