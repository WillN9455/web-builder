// Idea summary card (plan §9.4, AC-21 revised) — the LLM-written summary of
// idea.md, shown above the file-tree/editor grid. Async + cached server-side:
// the card polls GET .../idea-summary while the background job runs ("Writing
// summary…"), renders the summary when done, and offers Retry on failed.
// A reference aid only — labelled AI-generated, never gate input.
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
        <h3>Project idea</h3>
        <span className="ai-tag">AI-generated from idea.md</span>
      </div>
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
  );
}