// Screen 2 (`mockups.html` #s2) — shown when the API returns zero projects.

type Props = { onNewIdea: () => void };

export function EmptyState({ onNewIdea }: Props) {
  return (
    <div className="empty">
      <div className="illu" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
          <path d="M12 2v6 M12 22v-6 M2 12h6 M22 12h-6 M5 5l4 4 M15 15l4 4 M19 5l-4 4 M5 19l4-4" />
        </svg>
      </div>
      <h2>Start with one idea</h2>
      <p>
        Idea Hub holds every project from first chat to shipping. Capture your
        first one with a 5-minute interview — the BA Agent handles the rest.
      </p>
      <div className="empty-actions">
        <button className="btn btn-primary" onClick={onNewIdea}>+ New idea</button>
        {/* Folder adoption is designed (sitemap Screen 2) but not built — the
            button renders per the mockup and stays inert until then. */}
        <button className="btn btn-ghost" title="Coming soon" aria-label="Import a folder (coming soon)" disabled>
          Import a folder
        </button>
      </div>
    </div>
  );
}
