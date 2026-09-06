// Requirements-generation state — tracks in-flight BA Agent auto-generation
// of user-journeys.md + prd.md §8/§9 from approved Project Background
// artifacts. Persists as a JSON file per project so it survives server restarts,
// and reads/writes through `ba-context.ts`'s db accessor for cross-checks.
//
// File layout: <project-folder>/.req-gen/<projectId>.json

import fs from 'node:fs';
import path from 'node:path';
import type { BaGenerationState } from './ba-draft.js';

export type ReqGenState = {
  state: BaGenerationState;
  generated: number;
  total: number;
  currentFile: string | null;
  startedAt: number;
  result?: { storiesGenerated: number; brsGenerated: number; trsGenerated: number };
};

const DIR = '.req-gen';

export function reqGenFilePath(projectId: number): string {
  // The path itself is never derived from the request — callers resolve the
  // project folder via getProjectRow + resolveProjectFolder (ba-workspace.ts)
  // and pass projectId, which is DB-backed.
  return path.join(DIR, `${projectId}.json`);
}

export function readReqGenState(projectId: number): ReqGenState | null {
  const filePath = reqGenFilePath(projectId);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as ReqGenState;
  } catch {
    return null;
  }
}

export function writeReqGenState(projectId: number, state: ReqGenState): void {
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  } catch {
    /* dir already exists or permission-denied — best-effort */
  }
  const filePath = reqGenFilePath(projectId);
  fs.writeFileSync(filePath, JSON.stringify(state), 'utf-8');
}

export function setReqGenField<K extends keyof ReqGenState>(
  projectId: number,
  key: K,
  value: ReqGenState[K],
): void {
  const existing = readReqGenState(projectId);
  writeReqGenState(projectId, { ...existing, [key]: value });
}
