// Open-questions banner — the butter-yellow strip (background.html #s12's
// `.oqa`). Shown when open-questions.md carries `Blocker-for: PRD-approval`
// items. Sole action: `View questions →` navigates to the Overview tab
// (sitemap locked decision 8) — it does not deep-link into the intake chat.
import { Link } from 'react-router-dom';

type OpenQuestionsBannerProps = {
  projectId: string;
  blockerCount: number;
};

export function OpenQuestionsBanner({ projectId, blockerCount }: OpenQuestionsBannerProps) {
  if (blockerCount <= 0) return null;
  return (
    <div className="oqa">
      <svg
        className="ico"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01" />
      </svg>
      <div className="body">
        <b>
          {blockerCount} open question{blockerCount === 1 ? '' : 's'}
        </b>{' '}
        need your input before SA review — all{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>Blocker-for: PRD-approval</code>. Shown on
        the <b>Overview</b> screen under Outstanding questions.
      </div>
      <Link to={`/projects/${projectId}`}>View questions →</Link>
    </div>
  );
}