import type { Project } from '../lib/api';

type Props = {
  project: Project;
  onOpen: (project: Project) => void;
};

// Status pill copy + dot colour — driven by project.status (mockup row 9–13).
const STATUS_PILL: Record<Project['status'], { cls: string; label: string }> = {
  queued:  { cls: 'todo',    label: 'Planning' },
  active:  { cls: 'inprog',  label: 'In Progress' },
  review:  { cls: 'review',  label: 'In Review' },
  blocked: { cls: 'blocked', label: 'Blocked' },
  done:    { cls: 'done',    label: 'Done' },
  shipped: { cls: 'shipped', label: 'Shipped' },
};

// Inline SVG so the bundle stays self-contained (no icon font, no CDN).
function TileIcon({ name }: { name: string }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 };
  switch (name) {
    case 'tenant-maintenance':
      return <svg {...common}><path d="M3 12l9-9 9 9 M5 10v10h14V10" /></svg>;
    case 'yoga-studio-booking':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg>;
    case 'internal-timesheet':
      return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4 M8 2v4 M3 10h18" /></svg>;
    case 'field-service-tracker':
      return <svg {...common}><path d="M3 7h18l-2 13H5L3 7z M9 7V4h6v3" /></svg>;
    case 'personal-bookmarks':
      return <svg {...common}><path d="M5 4h14v16H5z M5 8h14 M9 4v16" /></svg>;
    case 'neighborhood-library':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>;
  }
}

export function ProjectTile({ project, onOpen }: Props) {
  const pill = STATUS_PILL[project.status];
  return (
    <article
      className={`tile tile-${project.tile_color}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(project)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(project); }}
      aria-label={`Open ${project.name}`}
    >
      <div className="tile-ico">
        <TileIcon name={project.slug} />
      </div>
      <div>
        <h3>{project.name}</h3>
        <div className="one-liner">{project.one_liner}</div>
        <div className="row" style={{ marginTop: 10 }}>
          <span className={`pill ${pill.cls}`}>
            <span className="dot" /> {pill.label}
          </span>
          <button className="more-btn" aria-label="More options" onClick={(e) => e.stopPropagation()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
}
