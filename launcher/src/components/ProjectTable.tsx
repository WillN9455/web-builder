import { useEffect, useRef, useState } from 'react';
import type { Project } from '../lib/api';
import { isPreBuild, stageLabel, stagePill } from '../lib/stagePill';

type Props = {
  projects: Project[];
  onOpen: (p: Project) => void;
  onNewIdea: () => void;
  // Fired when the user picks "Delete project" from a row's ⋯ menu. The
  // parent owns the actual delete call and the confirm dialog.
  onRequestDelete: (project: Project, trigger: HTMLElement) => void;
};

// Mockup Screen 1 (`#s1`): columns are Project · Tasks · Status · Stage ·
// Progress (+ row menu). Chats and Priority were dropped by design v5
// (sitemap Screen 1, locked decision 4). Row body shows the project name only.

export function ProjectTable({ projects, onOpen, onNewIdea, onRequestDelete }: Props) {
  return (
    <div>
      <div className="sec-head">
        <h2>All projects</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Filter/Sort render per the mockup but stay inert until wired
              (sort contract: `updated_at desc` default, user-changeable). */}
          <button className="btn btn-soft btn-pill" title="Coming soon" aria-label="Filter (coming soon)" disabled>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <path d="M3 5h18 M6 12h12 M10 19h4" />
            </svg>
            Filter
          </button>
          <button className="btn btn-soft btn-pill" title="Coming soon" aria-label="Sort (coming soon)" disabled>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <path d="M7 4v16 M17 4v16 M3 8h4 M3 16h4 M17 8h4 M17 16h4" />
            </svg>
            Sort
          </button>
          <button className="btn btn-primary btn-pill" onClick={onNewIdea}>+ New idea</button>
        </div>
      </div>

      <div className="rows" role="table" aria-label="All projects">
        <div className="row head" role="row">
          <span role="columnheader">Project</span>
          <span role="columnheader">Tasks</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Stage</span>
          <span role="columnheader">Progress</span>
          <span role="columnheader" aria-label="Actions" />
        </div>

        {projects.map((p) => (
          <ProjectTableRow
            key={p.id}
            project={p}
            onOpen={onOpen}
            onRequestDelete={onRequestDelete}
          />
        ))}
      </div>
    </div>
  );
}

// Each row owns its popover so opening one menu doesn't keep the others
// around. Same outside-click / Esc dismiss pattern as ProjectTile.
function ProjectTableRow({
  project: p,
  onOpen,
  onRequestDelete,
}: {
  project: Project;
  onOpen: (p: Project) => void;
  onRequestDelete: (project: Project, trigger: HTMLElement) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (menuRef.current?.contains(t)) return;
      if (menuBtnRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const pill = stagePill(p.status, p.current_stage);
  const pct = p.tasks_total > 0 ? Math.round((p.tasks_done / p.tasks_total) * 100) : 0;
  // Jira cards don't exist before the Build stage (sitemap locked decision 4).
  const tasks = isPreBuild(p.current_stage) && p.tasks_total === 0
    ? '—'
    : `${p.tasks_done} / ${p.tasks_total}`;

  return (
    <div
      className="row"
      role="row"
      tabIndex={0}
      onClick={() => onOpen(p)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(p); }}
      style={{ cursor: 'pointer' }}
    >
      <div className="ttl" role="cell">
        <b>{p.name}</b>
      </div>
      <span className="stage-pt" role="cell">{tasks}</span>
      <span role="cell">
        <span className={`pill ${pill.cls}`}>
          <span className="dot" /> {pill.label}
        </span>
      </span>
      <span className="stage-pt" role="cell">{stageLabel(p.current_stage)}</span>
      <div className="progress" role="cell" style={{ ['--p' as string]: `${pct}%` }} aria-label={`${pct}% complete`} />
      <div style={{ position: 'relative' }}>
        <button
          ref={menuBtnRef}
          className="more"
          aria-label="Row options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          ⋯
        </button>
        {menuOpen && (
          <div ref={menuRef} className="popover" role="menu" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              role="menuitem"
              className="popover-item is-danger"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onRequestDelete(p, menuBtnRef.current!);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <path d="M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14 M10 11v6 M14 11v6" />
              </svg>
              Delete project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}