import type { ChangeEvent } from 'react';

type TopbarProps = {
  onNewIdea: () => void;
  onSearch: (q: string) => void;
};

// Topbar shown on Screen 1. Search input is a placeholder for now — wiring it
// to filter the table is the next pass.
export function Topbar({ onNewIdea, onSearch }: TopbarProps) {
  return (
    <header className="topbar">
      <h1>Projects</h1>
      <div className="search" role="search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          placeholder="Search projects, stages, agents…"
          aria-label="Search projects"
          onChange={(e: ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)}
        />
        <span className="kbd">⌘F</span>
      </div>
      <button className="icon-btn" aria-label="Notifications">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2 M10 21h4" />
        </svg>
        <span className="dot" />
      </button>
      <div className="avatar" aria-label="Will Nguyen">WN</div>
      <button className="btn btn-primary btn-pill" onClick={onNewIdea}>
        + New idea
      </button>
    </header>
  );
}
