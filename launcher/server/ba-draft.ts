// BA draft generation — after intake completes, the BA agent auto-drafts the
// 17 Project Background artifacts into the project's PRD/ folder (plan
// addendum AC-15…AC-20).
//
// How it behaves:
// - Triggered async from the intake-completion seam (server/index.ts) and
//   manually via POST .../generation/retry; enqueue never blocks the done
//   event (R8 — expect minutes, not seconds).
// - 17 sequential Ollama calls (D7), one per artifact, seeded from idea.md +
//   the intake transcript (.idea-memory/transcript.md).
// - Skip-if-exists (D9/AC-16): an artifact that already exists is never
//   overwritten and never re-drafted — a hand-saved prd.md is safe, and retry
//   is incremental (only missing files are re-drafted).
// - Per-file failure → job continues → retry fills gaps (R8). A run finishes
//   done only when all 17 exist; otherwise failed + last error.
// - Drafts only (D8): files land as Drafts via ba_artifacts_status defaults;
//   generation never touches review state, never auto-sends or auto-approves.
//
// Security notes (framework shared/skills/security.md): writes only the 17
// BA_ARTIFACTS allowlisted filenames (the same constant the PUT route gates
// on — no request-controlled path component), into the project's PRD/ folder
// resolved from the DB row. No deletes, no unlink.

import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { BA_ARTIFACTS, resolveProjectFolder } from './ba-workspace.js';
import { MODEL, OLLAMA } from './intake.js';
import { atomicWritePrd } from './prd-fs.js';

export type BaGenerationState = 'pending' | 'generating' | 'done' | 'failed';

export type BaGeneration = {
  state: BaGenerationState;
  // How many of the 17 artifacts exist on disk right now (0–17).
  count: number;
  // Artifact currently being drafted (null when not mid-file).
  current: string | null;
  error: string | null;
};

// ── Timings ────────────────────────────────────────────────────────────────
// A local 35B model can spend minutes per document; a heartbeat interval (not
// artifact boundaries) keeps updated_at fresh so the stale-detection window
// below can stay tight without false-failing slow-but-alive jobs.
const HEARTBEAT_MS = 30_000;
// No heartbeat for this long → the job did not survive a server restart.
const STALE_MS = 120_000;
// Per-file cap: a hung Ollama call fails that file (the job continues) instead
// of pinning the spinner forever.
const CALL_TIMEOUT_MS = 15 * 60_000;
// Cap the transcript seed so one huge interview can't blow up every prompt.
const MAX_TRANSCRIPT_CHARS = 24_000;

type GenRow = {
  state: BaGenerationState;
  current_file: string | null;
  count: number;
  error: string | null;
  updated_at: string;
};

function getGenRow(projectId: number): GenRow | undefined {
  return db
    .prepare(
      'SELECT state, current_file, count, error, updated_at FROM ba_generation WHERE project_id = ?',
    )
    .get(projectId) as GenRow | undefined;
}

// SQLite datetime('now') strings are UTC without a zone marker — add it.
function genUpdatedAtMs(sqliteUtc: string): number {
  return Date.parse(sqliteUtc.replace(' ', 'T') + 'Z');
}

// Upsert that always touches updated_at. Every patch field is optional; the
// insert arm (a project's first row) defaults what the patch omits.
function setGenRow(
  projectId: number,
  patch: {
    state?: BaGenerationState;
    current_file?: string | null;
    count?: number;
    error?: string | null;
  },
): void {
  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: (string | number | null)[] = [];
  if (patch.state !== undefined) {
    sets.push('state = ?');
    vals.push(patch.state);
  }
  if (patch.current_file !== undefined) {
    sets.push('current_file = ?');
    vals.push(patch.current_file ?? null);
  }
  if (patch.count !== undefined) {
    sets.push('count = ?');
    vals.push(patch.count);
  }
  if (patch.error !== undefined) {
    sets.push('error = ?');
    vals.push(patch.error);
  }
  db.prepare(
    `INSERT INTO ba_generation (project_id, state, current_file, count, error, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id) DO UPDATE SET ${sets.join(', ')}`,
  ).run(
    projectId,
    patch.state ?? 'pending',
    patch.current_file ?? null,
    patch.count ?? 0,
    patch.error ?? null,
    ...vals,
  );
}

// Reconciled read — the single accessor every surface (GET /files, retry,
// enqueue) goes through. A pending/generating row whose heartbeat went stale
// resolves to failed + retry (an in-flight job can't have survived a server
// restart); the resolution is persisted so the write-back happens once.
export function readGenerationState(projectId: number): BaGeneration | null {
  const row = getGenRow(projectId);
  if (!row) return null;
  if (
    (row.state === 'pending' || row.state === 'generating') &&
    Date.now() - genUpdatedAtMs(row.updated_at) > STALE_MS
  ) {
    const existing = countExisting(projectId);
    const msg =
      'Generation was interrupted before it finished (server restart). ' +
      'Retry drafts only the missing documents.';
    setGenRow(projectId, {
      state: 'failed',
      count: existing,
      current_file: null,
      error: msg,
    });
    return { state: 'failed', count: existing, current: null, error: msg };
  }
  return {
    state: row.state,
    count: countExisting(projectId),
    current: row.current_file,
    error: row.error,
  };
}

// How many of the 17 allowlisted artifacts exist on disk. One source of truth
// for progress: pre-existing + newly written + skipped files all count, so
// "X of 17" is never double-counted and retry is naturally incremental.
function countExisting(projectId: number): number {
  const row = db
    .prepare('SELECT id, name, slug, folder_path FROM project WHERE id = ?')
    .get(projectId) as { id: number; name: string; slug: string; folder_path: string } | undefined;
  if (!row) return 0;
  const dir = path.join(resolveProjectFolder(row), 'PRD');
  return BA_ARTIFACTS.filter((f) => fs.existsSync(path.join(dir, f))).length;
}

// ── Prompt seeds ───────────────────────────────────────────────────────────
// D9 — the scaffold ships no PRD templates, so each artifact's instruction is
// carried inline, grounded in what the SA review and the State D gate expect
// from each document.

const ARTIFACT_INSTRUCTIONS: Readonly<Record<string, string>> = {
  'prd.md':
    'The main PRD. Sections: Overview, Problem, Goals/Non-goals, Users, Features & scope, User stories with acceptance criteria, Success metrics, Risks. Concrete and testable — no filler.',
  'user-journeys.md':
    'Key user journeys as step-by-step narratives (trigger → steps → outcome), happy path plus at least the main failure path per journey.',
  'personas.md':
    '2–4 personas with name, role, goals, frustrations, tech comfort. Each persona maps to at least one user journey.',
  'glossary.md':
    'Two-column glossary (term → definition) of every domain term a new team member would need defined.',
  'stakeholder-map.md':
    'Stakeholder map: who is affected, interest/influence, engagement approach. Table plus short notes.',
  'business-rules.md':
    'Numbered business rules (BR-1, BR-2, …), one testable sentence each, source noted (intake conversation or idea.md).',
  'assumptions.md':
    'Numbered assumptions (A-1, A-2, …), each with what happens if it proves false.',
  'open-questions.md':
    'Open-questions log: numbered items with status (Open/Resolved), owner, and — for any item blocking PRD approval — a line `Blocker-for: PRD-approval`. If none block, say so explicitly.',
  'data-model.md':
    'Data model as entities, fields, types, relationships (markdown tables). Primary key + one example value per entity.',
  'data-flow.md':
    'How data moves: sources → transformation → storage → surfaces, numbered steps, trust boundaries noted.',
  'rbac-matrix.md':
    'RBAC matrix table (roles × resources, cells = none/own/group/all) plus a sentence per non-obvious cell. Every own/group cell means server-side scoping.',
  'nfr-catalog.md':
    'Non-functional requirements catalog: performance, security, accessibility, privacy, compliance — each testable with a target.',
  'phasing-plan.md':
    'What ships in each phase, entry/exit criteria per phase, what is explicitly deferred.',
  'traffic-profile.md':
    'Expected usage: user types, peak vs average, request mix, growth headroom. Numbers with stated assumptions.',
  'cost-model.md':
    "Cost drivers and model (hosting, storage, egress, LLM calls where relevant) with a worked example at the traffic profile's numbers.",
  'risks.md':
    'Risk register: risk, likelihood, impact, mitigation, owner. At least one technical and one adoption risk.',
  'tech-decision-brief.md':
    'Tech decision brief: recommended stack with a one-paragraph rationale per choice (frontend, backend, DB, hosting), trade-offs, and what was rejected and why.',
};

// ── The job ────────────────────────────────────────────────────────────────

// In-process guard: one run per project at a time. The reconciled DB state is
// the cross-restart authority; this set only stops a double-run inside one
// process (two retries racing, retry vs the intake trigger).
const running = new Set<number>();

function startJob(projectId: number): void {
  if (running.has(projectId)) return;
  running.add(projectId);
  void runJob(projectId)
    .catch((err) => {
      console.error('[ba-draft] job crashed:', err);
      try {
        setGenRow(projectId, {
          state: 'failed',
          error: 'Generation crashed — retry to continue.',
        });
      } catch {
        /* nothing more we can do */
      }
    })
    .finally(() => running.delete(projectId));
}

// Intake-completion trigger (AC-15). Fires once per project: a done job never
// re-triggers, a running job isn't double-started, and a failed job waits for
// the manual retry — unattended re-runs would burn LLM time for nothing.
export function enqueueBaDraftJob(projectId: number): void {
  if (running.has(projectId)) return;
  const row = getGenRow(projectId);
  if (row) return;
  setGenRow(projectId, { state: 'pending' });
  startJob(projectId);
}

// Manual trigger / retry (AC-18): re-runs only missing files and doubles as
// the manual trigger for pre-feature projects that finished intake with no
// artifacts. Returns an error string when the request must be refused.
export function retryBaGeneration(projectId: number): { ok: boolean; error?: string } {
  const state = readGenerationState(projectId);
  if (state && (state.state === 'pending' || state.state === 'generating')) {
    return { ok: false, error: 'Generation already running' };
  }
  if (running.has(projectId)) {
    return { ok: false, error: 'Generation already running' };
  }
  setGenRow(projectId, { state: 'pending', error: null });
  startJob(projectId);
  return { ok: true };
}

async function runJob(projectId: number): Promise<void> {
  const row = db
    .prepare('SELECT id, name, slug, folder_path FROM project WHERE id = ?')
    .get(projectId) as { id: number; name: string; slug: string; folder_path: string } | undefined;
  if (!row) {
    setGenRow(projectId, {
      state: 'failed',
      error: 'Project folder could not be resolved for generation',
    });
    return;
  }

  const prdDir = path.join(resolveProjectFolder(row), 'PRD');
  try {
    fs.mkdirSync(prdDir, { recursive: true });
  } catch (err) {
    setGenRow(projectId, {
      state: 'failed',
      error: 'Could not create the PRD folder: ' + (err instanceof Error ? err.message : String(err)),
    });
    return;
  }

  // Heartbeat: keeps updated_at fresh while the current Ollama call runs, so
  // the stale-detection window can stay tight (a 35B model can take minutes
  // per file — artifact boundaries are too far apart to heartbeat on).
  const heartbeat = setInterval(() => {
    try {
      db.prepare("UPDATE ba_generation SET updated_at = datetime('now') WHERE project_id = ?").run(
        projectId,
      );
    } catch {
      /* retried on the next tick */
    }
  }, HEARTBEAT_MS);

  try {
    setGenRow(projectId, { state: 'generating' });
    const seed = buildSeed(row);
    let lastError: string | null = null;

    for (const filename of BA_ARTIFACTS) {
      const filePath = path.join(prdDir, filename);
      // Skip-if-exists (AC-16): never re-draft, never overwrite — covers
      // hand-saved files and makes retry incremental.
      if (fs.existsSync(filePath)) continue;

      setGenRow(projectId, { current_file: filename });
      try {
        const content = await callOllama(draftPrompt(filename, seed));
        // Re-check at the write moment (R9): a user PUT that landed while the
        // call was in flight wins — the job never clobbers it. The write
        // itself serializes through the prd-fs mutex, so it cannot interleave
        // with a Requirements splice on the same file (review B1).
        if (fs.existsSync(filePath)) continue;
        if (!content.trim()) {
          throw new Error('The model returned an empty draft');
        }
        await atomicWritePrd(filePath, content);
      } catch (err) {
        // Per-file failure → job continues → retry fills gaps (R8).
        lastError = `Could not draft ${filename}: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
      setGenRow(projectId, { count: countExisting(projectId), current_file: null });
    }

    // Terminal state: done only when all 17 exist; otherwise failed with the
    // last per-file error and a retry that fills just the gaps.
    const existing = countExisting(projectId);
    if (existing === BA_ARTIFACTS.length) {
      setGenRow(projectId, { state: 'done', count: existing, current_file: null, error: null });
    } else {
      setGenRow(projectId, {
        state: 'failed',
        count: existing,
        current_file: null,
        error: lastError ?? 'Generation finished with missing documents — retry drafts the gaps.',
      });
    }
  } finally {
    clearInterval(heartbeat);
  }
}

// ── Prompt assembly + Ollama call ──────────────────────────────────────────

type Seed = { idea: string; transcript: string };

function buildSeed(row: { id: number; name: string; slug: string; folder_path: string }): Seed {
  const dir = resolveProjectFolder(row);
  const read = (p: string, cap: number): string => {
    try {
      const body = fs.readFileSync(p, 'utf-8').trim();
      return body.length > cap ? body.slice(0, cap) + '\n…(truncated)' : body;
    } catch {
      return '';
    }
  };
  const idea = read(path.join(dir, 'idea.md'), MAX_TRANSCRIPT_CHARS);
  const transcript = read(path.join(dir, '.idea-memory', 'transcript.md'), MAX_TRANSCRIPT_CHARS);
  return { idea, transcript };
}

function draftPrompt(filename: string, seed: Seed): { system: string; user: string } {
  const system =
    'You are the Business Analyst agent of the Idea-to-Web-Solution framework. ' +
    'Write project documents as clean GitHub-flavored markdown. Output the document body only — ' +
    'no preamble, no wrapping code fences, no commentary.';
  const sections = [
    'Draft the project document **' + filename + '** for the project described below.',
    '',
    'Instruction for this document: ' +
      (ARTIFACT_INSTRUCTIONS[filename] ?? 'Write the document.'),
    '',
    '## Project idea',
    seed.idea || '(idea.md is missing — draft from the transcript alone)',
  ];
  if (seed.transcript) {
    sections.push('', '## Intake transcript (excerpt)', '', seed.transcript);
  }
  sections.push(
    '',
    'Write the full document. Stay grounded in the idea and transcript; mark anything you had to invent with a note so the BA review can challenge it.',
  );
  return { system, user: sections.join('\n') };
}

// Exported for idea-summary.ts (plan §9.4 AC-21) — same Ollama seam, same
// streaming pattern. Do not copy this function for new LLM seams; import it.
export async function callOllama(prompt: { system: string; user: string }): Promise<string> {
  // Streaming, not stream:false: a full-document generation can take longer
  // than undici's default 300s headersTimeout before the response even starts
  // (caught live in the AC-20 walk — prd.md failed on a 5-min call), and
  // Node's fetch has no per-request way to raise it. NDJSON deltas keep
  // headers immediate and bodyTimeout resetting per chunk — the same pattern
  // /api/chat uses for the intake stream.
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
        evt = JSON.parse(line) as { message?: { content?: string }; error?: string };
      } catch {
        continue; // a torn line can't happen (NDJSON), but never trust the wire
      }
      if (evt.error) throw new Error(evt.error);
      if (evt.message?.content) full += evt.message.content;
    }
  }
  return full;
}