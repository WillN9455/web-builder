// Shared types + a thin fetch helper for the launcher API.

export type StageKey =
  | 'Intake' | 'PRD' | 'Design' | 'Build' | 'Review' | 'QA' | 'Shipped';

export type ProjectStatus =
  | 'queued' | 'active' | 'review' | 'blocked' | 'done' | 'shipped';

export type TileColor =
  | 'peach' | 'sky' | 'mint' | 'lavender' | 'butter' | 'blush';

export type Project = {
  id: number;
  name: string;
  slug: string;
  one_liner: string;
  category: string;
  folder_path: string;
  current_stage: StageKey;
  status: ProjectStatus;
  priority: 'high' | 'medium' | 'low';
  tasks_total: number;
  tasks_done: number;
  chats_count: number;
  tile_color: TileColor;
  updated_relative: string;
};

export type Pipeline = {
  completion: number;
  byStatus: Record<ProjectStatus, number>;
  totalProjects: number;
  blocked: number;
};

export type ProjectsResponse = {
  projects: Project[];
  pipeline: Pipeline;
  nextMilestone: { projectId: number; name: string; stage: StageKey; daysLeft: number } | null;
};

export async function fetchProjects(): Promise<ProjectsResponse> {
  const res = await fetch('/api/projects');
  // Vite's SPA fallback returns index.html (text/html) when the /api proxy
  // target is unreachable. Detect that here and surface a clear error so the
  // UI can render the empty state instead of a cryptic JSON parse failure.
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'API server is not running. Start it with `npm run dev` (or `npm run dev:api` in another terminal).',
    );
  }
  if (!res.ok) throw new Error(`Failed to load projects: ${res.status}`);
  return res.json() as Promise<ProjectsResponse>;
}
