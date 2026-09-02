import type { ChatDoneEvent } from '../../lib/api';

type Props = {
  doneEvent: ChatDoneEvent;
  projectDir: string | null;
  onOpenProject: (slug: string | undefined) => void;
  onBack: () => void;
};

// Screen 9 — captured (success) card. Shown after the BA Agent emits the
// ```idea``` fence in its final reply and the server has written idea.md +
// inserted a project row.
export function CapturedStep({ doneEvent, projectDir, onOpenProject, onBack }: Props) {
  const projectName = doneEvent.projectName ?? 'Your idea';
  const ideaPath = doneEvent.ideaPath ?? (projectDir ? `${projectDir}/idea.md` : 'idea.md');

  return (
    <div className="center-stage">
      <div className="center-card" style={{ textAlign: 'center' }}>
        <div className="success-mark" aria-hidden>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2b2547" strokeWidth={2}>
            <path d="M5 12l5 5L20 7" />
          </svg>
        </div>
        <div className="crumbs">Captured</div>
        <h1>{projectName}</h1>
        <p className="sub" style={{ textAlign: 'center' }}>
          Your idea was saved to{' '}
          <code style={{ fontFamily: 'var(--font-mono)' }}>{ideaPath}</code>. The project is now in{' '}
          <b>Requirements</b> (intake complete) — next stop is the PRD.
        </p>

        <div className="captured-summary">
          <div className="captured-summary-label">What was written</div>
          <ul>
            <li>Problem statement, personas, current solutions</li>
            <li>Features in priority order, with out-of-scope noted</li>
            <li>BA assumptions (if any), flagged for your review</li>
          </ul>
        </div>

        {doneEvent.projectCreateError && (
          <div className="err" role="alert" style={{ marginTop: 12, textAlign: 'left' }}>
            <svg className="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5 M12 16h.01" />
            </svg>
            <div>
              idea.md was written, but the project row could not be created: {doneEvent.projectCreateError}
            </div>
          </div>
        )}

        <div className="actions-row" style={{ justifyContent: 'center', marginTop: 22 }}>
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            ← All projects
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onOpenProject(doneEvent.projectSlug)}
            disabled={!doneEvent.projectSlug}
          >
            Open project →
          </button>
        </div>
      </div>
    </div>
  );
}
