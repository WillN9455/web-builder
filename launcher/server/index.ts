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
// sessionId → session record. Created by /api/init, required by /api/chat.
// Lost on server restart; the project-dir.txt pin survives so the framework
// repo always knows the most recent workspace.
type IntakeSession = {
  dir: string;
  // Optional project name supplied at /api/init. When set, it overrides
  // whatever the BA Agent would invent during the interview. When null,
  // the BA's first non-empty projectName wins (falling back to "New project"
  // if the BA never names it).
  nameSeed: string | null;
  // Project row created on the first BA reply — see createEarlyProjectIfNeeded.
  // Once created, the chat step can deep-link back to the project even if the
  // interview is abandoned mid-way.
  earlyProjectId: number | null;
  earlyProjectSlug: string | null;
  // Running message history (user + assistant). Persisted as memory files on
  // each /api/chat reply so an aborted session doesn't lose the transcript.
  history: ChatMessage[];
  // Highest 1-based topic index the BA has transitioned to in this session.
  // Drives the interview progress cursor; on resume, the /resume endpoint
  // re-derives this from the persisted transcript so the cursor lines up
  // with what the BA actually said.
  currentTopic: number | null;
};
const sessions = new Map<string, IntakeSession>();

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
  const body = (req.body ?? {}) as { dir?: unknown; projectName?: unknown };
  try {
    const info = initProjectDir(body.dir);
    const sessionId = newSessionId();
    // Accept an optional project name (Task 1.4 / Task 2): when set, the BA
    // Agent won't override it. Trim once and store the canonical form.
    const rawName = typeof body.projectName === 'string' ? body.projectName.trim() : '';
    const nameSeed = rawName ? rawName : null;
    sessions.set(sessionId, {
      dir: info.abs,
      nameSeed,
      earlyProjectId: null,
      earlyProjectSlug: null,
      history: [],
      currentTopic: null,
    });

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

// ── Memory files (.idea-memory/) ───────────────────────────────────────────
//
// The full conversation is persisted on every BA reply so the user (and
// future framework agents) can refer back to it. Two files are written:
//   • conversation.jsonl — one JSON entry per message (machine-readable)
//   • transcript.md      — human-readable mirror (what the user sees in chat)
//
// Writes are best-effort: a filesystem failure logs to stderr but doesn't
// break the chat stream. The DB row is the source of truth — these files
// are convenience artefacts.
function writeMemoryFiles(projectDir: string, history: ChatMessage[]): { transcriptPath: string; jsonlPath: string } | null {
  try {
    const memDir = path.join(projectDir, '.idea-memory');
    fs.mkdirSync(memDir, { recursive: true });
    const ts = new Date().toISOString();
    const jsonlPath = path.join(memDir, 'conversation.jsonl');
    const transcriptPath = path.join(memDir, 'transcript.md');

    // conversation.jsonl: append a header on first write, then each entry.
    const isFresh = !fs.existsSync(jsonlPath);
    const jsonl = fs.openSync(jsonlPath, 'a');
    if (isFresh) {
      fs.writeSync(jsonl, JSON.stringify({ kind: 'header', ts, messageCount: history.length }) + '\n');
    }
    for (const m of history) {
      fs.writeSync(jsonl, JSON.stringify({ kind: 'message', ts, role: m.role, content: m.content }) + '\n');
    }
    fs.closeSync(jsonl);

    // transcript.md: always rewrite the full transcript (cheap, keeps it
    // human-readable without needing to read jsonl). Strip the internal
    // ::topic=N:: markers from each assistant message — they live in the
    // JSONL for /resume to recover, but they aren't part of the
    // conversation a human reads.
    const TOPIC_RE = /::topic=\d+::\s*/g;
    const lines: string[] = [];
    lines.push('# BA Agent interview transcript');
    lines.push('');
    lines.push(`Project: \`${projectDir}\``);
    lines.push(`Captured: ${ts}`);
    lines.push(`Messages: ${history.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    for (const m of history) {
      const who = m.role === 'user' ? 'You' : 'BA Agent';
      lines.push(`## ${who}`);
      lines.push('');
      lines.push(m.role === 'assistant' ? m.content.replace(TOPIC_RE, '') : m.content);
      lines.push('');
    }
    fs.writeFileSync(transcriptPath, lines.join('\n'), 'utf-8');

    return { transcriptPath, jsonlPath };
  } catch (err) {
    // Don't fail the chat over a missing .idea-memory write — surface in logs.
    console.error('[api] failed to write memory files:', err);
    return null;
  }
}

// ── Early project creation (Task 2.1) ─────────────────────────────────────
//
// As soon as the BA Agent has replied at least once, we materialise a project
// row in the launcher DB so the chat can deep-link back to it. The row
// starts with the placeholder name "New project" (or whatever the user typed
// at /api/init) and gets renamed when the BA emits the final idea fence.
function createEarlyProject(session: IntakeSession): { id: number; slug: string } {
  const name = session.nameSeed ?? 'New project';
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
      one_liner: 'Idea in progress — BA Agent is interviewing.',
      category: 'Idea',
      folder_path: session.dir,
      tile_color: tileColor,
    });
  const projectId = Number(info.lastInsertRowid);

  db.prepare(
    `INSERT INTO stage (project_id, stage_key, status, started_at)
     VALUES (?, 'Intake', 'active', datetime('now'))`,
  ).run(projectId);

  db.prepare(
    `INSERT INTO activity (project_id, agent, message, kind)
     VALUES (?, 'BA', 'Started idea intake interview', 'milestone')`,
  ).run(projectId);

  session.earlyProjectId = projectId;
  session.earlyProjectSlug = slug;
  return { id: projectId, slug };
}

// Rename an existing project row + refresh its slug/updated_at.
// Called when the BA emits the final idea fence and we have a real name.
function renameProject(projectId: number, newName: string): void {
  const slug = uniqueSlug(slugify(newName));
  db.prepare(
    `UPDATE project
       SET name = ?, slug = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(newName, slug, projectId);
}

app.post('/api/chat', async (req, res) => {
  const body = (req.body ?? {}) as { sessionId?: unknown; messages?: unknown };

  const session = typeof body.sessionId === 'string' ? sessions.get(body.sessionId) : undefined;
  if (!session) {
    res.status(400).json({ error: 'No active session — set a project folder first.' });
    return;
  }

  const validationError = validateMessages(body.messages);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  // Save the latest message history into the session so /api/chat handlers
  // running in parallel / on restart could re-read it. We also seed the
  // in-memory record used for memory-file writes below.
  const incoming = body.messages as ChatMessage[];
  session.history = incoming;

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
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...incoming],
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
  // Marker detection. The BA may emit `::topic=N::` (or any close
  // variation) as a single token, or split across two tokens
  // (e.g. `::` then `topic=2::`). We carry over the last few characters
  // of each token until the next arrives so a split marker is still
  // recognised. Anything that COULD be the start of a marker is held back
  // from the streamed text — if the next token completes the marker, we
  // emit a `topic` event and drop both halves; if it doesn't, we flush
  // the carryover as ordinary text.
  //
  // The marker is the longest sentinel we recognise (10 chars), so the
  // carryover never needs to be bigger than that. We keep a couple extra
  // chars for safety against `::topic = N::` style variations.
  const MARKER_MAX = 16;
  let carry = '';
  let lastTopicIndex: number | null = null;
  // Permissive: allow optional whitespace inside the colons / around the
  // `=`, accept uppercase ::TOPIC=n::, and tolerate one trailing colon.
  // Capture group 1 is the digit(s).
  const TOPIC_MARKER_RE = /::\s*topic\s*=\s*(\d+)\s*::/gi;
  const stripTopicMarker = (text: string): string => text.replace(TOPIC_MARKER_RE, '');

  // Process a chunk of text that may contain a (possibly split) marker.
  // Streams out everything that is definitely NOT part of a marker, emits
  // `topic` events for any complete marker it finds, and stashes the rest
  // in `carry` for the next call.
  function processText(text: string): void {
    const combined = carry + text;
    carry = '';
    let cursor = 0;
    let m: RegExpExecArray | null;
    TOPIC_MARKER_RE.lastIndex = 0;
    while ((m = TOPIC_MARKER_RE.exec(combined)) !== null) {
      // Flush everything before the match as ordinary text.
      if (m.index > cursor) {
        const before = combined.slice(cursor, m.index);
        if (before) {
          full += before;
          sendNdjson(res, { type: 'token', content: before });
        }
      }
      // Emit the topic event.
      const idx = Number(m[1]);
      if (Number.isInteger(idx) && idx > 0 && (lastTopicIndex === null || idx > lastTopicIndex)) {
        lastTopicIndex = idx;
        sendNdjson(res, { type: 'topic', index: idx });
      }
      cursor = m.index + m[0].length;
    }
    // Tail handling: hold back the last MARKER_MAX chars so a marker split
    // across tokens is still caught on the next call. Everything between
    // `cursor` and the safe-to-emit prefix is streamed.
    const safeLen = Math.max(0, combined.length - cursor - MARKER_MAX);
    if (safeLen > 0) {
      const flush = combined.slice(cursor, cursor + safeLen);
      full += flush;
      sendNdjson(res, { type: 'token', content: flush });
      carry = combined.slice(cursor + safeLen);
    } else {
      carry = combined.slice(cursor);
    }
  }

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
            processText(token);
          }
        } catch {
          // partial line — leave in buffer
        }
      }
    }
    // Stream ended — drain the carryover. If it contains a complete
    // marker, emit the topic event and drop the marker text. If it looks
    // like a partial marker (e.g. `::topic=2` with no trailing `::`),
    // drop it — we'd rather lose a few punctuation chars than leak a
    // raw `::topic=2::` to the user. Otherwise flush as ordinary text.
    if (carry) {
      TOPIC_MARKER_RE.lastIndex = 0;
      const mEnd = TOPIC_MARKER_RE.exec(carry);
      if (mEnd) {
        const before = carry.slice(0, mEnd.index);
        const after = carry.slice(mEnd.index + mEnd[0].length);
        if (before) {
          full += before;
          sendNdjson(res, { type: 'token', content: before });
        }
        const idx = Number(mEnd[1]);
        if (Number.isInteger(idx) && idx > 0 && (lastTopicIndex === null || idx > lastTopicIndex)) {
          lastTopicIndex = idx;
          sendNdjson(res, { type: 'topic', index: idx });
        }
        if (after) {
          full += after;
          sendNdjson(res, { type: 'token', content: after });
        }
      } else if (/::\s*topic\s*=/i.test(carry)) {
        // Looks like a partial marker — drop it rather than leak the
        // sentinel to the user.
      } else {
        full += carry;
        sendNdjson(res, { type: 'token', content: carry });
      }
      carry = '';
    }
  } catch {
    sendNdjson(res, { type: 'error', message: 'Lost connection to Ollama mid-response.' });
    res.end();
    return;
  }

  // Defensive: re-scan the full reply for any marker we somehow missed
  // (e.g. one that landed entirely inside the carryover buffer because the
  // model emitted the whole thing in a single token that got flushed
  // verbatim at stream-end). Strip any remaining text and emit the topic
  // event the streaming path skipped, so the sidebar still advances.
  TOPIC_MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const missed: number[] = [];
  const cleaned = full.replace(TOPIC_MARKER_RE, (_match, digits: string) => {
    const idx = Number(digits);
    if (Number.isInteger(idx) && idx > 0) missed.push(idx);
    return '';
  });
  if (missed.length) {
    full = cleaned;
    for (const idx of missed) {
      if (lastTopicIndex === null || idx > lastTopicIndex) {
        lastTopicIndex = idx;
        sendNdjson(res, { type: 'topic', index: idx });
      }
    }
  }
  // Sync the per-session cursor so /resume (or a follow-up request) can
  // report the deepest topic reached so far.
  if (lastTopicIndex !== null) session.currentTopic = lastTopicIndex;

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
    // True on every reply once a project row exists — the client uses this
    // to deep-link "Open project →" out of the chat step before the BA
    // finishes.
    earlyProject?: boolean;
    memoryWritten?: boolean;
    memoryError?: string;
    // Deepest 1-based topic index the BA has reached in this session. The
    // client uses this as a final reconciliation pass in case any streaming
    // `topic` events were dropped or coalesced.
    currentTopic?: number | null;
  };

  // Append the freshly-emitted assistant reply to the session history so the
  // memory files reflect the full conversation, not just what the user sent.
  // We keep the un-stripped `full` (with ::topic=N:: markers intact) so the
  // /resume endpoint can re-derive the sidebar cursor by scanning the JSONL.
  // The user-facing transcript.md gets the cleaned version below.
  const assistantReply: ChatMessage = { role: 'assistant', content: full };
  session.history = [...incoming, assistantReply];

  // Persist the conversation every reply (Task 2.2). A aborted session
  // still has its transcript on disk.
  //
  // For the human-readable transcript.md we want the topic markers gone
  // (they're internal signalling, not conversation); for the JSONL we keep
  // them so /resume can re-derive the sidebar cursor. writeMemoryFiles
  // handles the split.
  const memResult = writeMemoryFiles(session.dir, session.history);

  // Create the project row on the first BA reply (Task 2.1). Idempotent —
  // if a row already exists from a previous reply, we reuse it.
  if (session.earlyProjectId === null) {
    try {
      const proj = createEarlyProject(session);
      // Already mutated the session inside createEarlyProject.
      void proj; // (slugs/id are surfaced via the done event below)
    } catch (err) {
      // Don't break the stream — the client can still show the captured step
      // without a deep link; the final fence handler will create a row anyway.
      console.error('[api] failed to create early project row:', err);
    }
  }

  const doneEvent: DoneEvent = {
    type: 'done',
    model: MODEL,
    earlyProject: session.earlyProjectId !== null,
    projectId: session.earlyProjectId ?? undefined,
    projectSlug: session.earlyProjectSlug ?? undefined,
    memoryWritten: memResult !== null,
    // The latest 1-based topic index the BA has transitioned to. Null until
    // the BA has emitted at least one ::topic=N:: marker; thereafter it
    // reflects the deepest topic the BA has reached in this session.
    currentTopic: lastTopicIndex,
  };
  if (memResult === null) {
    doneEvent.memoryError = 'Could not write memory files — see server logs.';
  }

  const idea = extractIdea(full);
  if (idea) {
    try {
      const result = writeIdeaFile(session.dir, idea);
      doneEvent.ideaWritten = true;
      doneEvent.ideaPath = result.path;
      doneEvent.backupPath = result.backupPath;

      // Honour the user's nameSeed: if they typed a name at /api/init, keep
      // it. Otherwise adopt the BA's projectName. Either way, rename the
      // existing early row in place — don't create a duplicate.
      const chosenName = (session.nameSeed ?? idea.projectName ?? '').trim() || 'New project';
      if (session.earlyProjectId !== null) {
        try {
          renameProject(session.earlyProjectId, chosenName);
          doneEvent.projectName = chosenName;
          // Refresh slug on the session so the client can deep-link by slug.
          const row = db
            .prepare('SELECT slug FROM project WHERE id = ?')
            .get(session.earlyProjectId) as { slug: string } | undefined;
          if (row) session.earlyProjectSlug = row.slug;
        } catch (err) {
          doneEvent.projectCreateError =
            'idea.md was written but the project row could not be renamed: ' +
            (err instanceof Error ? err.message : String(err));
        }
      } else {
        // Fallback: no early row (shouldn't happen now, but keep parity with
        // the original flow). Insert a brand-new row.
        try {
          const proj = insertProjectFromIdea(idea, session.dir);
          // Override the name the BA suggested if the user typed one.
          if (session.nameSeed) {
            renameProject(proj.id, session.nameSeed);
          }
          session.earlyProjectId = proj.id;
          session.earlyProjectSlug = (
            db.prepare('SELECT slug FROM project WHERE id = ?').get(proj.id) as { slug: string }
          ).slug;
          doneEvent.projectId = proj.id;
          doneEvent.projectSlug = session.earlyProjectSlug;
          doneEvent.projectName = session.nameSeed ?? idea.projectName ?? null;
        } catch (err) {
          doneEvent.projectCreateError =
            err instanceof Error ? err.message : 'Could not create project row';
        }
      }
      // Re-surface the slug/id now that we may have renamed it.
      doneEvent.projectId = session.earlyProjectId ?? doneEvent.projectId;
      doneEvent.projectSlug = session.earlyProjectSlug ?? doneEvent.projectSlug;
    } catch (err) {
      doneEvent.ideaWritten = false;
      doneEvent.ideaWriteError =
        'Reply looked final but idea.md could not be written: ' +
        (err instanceof Error ? err.message : String(err));
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

// Resume an in-progress BA interview from disk. The project row plus the
// `.idea-memory/conversation.jsonl` file are the source of truth — when a
// user clicks an Intake-stage tile from the launcher we re-hydrate the chat
// from these artefacts rather than starting over.
app.get('/api/projects/:id/resume', (req, res) => {
  const row = db
    .prepare('SELECT * FROM project WHERE id = ? OR slug = ?')
    .get(req.params.id, req.params.id) as ProjectRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  if (row.current_stage !== 'Intake') {
    res.status(409).json({ error: 'Project is not in Intake stage — open the detail page.' });
    return;
  }
  // Defensive: if idea.md was already written, the interview is effectively
  // complete even though current_stage hasn't moved on yet. Send the user
  // to the detail page rather than re-opening a finished chat.
  if (fs.existsSync(path.join(row.folder_path, 'idea.md'))) {
    res.status(409).json({ error: 'Idea already captured — open the detail page.' });
    return;
  }

  const jsonlPath = path.join(row.folder_path, '.idea-memory', 'conversation.jsonl');
  if (!fs.existsSync(jsonlPath)) {
    res.status(410).json({ error: 'No transcript on disk for this project.' });
    return;
  }

  // Parse the JSONL. Skip the header line, validate every entry, drop
  // anything that doesn't look like a message — never trust the file blindly.
  const raw = fs.readFileSync(jsonlPath, 'utf-8');
  const messages: ChatMessage[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as { kind?: string; role?: string; content?: unknown };
      if (entry.kind !== 'message') continue;
      if (entry.role !== 'user' && entry.role !== 'assistant') continue;
      if (typeof entry.content !== 'string' || !entry.content.trim()) continue;
      messages.push({ role: entry.role, content: entry.content });
    } catch {
      // skip malformed lines — the chat transcript is best-effort
    }
  }
  if (messages.length === 0) {
    res.status(410).json({ error: 'Transcript is empty.' });
    return;
  }

  // Re-create an in-memory session so subsequent /api/chat calls work the
  // same way as for an in-progress interview. Point earlyProjectId at the
  // existing row so createEarlyProject() doesn't insert a duplicate.
  const sessionId = newSessionId();
  sessions.set(sessionId, {
    dir: row.folder_path,
    nameSeed: row.name && row.name !== 'New project' ? row.name : null,
    earlyProjectId: row.id,
    earlyProjectSlug: row.slug,
    history: messages,
    currentTopic: null, // populated below from the transcript
  });

  // Derive topic progress from the persisted transcript:
  //   • currentTopic = the deepest ::topic=N:: marker found in any assistant
  //     message (so the sidebar resumes at the right step even if the user
  //     closed the tab mid-topic).
  //   • capturedTopics / skippedTopics mirror the legacy skip-vs-answer
  //     counting so the client can build its initial step list without
  //     scanning the messages twice.
  const TOPIC_RE = /::topic=(\d+)::/g;
  let currentTopic: number | null = null;
  let captured = 0;
  let skipped = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'assistant') {
      let match: RegExpExecArray | null;
      TOPIC_RE.lastIndex = 0;
      while ((match = TOPIC_RE.exec(m.content)) !== null) {
        const n = Number(match[1]);
        if (Number.isInteger(n) && n > 0 && (currentTopic === null || n > currentTopic)) {
          currentTopic = n;
        }
      }
    }
    if (i + 1 < messages.length) {
      const next = messages[i + 1];
      if (m.role !== 'user' || next.role !== 'assistant') continue;
      if (m.content.startsWith('Skip — please fill this in yourself.')) skipped++;
      else captured++;
    }
  }
  const sessionRecord = sessions.get(sessionId);
  if (sessionRecord) sessionRecord.currentTopic = currentTopic;
  // Cap at the number of user-driven topics in the sidebar. 0=folder-done,
  // 1..8 = the BA prompt's 8 topics. We don't ship a hard cap on the server
  // side — the client renders whatever index it gets.
  const currentIndex = currentTopic ?? Math.min(1 + captured + skipped, 8);

  res.json({
    project: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      current_stage: row.current_stage,
      folder_path: row.folder_path,
    },
    sessionId,
    messages,
    topicProgress: {
      capturedTopics: captured,
      skippedTopics: skipped,
      currentIndex,
      // Deepest ::topic=N:: marker seen — preferred over currentIndex when
      // the client wants the cursor to match the BA's actual transitions.
      currentTopic,
    },
  });
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
