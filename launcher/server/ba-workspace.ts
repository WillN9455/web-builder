// BA Workspace — the Project Background tab's API (sitemap screens 12–14 +
// State D). Reads/writes the 17 PRD artifacts in the project's on-disk PRD/
// folder and tracks their per-file review state (draft → in_review →
// returned → approved) in ba_artifacts_status. The context confirmation
// (State D's one-shot gate unlock) lives in ba_context.
//
// Security notes (framework shared/skills/security.md):
// - Every write path is validated against the BA_ARTIFACTS allowlist — the
//   filename can never traverse out of the project's PRD/ folder (R1).
// - The project is resolved by id-or-slug from the DB; folder_path comes from
//   the row, never from the request.
// - No destructive operations: no file deletes, statuses only move forward
//   through the state machine.

import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db } from './db.js';
import { readGenerationState, retryBaGeneration, type BaGeneration } from './ba-draft.js';
import { atomicWritePrd } from './prd-fs.js';

// ── The 17 artifacts across 5 bands (sitemap § Project Background tab) ────
// The sitemap list is canonical — the s12 mockup tree omits personas.md, and
// that omission is a known mockup drift (plan §0), not a target.

export type BaBand = {
  key: string;
  label: string;
  files: readonly string[];
};

export const BA_BANDS: readonly BaBand[] = [
  { key: 'core-prd', label: 'Core PRD', files: ['prd.md', 'user-journeys.md', 'personas.md'] },
  {
    key: 'scope-rules',
    label: 'Scope & rules',
    files: [
      'glossary.md',
      'stakeholder-map.md',
      'business-rules.md',
      'assumptions.md',
      'open-questions.md',
    ],
  },
  {
    key: 'data-access',
    label: 'Data & access',
    files: ['data-model.md', 'data-flow.md', 'rbac-matrix.md', 'nfr-catalog.md'],
  },
  {
    key: 'planning-risk',
    label: 'Planning & risk',
    files: ['phasing-plan.md', 'traffic-profile.md', 'cost-model.md', 'risks.md'],
  },
  { key: 'sa-handoff', label: 'SA handoff', files: ['tech-decision-brief.md'] },
];

// Flat allowlist (the path-traversal guard's load-bearing set).
export const BA_ARTIFACTS: readonly string[] = BA_BANDS.flatMap((b) => b.files);

// Display titles — the State D list's labels (background.html #sD).
const BA_TITLES: Readonly<Record<string, string>> = {
  'prd.md': 'Main PRD',
  'user-journeys.md': 'User journeys',
  'personas.md': 'Personas',
  'glossary.md': 'Glossary',
  'stakeholder-map.md': 'Stakeholder map',
  'business-rules.md': 'Business rules',
  'assumptions.md': 'Assumptions',
  'open-questions.md': 'Open questions log',
  'data-model.md': 'Data model',
  'data-flow.md': 'Data flow',
  'rbac-matrix.md': 'RBAC matrix',
  'nfr-catalog.md': 'NFR catalog',
  'phasing-plan.md': 'Phasing plan',
  'traffic-profile.md': 'Traffic profile',
  'cost-model.md': 'Cost model',
  'risks.md': 'Risks',
  'tech-decision-brief.md': 'Tech decision brief',
};

export function baTitle(filename: string): string {
  return BA_TITLES[filename] ?? filename;
}

// ── Per-file review state machine ──────────────────────────────────────────
// Draft ──Send──▶ In Review ──┬─Return──▶ Returned ──(BA saves)──▶ Draft
//                             └─Approve─▶ Approved (terminal)
// Sitemap locked decision 6: the terminal state is `approved` ("Completed"
// renamed). The Returned → Draft edge is implicit: saving a returned file
// (PUT) puts it back to draft — the BA edited it after the return.

export type BaStatus = 'draft' | 'in_review' | 'returned' | 'approved';

export const BA_TRANSITIONS: Readonly<Record<BaStatus, readonly BaStatus[]>> = {
  draft: ['in_review'],
  in_review: ['returned', 'approved'],
  returned: ['in_review'],
  approved: [],
};

export function baStatusLabel(status: BaStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'in_review':
      return 'In Review';
    case 'returned':
      return 'Returned';
    case 'approved':
      return 'Approved';
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

type ProjectRow = { id: number; name: string; slug: string; folder_path: string };

export type BaFile = {
  filename: string;
  band: string;
  title: string;
  status: BaStatus;
};

export type BaFilesResponse = {
  files: BaFile[];
  // Band keys + labels in sitemap order — the client groups the tree by this
  // (one source for the 5-band structure, no client-side copy). total = the
  // band's artifact count (the generation panel's band progress).
  bands: { key: string; label: string; total: number }[];
  counts: { draft: number; in_review: number; returned: number; approved: number; total: number };
  // State D gate data. contextReady = all 17 allowlisted artifacts exist on
  // disk and are approved. contextConfirmed = the one-shot has fired.
  // contextChangedSinceConfirm = confirmed but some file is no longer approved
  // (locked decision 7 — keep unlocked, warn only).
  contextReady: boolean;
  contextConfirmed: boolean;
  contextChangedSinceConfirm: boolean;
  // BA auto-draft generation state (plan addendum AC-17/AC-18) — null when
  // the project never had a generation run (the screen's empty state and its
  // manual-trigger button own that case). The screen polls this one endpoint.
  generation: BaGeneration | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

// Shared with the Requirements routes (server/requirements.ts) — the same
// id-or-slug resolution and PRD/ containment, one implementation (plan §3.2).
export function getProjectRow(idOrSlug: string): ProjectRow | undefined {
  return db
    .prepare('SELECT id, name, slug, folder_path FROM project WHERE id = ? OR slug = ?')
    .get(idOrSlug, idOrSlug) as ProjectRow | undefined;
}

// folder_path may be written with a leading `~/` (the seed rows and the
// folder-picker both use that form). Expand it against the OS home dir.
export function resolveProjectFolder(row: ProjectRow): string {
  const p = row.folder_path;
  const expanded = p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p;
  return path.resolve(expanded);
}

// The project's PRD/ dir — the only folder these routes may ever touch.
export function prdDir(row: ProjectRow): string {
  return path.join(resolveProjectFolder(row), 'PRD');
}

function readStatuses(projectId: number): Map<string, BaStatus> {
  const rows = db
    .prepare('SELECT filename, status FROM ba_artifacts_status WHERE project_id = ?')
    .all(projectId) as { filename: string; status: string }[];
  const map = new Map<string, BaStatus>();
  for (const r of rows) {
    if (isBaStatus(r.status)) map.set(r.filename, r.status);
  }
  return map;
}

function isBaStatus(v: string): v is BaStatus {
  return v === 'draft' || v === 'in_review' || v === 'returned' || v === 'approved';
}

// Files that exist on disk, in band order. Status defaults to `draft` for
// files with no row (AC-10).
function listFiles(row: ProjectRow): BaFile[] {
  const dir = prdDir(row);
  const statuses = readStatuses(row.id);
  const files: BaFile[] = [];
  for (const band of BA_BANDS) {
    for (const filename of band.files) {
      if (!fs.existsSync(path.join(dir, filename))) continue;
      files.push({
        filename,
        band: band.key,
        title: baTitle(filename),
        status: statuses.get(filename) ?? 'draft',
      });
    }
  }
  return files;
}

function contextRow(projectId: number): { confirmed: number; confirmed_at: string | null } | undefined {
  return db
    .prepare('SELECT confirmed, confirmed_at FROM ba_context WHERE project_id = ?')
    .get(projectId) as { confirmed: number; confirmed_at: string | null } | undefined;
}

function logActivity(projectId: number, agent: 'BA' | 'SA', message: string, kind: string): void {
  db.prepare(
    `INSERT INTO activity (project_id, agent, message, kind) VALUES (?, ?, ?, ?)`,
  ).run(projectId, agent, message, kind);
}

// Validate a `:filename` route param against the allowlist — the only gate
// between the request and the filesystem (R1). An exact-match set lookup
// rejects `../`, absolute paths, and any name outside the 17 artifacts.
function allowedFilename(raw: string): string | null {
  return BA_ARTIFACTS.includes(raw) ? raw : null;
}

// ── Open questions (banner data; parsed from open-questions.md) ────────────
// The banner shows the count of `Blocker-for: PRD-approval` items. The parser
// is deliberately loose: it counts occurrences of the blocker marker (case-
// insensitive, with or without the `_italic_` wrapper the BA drafts use) and
// falls back to 0 when the file is missing or unreadable — the banner simply
// stays hidden (build plan risk #2's fallback).
function countPrdApprovalBlockers(prdPath: string): number {
  try {
    const body = fs.readFileSync(path.join(prdPath, 'open-questions.md'), 'utf-8');
    const matches = body.match(/blocker-for:\s*prd-approval/gi);
    return matches?.length ?? 0;
  } catch {
    return 0;
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────

export function registerBaWorkspaceRoutes(app: express.Express): void {
  // GET /files — tree + per-file status + State D gate data.
  app.get('/api/projects/:id/ba-workspace/files', (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const files = listFiles(row);
    const counts = { draft: 0, in_review: 0, returned: 0, approved: 0, total: files.length };
    for (const f of files) counts[f.status]++;

    const ctx = contextRow(row.id);
    const confirmed = !!ctx?.confirmed;
    // Ready only when every allowlisted artifact exists on disk and is
    // approved — an 8-file mid-PRD project can never open the gate.
    const dir = prdDir(row);
    const allSeventeenExist = BA_ARTIFACTS.every((f) => fs.existsSync(path.join(dir, f)));
    const contextReady = allSeventeenExist && files.every((f) => f.status === 'approved');

    res.json({
      files,
      // `total` = the band's artifact count — the generation panel's band
      // progress derives from it (no client-side copy of the band sizes).
      bands: BA_BANDS.map((b) => ({ key: b.key, label: b.label, total: b.files.length })),
      counts,
      contextReady,
      contextConfirmed: confirmed,
      contextChangedSinceConfirm: confirmed && !contextReady,
      generation: readGenerationState(row.id),
    } satisfies BaFilesResponse);
  });

  // GET /files/:filename — markdown body.
  app.get('/api/projects/:id/ba-workspace/files/:filename', (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const filename = allowedFilename(req.params.filename);
    if (!filename) {
      res.status(400).json({ error: 'Unknown artifact' });
      return;
    }
    const filePath = path.join(prdDir(row), filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Artifact not on disk' });
      return;
    }
    try {
      res.json({ filename, title: baTitle(filename), content: fs.readFileSync(filePath, 'utf-8') });
    } catch {
      res.status(500).json({ error: 'Could not read artifact' });
    }
  });

  // PUT /files/:filename — save body (write-back to the on-disk PRD/).
  // 409 while the file is In Review (SA) — the body is locked during review.
  // Saving a Returned file implicitly moves it back to Draft (the BA edited
  // it after the return — sitemap state machine's Returned ──▶ Draft edge).
  app.put('/api/projects/:id/ba-workspace/files/:filename', (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const filename = allowedFilename(req.params.filename);
    if (!filename) {
      res.status(400).json({ error: 'Unknown artifact' });
      return;
    }
    const content = typeof req.body?.content === 'string' ? req.body.content : null;
    if (content === null) {
      res.status(400).json({ error: 'Missing content' });
      return;
    }
    const dir = prdDir(row);
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Artifact not on disk' });
      return;
    }
    const status = readStatuses(row.id).get(filename) ?? 'draft';
    if (status === 'in_review') {
      res.status(409).json({ error: 'File is In Review (SA) — return it to the BA before editing' });
      return;
    }
    try {
      atomicWritePrd(filePath, content);
    } catch {
      res.status(500).json({ error: 'Could not write artifact' });
      return;
    }
    if (status === 'returned') {
      db.prepare(
        `UPDATE ba_artifacts_status SET status = 'draft', updated_at = datetime('now')
         WHERE project_id = ? AND filename = ?`,
      ).run(row.id, filename);
    } else {
      db.prepare(
        `INSERT INTO ba_artifacts_status (project_id, filename, status, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(project_id, filename) DO UPDATE SET updated_at = datetime('now')`,
      ).run(row.id, filename, status);
    }
    logActivity(row.id, 'BA', `Saved edits to ${filename}`, 'edit');
    res.json({ ok: true, filename, status: status === 'returned' ? 'draft' : status });
  });

  // POST /files/:filename/transition — one step of the state machine.
  app.post('/api/projects/:id/ba-workspace/files/:filename/transition', (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const filename = allowedFilename(req.params.filename);
    if (!filename) {
      res.status(400).json({ error: 'Unknown artifact' });
      return;
    }
    const to = req.body?.to;
    if (!isBaStatus(to)) {
      res.status(400).json({ error: 'Invalid target status' });
      return;
    }
    const current = readStatuses(row.id).get(filename) ?? 'draft';
    if (!BA_TRANSITIONS[current].includes(to)) {
      res.status(409).json({
        error: `Cannot move ${filename} from ${baStatusLabel(current)} to ${baStatusLabel(to)}`,
      });
      return;
    }
    db.prepare(
      `INSERT INTO ba_artifacts_status (project_id, filename, status, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(project_id, filename) DO UPDATE SET status = excluded.status,
         updated_at = datetime('now')`,
    ).run(row.id, filename, to);

    const who: 'BA' | 'SA' = to === 'in_review' ? 'BA' : 'SA';
    const verb =
      to === 'in_review'
        ? 'Sent for SA review'
        : to === 'returned'
          ? 'Returned to BA'
          : 'Approved';
    logActivity(row.id, who, `${verb}: ${filename}`, 'milestone');
    res.json({ ok: true, filename, status: to });
  });

  // GET /files/:filename/comments — review thread.
  app.get('/api/projects/:id/ba-workspace/files/:filename/comments', (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const filename = allowedFilename(req.params.filename);
    if (!filename) {
      res.status(400).json({ error: 'Unknown artifact' });
      return;
    }
    const comments = db
      .prepare(
        `SELECT id, author, body, created_at FROM ba_file_comment
         WHERE project_id = ? AND filename = ? ORDER BY id`,
      )
      .all(row.id, filename) as { id: number; author: string; body: string; created_at: string }[];
    res.json({ comments });
  });

  // POST /files/:filename/comments — append a review comment.
  app.post('/api/projects/:id/ba-workspace/files/:filename/comments', (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const filename = allowedFilename(req.params.filename);
    if (!filename) {
      res.status(400).json({ error: 'Unknown artifact' });
      return;
    }
    const author = req.body?.author;
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if ((author !== 'SA' && author !== 'BA') || !body) {
      res.status(400).json({ error: 'Missing or invalid author/body' });
      return;
    }
    if (body.length > 4000) {
      res.status(400).json({ error: 'Comment too long' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO ba_file_comment (project_id, filename, author, body) VALUES (?, ?, ?, ?)`,
      )
      .run(row.id, filename, author, body);
    logActivity(row.id, author, `Commented on ${filename}`, 'comment');
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  // GET /open-questions — butter-banner data (parsed from open-questions.md).
  app.get('/api/projects/:id/ba-workspace/open-questions', (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ blockerCount: countPrdApprovalBlockers(prdDir(row)) });
  });

  // POST /generation/retry — re-run BA auto-drafting, only missing files
  // (skip-if-exists). Doubles as the manual trigger for pre-feature projects
  // that finished intake before this feature shipped (AC-18). Refused while a
  // run is already in flight (409) — the reconciled read decides.
  app.post('/api/projects/:id/ba-workspace/generation/retry', (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const result = retryBaGeneration(row.id);
    if (!result.ok) {
      res.status(409).json({ error: result.error ?? 'Generation already running' });
      return;
    }
    res.json({ ok: true });
  });

  // POST /background/confirm-context — State D's one-shot gate. Only fires
  // when all 17 allowlisted artifacts exist and are approved; a re-POST after
  // confirmation is an idempotent no-op. The unlock never re-arms: once
  // confirmed, un-approving a file only flips contextChangedSinceConfirm.
  app.post('/api/projects/:id/background/confirm-context', (req, res) => {
    const row = getProjectRow(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const ctx = contextRow(row.id);
    if (ctx?.confirmed) {
      res.json({ ok: true, contextConfirmed: true, alreadyConfirmed: true });
      return;
    }
    // Re-check readiness server-side — the client's State D card is not the
    // authority (the flag is what locks the four downstream tabs).
    const dir = prdDir(row);
    if (!BA_ARTIFACTS.every((f) => fs.existsSync(path.join(dir, f)))) {
      res.status(409).json({ error: 'Not all 17 artifacts exist yet' });
      return;
    }
    const statuses = readStatuses(row.id);
    if (!BA_ARTIFACTS.every((f) => (statuses.get(f) ?? 'draft') === 'approved')) {
      res.status(409).json({ error: 'Not all 17 artifacts are Approved' });
      return;
    }
    db.prepare(
      `INSERT INTO ba_context (project_id, confirmed, confirmed_at)
       VALUES (?, 1, datetime('now'))
       ON CONFLICT(project_id) DO UPDATE SET confirmed = 1,
         confirmed_at = datetime('now')`,
    ).run(row.id);
    logActivity(row.id, 'BA', 'Confirmed project context — Sprint, Design, Build, QA unlocked', 'milestone');
    res.json({ ok: true, contextConfirmed: true, alreadyConfirmed: false });
  });
}

// Artifact count for the sidebar badge — consumed by GET /api/projects/:id.
// null when the project's folder/PRD dir can't be read (chip stays omitted).
export function countBaArtifacts(row: ProjectRow): number | null {
  try {
    const dir = prdDir(row);
    return BA_ARTIFACTS.filter((f) => fs.existsSync(path.join(dir, f))).length;
  } catch {
    return null;
  }
}