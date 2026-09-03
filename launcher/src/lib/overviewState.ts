// Overview-tab derivations — pure functions, no JSX.
//
// One tab, three states (design/sitemap.md § "Overview tab — collapses plan
// Screens 3, 4, 5", decisions locked 1–8): `active` · `blocked` · `done`
// (Deployed). Everything here derives from the real `project` + `stage` rows
// returned by GET /api/projects/:id; nothing invents data (plan §2).
import type { Project, StageKey, StageRow } from './api';
import { stageLabel } from './stagePill';

export type OverviewStateName = 'active' | 'blocked' | 'done';

// blocked status → blocked state; done/shipped status or the `Shipped` stage
// → done; otherwise active (plan §3.3).
export function overviewState(
  project: Pick<Project, 'status' | 'current_stage'>,
): OverviewStateName {
  if (project.status === 'blocked') return 'blocked';
  if (project.status === 'done' || project.status === 'shipped' || project.current_stage === 'Shipped') {
    return 'done';
  }
  return 'active';
}

// The 7 mockup steps in mockup order (mockups.html #s3 stepper). `PRD` folds
// into the Requirements step (legacy stage-key migration, stagePill.ts).
const STEPPER_STEPS: ReadonlyArray<{ label: string; stageKeys: readonly string[] }> = [
  { label: 'Intake', stageKeys: ['Intake'] },
  { label: 'Requirements', stageKeys: ['PRD', 'Requirements'] },
  { label: 'Design', stageKeys: ['Design'] },
  { label: 'Build', stageKeys: ['Build'] },
  { label: 'Review', stageKeys: ['Review'] },
  { label: 'QA', stageKeys: ['QA'] },
  { label: 'Deployed', stageKeys: ['Shipped', 'Deployed'] },
];

export type StepperStep = {
  label: string;
  cls: '' | 'done' | 'active' | 'blocked' | 'shipped';
};

// Derive each stepper chip's class from `current_stage` + `status` + the real
// stage rows. A step whose stage row is `done` renders done; the step holding
// `current_stage` renders active (blocked when the project is blocked); in the
// done state all steps are done with the last one shipped (mockup #s5).
export function stepperSteps(
  project: Pick<Project, 'status' | 'current_stage'>,
  stages: StageRow[],
): StepperStep[] {
  if (overviewState(project) === 'done') {
    return STEPPER_STEPS.map((s, i) => ({
      label: s.label,
      cls: i === STEPPER_STEPS.length - 1 ? ('shipped' as const) : ('done' as const),
    }));
  }
  const doneKeys = new Set(
    stages.filter((r) => r.status === 'done').map((r) => r.stage_key),
  );
  return STEPPER_STEPS.map((step) => {
    if (step.stageKeys.some((k) => doneKeys.has(k))) {
      return { label: step.label, cls: 'done' as const };
    }
    if (step.stageKeys.includes(project.current_stage)) {
      return { label: step.label, cls: project.status === 'blocked' ? ('blocked' as const) : ('active' as const) };
    }
    return { label: step.label, cls: '' as const };
  });
}

// Journey timeline (done state): one ✓ entry per completed stage row, with the
// computed duration. Per-stage summary text is omitted — there is no source
// for it (plan §2); the entry shows the migrated stage label only.
export type JourneyEntry = { label: string; duration: string };

export function journey(stages: StageRow[]): JourneyEntry[] {
  return stages
    .filter((r) => r.status === 'done' && r.completed_at)
    .map((r) => ({
      label: stageLabel(r.stage_key as StageKey),
      duration: formatDuration(r.started_at, r.completed_at),
    }));
}

// "2h" / "1d" style duration label from two SQLite timestamps.
function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '—';
  const start = Date.parse(dbTimestampToIso(startedAt));
  const end = Date.parse(dbTimestampToIso(completedAt));
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—';
  const mins = Math.max(1, Math.round((end - start) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

// SQLite `datetime('now')` → UTC ISO instant (see formatRelative.ts).
function dbTimestampToIso(ts: string): string {
  return ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
}

// Static per-stage callout copy — "who is working on what" while the stage is
// live. TODO(agents): replace with real agent-roster data once the stage-agents
// task lands a source for it (plan §2 seam).
export function stageCallout(stage: StageKey): { agents: string; text: string } {
  switch (stage) {
    case 'Intake':
      return { agents: 'BA Agent', text: 'is interviewing you to capture the idea' };
    case 'PRD':
    case 'Requirements':
      return { agents: 'BA Agent + Requirements Reviewer', text: 'are iterating on user stories & acceptance criteria' };
    case 'Design':
      return { agents: 'Design Agent A + B', text: 'are iterating on screens, states and accessibility' };
    case 'Build':
      return { agents: 'Code Agents 1–3', text: 'are building features in parallel on feature branches' };
    case 'Review':
      return { agents: 'Dev Reviewers', text: 'are reviewing code, security and accessibility' };
    case 'QA':
      return { agents: 'QA Agent', text: 'is running the Playwright suite against the user stories' };
    case 'Shipped':
      return { agents: 'Orchestrator', text: 'deployed the project — journey complete' };
  }
}

// Activity feed avatar mapping (mockups CSS: .tl-item .av-lg.<class>).
// Unknown agents get the neutral chip rather than an invented color.
export type AgentAvatar = { cls: string; initials: string; name: string };

export function agentAvatar(agent: string): AgentAvatar {
  switch (agent.trim().toUpperCase()) {
    case 'BA':
      return { cls: 'ba', initials: 'BA', name: 'BA Agent' };
    case 'DA':
      return { cls: 'da', initials: 'DA', name: 'Design Agent' };
    case 'C1':
    case 'CODE':
      return { cls: 'code', initials: 'C1', name: 'Code Agent 1' };
    case 'C2':
      return { cls: 'code', initials: 'C2', name: 'Code Agent 2' };
    case 'C3':
      return { cls: 'code', initials: 'C3', name: 'Code Agent 3' };
    case 'RV':
      return { cls: 'rev', initials: 'RV', name: 'Requirements Reviewer' };
    case 'QA':
      return { cls: 'qa', initials: 'QA', name: 'QA Agent' };
    case 'ORCH':
      return { cls: 'orch', initials: 'OR', name: 'Orchestrator' };
    default:
      return {
        cls: 'neutral',
        initials: agent.trim().slice(0, 2).toUpperCase() || '?',
        name: agent.trim() || 'Agent',
      };
  }
}

// Artifact kind → short mono tag for the .ftag chip (mockup shows MD / Spec /
// Tokens / YAML / SQL). The only real kind today is `markdown` (idea.md).
export function artifactTag(kind: string): string {
  return kind === 'markdown' ? 'MD' : kind.toUpperCase();
}