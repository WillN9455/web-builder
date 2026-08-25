// Static 7-step interview checklist shown in the right rail of the chat.
// The first three are marked done once the BA Agent has greeted, the user
// has described the problem, and a project row exists — see ChatStep.

type StepState = 'done' | 'current' | 'pending';

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
            {s.state === 'done' ? '✓' : i + 1}
          </div>
          <div className="body">
            <b>{s.label}</b>
            <span>{s.detail}</span>
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
