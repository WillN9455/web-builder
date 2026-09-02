import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  deleteProject,
  fetchProjects,
  type Project,
  type ProjectsResponse,
} from '../lib/api';
import { Topbar } from './Topbar';
import { ProjectTile } from './ProjectTile';
import { PipelineRing } from './PipelineRing';
import { ProjectTable } from './ProjectTable';
import { EmptyState } from './EmptyState';
import { TilesSkeleton, RingSkeleton, TableSkeleton } from './Skeletons';
import { ConfirmDialog } from './ConfirmDialog';

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
  // Active-now expand toggle (mockup `#s1`): collapsed shows the first 6
  // in-flight tiles; the chevron reveals the rest.
  const [tilesExpanded, setTilesExpanded] = useState(false);
  // Project the user has picked to delete, plus the trigger element that
  // opened the menu (so the dialog can return focus there on close).
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletedToast, setDeletedToast] = useState<string | null>(null);
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

  // Auto-dismiss the success toast. Per ui-best-practices.md §3 we keep it
  // around long enough to read but never let it linger forever.
  useEffect(() => {
    if (!deletedToast) return;
    const id = window.setTimeout(() => setDeletedToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [deletedToast]);

  const onNewIdea = useCallback(() => navigate('/new'), [navigate]);

  const onOpenProject = useCallback(
    (p: Project) => {
      // Intake-stage projects still have an in-progress BA interview —
      // resume straight back into the chat instead of routing to the
      // placeholder detail page. Otherwise, fall through to the detail page.
      if (p.current_stage === 'Intake') navigate(`/new?resume=${p.slug}`);
      else navigate(`/projects/${p.slug}`);
    },
    [navigate],
  );

  // Tiles and table rows call this when the user picks "Delete project".
  // We stash the project + trigger ref so the dialog has everything it
  // needs (and so focus can be restored to the menu button on close).
  const onRequestDelete = useCallback((p: Project, trigger: HTMLElement) => {
    setDeleteError(null);
    setDeletingProject(p);
    deleteTriggerRef.current = trigger;
  }, []);

  const onCloseDelete = useCallback(() => {
    if (deleteBusy) return; // don't let the user bail mid-flight
    setDeletingProject(null);
    setDeleteError(null);
    deleteTriggerRef.current = null;
  }, [deleteBusy]);

  const onConfirmDelete = useCallback(async () => {
    if (!deletingProject) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteProject(deletingProject.id);
      const name = deletingProject.name;
      setDeletingProject(null);
      deleteTriggerRef.current = null;
      setDeletedToast(`Deleted "${name}".`);
      // Refetch so the tile grid, table, and pipeline ring all reflect the
      // new state in one render pass.
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  }, [deletingProject, load]);

  // Search narrows both sections — an unfiltered grid over an empty filtered
  // table reads as broken.
  const matchesFilter = (p: Project) =>
    filter.trim() === '' ||
    `${p.name} ${p.one_liner}`.toLowerCase().includes(filter.toLowerCase());

  const visibleProjects =
    state.kind === 'ok'
      ? state.data.projects.filter(matchesFilter)
      : [];

  // "Active now" tiles = in-flight projects only (sitemap Screen 1, locked
  // decision 1): status `active` or `blocked`. Everything else lives in the
  // table below.
  const activeProjects =
    state.kind === 'ok'
      ? state.data.projects.filter((p) => matchesFilter(p) && (p.status === 'active' || p.status === 'blocked'))
      : [];
  const visibleTiles = tilesExpanded ? activeProjects : activeProjects.slice(0, 6);

  // Build a RefObject the dialog can read. Refs returned from useRef() are
  // mutable, but ConfirmDialog expects a RefObject — we wrap once and reuse.
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  // Mirror the latest triggerRef.current into dialogTriggerRef so the
  // dialog's focus-restore effect picks up the right element each time it
  // opens.
  useEffect(() => {
    dialogTriggerRef.current = deleteTriggerRef.current;
  });

  return (
    <main className="main" aria-busy={state.kind === 'loading'}>
      <Topbar
        onNewIdea={onNewIdea}
        onSearch={setFilter}
        compact={state.kind === 'ok' && state.data.projects.length === 0}
      />

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
          {activeProjects.length > 0 && (
            <section aria-labelledby="active-now">
              <div className="sec-head">
                <h2 id="active-now">Active now</h2>
              </div>
              <div className="tile-grid" id="tile-grid">
                {visibleTiles.map((p) => (
                  <ProjectTile
                    key={p.id}
                    project={p}
                    onOpen={onOpenProject}
                    onRequestDelete={onRequestDelete}
                  />
                ))}
              </div>
              {activeProjects.length > 6 && (
                <div className="expand-row">
                  <button
                    type="button"
                    className="expand-btn"
                    aria-expanded={tilesExpanded}
                    aria-controls="tile-grid"
                    aria-label={tilesExpanded ? 'Show fewer active projects' : 'Show more active projects'}
                    title={tilesExpanded ? 'Show fewer active projects' : 'Show more active projects'}
                    onClick={() => setTilesExpanded((v) => !v)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </div>
              )}
            </section>
          )}

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
            <PipelineRing pipeline={state.data.pipeline} />
          </section>

          <ProjectTable
            projects={visibleProjects}
            onOpen={onOpenProject}
            onNewIdea={onNewIdea}
            onRequestDelete={onRequestDelete}
          />
        </>
      )}

      <ConfirmDialog
        open={deletingProject !== null}
        title="Delete this project?"
        description={
          deletingProject && (
            <>
              <span>
                This removes <strong>{deletingProject.name}</strong> from the
                launcher. The folder on disk (idea.md and any saved chats) is
                kept so you can recover by pointing a new project at the same
                path.
              </span>
              <span>
                Type <strong>{deletingProject.name}</strong> below to confirm.
              </span>
            </>
          )
        }
        confirmLabel="Delete project"
        cancelLabel="Cancel"
        requireTextMatch={deletingProject?.name ?? ''}
        busy={deleteBusy}
        errorMessage={deleteError}
        triggerRef={dialogTriggerRef}
        onConfirm={onConfirmDelete}
        onClose={onCloseDelete}
      />

      {deletedToast && (
        <div className="toast" role="status" aria-live="polite">
          <span className="toast-dot" aria-hidden="true" />
          {deletedToast}
        </div>
      )}
    </main>
  );
}
