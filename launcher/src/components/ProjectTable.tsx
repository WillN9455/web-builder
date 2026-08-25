import type { Project, ProjectStatus } from '../lib/api';

type Props = {
  projects: Project[];
  onOpen: (p: Project) => void;
};

const STATUS_PILL: Record<ProjectStatus, { cls: string; label: string }> = {
  queued:  { cls: 'todo',    label: 'Planning' },
  active:  { cls: 'inprog',  label: 'In Progress' },
  review:  { cls: 'review',  label: 'In Review' },
  blocked: { cls: 'blocked', label: 'Blocked' },
  done:    { cls: 'done',    label: 'Done' },
  shipped: { cls: 'shipped', label: 'Shipped' },
};

function StackIcon() {
  return (
    <svg className="ico-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M3 7l9-4 9 4-9 4-9-4z M3 12l9 4 9-4 M3 17l9 4 9-4" />
    </svg>
  );
}

export function ProjectTable({ projects, onOpen }: Props) {
  return (
    <div>
      <div className="sec-head">
        <h2>All projects</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-soft btn-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M3 5h18 M6 12h12 M10 19h4" />
            </svg>
            Filter
          </button>
          <button className="btn btn-soft btn-pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M7 4v16 M17 4v16 M3 8h4 M3 16h4 M17 8h4 M17 16h4" />
            </svg>
            Sort
          </button>
          <button className="btn btn-primary btn-pill">+ New Project</button>
        </div>
      </div>

      <div className="rows" role="table" aria-label="All projects">
        <div className="row head" role="row">
          <span role="columnheader">Project</span>
          <span role="columnheader">Tasks</span>
          <span role="columnheader">Chats</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Priority</span>
          <span role="columnheader">Stage</span>
          <span role="columnheader">Progress</span>
          <span />
        </div>

        {projects.map((p) => {
          const pill = STATUS_PILL[p.status];
          const pct = p.tasks_total > 0 ? Math.round((p.tasks_done / p.tasks_total) * 100) : 0;
          return (
            <div
              className="row"
              role="row"
              key={p.id}
              onClick={() => onOpen(p)}
              style={{ cursor: 'pointer' }}
            >
              <div className="ttl" role="cell">
                <b>{p.name}</b>
                <span><StackIcon /> {p.category} · Updated {p.updated_relative}</span>
              </div>
              <span className="stage-pt" role="cell">{p.tasks_done} / {p.tasks_total}</span>
              <span className="stage-pt" role="cell">{p.chats_count}</span>
              <span role="cell">
                <span className={`pill ${pill.cls}`}>
                  <span className="dot" /> {pill.label}
                </span>
              </span>
              <span role="cell">
                <span className={`prio ${p.priority}`}>
                  <span className="ring" />
                  {p.priority === 'high' ? 'High' : p.priority === 'medium' ? 'Med' : 'Low'}
                </span>
              </span>
              <span className="stage-pt" role="cell">{p.current_stage}</span>
              <div className="progress" role="cell" style={{ ['--p' as string]: `${pct}%` }} aria-label={`${pct}% complete`} />
              <button
                className="more"
                aria-label="Row options"
                onClick={(e) => e.stopPropagation()}
              >
                ⋯
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
