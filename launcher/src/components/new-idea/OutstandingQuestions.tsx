// Outstanding-questions panel — Screen 8 zone 3 (mockups #s8/#s8b).
//
// Always visible in the chat side, below the tip card. Empty state = greyed
// locked treatment (.oq-empty, "No outstanding questions."); populated =
// .oq-list grouped under `Blocker for: <group>` headers. Each item is a real
// button that sends a re-ask request to the BA: click → the BA re-asks the
// question in chat → the user answers → the BA resolves it with
// ::oq-resolve::ID:: and the item leaves the panel. Owner-approved
// interaction change over the mockup's original click-to-draft hint (plan
// §4 D1); the sitemap's Screen 8 zone-3 line documents the new loop.
//
// Purely a renderer: the question list lives in ChatStep state, fed by the
// server's oq_add / oq_resolve NDJSON events and seeded on resume.
import { useMemo, type MouseEvent } from 'react';
import type { OutstandingQuestion } from '../../lib/api';

type Props = {
  questions: OutstandingQuestion[];
  // Send a re-ask request for this question (click → BA re-asks → user
  // answers → item resolves). No-op while streaming or at the message cap.
  onPick: (question: OutstandingQuestion) => void;
  // Disabled while the BA is streaming or the conversation is at its cap —
  // the chat can't accept the re-ask request then.
  disabled: boolean;
};

// Relative ask time for the meta line ("Asked 2h ago · …"). Client-side on
// purpose — the server stamps a UTC ISO instant; presentation stays local.
function formatRelative(iso: string, now: number): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 'just now';
  const secs = Math.max(0, Math.round((now - ts) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function OutstandingQuestions({ questions, onPick, disabled }: Props) {
  // `now` is fixed per render so every item shows the same relative age for
  // a given snapshot (and re-renders naturally as the chat streams).
  const now = useMemo(() => Date.now(), [questions]);

  // Group by blockerFor, preserving first-seen order.
  const groups = useMemo(() => {
    const byGroup = new Map<string, OutstandingQuestion[]>();
    for (const q of questions) {
      const list = byGroup.get(q.blockerFor) ?? [];
      list.push(q);
      byGroup.set(q.blockerFor, list);
    }
    return [...byGroup.entries()];
  }, [questions]);

  return (
    <>
      <h4 className="oq-head">Outstanding questions</h4>
      {questions.length === 0 ? (
        <div className="oq-empty">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5 M12 16h.01" />
          </svg>
          No outstanding questions.
        </div>
      ) : (
        <>
          <div className="oq-hint">Click a question and the BA Agent will ask it again — answer in chat to clear it.</div>
          <div className="oq-list">
            {groups.map(([group, items], gi) => (
              // Index-keyed id: group labels are BA-supplied free text and may
              // contain characters illegal in an HTML id.
              <section key={group} aria-labelledby={`oq-group-${gi}`}>
                <div className="oq-group" id={`oq-group-${gi}`}>
                  Blocker for: {group}
                </div>
                {items.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    className="oq-item oq-btn"
                    disabled={disabled}
                    onClick={(e: MouseEvent<HTMLButtonElement>) => {
                      e.preventDefault();
                      onPick(q);
                    }}
                  >
                    <div className="oq-q">{q.question}</div>
                    <div className="oq-meta">
                      Asked {formatRelative(q.askedAt, now)} · Blocks story {q.blocksStory}
                    </div>
                  </button>
                ))}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}