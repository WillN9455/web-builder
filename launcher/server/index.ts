// Idea Hub — local API.
//
// Exposes /api/projects* (and the rest of the v5 endpoints) over a thin
// Express layer backed by SQLite. The Vite dev server proxies /api/* here.

import express from 'express';
import cors from 'cors';
import { migrate, db } from './db.js';

migrate();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// --- Types -----------------------------------------------------------------

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

// --- Routes ----------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// List — powers Screen 1 (and Screen 2 empty state when count === 0).
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

  // Pipeline rollup — counts by status, used for the ring chart + legend.
  const byStatus = db
    .prepare(`SELECT status, COUNT(*) AS n FROM project GROUP BY status`)
    .all() as Array<{ status: string; n: number }>;

  // Total completion ratio — average of tasks_done/tasks_total across all
  // projects; simple and good enough for the dashboard hero number.
  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(tasks_done), 0) AS done,
         COALESCE(SUM(tasks_total), 0) AS total
       FROM project`,
    )
    .get() as { done: number; total: number };

  const completion = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;

  // Next milestone = the highest-priority active project. For the v5 mockup
  // this is "Tenant Maintenance — Build".
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

// Detail — placeholder; Screen 1 doesn't need it but the route exists for
// the upcoming Screens 3–6 work.
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

const PORT = Number(process.env.PORT ?? 5184);
app.listen(PORT, () => {
  console.log(`[api] Idea Hub API listening on http://localhost:${PORT}`);
});
