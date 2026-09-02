import { useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';

type TopbarProps = {
  onNewIdea: () => void;
  onSearch: (q: string) => void;
  // Empty-state variant (Screen 2): the mockup drops the notifications bell
  // and avatar when the workspace has no projects at all.
  compact?: boolean;
};

// Topbar shown on Screen 1 (full) and Screen 2 (compact). ⌘F / Ctrl+F focuses
// the search input (the mockup shows the ⌘F hint); Esc clears the filter and
// blurs. Search scope = the projects list only (sitemap locked decision 5).
export function Topbar({ onNewIdea, onSearch, compact = false }: TopbarProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== 'f') return;
      const t = e.target as HTMLElement | null;
      // Don't hijack the browser's own find when the user is already typing.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="topbar">
      <h1>Projects</h1>
      <div className="search" role="search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          ref={searchRef}
          placeholder="Search projects, stages, agents…"
          aria-label="Search projects"
          onChange={(e: ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.currentTarget.value = ''; // uncontrolled input — clear the visible text too
              onSearch('');
              e.currentTarget.blur();
            }
          }}
        />
        <span className="kbd">⌘F</span>
      </div>
      {!compact && (
        <button className="icon-btn" aria-label="Notifications">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2 M10 21h4" />
          </svg>
          <span className="dot" />
        </button>
      )}
      {!compact && <div className="avatar" aria-label="Will Nguyen">WN</div>}
      <button className="btn btn-primary btn-pill" onClick={onNewIdea}>
        + New idea
      </button>
    </header>
  );
}