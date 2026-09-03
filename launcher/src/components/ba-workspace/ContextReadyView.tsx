// State D — the "Project context ready" confirmation card (background.html
// #sD). Renders inside the standard per-project shell (locked decision 10 —
// no stripped chrome). Confirming fires the one-shot gate unlock.
import { useState } from 'react';
import type { BaFile } from '../../lib/api';

type ContextReadyViewProps = {
  // The approved files (all 17 — the card only renders when contextReady).
  files: BaFile[];
  bandLabels: { key: string; label: string }[];
  alreadyConfirmed: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
};

export function ContextReadyView({
  files,
  bandLabels,
  alreadyConfirmed,
  busy,
  error,
  onConfirm,
}: ContextReadyViewProps) {
  // "← Back to artifacts" — show the workspace anyway (the card replaces the
  // two-column grid while it's up).
  const [showWorkspace, setShowWorkspace] = useState(false);

  const bandSummary = bandLabels.map((b) => {
    const inBand = files.filter((f) => f.band === b.key);
    return {
      label: b.label,
      approved: inBand.filter((f) => f.status === 'approved').length,
      total: inBand.length,
    };
  });

  if (showWorkspace) return null;

  return (
    <div className="state-d" role="region" aria-labelledby="state-d-h">
      <div className="state-d-head">
        <div className="state-d-check" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path d="M5 12l5 5L20 7" />
          </svg>
        </div>
        <div>
          <h3 id="state-d-h">Project context ready</h3>
          <p>
            All 17 background documents are approved. This is the one-shot that locks context into
            Requirements and opens the four downstream tabs.
          </p>
        </div>
      </div>

      <div className="state-d-summary" aria-label="Approved count per band">
        {bandSummary.map((b) => (
          <div className="state-d-band" key={b.label}>
            <div className="n">
              {b.approved} / {b.total}
            </div>
            <div className="lbl">{b.label}</div>
          </div>
        ))}
      </div>

      <div className="state-d-explainer">
        Confirming writes the locked context into Requirements and unlocks Sprint, Design, Build,
        and QA in one shot. The Design, Build, and QA agents read these docs as the brief for every
        story. Once confirmed you can still revoke individual files, but the tabs stay open
        (warn-only) — we don&rsquo;t re-lock.
      </div>

      <div className="state-d-list" aria-label="17 approved artifacts">
        {files.map((f) => (
          <div className="state-d-list-row" key={f.filename}>
            <div>
              <div>{f.title}</div>
              <div className="path">PRD/{f.filename}</div>
            </div>
            <div className="ok">Approved ✓</div>
          </div>
        ))}
      </div>

      <div className="state-d-actions">
        {alreadyConfirmed ? (
          <span className="state-d-foot" role="status">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M5 12l5 5L20 7" />
            </svg>
            Context confirmed — the downstream tabs are unlocked.
          </span>
        ) : (
          <>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onConfirm}>
              Confirm project context →
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowWorkspace(true)}>
              ← Back to artifacts
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="state-d-foot" role="alert">
          {error}
        </div>
      )}
      {!alreadyConfirmed && (
        <span className="state-d-foot">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5 M12 16h.01" />
          </svg>
          One-shot — only runs when 17/17 are Approved.
        </span>
      )}
    </div>
  );
}