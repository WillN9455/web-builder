// Seeds the dev DB with sample projects that match the Screen 1 mockup.
//
// Idempotent: if there are already projects, this is a no-op. Run
// `npm run db:reset` to wipe first.

import { db, migrate } from '../server/db.js';

migrate();

const existing = db.prepare('SELECT COUNT(*) AS n FROM project').get() as { n: number };
if (existing.n > 0) {
  console.log(`[seed] ${existing.n} projects already present — skipping.`);
  process.exit(0);
}

const insertProject = db.prepare(`
  INSERT INTO project (name, slug, one_liner, category, folder_path,
                       current_stage, status, priority, tasks_total, tasks_done,
                       chats_count, tile_color, updated_relative)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertStage = db.prepare(`
  INSERT INTO stage (project_id, stage_key, status, started_at, completed_at)
  VALUES (?, ?, ?, ?, ?)
`);

// 6 projects matching the "Active now" tiles on Screen 1.
const projects = [
  {
    name: 'Tenant Maintenance Portal',
    slug: 'tenant-maintenance',
    one_liner: 'Maintenance request app for property managers',
    category: 'Maintenance',
    folder_path: '~/Documents/tenant-maintenance',
    current_stage: 'Build',
    status: 'active',
    priority: 'high',
    tasks_total: 21, tasks_done: 12, chats_count: 3,
    tile_color: 'peach', updated_relative: '2h ago',
  },
  {
    name: 'Yoga Studio Booking',
    slug: 'yoga-studio-booking',
    one_liner: 'Class scheduling + membership for a single studio',
    category: 'Booking',
    folder_path: '~/Documents/yoga-studio',
    current_stage: 'Design',
    status: 'review',
    priority: 'medium',
    tasks_total: 12, tasks_done: 7, chats_count: 2,
    tile_color: 'sky', updated_relative: '1d ago',
  },
  {
    name: 'Internal Timesheet',
    slug: 'internal-timesheet',
    one_liner: 'Track billable hours across the small studio team',
    category: 'Operations',
    folder_path: '~/Documents/timesheet',
    current_stage: 'Intake',
    status: 'queued',
    priority: 'low',
    tasks_total: 8, tasks_done: 2, chats_count: 1,
    tile_color: 'mint', updated_relative: '4d ago',
  },
  {
    name: 'Field Service Tracker',
    slug: 'field-service-tracker',
    one_liner: 'Mobile-friendly job tracking for one engineer',
    category: 'Tracking',
    folder_path: '~/Documents/field-service',
    current_stage: 'PRD',
    status: 'blocked',
    priority: 'high',
    tasks_total: 32, tasks_done: 4, chats_count: 1,
    tile_color: 'lavender', updated_relative: '3d ago',
  },
  {
    name: 'Personal Bookmarks',
    slug: 'personal-bookmarks',
    one_liner: 'A clean, fast personal link library',
    category: 'Personal',
    folder_path: '~/Documents/bookmarks',
    current_stage: 'Shipped',
    status: 'shipped',
    priority: 'low',
    tasks_total: 11, tasks_done: 11, chats_count: 0,
    tile_color: 'butter', updated_relative: '1w ago',
  },
  {
    name: 'Neighborhood Library',
    slug: 'neighborhood-library',
    one_liner: 'A lending platform for tools, books and board games',
    category: 'Community',
    folder_path: '~/Documents/nbl',
    current_stage: 'PRD',
    status: 'active',
    priority: 'medium',
    tasks_total: 15, tasks_done: 5, chats_count: 2,
    tile_color: 'blush', updated_relative: '6h ago',
  },
];

const STAGES: Array<['Intake'|'PRD'|'Design'|'Build'|'Review'|'QA'|'Shipped', 'queued'|'active'|'review'|'blocked'|'done'|'shipped']> = [
  ['Intake', 'done'], ['PRD', 'done'], ['Design', 'done'], ['Build', 'active'],
  ['Review', 'queued'], ['QA', 'queued'], ['Shipped', 'queued'],
];

const seed = db.transaction(() => {
  for (const p of projects) {
    const info = insertProject.run(
      p.name, p.slug, p.one_liner, p.category, p.folder_path,
      p.current_stage, p.status, p.priority, p.tasks_total, p.tasks_done,
      p.chats_count, p.tile_color, p.updated_relative,
    );
    const pid = info.lastInsertRowid as number;
    // Initialise the 7-stage timeline — current_stage onward is queued/active,
    // everything before it is done. Matches the mockup's pipeline stepper.
    const idx = STAGES.findIndex(([k]) => k === p.current_stage);
    STAGES.forEach(([k, _default], i) => {
      let status: 'queued'|'active'|'review'|'blocked'|'done'|'shipped' = 'queued';
      if (i < idx) status = 'done';
      else if (i === idx) status = p.status === 'shipped' ? 'shipped' : (p.status === 'blocked' ? 'blocked' : p.status === 'review' ? 'review' : 'active');
      const completed_at = status === 'done' || status === 'shipped' ? new Date().toISOString() : null;
      insertStage.run(pid, k, status, new Date().toISOString(), completed_at);
    });
  }
});

seed();
console.log(`[seed] Inserted ${projects.length} projects.`);
