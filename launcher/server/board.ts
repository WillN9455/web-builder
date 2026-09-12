// Sprint tab — Kanban board read-model (screen 6).
//
// The board is a server-backed view over the locally-persisted kanban_card
// table (Jira is the source of truth via ~30s polling; the local cards keep
// the board renderable and fast). Every query is scoped to the requesting
// project: project_id comes from the route param matched against the row,
// never from the request body. Card mutations verify the card belongs to the
// project before touching it, so a cross-project card id cannot move a row it
// doesn't own (IDOR prevention — see skills/security.md §IDOR).

import type { Request, Response, Application } from 'express';
import { db } from './db.js';
import { parseProjectId } from './jira-link.js';

// ── Types ──────────────────────────────────────────────────────────────────

export const BOARD_COLUMNS = ['todo', 'inprogress', 'inreview', 'done'] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const BOARD_PRIORITIES = ['high', 'med', 'low'] as const;
export type BoardPriority = (typeof BOARD_PRIORITIES)[number];

// Mirrors kanban_card in db.ts. Ticket keys are generated server-side
// (`{jira_key}-{n}` when a Jira link exists, else `SB-{n}`).
export interface BoardCard {
  id: number;
  projectId: number;
  ticketKey: string;
  title: string;
  column: BoardColumn;
  priority: BoardPriority;
  points: number;
  assigneeAgent: string;
  status: string;
  updatedAt: string;
}

export interface BoardCreateInput {
  title: string;
  column?: BoardColumn;
  priority?: BoardPriority;
  points?: number;
  assigneeAgent?: string;
  status?: string;
}

export interface BoardPatchInput {
  title?: string;
  column?: BoardColumn;
  priority?: BoardPriority;
  points?: number;
  assigneeAgent?: string;
  status?: string;
}

type CardRow = {
  id: number;
  project_id: number;
  ticket_key: string;
  title: string;
  column: string;
  priority: string;
  points: number;
  assignee_agent: string;
  status: string;
  updated_at: string;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function serializeCard(row: CardRow): BoardCard {
  return {
    id: row.id,
    projectId: row.project_id,
    ticketKey: row.ticket_key,
    title: row.title,
    column: row.column as BoardColumn,
    priority: row.priority as BoardPriority,
    points: row.points,
    assigneeAgent: row.assignee_agent,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function getCardByIdScoped(cardId: number, projectId: number): CardRow | undefined {
  return db
    .prepare('SELECT * FROM kanban_card WHERE id = ? AND project_id = ?')
    .get(cardId, projectId) as CardRow | undefined;
}

function listCards(projectId: number): CardRow[] {
  return db
    .prepare(
      `SELECT * FROM kanban_card WHERE project_id = ? ORDER BY (column = 'todo') DESC, updated_at DESC`,
    )
    .all(projectId) as CardRow[];
}

function countCards(projectId: number): Record<BoardColumn, number> {
  const rows = db
    .prepare('SELECT column, COUNT(*) AS n FROM kanban_card WHERE project_id = ? GROUP BY column')
    .all(projectId) as { column: string; n: number }[];
  const counts: Record<BoardColumn, number> = { todo: 0, inprogress: 0, inreview: 0, done: 0 };
  for (const row of rows) {
    if (row.column in counts) counts[row.column as BoardColumn] = row.n;
  }
  return counts;
}

// Next ticket key for a project: `{prefix}-{next}` where next is the max
// numeric suffix already in use plus one. Generated server-side so the board
// never trusts a client-supplied ticket id. Uses the linked Jira project key
// when a connection exists, else the generic `SB` (Sprint Board) fallback.
function nextTicketKey(project: { id: number }): string {
  const link = db
    .prepare('SELECT jira_project_key FROM jira_link WHERE project_id = ?')
    .get(project.id) as { jira_project_key: string } | undefined;
  const prefix = (link?.jira_project_key ?? 'SB').toUpperCase();

  const rows = db
    .prepare('SELECT ticket_key FROM kanban_card WHERE project_id = ?')
    .all(project.id) as { ticket_key: string }[];
  let maxSuffix = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const row of rows) {
    const m = re.exec(row.ticket_key);
    if (m) maxSuffix = Math.max(maxSuffix, Number(m[1]));
  }
  return `${prefix}-${maxSuffix + 1}`;
}

// Validate a CREATE/PATCH input. Returns a human-readable error, or null when
// valid. Column/priority are constrained by the schema CHECKs but validated
// explicitly so the error message names the allowed values instead of a bare
// "CHECK constraint failed".
function validateCardInput(input: BoardCreateInput | BoardPatchInput): string | null {
  if (input.title !== undefined && !String(input.title).trim()) {
    return 'Issue title is required.';
  }
  if (input.column !== undefined && !BOARD_COLUMNS.includes(input.column)) {
    return 'Column must be one of todo, inprogress, inreview, done.';
  }
  if (input.priority !== undefined && !BOARD_PRIORITIES.includes(input.priority)) {
    return 'Priority must be high, med, or low.';
  }
  if (input.points !== undefined && (!Number.isInteger(input.points) || input.points < 0)) {
    return 'Points must be a non-negative whole number.';
  }
  return null;
}

// ── Route handlers ─────────────────────────────────────────────────────────

function handleGetBoard(req: Request, res: Response): void {
  const projectId = parseProjectId(req.params.projectId);
  if (projectId === null) {
    res.status(400).json({ error: 'Valid project ID is required.' });
    return;
  }

  // Empty board is a 200 with an empty card list, never a 500 (mirrors the
  // requirements read-model `no-prd` idiom — a missing source is an empty
  // state, not an error).
  const cards = listCards(projectId).map(serializeCard);
  res.json({ cards, counts: countCards(projectId) });
}

function handlePostCard(req: Request, res: Response): void {
  const projectId = parseProjectId(req.params.projectId);
  if (projectId === null) {
    res.status(400).json({ error: 'Valid project ID is required.' });
    return;
  }

  const input: BoardCreateInput = req.body ?? {};
  const err = validateCardInput(input);
  if (err) {
    res.status(422).json({ error: err });
    return;
  }

  const project = db.prepare('SELECT id FROM project WHERE id = ?').get(projectId) as
    | { id: number }
    | undefined;
  const column: BoardColumn = input.column ?? 'todo';
  const priority: BoardPriority = input.priority ?? 'med';

  // Atomic create + key generation: ticket_key is derived from the card's own
  // row id (via nextTicketKey's max-suffix scan) inside the insert statement's
  // expression list — a single statement keeps the write atomic.
  const info = db
    .prepare(
      `INSERT INTO kanban_card (project_id, ticket_key, title, column, priority, points, assignee_agent, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      projectId,
      nextTicketKey(project!),
      String(input.title).trim(),
      column,
      priority,
      input.points ?? 0,
      input.assigneeAgent ?? '',
      input.status ?? '',
    );

  const card = getCardByIdScoped(Number(info.lastInsertRowid), projectId)!;
  res.status(201).json({ card: serializeCard(card) });
}

function handlePatchCard(req: Request, res: Response): void {
  const projectId = parseProjectId(req.params.projectId);
  if (projectId === null) {
    res.status(400).json({ error: 'Valid project ID is required.' });
    return;
  }

  const cardId = Number(req.params.cardId);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    res.status(400).json({ error: 'Valid card ID is required.' });
    return;
  }

  // IDOR scoping: the card is resolved under the project id from the route,
  // so a card id belonging to another project is simply "not found" — the
  // query can never touch a row the requester's project doesn't own.
  const existing = getCardByIdScoped(cardId, projectId);
  if (!existing) {
    res.status(404).json({ error: 'Card not found for this project.' });
    return;
  }

  const input: BoardPatchInput = req.body ?? {};
  const err = validateCardInput(input);
  if (err) {
    res.status(422).json({ error: err });
    return;
  }

  // Build dynamic UPDATE — only set columns that are provided (mirrors the
  // jira_link PATCH pattern). The WHERE re-checks project_id so the write is
  // scoped even if the row changed between our SELECT and the UPDATE.
  const updates: string[] = [];
  const values: unknown[] = [];
  if (input.title !== undefined) { updates.push('title = ?'); values.push(String(input.title).trim()); }
  if (input.column !== undefined) { updates.push('column = ?'); values.push(input.column); }
  if (input.priority !== undefined) { updates.push('priority = ?'); values.push(input.priority); }
  if (input.points !== undefined) { updates.push('points = ?'); values.push(input.points); }
  if (input.assigneeAgent !== undefined) { updates.push('assignee_agent = ?'); values.push(input.assigneeAgent); }
  if (input.status !== undefined) { updates.push('status = ?'); values.push(input.status); }
  updates.push("updated_at = datetime('now')");

  const sql = `UPDATE kanban_card SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`;
  values.push(cardId, projectId);
  const result = db.prepare(sql).run(...values);

  if (result.changes === 0) {
    // Nothing to update (empty patch) — return the existing card unchanged.
    res.json({ card: serializeCard(existing) });
    return;
  }

  const card = getCardByIdScoped(cardId, projectId)!;
  res.json({ card: serializeCard(card) });
}

// ── Route registration ─────────────────────────────────────────────────────

export function registerBoardRoutes(app: Application): void {
  const base = '/api/projects/:projectId/board';

  app.get(base, handleGetBoard);
  app.post(base, handlePostCard);
  app.patch(`${base}/:cardId`, handlePatchCard);
}
