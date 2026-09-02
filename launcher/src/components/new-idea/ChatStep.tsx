import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  streamChat,
  type ChatDoneEvent,
  type ChatEvent,
  type ChatMessage,
  type OutstandingQuestion,
} from '../../lib/api';
import { InterviewProgress, type InterviewStep } from './InterviewProgress';
import { OutstandingQuestions } from './OutstandingQuestions';

type Props = {
  sessionId: string;
  projectDir: string;
  onChangeFolder: () => void;
  onCaptured: (done: ChatDoneEvent) => void;
  onCancel: () => void;
  // Deep-link out of the chat to the project record once one exists. The
  // parent owns the navigation; we only pass the slug through.
  onOpenProject: (slug: string | undefined) => void;
  // Resume mode — when provided, seed the chat with the previously persisted
  // transcript and topic-progress state instead of the BA opener. NewIdeaScreen
  // passes these in from the /api/projects/:id/resume response.
  initialMessages?: ChatMessage[];
  initialSteps?: InterviewStep[];
  initialCurrentStepIndex?: number;
  // Outstanding-questions panel state restored from the resume response, plus
  // the BA-provided summaries for already-completed topics (keyed by topic
  // index — see ChatTopicEvent.summary).
  initialOutstandingQuestions?: OutstandingQuestion[];
  initialTopicSummaries?: Record<number, string>;
  // Conversation caps from the server (intake.ts via /api/init or /resume).
  // `warnThreshold` is the message count at which we start nudging the user
  // to wrap up; `maxMessages` is the hard cap the server rejects beyond.
  maxMessages: number;
  warnThreshold: number;
};

const BA_OPENER =
  "Hey! Tell me about the idea you'd like to build — what problem are you trying to solve, and who's feeling it?";

// Default 9-step interview checklist shown in the sidebar. Step 0 ("Project
// folder set") is fixed-done. Steps 1-8 mirror the BA Agent's question order
// — see intake.ts §SYSTEM_PROMPT. The cursor (`currentStepIndex`) tracks
// the topic the BA is currently asking about; the BA tells us it has moved
// on by emitting `::topic=N::` (parsed server-side into a `topic` NDJSON
// event), at which point we promote step N to current. The client never
// advances the cursor on its own — only when the BA signals a transition.
function buildSteps(projectDir?: string): InterviewStep[] {
  return [
    // Screen 8 (#s8): the first step's detail shows the project folder path.
    { label: 'Project folder set', detail: projectDir ?? 'Workspace pinned.', state: 'done' },
    { label: 'Problem', detail: 'Describe the pain point.', state: 'current' },
    { label: 'Users & scale', detail: 'Who feels this most?', state: 'pending' },
    { label: 'MVP scope', detail: 'Smallest shippable version.', state: 'pending' },
    { label: 'Business rules', detail: 'Permissions, automations.', state: 'pending' },
    { label: 'Compliance', detail: 'GDPR / PCI / HIPAA / none.', state: 'pending' },
    { label: 'Brand & design', detail: 'Style, references.', state: 'pending' },
    { label: 'Tech stack', detail: 'Optional — we can recommend.', state: 'pending' },
    { label: 'Timeline & constraints', detail: 'Launch, budget, risks.', state: 'pending' },
  ];
}

// Index of the first user-driven step (Problem) in buildSteps().
const FIRST_TOPIC_INDEX = 1;
// Last user-driven step (Timeline & constraints). The cap protects against
// future BA prompt edits that add a 9th topic — the sidebar just stops
// promoting past this point rather than going blank.
const LAST_TOPIC_INDEX = 8;

// Tiny inline renderer for the chat bubble. Handles the two pieces of
// markdown the BA actually emits: **bold** and line breaks. We intentionally
// keep the surface small — full markdown (lists, links, code blocks) isn't
// worth the dependency for an interview transcript, and a permissive parser
// is an XSS vector when the user pastes raw HTML.
//
// Output shape per line: alternating string + <strong> nodes. We use the
// captured-key index on each segment so React doesn't reuse DOM nodes
// when a line is re-rendered mid-stream.
function renderBubble(content: string): ReactNode {
  const lines = content.split('\n');
  return lines.map((line, lineIdx) => {
    const nodes: React.ReactNode[] = [];
    // Regex matches **…** (non-greedy, no nested **). When the BA (or
    // a user-pasted snippet) leaves an unbalanced **, the trailing half
    // is rendered as literal text so we never silently swallow a chunk.
    const BOLD_RE = /\*\*([^*]+)\*\*/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let segIdx = 0;
    while ((match = BOLD_RE.exec(line)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(<span key={`t${lineIdx}-${segIdx++}`}>{line.slice(lastIndex, match.index)}</span>);
      }
      nodes.push(<strong key={`b${lineIdx}-${segIdx++}`}>{match[1]}</strong>);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) {
      nodes.push(<span key={`t${lineIdx}-${segIdx++}`}>{line.slice(lastIndex)}</span>);
    }
    return (
      <span key={lineIdx}>
        {lineIdx > 0 && <br />}
        {nodes.length > 0 ? nodes : line}
      </span>
    );
  });
}

// Screen 8 — BA-Agent chat. Streams tokens as they arrive, lets the user
// reply, and when the server emits the `idea` fence in the final reply it
// advances the parent to the captured step.
export function ChatStep({
  sessionId,
  projectDir,
  onChangeFolder,
  onCaptured,
  onCancel,
  onOpenProject,
  initialMessages,
  initialSteps,
  initialCurrentStepIndex,
  initialOutstandingQuestions,
  initialTopicSummaries,
  maxMessages,
  warnThreshold,
}: Props) {
  // Seed the BA opener locally — we don't call /api/chat on mount because the
  // server requires a non-empty `messages` array (otherwise the user sees the
  // "Body must include a non-empty messages array" error before they've typed
  // anything). The first request to /api/chat fires only after the user has
  // submitted their first reply.
  //
  // Resume mode (`initialMessages` set) replaces the opener with the persisted
  // transcript — the server already re-created the IntakeSession, so the next
  // /api/chat will pick up exactly where the user left off.
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages && initialMessages.length > 0
      ? initialMessages
      : [{ role: 'assistant', content: BA_OPENER }],
  );
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneEvent, setDoneEvent] = useState<ChatDoneEvent | null>(null);
  // Completed-topic details: resume mode seeds the BA-provided summaries so
  // the sidebar shows the same details the live session built up.
  const [steps, setSteps] = useState<InterviewStep[]>(() => {
    const base = initialSteps ?? buildSteps(projectDir);
    if (!initialTopicSummaries) return base;
    return base.map((step, i) =>
      initialTopicSummaries[i] && step.state === 'done'
        ? { ...step, detail: initialTopicSummaries[i] }
        : step,
    );
  });
  // Outstanding questions logged by the BA (::oq-add:: / ::oq-resolve::).
  // Live state comes from the server's oq_add / oq_resolve NDJSON events;
  // resume mode seeds it from the transcript-derived list.
  const [outstandingQuestions, setOutstandingQuestions] = useState<OutstandingQuestion[]>(
    initialOutstandingQuestions ?? [],
  );
  // The slug of the project row that the server created on the first BA
  // reply (Task 2.1). Once set, the header shows an "Open project →" link
  // so the user can leave the chat and come back to the (still-in-progress)
  // project any time.
  const [projectSlug, setProjectSlug] = useState<string | null>(null);
  // The current cursor tracks which step the BA is asking about. Kept in
  // state so the sidebar can re-render at the right moment and so we can
  // surface `data-step-index` on the rail for debugging.
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(
    initialCurrentStepIndex ?? FIRST_TOPIC_INDEX,
  );
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Defensive client-side filter for the BA sentinels. The server is
  // supposed to strip ::topic=N:: / ::topic=N::summary:: / ::oq-add::{…}:: /
  // ::oq-resolve::ID:: from the token stream before forwarding it, but if a
  // stale build or a corner case ever leaks one through, we hide it here
  // rather than showing the user raw sentinel text mid-sentence.
  // Mirrors TOPIC_SENTINEL_RE in server/intake.ts: the bare form and the
  // extended-summary form are separate branches; a real summary stays on the
  // marker's line and must end it — otherwise `::topic=1::` followed by prose
  // + `::oq-add…` would misparse as a summary and eat the oq sentinel's
  // opener.
  const TOPIC_RE_CLIENT = /::\s*topic\s*=\s*\d+\s*(?:::[^\S\n]*[^:\n]{1,140}[^\S\n]*::(?=\s|$)|::)/gi;
  const OQ_RE_CLIENT = /::\s*oq-(?:add\s*::\s*\{[\s\S]*?|resolve\s*::\s*[A-Za-z0-9_-]{1,32})\s*::/gi;
  const sanitiseToken = (raw: string): string =>
    raw.replace(TOPIC_RE_CLIENT, '').replace(OQ_RE_CLIENT, '');

  // Helper: append a token to the last assistant message (or create one).
  const appendAssistantToken = useCallback((token: string) => {
    const clean = sanitiseToken(token);
    if (!clean) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant') {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: last.content + clean };
        return updated;
      }
      return [...prev, { role: 'assistant', content: clean }];
    });
  }, []);

  const handleEvent = useCallback(
    (evt: ChatEvent) => {
      if (evt.type === 'token') {
        appendAssistantToken(evt.content);
      } else if (evt.type === 'error') {
        setError(evt.message);
        setStreaming(false);
      } else if (evt.type === 'topic') {
        // The BA has signalled it's now asking about topic `evt.index`
        // (1-based). Promote the previous current step to done and turn the
        // target step current. The BA may have multiple follow-up rounds on
        // a single topic before this event fires — that's exactly why we
        // wait for the marker instead of advancing on every user reply.
        // `summary` (when present) becomes the just-completed step's detail.
        advanceToTopic(evt.index, 'done', evt.summary);
      } else if (evt.type === 'oq_add') {
        // The BA logged a deferred blocking question — surface it in the
        // side-rail panel. Dedupe by id (the server already did the same).
        setOutstandingQuestions((prev) =>
          prev.some((q) => q.id === evt.question.id) ? prev : [...prev, evt.question],
        );
      } else if (evt.type === 'oq_resolve') {
        setOutstandingQuestions((prev) => prev.filter((q) => q.id !== evt.id));
      } else if (evt.type === 'done') {
        setDoneEvent(evt);
        setStreaming(false);
        // Capture the slug of the project row that the server created on
        // the first BA reply. The header link uses this to deep-link back
        // into the project.
        if (evt.projectSlug) setProjectSlug(evt.projectSlug);
        // Final reconciliation: if the done event carries a currentTopic
        // we didn't see live (e.g. a quick succession of `topic` events
        // was collapsed), snap the cursor to it.
        if (typeof evt.currentTopic === 'number' && evt.currentTopic > 0) {
          advanceToTopic(evt.currentTopic, 'done');
        }
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
    // or "no idea, skip". We rewrite it to a short marker so the BA logs
    // the skip in the assumptions list. The sidebar only advances when the
    // BA confirms the skip by emitting its own `::topic=N::` marker.
    const isSkip = /^\s*skip\b/i.test(trimmed);
    const payload = isSkip ? 'Skip — please fill this in yourself.' : trimmed;

    setError(null);
    setDraft('');
    const next = [...messages, { role: 'user' as const, content: payload }];
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

  // Skip button — same effect as typing "skip", but clears any partial draft
  // the user may have typed. We don't forward an empty message (the BA
  // wouldn't have anything to acknowledge), so the user sees a "Skip" line
  // in the transcript and the BA's reply handles the transition marker.
  function skip() {
    if (streaming) return;
    // Surface the skip in the chat transcript so the BA and the user can
    // both see it in the conversation log.
    const next = [...messages, { role: 'user' as const, content: 'Skip — please fill this in yourself.' }];
    setMessages(next);
    setDraft('');
    setStreaming(true);
    setMessages((p) => [...p, { role: 'assistant', content: '' }]);
    void streamChat(sessionId, next, handleEvent).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Chat failed');
      setStreaming(false);
    });
  }

  // Move the sidebar cursor to topic `index` (1-based, matching the BA's
  // topic order). Everything before the target is marked `next` (done or
  // skipped), the target becomes current, and everything after stays pending.
  // Topics that have already been resolved (skipped) are left alone so the
  // UI doesn't re-paint a step that the BA confirmed as out-of-scope.
  //
  // `summary` is the BA-provided one-line detail for the topic the BA just
  // completed (the marker index − 1) — it replaces the default "Captured."
  // detail. The BA controls when to advance — the client never guesses.
  function advanceToTopic(index: number, next: 'done' | 'skipped', summary?: string) {
    if (!Number.isInteger(index) || index < FIRST_TOPIC_INDEX) return;
    setSteps((s) => {
      const arr = [...s];
      // Clamp the target to the last user-driven step so the sidebar can't
      // point past the end if the BA prompt ever grows a 9th topic.
      const target = Math.min(index, LAST_TOPIC_INDEX + 1);
      for (let i = FIRST_TOPIC_INDEX; i < arr.length; i++) {
        const step = arr[i];
        if (i < target) {
          // Steps before the target are resolved.
          if (step.state === 'current' || step.state === 'pending') {
            arr[i] = {
              ...step,
              state: next,
              detail:
                next === 'skipped'
                  ? 'Skipped.'
                  : summary && i === target - 1 && i >= FIRST_TOPIC_INDEX
                    ? summary
                    : 'Captured.',
            };
          }
        } else if (i === target) {
          // The target itself is the new "current" topic.
          if (step.state === 'pending') {
            arr[i] = { ...step, state: 'current' };
          }
        }
        // Steps after the target stay pending.
      }
      setCurrentStepIndex(target);
      return arr;
    });
  }

  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Outstanding-questions panel: drop the clicked question into the chat
  // draft and focus the textarea — never auto-send (mockup #s8b hint, plan
  // §4 D1). No-op while streaming, when the draft isn't editable.
  function pickQuestion(q: OutstandingQuestion) {
    if (streaming) return;
    setDraft(q.question);
    const ta = taRef.current;
    if (ta) {
      ta.focus();
      // Move the caret to the end once the controlled textarea has
      // re-rendered with the seeded draft.
      requestAnimationFrame(() => ta.setSelectionRange(ta.value.length, ta.value.length));
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    }
  }

  // Near-limit / at-limit banner. `messages` already includes the BA opener
  // and the optimistic assistant bubble while streaming, so the count is a
  // close match to what the server validates (it sees one extra — the new
  // user reply — at send time). Hide once the idea is captured.
  const atLimit = messages.length >= maxMessages;
  const nearLimit = !atLimit && messages.length >= warnThreshold;
  const showLimitWarn = (nearLimit || atLimit) && !doneEvent?.ideaWritten;

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

        {showLimitWarn && (
          <div
            className={`chat-warn${atLimit ? ' chat-warn--limit' : ''}`}
            role="status"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path d="M12 2 22 20 2 20 Z" />
              <path d="M12 9v5 M12 17h.01" />
            </svg>
            <div>
              {atLimit
                ? `Conversation limit reached (${maxMessages} messages). The server won't accept more replies — please start a new session.`
                : `Approaching the conversation limit (${messages.length}/${maxMessages} messages) — consider wrapping up soon.`}
            </div>
          </div>
        )}

        <div className="chat-body" ref={bodyRef}>
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className="av-sm" aria-hidden>
                {m.role === 'assistant' ? 'BA' : 'WN'}
              </div>
              <div className="bubble">
                {renderBubble(m.content)}
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
            ref={taRef}
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
            disabled={streaming || !!(doneEvent && doneEvent.ideaWritten) || atLimit}
            title="Mark the current question as skipped — BA will fill it in"
          >
            Skip
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void send(draft)}
            disabled={!draft.trim() || streaming || atLimit}
          >
            Send
          </button>
        </div>
      </section>

      <InterviewProgress
        steps={steps}
        doneCount={steps.filter((s) => s.state === 'done').length}
        currentStepIndex={currentStepIndex}
        outstanding={
          <OutstandingQuestions
            questions={outstandingQuestions}
            onPick={pickQuestion}
            disabled={streaming}
          />
        }
      />

      <button type="button" className="btn-link chat-back-link" onClick={onCancel}>
        ← All projects
      </button>
    </div>
  );
}
