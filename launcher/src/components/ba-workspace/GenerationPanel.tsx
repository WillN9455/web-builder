// GenerationPanel — the "BA Agent is drafting…" loading screen (plan addendum
// AC-19). Replaces the tree/editor while the BA agent drafts the 17 documents
// (pending | generating). Visual pattern: the #sD card (ContextReadyView) —
// same shell voice, no new chrome. The screen polls GET /files every 2s while
// this is up; on done the workspace takes back over.
type GenerationPanelProps = {
  count: number; // artifacts on disk right now (0–17)
  current: string | null; // artifact being drafted
  bands: { label: string; done: number; total: number }[];
};

export function GenerationPanel({ count, current, bands }: GenerationPanelProps) {
  const complete = count >= 17;
  return (
    <div className="ba-gen" role="status" aria-live="polite">
      <div className="ba-gen-head">
        <span className="ba-gen-spinner" aria-hidden="true" />
        <div>
          <h3>BA Agent is drafting your Project Background documents…</h3>
          <p>
            {complete
              ? 'All 17 documents are drafted.'
              : count === 0
                ? 'Starting — the first document is on its way.'
                : 'Writing each document in turn from the intake conversation.'}
          </p>
        </div>
        <div className="ba-gen-progress" aria-label={`${count} of 17 documents drafted`}>
          <div className="n">{count} / 17</div>
          <div className="lbl">drafted</div>
        </div>
      </div>

      {current && (
        <div className="ba-gen-current">
          Drafting now: <b>{current}</b>
        </div>
      )}

      <div className="ba-gen-bands" aria-label="Drafted count per band">
        {bands.map((b) => (
          <div className="ba-gen-band" key={b.label}>
            <div className="n">
              {b.done} / {b.total}
            </div>
            <div className="lbl">{b.label}</div>
          </div>
        ))}
      </div>

      <div className="ba-gen-foot">
        This runs in the background — you can leave this page and come back. Drafts arrive as{' '}
        <b>Draft</b>: nothing is sent for review or approved automatically.
      </div>
    </div>
  );
}