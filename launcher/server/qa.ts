// QA tab — per-story QA status, test runs, sign-off, coverage, rules
// (qa-tab build plan §3, qa-tab.html v5.3, sitemap § QA).
//
// Conventions carried forward from the design-tab review (now repo-wide):
//  - Story-membership 404 (stories.some) on EVERY route — reads, the notes
//    POST, run details, everything. F-SEC-1 was a post-hoc fix on design.ts;
//    QA ships with it everywhere from the first commit.
//  - project_id scoping on every SELECT and every UPDATE (F-4/F-6).
//  - Rules write-back: fixed filename allowlist + resolveInside under
//    testing/, no red-herring `..` checks (F-SEC-2 resolution), tmp+rename
//    atomic, 1 MB effective cap (global json gate), testing/ created on
//    first write.
//  - Screenshots served by test id + step index, never by raw client path;
//    resolveInside under qa-evidence/ (SA-R-106).
//  - Notes: '<' rejected + 10 KB body cap (parity with design notes).
//
// SA-R-101 (verified at build time): kanban_card.status is plain TEXT with
// NO CHECK (db.ts DDL), so QA vocabulary (ready_for_qa/in_qa/passed/…) is
// safely writable via the scoped UPDATE pattern; the sprint column CHECK is
// never touched. board.ts serializes status as a free-text string — the QA
// 'passed' write is consistent with how the sprint board reads the field.

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { db } from './db.js';
import { parseProjectId } from './jira-link.js';
import { getProjectRow, resolveProjectFolder } from './ba-workspace.js';
import { parseStories, parseStoryAcs } from './requirements-model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Vocabularies ───────────────────────────────────────────────────────────

const QA_STATUSES = ['ready_for_qa', 'in_qa', 'passed', 'failed', 'flaky', 'blocked_skipped'] as const;
type QaStatus = (typeof QA_STATUSES)[number];

const TEST_STATUSES = ['pass', 'fail', 'skip', 'flaky', 'blocked'] as const;
type TestStatus = (typeof TEST_STATUSES)[number];

const DIMENSIONS = ['functional', 'a11y', 'fidelity'] as const;
type Dimension = (typeof DIMENSIONS)[number];

function isTestStatus(v: unknown): v is TestStatus {
  return typeof v === 'string' && (TEST_STATUSES as readonly string[]).includes(v);
}

// The QA lifecycle only (NOT the board column). ready_for_qa = arrived from
// Build's queue; in_qa = a run is queued/running; passed/failed/flaky are
// test outcomes; blocked_skipped = blocked with reason (not deploy-blocking
// per sitemap § QA).
const QA_STATUS_PILL: Record<QaStatus, string> = {
  ready_for_qa: 'Ready for QA',
  in_qa: 'In QA',
  passed: 'Passed',
  failed: 'Failed',
  flaky: 'Flaky',
  blocked_skipped: 'Blocked',
};

// ── Project-dir resolution + containment ────────────────────────────────────

type ProjectContext = { id: number; folder: string };

function projectContext(idOrSlug: string): ProjectContext | null {
  const row = getProjectRow(idOrSlug);
  if (!row) return null;
  return { id: row.id, folder: path.resolve(resolveProjectFolder(row)) };
}

function resolveInside(root: string, ...parts: string[]): string | null {
  const target = path.resolve(root, ...parts);
  return target.startsWith(root + path.sep) ? target : null;
}

function testingDir(ctx: ProjectContext): string {
  return path.join(ctx.folder, 'testing');
}

function qaEvidenceDir(ctx: ProjectContext): string {
  return path.join(ctx.folder, 'qa-evidence');
}

// ── Story data source (PRD/stories.md + story-gen mapping) ────────────────

function storiesFilePath(ctx: ProjectContext): string {
  return path.join(ctx.folder, 'PRD', 'stories.md');
}

/** Read + parse stories.md. missing:true when the file does not exist yet. */
function readStoriesFile(ctx: ProjectContext): {
  stories: ReturnType<typeof parseStories>['stories'];
  missing: boolean;
} {
  const p = storiesFilePath(ctx);
  if (!fs.existsSync(p)) return { stories: [], missing: true };
  return { stories: parseStories(fs.readFileSync(p, 'utf-8')).stories, missing: false };
}

function storiesSrcText(ctx: ProjectContext): string {
  const p = storiesFilePath(ctx);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

// story-gen mapping (data/story-gen/<projectId>.mapping.json) joins a story to
// its auto-created kanban_card. Reversed for `POST /runs` scope `story TM-NN`.
function storyCardMapping(projectId: number): Map<string, { cardId: number; ticketKey: string }> {
  const map = new Map<string, { cardId: number; ticketKey: string }>();
  const filePath = path.join(__dirname, '..', 'data', 'story-gen', `${projectId}.mapping.json`);
  if (!fs.existsSync(filePath)) return map;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
      stories?: { us: string; ticketKey: string; cardId: number }[];
    };
    for (const s of parsed.stories ?? []) map.set(s.us, { cardId: s.cardId, ticketKey: s.ticketKey });
  } catch {
    /* corrupt mapping — run scope by ticket falls through to 422 */
  }
  return map;
}

// ── qa_story_state read/write helpers (all scoped — F-6) ──────────────────

type QaStoryRow = {
  project_id: number;
  story_id: string;
  status: QaStatus;
  rework_rounds: number;
  round_trip: string;
  flaky_since: string | null;
  updated_at: string;
};

function qaStateRow(projectId: number, storyId: string): QaStoryRow | null {
  const row = db
    .prepare('SELECT * FROM qa_story_state WHERE project_id = ? AND story_id = ?')
    .get(projectId, storyId) as QaStoryRow | undefined;
  return row ?? null;
}

// Lazy-create: a story with no row reads as ready_for_qa (nothing started).
function ensureQaState(projectId: number, storyId: string): void {
  db.prepare('INSERT OR IGNORE INTO qa_story_state (project_id, story_id) VALUES (?, ?)').run(
    projectId,
    storyId,
  );
}

function readQaState(
  projectId: number,
  storyId: string,
): { status: QaStatus; rework_rounds: number; round_trip: Record<string, unknown> } {
  const row = qaStateRow(projectId, storyId);
  if (!row) return { status: 'ready_for_qa', rework_rounds: 0, round_trip: {} };
  let roundTrip: Record<string, unknown> = {};
  try {
    roundTrip = JSON.parse(row.round_trip) as Record<string, unknown>;
  } catch {
    /* corrupt round_trip — treat as empty */
  }
  return { status: row.status, rework_rounds: row.rework_rounds, round_trip: roundTrip };
}

// ── Test/run read helpers ───────────────────────────────────────────────────

type QaTestRow = {
  id: number;
  run_id: number;
  project_id: number;
  story_id: string;
  name: string;
  dimension: Dimension;
  status: TestStatus;
  expected: string | null;
  actual: string | null;
  trace_path: string | null;
  steps: string;
  ac_refs: string;
};

type RunRow = {
  id: number;
  run_no: number;
  trigger: string;
  started_at: string;
  duration_ms: number | null;
  result: string | null;
  summary: string | null;
};

function runsForStory(projectId: number, storyId: string): RunRow[] {
  return db
    .prepare(
      'SELECT id, run_no, trigger, started_at, duration_ms, result, summary FROM qa_run WHERE project_id = ? AND story_id = ? ORDER BY run_no DESC',
    )
    .all(projectId, storyId) as RunRow[];
}

function testsForStory(projectId: number, storyId: string): QaTestRow[] {
  return db
    .prepare(
      'SELECT * FROM qa_test WHERE project_id = ? AND story_id = ? ORDER BY run_id ASC, id ASC',
    )
    .all(projectId, storyId) as QaTestRow[];
}

function parseSteps(raw: string): { label: string; status: TestStatus; shot: string | null }[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s) => {
      const o = (s ?? {}) as { label?: unknown; status?: unknown; shot?: unknown };
      return {
        label: typeof o.label === 'string' ? o.label : 'step',
        status: isTestStatus(o.status) ? o.status : 'pass',
        shot: typeof o.shot === 'string' && o.shot ? o.shot : null,
      };
    });
  } catch {
    return [];
  }
}

function parseAcRefs(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string' && /^AC-\d{3}$/.test(x))
      : [];
  } catch {
    return [];
  }
}

// Wire shape for one test: per-step screenshots become viewer URLs (served by
// test id + step index — never by raw path, SA-R-106). Pass thumbs come first
// (visible confirmations), then issue thumbs.
type TestWire = {
  id: number;
  run_no: number;
  name: string;
  dimension: Dimension;
  status: TestStatus;
  expected: string | null;
  actual: string | null;
  duration_ms: number | null;
  trace_path: string | null;
  acs: string[];
  steps: { label: string; status: TestStatus; shot: string | null }[];
  screenshots: { pass: string[]; issue: string[] };
};

function testWire(projectId: number, test: QaTestRow): TestWire {
  const steps = parseSteps(test.steps);
  const screenshots = { pass: [] as string[], issue: [] as string[] };
  steps.forEach((s, i) => {
    if (!s.shot) return;
    (s.status === 'pass' ? screenshots.pass : screenshots.issue).push(
      `/api/projects/${projectId}/qa/screenshots/${test.id}/${i}`,
    );
  });
  const run = db
    .prepare('SELECT run_no FROM qa_run WHERE id = ?')
    .get(test.run_id) as { run_no: number } | undefined;
  return {
    id: test.id,
    run_no: run?.run_no ?? 0,
    name: test.name,
    dimension: test.dimension,
    status: test.status,
    expected: test.expected,
    actual: test.actual,
    duration_ms: null,
    trace_path: test.trace_path,
    acs: parseAcRefs(test.ac_refs),
    steps,
    screenshots,
  };
}

// ── Per-story wire state (status list rows + detail header) ────────────────

/** Rework round-trip description (sitemap zone 5). */
function roundTripLine(state: { status: QaStatus; rework_rounds: number }): string | null {
  if (state.rework_rounds === 0) return null;
  const nextRound = state.rework_rounds + 1;
  return `Failed round ${state.rework_rounds} → in Build rework → fixed → Ready for QA (round ${nextRound})`;
}

function storyWireSummary(
  projectId: number,
  story: { usId: string; title: string },
  srcText: string,
) {
  const state = readQaState(projectId, story.usId);
  const tests = testsForStory(projectId, story.usId);
  const runs = runsForStory(projectId, story.usId);
  const latestRun = runs[0] ?? null;
  const strip = { pass: 0, fail: 0, skip: 0, flaky: 0, blocked: 0, total: tests.length };
  for (const t of tests) strip[t.status] += 1;
  // Screenshot thumb counts from the LATEST run's tests only (the mockup's
  // strip shows current evidence, not every historical run).
  const shots = { pass: 0, issue: 0 };
  const latestRunId = latestRun ? latestRun.id : undefined;
  for (const t of tests) {
    if (latestRunId !== undefined && t.run_id !== latestRunId) continue;
    for (const s of parseSteps(t.steps)) {
      if (!s.shot) continue;
      if (s.status === 'pass') shots.pass += 1;
      else shots.issue += 1;
    }
  }
  const mapping = storyCardMapping(projectId);
  const cardEntry = mapping.get(story.usId);
  const card = cardEntry
    ? (db
        .prepare('SELECT ticket_key, column FROM kanban_card WHERE id = ? AND project_id = ?')
        .get(cardEntry.cardId, projectId) as { ticket_key: string; column: string | null } | undefined)
    : undefined;
  const acs = parseStoryAcs(srcText, story.usId);
  const coveredAcs = new Set<string>();
  for (const t of tests) for (const ac of parseAcRefs(t.ac_refs)) coveredAcs.add(ac);
  return {
    storyId: story.usId,
    title: story.title,
    qa_status: state.status,
    status_pill: QA_STATUS_PILL[state.status],
    ticket_key: card?.ticket_key ?? cardEntry?.ticketKey ?? null,
    rework_rounds: state.rework_rounds,
    round_trip: state.round_trip,
    roundtrip_in_progress: state.status === 'in_qa' && state.rework_rounds > 0,
    escalation: state.rework_rounds >= 3,
    tests_strip: strip,
    screenshots: { pass: shots.pass, issue: shots.issue },
    coverage: { covered: coveredAcs.size, total: acs.length },
    latest_run: latestRun
      ? {
          run_no: latestRun.run_no,
          trigger: latestRun.trigger,
          started_at: latestRun.started_at,
          duration_ms: latestRun.duration_ms,
          result: latestRun.result,
        }
      : null,
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────

const RULES_FILENAMES = ['qa-rules.md', 'QA-AGENT.md', 'REVIEWER-AGENT.md'] as const;

export function registerQaRoutes(app: express.Application): void {
  const prefix = '/api/projects/:id/qa';

  // GET /stories — status list rows + per-story test strips, screenshot
  // thumb counts, coverage, run summary, and the project-wide dimension
  // aggregate for the compact Results-by-dimension lanes (zone 9). (The
  // client builds the 6 stat tiles, verdict banner and pass rate from these
  // rows — the denominator rule lives in the client per mockup parity, see
  // QaScreen.)
  app.get(`${prefix}/stories`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const { stories, missing } = readStoriesFile(ctx);
    const src = storiesSrcText(ctx);
    const rows = stories.map((s) => storyWireSummary(projectId, s, src));
    const dimensionSummary = DIMENSIONS.map((d) => {
      const byDim = db
        .prepare('SELECT status FROM qa_test WHERE project_id = ? AND dimension = ?')
        .all(projectId, d) as { status: TestStatus }[];
      return {
        dimension: d,
        pass: byDim.filter((t) => t.status === 'pass').length,
        fail: byDim.filter((t) => t.status === 'fail').length,
        flaky: byDim.filter((t) => t.status === 'flaky').length,
        skip: byDim.filter((t) => t.status === 'skip' || t.status === 'blocked').length,
        total: byDim.length,
      };
    });
    res.json({ stories: rows, dimension_summary: dimensionSummary, missing_stories: missing });
  });

  // GET/PUT /rules — fixed filename allowlist + containment + caps. Registered
  // BEFORE any /:storyId-shaped route so 'rules' never parses as a story id.
  app.get(`${prefix}/rules`, (req, res) => {
    const ctx = projectContext(req.params.id);
    if (!ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const dir = testingDir(ctx);
    const out: Record<string, string> = {};
    for (const file of RULES_FILENAMES) {
      const p = path.join(dir, file);
      out[file] = fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
    }
    res.json({ files: out });
  });

  // No route-level body parser: the QA rules body is parsed by the global
  // 1 mb json gate (index.ts) which runs before this route. A cap above that
  // gate would be dead config — the honest cap is 1 MB effective, and the
  // handler-side byte check below is the defense-in-depth (SA5 disposition,
  // DR4 finding, 2026-09-17). Design's pre-gate bypass exists because design
  // carries multi-MB HTML uploads; QA rules are prose files that fit 1 MB.
  app.put(`${prefix}/rules`, (req, res) => {
    const ctx = projectContext(req.params.id);
    if (!ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const body = (req.body ?? {}) as { file?: unknown; content?: unknown };
    if (
      typeof body.file !== 'string' ||
      !(RULES_FILENAMES as readonly string[]).includes(body.file)
    ) {
      res.status(422).json({ error: 'Unknown rules file.' });
      return;
    }
    if (typeof body.content !== 'string') {
      res.status(422).json({ error: 'Rules content must be a string.' });
      return;
    }
    if (Buffer.byteLength(body.content, 'utf-8') > 1 * 1024 * 1024) {
      res.status(422).json({ error: 'Rules are limited to 1 MB.' });
      return;
    }
    // F-SEC-2 resolution: the fixed-filename allowlist + resolveInside IS the
    // containment; no separator can survive the allowlist by construction.
    const contained = resolveInside(testingDir(ctx), body.file);
    if (!contained || path.basename(contained) !== body.file) {
      res.status(422).json({ error: 'Invalid rules path.' });
      return;
    }
    fs.mkdirSync(dirname(contained), { recursive: true });
    const tmp = `${contained}.tmp`;
    fs.writeFileSync(tmp, body.content, 'utf-8');
    fs.renameSync(tmp, contained);
    res.json({ ok: true, file: body.file, size: Buffer.byteLength(body.content, 'utf-8') });
  });

  // GET /env — null-shaped until Build ships a deploy record (SA-R-102); the
  // client renders the "Not deployed yet" empty state from that null.
  app.get(`${prefix}/env`, (req, res) => {
    const ctx = projectContext(req.params.id);
    if (!ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    res.json({ env: null, reason: 'not_deployed' });
  });

  // GET /coverage — AC IDs from stories.md vs recorded qa_test.ac_refs rows
  // (plan §3; SA-R-103: stories without ACs read 0/0, never an error).
  app.get(`${prefix}/coverage`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const { stories, missing } = readStoriesFile(ctx);
    const src = storiesSrcText(ctx);
    const covered: { ac: string; storyId: string }[] = [];
    const untested: { ac: string; storyId: string }[] = [];
    for (const story of stories) {
      const acs = parseStoryAcs(src, story.usId);
      const coveredSet = new Set<string>();
      for (const t of testsForStory(projectId, story.usId)) {
        for (const ac of parseAcRefs(t.ac_refs)) coveredSet.add(ac);
      }
      for (const ac of acs) {
        (coveredSet.has(ac.id) ? covered : untested).push({ ac: ac.id, storyId: story.usId });
      }
    }
    res.json({
      covered,
      untested,
      total: covered.length + untested.length,
      covered_count: covered.length,
      untested_count: untested.length,
      missing_stories: missing,
    });
  });

  // GET /runs/:storyId — run history for the detail table + the collapsible
  // sub-row on the status list (F-SEC-1: membership 404 on reads too).
  app.get(`${prefix}/runs/:storyId`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const { stories, missing } = readStoriesFile(ctx);
    if (!stories.some((s) => s.usId === req.params.storyId)) {
      res.status(404).json({ error: missing ? 'No stories for this project yet' : 'Unknown story' });
      return;
    }
    res.json({ runs: runsForStory(projectId, req.params.storyId) });
  });

  // POST /runs — trigger a run. Scope selector: full | smoke | story TM-NN,
  // anything else → 422 with a spec message. Records a queued run (result
  // NULL) and marks the story In QA — executing the suite belongs to the QA
  // agent runtime (out of scope, plan §2). full/smoke queue one run per story
  // that has entered QA (has a state row).
  app.post(`${prefix}/runs`, express.json({ limit: '1mb' }), (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const scope = (req.body ?? {}).scope;
    if (
      scope !== 'full' &&
      scope !== 'smoke' &&
      !(typeof scope === 'string' && /^story\s+TM-\d+$/.test(scope.trim()))
    ) {
      res.status(422).json({ error: "Scope must be 'full', 'smoke', or 'story TM-NN'." });
      return;
    }
    let storyIds: string[];
    if (scope === 'full' || scope === 'smoke') {
      const rows = db
        .prepare('SELECT story_id FROM qa_story_state WHERE project_id = ?')
        .all(projectId) as { story_id: string }[];
      storyIds = rows.map((r) => r.story_id);
    } else {
      const ticket = (scope as string).trim().match(/^story\s+(TM-\d+)$/)![1];
      const entry = [...storyCardMapping(projectId).entries()].find(
        ([, v]) => v.ticketKey === ticket,
      );
      if (!entry) {
        res.status(422).json({ error: `Unknown ticket ${ticket} for this project.` });
        return;
      }
      const { stories, missing } = readStoriesFile(ctx);
      if (!stories.some((s) => s.usId === entry[0])) {
        res.status(404).json({ error: missing ? 'No stories for this project yet' : 'Unknown story' });
        return;
      }
      storyIds = [entry[0]];
    }
    const runs: { id: number; run_no: number; story_id: string }[] = [];
    for (const storyId of storyIds) {
      ensureQaState(projectId, storyId);
      db.prepare(
        "UPDATE qa_story_state SET status = 'in_qa', updated_at = datetime('now') WHERE project_id = ? AND story_id = ?",
      ).run(projectId, storyId);
      const maxRow = db
        .prepare(
          'SELECT COALESCE(MAX(run_no), 0) AS n FROM qa_run WHERE project_id = ? AND story_id = ?',
        )
        .get(projectId, storyId) as { n: number };
      const info = db
        .prepare(
          "INSERT INTO qa_run (project_id, story_id, run_no, trigger, started_at) VALUES (?, ?, ?, 'manual', datetime('now'))",
        )
        .run(projectId, storyId, maxRow.n + 1);
      runs.push({ id: Number(info.lastInsertRowid), run_no: maxRow.n + 1, story_id: storyId });
    }
    res.json({ scope, runs });
  });

  // GET /tests/:storyId — story detail payload: header + dimensions + run
  // history + per-test rows + notes thread (zone 10; F-SEC-1 membership).
  app.get(`${prefix}/tests/:storyId`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const { stories, missing } = readStoriesFile(ctx);
    const story = stories.find((s) => s.usId === req.params.storyId);
    if (!story) {
      res.status(404).json({ error: missing ? 'No stories for this project yet' : 'Unknown story' });
      return;
    }
    const state = readQaState(projectId, story.usId);
    const wireTests = testsForStory(projectId, story.usId).map((t) => testWire(projectId, t));
    const dimensions = DIMENSIONS.map((d) => {
      const byDim = wireTests.filter((t) => t.dimension === d);
      return {
        dimension: d,
        pass: byDim.filter((t) => t.status === 'pass').length,
        fail: byDim.filter((t) => t.status === 'fail').length,
        skip: byDim.filter((t) => t.status === 'skip' || t.status === 'blocked').length,
        flaky: byDim.filter((t) => t.status === 'flaky').length,
        total: byDim.length,
      };
    });
    const notes = db
      .prepare(
        'SELECT id, author, body, created_at FROM qa_note WHERE project_id = ? AND story_id = ? ORDER BY created_at ASC, id ASC',
      )
      .all(projectId, story.usId) as {
      id: number;
      author: string;
      body: string;
      created_at: string;
    }[];
    const ticketKey =
      (storyCardMapping(projectId).get(story.usId)?.ticketKey ?? null);
    res.json({
      story: {
        storyId: story.usId,
        title: story.title,
        ticket_key: ticketKey,
        qa_status: state.status,
        status_pill: QA_STATUS_PILL[state.status],
        rework_rounds: state.rework_rounds,
        round_trip: state.round_trip,
        roundtrip_line: roundTripLine(state),
      },
      dimensions,
      runs: runsForStory(projectId, story.usId),
      tests: wireTests,
      notes,
      missing_stories: missing,
    });
  });

  // POST /:storyId/notes — notes thread (zone 10; parity with design notes:
  // '<' rejected, 10 KB cap, author defaults to 'Will'; F-SEC-1 membership).
  app.post(`${prefix}/:storyId/notes`, express.json({ limit: '1mb' }), (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const { stories, missing } = readStoriesFile(ctx);
    if (!stories.some((s) => s.usId === req.params.storyId)) {
      res.status(404).json({ error: missing ? 'No stories for this project yet' : 'Unknown story' });
      return;
    }
    const body = (req.body ?? {}) as { body?: unknown; author?: unknown };
    if (typeof body.body !== 'string' || !body.body.trim()) {
      res.status(422).json({ error: 'Note body is required.' });
      return;
    }
    if (Buffer.byteLength(body.body, 'utf-8') > 10 * 1024) {
      res.status(422).json({ error: 'Notes are limited to 10 KB.' });
      return;
    }
    if (body.body.includes('<')) {
      res.status(422).json({ error: 'Notes are plain text only.' });
      return;
    }
    const author =
      typeof body.author === 'string' && body.author.trim() ? body.author.trim().slice(0, 80) : 'Will';
    const info = db
      .prepare('INSERT INTO qa_note (project_id, story_id, author, body) VALUES (?, ?, ?, ?)')
      .run(projectId, req.params.storyId, author, body.body.trim());
    res.json({
      note: {
        id: Number(info.lastInsertRowid),
        author,
        body: body.body.trim(),
        created_at: new Date().toISOString(),
      },
    });
  });

  // POST /signoff — 409 unless all-pass. Denominator rule (sitemap § QA):
  // Flaky is excluded from the pass rate and blocked is "not blocking
  // deploy", so a story only blocks signoff while it is failed, in_qa, or
  // queued (ready_for_qa). A project with zero stories in QA is 409 (nothing
  // passed). Success advances the stage rows (QA→done, Shipped→active) and
  // flips the kanban_card read-model to 'passed' via the scoped UPDATE
  // (F-4 pattern). ensureQaState persists the first transition.
  app.post(`${prefix}/signoff`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const { stories } = readStoriesFile(ctx);
    const blockers: { storyId: string; status: QaStatus }[] = [];
    for (const story of stories) {
      const state = readQaState(projectId, story.usId);
      if (
        state.status === 'failed' ||
        state.status === 'in_qa' ||
        state.status === 'ready_for_qa'
      ) {
        blockers.push({ storyId: story.usId, status: state.status });
      }
    }
    if (blockers.length > 0) {
      res.status(409).json({
        error: `Cannot sign off — ${blockers.length} story(ies) not passed.`,
        blocking: blockers,
      });
      return;
    }
    // All stories passed (or flaky/blocked-skipped, which don't block) — advance.
    for (const story of stories) {
      const state = readQaState(projectId, story.usId);
      if (state.status !== 'passed') continue;
      // F-4: flip the local kanban_card read-model to the QA outcome — scoped
      // to the project (board pattern). status is plain TEXT (no CHECK) so QA
      // statuses are safe (SA-R-101 verified at build time).
      const entry = storyCardMapping(projectId).get(story.usId);
      if (entry) {
        db.prepare(
          "UPDATE kanban_card SET status = 'passed', updated_at = datetime('now') WHERE id = ? AND project_id = ?",
        ).run(entry.cardId, projectId);
      }
    }
    // Advance the stage rows: QA → done, Shipped → active. The stage table has
    // no UNIQUE on (project_id, stage_key) so insert-if-missing must be an
    // explicit existence check, not INSERT OR IGNORE.
    const ensureStage = (stageKey: string, status: string): void => {
      const exists = db
        .prepare('SELECT id FROM stage WHERE project_id = ? AND stage_key = ?')
        .get(projectId, stageKey);
      if (!exists) {
        db.prepare('INSERT INTO stage (project_id, stage_key, status) VALUES (?, ?, ?)').run(
          projectId,
          stageKey,
          status,
        );
      }
    };
    ensureStage('QA', 'done');
    db.prepare(
      "UPDATE stage SET status = 'done', completed_at = datetime('now') WHERE project_id = ? AND stage_key = 'QA'",
    ).run(projectId);
    ensureStage('Shipped', 'active');
    db.prepare(
      "UPDATE stage SET status = 'active', started_at = COALESCE(started_at, datetime('now')) WHERE project_id = ? AND stage_key = 'Shipped'",
    ).run(projectId);
    res.json({ ok: true, deployed: true });
  });

  // GET /screenshots/:testId/:n — serve a stored screenshot step by test id +
  // step index, resolveInside under qa-evidence/ (SA-R-106: never by a raw
  // client path). Unknown id, out-of-range step, unresolved or missing file
  // → 404.
  app.get(`${prefix}/screenshots/:testId/:n`, (req, res) => {
    const projectId = parseProjectId(req.params.id);
    const ctx = projectContext(req.params.id);
    if (projectId === null || !ctx) {
      res.status(400).json({ error: 'Unknown project id or slug' });
      return;
    }
    const testId = Number(req.params.testId);
    const n = Number(req.params.n);
    if (!Number.isInteger(testId) || testId <= 0 || !Number.isInteger(n) || n < 0) {
      res.status(404).json({ error: 'Unknown screenshot' });
      return;
    }
    const row = db
      .prepare('SELECT steps FROM qa_test WHERE id = ? AND project_id = ?')
      .get(testId, projectId) as { steps: string } | undefined;
    if (!row) {
      res.status(404).json({ error: 'Unknown screenshot' });
      return;
    }
    const shot = parseSteps(row.steps)[n]?.shot ?? null;
    if (!shot) {
      res.status(404).json({ error: 'No screenshot for this step' });
      return;
    }
    const contained = resolveInside(qaEvidenceDir(ctx), shot);
    if (!contained || !fs.existsSync(contained)) {
      res.status(404).json({ error: 'No screenshot for this step' });
      return;
    }
    const ext = path.extname(contained).toLowerCase();
    const mime =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/png';
    res.type(mime);
    res.send(fs.readFileSync(contained));
  });
}
