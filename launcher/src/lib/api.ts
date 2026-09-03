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

// ── /api/projects/:id (project shell) ──────────────────────────────────────

// The server returns the full project row plus its stage rows; the shell
// (ProjectDetailScreen) only consumes these fields today. context_confirmed
// is the State D gate flag (was the CONTEXT_CONFIRMED constant in
// src/lib/projectGate.ts); ba_artifact_count is the Project Background count
// chip (null when the project's PRD/ dir can't be read → chip omitted).
export type ProjectDetailResponse = {
  project: Pick<Project, 'id' | 'name' | 'slug' | 'current_stage' | 'folder_path'> & {
    context_confirmed: boolean;
    ba_artifact_count: number | null;
  };
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

// ── /api/projects/:id/ba-workspace (Project Background tab) ────────────────

// Per-file review status (sitemap locked decision 6: terminal state is
// `approved` — the build plan's `completed` is stale).
export type BaStatus = 'draft' | 'in_review' | 'returned' | 'approved';

export type BaFile = {
  filename: string;
  // Band key: 'core-prd' | 'scope-rules' | 'data-access' | 'planning-risk' |
  // 'sa-handoff'.
  band: string;
  title: string;
  status: BaStatus;
};

export type BaCounts = {
  draft: number;
  in_review: number;
  returned: number;
  approved: number;
  total: number;
};

export type BaFilesResponse = {
  files: BaFile[];
  // Band keys + labels in sitemap order — the client groups the tree by this.
  // total = the band's artifact count (generation panel band progress).
  bands: { key: string; label: string; total: number }[];
  counts: BaCounts;
  // State D gate: contextReady = all 17 artifacts exist on disk and are
  // approved. contextConfirmed = the one-shot confirm has fired. A confirmed
  // project whose files later drop out of Approved shows
  // contextChangedSinceConfirm (keep unlocked, warn only — locked decision 7).
  contextReady: boolean;
  contextConfirmed: boolean;
  contextChangedSinceConfirm: boolean;
  // BA auto-draft generation state (AC-17/AC-18) — null when the project never
  // had a run; the screen's empty state + manual trigger own that case.
  generation: BaGeneration | null;
};

export type BaComment = {
  id: number;
  author: 'BA' | 'SA';
  body: string;
  created_at: string;
};

// BA auto-draft generation state (plan addendum AC-17). count = how many of
// the 17 artifacts exist on disk; current = the artifact being drafted.
// Null on the response when the project never had a generation run.
export type BaGeneration = {
  state: 'pending' | 'generating' | 'done' | 'failed';
  count: number;
  current: string | null;
  error: string | null;
};

// Offline-detection + error extraction shared by the ba-workspace fetchers —
// same contract as fetchProjects: Vite's SPA fallback returns index.html
// (text/html) when the dev API isn't running, and a JSON error body carries
// {error} when the status isn't OK.
async function baFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'API server is not running. Start it with `npm run dev` (or `npm run dev:api` in another terminal).',
    );
  }
  const data = (await res.json().catch(() => ({}))) as Partial<T> & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (HTTP ${res.status})`);
  return data as T;
}

export async function fetchBaFiles(idOrSlug: string): Promise<BaFilesResponse> {
  return baFetch(`/api/projects/${encodeURIComponent(idOrSlug)}/ba-workspace/files`);
}

export type BaFileBodyResponse = { filename: string; title: string; content: string };

export async function fetchBaFile(idOrSlug: string, filename: string): Promise<BaFileBodyResponse> {
  return baFetch(
    `/api/projects/${encodeURIComponent(idOrSlug)}/ba-workspace/files/${encodeURIComponent(filename)}`,
  );
}

export type BaSaveResponse = { ok: true; filename: string; status: BaStatus };

export async function saveBaFile(
  idOrSlug: string,
  filename: string,
  content: string,
): Promise<BaSaveResponse> {
  return baFetch(
    `/api/projects/${encodeURIComponent(idOrSlug)}/ba-workspace/files/${encodeURIComponent(filename)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    },
  );
}

export type BaTransitionResponse = { ok: true; filename: string; status: BaStatus };

export async function transitionBaFile(
  idOrSlug: string,
  filename: string,
  to: BaStatus,
): Promise<BaTransitionResponse> {
  return baFetch(
    `/api/projects/${encodeURIComponent(idOrSlug)}/ba-workspace/files/${encodeURIComponent(filename)}/transition`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    },
  );
}

export async function fetchBaComments(
  idOrSlug: string,
  filename: string,
): Promise<{ comments: BaComment[] }> {
  return baFetch(
    `/api/projects/${encodeURIComponent(idOrSlug)}/ba-workspace/files/${encodeURIComponent(filename)}/comments`,
  );
}

export async function addBaComment(
  idOrSlug: string,
  filename: string,
  author: 'BA' | 'SA',
  body: string,
): Promise<{ ok: true; id: number }> {
  return baFetch(
    `/api/projects/${encodeURIComponent(idOrSlug)}/ba-workspace/files/${encodeURIComponent(filename)}/comments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, body }),
    },
  );
}

// Open-questions banner data — the count of `Blocker-for: PRD-approval`
// items parsed from open-questions.md. The banner stays hidden at 0.
export async function fetchBaOpenQuestions(
  idOrSlug: string,
): Promise<{ blockerCount: number }> {
  return baFetch(`/api/projects/${encodeURIComponent(idOrSlug)}/ba-workspace/open-questions`);
}

// BA auto-draft generation — manual trigger / retry (AC-18). Re-runs only
// missing files (skip-if-exists); 409 while a run is already in flight.
export type BaGenerationRetryResponse = { ok: true };

export async function retryBaGeneration(idOrSlug: string): Promise<BaGenerationRetryResponse> {
  return baFetch(
    `/api/projects/${encodeURIComponent(idOrSlug)}/ba-workspace/generation/retry`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
}

// State D — the one-shot gate confirmation. Idempotent on re-POST.
export type ConfirmContextResponse = {
  ok: true;
  contextConfirmed: true;
  alreadyConfirmed: boolean;
};

export async function confirmProjectContext(idOrSlug: string): Promise<ConfirmContextResponse> {
  return baFetch(`/api/projects/${encodeURIComponent(idOrSlug)}/background/confirm-context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

// ── /api/projects/:id/requirements (Requirements tab, screen 15) ───────────

import type {
  ReqOwner,
  ReqPriority,
  ReqStatus,
  ReqType,
} from '../../server/requirements-model';

// The grammar's single source of truth is server/requirements-model.ts —
// pure, no I/O, imported directly so the client's status dropdown can never
// drift from the server's state machine. Only the vocabulary + machine are
// consumed here; the serialized response shapes are re-declared below (the
// wire format strips the parser's internal geometry).
export type {
  ReqOwner,
  ReqPriority,
  ReqStatus,
  ReqType,
} from '../../server/requirements-model';

export type RequirementItem = {
  id: string; // BR-001 / TR-001
  type: 'BR' | 'TR';
  priority: ReqPriority | null;
  status: ReqStatus | null;
  owner: ReqOwner | null;
  text: string;
};

export type StoryItem = {
  usId: string; // US-01
  title: string;
  asA: string | null;
  iWantTo: string | null;
  soThat: string | null;
  priority: ReqPriority | null;
  status: ReqStatus | null;
  owner: ReqOwner | null;
  reqs: RequirementItem[];
};

export type RequirementsResponse = {
  stories: StoryItem[];
  businessReqs: RequirementItem[];
  // 'no-prd' → the project has no PRD/ folder yet; the tab renders its
  // friendly empty state and no add affordances (AC-4).
  source: 'ok' | 'no-prd';
  // Set when a file exists but couldn't be read/parsed — that file's rows are
  // hidden but the tab still renders (AC-10: never a 500).
  parseError?: string;
};

export type StoryInput = {
  title: string;
  asA: string;
  iWantTo: string;
  soThat: string;
  priority: ReqPriority;
  status: ReqStatus;
  owner: ReqOwner;
};

export type StoryPatch = Partial<StoryInput>;

export type RequirementInput = {
  type: ReqType;
  text: string;
  priority: ReqPriority;
  status: ReqStatus;
  owner: ReqOwner;
};

export type RequirementPatch = Partial<Omit<RequirementInput, 'type'>> & { type?: ReqType };

export class RequirementsValidationError extends Error {
  errors: Record<string, string>;
  constructor(errors: Record<string, string>) {
    super('Validation failed');
    this.name = 'RequirementsValidationError';
    this.errors = errors;
  }
}

// The delete guard (spec VALID): an approved/done requirement referenced by
// another story keeps its row — the server answers 409 with the referencing
// story ids so the UI can offer scroll-and-flash.
export class RequirementsDeleteGuardError extends Error {
  referencedBy: string[];
  constructor(message: string, referencedBy: string[]) {
    super(message);
    this.name = 'RequirementsDeleteGuardError';
    this.referencedBy = referencedBy;
  }
}

// Same offline-detection + error-extraction contract as baFetch, plus the
// Requirements-specific error shapes: {errors} → validation, {referencedBy} →
// delete guard.
async function reqFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'API server is not running. Start it with `npm run dev` (or `npm run dev:api` in another terminal).',
    );
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (data.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)) {
      throw new RequirementsValidationError(data.errors as Record<string, string>);
    }
    if (Array.isArray(data.referencedBy)) {
      throw new RequirementsDeleteGuardError(
        typeof data.error === 'string' ? data.error : `Delete failed (HTTP ${res.status})`,
        data.referencedBy as string[],
      );
    }
    throw new Error(typeof data.error === 'string' ? data.error : `Request failed (HTTP ${res.status})`);
  }
  return data as T;
}

export async function fetchRequirements(idOrSlug: string): Promise<RequirementsResponse> {
  return reqFetch(`/api/projects/${encodeURIComponent(idOrSlug)}/requirements`);
}

export type CreateStoryResponse = { ok: true; story: StoryItem };

export async function createStory(idOrSlug: string, input: StoryInput): Promise<CreateStoryResponse> {
  return reqFetch(`/api/projects/${encodeURIComponent(idOrSlug)}/stories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export type UpdateStoryResponse = { ok: true; story: StoryItem };

export async function updateStory(
  idOrSlug: string,
  usId: string,
  patch: Partial<StoryInput>,
): Promise<UpdateStoryResponse> {
  return reqFetch(
    `/api/projects/${encodeURIComponent(idOrSlug)}/stories/${encodeURIComponent(usId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
}

export async function deleteStory(idOrSlug: string, usId: string): Promise<{ ok: true; usId: string }> {
  return reqFetch(
    `/api/projects/${encodeURIComponent(idOrSlug)}/stories/${encodeURIComponent(usId)}`,
    { method: 'DELETE' },
  );
}

export type CreateRequirementResponse = { ok: true; requirement: RequirementItem };

export async function createRequirement(
  idOrSlug: string,
  usId: string,
  input: RequirementInput,
): Promise<CreateRequirementResponse> {
  return reqFetch(
    `/api/projects/${encodeURIComponent(idOrSlug)}/stories/${encodeURIComponent(usId)}/requirements`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
}

export type UpdateRequirementResponse = { ok: true; requirement: RequirementItem };

export async function updateRequirement(
  idOrSlug: string,
  reqId: string,
  patch: RequirementPatch,
): Promise<UpdateRequirementResponse> {
  return reqFetch(
    `/api/projects/${encodeURIComponent(idOrSlug)}/requirements/${encodeURIComponent(reqId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
}

export async function updateRequirementStatus(
  idOrSlug: string,
  reqId: string,
  status: ReqStatus,
): Promise<UpdateRequirementResponse> {
  return reqFetch(
    `/api/projects/${encodeURIComponent(idOrSlug)}/requirements/${encodeURIComponent(reqId)}/status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    },
  );
}

export async function deleteRequirement(idOrSlug: string, reqId: string): Promise<{ ok: true; id: string }> {
  return reqFetch(
    `/api/projects/${encodeURIComponent(idOrSlug)}/requirements/${encodeURIComponent(reqId)}`,
    { method: 'DELETE' },
  );
}
