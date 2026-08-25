import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

// Placeholder route — full project detail (screens 3–6 in the v5 plan)
// ships in Stage 2. For now this confirms the slug from the chat's "Open
// project →" navigation lands somewhere sane.
export function ProjectDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<{ name: string; folder_path: string; current_stage: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { project: { name: string; folder_path: string; current_stage: string } };
        if (!cancelled) setProject(data.project);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load project');
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <main className="main" aria-busy={project === null && error === null}>
      <header className="topbar">
        <button type="button" className="btn-link" onClick={() => navigate('/projects')}>
          ← All projects
        </button>
        <h1 style={{ marginLeft: 12 }}>{project?.name ?? id}</h1>
      </header>

      <div className="center-stage" style={{ minHeight: 400 }}>
        <div className="center-card" style={{ textAlign: 'center' }}>
          <div className="crumbs">Stage 2 preview</div>
          <h1>Project detail ships in Stage 2</h1>
          <p className="sub" style={{ textAlign: 'center' }}>
            {error
              ? `Could not load "${id}": ${error}`
              : project
                ? `${project.name} is in stage ${project.current_stage}. The full per-project menu (Overview, Requirements, Design, Build, Agents, QA, Activity, Artifacts) lands next.`
                : 'Loading…'}
          </p>
          {project && (
            <div className="actions-row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={() => navigate('/projects')}>
                Back to projects
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
