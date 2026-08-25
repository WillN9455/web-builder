// Shared types + thin fetch helpers for the launcher API.

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

// ── /api/health ────────────────────────────────────────────────────────────

export type HealthResponse =
  | { ok: true; model: string; modelPresent: boolean; availableModels: string[] }
  | { ok: false; model: string; message: string };

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  return (await res.json()) as HealthResponse;
}

// ── /api/projects ──────────────────────────────────────────────────────────

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

// ── /api/init (intake — folder pick + scaffold) ───────────────────────────

export type InitResponse = {
  ok: true;
  sessionId: string;
  dir: string;
  existed: boolean;
  filesCopied: number;
  filesSkipped: number;
  workspacePinnedAt: string;
};

export async function initProjectDir(dir: string): Promise<InitResponse> {
  const res = await fetch('/api/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dir }),
  });
  // Vite's SPA fallback returns index.html (text/html) when the /api proxy
  // target is unreachable (e.g. dev:api hasn't booted yet). Surface a clear
  // error instead of a cryptic HTTP 500 from a JSON-parse failure.
  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json')
    ? ((await res.json().catch(() => ({}))) as Partial<InitResponse> & { error?: string })
    : ({} as Partial<InitResponse> & { error?: string });
  if (!contentType.includes('application/json')) {
    throw new Error(
      'API server is not running. Start it with `npm run dev` (or `npm run dev:api` in another terminal).',
    );
  }
  if (!res.ok) throw new Error(data.error ?? `Init failed (HTTP ${res.status})`);
  return data as InitResponse;
}

// ── /api/chat (intake — NDJSON stream) ─────────────────────────────────────

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ChatTokenEvent = { type: 'token'; content: string };
export type ChatErrorEvent = { type: 'error'; message: string };
export type ChatDoneEvent = {
  type: 'done';
  model: string;
  ideaWritten?: boolean;
  ideaPath?: string;
  backupPath?: string | null;
  projectName?: string | null;
  projectId?: number;
  projectSlug?: string;
  ideaWriteError?: string;
  projectCreateError?: string;
};
export type ChatEvent = ChatTokenEvent | ChatErrorEvent | ChatDoneEvent;

export async function streamChat(
  sessionId: string,
  messages: ChatMessage[],
  onEvent: (evt: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<ChatDoneEvent> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, messages }),
    signal,
  });

  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Chat failed (HTTP ${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneEvent: ChatDoneEvent | null = null;

  // Read until the server closes the stream.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line) as ChatEvent;
        if (evt.type === 'done') doneEvent = evt;
        onEvent(evt);
      } catch {
        // partial / malformed line — ignore
      }
    }
  }
  // Flush any trailing line that didn't end with \n.
  if (buffer.trim()) {
    try {
      const evt = JSON.parse(buffer) as ChatEvent;
      if (evt.type === 'done') doneEvent = evt;
      onEvent(evt);
    } catch {
      /* ignore */
    }
  }

  if (!doneEvent) throw new Error('Stream ended without a done event.');
  return doneEvent;
}
