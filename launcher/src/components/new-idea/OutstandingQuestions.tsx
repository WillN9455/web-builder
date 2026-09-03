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
import { formatRelative } from '../../lib/formatRelative';

type Props = {
  questions: OutstandingQuestion[];
  // Send a re-ask request for this question (click → BA re-asks → user
  // answers → item resolves). No-op while streaming or at the message cap.
  onPick: (question: OutstandingQuestion) => void;
  // Disabled while the BA is streaming or the conversation is at its cap —
  // the chat can't accept the re-ask request then.
  disabled: boolean;
  // Overview (blocked-state) variant — sitemap decision 5: questions are
  // read-only there, `Open chat →` is the sole way to answer. Items render as
  // plain list rows (no re-ask button) and the chat-specific hint is hidden.
  readOnly?: boolean;
  // The chat side renders the panel's own h4 heading; the Overview card
  // supplies its own h3 + count pill instead.
  withHeading?: boolean;
  // Cap the list height with the mockup's .q-scroll treatment (Overview
  // blocked card, mockups.html #s4: `.oq-list.q-scroll` max-height 260px).
  scroll?: boolean;
};

export function OutstandingQuestions({
  questions,
  onPick,
  disabled,
  readOnly = false,
  withHeading = true,
  scroll = false,
}: Props) {
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
      {withHeading && <h4 className="oq-head">Outstanding questions</h4>}
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
          {!readOnly && (
            <div className="oq-hint">Click a question and the BA Agent will ask it again — answer in chat to clear it.</div>
          )}
          <div className={`oq-list${scroll ? ' q-scroll ov-scroll-260' : ''}`}>
            {groups.map(([group, items], gi) => (
              // Index-keyed id: group labels are BA-supplied free text and may
              // contain characters illegal in an HTML id.
              <section key={group} aria-labelledby={`oq-group-${gi}`}>
                <div className="oq-group" id={`oq-group-${gi}`}>
                  Blocker for: {group}
                </div>
                {items.map((q) => {
                  const meta = (
                    <div className="oq-meta">
                      Asked {formatRelative(q.askedAt, now)} · Blocks story {q.blocksStory}
                    </div>
                  );
                  return readOnly ? (
                    // Read-only variant (Overview blocked state) — presentation
                    // only, no re-ask affordance (sitemap decision 5).
                    <div key={q.id} className="oq-item">
                      <div className="oq-q">{q.question}</div>
                      {meta}
                    </div>
                  ) : (
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
                      {meta}
                    </button>
                  );
                })}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}