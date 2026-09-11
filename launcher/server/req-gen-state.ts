// Requirements-generation state — tracks in-flight BA Agent auto-generation
// of story rows + BR/TR rows from approved Project Background artifacts.
// Persists as a JSON file per project so it survives server restarts.
//
// File layout: <launcher>/data/req-gen/<projectId>.json — machine-local state
// next to launcher.db (db.ts), NOT project content; the project folder holds
// only the canonical PRD files the rows splice into.
//
// Stale/restart recovery follows the ba-draft.ts reconciled-read pattern: the
// running job heartbeats `lastHeartbeatAt` every HEARTBEAT_MS, and any read
// of a pending/generating state whose heartbeat is older than STALE_MS
// resolves to failed (persisted once) — an in-flight job can't survive a
// server restart, so the state must never pin a progress bar forever.

import fs from 'node:fs';
import path from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BaGenerationState } from './ba-draft.js';

export type ReqGenState = {
  state: BaGenerationState;
  generated: number;
  total: number;
  // The generation section currently being produced (null when idle/done).
  currentSection: string | null;
  startedAt: number;
  // Heartbeat freshness marker — refreshed on the job's interval. Falls back
  // to startedAt for states persisted before this field existed.
  lastHeartbeatAt?: number;
  // When the active section (currentSection) started — the job stamps it at
  // every section entry AND on the loop's completion write. Bounds a section's
  // run at SECTION_STALL_MS so a wedged run (PR #26 round-4 deadlock shape:
  // fresh heartbeats, the write-lock never settled) fails on read instead of
  // pinning the spinner forever. Absent on pre-round-4 states — those keep
  // the heartbeat-only fallback below, so the two stuck pre-fix runs still
  // recover on a dev-server restart.
  sectionStartedAt?: number;
  // Terminal states carry a human-readable failure reason; 'pending'/'generating'/'done' persist null.
  error: string | null;
  // Sections a previous failed run completed (see agent-invoker.ts) — a
  // retry generates only the missing ones instead of duplicating rows.
  sectionsDone?: string[];
  result?: { storiesGenerated: number; brsGenerated: number; trsGenerated: number };
  // Set by the artifact-status routes when an approved artifact reverts after
  // a completed generation (per-file "Send back to Draft" or reopen-all).
  // Cleared only when a run finishes 'done' — a FAILED run keeps it true so
  // the reconcile stays re-triggerable from the confirmed card.
  artifactsChanged?: boolean;
  // How the current/last run ran: 'generate' (fresh, splice-append) or
  // 'reconcile' (diff against existing origin=generated rows). Absent on
  // pre-reconcile states — treated as 'generate'.
  mode?: 'generate' | 'reconcile';
};

const __dirname = dirname(fileURLToPath(import.meta.url));
// resolve() pins the dir to the launcher checkout, not the server's CWD.
const DIR = resolve(__dirname, '..', 'data', 'req-gen');

export function reqGenFilePath(projectId: number): string {
  // The path itself is never derived from the request — callers resolve the
  // project folder via getProjectRow + resolveProjectFolder (ba-workspace.ts)
  // and pass projectId, which is DB-backed.
  return path.join(DIR, `${projectId}.json`);
}

function writeAtomic(projectId: number, state: ReqGenState): void {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  } catch {
    /* dir already exists or permission-denied — best-effort */
  }
  // Atomic (.tmp + rename) so a crash mid-write never leaves a half-written
  // state file that would parse as null → idle → double-trigger race.
  const filePath = reqGenFilePath(projectId);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

// A pending/generating state resolves to failed (re-triggerable, persisted
// once) when EITHER:
//  - the active section has run past SECTION_STALL_MS — the PR #26 round-4
//    deadlock shape: heartbeats stayed fresh for 3+ hours while the nested
//    PRD write-lock never settled, so heartbeat freshness alone proves nothing
//    about liveness; a section that outlives its whole call budget is wedged.
//  - the heartbeat (lastHeartbeatAt, falling back to startedAt) is older than
//    STALE_MS — the job did not survive a server restart.
// Legacy states without a sectionStartedAt stamp take the heartbeat-only path:
// the two pre-fix stuck runs (projects 10, 12) carry no section stamp, and
// that fallback is exactly what lets a dev-server restart fail them so Retry
// recovers them with the fixed code.
export function reconcileStale(projectId: number, state: ReqGenState): ReqGenState {
  if (state.state !== 'pending' && state.state !== 'generating') return state;
  const heartbeatAge = Date.now() - (state.lastHeartbeatAt ?? state.startedAt);
  let error: string | null = null;
  if (state.state === 'generating' && state.currentSection && state.sectionStartedAt) {
    const sectionAge = Date.now() - state.sectionStartedAt;
    if (sectionAge > SECTION_STALL_MS) {
      error = `Generation of ${state.currentSection} stalled (no progress in ${Math.round(sectionAge / 60_000)} min) — the run was interrupted mid-write. Retry to continue.`;
    } else if (heartbeatAge > STALE_MS) {
      error = 'Generation was interrupted before it finished (server restart). Retry to continue.';
    }
  } else if (heartbeatAge > STALE_MS) {
    error = 'Generation was interrupted before it finished (server restart). Retry to continue.';
  }
  if (!error) return state;
  const failed: ReqGenState = {
    ...state,
    state: 'failed',
    currentSection: null,
    sectionStartedAt: undefined,
    error,
  };
  try {
    writeAtomic(projectId, failed);
  } catch {
    /* best-effort — the read still reports failed */
  }
  return failed;
}

export function readReqGenState(projectId: number): ReqGenState | null {
  const filePath = reqGenFilePath(projectId);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as ReqGenState;
    return reconcileStale(projectId, parsed);
  } catch {
    return null;
  }
}

export function writeReqGenState(projectId: number, state: ReqGenState): void {
  try {
    writeAtomic(projectId, state);
  } catch {
    /* state persistence is best-effort — the job keeps running */
  }
}

// ── Timings (the job's heartbeat lives in agent-invoker.ts) ────────────────
// No heartbeat for this long → the job did not survive a server restart.
const STALE_MS = 120_000;
// One section running longer than this is wedged. Picked ABOVE the model
// fetch's CALL_TIMEOUT_MS (15 min) so a slow-but-alive fetch can never
// false-fail — only a run whose awaited write/lock genuinely never settles
// (the round-4 deadlock outlived its OWN fetch abort by hours) trips it.
const SECTION_STALL_MS = 20 * 60_000;
