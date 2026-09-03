import { useEffect, useState } from 'react';
import { Navigate, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { fetchProject, type ProjectDetailResponse } from '../lib/api';
import { CONTEXT_CONFIRMED } from '../lib/projectGate';
import { PROJECT_TABS, ProjectSidebar } from './ProjectSidebar';
import { ProjectOverview } from './ProjectOverview';

type ProjectInfo = ProjectDetailResponse['project'];

// Shared with ProjectTabScreen (the Outlet child) so the tab panel can render
// the shell's loading / error states in place of its own content. The Overview
// tab also reads the stage rows, activity feed, artifacts, and derived
// outstanding questions returned by GET /api/projects/:id.
type ProjectOutletContext = {
  project: ProjectInfo | null;
  stages: ProjectDetailResponse['stages'];
  activity: ProjectDetailResponse['activity'];
  artifacts: ProjectDetailResponse['artifacts'];
  outstandingQuestions: ProjectDetailResponse['outstandingQuestions'];
  error: string | null;
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
  const [detail, setDetail] = useState<ProjectDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    (async () => {
      try {
        const data = await fetchProject(id ?? '');
        if (!cancelled) setDetail(data);
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
      <ProjectSidebar projectId={id ?? ''} confirmed={CONTEXT_CONFIRMED} />
      <main className="main" aria-busy={detail === null && error === null}>
        <header className="topbar">
          <button type="button" className="btn-link" onClick={() => navigate('/projects')}>
            ← All projects
          </button>
          <h1 style={{ marginLeft: 12 }}>{detail?.project.name ?? id}</h1>
        </header>

        <Outlet
          context={
            {
              project: detail?.project ?? null,
              stages: detail?.stages ?? [],
              activity: detail?.activity ?? [],
              artifacts: detail?.artifacts ?? [],
              outstandingQuestions: detail?.outstandingQuestions ?? [],
              error,
            } satisfies ProjectOutletContext
          }
        />
      </main>
    </div>
  );
}

// The active tab's panel. The Overview tab is live (the status dashboard per
// design/mockups.html #s3/#s4/#s5); every other tab still gets a placeholder
// panel naming the tab — each ships in its own Stage-2 task. Unknown or
// still-locked tab routes snap back to Overview rather than rendering a dead
// URL; while the project is loading, or if it failed to load, the shell's
// loading / error state shows here instead of a panel.
export function ProjectTabScreen() {
  const { id, tab } = useParams();
  const navigate = useNavigate();
  const ctx = useOutletContext<ProjectOutletContext>();
  const { project, error } = ctx;
  const current = PROJECT_TABS.find((t) => t.key === tab);
  if (!id || !current) {
    return <Navigate to={id ? `/projects/${id}/overview` : '/projects'} replace />;
  }
  if (current.gated && !CONTEXT_CONFIRMED) {
    // Deep link to a gated tab while the gate is closed — Overview is the
    // only reachable landing (sitemap: the gate blocks Sprint/Design/Build/QA).
    return <Navigate to={`/projects/${id}/overview`} replace />;
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
  if (current.key === 'overview') {
    return (
      <ProjectOverview
        project={project}
        stages={ctx.stages}
        activity={ctx.activity}
        artifacts={ctx.artifacts}
        outstandingQuestions={ctx.outstandingQuestions}
      />
    );
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