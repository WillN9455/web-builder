import type { Pipeline } from '../lib/api';

type Props = {
  pipeline: Pipeline;
};

// Legend = the 5 canonical statuses (design/sitemap.md Global conventions).
// The API's ProjectStatus enum predates that model, so:
//   - Done combines `done` + legacy `shipped`;
//   - On hold / Cancelled have no source field yet — rendered as 0 until the
//     status-model migration lands (see PLANS/requirements.md §8).
const LEGEND: Array<{ label: string; color: string; count: (p: Pipeline) => number }> = [
  { label: 'Active',    color: 'var(--blue)',  count: (p) => p.byStatus.active ?? 0 },
  { label: 'Blocked',   color: 'var(--rose)',  count: (p) => p.byStatus.blocked ?? 0 },
  { label: 'On hold',   color: 'var(--amber)', count: () => 0 },
  { label: 'Cancelled', color: 'var(--ink-2)', count: () => 0 },
  { label: 'Done',      color: 'var(--mint)',  count: (p) => (p.byStatus.done ?? 0) + (p.byStatus.shipped ?? 0) },
];

// Ring maths from the mockup: 65% → 65% of the circumference.
const CIRC = 2 * Math.PI * 42;

// Screen 1 pipeline block — aggregate % ring + 5-row status legend only.
// The next-milestone card was removed by design (sitemap Screen 1, locked
// decision 3: no milestone card, no due dates).
export function PipelineRing({ pipeline }: Props) {
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
        {LEGEND.map(({ label, color, count }) => (
          <div className="item" key={label}>
            <span className="swatch" style={{ background: color }} />
            <span className="lbl">{label}</span>
            <span className="val">{count(pipeline)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
