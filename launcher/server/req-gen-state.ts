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
  // Terminal states carry a human-readable failure reason; 'pending'/'generating'/'done' persist null.
  error: string | null;
  // Sections a previous failed run completed (see agent-invoker.ts) — a
  // retry generates only the missing ones instead of duplicating rows.
  sectionsDone?: string[];
  result?: { storiesGenerated: number; brsGenerated: number; trsGenerated: number };
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

// A pending/generating state whose heartbeat went stale resolves to failed
// (re-triggerable); the resolution is persisted so the write-back happens
// once, same as ba-draft.ts readGenerationState.
function reconcileStale(projectId: number, state: ReqGenState): ReqGenState {
  if (state.state !== 'pending' && state.state !== 'generating') return state;
  const at = state.lastHeartbeatAt ?? state.startedAt;
  if (Date.now() - at <= STALE_MS) return state;
  const failed: ReqGenState = {
    ...state,
    state: 'failed',
    currentSection: null,
    error: 'Generation was interrupted before it finished (server restart). Retry to continue.',
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
