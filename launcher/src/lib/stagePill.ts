// Shared status+stage → status-pill mapping for tiles and table rows.
//
// Canonical vocabulary per design/sitemap.md § Global conventions: the pill
// shows the pipeline *stage*, with the status as a modifier — not a lifecycle
// label like "In Progress"/"Planning". Legacy API/DB keys (`PRD`, `Shipped`)
// are migrated for display only; the API contract is unchanged.
import type { ProjectStatus, StageKey } from './api';

const STAGE_LABEL: Record<string, string> = {
  Intake: 'Intake',
  PRD: 'Requirements', // stale-label migration: PRD → Requirements
  Requirements: 'Requirements',
  Design: 'Design',
  Build: 'Build',
  Review: 'Review',
  QA: 'QA',
  Shipped: 'Deployed', // stale-label migration: Shipped → Deployed
  Deployed: 'Deployed',
};

export function stageLabel(stage: StageKey): string {
  return STAGE_LABEL[stage] ?? stage;
}

// Stage order used to decide whether Jira task counts exist yet (the Tasks
// column shows a dash before Build). Includes legacy keys.
const STAGE_ORDER: string[] = [
  'Intake', 'PRD', 'Requirements', 'Design', 'Build', 'Review', 'QA', 'Shipped', 'Deployed',
];

export function isPreBuild(stage: StageKey): boolean {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx >= 0 && idx < STAGE_ORDER.indexOf('Build');
}

export type StagePill = { cls: string; label: string };

export function stagePill(status: ProjectStatus, stage: StageKey): StagePill {
  const stageName = stageLabel(stage);
  switch (status) {
    case 'active':
      return { cls: 'inprog', label: stageName };
    case 'blocked':
      return { cls: 'blocked', label: `${stageName} · Blocked` };
    case 'review':
      // Legacy status with no canonical counterpart — show the stage, amber dot.
      return { cls: 'review', label: stageName };
    case 'queued':
      return { cls: 'todo', label: stageName };
    case 'done':
    case 'shipped':
      return { cls: 'shipped', label: 'Deployed' };
    default:
      // `on_hold` / `cancelled` aren't in the API contract yet (see
      // PLANS/requirements.md §8) — treat anything unknown as active.
      return { cls: 'inprog', label: stageName };
  }
}