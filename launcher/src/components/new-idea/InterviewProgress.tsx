// 7-step interview checklist shown in the right rail of the chat.
// `done` flips on once the user has covered (or skipped) a topic; `current`
// is the topic the BA Agent is asking about right now; `pending` is still
// ahead; `skipped` means the user explicitly skipped this one.
//
// State transitions are driven by ChatStep — this component is purely a
// renderer. See ChatStep.handleSend and handleSkip for the source of truth.

type StepState = 'done' | 'current' | 'pending' | 'skipped';

export type InterviewStep = {
  label: string;
  detail: string;
  state: StepState;
};

type Props = { steps: InterviewStep[]; doneCount: number };

export function InterviewProgress({ steps }: Props) {
  return (
    <aside className="chat-side" aria-label="Interview progress">
      <h4>Interview progress</h4>
      {steps.map((s, i) => (
        <div key={s.label} className={`step ${s.state}`}>
          <div className="num" aria-hidden>
            {s.state === 'done' ? '✓' : s.state === 'skipped' ? '–' : i + 1}
          </div>
          <div className="body">
            <b>{s.label}</b>
            <span>
              {s.state === 'skipped' ? 'Skipped — BA will fill in.' : s.detail}
            </span>
          </div>
        </div>
      ))}

      <div className="tip-card">
        <b>Tip:</b> Say <i>“just fill it in”</i> at any time and the BA Agent will finalise the idea doc
        itself, flagging any assumptions it made.
      </div>
    </aside>
  );
}
