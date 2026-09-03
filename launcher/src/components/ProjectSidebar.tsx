import { Link, NavLink } from 'react-router-dom';
import type { ReactElement } from 'react';

// The 10 per-project menu tabs, in mockup #s3 order (`design/mockups.html`,
// screen 3 sidebar). `gated` tabs are locked behind project-context
// confirmation (mockup N11b locked-row pattern) until the project's
// context_confirmed flag (State D one-shot, served on GET /api/projects/:id)
// flips.
// TODO(count): Project Background's chip is live (badge = artifact count from
// the project detail payload, AC-1). The mockup also shows count chips on
// Requirements (14), Build (12) and QA (3), but the API has no source for
// those counts — chips stay omitted rather than rendering invented numbers.
// Sprint's badge is "—" in design/sitemap.md; the mockup's "12" is sample
// data, so Sprint never gets one.
export type ProjectTabKey =
  | 'overview'
  | 'background'
  | 'requirements'
  | 'sprint'
  | 'design'
  | 'build'
  | 'agents'
  | 'qa'
  | 'activity'
  | 'artifacts';

export type ProjectTab = {
  key: ProjectTabKey;
  label: string;
  icon: ReactElement;
  gated: boolean;
};

// Icons are copied verbatim from the #s3 sidebar markup.
export const PROJECT_TABS: readonly ProjectTab[] = [
  {
    key: 'overview',
    label: 'Overview',
    gated: false,
    icon: (
      <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12l9-9 9 9 M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    key: 'background',
    label: 'Project Background',
    gated: false,
    icon: (
      <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M5 4h11l3 3v13H5z M16 4v3h3 M8 11h8 M8 14h8 M8 17h5" />
      </svg>
    ),
  },
  {
    key: 'requirements',
    label: 'Requirements',
    gated: false,
    icon: (
      <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M14 3h7v7 M21 3l-9 9 M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
      </svg>
    ),
  },
  {
    key: 'sprint',
    label: 'Sprint',
    gated: true,
    icon: (
      <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <rect x="3" y="4" width="5" height="16" rx="1" />
        <rect x="10" y="4" width="5" height="10" rx="1" />
        <rect x="17" y="4" width="4" height="6" rx="1" />
      </svg>
    ),
  },
  {
    key: 'design',
    label: 'Design',
    gated: true,
    icon: (
      <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M4 4h16v16H4z M4 9h16 M9 4v16" />
      </svg>
    ),
  },
  {
    key: 'build',
    label: 'Build',
    gated: true,
    icon: (
      <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <rect x="3" y="4" width="5" height="16" rx="1" />
        <rect x="10" y="4" width="5" height="10" rx="1" />
        <rect x="17" y="4" width="4" height="6" rx="1" />
      </svg>
    ),
  },
  {
    key: 'agents',
    label: 'Agents',
    gated: false,
    icon: (
      <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="9" cy="9" r="3" />
        <circle cx="17" cy="9" r="3" />
        <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5 M14 19c0-3 2.7-5 6-5" />
      </svg>
    ),
  },
  {
    key: 'qa',
    label: 'QA',
    gated: true,
    icon: (
      <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M9 12l2 2 4-4 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
      </svg>
    ),
  },
  {
    key: 'activity',
    label: 'Activity',
    gated: false,
    icon: (
      <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    key: 'artifacts',
    label: 'Artifacts',
    gated: false,
    icon: (
      <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <path d="M21 8H3 M21 16H3 M5 4h14v16H5z" />
      </svg>
    ),
  },
];

type ProjectSidebarProps = {
  projectId: string;
  // Gate state — context_confirmed from the project detail payload (State D's
  // one-shot confirm; was the src/lib/projectGate.ts compile-time constant).
  confirmed: boolean;
  // Project Background's count chip (total artifacts, 17 max). Null/0 → chip
  // omitted (no PRD/ folder yet, or the folder can't be read).
  backgroundCount?: number | null;
  // Requirements' count chip (live BR+TR parse from the Requirements tab).
  // Null/0 → chip omitted — the tab publishes it via the outlet context, so
  // the chip only shows when that screen is its data source (AC-12).
  requirementsCount?: number | null;
};

// Per-project sidebar, ported from mockup #s3: brand block, "Menu" label, the
// 10-tab nav, the "Linked project" promo, and the foot links. Gated tabs that
// are still locked render the N11b locked-row pattern: a keyboard-focusable
// anchor with aria-disabled, full readable label, a "Confirm project context
// first" tooltip on hover/focus, and no navigation on click.
export function ProjectSidebar({ projectId, confirmed, backgroundCount, requirementsCount }: ProjectSidebarProps) {
  return (
    <aside className="side">
      <div className="brand">
        <div className="brand-mark">IH</div>
        <div className="brand-name">Idea Hub</div>
      </div>
      <div>
        <div className="menu-label">Menu</div>
        <nav className="nav" aria-label="Project menu">
          {PROJECT_TABS.map((tab) => {
            if (tab.gated && !confirmed) {
              // Locked row — keep the anchor (keyboard-reachable, tooltip on
              // :focus-within) but block navigation in the component, not
              // the CSS. href="#" matches the mockup's placeholder href.
              return (
                <a
                  key={tab.key}
                  href="#"
                  className="locked"
                  aria-disabled="true"
                  tabIndex={0}
                  onClick={(e) => e.preventDefault()}
                >
                  {tab.icon}
                  <span className="lbl">{tab.label}</span>
                </a>
              );
            }
            return (
              <NavLink
                key={tab.key}
                to={`/projects/${projectId}/${tab.key}`}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {tab.icon}
                <span className="lbl">{tab.label}</span>
                {tab.key === 'background' && !!backgroundCount && (
                  <span className="count">{backgroundCount}</span>
                )}
                {tab.key === 'requirements' && !!requirementsCount && (
                  <span className="count">{requirementsCount}</span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>
      <div className="side-promo">
        <h4>Linked project</h4>
        <p>
          <code>idea.md</code> was saved and auto-approved when this project was created. Edit it
          in the framework folder to refine the source-of-truth — changes will appear here.
        </p>
      </div>
      <div className="side-foot">
        <Link to="/projects">
          <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M15 3h6v6 M21 3l-9 9 M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
          </svg>
          <span className="lbl">← All projects</span>
        </Link>
        <a href="#" onClick={(e) => e.preventDefault()}>
          <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <circle cx="12" cy="12" r="10" />
            <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01" />
          </svg>
          <span className="lbl">Help &amp; support</span>
        </a>
      </div>
    </aside>
  );
}