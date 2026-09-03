// Idea summary card (plan §9.4, AC-21 revised) — the LLM-written summary of
// idea.md, shown at the top of the tab. Async + cached server-side: the card
// polls GET .../idea-summary while the background job runs ("Writing
// summary…"), renders the summary when done, and offers Retry on failed.
// A reference aid only — labelled AI-generated, never gate input.
// §9.6 QA (Will): the card is collapsible — the header toggles the body;
// open by default, and the poll keeps running while collapsed so a
// background summary still lands.
import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchBaIdeaSummary, retryBaIdeaSummary, type BaIdeaSummary } from '../../lib/api';

type IdeaSummaryCardProps = {
  projectId: string;
};

const POLL_MS = 2500;

export function IdeaSummaryCard({ projectId }: IdeaSummaryCardProps) {
  const [summary, setSummary] = useState<BaIdeaSummary | null>(null);
  const [available, setAvailable] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  // Silent poll — no skeleton flicker on refresh; stops once done/failed
  // (failed keeps the card up with its error + Retry, no polling).
  const load = useCallback(async () => {
    try {
      const data = await fetchBaIdeaSummary(projectId);
      setSummary(data.summary);
      setAvailable(data.summary !== null);
    } catch {
      // A failed poll (e.g. API briefly down) keeps the last known state.
    }
  }, [projectId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const busy = summary?.state === 'pending' || summary?.state === 'generating';
  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearTimeout(t);
  }, [busy, load]);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    setActionError(null);
    try {
      await retryBaIdeaSummary(projectId);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not retry the summary');
    } finally {
      setRetrying(false);
    }
  }, [load, projectId]);

  if (!available) return null; // no idea.md — the card stays hidden

  return (
    <div className="idea-summary" aria-live="polite">
      <div className="idea-summary-head">
        <h3>
          {/* §9.6 QA — the header toggles the card. aria-expanded/controls keep
              it a disclosed region for screen readers; the chevron is decor. */}
          <button
            type="button"
            className="idea-summary-toggle"
            aria-expanded={open}
            aria-controls="idea-summary-body"
            onClick={() => setOpen((o) => !o)}
          >
            <span className={`idea-summary-chev${open ? ' open' : ''}`} aria-hidden="true">
              ▸
            </span>
            Project idea
          </button>
        </h3>
        <span className="ai-tag">AI-generated from idea.md</span>
      </div>
      {open && (
        <div id="idea-summary-body">
          {summary?.state === 'done' && summary.summary ? (
            <div className="idea-summary-body view">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary.summary}</ReactMarkdown>
            </div>
          ) : summary?.state === 'failed' ? (
            <div className="idea-summary-error">
              <p role="alert">{summary.error ?? 'The summary generation failed.'}</p>
              {actionError && <p role="alert">{actionError}</p>}
              <button
                type="button"
                className="btn btn-soft btn-pill"
                disabled={retrying}
                onClick={() => void handleRetry()}
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="idea-summary-pending" aria-busy="true">
              {/* Reuses the generation panel's spinner (code-quality: no duplicate) */}
              <span className="ba-gen-spinner" aria-hidden="true" /> Writing summary…
            </div>
          )}
        </div>
      )}
    </div>
  );
}