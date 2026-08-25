import { useCallback, useEffect, useState } from 'react';
import { fetchProjects, type Project, type ProjectsResponse } from './lib/api';
import { Topbar } from './components/Topbar';
import { ProjectTile } from './components/ProjectTile';
import { PipelineRing } from './components/PipelineRing';
import { ProjectTable } from './components/ProjectTable';
import { EmptyState } from './components/EmptyState';
import { TilesSkeleton, RingSkeleton, TableSkeleton } from './components/Skeletons';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: ProjectsResponse };

export default function App() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const data = await fetchProjects();
      setState({ kind: 'ok', data });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // + New idea is wired to the future /new route — for now it just opens the
  // empty state so we can verify the button works end-to-end.
  const onNewIdea = useCallback(() => {
    alert('New idea flow lands in Stage 2 (route /new — folder pick + BA chat).');
  }, []);

  const onOpenProject = useCallback((p: Project) => {
    alert(`Open "${p.name}" — project detail route /projects/${p.slug} ships in Stage 2.`);
  }, []);

  // Filter the table by the search input (case-insensitive on name + one_liner).
  const visibleProjects =
    state.kind === 'ok'
      ? state.data.projects.filter((p) =>
          filter.trim() === ''
            ? true
            : `${p.name} ${p.one_liner}`.toLowerCase().includes(filter.toLowerCase()),
        )
      : [];

  return (
    <div className="app full">
      <main className="main" aria-busy={state.kind === 'loading'}>
        <Topbar onNewIdea={onNewIdea} onSearch={setFilter} />

        {state.kind === 'error' && (
          <div className="error-banner" role="alert">
            <span>Couldn't load projects: {state.message}</span>
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
    </div>
  );
}
