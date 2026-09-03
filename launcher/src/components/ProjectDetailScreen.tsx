import { useEffect, useState } from 'react';
import { Navigate, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { fetchProject, type ProjectDetailResponse } from '../lib/api';
import { PROJECT_TABS, ProjectSidebar } from './ProjectSidebar';

type ProjectInfo = ProjectDetailResponse['project'];

// Shared with the Outlet children (ProjectTabScreen, ProjectBackgroundScreen)
// so a tab panel can render the shell's loading / error states in place of
// its own content. onContextConfirmed lets ProjectBackgroundScreen flip the
// gate in the shell's state after a successful State D confirm — the sidebar
// unlocks immediately, no reload (AC-7).
export type ProjectOutletContext = {
  project: ProjectInfo | null;
  error: string | null;
  onContextConfirmed: () => void;
};

// Project shell — the open-project layout: per-project sidebar + main column
// (topbar + the active tab's panel via <Outlet/>). Routes live in App.tsx:
// /projects/:id redirects to /projects/:id/overview, and each tab is the
// sub-route /projects/:id/:tab so the URL bar and refresh keep their place
// (sitemap: "Default landing = Overview always"). The Outlet renders even
// while loading / on error so the index redirect and tab routing always fire.
export function ProjectDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    setError(null);
    (async () => {
      try {
        const data = await fetchProject(id ?? '');
        if (!cancelled) setProject(data.project);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load project');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="app">
      <ProjectSidebar
        projectId={id ?? ''}
        confirmed={project?.context_confirmed ?? false}
        backgroundCount={project?.ba_artifact_count ?? null}
      />
      <main className="main" aria-busy={project === null && error === null}>
        <header className="topbar">
          <button type="button" className="btn-link" onClick={() => navigate('/projects')}>
            ← All projects
          </button>
          <h1 style={{ marginLeft: 12 }}>{project?.name ?? id}</h1>
        </header>

        <Outlet
          context={
            {
              project,
              error,
              onContextConfirmed: () =>
                setProject((p) => (p ? { ...p, context_confirmed: true } : p)),
            } satisfies ProjectOutletContext
          }
        />
      </main>
    </div>
  );
}

// The active tab's panel. Tab contents (Overview dashboard, Sprint board, …)
// each ship in their own Stage-2 task — this PR renders the menu + navigation
// only, so every tab except Project Background gets a placeholder panel
// naming the tab. Unknown or still-locked tab routes snap back to Overview
// rather than rendering a dead URL; while the project is loading, or if it
// failed to load, the shell's loading / error state shows here instead of a
// panel.
export function ProjectTabScreen() {
  const { id, tab } = useParams();
  const navigate = useNavigate();
  const { project, error } = useOutletContext<ProjectOutletContext>();
  const current = PROJECT_TABS.find((t) => t.key === tab);
  if (!id || !current) {
    return <Navigate to={id ? `/projects/${id}/overview` : '/projects'} replace />;
  }
  if (error) {
    return (
      <div className="center-stage" style={{ minHeight: 400 }}>
        <div className="center-card" style={{ textAlign: 'center' }}>
          <div className="crumbs">Project</div>
          <h1>Could not load &ldquo;{id}&rdquo;</h1>
          <p className="sub" style={{ textAlign: 'center' }}>
            {error}
          </p>
          <div className="actions-row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/projects')}>
              Back to projects
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (project === null) {
    return (
      <div className="center-stage" style={{ minHeight: 400 }}>
        <div className="center-card" style={{ textAlign: 'center' }}>
          <div className="crumbs">Project</div>
          <h1>Loading…</h1>
        </div>
      </div>
    );
  }
  if (current.gated && !project.context_confirmed) {
    // Deep link to a gated tab while the gate is closed — Overview is the
    // only reachable landing (sitemap: the gate blocks Sprint/Design/Build/QA).
    // Checked after the load resolves so a confirmed project deep-linked to a
    // gated tab isn't bounced while its row is still loading.
    return <Navigate to={`/projects/${id}/overview`} replace />;
  }
  return (
    <div className="center-stage" style={{ minHeight: 400 }}>
      <div className="center-card" style={{ textAlign: 'center' }}>
        <div className="crumbs">{current.label}</div>
        <h1>{current.label}</h1>
        <p className="sub" style={{ textAlign: 'center' }}>
          This tab&rsquo;s workspace ships in Stage 2 — this change delivers the per-project menu
          and navigation.
        </p>
      </div>
    </div>
  );
}