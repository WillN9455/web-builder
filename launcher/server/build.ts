// Build tab — server routes (build-tab build plan §3, v5.4).
//
// Three screens + the rules surface (build-story-requirements.md v5.4):
//   GET  /api/projects/:id/build/stories               — build list rows
//   GET  /api/projects/:id/build/rules                — rules surface payload
//   PUT  /api/projects/:id/build/config               — config key write-back
//   PUT  /api/projects/:id/build/rules/agents/:agent  — per-agent guidelines
//   GET  /api/projects/:id/build/:storyId            — story detail payload
//   POST /api/projects/:id/build/:storyId/files       — FE file (metadata only)
//   DELETE /api/projects/:id/build/:storyId/files/:fileId
//   POST /api/projects/:id/build/:storyId/apis       — BFF/BE route
//   DELETE /api/projects/:id/build/:storyId/apis/:apiId
//   POST /api/projects/:id/build/:storyId/notes      — human note (plain-text)
//   POST /api/projects/:id/build/:storyId/transition — build-status flip
//   PUT  /api/projects/:id/build/rules               — build/deploy rules
//
// Route order matters: /rules, /config, /rules/agents/:agent are registered
// BEFORE the GET /:storyId catch-all (design.ts precedent) or Express resolves
// `rules`/`config` as a storyId and 404s it.
//
// Security model (plan §3 + §6, Dev Reviewer 2 code-level assertions):
//   Assertion 1 — build_status legal-edge table is explicit in code:
//     ready_for_qa reachable ONLY from self_review/ready_for_review; no
//     skip-ahead (ready_for_review → deployed_qa is illegal). Eligibility is
//     server-enforced, not just a disabled client button.
//   Assertion 2 — file writes use resolveInside (resolved-path containment,
//     not string-prefix) + tmp+rename in the SAME directory.
//   Assertion 3 — DELETE binds parsed integer params: WHERE id=? AND
//     project_id=? AND story_id=? (never path-string concatenation).
//   Assertion 4 — story membership is a project-scoped join against this
//     project's stories.md; the US-\d{2,} grammar match is a fast-path 404
//     ONLY, never the membership proof. Route param is always US-XX; the
//     TM-XX pill label is the kanban jira-key mapping display key (fallback
//     US-XX when unmapped) — v5.4 requirements win on the mockup conflict.
//   Assertion 5 — notes reject '<' (storage guaranteed plain-text) and cap at
//     10 KB measured on the ACTUAL parsed body.
//   Assertion 6 — no new body-gate exception: the global 1 MB JSON parse in
//     index.ts stays the only parse; rules/config/notes enforce their own byte
//     caps server-side after parse. No /source 12 mb clone on this tab.
//
// IDOR / per-project scoping (the operative RBAC): every route does
// parseProjectId() → null → 400, and every read/write carries WHERE
// project_id = ?. Story routes additionally verify membership in this
// project's stories.md — a foreign storyId 404s, never renders. FE/BFF/BE
// entries are validated METADATA STRINGS in DB — never used in a filesystem
// operation (SA-R-04). No kanban_card writes this slice (SA-R-05).

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

// ── Build lifecycle (assertion 1 — the legal-edge table) ────────────────────

export const BUILD_STATUSES = [
  'picked_up',
  'building',
  'self_review',
  'ready_for_review',
  'ready_for_qa',
  'deployed_qa',
  'rework',
] as const;
export type BuildStatus = (typeof BUILD_STATUSES)[number];

export const BUILD_STATUS_PILL: Record<BuildStatus, string> = {
  picked_up: 'Picked up',
  building: 'Building',
  self_review: 'Self-review',
  ready_for_review: 'Ready for review',
  ready_for_qa: 'Ready for QA',
  deployed_qa: 'Deployed · QA env',
  rework: 'Rework',
};

// Explicit legal-edge table (DR2 assertion 1). ready_for_qa is reachable ONLY
// from self_review / ready_for_review; nothing skips ahead (ready_for_review →
// deployed_qa has no edge). rework is entered from QA/Review events outside
// this route (no QA integration this slice) and can only leave → building.
const TRANSITIONS: Partial<Record<BuildStatus, BuildStatus[]>> = {
  picked_up: ['building'],
  building: ['self_review'],
  self_review: ['ready_for_review', 'ready_for_qa'],
  ready_for_review: ['ready_for_qa'],
  ready_for_qa: ['deployed_qa'],
  rework: ['building'],
};

function isBuildStatus(v: unknown): v is BuildStatus {
  return typeof v === 'string' && (BUILD_STATUSES as readonly string[]).includes(v);
}

// ── Rules surface constants (FR-6…FR-10, AC-15) ─────────────────────────────

// AC-15 architecture defaults — the read-only architecture card's values. There
// is no write endpoint for these (FR-7 read-only + lock icon; SA-R-06 closed
// key set means the config endpoint can't rewire them).
const DEFAULT_ARCHITECTURE: Record<string, string> = {
  fe: 'React 18 + Vite + TS',
  bff: 'Express (Node) · /api/*',
  be: 'Node 22 · tsx watch · route-handler style',
  db: 'SQLite (better-sqlite3)',
  host: 'Vercel + Fly.io',
};

// FR-8 closed key set — the ONLY configuration keys the config endpoint will
// read or write. Architecture keys are deliberately excluded (FR-7 read-only).
const CONFIG_KEYS = [
  'Package manager',
  'Node version',
  'Linter',
  'Formatter',
  'Test runner',
  'Env vars',
  'Secrets handling',
] as const;
type ConfigKey = (typeof CONFIG_KEYS)[number];

const CONFIG_KEYS_SET = new Set<string>(CONFIG_KEYS);

// Defaults seeded into code-builder/config-rules.md when the file is missing.
const DEFAULT_CONFIG: Record<string, string> = {
  'Package manager': 'pnpm 9',
  'Node version': 'Node 22 (engines)',
  Linter: 'ESLint 9 + typescript-eslint',
  Formatter: 'Prettier 3',
  'Test runner': 'Vitest (FE) · node --test (BE)',
  'Env vars': '.env.local · .env.{dev,stg,prod}',
  'Secrets handling': 'Host secrets store · never in repo',
};

const CONFIG_VALUE_MAX = 200;

// Fixed agent set for /rules/agents/:agent — a validated enum, never a raw
// path segment from user input (assertion: filename comes from this set only).
export const BUILD_AGENTS = ['code-1', 'code-2', 'code-3', 'reviewer'] as const;
type BuildAgent = (typeof BUILD_AGENTS)[number];

const AGENT_DISPLAY: Record<BuildAgent, string> = {
  'code-1': 'Code 1',
  'code-2': 'Code 2',
  'code-3': 'Code 3',
  reviewer: 'Reviewer',
};

const AGENT_FILE: Record<BuildAgent, string> = {
  'code-1': 'code-builder/agents/code-1.md',
  'code-2': 'code-builder/agents/code-2.md',
  'code-3': 'code-builder/agents/code-3.md',
  reviewer: 'code-builder/agents/reviewer.md',
};

// Seed guideline content for a fresh project (no code-builder/ yet). These are
// starting points the project-specific edits accumulate on top of.
const DEFAULT_AGENT_CONTENT: Record<BuildAgent, string> = {
  'code-1': `# Code 1 — coding guidelines

Work one story from the Build list at a time. Before writing code:
read the story's requirement + design source, then trace the FE files,
BFF APIs, and BE APIs on the Build story detail and keep them tagged as
you go.

- Ship the smallest tested slice per commit.
- Match the surrounding code's conventions; no new dependencies without
  a reason in the story.
- Run the repo gates (typecheck + verify suite) before pushing.
- Mark the story Ready for review when the PR is open.
`,
  'code-2': `# Code 2 — coding guidelines

Work one story from the Build list at a time; peer-review stories in
Ready for review when your own builds are done.

- Read the linked requirement + design source before touching code.
- Keep the FE files / BFF / BE surface on the story detail up to date.
- Review in GitHub PRs: correctness, races at the storage boundary,
  and every "own"/"group" query scoped server-side.
- Run the gates locally before marking your own work Ready for review.
`,
  'code-3': `# Code 3 — coding guidelines

Work one story from the Build list at a time.

- Follow the build rules and the per-project config (code-builder/).
- Tag every file, BFF route, and BE endpoint the story touches.
- Prefer small, focused diffs; write one test per acceptance criterion.
- Surface blockers early on the channel thread — never sit silent.
`,
  reviewer: `# Reviewer — dev review guidelines

Review the PR as shipped, not as described.

- Security lens first: IDOR / per-project scoping, path containment,
  atomic DB operations, no client-trusted authorization.
- Test the changed walk end to end — a green suite on the un-changed
  surface proves nothing about the changed one.
- Flag design drift and missing a11y states (focus ring, empty,
  loading, error) with the specific user story / AC number.
- Non-blocking nits are fine to defer; blocking findings must show a
  concrete failure path.
`,
};

// ── Byte caps ───────────────────────────────────────────────────────────────

const MARKDOWN_MAX_BYTES = 2 * 1024 * 1024; // rules / agent guidelines write
const NOTE_MAX_BYTES = 10 * 1024; // notes — F-SEC-1 cap on the parsed body
const FILE_PATH_MAX = 300;
const ROUTE_PATH_MAX = 300;
const API_DESC_MAX = 500;

const FILE_PATH_ERROR = 'Paths must be relative and inside the project folder.';
const NOTE_PLAIN_TEXT_ERROR = 'Notes are plain text only.';
const NOTE_REQUIRED_ERROR = 'Note body is required.';

const API_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

// ── Project-dir resolution + containment (assertion 2) ──────────────────────

type ProjectContext = { id: number; name: string; folder: string };

function projectContext(idOrSlug: string): ProjectContext | null {
  const row = getProjectRow(idOrSlug);
  if (!row) return null;
  return { id: row.id, name: row.name, folder: path.resolve(resolveProjectFolder(row)) };
}

// Real resolved-path containment — NOT a string-prefix check. path.resolve
// normalises '..' / leading '/' first, so a '..'-laden part can only resolve
// inside root if it actually stays inside after normalisation.
function resolveInside(root: string, ...parts: string[]): string | null {
  const target = path.resolve(root, ...parts);
  return target.startsWith(root + path.sep) ? target : null;
}

function codeBuilderDir(ctx: ProjectContext): string {
  return path.join(ctx.folder, 'code-builder');
}

// ── Story data source (PRD/stories.md + story-gen mapping) ───────────────────

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

// Reqd set of requirement IDs from a story's `reqs=` meta (same focused read
// design.ts uses — parseStoryMeta intentionally ignores unknown keys).
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
// never ran for this project — the list renders without a TM-XX display key.
// NOTE: the TM-XX label is the display key only; the route param stays US-XX.
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
    /* corrupt mapping — render without TM-XX display keys */
  }
  return map;
}

type CardRow = { id: number; ticket_key: string; column: string | null; points: number | null; priority: string | null };

function cardByIdScoped(projectId: number, cardId: number): CardRow | undefined {
  return db
    .prepare('SELECT id, ticket_key, column, points, priority FROM kanban_card WHERE id = ? AND project_id = ?')
    .get(cardId, projectId) as CardRow | undefined;
}

// ── build_story read/write helpers (all scoped) ─────────────────────────────

type BuildStoryRow = {
  project_id: number;
  story_id: string;
  build_status: BuildStatus;
  rework_origin: 'qa' | 'review' | null;
  rework_issues: number;
  updated_at: string;
};

function buildRow(projectId: number, storyId: string): BuildStoryRow | null {
  const row = db
    .prepare('SELECT * FROM build_story WHERE project_id = ? AND story_id = ?')
    .get(projectId, storyId) as BuildStoryRow | undefined;
  return row ?? null;
}

function ensureBuildRow(projectId: number, storyId: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO build_story (project_id, story_id) VALUES (?, ?)',
  ).run(projectId, storyId);
}

type BuildState = {
  build_status: BuildStatus;
  rework_origin: 'qa' | 'review' | null;
  rework_issues: number;
};

function readBuildState(projectId: number, storyId: string): BuildState {
  const row = buildRow(projectId, storyId);
  if (!row) return { build_status: 'picked_up', rework_origin: null, rework_issues: 0 };
  return {
    build_status: row.build_status,
    rework_origin: row.rework_origin,
    rework_issues: row.rework_issues,
  };
}

// The wire shape for a story list row / detail story. build_status is null for
// a story with no build_story row (its state defaults to 'picked_up'
// server-side for transitions, but it is NOT an in-build list row — SA-R-08).
function storyWireState(
  projectId: number,
  story: ReturnType<typeof parseStories>['stories'][number],
  srcText: string,
  mapping: Map<string, { cardId: number; ticketKey: string }>,
  reqIndex: Map<string, { id: string; text: string }>,
) {
  const row = buildRow(projectId, story.usId);
  const state = readBuildState(projectId, story.usId);
  const cardEntry = mapping.get(story.usId);
  const card = cardEntry ? cardByIdScoped(projectId, cardEntry.cardId) : undefined;
  const reqIds = [...storyReqIdSet(story, srcText)];
  const inBuild = row !== null;
  return {
    storyId: story.usId, // route param — always US-XX (assertion 4)
    title: story.title,
    build_status: inBuild ? state.build_status : null,
    status_pill: inBuild ? BUILD_STATUS_PILL[state.build_status] : null,
    // TM-XX display pill key from the kanban mapping; falls back to US-XX when
    // the read-model never ran (mirror design's card linkage).
    ticket_key: card?.ticket_key ?? cardEntry?.ticketKey ?? story.usId,
    card_column: card?.column ?? null,
    points: card?.points ?? null,
    priority: card?.priority ?? null,
    reqs: reqIds.map((id) => {
      const r = reqIndex.get(id);
      return r ? { id, text: r.text } : { id, text: null };
    }),
    rework_origin: inBuild ? state.rework_origin : null,
    rework_issues: inBuild ? state.rework_issues : 0,
  };
}

// ── Config read/write (code-builder/config-rules.md, `key: value` lines) ────

function configFilePath(ctx: ProjectContext): string {
  return path.join(codeBuilderDir(ctx), 'config-rules.md');
}

// Read the on-disk `key: value` record, merged over the defaults so the full
// closed key set always returns. Unknown keys (outside CONFIG_KEYS) are
// ignored — they're either leftovers from an older editor or noise.
function readConfigRecord(ctx: ProjectContext): Record<string, string> {
  const record: Record<string, string> = { ...DEFAULT_CONFIG };
  const p = configFilePath(ctx);
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
      const m = line.match(/^([^:]+):\s*(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      if (CONFIG_KEYS_SET.has(key)) record[key] = m[2];
    }
  }
  return record;
}

// Write the config record to code-builder/config-rules.md. The target is a
// fixed filename inside the project's code-builder dir — resolved-path
// containment + tmp+rename in the same dir (assertion 2), mirroring the rules
// PUT. Returns the byte size of what was written.
function writeConfigRecord(ctx: ProjectContext, record: Record<string, string>): number {
  const target = path.join(codeBuilderDir(ctx), 'config-rules.md');
  const contained = resolveInside(ctx.folder, 'code-builder', 'config-rules.md');
  if (!contained || target !== contained) {
    throw new Error('Invalid config path');
  }
  const body = CONFIG_KEYS.map((k) => `${k}: ${record[k] ?? ''}`).join('\n') + '\n';
  fs.mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, body, 'utf-8');
  fs.renameSync(tmp, target);
  return Buffer.byteLength(body, 'utf-8');
}

// ── Routes ──────────────────────────────────────────────────────────────────

export function registerBuildRoutes(app: express.Application): void {
  const prefix = '/api/projects/:id/build';

  // GET /stories — build list rows (stats + rework queue + agent strip are all
  // derived client-side from the same payload). Returns ALL stories with
  // build_status null for stories not in build; the client renders the in-build
  // rows (SA-R-08).
  app.get(`${prefix}/stories`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const { stories, missing } = readStoriesFile(ctx);
    const srcText = missing ? '' : fs.existsSync(storiesFilePath(ctx)) ? fs.readFileSync(storiesFilePath(ctx), 'utf-8') : '';
    const reqIndex = requirementIndex(ctx);
    const mapping = storyCardMapping(projectId);
    const rows = stories.map((s) => storyWireState(projectId, s, srcText, mapping, reqIndex));
    res.json({ stories: rows, missing_stories: missing });
  });

  // GET /rules — the rules surface payload (architecture + config + build
  // rules + per-agent guidelines). Missing files → seeded defaults.
  app.get(`${prefix}/rules`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const rulesPath = path.join(codeBuilderDir(ctx), 'build-rules.md');
    const rules = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf-8') : '';
    const record = readConfigRecord(ctx);
    const architecture = { ...DEFAULT_ARCHITECTURE };
    const agents: Record<string, { display: string; content: string }> = {};
    for (const agent of BUILD_AGENTS) {
      const p = path.join(ctx.folder, AGENT_FILE[agent]);
      const content = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : DEFAULT_AGENT_CONTENT[agent];
      agents[agent] = { display: AGENT_DISPLAY[agent], content };
    }
    res.json({
      architecture,
      config: CONFIG_KEYS.map((key) => ({ key, value: record[key] ?? '' })),
      rules,
      agents,
    });
  });

  // PUT /config — single-key write-back into code-builder/config-rules.md.
  // Closed key set (FR-8 + SA-R-06): architecture keys are NOT editable here.
  // Disk-verified in the gate (assertion 2: containment + tmp+rename same-dir).
  app.put(`${prefix}/config`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const body = (req.body ?? {}) as { key?: unknown; value?: unknown };
    if (typeof body.key !== 'string' || !CONFIG_KEYS_SET.has(body.key)) {
      res.status(422).json({ error: `Unknown config key ${String(body.key)}` });
      return;
    }
    const key = body.key;
    if (typeof body.value !== 'string') {
      res.status(422).json({ error: 'Config value must be a string.' });
      return;
    }
    if (body.value.length > CONFIG_VALUE_MAX) {
      res.status(422).json({ error: `Config values are limited to ${CONFIG_VALUE_MAX} characters.` });
      return;
    }
    const record = readConfigRecord(ctx);
    record[key] = body.value;
    const size = writeConfigRecord(ctx, record);
    res.json({ ok: true, key, value: record[key], size });
  });

  // PUT /rules/agents/:agent — per-agent coding guidelines write-back. :agent
  // is validated against the fixed set (BUILD_AGENTS) and never used as a raw
  // path segment; the filename comes from AGENT_FILE only.
  app.put(`${prefix}/rules/agents/:agent`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const agent = req.params.agent;
    if (!(BUILD_AGENTS as readonly string[]).includes(agent)) {
      res.status(422).json({ error: `Unknown agent ${String(agent)}` });
      return;
    }
    const a = agent as BuildAgent;
    const body = (req.body ?? {}) as { content?: unknown };
    if (typeof body.content !== 'string') {
      res.status(422).json({ error: 'Guidelines content must be a string.' });
      return;
    }
    if (Buffer.byteLength(body.content, 'utf-8') > MARKDOWN_MAX_BYTES) {
      res.status(422).json({ error: 'Guidelines are limited to 2 MB.' });
      return;
    }
    const target = resolveInside(ctx.folder, AGENT_FILE[a]);
    if (!target) {
      res.status(422).json({ error: 'Invalid guidelines path.' });
      return;
    }
    fs.mkdirSync(dirname(target), { recursive: true });
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, body.content, 'utf-8');
    fs.renameSync(tmp, target);
    res.json({ ok: true, agent: a, size: Buffer.byteLength(body.content, 'utf-8') });
  });

  // PUT /rules — build/deploy rules markdown → code-builder/build-rules.md.
  // Same guard family as the design rules PUT minus the '..' red-herring check
  // (DR2 F-SEC-2 lesson — containment is the guarantee, the string check is
  // noise). tmp+rename atomic write in the same dir (assertion 2).
  app.put(`${prefix}/rules`, (req, res) => {
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
    if (Buffer.byteLength(body.content, 'utf-8') > MARKDOWN_MAX_BYTES) {
      res.status(422).json({ error: 'Rules are limited to 2 MB.' });
      return;
    }
    const target = resolveInside(ctx.folder, 'code-builder', 'build-rules.md');
    if (!target) {
      res.status(422).json({ error: 'Invalid rules path.' });
      return;
    }
    fs.mkdirSync(dirname(target), { recursive: true });
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, body.content, 'utf-8');
    fs.renameSync(tmp, target);
    res.json({ ok: true, size: Buffer.byteLength(body.content, 'utf-8') });
  });

  // getBuildContext shared by the /:storyId family — resolves the project and
  // confirms the story belongs to THIS project's stories.md (assertion 4).
  // Grammar-validated storyId is a fast-path 404 only, not the membership
  // proof.
  const getStoryRoute = (
    req: express.Request,
  ): { projectId: number; ctx: ProjectContext; storyId: string } | { error: { status: number; message: string } } => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) return { error: { status: 400, message: 'Unknown project id or slug' } };
    const storyId = req.params.storyId;
    if (!/^US-\d{2,}$/.test(storyId)) return { error: { status: 404, message: 'Unknown story' } };
    const { stories, missing } = readStoriesFile(ctx);
    if (!stories.some((s) => s.usId === storyId)) {
      return { error: { status: 404, message: missing ? 'No stories for this project yet' : 'Unknown story' } };
    }
    return { projectId, ctx, storyId };
  };

  // GET /:storyId — story detail payload (requirement card + files + apis +
  // notes + build state).
  app.get(`${prefix}/:storyId`, (req, res) => {
    const route = getStoryRoute(req);
    if ('error' in route) {
      res.status(route.error.status).json({ error: route.error.message });
      return;
    }
    const { projectId, ctx, storyId } = route;
    const { stories } = readStoriesFile(ctx);
    const story = stories.find((s) => s.usId === storyId)!;
    const srcText = fs.existsSync(storiesFilePath(ctx)) ? fs.readFileSync(storiesFilePath(ctx), 'utf-8') : '';
    const reqIndex = requirementIndex(ctx);
    const mapping = storyCardMapping(projectId);
    const wire = storyWireState(projectId, story, srcText, mapping, reqIndex);
    const files = db
      .prepare(
        'SELECT id, path, layer FROM build_story_file WHERE project_id = ? AND story_id = ? ORDER BY created_at ASC, id ASC',
      )
      .all(projectId, storyId) as { id: number; path: string; layer: 'new' | 'modified' | null }[];
    const apis = db
      .prepare(
        'SELECT id, tier, method, route_path, description FROM build_story_api WHERE project_id = ? AND story_id = ? ORDER BY created_at ASC, id ASC',
      )
      .all(projectId, storyId) as { id: number; tier: 'bff' | 'be'; method: (typeof API_METHODS)[number]; route_path: string; description: string }[];
    const notes = db
      .prepare(
        'SELECT id, author, body, created_at FROM build_note WHERE project_id = ? AND story_id = ? ORDER BY created_at ASC, id ASC',
      )
      .all(projectId, storyId) as { id: number; author: string; body: string; created_at: string }[];
    res.json({
      story: {
        storyId: wire.storyId,
        title: wire.title,
        build_status: wire.build_status ?? 'picked_up',
        status_pill: wire.status_pill ?? BUILD_STATUS_PILL.picked_up,
        ticket_key: wire.ticket_key,
        card_column: wire.card_column,
        reqs: wire.reqs,
        rework_origin: wire.rework_origin,
        rework_issues: wire.rework_issues,
      },
      files,
      apis,
      notes,
    });
  });

  // POST /:storyId/files — add an FE file the story edits. Paths are validated
  // METADATA strings stored in DB — never used in a filesystem operation
  // (SA-R-04); validation is data hygiene, not containment.
  app.post(`${prefix}/:storyId/files`, (req, res) => {
    const route = getStoryRoute(req);
    if ('error' in route) {
      res.status(route.error.status).json({ error: route.error.message });
      return;
    }
    const { projectId, storyId } = route;
    const body = (req.body ?? {}) as { path?: unknown; layer?: unknown };
    const p = typeof body.path === 'string' ? body.path.trim() : '';
    if (!p || p.length > FILE_PATH_MAX || p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.split(/[\\/]/).includes('..') || /[\x00-\x1f\x7f]/.test(p)) {
      res.status(422).json({ error: FILE_PATH_ERROR });
      return;
    }
    const layer = body.layer ?? null;
    if (layer !== null && layer !== 'new' && layer !== 'modified') {
      res.status(422).json({ error: 'Layer must be new, modified, or null.' });
      return;
    }
    const existing = db
      .prepare('SELECT id FROM build_story_file WHERE project_id = ? AND story_id = ? AND path = ?')
      .get(projectId, storyId, p);
    if (existing) {
      res.status(409).json({ error: 'This file is already in the list.' });
      return;
    }
    const info = db
      .prepare('INSERT INTO build_story_file (project_id, story_id, path, layer) VALUES (?, ?, ?, ?)')
      .run(projectId, storyId, p, layer as 'new' | 'modified' | null);
    res.status(201).json({ file: { id: Number(info.lastInsertRowid), path: p, layer } });
  });

  // DELETE /:storyId/files/:fileId — scoped delete. fileId is parsed as an
  // integer and every clause binds a parameter (assertion 3) — a crafted
  // foreign id or storyId can never touch another project's row.
  app.delete(`${prefix}/:storyId/files/:fileId`, (req, res) => {
    const route = getStoryRoute(req);
    if ('error' in route) {
      res.status(route.error.status).json({ error: route.error.message });
      return;
    }
    const { projectId, storyId } = route;
    const fileId = Number(req.params.fileId);
    if (!Number.isInteger(fileId) || fileId <= 0) {
      res.status(422).json({ error: 'Invalid file id.' });
      return;
    }
    const info = db
      .prepare('DELETE FROM build_story_file WHERE id = ? AND project_id = ? AND story_id = ?')
      .run(fileId, projectId, storyId);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Unknown file.' });
      return;
    }
    res.json({ ok: true });
  });

  // POST /:storyId/apis — add a BFF or BE route the story calls (FR-14/15).
  // Per-field validation: tier/method enums + path must start with '/' + caps.
  app.post(`${prefix}/:storyId/apis`, (req, res) => {
    const route = getStoryRoute(req);
    if ('error' in route) {
      res.status(route.error.status).json({ error: route.error.message });
      return;
    }
    const { projectId, storyId } = route;
    const body = (req.body ?? {}) as { tier?: unknown; method?: unknown; path?: unknown; description?: unknown };
    if (body.tier !== 'bff' && body.tier !== 'be') {
      res.status(422).json({ error: 'API tier must be bff or be.' });
      return;
    }
    if (!(API_METHODS as readonly string[]).includes(body.method as string)) {
      res.status(422).json({ error: 'Method must be one of GET, POST, PUT, PATCH, DELETE.' });
      return;
    }
    const routePath = typeof body.path === 'string' ? body.path : '';
    if (!routePath.startsWith('/')) {
      res.status(422).json({ error: 'Route path must start with /.' });
      return;
    }
    if (routePath.length > ROUTE_PATH_MAX || /[\x00-\x1f\x7f]/.test(routePath)) {
      res.status(422).json({ error: `Route paths are limited to ${ROUTE_PATH_MAX} characters.` });
      return;
    }
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, API_DESC_MAX) : '';
    if ((typeof body.description === 'string' ? body.description.length : 0) > API_DESC_MAX) {
      res.status(422).json({ error: `Descriptions are limited to ${API_DESC_MAX} characters.` });
      return;
    }
    const info = db
      .prepare(
        'INSERT INTO build_story_api (project_id, story_id, tier, method, route_path, description) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(projectId, storyId, body.tier, body.method, routePath, description);
    res.status(201).json({
      api: { id: Number(info.lastInsertRowid), tier: body.tier, method: body.method, route_path: routePath, description },
    });
  });

  // DELETE /:storyId/apis/:apiId — scoped delete (assertion 3).
  app.delete(`${prefix}/:storyId/apis/:apiId`, (req, res) => {
    const route = getStoryRoute(req);
    if ('error' in route) {
      res.status(route.error.status).json({ error: route.error.message });
      return;
    }
    const { projectId, storyId } = route;
    const apiId = Number(req.params.apiId);
    if (!Number.isInteger(apiId) || apiId <= 0) {
      res.status(422).json({ error: 'Invalid api id.' });
      return;
    }
    const info = db
      .prepare('DELETE FROM build_story_api WHERE id = ? AND project_id = ? AND story_id = ?')
      .run(apiId, projectId, storyId);
    if (info.changes === 0) {
      res.status(404).json({ error: 'Unknown api.' });
      return;
    }
    res.json({ ok: true });
  });

  // POST /:storyId/notes — human note (assertion 5: '<' rejected → storage
  // guaranteed plain-text; 10 KB cap measured on the actual parsed body).
  app.post(`${prefix}/:storyId/notes`, (req, res) => {
    const route = getStoryRoute(req);
    if ('error' in route) {
      res.status(route.error.status).json({ error: route.error.message });
      return;
    }
    const { projectId, storyId } = route;
    const body = (req.body ?? {}) as { body?: unknown; author?: unknown };
    if (typeof body.body !== 'string' || !body.body.trim()) {
      res.status(422).json({ error: NOTE_REQUIRED_ERROR });
      return;
    }
    if (body.body.includes('<')) {
      // Guaranteed-plaintext storage: a '<' can't be rendered safely with
      // escape-then-markdown once an attacker controls it (design F-3 family).
      res.status(422).json({ error: NOTE_PLAIN_TEXT_ERROR });
      return;
    }
    if (Buffer.byteLength(body.body, 'utf-8') > NOTE_MAX_BYTES) {
      res.status(422).json({ error: 'Notes are limited to 10 KB.' });
      return;
    }
    const author = typeof body.author === 'string' && body.author.trim() ? body.author.trim().slice(0, 80) : 'Will';
    const info = db
      .prepare(
        'INSERT INTO build_note (project_id, story_id, author, body) VALUES (?, ?, ?, ?)',
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

  // POST /:storyId/transition — build-status flip. `to` must be a legal
  // transition from the current state per TRANSITIONS (assertion 1: 409
  // otherwise). No kanban_card writes this slice (SA-R-05 — sprint owns the
  // spine).
  app.post(`${prefix}/:storyId/transition`, (req, res) => {
    const route = getStoryRoute(req);
    if ('error' in route) {
      res.status(route.error.status).json({ error: route.error.message });
      return;
    }
    const { projectId, storyId } = route;
    const current = buildRow(projectId, storyId)?.build_status ?? 'picked_up';
    const to = (req.body ?? {}).to;
    if (!isBuildStatus(to)) {
      res.status(422).json({ error: `Unknown build status ${String(to)}` });
      return;
    }
    const allowed = TRANSITIONS[current] ?? [];
    if (!allowed.includes(to)) {
      res.status(409).json({ error: `Cannot move story from ${current} to ${to}` });
      return;
    }
    // Lazy-create the row: a story with no build_story row reads as
    // 'picked_up' above — an UPDATE without a row would silently no-op.
    ensureBuildRow(projectId, storyId);
    db.prepare(
      `UPDATE build_story SET build_status = ?, updated_at = datetime('now') WHERE project_id = ? AND story_id = ?`,
    ).run(to, projectId, storyId);
    res.json({ build_status: to });
  });
}
