import type { Pipeline, ProjectStatus } from '../lib/api';

type Props = {
  pipeline: Pipeline;
  nextMilestoneName: string | null;
  nextMilestoneStage: string | null;
  nextMilestoneDays: number | null;
};

// Status → swatch colour from the v5 token set.
const LEGEND: Array<{ status: ProjectStatus; label: string; color: string }> = [
  { status: 'shipped', label: 'Shipped',     color: 'var(--mint)' },
  { status: 'done',    label: 'Done',        color: 'var(--green)' },
  { status: 'review',  label: 'Review',      color: 'var(--amber)' },
  { status: 'active',  label: 'In progress', color: 'var(--blue)' },
  { status: 'queued',  label: 'Planning',    color: 'var(--purple)' },
  // The mockup shows 7 items; "Drafting" + "Blocked" map to coral + rose. We
  // synthesise them from the byStatus map when present; otherwise omit.
  { status: 'blocked', label: 'Blocked',     color: 'var(--rose)' },
];

// 65% from the mockup → 65% of the circumference.
const CIRC = 2 * Math.PI * 42;

export function PipelineRing({ pipeline, nextMilestoneName, nextMilestoneStage, nextMilestoneDays }: Props) {
  const offset = CIRC * (1 - pipeline.completion / 100);
  return (
    <div className="ring-block">
      <div className="ring" aria-label={`${pipeline.completion}% complete`} role="img">
        <svg viewBox="0 0 100 100">
          <circle className="track" cx="50" cy="50" r="42" />
          <circle
            className="fill"
            cx="50"
            cy="50"
            r="42"
            strokeDasharray={CIRC.toFixed(2)}
            strokeDashoffset={offset.toFixed(2)}
          />
        </svg>
        <div className="num">{pipeline.completion}%</div>
      </div>

      <div className="ring-legend">
        {LEGEND.map(({ status, label, color }) => (
          <div className="item" key={status}>
            <span className="swatch" style={{ background: color }} />
            <span className="lbl">{label}</span>
            <span className="val">{pipeline.byStatus[status] ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="next-milestone">
        <div className="lbl">Next milestone</div>
        <div className="name">
          {nextMilestoneName
            ? `${nextMilestoneName} — ${nextMilestoneStage}`
            : 'No active projects'}
        </div>
        <div className="days">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {nextMilestoneDays != null ? `${nextMilestoneDays} days left` : '—'}
        </div>
        <button className="btn btn-primary btn-pill" style={{ marginTop: 8, alignSelf: 'flex-start' }}>
          + New Project
        </button>
      </div>
    </div>
  );
}
