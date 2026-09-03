// Shared types + thin fetch helpers for the launcher API.

// Stage keys. The 7-segment pipeline stepper stays 7 steps; `Requirements` is
// the "intake chat completed, idea captured" sub-state of the Requirements
// step — the project leaves `Intake` on capture and enters `PRD` once the BA
// starts drafting the PRD documents.
export type StageKey =
  | 'Intake' | 'Requirements' | 'PRD' | 'Design' | 'Build' | 'Review' | 'QA' | 'Shipped';

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

// Delete a project row (DB only — the on-disk folder is preserved so the
// project can be recovered by pointing a new row at the same directory).
// Mirrors fetchProjects' offline-detection so the UI can surface the same
// "API server is not running" copy users see on the initial load.
export type DeleteProjectResponse = { ok: true; id: number; slug: string; name: string };

export async function deleteProject(id: number | string): Promise<DeleteProjectResponse> {
  const res = await fetch(`/api/projects/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'API server is not running. Start it with `npm run dev` (or `npm run dev:api` in another terminal).',
    );
  }
  const data = (await res.json().catch(() => ({}))) as Partial<DeleteProjectResponse> & {
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? `Delete failed (HTTP ${res.status})`);
  return data as DeleteProjectResponse;
}

// ── /api/projects/:id (project shell + Overview data) ──────────────────────

// The server returns the full project row; the shell (ProjectDetailScreen)
// consumes these fields, and the Overview tab reads the wider set.
export type ProjectDetailProject = Pick<
  Project,
  | 'id'
  | 'name'
  | 'slug'
  | 'one_liner'
  | 'folder_path'
  | 'current_stage'
  | 'status'
  | 'tile_color'
  | 'updated_relative'
>;

// One `stage` table row (stage history for the stepper + journey timeline).
export type StageRow = {
  stage_key: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
};

// One `activity` table row (feed entries, newest first from the server).
export type ActivityRow = {
  agent: string;
  message: string;
  kind: string;
  ts: string;
};

// One `artifact` table row.
export type ArtifactRow = {
  stage_key: string;
  label: string;
  path: string;
  kind: string;
  created_at: string;
};

export type ProjectDetailResponse = {
  project: ProjectDetailProject;
  stages: StageRow[];
  activity: ActivityRow[];
  artifacts: ArtifactRow[];
  // Derived from the project's persisted intake transcript server-side;
  // [] when there is no transcript or the parse failed.
  outstandingQuestions: OutstandingQuestion[];
};

export async function fetchProject(idOrSlug: string): Promise<ProjectDetailResponse> {
  const res = await fetch(`/api/projects/${encodeURIComponent(idOrSlug)}`);
  // Same offline-detection as fetchProjects — Vite's SPA fallback returns
  // index.html (text/html) when the /api proxy target is unreachable.
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'API server is not running. Start it with `npm run dev` (or `npm run dev:api` in another terminal).',
    );
  }
  if (!res.ok) throw new Error(`Failed to load project: ${res.status}`);
  return res.json() as Promise<ProjectDetailResponse>;
}

// ── /api/init (intake — folder pick + scaffold) ───────────────────────────

export type InitResponse = {
  ok: true;
  sessionId: string;
  dir: string;
  existed: boolean;
  // Conversation caps — surfaced so the chat UI can warn as the user approaches
  // the limit without duplicating the server constants (intake.ts).
  maxMessages: number;
  warnThreshold: number;
};

export async function initProjectDir(dir: string, projectName: string | null): Promise<InitResponse> {
  const res = await fetch('/api/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dir, projectName }),
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

// One logged outstanding question — the BA Agent defers a blocking question
// mid-interview (::oq-add:: sentinel) and resolves it later (::oq-resolve::).
// One shape everywhere: server, resume payload, and the chat-side panel.
export type OutstandingQuestion = {
  // BA-chosen stable id, e.g. "OQ-3".
  id: string;
  // One line, no markdown.
  question: string;
  // Group label: "Requirements", "Design", …
  blockerFor: string;
  // Story id the question blocks, e.g. "ONB-04" — "—" when none.
  blocksStory: string;
  // Server-stamped ISO timestamp.
  askedAt: string;
};

export type ChatTokenEvent = { type: 'token'; content: string };
export type ChatErrorEvent = { type: 'error'; message: string };
// Emitted when the BA Agent transitions from one interview topic to the next
// (e.g. ::topic=3::). The index is 1-based and matches the BA's prompt order.
// `summary` is the optional one-line detail the BA provides for the topic it
// just completed (::topic=3::summary text::) — the sidebar shows it as the
// completed step's detail. The client uses this to advance the sidebar —
// see ChatStep.handleEvent.
export type ChatTopicEvent = { type: 'topic'; index: number; summary?: string };
// Emitted when the BA logs a blocking question the user deferred
// (::oq-add:: sentinel). The server validates + caps the payload and stamps
// askedAt — the sentinel JSON is never forwarded raw.
export type ChatOqAddEvent = { type: 'oq_add'; question: OutstandingQuestion };
// Emitted when the BA resolves a logged question (::oq-resolve:: sentinel).
// Unknown ids are a no-op on the client.
export type ChatOqResolveEvent = { type: 'oq_resolve'; id: string };
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
  // True on every reply once a project row exists in the launcher DB. Used
  // by the chat step to surface an "Open project →" deep link as soon as
  // the BA has emitted its first reply (Task 2.1).
  earlyProject?: boolean;
  // True when the conversation was persisted to .idea-memory/ on disk this
  // reply (Task 2.2). false (or memoryError set) means the write failed.
  memoryWritten?: boolean;
  memoryError?: string;
  // Deepest 1-based topic index the BA has reached in this session. Mirrors
  // the most recent `topic` event; included on the done event so the cursor
  // survives reconnects and matches the persisted transcript on resume.
  currentTopic?: number | null;
};
export type ChatEvent =
  | ChatTokenEvent
  | ChatErrorEvent
  | ChatTopicEvent
  | ChatOqAddEvent
  | ChatOqResolveEvent
  | ChatDoneEvent;

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

// ── /api/projects/:id/resume (intake — restore in-progress chat) ──────────
//
// Called by NewIdeaScreen when the URL carries ?resume=<slug>. The server
// reads .idea-memory/conversation.jsonl from the project's folder, recreates
// an IntakeSession, and returns the parsed transcript + topic-progress
// counters so ChatStep can seed its local state.

export type ResumeResponse = {
  project: {
    id: number;
    name: string;
    slug: string;
    current_stage: StageKey;
    folder_path: string;
  };
  sessionId: string;
  messages: ChatMessage[];
  // Conversation caps — same values surfaced by /api/init.
  maxMessages: number;
  warnThreshold: number;
  topicProgress: {
    capturedTopics: number;
    skippedTopics: number;
    currentIndex: number;
    // Deepest 1-based ::topic=N:: marker seen in the persisted transcript.
    // Null when the transcript has no markers yet (older sessions) — fall
    // back to currentIndex in that case.
    currentTopic: number | null;
  };
  // Outstanding questions derived from the persisted ::oq-add:: /
  // ::oq-resolve:: markers — the panel state the user left behind.
  outstandingQuestions: OutstandingQuestion[];
  // BA-provided one-line summaries for completed topics, keyed by topic
  // index (marker index − 1). Seeds the sidebar details on resume.
  topicSummaries: Record<number, string>;
};

export class ResumeUnavailableError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function fetchResume(slug: string): Promise<ResumeResponse> {
  const res = await fetch(`/api/projects/${encodeURIComponent(slug)}/resume`);
  // Same offline-detection trick used by the other API helpers: Vite's SPA
  // fallback returns index.html (text/html) when the dev API isn't running.
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'API server is not running. Start it with `npm run dev` (or `npm run dev:api` in another terminal).',
    );
  }
  const data = (await res.json().catch(() => ({}))) as Partial<ResumeResponse> & { error?: string };
  if (!res.ok) {
    throw new ResumeUnavailableError(res.status, data.error ?? `Resume failed (HTTP ${res.status})`);
  }
  return data as ResumeResponse;
}
