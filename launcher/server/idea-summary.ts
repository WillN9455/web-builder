// Idea summary — the LLM-written summary of idea.md shown on the Project
// Background tab (plan §9.4, AC-21 revised).
//
// How it behaves:
// - Async + cached, never inline: a GET .../idea-summary read enqueues a
//   background job when there is no row yet or the cached row's idea_hash no
//   longer matches idea.md on disk (the idea was captured or edited) — the
//   response itself returns immediately with the current state, and the card
//   shows "Writing summary…" until the run lands done.
// - Cache key: the sha256 of idea.md's content. Editing idea.md therefore
//   regenerates the summary on the next read, with no manual trigger.
// - A failed run waits for the manual retry (POST .../idea-summary/retry) —
//   the same contract as the AC-17 draft generation; a read never re-enqueues
//   a failed job with an unchanged hash, so a persistently bad model can't
//   burn LLM calls on every poll.
// - A job killed by a server restart reconciles to failed + retry on first
//   read (heartbeat + stale window), never a spinner forever — same pattern
//   as ba_generation (AC-17).
//
// Security notes (framework shared/skills/security.md): the only input is the
// project's own idea.md, read from the folder resolved from the DB row
// (folder_path never comes from the request). The prompt is fixed text plus
// the idea body; the summary is stored, never executed. No file writes.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { resolveProjectFolder } from './ba-workspace.js';
import { callOllama } from './ba-draft.js';

export type IdeaSummaryState = 'pending' | 'generating' | 'done' | 'failed';

export type IdeaSummary = {
  state: IdeaSummaryState;
  // The generated summary — null until done (a stale one is never served).
  summary: string | null;
  error: string | null;
};

type SummaryRow = {
  state: IdeaSummaryState;
  summary: string | null;
  idea_hash: string | null;
  error: string | null;
  updated_at: string;
};

// ── Timings ────────────────────────────────────────────────────────────────
// Same reasoning as ba-draft.ts: one summarization call can run minutes on a
// local model; the heartbeat keeps the stale window tight without false-
// failing slow-but-alive jobs.
const HEARTBEAT_MS = 30_000;
const STALE_MS = 120_000;
// Cap the idea seed — one huge idea.md can't blow up the prompt.
const MAX_IDEA_CHARS = 24_000;

// In-process lock — the DB row is the durable state; this set is the
// double-start guard across racing reads/retries (same as ba-draft's).
const running = new Set<number>();

function getSummaryRow(projectId: number): SummaryRow | undefined {
  return db
    .prepare(
      'SELECT state, summary, idea_hash, error, updated_at FROM ba_idea_summary WHERE project_id = ?',
    )
    .get(projectId) as SummaryRow | undefined;
}

// Upsert that always touches updated_at (the heartbeat). Every patch field is
// optional; the insert arm defaults what the patch omits.
function setSummaryRow(
  projectId: number,
  patch: {
    state?: IdeaSummaryState;
    summary?: string | null;
    idea_hash?: string | null;
    error?: string | null;
  },
): void {
  const sets: string[] = ["updated_at = datetime('now')"];
  const vals: (string | null)[] = [];
  if (patch.state !== undefined) {
    sets.push('state = ?');
    vals.push(patch.state);
  }
  if (patch.summary !== undefined) {
    sets.push('summary = ?');
    vals.push(patch.summary);
  }
  if (patch.idea_hash !== undefined) {
    sets.push('idea_hash = ?');
    vals.push(patch.idea_hash);
  }
  if (patch.error !== undefined) {
    sets.push('error = ?');
    vals.push(patch.error);
  }
  db.prepare(
    `INSERT INTO ba_idea_summary (project_id, state, summary, idea_hash, error, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id) DO UPDATE SET ${sets.join(', ')}`,
  ).run(
    projectId,
    patch.state ?? 'pending',
    patch.summary ?? null,
    patch.idea_hash ?? null,
    patch.error ?? null,
    ...vals,
  );
}

// SQLite datetime('now') strings are UTC without a zone marker — add it.
function updatedAtMs(sqliteUtc: string): number {
  return Date.parse(sqliteUtc.replace(' ', 'T') + 'Z');
}

type IdeaRow = { id: number; folder_path: string };

function readIdea(row: IdeaRow): { content: string; hash: string } | null {
  // resolveProjectFolder only reads folder_path; the name/slug fields are
  // filled to satisfy ProjectRow without a DB round-trip.
  const ideaPath = path.join(
    resolveProjectFolder({ ...row, name: '', slug: '' }),
    'idea.md',
  );
  try {
    const content = fs.readFileSync(ideaPath, 'utf-8');
    return {
      content: content.slice(0, MAX_IDEA_CHARS),
      hash: createHash('sha256').update(content).digest('hex'),
    };
  } catch {
    return null; // no idea.md — the card stays hidden (availability, not an error)
  }
}

function buildPrompt(idea: string): { system: string; user: string } {
  return {
    system:
      'You are the Business Analyst agent of the Idea-to-Web-Solution framework. ' +
      'Write clear, grounded project summaries as clean GitHub-flavored markdown. ' +
      'Output the summary only — no preamble, no wrapping code fences, no commentary.',
    user: [
      'Summarize the project idea below for the Project Background page of the Idea-to-Web-Solution framework.',
      '',
      'Write a concise summary (3–6 sentences, or short bullets) covering: the problem being solved, ' +
      'who it is for, the core solution shape, and any scope or constraint worth flagging. ' +
      'Stay grounded in the idea text — do not invent features; if the idea is thin, say so plainly.',
      '',
      '## idea.md',
      idea || '(idea.md is empty)',
    ].join('\n'),
  };
}

async function runJob(projectId: number, idea: string, hash: string): Promise<void> {
  running.add(projectId);
  const heartbeat = setInterval(() => {
    try {
      db.prepare("UPDATE ba_idea_summary SET updated_at = datetime('now') WHERE project_id = ?").run(projectId);
    } catch {
      /* retried on the next tick */
    }
  }, HEARTBEAT_MS);
  try {
    setSummaryRow(projectId, { state: 'generating', error: null });
    const summary = await callOllama(buildPrompt(idea));
    if (!summary.trim()) throw new Error('The model returned an empty summary');
    // The hash captured at enqueue is what the row records — if idea.md
    // changed mid-run, the next read sees the mismatch and regenerates.
    setSummaryRow(projectId, { state: 'done', summary: summary.trim(), idea_hash: hash, error: null });
  } catch (err) {
    setSummaryRow(projectId, {
      state: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearInterval(heartbeat);
    running.delete(projectId);
  }
}

// Reconciled read — the single accessor every surface (GET /idea-summary,
// retry) goes through. Enqueues on a cache miss or a stale hash; a stale
// heartbeat resolves to failed + retry exactly once. Returns null when the
// project has no idea.md (the caller hides the card — availability, not an
// error state).
export function readIdeaSummary(row: IdeaRow): IdeaSummary | null {
  const idea = readIdea(row);
  if (!idea) return null;

  const r = getSummaryRow(row.id);
  if (
    r &&
    (r.state === 'pending' || r.state === 'generating') &&
    Date.now() - updatedAtMs(r.updated_at) > STALE_MS
  ) {
    const msg =
      'Summary generation was interrupted before it finished (server restart). Retry from the card.';
    setSummaryRow(row.id, { state: 'failed', error: msg });
  }

  const current = getSummaryRow(row.id);
  // Enqueue only on a genuine cache miss or stale hash. A fresh pending/
  // generating row is an in-flight run — running.has() and the state check
  // keep the read from double-starting it; a failed row with an unchanged
  // hash waits for the manual retry (a read never re-burns LLM calls).
  const needsRun =
    (!current || current.idea_hash !== idea.hash) &&
    current?.state !== 'pending' &&
    current?.state !== 'generating';
  if (needsRun && !running.has(row.id)) {
    setSummaryRow(row.id, { state: 'pending', idea_hash: idea.hash, summary: null, error: null });
    void runJob(row.id, idea.content, idea.hash).catch(() => {
      /* runJob owns its error state */
    });
  }

  const out = getSummaryRow(row.id);
  if (!out) return null;
  return {
    state: out.state,
    // Serve a summary only from a done row whose hash matches the current
    // idea — an edit regenerates rather than showing stale text.
    summary: out.state === 'done' && out.idea_hash === idea.hash ? out.summary : null,
    error: out.error,
  };
}

// Manual retry (the failed card's Retry button). Refused while a run is in
// flight and for a done row whose hash still matches (the card only offers
// Retry on failed; a stale idea re-runs via the read's hash check — retry
// never burns an LLM call the cache already covers).
export function retryIdeaSummary(row: IdeaRow): { ok: boolean; error?: string } {
  const idea = readIdea(row);
  if (!idea) return { ok: false, error: 'No idea.md in the project folder' };
  if (running.has(row.id)) return { ok: false, error: 'Summary already generating' };
  const r = getSummaryRow(row.id);
  if (
    r &&
    r.idea_hash === idea.hash &&
    (r.state === 'done' ||
      ((r.state === 'pending' || r.state === 'generating') &&
        Date.now() - updatedAtMs(r.updated_at) <= STALE_MS))
  ) {
    return {
      ok: false,
      error: r.state === 'done' ? 'Summary is already up to date' : 'Summary already generating',
    };
  }
  setSummaryRow(row.id, { state: 'pending', idea_hash: idea.hash, summary: null, error: null });
  void runJob(row.id, idea.content, idea.hash).catch(() => {
    /* runJob owns its error state */
  });
  return { ok: true };
}