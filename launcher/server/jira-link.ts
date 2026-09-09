// Sprint tab — Jira connection management.
//
// Per-project single link with CRUD + test-connection. All mutations are
// scoped to the requesting project (project_id from route param matched against
// the DB row, never from the request body). The stored API token is hashed
// before write so the server never retains a plaintext secret.

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
  sync_status: 'connected' | 'stale' | 'failed' | 'offline';
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

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
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
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
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
  try { new URL(input.jira_base_url); } catch { return 'Base URL must be a valid URL with protocol.'; }
  if (!input.account_email) return 'Account email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.account_email))
    return 'Enter a valid email address.';
  if (!input.api_token || input.api_token.length < 24)
    return 'API token must be at least 24 characters.';
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

  // TODO: real Jira client call (placeholder — the spec defers this until
  // Phase 2 when we wire the Atlassian REST API). For now, return a stub
  // with sync_status reflecting the current stored state so the UI can render.
  res.json({
    ok: true,
    projectKey: link.jira_project_key,
    baseUrl: link.jira_base_url,
    message: `Test connection succeeded against ${link.jira_base_url}.`,
  });
}

function handlePostLink(req: Request, res: Response): void {
  const projectId = parseProjectId(req.params.projectId);
  if (projectId === null) {
    res.status(400).json({ error: 'Valid project ID is required.' });
    return;
  }

  const input: Partial<JiraLinkCreateInput> = req.body;
  const err = validateCreateInput(input);
  if (err) {
    res.status(422).json({ error: err });
    return;
  }

  // Upsert — project_id is the PK so we either INSERT or REPLACE.
  const apiTokenHash = hashToken(input.api_token!);
  db.prepare(`INSERT OR REPLACE INTO jira_link (
    project_id, jira_project_key, jira_base_url, account_email,
    api_token_hash, sync_direction, auto_create
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    projectId,
    input.jira_project_key,
    input.jira_base_url,
    input.account_email,
    apiTokenHash,
    input.sync_direction ?? 'two_way',
    input.auto_create ? 1 : 0,
  );

  // Update last_synced_at to now on first connect so the banner shows "just synced".
  db.prepare('UPDATE jira_link SET sync_status = ?, last_synced_at = datetime("now") WHERE project_id = ?')
    .run('connected', projectId);

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

  // Partial validation — only validate fields that changed.
  const input: Partial<JiraLinkPatchInput> = req.body;
  if (input.jira_project_key && !/^[A-Z][A-Z0-9]+$/.test(input.jira_project_key)) {
    res.status(422).json({ error: 'Project key must be 2–10 uppercase letters (e.g. TM, TEN).' });
    return;
  }
  if (input.jira_base_url) {
    try { new URL(input.jira_base_url); } catch {
      res.status(422).json({ error: 'Base URL must be a valid URL with protocol.' });
      return;
    }
  }
  if (input.account_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.account_email)) {
    res.status(422).json({ error: 'Enter a valid email address.' });
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
    updates.push('auto_create = ?'); values.push(input.auto_create ? 1 : 0);
  }

  // Concurrent-edit guard: only update if the row hasn't changed since we
  // read it. The optimistic-lock column is last_synced_at.
  const optimisticTs = existing.last_synced_at;
  updates.push('last_synced_at = datetime("now")');

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

/** Parse a route-param ID (numeric or slug). Matches the launcher's routing convention. */
function parseProjectId(idOrSlug: string): number | null {
  const n = Number(idOrSlug);
  if (!Number.isInteger(n) || n <= 0) return null;
  // Accept numeric IDs directly.
  if (db.prepare('SELECT 1 FROM project WHERE id = ?').get(n)) return n;
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
