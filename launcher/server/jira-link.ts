// Sprint tab — Jira connection management.
//
// Per-project single link with CRUD + test-connection. All mutations are
// scoped to the requesting project (project_id from route param matched against
// the DB row, never from the request body). The stored API token is written as
// a salted one-way hash so the server never retains a plaintext secret.
//
// Verification honesty (DR2 #4): the shipped server has no Atlassian client —
// a one-way hash is unusable by a connector — so saves mark the link `pending`
// and test-connection reports `verified: false`. Wiring a real probe (+ the
// 401/403/429 mapping) depends on Will's A/B call on decisions 1/5 (AES-GCM at
// rest vs local-only board); see the SA-R risk log in design/sprint-tab-build-plan.md.

import crypto from 'node:crypto';

import type { Request, Response, Application } from 'express';
import { db } from './db.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface JiraLinkRow {
  project_id: number;
  jira_project_key: string;
  jira_base_url: string;
  account_email: string;
  api_token_hash: string;
  sync_direction: 'two_way' | 'launcher_to_jira' | 'jira_to_launcher';
  auto_create: boolean;
  sync_status: 'connected' | 'pending' | 'stale' | 'failed' | 'offline';
  sync_error: string | null;
  last_synced_at: string | null;
}

export interface JiraLinkCreateInput {
  jira_project_key: string;
  jira_base_url: string;
  account_email: string;
  api_token: string; // plain-text token from client (hashed before persist)
  sync_direction?: 'two_way' | 'launcher_to_jira' | 'jira_to_launcher';
  auto_create?: boolean;
}

export interface JiraLinkPatchInput {
  jira_project_key?: string;
  jira_base_url?: string;
  account_email?: string;
  api_token?: string; // plain-text token (hashed before persist) — omit to keep existing
  sync_direction?: 'two_way' | 'launcher_to_jira' | 'jira_to_launcher';
  auto_create?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

// ── Input allowlists (DR2 #1/#2 — server is the trust boundary) ────────────

const SYNC_DIRECTIONS = new Set(['two_way', 'launcher_to_jira', 'jira_to_launcher']);

/**
 * http(s) only, with a host and no embedded user:pass — rejects `javascript:`,
 * `file:`, `data:` and every credentials-in-URL variant (security §3/§6; DR2
 * #1). Returns an error string, or null when the URL is acceptable.
 */
export function validateBaseUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return 'Base URL must be a text value.';
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return 'Base URL must be a valid URL with protocol.';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    return 'Base URL must use http or https — other schemes are not allowed.';
  if (!parsed.host) return 'Base URL must include a host.';
  if (parsed.username || parsed.password)
    return 'Base URL must not embed credentials — use the Account email / API token fields.';
  return null;
}

/** Coerce auto_create through {true, false, 1, 0}; anything else → null. */
function coerceAutoCreate(v: unknown): boolean | null {
  if (v === true || v === 1 || v === '1' || v === 'true') return true;
  if (v === false || v === 0 || v === '0' || v === 'false') return false;
  return null;
}

function isValidSyncDirection(v: unknown): v is JiraLinkCreateInput['sync_direction'] {
  return typeof v === 'string' && SYNC_DIRECTIONS.has(v);
}

// Per-row salt (DR2 #5): defeats offline credential-stuffing from a DB dump.
// The digest stays one-way — deciding whether the connector needs the
// plaintext (AES-GCM at rest) or stays local-only is Will's A/B call (1/5).
const TOKEN_SALT_BYTES = 16;
function hashToken(token: string): string {
  const salt = crypto.randomBytes(TOKEN_SALT_BYTES);
  const digest = crypto.createHash('sha256').update(salt).update(token).digest('hex');
  return `${salt.toString('hex')}:${digest}`;
}

function serializeLink(row: JiraLinkRow): Record<string, unknown> {
  return {
    projectId: row.project_id,
    jiraProjectKey: row.jira_project_key,
    jiraBaseUrl: row.jira_base_url,
    accountEmail: row.account_email,
    // Never send the hash; the UI only knows "a token is stored".
    hasToken: row.api_token_hash.length > 0,
    syncDirection: row.sync_direction,
    autoCreate: row.auto_create,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
    lastSyncedAt: row.last_synced_at,
    lastSyncedRelative: formatRelative(row.last_synced_at),
  };
}

function formatRelative(ts: string | null): string {
  if (!ts) return 'never';
  // The server writes datetime('now') — UTC with no offset — so parse the naive
  // stamp as UTC. Parsing it as local time skews every banner by the machine's
  // UTC offset (a just-synced link would read '10h ago' on UTC+10).
  const tsMs = Date.parse(ts.replace(' ', 'T') + 'Z');
  if (Number.isNaN(tsMs)) return 'never';
  const diff = Math.max(0, Math.floor((Date.now() - tsMs) / 1000));
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function getLinkByProject(projectId: number): JiraLinkRow | undefined {
  return db.prepare(
    `SELECT * FROM jira_link WHERE project_id = ?`,
  ).get(projectId) as JiraLinkRow | undefined;
}

// Validate input for the CREATE path (also applies to PATCH fields).
function validateCreateInput(input: Partial<JiraLinkCreateInput>): string | null {
  if (!input.jira_project_key) return 'Project key is required.';
  if (!/^[A-Z][A-Z0-9]+$/.test(input.jira_project_key))
    return 'Project key must be 2–10 uppercase letters (e.g. TM, TEN).';
  if (!input.jira_base_url) return 'Base URL is required.';
  const urlErr = validateBaseUrl(input.jira_base_url);
  if (urlErr) return urlErr;
  if (!input.account_email) return 'Account email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.account_email))
    return 'Enter a valid email address.';
  if (typeof input.api_token !== 'string' || input.api_token.length < 24)
    return 'API token must be at least 24 characters.';
  if (input.sync_direction !== undefined && !isValidSyncDirection(input.sync_direction))
    return 'Sync direction must be two_way, launcher_to_jira, or jira_to_launcher.';
  if (input.auto_create !== undefined && coerceAutoCreate(input.auto_create) === null)
    return 'Auto-create must be a boolean.';
  return null;
}

// ── Route handlers ─────────────────────────────────────────────────────────

function handleGetLink(req: Request, res: Response): void {
  const projectId = parseProjectId(req.params.projectId);
  if (projectId === null) {
    res.status(400).json({ error: 'Valid project ID is required.' });
    return;
  }

  // RBAC gate — scoped to the requesting project. TODO(auth): role check per
  // rbac-matrix.md row for Sprint tab access. For now, any authenticated user
  // who can reach this route has view access.
  const link = getLinkByProject(projectId);
  if (!link) {
    res.status(404).json({ error: 'No Jira connection found for this project.' });
    return;
  }

  res.json({ link: serializeLink(link) });
}

function handlePostTestConnection(req: Request, res: Response): void {
  const projectId = parseProjectId(req.params.projectId);
  if (projectId === null) {
    res.status(400).json({ error: 'Valid project ID is required.' });
    return;
  }

  const link = getLinkByProject(projectId);
  if (!link) {
    res.status(404).json({ error: 'No Jira connection found. Save a connection first to test it.' });
    return;
  }

  // DR2 #4 — no real probe exists: the shipped server has no Atlassian client
  // (the token is a one-way salted hash; a connector needs plaintext — Will's
  // A/B call on decisions 1/5). Until the probe lands we must NOT claim the
  // connection works: report the honest unverified state and let the banner
  // surface it. The 401/403/429 mapping arrives with the secrets design.
  res.json({
    ok: true,
    verified: false,
    syncStatus: link.sync_status,
    projectKey: link.jira_project_key,
    baseUrl: link.jira_base_url,
    message:
      'Connection saved, but Jira access is not verified yet — a real probe (401/403/429) lands with the secrets design (plan decisions 1/5).',
  });
}

// The client contract (src/lib/api.ts JiraLinkInput) is camelCase; the DB
// layer and these input types are snake_case. Normalize once at the route
// boundary so both POST and PATCH see the same shape (board.ts reads its
// camelCase body directly — the client naming is the convention).
function normalizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, string> = {
    jiraProjectKey: 'jira_project_key',
    jiraBaseUrl: 'jira_base_url',
    accountEmail: 'account_email',
    apiToken: 'api_token',
    syncDirection: 'sync_direction',
    autoCreate: 'auto_create',
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) out[map[k] ?? k] = v;
  return out;
}

function handlePostLink(req: Request, res: Response): void {
  const projectId = parseProjectId(req.params.projectId);
  if (projectId === null) {
    res.status(400).json({ error: 'Valid project ID is required.' });
    return;
  }

  const input: Partial<JiraLinkCreateInput> = normalizeBody(req.body);
  const err = validateCreateInput(input);
  if (err) {
    res.status(422).json({ error: err });
    return;
  }

  // Upsert — project_id is the PK so we either INSERT or REPLACE. The enums
  // were allowlisted by validateCreateInput; write the normalized wire values
  // so neither the fresh-DB CHECK nor a migrated no-CHECK column ever sees a
  // raw caller string (DR2 #2).
  const apiTokenHash = hashToken(input.api_token!);
  const syncDirection = isValidSyncDirection(input.sync_direction)
    ? input.sync_direction
    : 'two_way';
  const autoCreate = coerceAutoCreate(input.auto_create) ?? true;
  db.prepare(`INSERT OR REPLACE INTO jira_link (
    project_id, jira_project_key, jira_base_url, account_email,
    api_token_hash, sync_direction, auto_create
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    projectId,
    input.jira_project_key,
    input.jira_base_url,
    input.account_email,
    apiTokenHash,
    syncDirection,
    autoCreate ? 1 : 0,
  );

  // Update to now on first connect so the banner shows "just synced", and mark
  // the link pending — no real probe ran, so claiming `connected` would be a
  // lie (DR2 #4).
  db.prepare("UPDATE jira_link SET sync_status = ?, last_synced_at = datetime('now') WHERE project_id = ?")
    .run('pending', projectId);

  const link = getLinkByProject(projectId)!;
  res.status(201).json({ link: serializeLink(link) });
}

function handlePatchLink(req: Request, res: Response): void {
  const projectId = parseProjectId(req.params.projectId);
  if (projectId === null) {
    res.status(400).json({ error: 'Valid project ID is required.' });
    return;
  }

  const existing = getLinkByProject(projectId);
  if (!existing) {
    res.status(404).json({ error: 'No Jira connection found for this project.' });
    return;
  }

  // Partial validation — only validate fields that changed (DR2 #1/#2: the
  // same allowlists as the create path, so a migrated DB can never silently
  // accept a javascript: URL or a raw enum string).
  const input: Partial<JiraLinkPatchInput> = normalizeBody(req.body);
  if (input.jira_project_key && !/^[A-Z][A-Z0-9]+$/.test(input.jira_project_key)) {
    res.status(422).json({ error: 'Project key must be 2–10 uppercase letters (e.g. TM, TEN).' });
    return;
  }
  if (input.jira_base_url !== undefined) {
    const urlErr = validateBaseUrl(input.jira_base_url);
    if (urlErr) {
      res.status(422).json({ error: urlErr });
      return;
    }
  }
  if (input.account_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.account_email)) {
    res.status(422).json({ error: 'Enter a valid email address.' });
    return;
  }
  if (input.sync_direction !== undefined && !isValidSyncDirection(input.sync_direction)) {
    res.status(422).json({ error: 'Sync direction must be two_way, launcher_to_jira, or jira_to_launcher.' });
    return;
  }
  if (input.api_token !== undefined && (typeof input.api_token !== 'string' || input.api_token.length < 24)) {
    res.status(422).json({ error: 'API token must be at least 24 characters.' });
    return;
  }
  if (input.auto_create !== undefined && coerceAutoCreate(input.auto_create) === null) {
    res.status(422).json({ error: 'Auto-create must be a boolean.' });
    return;
  }

  // Build dynamic UPDATE — only set columns that are provided (token omitted = keep existing).
  const updates: string[] = [];
  const values: unknown[] = [];

  if (input.jira_project_key !== undefined) {
    updates.push('jira_project_key = ?'); values.push(input.jira_project_key);
  }
  if (input.jira_base_url !== undefined) {
    updates.push('jira_base_url = ?'); values.push(input.jira_base_url);
  }
  if (input.account_email !== undefined) {
    updates.push('account_email = ?'); values.push(input.account_email);
  }
  if (input.api_token !== undefined) {
    updates.push('api_token_hash = ?'); values.push(hashToken(input.api_token));
  }
  if (input.sync_direction !== undefined) {
    updates.push('sync_direction = ?'); values.push(input.sync_direction);
  }
  if (input.auto_create !== undefined) {
    updates.push('auto_create = ?'); values.push(coerceAutoCreate(input.auto_create) ? 1 : 0);
  }

  // Concurrent-edit guard: only update if the row hasn't changed since we
  // read it. The optimistic-lock column is last_synced_at.
  const optimisticTs = existing.last_synced_at;
  updates.push("last_synced_at = datetime('now')");
  // Any config/token change invalidates prior verification — back to pending
  // until a real probe re-verifies (DR2 #4).
  updates.push("sync_status = 'pending'");

  const sql = `UPDATE jira_link SET ${updates.join(', ')} WHERE project_id = ? AND last_synced_at = ?`;
  values.push(projectId, optimisticTs);
  const result = db.prepare(sql).run(...values);

  if (result.changes === 0) {
    res.status(409).json({ error: 'Someone else updated the Jira link. Reload to see their changes.' });
    return;
  }

  const link = getLinkByProject(projectId)!;
  res.json({ link: serializeLink(link) });
}

function handleDeleteLink(req: Request, res: Response): void {
  const projectId = parseProjectId(req.params.projectId);
  if (projectId === null) {
    res.status(400).json({ error: 'Valid project ID is required.' });
    return;
  }

  const existing = getLinkByProject(projectId);
  if (!existing) {
    // Already disconnected — idempotent.
    res.json({ deleted: true, message: 'No Jira connection to disconnect.' });
    return;
  }

  db.prepare('DELETE FROM jira_link WHERE project_id = ?').run(projectId);
  res.json({ deleted: true, message: 'Jira connection disconnected. The Sprint board will return to setup.' });
}

// ── Route registration ─────────────────────────────────────────────────────

/**
 * Parse a route-param ID (numeric or slug). Matches the launcher's routing
 * convention: a bare numeric id resolves directly; anything else is tried as
 * a project slug. The slug lookup must be reachable — an id guard that
 * rejects non-numeric strings outright would make it dead code.
 */
export function parseProjectId(idOrSlug: string): number | null {
  // Accept numeric IDs directly.
  const n = Number(idOrSlug);
  if (Number.isInteger(n) && n > 0 && db.prepare('SELECT 1 FROM project WHERE id = ?').get(n)) {
    return n;
  }
  // Also accept slugs — look them up in the project table.
  const row = db.prepare('SELECT id FROM project WHERE slug = ?').get(idOrSlug) as { id: number } | undefined;
  return row ? row.id : null;
}

export function registerJiraLinkRoutes(app: Application): void {
  const prefix = '/api/projects/:projectId/jira/link';

  app.get(prefix, handleGetLink);
  // /test MUST be registered before the base /link route — both have the same
  // static/param segment count and Express picks the first match.
  app.post(`${prefix}/test`, handlePostTestConnection);
  app.post(prefix, handlePostLink);
  app.patch(prefix, handlePatchLink);
  app.delete(prefix, handleDeleteLink);
}
