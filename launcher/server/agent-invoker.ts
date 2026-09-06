// Requirements-generation invocation — triggers the BA Agent to auto-generate
// user-journeys.md + prd.md §8/§9 from approved Project Background artifacts.
// Follows the same async job pattern as ba-draft.ts (Ollama-driven, sequential,
// skip-if-exists, per-file failure tolerant).

import fs from 'node:fs';
import path from 'node:path';
import { readReqGenState, writeReqGenState } from './req-gen-state.js';
import { getProjectRow, resolveProjectFolder, BA_ARTIFACTS, BaStatus } from './ba-workspace.js';
import { db } from './db.js';
import { MODEL, OLLAMA } from './intake.js';
import { atomicWritePrd } from './prd-fs.js';

// ── The artifacts the BA Agent generates for requirements ─────────────────

const REQ_ARTIFACTS = ['user-journeys.md', 'prd.md'] as const;

type ReqArtifact = (typeof REQ_ARTIFACTS)[number];

// ── Timings ────────────────────────────────────────────────────────────────

const HEARTBEAT_MS = 30_000;
const STALE_MS = 120_000;
const CALL_TIMEOUT_MS = 15 * 60_000;
const MAX_CONTEXT_CHARS = 48_000; // idea.md + all approved artifact bodies

// ── In-process guard: one req-gen run per project at a time. ───────────────

const running = new Set<number>();

// ── Public API ──────────────────────────────────────────────────────────────

export type TriggerResult = { ok: true; generationId: string } | { ok: false; error: string };

/**
 * Trigger requirements generation for a project. Idempotent within one
 * heartbeat — returns alreadyRunning when a fresh invocation races with an
 * in-flight run that has no persisted terminal state yet.
 */
export function triggerRequirementsGeneration(projectId: number): TriggerResult {
  if (running.has(projectId)) return { ok: false, error: 'Already running' };

  const row = getProjectRow(String(projectId));
  if (!row) return { ok: false, error: 'Project not found' };

  // Check all 17 are approved
  const statuses = readStatuses(row.id);
  for (const artifact of BA_ARTIFACTS) {
    if ((statuses.get(artifact) ?? 'draft') !== 'approved') {
      return { ok: false, error: `Artifact ${artifact} is not Approved` };
    }
  }

  // Check context is confirmed
  const ctx = db
    .prepare('SELECT confirmed FROM ba_context WHERE project_id = ?')
    .get(projectId) as { confirmed: number } | undefined;
  if (!ctx || !ctx.confirmed) {
    return { ok: false, error: 'Project context not confirmed yet' };
  }

  // Re-check on disk (the DB status can lag the file system after manual edits)
  const prdDir = path.join(resolveProjectFolder(row), 'PRD');
  for (const artifact of BA_ARTIFACTS) {
    if (!fs.existsSync(path.join(prdDir, artifact))) {
      return { ok: false, error: `Artifact ${artifact} is missing from disk` };
    }
    // Read status row — skip-if-exists check happens during the job.
  }

  const existing = readReqGenState(projectId);
  if (existing && (existing.state === 'pending' || existing.state === 'generating')) {
    return { ok: false, error: 'Already running' };
  }

  // Init state
  writeReqGenState(projectId, {
    state: 'pending',
    generated: 0,
    total: REQ_ARTIFACTS.length,
    currentFile: null,
    startedAt: Date.now(),
  });

  running.add(projectId);
  void runRequirementsJob(projectId)
    .catch((err) => {
      console.error('[agent-invoker] req-gen job crashed:', err);
      try {
        writeReqGenState(projectId, {
          state: 'failed',
          generated: existing?.generated ?? 0,
          total: REQ_ARTIFACTS.length,
          currentFile: null,
          startedAt: existing?.startedAt ?? Date.now(),
          error: 'Generation crashed — retry to continue.',
        });
      } catch {
        /* unreachable */
      }
    })
    .finally(() => running.delete(projectId));

  return { ok: true, generationId: `${projectId}-${Date.now()}` };
}

// ── Context assembly (approved artifacts as prompt context) ─────────────────

function buildContext(row: ReturnType<typeof getProjectRow>): string | null {
  try {
    const lines: string[] = [];
    const prdDir = path.join(resolveProjectFolder(row), 'PRD');

    // Read idea.md first — it is the primary seed.
    const ideaPath = path.join(resolveProjectFolder(row), 'idea.md');
    if (fs.existsSync(ideaPath)) {
      lines.push('## Project Idea (seed)');
      lines.push(fs.readFileSync(ideaPath, 'utf-8').trim());
      lines.push('');
    }

    // Read all 17 approved artifacts from disk for the prompt context.
    for (const artifact of BA_ARTIFACTS) {
      const filePath = path.join(prdDir, artifact);
      if (!fs.existsSync(filePath)) continue;
      lines.push(`## ${artifact}`);
      lines.push(fs.readFileSync(filePath, 'utf-8').trim());
      lines.push('');
    }

    const full = lines.join('\n').slice(0, MAX_CONTEXT_CHARS);
    return full || null;
  } catch (err) {
    console.error('[agent-invoker] failed to build context:', err);
    return null;
  }
}

// ── The async generation job ───────────────────────────────────────────────

async function runRequirementsJob(projectId: number): Promise<void> {
  const row = getProjectRow(String(projectId));
  if (!row) {
    writeReqGenState(projectId, {
      state: 'failed',
      generated: 0,
      total: REQ_ARTIFACTS.length,
      currentFile: null,
      startedAt: Date.now(),
      error: 'Project not found for generation',
    });
    return;
  }

  const prdDir = path.join(resolveProjectFolder(row), 'PRD');

  // Ensure PRD dir exists.
  try {
    fs.mkdirSync(prdDir, { recursive: true });
  } catch {
    writeReqGenState(projectId, {
      state: 'failed',
      generated: 0,
      total: REQ_ARTIFACTS.length,
      currentFile: null,
      startedAt: Date.now(),
      error: 'Could not create PRD folder for generation',
    });
    return;
  }

  const existing = readReqGenState(projectId);
  if (!existing) {
    writeReqGenState(projectId, {
      state: 'failed',
      generated: 0,
      total: REQ_ARTIFACTS.length,
      currentFile: null,
      startedAt: Date.now(),
      error: 'No generation state found — this should not happen.',
    });
    return;
  }

  const context = buildContext(row);
  if (!context) {
    writeReqGenState(projectId, { ...existing, state: 'failed' as const, error: 'Could not assemble prompt context' });
    return;
  }

  // Heartbeat.
  const heartbeat = setInterval(() => {
    try {
      const s = readReqGenState(projectId);
      if (s) writeReqGenState(projectId, { ...s, startedAt: existing.startedAt });
    } catch { /* heartbeat is best-effort */ }
  }, HEARTBEAT_MS);

  let lastError: string | null = null;

  try {
    // Transition to generating
    writeReqGenState(projectId, { ...existing, state: 'generating' as const });

    for (const filename of REQ_ARTIFACTS) {
      const filePath = path.join(prdDir, filename);

      // Skip-if-exists.
      if (fs.existsSync(filePath)) continue;

      writeReqGenState(projectId, { ...existing, state: 'generating' as const, currentFile: filename });

      try {
        const content = await callOllamaRequirementsDraft(filename, context);
        // Re-check at write moment.
        if (fs.existsSync(filePath)) continue;
        if (!content.trim()) {
          throw new Error('The model returned an empty draft');
        }
        await atomicWritePrd(filePath, content);
      } catch (err) {
        lastError = `Could not generate ${filename}: ${err instanceof Error ? err.message : String(err)}`;
      }

      const generated = countGenerated(projectId);
      writeReqGenState(projectId, { ...existing, state: 'generating' as const, generated });
    }

    const finalGenerated = countGenerated(projectId);

    if (finalGenerated === REQ_ARTIFACTS.length) {
      writeReqGenState(projectId, {
        ...existing,
        state: 'done' as const,
        currentFile: null,
        generated: finalGenerated,
        error: null,
        result: estimateCounts(prdDir),
      });
    } else {
      writeReqGenState(projectId, {
        ...existing,
        state: 'failed' as const,
        currentFile: null,
        generated: finalGenerated,
        error: lastError ?? 'Generation finished with missing documents — retry fills the gaps.',
      });
    }
  } finally {
    clearInterval(heartbeat);
  }
}

function countGenerated(projectId: number): number {
  const row = getProjectRow(String(projectId));
  if (!row) return 0;
  const prdDir = path.join(resolveProjectFolder(row), 'PRD');
  return REQ_ARTIFACTS.filter((f) => fs.existsSync(path.join(prdDir, f))).length;
}

function estimateCounts(prdDir: string): { storiesGenerated: number; brsGenerated: number; trsGenerated: number } | undefined {
  try {
    const ujContent = fs.readFileSync(path.join(prdDir, 'user-journeys.md'), 'utf-8');
    const prdContent = fs.readFileSync(path.join(prdDir, 'prd.md'), 'utf-8');
    // Quick heuristic counts — the UI shows total artifacts only.
    return {
      storiesGenerated: (ujContent.match(/^US-\d+/gm) || []).length,
      brsGenerated: (prdContent.match(/BR-\d+/g) || []).length,
      trsGenerated: (prdContent.match(/TR-\d+/g) || []).length,
    };
  } catch {
    return undefined;
  }
}

// ── Prompt + Ollama call ────────────────────────────────────────────────────

function requirementsPrompt(filename: string, context: string): { system: string; user: string } {
  const system =
    'You are the Business Analyst agent of the Idea-to-Web-Solution framework. Write project documents as clean GitHub-flavored markdown. Output the document body only — no preamble, no wrapping code fences, no commentary.';

  let content = '';
  if (filename === 'user-journeys.md') {
    content = `Write **user-journeys.md** for the project described below.\n\n` +
      `Each journey should be:\n1. Numbered (e.g., US-01, US-02, …)\n2. Structured as: title → trigger → step-by-step actions → outcome\n3. Include at least one happy path and the main failure path.\n4. Use the As-A-I-Want-To-So-That user-story format as a summary line for each journey.\n\nGround every detail in the project context provided — never invent features not described.`;
  } else {
    content = `Write **prd.md §8 (Business Requirements)** and **§9 (Technical Requirements)** for the project described below.\n\n` +
      `§8 format:\n- BR-NNN: <requirement text>\n- Group by functional area.\n- Every requirement should be testable.\n\n§9 format:\n- TR-NNN: <technical constraint or specification>;\n- Group by category (performance, security, data, etc.).\n\nCross-reference stories to requirements via: <!-- BR-NNN: story=US-NN -->`;
  }

  return {
    system,
    user: `## Context (all approved artifacts)\n\n${context}\n\n## Task\n\n${content}`,
  };
}

async function callOllamaRequirementsDraft(
  filename: string,
  context: string,
): Promise<string> {
  const prompt = requirementsPrompt(filename, context);

  const res = await fetch(OLLAMA + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });

  if (!res.ok || !res.body) {
    throw new Error(
      res.status === 404
        ? `Model '${MODEL}' not found — pull it with: ollama pull ${MODEL}`
        : `Ollama error (HTTP ${res.status})`,
    );
  }

  let full = '';
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let evt: { message?: { content?: string }; error?: string };
      try {
        evt = JSON.parse(line) as typeof evt;
      } catch {
        continue;
      }
      if (evt.error) throw new Error(evt.error);
      if (evt.message?.content) full += evt.message.content;
    }
  }
  return full;
}

// ── Helpers exported for testing / introspection ────────────────────────────

/** Read file statuses from ba_artifacts_status DB table. */
function readStatuses(projectId: number): Map<string, BaStatus> {
  const rows = db
    .prepare('SELECT filename, status FROM ba_artifacts_status WHERE project_id = ?')
    .all(projectId) as { filename: string; status: string }[];
  const map = new Map<string, BaStatus>();
  for (const r of rows) {
    if (['draft', 'in_review', 'returned', 'approved'].includes(r.status)) {
      map.set(r.filename, r.status as BaStatus);
    }
  }
  return map;
}

export function calculateElapsedMs(projectId: number): number {
  const s = readReqGenState(projectId);
  if (!s || !s.startedAt) return 0;
  return Date.now() - s.startedAt;
}
