// Idea Hub — local API.
//
// Exposes /api/projects* + /api/init + /api/chat + /api/health over a thin
// Express layer backed by SQLite. The Vite dev server proxies /api/* here.

import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { migrate, db } from './db.js';
import {
  initProjectDir,
  MODEL,
  OLLAMA,
  REPO_ROOT,
  SYSTEM_PROMPT,
  MAX_BODY_BYTES,
  buildIdeaTxt,
  extractIdea,
  newSessionId,
  validateMessages,
  writeIdeaFile,
  type ChatMessage,
} from './intake.js';

migrate();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ── Types ──────────────────────────────────────────────────────────────────

type ProjectRow = {
  id: number;
  name: string;
  slug: string;
  one_liner: string;
  category: string;
  folder_path: string;
  current_stage: string;
  status: string;
  priority: string;
  tasks_total: number;
  tasks_done: number;
  chats_count: number;
  tile_color: string;
  updated_relative: string;
  created_at: string;
  updated_at: string;
};

type IdeaJson = NonNullable<ReturnType<typeof extractIdea>>;

// ── Intake session store ───────────────────────────────────────────────────
// sessionId → absolute project dir. Created by /api/init, required by /api/chat.
// Lost on server restart; the project-dir.txt pin survives so the framework
// repo always knows the most recent workspace.
const sessions = new Map<string, string>();

// ── Helpers ────────────────────────────────────────────────────────────────

function firstSentence(s: string, max = 140): string {
  const trimmed = s.trim().replace(/\s+/g, ' ');
  const stop = trimmed.search(/[.!?]\s/);
  const head = stop > 0 ? trimmed.slice(0, stop + 1) : trimmed;
  return head.length > max ? head.slice(0, max - 1).trimEnd() + '…' : head;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'untitled';
}

function uniqueSlug(base: string): string {
  // Append -2, -3, … until no row exists with that slug.
  const exists = db.prepare('SELECT 1 FROM project WHERE slug = ?');
  if (!exists.get(base)) return base;
  let n = 2;
  while (exists.get(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const TILE_COLORS = ['peach', 'sky', 'mint', 'lavender', 'butter', 'blush'] as const;
function pickTileColor(seed: string): (typeof TILE_COLORS)[number] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}

type InsertProjectResult = { id: number; slug: string };

function insertProjectFromIdea(idea: IdeaJson, folderPath: string): InsertProjectResult {
  const name = (idea.projectName ?? '').trim() || 'Untitled Idea';
  const problem = (idea.problemStatement ?? '').trim();
  const oneLiner = problem ? firstSentence(problem) : 'Idea captured by BA Agent interview.';
  const slug = uniqueSlug(slugify(name));
  const tileColor = pickTileColor(slug);

  const info = db
    .prepare(
      `INSERT INTO project
         (name, slug, one_liner, category, folder_path,
          current_stage, status, priority, tasks_total, tasks_done,
          chats_count, tile_color, updated_relative)
       VALUES
         (@name, @slug, @one_liner, @category, @folder_path,
          'Intake', 'active', 'medium', 0, 0,
          1, @tile_color, 'just now')`,
    )
    .run({
      name,
      slug,
      one_liner: oneLiner,
      category: 'Idea',
      folder_path: folderPath,
      tile_color: tileColor,
    });

  const projectId = Number(info.lastInsertRowid);

  // Stage row so the project shows up as "in Intake" on detail views.
  db.prepare(
    `INSERT INTO stage (project_id, stage_key, status, started_at)
     VALUES (?, 'Intake', 'active', datetime('now'))`,
  ).run(projectId);

  // Activity entry — BA Agent milestone.
  db.prepare(
    `INSERT INTO activity (project_id, agent, message, kind)
     VALUES (?, 'BA', 'Captured idea and wrote idea.md', 'milestone')`,
  ).run(projectId);

  // Initial artifact — the idea.md that just landed.
  db.prepare(
    `INSERT INTO artifact (project_id, stage_key, label, path, kind)
     VALUES (?, 'Intake', 'idea.md', 'idea.md', 'markdown')`,
  ).run(projectId);

  return { id: projectId, slug };
}

// ── Body reader with size cap (parity with idea-intake/server.js) ──────────

function readBody(req: express.Request): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/api/health', async (_req, res) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(OLLAMA + '/api/tags', { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error('Ollama returned HTTP ' + r.status);
    const data = (await r.json()) as { models?: Array<{ name: string }> };
    const names = (data.models ?? []).map((m) => m.name);
    res.json({
      ok: true,
      model: MODEL,
      modelPresent: names.includes(MODEL),
      availableModels: names,
    });
  } catch {
    res.status(503).json({
      ok: false,
      model: MODEL,
      message: 'Cannot reach Ollama at ' + OLLAMA + '. Start it with: ollama serve',
    });
  }
});

app.post('/api/init', async (req, res) => {
  // express.json has already parsed the body, but readBody() is here for
  // safety in case the limit is exceeded and the raw stream is needed.
  const body = (req.body ?? {}) as { dir?: unknown };
  try {
    const info = initProjectDir(body.dir);
    const sessionId = newSessionId();
    sessions.set(sessionId, info.abs);

    // Pin the workspace root for any framework session launched from this repo:
    // CLAUDE.md §Workspace Root tells every agent to read project-dir.txt and
    // direct all artifact writes there instead of into the framework repo.
    const pointerPath = path.join(REPO_ROOT, 'project-dir.txt');
    fs.writeFileSync(pointerPath, info.abs + '\n', 'utf-8');

    res.json({
      ok: true,
      sessionId,
      dir: info.abs,
      existed: info.existed,
      filesCopied: info.copied,
      filesSkipped: info.skipped,
      workspacePinnedAt: pointerPath,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Init failed' });
  }
});

function sendNdjson(res: express.Response, obj: unknown): void {
  res.write(JSON.stringify(obj) + '\n');
}

app.post('/api/chat', async (req, res) => {
  const body = (req.body ?? {}) as { sessionId?: unknown; messages?: unknown };

  const projectDir = typeof body.sessionId === 'string' ? sessions.get(body.sessionId) : undefined;
  if (!projectDir) {
    res.status(400).json({ error: 'No active session — set a project folder first.' });
    return;
  }

  const validationError = validateMessages(body.messages);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(OLLAMA + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...(body.messages as ChatMessage[])],
      }),
    });
  } catch {
    sendNdjson(res, { type: 'error', message: 'Cannot reach Ollama. Start it with: ollama serve' });
    res.end();
    return;
  }

  if (!ollamaRes.ok || !ollamaRes.body) {
    const hint =
      ollamaRes.status === 404
        ? "Model '" + MODEL + "' not found. Pull it with: ollama pull " + MODEL
        : 'Ollama error (HTTP ' + ollamaRes.status + ').';
    sendNdjson(res, { type: 'error', message: hint });
    res.end();
    return;
  }

  let full = '';
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for await (const chunk of ollamaRes.body) {
      const piece = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as ArrayBuffer);
      buffer += decoder.decode(piece, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line) as { message?: { content?: string } };
          const token = evt.message?.content;
          if (typeof token === 'string' && token) {
            full += token;
            sendNdjson(res, { type: 'token', content: token });
          }
        } catch {
          // partial line — leave in buffer
        }
      }
    }
  } catch {
    sendNdjson(res, { type: 'error', message: 'Lost connection to Ollama mid-response.' });
    res.end();
    return;
  }

  type DoneEvent = {
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

  const doneEvent: DoneEvent = { type: 'done', model: MODEL };
  const idea = extractIdea(full);
  if (idea) {
    try {
      const result = writeIdeaFile(projectDir, idea);
      doneEvent.ideaWritten = true;
      doneEvent.ideaPath = result.path;
      doneEvent.backupPath = result.backupPath;
      doneEvent.projectName = idea.projectName ?? null;

      try {
        const proj = insertProjectFromIdea(idea, projectDir);
        doneEvent.projectId = proj.id;
        doneEvent.projectSlug = proj.slug;
      } catch (err) {
        // idea.md is on disk; the project row failed. Surface the error but
        // still emit done so the client can show "captured" with a warning.
        doneEvent.projectCreateError = err instanceof Error ? err.message : 'Could not create project row';
      }
    } catch (err) {
      doneEvent.ideaWritten = false;
      doneEvent.ideaWriteError = 'Reply looked final but idea.md could not be written: ' + (err instanceof Error ? err.message : String(err));
    }
  }
  sendNdjson(res, doneEvent);
  res.end();
});

// --- Projects --------------------------------------------------------------

app.get('/api/projects', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM project ORDER BY
         CASE current_stage WHEN 'Build' THEN 0 WHEN 'Design' THEN 1
                             WHEN 'PRD'   THEN 2 WHEN 'Review' THEN 3
                             WHEN 'QA'    THEN 4 WHEN 'Intake' THEN 5
                             ELSE 6 END,
         updated_at DESC`,
    )
    .all() as ProjectRow[];

  const byStatus = db
    .prepare(`SELECT status, COUNT(*) AS n FROM project GROUP BY status`)
    .all() as Array<{ status: string; n: number }>;

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(tasks_done), 0) AS done,
         COALESCE(SUM(tasks_total), 0) AS total
       FROM project`,
    )
    .get() as { done: number; total: number };

  const completion = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;

  const next = rows.find((r) => r.status === 'active' || r.status === 'review');

  res.json({
    projects: rows,
    pipeline: {
      completion,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
      totalProjects: rows.length,
      blocked: byStatus.find((r) => r.status === 'blocked')?.n ?? 0,
    },
    nextMilestone: next
      ? {
          projectId: next.id,
          name: next.name,
          stage: next.current_stage,
          daysLeft: 5, // placeholder until calendar wiring lands
        }
      : null,
  });
});

app.get('/api/projects/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM project WHERE id = ? OR slug = ?')
    .get(req.params.id, req.params.id) as ProjectRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const stages = db
    .prepare('SELECT stage_key, status, started_at, completed_at FROM stage WHERE project_id = ? ORDER BY id')
    .all(row.id);
  res.json({ project: row, stages });
});

// Silence "unused" warnings for the size-cap helper that lives for parity
// with the original server (handles raw-stream bodies if express.json fails).
void readBody;

// --- Error handler --------------------------------------------------------
// Catches anything the per-route try/catches missed (sync throws, unhandled
// rejections, etc.) and turns them into a JSON 500 instead of Express's
// default HTML error page. The frontend's API helpers detect non-JSON
// responses and surface a friendly "API server is not running" message;
// without this middleware, an internal error would produce HTML and look
// like a missing backend.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('[api] unhandled error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: message });
});

const PORT = Number(process.env.PORT ?? 5184);
app.listen(PORT, () => {
  console.log(`[api] Idea Hub API listening on http://localhost:${PORT}`);
});
