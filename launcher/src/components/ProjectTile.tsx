import { useEffect, useRef, useState } from 'react';
import type { Project } from '../lib/api';
import { stagePill } from '../lib/stagePill';

type Props = {
  project: Project;
  onOpen: (project: Project) => void;
  // Fired when the user picks "Delete project" from the ⋮ menu. The parent
  // owns the actual delete call and the confirm dialog — this component
  // just signals intent and hands back a ref to the trigger so the dialog
  // can return focus here on close.
  onRequestDelete: (project: Project, trigger: HTMLElement) => void;
};

// Mockup Screen 1 (`#s1`): tiles are pastel name + one-liner + stage pill +
// ⋯ menu — no per-project icon. Stage vocabulary comes from lib/stagePill.

export function ProjectTile({ project, onOpen, onRequestDelete }: Props) {
  const pill = stagePill(project.status, project.current_stage);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss the popover when the user clicks anywhere outside it. We listen
  // on the document (capture phase) so the handler runs before any card
  // click bubbles up and navigates away.
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

  return (
    <article
      className={`tile tile-${project.tile_color}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(project)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(project); }}
      aria-label={`Open ${project.name}`}
    >
      <div>
        <h3>{project.name}</h3>
        <div className="one-liner">{project.one_liner}</div>
        <div className="row" style={{ marginTop: 10, position: 'relative' }}>
          <span className={`pill ${pill.cls}`}>
            <span className="dot" /> {pill.label}
          </span>
          <button
            ref={menuBtnRef}
            className="more-btn"
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
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
                  onRequestDelete(project, menuBtnRef.current!);
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
    </article>
  );
}