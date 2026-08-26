import { useState, type FormEvent } from 'react';
import { initProjectDir } from '../../lib/api';

type Props = {
  onInit: (
    sessionId: string,
    projectDir: string,
    projectName: string | null,
    maxMessages: number,
    warnThreshold: number,
  ) => void;
  onCancel: () => void;
};

// Screen 7 of the v5 plan — folder pick.
//
// Accepts an optional project name. If provided, it's used as the seed for the
// final project record (instead of letting the BA Agent invent a name during
// the interview). The BA Agent still owns the interview content — it just
// won't override the user's choice.
export function FolderPickStep({ onInit, onCancel }: Props) {
  const [path, setPath] = useState('~/Code/');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const trimmedName = name.trim();
      const res = await initProjectDir(path, trimmedName || null);
      onInit(res.sessionId, res.dir, trimmedName || null, res.maxMessages, res.warnThreshold);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create folder');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="center-stage">
      <form className="center-card" onSubmit={handleSubmit}>
        <div className="crumbs">Step 1 of 2 · New idea</div>
        <h1>Where should this project live?</h1>
        <p className="sub">
          Pick a folder on your machine. Idea Hub will create it, scaffold the framework files (skills,
          PRD, design system) into it, and pin the workspace for any future Claude Code session.
        </p>

        <label htmlFor="project-path">Project folder</label>
        <input
          id="project-path"
          className="input mono"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          required
        />

        <div className="help">
          A new folder will be created at this path. If it already exists, the framework files are added
          without overwriting what's there. <b>Pick a folder outside the framework repo</b> — writes to the
          framework would overwrite the framework itself.
        </div>

        <label htmlFor="project-name" style={{ marginTop: 18 }}>
          Project name <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--ink-3)' }}>(optional)</span>
        </label>
        <input
          id="project-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          placeholder="Leave blank and the BA Agent will suggest one"
        />

        <div className="help">
          Optional. If you already know what to call this project, type it here and we'll use it as the
          starting name. The BA Agent can still refine it from your description.
        </div>

        {error && (
          <div className="err" role="alert">
            <svg className="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5 M12 16h.01" />
            </svg>
            <div>{error}</div>
          </div>
        )}

        <div className="actions-row">
          <button type="button" className="btn-link" onClick={onCancel}>
            ← Cancel
          </button>
          <div className="right">
            <button type="submit" className="btn btn-primary" disabled={submitting || !path.trim()}>
              {submitting ? 'Creating…' : 'Create project folder →'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
