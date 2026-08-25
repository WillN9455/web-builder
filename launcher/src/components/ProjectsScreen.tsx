import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProjects, type Project, type ProjectsResponse } from '../lib/api';
import { Topbar } from './Topbar';
import { ProjectTile } from './ProjectTile';
import { PipelineRing } from './PipelineRing';
import { ProjectTable } from './ProjectTable';
import { EmptyState } from './EmptyState';
import { TilesSkeleton, RingSkeleton, TableSkeleton } from './Skeletons';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: ProjectsResponse; warning?: string };

const EMPTY_RESPONSE: ProjectsResponse = {
  projects: [],
  pipeline: { completion: 0, byStatus: {} as never, totalProjects: 0, blocked: 0 },
  nextMilestone: null,
};

// Screen 1 (initial) + Screen 2 (empty state) — the single-column landing
// page shown after the user opens the launcher.
export function ProjectsScreen() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const data = await fetchProjects();
      setState({ kind: 'ok', data });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      // When the API is unreachable we still want the user to land on the
      // empty state (with a soft warning banner) so they can create their
      // first project instead of seeing a JSON-parse error.
      const isOffline = /api server is not running|failed to load/i.test(message);
      if (isOffline) {
        setState({ kind: 'ok', data: EMPTY_RESPONSE, warning: message });
      } else {
        setState({ kind: 'error', message });
      }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onNewIdea = useCallback(() => navigate('/new'), [navigate]);

  const onOpenProject = useCallback(
    (p: Project) => navigate(`/projects/${p.slug}`),
    [navigate],
  );

  const visibleProjects =
    state.kind === 'ok'
      ? state.data.projects.filter((p) =>
          filter.trim() === ''
            ? true
            : `${p.name} ${p.one_liner}`.toLowerCase().includes(filter.toLowerCase()),
        )
      : [];

  return (
    <main className="main" aria-busy={state.kind === 'loading'}>
      <Topbar onNewIdea={onNewIdea} onSearch={setFilter} />

      {state.kind === 'error' && (
        <div className="error-banner" role="alert">
          <span>Couldn't load projects: {state.message}</span>
          <button onClick={load}>Retry</button>
        </div>
      )}

      {state.kind === 'ok' && state.warning && (
        <div className="error-banner" role="status">
          <span>{state.warning}</span>
          <button onClick={load}>Retry</button>
        </div>
      )}

      {state.kind === 'loading' && (
        <>
          <TilesSkeleton />
          <RingSkeleton />
          <TableSkeleton />
        </>
      )}

      {state.kind === 'ok' && state.data.projects.length === 0 && (
        <EmptyState onNewIdea={onNewIdea} />
      )}

      {state.kind === 'ok' && state.data.projects.length > 0 && (
        <>
          <section aria-labelledby="active-now">
            <div className="sec-head">
              <h2 id="active-now">Active now</h2>
              <a href="#" className="more">View all →</a>
            </div>
            <div className="tile-grid">
              {state.data.projects.map((p) => (
                <ProjectTile key={p.id} project={p} onOpen={onOpenProject} />
              ))}
            </div>
          </section>

          <section aria-labelledby="pipeline">
            <div className="sec-head">
              <h2 id="pipeline">Pipeline</h2>
              <span className="more">
                {state.data.pipeline.totalProjects} project
                {state.data.pipeline.totalProjects === 1 ? '' : 's'}
                {state.data.pipeline.blocked > 0
                  ? ` · ${state.data.pipeline.blocked} blocked`
                  : ''}
              </span>
            </div>
            <PipelineRing
              pipeline={state.data.pipeline}
              nextMilestoneName={state.data.nextMilestone?.name ?? null}
              nextMilestoneStage={state.data.nextMilestone?.stage ?? null}
              nextMilestoneDays={state.data.nextMilestone?.daysLeft ?? null}
            />
          </section>

          <ProjectTable projects={visibleProjects} onOpen={onOpenProject} />
        </>
      )}
    </main>
  );
}
