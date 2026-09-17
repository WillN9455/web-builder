// Design tab — server routes (design-tab build plan §3, v5.5).
//
// Two screens + the rules half:
//   GET  /api/projects/:id/design/stories              — design list rows
//   GET  /api/projects/:id/design/:storyId            — story detail payload
//   POST /api/projects/:id/design/:storyId/source     — attach Figma / HTML
//   DELETE /api/projects/:id/design/:storyId/source   — remove the source
//   POST /api/projects/:id/design/:storyId/notes      — human note (plain-text)
//   POST /api/projects/:id/design/:storyId/transition — design-status flip
//   GET / PUT /api/projects/:id/design/rules          — design-system/rules
//
// Security model (Dev Reviewer 2 pre-code findings F-1…F-6):
//   F-1  Figma URLs go through a dedicated validateFigmaUrl (https only +
//        figma.com host + /file/ or /design/ path). The jira-link
//        validateBaseUrl check is http(s)-scheme + creds-rejection only and
//        would pass `https://evil.example.com/...` — it is never reused here.
//   F-2  The client preview iframe sandbox denies BOTH allow-same-origin and
//        allow-scripts (also no allow-forms / allow-top-navigation) — with
//        allow-scripts a <script> inside the srcdoc executes. Not a server
//        concern, but every HTML source the server stores is treated as
//        untrusted at render time.
//   F-3  Notes storage is enforced plain-text server-side: bodies containing
//        '<' are rejected (422) so the renderer can escape-then-markdown
//        safely.
//   F-4  The transition's kanban_card UPDATE re-scopes
//        WHERE id = ? AND project_id = ? (board.ts pattern) — a crafted card
//        id can never touch another project's card.
//   F-5  HTML upload is enforced server-side: .html/.htm extension, 5 MB byte
//        cap, no '..' path segments, no NUL, path.resolve + prefix
//        containment into the per-project source store.
//   F-6  Every route resolves the project id-or-slug first (parseProjectId →
//        400) and every read/write carries WHERE project_id = ? — story
//        lookups are scoped by project_id so another project's storyId 404s.

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { db } from './db.js';
import { parseProjectId } from './jira-link.js';
import { getProjectRow, resolveProjectFolder } from './ba-workspace.js';
import { parseStories, parseRequirements } from './requirements-model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Design lifecycle statuses + their pill labels (design-story-requirements.md
// §4, design-tab.html § D). The enum is the DESIGN state only — the board
// column lives on kanban_card and is driven by the sprint slice.
export const DESIGN_STATUSES = [
  'not_started',
  'in_design',
  'peer_review',
  'design_complete',
  'ready_for_dev',
] as const;
export type DesignStatus = (typeof DESIGN_STATUSES)[number];

export const DESIGN_STATUS_PILL: Record<DesignStatus, string> = {
  not_started: 'Picked up',
  in_design: 'In design',
  peer_review: 'Peer review',
  design_complete: 'Design complete',
  ready_for_dev: 'Ready for dev',
};

// Valid transitions (v5.5 open-question decisions). 'peer_review → in_design'
// is the "Request changes" action; nothing skips Peer review for Mark-complete
// (the client disables Mark design complete before peer_review).
const TRANSITIONS: Partial<Record<DesignStatus, DesignStatus[]>> = {
  not_started: ['in_design'],
  in_design: ['not_started', 'peer_review'],
  peer_review: ['in_design', 'design_complete'],
  design_complete: ['ready_for_dev'],
};

function isDesignStatus(v: unknown): v is DesignStatus {
  return typeof v === 'string' && (DESIGN_STATUSES as readonly string[]).includes(v);
}

// HTML source byte cap (design-story-requirements.md §7: >5 MB rejected).
const HTML_MAX_BYTES = 5 * 1024 * 1024;

// ── Project-dir resolution + containment (F-5/6) ───────────────────────────

type ProjectContext = { id: number; name: string; folder: string };

function projectContext(idOrSlug: string): ProjectContext | null {
  const row = getProjectRow(idOrSlug);
  if (!row) return null;
  return { id: row.id, name: row.name, folder: path.resolve(resolveProjectFolder(row)) };
}

// The project's design-system/ folder — the only folder the rules write-back
// and (per plan) HTML-source writes may touch inside the project folder.
function designSystemDir(ctx: ProjectContext): string {
  return path.join(ctx.folder, 'design-system');
}

function resolveInside(root: string, ...parts: string[]): string | null {
  const target = path.resolve(root, ...parts);
  return target.startsWith(root + path.sep) ? target : null;
}

// ── Figma URL validation (F-1) ─────────────────────────────────────────────

// Requirement 343/345 message — byte-matching design-story-requirements.md §7.
const FIGMA_URL_ERROR =
  "That doesn't look like a Figma URL. Expected https://www.figma.com/file/…";

export function validateFigmaUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  if (host !== 'figma.com' && !host.endsWith('.figma.com')) return null;
  if (!u.pathname.startsWith('/file/') && !u.pathname.startsWith('/design/')) return null;
  return u.toString();
}

// ── Story data source (PRD/stories.md + story-gen mapping) ────────────────

function storiesFilePath(ctx: ProjectContext): string {
  return path.join(ctx.folder, 'PRD', 'stories.md');
}

function readStoriesFile(ctx: ProjectContext): {
  stories: ReturnType<typeof parseStories>['stories'];
  missing: boolean;
} {
  const p = storiesFilePath(ctx);
  if (!fs.existsSync(p)) return { stories: [], missing: true };
  return { stories: parseStories(fs.readFileSync(p, 'utf-8')).stories, missing: false };
}

// Reqd set of requirement IDs from a story's `reqs=` meta (the BR-NNN,TR-NNN
// list story-gen writes). parseStoryMeta intentionally ignores unknown keys, so
// this is a separate focused read of the meta comment.
function storyReqIdSet(story: { usId: string; metaLine: number | null }, srcText: string): Set<string> {
  const out = new Set<string>();
  if (story.metaLine === null) return out;
  const line = srcText.split('\n')[story.metaLine] ?? '';
  const meta = line.match(/<!--\s*story:\s*(.*?)\s*-->/)?.[1] ?? '';
  const reqMatch = meta.match(/\breqs\s*=\s*([^\s,]+(?:\s*,\s*[^\s,]+)*)/);
  if (!reqMatch) return out;
  for (const id of reqMatch[1].split(',')) {
    const clean = id.replace(/\s+/g, '');
    if (/^(BR|TR)-\d{3}$/.test(clean)) out.add(clean);
  }
  return out;
}

// Resolve reqs= ids to titles/descriptions from prd.md + features.md (the same
// parser the Requirements tab owns — single implementation).
function requirementIndex(ctx: ProjectContext): Map<string, { id: string; text: string }> {
  const index = new Map<string, { id: string; text: string }>();
  const prdPath = path.join(ctx.folder, 'PRD', 'prd.md');
  const featuresPath = path.join(ctx.folder, 'PRD', 'features.md');
  if (fs.existsSync(prdPath) || fs.existsSync(featuresPath)) {
    const prdText = fs.existsSync(prdPath) ? fs.readFileSync(prdPath, 'utf-8') : '';
    const featuresText = fs.existsSync(featuresPath) ? fs.readFileSync(featuresPath, 'utf-8') : '';
    const parsed = parseRequirements(prdText, featuresText);
    for (const br of parsed.businessReqs) index.set(br.id, { id: br.id, text: br.text });
    for (const fe of parsed.features) for (const tr of fe.reqs) index.set(tr.id, { id: tr.id, text: tr.text });
  }
  return index;
}

// story-gen mapping (data/story-gen/<projectId>.mapping.json) joins a story to
// its auto-created kanban_card. Missing mapping / missing card = read-model
// never ran for this project — the design list renders without card links.
function storyCardMapping(projectId: number): Map<string, { cardId: number; ticketKey: string }> {
  const map = new Map<string, { cardId: number; ticketKey: string }>();
  const dir = path.join(__dirname, '..', 'data', 'story-gen');
  const filePath = path.join(dir, `${projectId}.mapping.json`);
  if (!fs.existsSync(filePath)) return map;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
      stories?: { us: string; ticketKey: string; cardId: number }[];
    };
    for (const s of parsed.stories ?? []) map.set(s.us, { cardId: s.cardId, ticketKey: s.ticketKey });
  } catch {
    /* corrupt mapping — design list renders without card links */
  }
  return map;
}

type CardRow = { id: number; ticket_key: string; column: string | null };

function cardByIdScoped(projectId: number, cardId: number): CardRow | undefined {
  return db
    .prepare('SELECT id, ticket_key, column FROM kanban_card WHERE id = ? AND project_id = ?')
    .get(cardId, projectId) as CardRow | undefined;
}

// ── design_story read/write helpers (all scoped — F-6) ─────────────────────

type DesignStoryRow = {
  project_id: number;
  story_id: string;
  design_status: DesignStatus;
  source_type: 'figma' | 'html' | null;
  source_value: string | null;
  source_meta: string;
  updated_at: string;
};

function designRow(projectId: number, storyId: string): DesignStoryRow | null {
  const row = db
    .prepare('SELECT * FROM design_story WHERE project_id = ? AND story_id = ?')
    .get(projectId, storyId) as DesignStoryRow | undefined;
  return row ?? null;
}

function ensureDesignRow(projectId: number, storyId: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO design_story (project_id, story_id) VALUES (?, ?)',
  ).run(projectId, storyId);
}

function readDesignState(
  projectId: number,
  storyId: string,
): { design_status: DesignStatus; source_type: 'figma' | 'html' | null; source_value: string | null; source_meta: Record<string, unknown> } {
  const row = designRow(projectId, storyId);
  if (!row) return { design_status: 'not_started', source_type: null, source_value: null, source_meta: {} };
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(row.source_meta) as Record<string, unknown>;
  } catch {
    /* corrupt meta — treat as empty */
  }
  return { design_status: row.design_status, source_type: row.source_type, source_value: row.source_value, source_meta: meta };
}

function storyWireState(
  projectId: number,
  story: ReturnType<typeof parseStories>['stories'][number],
  srcText: string,
  mapping: Map<string, { cardId: number; ticketKey: string }>,
  reqIndex: Map<string, { id: string; text: string }>,
) {
  const state = readDesignState(projectId, story.usId);
  const cardEntry = mapping.get(story.usId);
  const card = cardEntry ? cardByIdScoped(projectId, cardEntry.cardId) : undefined;
  const reqIds = [...storyReqIdSet(story, srcText)];
  return {
    storyId: story.usId,
    title: story.title,
    design_status: state.design_status,
    status_pill: DESIGN_STATUS_PILL[state.design_status],
    has_source: state.source_type !== null,
    ticket_key: card?.ticket_key ?? cardEntry?.ticketKey ?? null,
    card_column: card?.column ?? null,
    reqs: reqIds.map((id) => {
      const r = reqIndex.get(id);
      return r ? { id, text: r.text } : { id, text: null };
    }),
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────

export function registerDesignRoutes(app: express.Application): void {
  const prefix = '/api/projects/:id/design';

  // GET /stories — list rows (stats built client-side from design_status).
  app.get(`${prefix}/stories`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    // Story read is scoped by project folder — a foreign projectId resolves
    // to its own stories.md or an empty list, never another project's.
    const { stories, missing } = readStoriesFile(ctx);
    const srcText = missing ? '' : fs.existsSync(storiesFilePath(ctx)) ? fs.readFileSync(storiesFilePath(ctx), 'utf-8') : '';
    const reqIndex = requirementIndex(ctx);
    const mapping = storyCardMapping(projectId);
    const rows = stories.map((s) => storyWireState(projectId, s, srcText, mapping, reqIndex));
    res.json({ stories: rows, missing_stories: missing });
  });

  // GET/PUT /rules must be registered BEFORE the GET /:storyId catch-all or
  // Express resolves /design/rules to storyId='rules' and 404s it.
  app.get(`${prefix}/rules`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const rulesPath = path.join(designSystemDir(ctx), 'design-rules.md');
    const content = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf-8') : '';
    res.json({ content });
  });

  app.put(`${prefix}/rules`, express.json({ limit: '8mb' }), (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const body = (req.body ?? {}) as { content?: unknown };
    if (typeof body.content !== 'string') {
      res.status(422).json({ error: 'Rules content must be a string.' });
      return;
    }
    if (Buffer.byteLength(body.content, 'utf-8') > 2 * 1024 * 1024) {
      res.status(422).json({ error: 'Rules are limited to 2 MB.' });
      return;
    }
    if (/\.\./.test(body.content)) {
      // Defensive: rules content should never contain path-escaping sequences;
      // the write is already confined to the resolved design-system dir.
      res.status(422).json({ error: 'Rules content contains invalid characters.' });
      return;
    }
    const rulesPath = path.join(designSystemDir(ctx), 'design-rules.md');
    const contained = resolveInside(ctx.folder, 'design-system', 'design-rules.md');
    if (!contained || rulesPath !== contained) {
      res.status(422).json({ error: 'Invalid rules path.' });
      return;
    }
    fs.mkdirSync(dirname(rulesPath), { recursive: true });
    const tmp = `${rulesPath}.tmp`;
    fs.writeFileSync(tmp, body.content, 'utf-8');
    fs.renameSync(tmp, rulesPath);
    res.json({ ok: true, size: Buffer.byteLength(body.content, 'utf-8') });
  });

  // GET /:storyId — detail payload (requirement card + source + notes).
  app.get(`${prefix}/:storyId`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const storyId = req.params.storyId;
    if (!/^US-\d{2,}$/.test(storyId)) {
      res.status(404).json({ error: 'Unknown story' });
      return;
    }
    const { stories, missing } = readStoriesFile(ctx);
    const story = stories.find((s) => s.usId === storyId);
    if (!story) {
      // Scoped: the storyId must belong to THIS project's stories.md.
      res.status(404).json({ error: missing ? 'No stories for this project yet' : 'Unknown story' });
      return;
    }
    const storiesPath = storiesFilePath(ctx);
    const srcText = fs.existsSync(storiesPath) ? fs.readFileSync(storiesPath, 'utf-8') : '';
    const reqIndex = requirementIndex(ctx);
    const mapping = storyCardMapping(projectId);
    const wire = storyWireState(projectId, story, srcText, mapping, reqIndex);
    const state = readDesignState(projectId, storyId);
    const notes = db
      .prepare(
        'SELECT id, author, body, created_at FROM design_note WHERE project_id = ? AND story_id = ? ORDER BY created_at ASC, id ASC',
      )
      .all(projectId, storyId) as { id: number; author: string; body: string; created_at: string }[];
    // HTML sources echo the stored bytes back for the preview iframe's srcdoc
    // (F-2 — the client renders them in a scriptless, origin-null sandbox).
    // Re-read from disk so a reload shows the file, not a stale echo; the
    // containment check mirrors the DELETE route. Absent bytes (missing file)
    // degrade to an empty doc rather than a 500.
    let previewHtml: string | undefined;
    if (state.source_type === 'html' && typeof state.source_meta.stored === 'string') {
      const stored = path.resolve(state.source_meta.stored);
      const sourceRoot = path.join(ctx.folder, 'design-system', 'sources');
      if (stored.startsWith(sourceRoot + path.sep) && fs.existsSync(stored)) {
        previewHtml = fs.readFileSync(stored, 'utf-8');
      }
    }
    res.json({
      story: {
        storyId: wire.storyId,
        title: wire.title,
        design_status: wire.design_status,
        status_pill: wire.status_pill,
        ticket_key: wire.ticket_key,
        card_column: wire.card_column,
        reqs: wire.reqs,
      },
      source: {
        type: state.source_type,
        value: state.source_value,
        meta: state.source_meta,
        preview_html: previewHtml,
      },
      notes,
    });
  });

  // POST /:storyId/source — attach a Figma URL or HTML upload.
  app.post(`${prefix}/:storyId/source`, express.json({ limit: '8mb' }), (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const storyId = req.params.storyId;
    if (!/^US-\d{2,}$/.test(storyId)) {
      res.status(404).json({ error: 'Unknown story' });
      return;
    }
    const { stories } = readStoriesFile(ctx);
    if (!stories.some((s) => s.usId === storyId)) {
      res.status(404).json({ error: 'Unknown story' });
      return;
    }
    const body = req.body as Record<string, unknown> | undefined;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      res.status(422).json({ error: 'Source body must be a JSON object' });
      return;
    }
    const type = body.type;
    if (type !== 'figma' && type !== 'html') {
      res.status(422).json({ error: 'Source type must be figma or html' });
      return;
    }

    if (type === 'figma') {
      const url = validateFigmaUrl(body.url);
      if (!url) {
        res.status(422).json({ error: FIGMA_URL_ERROR });
        return;
      }
      ensureDesignRow(projectId, storyId);
      db.prepare(
        `UPDATE design_story SET source_type = ?, source_value = ?, source_meta = ?, updated_at = datetime('now')
         WHERE project_id = ? AND story_id = ?`,
      ).run('figma', url, '{}', projectId, storyId);
      res.json({ source: { type: 'figma', value: url, meta: {} } });
      return;
    }

    // HTML (F-5 — all constraints enforced server-side, never trusted from
    // the client). body.filename is presentation + the on-disk store name;
    // the actual bytes are the payload's content.
    const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
    const content = typeof body.content === 'string' ? body.content : '';
    if (!/\.(html?|htm)$/i.test(filename)) {
      res.status(422).json({ error: 'Only .html or .htm files are supported.' });
      return;
    }
    if (Buffer.byteLength(content, 'utf-8') > HTML_MAX_BYTES) {
      res.status(422).json({ error: 'Files must be 5 MB or smaller.' });
      return;
    }
    if (/\.\./.test(filename) || filename.includes('\x00')) {
      res.status(422).json({ error: 'Invalid filename.' });
      return;
    }
    const sourceRoot = path.join(ctx.folder, 'design-system', 'sources');
    const storePath = resolveInside(sourceRoot, storyId.replace(/^US-/, 'story-'));
    if (!storePath) {
      res.status(422).json({ error: 'Invalid story id.' });
      return;
    }
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(`${storePath}.html`, content, 'utf-8');
    const size = fs.statSync(`${storePath}.html`).size;
    const meta = {
      filename,
      size,
      stored: `${storePath}.html`,
    };
    ensureDesignRow(projectId, storyId);
    db.prepare(
      `UPDATE design_story SET source_type = ?, source_value = ?, source_meta = ?, updated_at = datetime('now')
       WHERE project_id = ? AND story_id = ?`,
    ).run('html', filename, JSON.stringify(meta), projectId, storyId);
    res.json({
      source: { type: 'html', value: filename, meta },
      // The rendered HTML for the preview iframe srcdoc (read-only byte
      // echo of what the server just stored — the client renders it inside a
      // sandbox that denies scripts + same-origin, F-2).
      preview_html: content,
    });
  });

  // DELETE /:storyId/source — remove the source (write-back, not story delete).
  app.delete(`${prefix}/:storyId/source`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    if (projectId === null) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const storyId = req.params.storyId;
    if (!/^US-\d{2,}$/.test(storyId)) {
      res.status(404).json({ error: 'Unknown story' });
      return;
    }
    const row = designRow(projectId, storyId);
    if (!row || row.source_type === null) {
      res.json({ source: null });
      return;
    }
    // Disk-verify: an HTML source leaf is also removed from the store.
    if (row.source_type === 'html') {
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(row.source_meta) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
      if (typeof meta.stored === 'string') {
        const ctx = projectContext(String(projectId));
        if (ctx && meta.stored.startsWith(path.join(ctx.folder, 'design-system', 'sources') + path.sep)) {
          try {
            fs.unlinkSync(meta.stored);
          } catch {
            /* already gone — best-effort */
          }
        }
      }
    }
    db.prepare(
      `UPDATE design_story SET source_type = NULL, source_value = NULL, source_meta = '{}', updated_at = datetime('now')
       WHERE project_id = ? AND story_id = ?`,
    ).run(projectId, storyId);
    res.json({ source: null });
  });

  // POST /:storyId/notes — human note (F-3: plain-text enforced here).
  app.post(`${prefix}/:storyId/notes`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const storyId = req.params.storyId;
    if (!/^US-\d{2,}$/.test(storyId)) {
      res.status(404).json({ error: 'Unknown story' });
      return;
    }
    const body = (req.body ?? {}) as { body?: unknown; author?: unknown };
    if (typeof body.body !== 'string' || !body.body.trim()) {
      res.status(422).json({ error: 'Note body is required.' });
      return;
    }
    if (body.body.includes('<')) {
      // Guaranteed-plaintext storage: a '<' can't be rendered safely with
      // escape-then-markdown once an attacker controls it.
      res.status(422).json({ error: 'Notes are plain text only.' });
      return;
    }
    const author = typeof body.author === 'string' && body.author.trim() ? body.author.trim().slice(0, 80) : 'Will';
    const info = db
      .prepare(
        'INSERT INTO design_note (project_id, story_id, author, body) VALUES (?, ?, ?, ?)',
      )
      .run(projectId, storyId, author, body.body.trim());
    res.json({
      note: {
        id: Number(info.lastInsertRowid),
        author,
        body: body.body.trim(),
        created_at: new Date().toISOString(),
      },
    });
  });

  // POST /:storyId/transition — design-status flip. `to` must be a legal
  // transition from the current state (409 otherwise, spec §4).
  app.post(`${prefix}/:storyId/transition`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const storyId = req.params.storyId;
    if (!/^US-\d{2,}$/.test(storyId)) {
      res.status(404).json({ error: 'Unknown story' });
      return;
    }
    const current = designRow(projectId, storyId)?.design_status ?? 'not_started';
    const to = (req.body ?? {}).to;
    if (!isDesignStatus(to)) {
      res.status(422).json({ error: `Unknown design status ${String(to)}` });
      return;
    }
    const allowed = TRANSITIONS[current] ?? [];
    if (!allowed.includes(to)) {
      res.status(409).json({
        error: `Cannot move story from ${current} to ${to}`,
      });
      return;
    }
    // Lazy-create the row: the story may have no design_story row yet, and an
    // UPDATE without a row would silently no-op (the response would claim a
    // transition that never persisted).
    ensureDesignRow(projectId, storyId);
    db.prepare(
      `UPDATE design_story SET design_status = ?, updated_at = datetime('now') WHERE project_id = ? AND story_id = ?`,
    ).run(to, projectId, storyId);
    // F-4: ready_for_dev also marks the local kanban_card read-model done —
    // scoped to the project, matching board.ts's UPDATE pattern.
    if (to === 'ready_for_dev') {
      const mapping = storyCardMapping(projectId);
      const entry = mapping.get(storyId);
      if (entry) {
        db.prepare(
          `UPDATE kanban_card SET column = 'done', updated_at = datetime('now') WHERE id = ? AND project_id = ?`,
        ).run(entry.cardId, projectId);
      }
    }
    res.json({ design_status: to });
  });
}
