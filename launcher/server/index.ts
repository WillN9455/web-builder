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
  validateProjectDir,
  scaffoldProjectDir,
  stagedMemoryDir,
  STAGED_SESSIONS_DIR,
  moveStagedMemory,
  MODEL,
  OLLAMA,
  SYSTEM_PROMPT,
  MAX_BODY_BYTES,
  MAX_MESSAGES,
  WARN_THRESHOLD,
  MAX_OQ_LIST,
  SENTINEL_RE,
  SENTINEL_STRIP_RE,
  TOPIC_SENTINEL_RE,
  buildIdeaTxt,
  deriveOutstandingQuestions,
  extractIdea,
  newSessionId,
  parseOqAddPayload,
  validateMessages,
  writeIdeaFile,
  type ChatMessage,
  type OutstandingQuestion,
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
  // How many entries of `history` have already been appended to
  // .idea-memory/conversation.jsonl. writeMemoryFiles appends only the delta
  // (history.slice(persistedCount)) each turn, so the JSONL grows linearly
  // instead of quadratically. Reset to 0 on a fresh session; seeded with the
  // deduped transcript length on resume.
  persistedCount: number;
  // Where this interview's .idea-memory lives: inside the project folder or
  // the launcher-side staging dir. Decided once — at the first successful
  // memory write (or on /resume, from whichever home holds the transcript) —
  // then sticky for the rest of the interview. A mid-interview session never
  // switches homes: switching when the user creates the folder at the picked
  // path would strand the early transcript in staging while /resume looks
  // folder-first, silently dropping it (PR #17 review finding 2).
  memoryHome: "folder" | "staging" | null;
  // Highest 1-based topic index the BA has transitioned to in this session.
  // Drives the interview progress cursor; on resume, the /resume endpoint
  // re-derives this from the persisted transcript so the cursor lines up
  // with what the BA actually said.
  currentTopic: number | null;
  // Outstanding questions the BA has logged via ::oq-add:: sentinels and not
  // yet resolved via ::oq-resolve::. Emitted live as oq_add/oq_resolve NDJSON
  // events; on resume the list is re-derived from the persisted transcript.
  outstandingQuestions: OutstandingQuestion[];
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
          'Requirements', 'active', 'medium', 0, 0,
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

  // Stage row so the project shows up as "in Requirements (intake complete)"
  // on detail views — the chat finished, the PRD has not started yet.
  db.prepare(
    `INSERT INTO stage (project_id, stage_key, status, started_at)
     VALUES (?, 'Requirements', 'active', datetime('now'))`,
  ).run(projectId);

  // Activity entry — BA Agent milestone.
  db.prepare(
    `INSERT INTO activity (project_id, agent, message, kind)
     VALUES (?, 'BA', 'Captured idea and wrote idea.md', 'milestone')`,
  ).run(projectId);

  // Initial artifact — the idea.md that just landed.
  db.prepare(
    `INSERT INTO artifact (project_id, stage_key, label, path, kind)
     VALUES (?, 'Requirements', 'idea.md', 'idea.md', 'markdown')`,
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
    // Validate only — nothing is written to disk here. The project folder is
    // created, scaffolded and pinned when the interview completes (final idea
    // fence), so an abandoned chat never leaves a scaffolded folder behind.
    // Owner decision, Web-builder thread 2026-09-02.
    const info = validateProjectDir(body.dir);
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
      persistedCount: 0,
      memoryHome: null,
      currentTopic: null,
      outstandingQuestions: [],
    });

    res.json({
      ok: true,
      sessionId,
      dir: info.abs,
      existed: info.existed,
      // Conversation caps — surfaced so the chat UI can warn as the user
      // approaches the limit without duplicating the constants client-side.
      maxMessages: MAX_MESSAGES,
      warnThreshold: WARN_THRESHOLD,
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
// The caller resolves where .idea-memory lives: inside the project folder
// when it exists, or the launcher-side staging dir while the folder is still
// deferred (moveStagedMemory folds the staged files in at capture).
//
// Writes are best-effort: a filesystem failure logs to stderr but doesn't
// break the chat stream. The DB row is the source of truth — these files
// are convenience artefacts.
function writeMemoryFiles(
  memDir: string,
  displayDir: string,
  history: ChatMessage[],
  persistedCount: number,
): { transcriptPath: string; jsonlPath: string } | null {
  try {
    fs.mkdirSync(memDir, { recursive: true });
    const ts = new Date().toISOString();
    const jsonlPath = path.join(memDir, 'conversation.jsonl');
    const transcriptPath = path.join(memDir, 'transcript.md');

    // conversation.jsonl: append ONLY the messages we haven't written yet
    // (history.slice(persistedCount)). Previously this loop wrote the entire
    // history on every turn, so the file grew quadratically (2 + 4 + 6 + …)
    // and a resume reloaded all those duplicates, tripping the conversation
    // cap after just a handful of real exchanges. Append-mode is still
    // correct — only the set of newly-appended messages changes each turn.
    const isFresh = !fs.existsSync(jsonlPath);
    const jsonl = fs.openSync(jsonlPath, 'a');
    if (isFresh) {
      fs.writeSync(jsonl, JSON.stringify({ kind: 'header', ts, messageCount: history.length }) + '\n');
    }
    for (const m of history.slice(persistedCount)) {
      fs.writeSync(jsonl, JSON.stringify({ kind: 'message', ts, role: m.role, content: m.content }) + '\n');
    }
    fs.closeSync(jsonl);

    // transcript.md: always rewrite the full transcript (cheap, keeps it
    // human-readable without needing to read jsonl). Strip the internal
    // sentinels (::topic=N:: / ::topic=N::summary:: / ::oq-add:: / ::oq-resolve::)
    // from each assistant message — they live in the JSONL for /resume to
    // recover, but they aren't part of the conversation a human reads.
    const TOPIC_RE = SENTINEL_STRIP_RE;
    const lines: string[] = [];
    lines.push('# BA Agent interview transcript');
    lines.push('');
    lines.push(`Project: \`${displayDir}\``);
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

// Resolve where this session's .idea-memory writes land. The home is decided
// once per interview (null = undecided) and then sticky: a pre-existing
// folder is the home for the whole interview; a deferred folder stages until
// capture folds the staged files in (moveStagedMemory). Never re-decide from
// disk mid-interview — if the user creates the folder at the picked path
// while staging is the home, switching would strand the early transcript in
// staging while /resume looks folder-first, silently dropping it (PR #17
// review finding 2). Null when there's nowhere to write yet (no folder, no
// row — e.g. the first reply when createEarlyProject failed); the transcript
// still lives in session history and the next reply retries.
function resolveMemoryDir(
  session: IntakeSession,
): { dir: string; home: "folder" | "staging" } | null {
  if (session.memoryHome) {
    if (session.memoryHome === "staging") {
      if (session.earlyProjectId === null) {
        // Unreachable in practice — staging is only ever decided with an
        // early row present. Fail soft: no write this turn, retry next reply.
        return null;
      }
      return { dir: stagedMemoryDir(session.earlyProjectId), home: "staging" };
    }
    return { dir: path.join(session.dir, ".idea-memory"), home: "folder" };
  }
  // Undecided — decide from disk: a folder that exists at the first write
  // (pre-existing at pick) is the home; otherwise stage.
  if (fs.existsSync(session.dir)) {
    return { dir: path.join(session.dir, ".idea-memory"), home: "folder" };
  }
  if (session.earlyProjectId !== null) {
    return { dir: stagedMemoryDir(session.earlyProjectId), home: "staging" };
  }
  return null;
}

// Recover the true conversation from a JSONL that the old (quadratic-append)
// writeMemoryFiles bloated. Each turn appended the full history as a fresh
// "snapshot", so the file is S_1 ++ S_2 ++ … ++ S_n where every snapshot is a
// prefix-extension of the previous one. The final snapshot is the complete,
// in-order conversation. We detect snapshot boundaries by the first two
// messages repeating (the BA opener + the user's first reply — distinctive
// enough that a later skip/reply can't be mistaken for a restart) and keep
// everything from the last boundary onward. A clean, linearly-grown file has
// no repeats, so this is a no-op there.
function dedupeMessages(all: ChatMessage[]): ChatMessage[] {
  if (all.length < 2) return all;
  const fp = (m: ChatMessage) => m.role + ' ' + m.content;
  const startFp = fp(all[0]) + '' + fp(all[1]);
  let lastStart = 0;
  for (let i = 2; i < all.length; i++) {
    if (fp(all[i]) + '' + fp(all[i + 1] ?? { role: '', content: '' }) === startFp) {
      lastStart = i;
    }
  }
  return lastStart === 0 ? all : all.slice(lastStart);
}

// Rewrite .idea-memory/conversation.jsonl from scratch with a clean history.
// Used on resume when dedupeMessages shrank the array — compacts bloated files
// in place so the next append starts from a tidy baseline.
function rewriteConversationJsonl(memDir: string, messages: ChatMessage[]): void {
  const jsonlPath = path.join(memDir, 'conversation.jsonl');
  const ts = new Date().toISOString();
  const fd = fs.openSync(jsonlPath, 'w');
  try {
    fs.writeSync(fd, JSON.stringify({ kind: 'header', ts, messageCount: messages.length }) + '\n');
    for (const m of messages) {
      fs.writeSync(fd, JSON.stringify({ kind: 'message', ts, role: m.role, content: m.content }) + '\n');
    }
  } finally {
    fs.closeSync(fd);
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

  // Early row keeps `Intake` — the interview is still running. The row moves
  // to `Requirements` when the final idea fence lands (renameProject below).
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
// Also advances the stage: the intake chat is complete, so the project moves
// Intake → Requirements (the "chat completed, PRD not started" sub-state).
function renameProject(projectId: number, newName: string): void {
  const slug = uniqueSlug(slugify(newName));
  db.prepare(
    `UPDATE project
       SET name = ?, slug = ?, updated_at = datetime('now'),
           current_stage = 'Requirements'
     WHERE id = ?`,
  ).run(newName, slug, projectId);

  // Close the Intake stage row and open the Requirements one so stage
  // history reflects the completed interview.
  db.prepare(
    `UPDATE stage
       SET status = 'done', completed_at = datetime('now')
     WHERE project_id = ? AND stage_key = 'Intake' AND status = 'active'`,
  ).run(projectId);
  db.prepare(
    `INSERT INTO stage (project_id, stage_key, status, started_at)
     SELECT ?, 'Requirements', 'active', datetime('now')
     WHERE NOT EXISTS (
       SELECT 1 FROM stage WHERE project_id = ? AND stage_key = 'Requirements'
     )`,
  ).run(projectId, projectId);
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
  // Captured for the nested closures below — TS narrowing doesn't reach
  // inside them.
  const activeSession = session;

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
  // Sentinel detection. The BA may append `::topic=N::` (optionally with a
  // one-line summary), `::oq-add::{json}::` or `::oq-resolve::ID::` — as a
  // single token or split across several (e.g. `::` then `topic=2::`). The
  // longest sentinel is an ::oq-add:: payload (~420 chars at the caps in
  // intake.ts), so text is held back from the earliest position that could
  // still begin a sentinel (`::topic…` / `::oq-…`), with a 16-char floor so
  // a lone `:` split mid-token can't escape either. Anything held back that
  // never completes is flushed — or dropped, if it still looks like a
  // sentinel — at stream end. A complete sentinel is stripped from the
  // stream, turned into its typed NDJSON event, and persisted in `full` for
  // /resume to re-derive from.
  const SENTINEL_FLOOR = 16;
  let carry = '';
  let lastTopicIndex: number | null = null;
  // Ids this request has already emitted an oq_resolve event for, and ids
  // that have ever been resolved. Doubles as the replay guard for the
  // defensive re-scan below: a resolved question's ::oq-add:: marker stays in
  // `full`, and without this check every later reply would momentarily
  // resurrect it on the client (spurious oq_add + oq_resolve event pair).
  const resolvedIds = new Set<string>();
  // Sentinel-start lookalikes in prose (`::topic` / `::oq-` with no closing
  // `::`) are held back for one chunk at most — once more text arrives, the
  // fixed floor reopens the stream past them.
  const SENTINEL_START_RE = /::\s*(?:topic|oq-)/i;
  // Longest sentinel the BA is prompted to emit (an ::oq-add:: payload at the
  // intake.ts caps ≈ 440 chars). An "opening" older than this without a
  // closing `::` is prose, not a sentinel.
  const SENTINEL_MAX = 480;

  function flushText(text: string): void {
    full += text;
    sendNdjson(res, { type: 'token', content: text });
  }

  // Turn one complete sentinel match into its side effects: the typed NDJSON
  // event plus the marker text to persist into `full` (so the JSONL keeps the
  // side-channel state /resume needs). The marker itself never streams.
  // Returns the text to persist (callers append it in stream order), or null
  // when there is nothing to persist.
  function handleSentinel(m: RegExpExecArray): string | null {
    if (m[1] !== undefined) {
      // ::topic=N:: [::summary::]
      const idx = Number(m[1]);
      const summary = typeof m[2] === 'string' ? m[2] : undefined;
      if (Number.isInteger(idx) && idx > 0 && (lastTopicIndex === null || idx > lastTopicIndex)) {
        lastTopicIndex = idx;
        sendNdjson(res, summary ? { type: 'topic', index: idx, summary } : { type: 'topic', index: idx });
      }
      // Persist the marker verbatim whenever the index is valid — including a
      // repeat of the current topic, which advances nothing but must survive.
      // The defensive re-scan below re-fires handleSentinel over `full`; a
      // null here would strip already-persisted markers out of the transcript
      // /resume re-derives the cursor from. Only garbage indexes (≤0) are
      // dropped entirely.
      return Number.isInteger(idx) && idx > 0 ? m[0] : null;
    }
    if (m[3] !== undefined) {
      // ::oq-add::{json}:: — untrusted payload: parse + cap before anything
      // is emitted; invalid payloads are dropped entirely, never forwarded.
      const parsed = parseOqAddPayload(m[3]);
      if (parsed) {
        const askedAt = new Date().toISOString();
        if (
          activeSession.outstandingQuestions.length < MAX_OQ_LIST &&
          !activeSession.outstandingQuestions.some((q) => q.id === parsed.id) &&
          !resolvedIds.has(parsed.id)
        ) {
          const question = { ...parsed, askedAt };
          activeSession.outstandingQuestions.push(question);
          sendNdjson(res, { type: 'oq_add', question });
        }
        // Persist the server-enriched marker (askedAt embedded) so /resume
        // can rebuild the exact panel state, original ask times included.
        return '::oq-add::' + JSON.stringify({ ...parsed, askedAt }) + '::';
      }
      return null;
    }
    // ::oq-resolve::ID:: — resolve on the session list (no-op for unknown
    // ids). Emit once per id: the defensive re-scan replays every historical
    // resolve marker on each later reply, and a duplicate event would be
    // client-side noise.
    const id = m[4] as string;
    const at = activeSession.outstandingQuestions.findIndex((q) => q.id === id);
    if (at >= 0) activeSession.outstandingQuestions.splice(at, 1);
    if (!resolvedIds.has(id)) {
      resolvedIds.add(id);
      sendNdjson(res, { type: 'oq_resolve', id });
    }
    return m[0];
  }

  // A bare ::topic=N:: is itself a complete sentinel, but the extended
  // `::topic=N::Summary::` form starts out looking identical — the summary
  // arrives in later streamed tokens. While the text after a bare marker
  // could still grow into a summary (same-line: leading spaces, then a
  // colon-free run, then the closing `::`), the marker and everything after
  // it are held back so the summary never streams as user-visible prose.
  // A newline right after the marker proves there is no summary and reopens
  // the stream immediately.
  const SUMMARY_STILL_POSSIBLE_RE = /^[^\S\n]*[^:\n]{0,140}[^\S\n]*$/;

  // Process a chunk of text that may contain a (possibly split) sentinel.
  // Streams out everything that is definitely NOT part of a sentinel, emits
  // events for any complete sentinel it finds, and stashes the rest in
  // `carry` for the next call.
  function processText(text: string): void {
    const combined = carry + text;
    carry = '';
    let cursor = 0;
    let m: RegExpExecArray | null;
    SENTINEL_RE.lastIndex = 0;
    while ((m = SENTINEL_RE.exec(combined)) !== null) {
      // Bare topic marker whose summary may still be in flight — hold from
      // the marker onward. (If the summary were already complete, SENTINEL_RE
      // would have matched the extended form instead of the bare one.)
      if (
        m[1] !== undefined &&
        m[2] === undefined &&
        SUMMARY_STILL_POSSIBLE_RE.test(combined.slice(m.index + m[0].length))
      ) {
        if (m.index > cursor) flushText(combined.slice(cursor, m.index));
        carry = combined.slice(m.index);
        return;
      }
      // Flush everything before the match as ordinary text.
      if (m.index > cursor) {
        flushText(combined.slice(cursor, m.index));
      }
      const persist = handleSentinel(m);
      if (persist) full += persist;
      cursor = m.index + m[0].length;
    }
    // Tail handling: hold back from the earliest possible sentinel opening
    // while a sentinel could still be in flight (bounded by SENTINEL_MAX —
    // past that the opening is definitively prose and the stream reopens),
    // plus a fixed floor so a lone `:` split mid-token can't escape.
    const tail = combined.slice(cursor);
    const start = SENTINEL_START_RE.exec(tail);
    const openPos = start ? cursor + start.index : -1;
    const inFlight = openPos >= 0 && combined.length - openPos <= SENTINEL_MAX;
    const flushPoint = inFlight
      ? Math.min(openPos, combined.length - SENTINEL_FLOOR)
      : Math.max(cursor, combined.length - SENTINEL_FLOOR);
    if (flushPoint > cursor) {
      flushText(combined.slice(cursor, flushPoint));
      carry = combined.slice(flushPoint);
    } else {
      carry = tail;
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
    // Stream ended — drain the carryover. A complete sentinel is handled
    // exactly like one found mid-stream; text that merely looks like an
    // unfinished sentinel (e.g. `::topic=2` with no trailing `::`) is
    // dropped — we'd rather lose a few punctuation chars than leak a raw
    // sentinel to the user. Everything else flushes as ordinary text.
    if (carry) {
      SENTINEL_RE.lastIndex = 0;
      let mEnd: RegExpExecArray | null;
      let drained = 0;
      let droppedTail = false;
      while ((mEnd = SENTINEL_RE.exec(carry)) !== null) {
        const before = carry.slice(drained, mEnd.index);
        if (before) flushText(before);
        const persist = handleSentinel(mEnd);
        if (persist) full += persist;
        drained = mEnd.index + mEnd[0].length;
        // The stream ended mid-summary: text after a bare topic marker that
        // could still be the summary is BA side-channel text, not
        // user-visible prose — drop it rather than leak it.
        if (
          mEnd[1] !== undefined &&
          mEnd[2] === undefined &&
          SUMMARY_STILL_POSSIBLE_RE.test(carry.slice(drained))
        ) {
          droppedTail = true;
          break;
        }
      }
      if (!droppedTail) {
        const rest = carry.slice(drained);
        const partial = SENTINEL_START_RE.exec(rest);
        if (partial) {
          // Flush the prose before the unfinished sentinel; drop the rest
          // rather than leak it.
          if (partial.index > 0) flushText(rest.slice(0, partial.index));
        } else if (rest) {
          flushText(rest);
        }
      }
      carry = '';
    }
  } catch {
    sendNdjson(res, { type: 'error', message: 'Lost connection to Ollama mid-response.' });
    res.end();
    return;
  }

  // Defensive: re-scan the full reply for any sentinel we somehow missed
  // (e.g. one that landed entirely inside the carryover buffer because the
  // model emitted the whole thing in a single token that got flushed
  // verbatim at stream-end). Handle each one exactly like the streaming
  // path would have, so the sidebar and the outstanding-questions panel
  // still advance and the persisted transcript keeps the markers.
  SENTINEL_RE.lastIndex = 0;
  let cleaned = '';
  let scanCursor = 0;
  let sm: RegExpExecArray | null;
  while ((sm = SENTINEL_RE.exec(full)) !== null) {
    cleaned += full.slice(scanCursor, sm.index);
    const persist = handleSentinel(sm);
    if (persist) cleaned += persist;
    scanCursor = sm.index + sm[0].length;
  }
  cleaned += full.slice(scanCursor);
  if (cleaned !== full) full = cleaned;
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

  // Create the project row on the first BA reply (Task 2.1). Idempotent —
  // if a row already exists from a previous reply, we reuse it. Runs BEFORE
  // the memory write: while the project folder is deferred (owner decision —
  // nothing on disk until capture), the staged .idea-memory is keyed by this
  // row id, so the row must exist before the transcript is persisted.
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

  // Persist the conversation every reply (Task 2.2). A aborted session
  // still has its transcript on disk.
  //
  // For the human-readable transcript.md we want the topic markers gone
  // (they're internal signalling, not conversation); for the JSONL we keep
  // them so /resume can re-derive the sidebar cursor. writeMemoryFiles
  // handles the split — it appends only the messages added since the last
  // write (history.slice(persistedCount)) so the JSONL grows linearly.
  const mem = resolveMemoryDir(session);
  const memResult = mem ? writeMemoryFiles(mem.dir, session.dir, session.history, session.persistedCount) : null;
  if (mem && memResult) {
    session.persistedCount = session.history.length;
    // Sticky from the first successful write — see resolveMemoryDir.
    session.memoryHome = mem.home;
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
      // Intake completes here: create the project folder, scaffold the
      // framework files into it, and pin the workspace root. This is the
      // deferred-creation moment (owner decision — nothing lands on disk at
      // folder-pick, so an abandoned interview leaves nothing behind). Then
      // fold any staged .idea-memory into the folder so /resume keeps working
      // from disk. A scaffold failure surfaces through the same catch below
      // as ideaWriteError — idea.md can't be written without the folder.
      scaffoldProjectDir(session.dir);
      if (session.earlyProjectId !== null) moveStagedMemory(session.earlyProjectId, session.dir);
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
                             WHEN 'PRD'  THEN 2 WHEN 'Requirements' THEN 3
                             WHEN 'Review' THEN 4 WHEN 'QA' THEN 5
                             WHEN 'Intake' THEN 6
                             ELSE 7 END,
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
  const activity = db
    .prepare('SELECT agent, message, kind, ts FROM activity WHERE project_id = ? ORDER BY ts DESC, id DESC')
    .all(row.id);
  const artifacts = db
    .prepare('SELECT stage_key, label, path, kind, created_at FROM artifact WHERE project_id = ? ORDER BY id')
    .all(row.id);
  res.json({
    project: row,
    stages,
    activity,
    artifacts,
    outstandingQuestions: deriveOverviewOutstandingQuestions(row),
  });
});

// Derive the outstanding questions for the Overview blocked state from the
// project's persisted intake transcript (read-only). Follows the /resume
// call-site recipe — parse conversation.jsonl, keep per-entry timestamps so
// markers that predate askedAt stamping still fall back to a sensible ask
// time — then hands the messages to the existing deriveOutstandingQuestions
// parser (which applies its own MAX_OQ_LIST cap). Missing folder, missing
// transcript, or any parse failure yields [] — never a 500.
function deriveOverviewOutstandingQuestions(row: ProjectRow): OutstandingQuestion[] {
  try {
    const jsonlPath = path.join(row.folder_path, '.idea-memory', 'conversation.jsonl');
    if (!fs.existsSync(jsonlPath)) return [];
    const raw = fs.readFileSync(jsonlPath, 'utf-8');
    const messages: ChatMessage[] = [];
    const timestamps: Array<string | undefined> = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed) as { kind?: string; role?: string; content?: unknown; ts?: unknown };
        if (entry.kind !== 'message') continue;
        if (entry.role !== 'user' && entry.role !== 'assistant') continue;
        if (typeof entry.content !== 'string' || !entry.content.trim()) continue;
        messages.push({ role: entry.role, content: entry.content });
        timestamps.push(typeof entry.ts === 'string' ? entry.ts : undefined);
      } catch {
        // skip malformed lines — the transcript is best-effort
      }
    }
    return deriveOutstandingQuestions(messages, (i) => timestamps[i]);
  } catch {
    // Read failure (unreadable folder/file) — the Overview renders with an
    // empty questions panel rather than a 500.
    return [];
  }
}

// Delete a project row. Resolves by numeric id or slug — mirrors the GET above
// so the table/tile menus can pass whichever they have on hand. The folder
// on disk (idea.md, .idea-memory/, etc.) is intentionally left in place: the
// launcher is a dev tool and recovery-by-recreate is cheap. FK cascades in
// db.ts handle stage / artifact / activity / jira_link / kanban_card.
app.delete('/api/projects/:id', (req, res) => {
  const idParam = req.params.id;
  const row = db
    .prepare('SELECT id, slug, name FROM project WHERE id = ? OR slug = ?')
    .get(idParam, idParam) as { id: number; slug: string; name: string } | undefined;
  if (!row) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  try {
    const tx = db.transaction((projectId: number) => {
      db.prepare('DELETE FROM project WHERE id = ?').run(projectId);
    });
    tx(row.id);
    // Best-effort: drop the deferred-interview memory staging dir, if the
    // project never reached capture. Legacy project folders stay in place
    // (see comment above — the launcher never deletes project folders).
    try {
      fs.rmSync(path.join(STAGED_SESSIONS_DIR, 'proj-' + row.id), { recursive: true, force: true });
    } catch {
      // staging cleanup is a convenience, not a correctness requirement
    }
    res.json({ ok: true, id: row.id, slug: row.slug, name: row.name });
  } catch {
    // Log internally; return a generic message so we never leak the underlying
    // SQL error to the client.
    console.error('[api] delete project failed for id', row.id);
    res.status(500).json({ error: 'Could not delete project.' });
  }
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

  // Transitional consolidation: a session started under the pre-sticky build
  // may have split its transcript across both homes (staging holds the early
  // part, the folder the tail) — folder-first lookup would reconstruct only
  // the tail. When both hold a conversation.jsonl, fold the staged part into
  // the folder chronologically (moveStagedMemory) before reading, so /resume
  // reconstructs the whole conversation and capture later finds nothing to
  // scramble.
  const folderJsonl = path.join(row.folder_path, '.idea-memory', 'conversation.jsonl');
  const stagedJsonl = path.join(stagedMemoryDir(row.id), 'conversation.jsonl');
  if (fs.existsSync(folderJsonl) && fs.existsSync(stagedJsonl)) {
    moveStagedMemory(row.id, row.folder_path);
  }

  // Transcript lookup — project folder first (legacy sessions and any
  // post-capture replay), then the launcher-side staging dir used while the
  // folder was still deferred. /resume only serves Intake rows, so the
  // staging dir is the normal home mid-interview now.
  const memDirCandidates = [
    path.join(row.folder_path, '.idea-memory'),
    stagedMemoryDir(row.id),
  ];
  const memDir = memDirCandidates.find((d) => fs.existsSync(path.join(d, 'conversation.jsonl')));
  if (!memDir) {
    res.status(410).json({ error: 'No transcript on disk for this project.' });
    return;
  }
  const jsonlPath = path.join(memDir, 'conversation.jsonl');

  // Parse the JSONL. Skip the header line, validate every entry, drop
  // anything that doesn't look like a message — never trust the file blindly.
  // Per-message timestamps are kept so outstanding-question markers that
  // predate askedAt stamping can still fall back to a sensible ask time.
  const raw = fs.readFileSync(jsonlPath, 'utf-8');
  const messages: ChatMessage[] = [];
  const timestamps: Array<string | undefined> = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as { kind?: string; role?: string; content?: unknown; ts?: unknown };
      if (entry.kind !== 'message') continue;
      if (entry.role !== 'user' && entry.role !== 'assistant') continue;
      if (typeof entry.content !== 'string' || !entry.content.trim()) continue;
      messages.push({ role: entry.role, content: entry.content });
      timestamps.push(typeof entry.ts === 'string' ? entry.ts : undefined);
    } catch {
      // skip malformed lines — the chat transcript is best-effort
    }
  }
  if (messages.length === 0) {
    res.status(410).json({ error: 'Transcript is empty.' });
    return;
  }

  // Older transcripts were written by the quadratic-append writeMemoryFiles,
  // so the JSONL may contain the same conversation many times over. Recover
  // the single true history, and if we shrunk anything, compact the file in
  // place so the next append starts from a clean baseline.
  const deduped = dedupeMessages(messages);
  if (deduped.length < messages.length) {
    try {
      rewriteConversationJsonl(memDir, deduped);
      console.log(
        `[api] compacted resume JSONL: ${messages.length} -> ${deduped.length} entries`,
      );
    } catch (err) {
      // Best-effort — the deduped array is what we use for the session either
      // way; only the on-disk compaction failed.
      console.error('[api] failed to compact resume JSONL:', err);
    }
  }
  const history = deduped;

  // Re-derive the outstanding-questions list from the persisted ::oq-add:: /
  // ::oq-resolve:: markers, replaying them in transcript order. Server-
  // enriched markers carry the original askedAt; older ones fall back to the
  // JSONL entry timestamp. The derived list also seeds the new session so
  // subsequent live ::oq-add:: sentinels keep the list coherent.
  const outstandingQuestions = deriveOutstandingQuestions(history, (i) => timestamps[i]);

  // Re-create an in-memory session so subsequent /api/chat calls work the
  // same way as for an in-progress interview. Point earlyProjectId at the
  // existing row so createEarlyProject() doesn't insert a duplicate.
  const sessionId = newSessionId();
  sessions.set(sessionId, {
    dir: row.folder_path,
    nameSeed: row.name && row.name !== 'New project' ? row.name : null,
    earlyProjectId: row.id,
    earlyProjectSlug: row.slug,
    history,
    // The JSONL now holds exactly `history` entries (compacted above if it
    // was bloated), so the next /api/chat append-delta starts from here.
    persistedCount: history.length,
    // Sticky memory home for the resumed session: continue in whichever home
    // held the transcript. (After the consolidation above, a split-home
    // session is unified into the folder.)
    memoryHome: memDir === memDirCandidates[1] ? 'staging' : 'folder',
    currentTopic: null, // populated below from the transcript
    outstandingQuestions,
  });

  // Derive topic progress from the persisted transcript:
  //   • currentTopic = the deepest ::topic=N:: marker found in any assistant
  //     message (so the sidebar resumes at the right step even if the user
  //     closed the tab mid-topic).
  //   • topicSummaries = the BA-provided one-line summaries carried by
  //     ::topic=N::summary:: markers, keyed by the completed topic index
  //     (marker index − 1), so a resumed sidebar shows the same details the
  //     live session built up.
  //   • capturedTopics / skippedTopics mirror the legacy skip-vs-answer
  //     counting so the client can build its initial step list without
  //     scanning the messages twice.
  const TOPIC_RE = TOPIC_SENTINEL_RE;
  let currentTopic: number | null = null;
  const topicSummaries: Record<number, string> = {};
  let captured = 0;
  let skipped = 0;
  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    if (m.role === 'assistant') {
      let match: RegExpExecArray | null;
      TOPIC_RE.lastIndex = 0;
      while ((match = TOPIC_RE.exec(m.content)) !== null) {
        const n = Number(match[1]);
        if (Number.isInteger(n) && n > 0 && (currentTopic === null || n > currentTopic)) {
          currentTopic = n;
        }
        if (typeof match[2] === 'string' && n > 1 && match[2].trim()) {
          // The summary describes the topic the BA just completed.
          topicSummaries[n - 1] = match[2].trim();
        }
      }
    }
    if (i + 1 < history.length) {
      const next = history[i + 1];
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
    // Strip the internal sentinels before the transcript reaches the client —
    // they are side-channel state, not conversation. The session's own
    // `history` keeps them so /resume can re-derive the cursor after future
    // replies; what the user sees (bubbles on resume, transcript.md) never
    // does.
    messages: history.map((m) =>
      m.role === 'assistant' ? { ...m, content: m.content.replace(SENTINEL_STRIP_RE, '') } : m,
    ),
    // Conversation caps — same values surfaced by /api/init so the chat UI
    // can warn near the limit on a resumed session too.
    maxMessages: MAX_MESSAGES,
    warnThreshold: WARN_THRESHOLD,
    outstandingQuestions,
    topicSummaries,
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
