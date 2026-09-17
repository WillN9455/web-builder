// QA tab — server verification walk (qa-tab build plan §7).
//
// Mirrors scripts/verify-design.ts: isolated temp checkout of server/ + an
// isolated SQLite DB (never the dev launcher.db), synthetic fixtures on disk,
// server spawned on a free private port, then a full CRUD/security walk.
//
// Coverage — one check per acceptance criterion + the pre-code hardenings
// (SA-R-101…107, F-SEC-1/2 lessons), all disk-verified where destructive:
//   F-SEC-1  story-membership 404 on EVERY route — reads (tests/runs/notes GET)
//            and the notes POST carry `stories.some` membership; foreign storyId
//            404s, non-US grammar storyId 404s.
//   F-SEC-2  rules PUT containment: fixed-filename allowlist
//            (qa-rules.md/QA-AGENT.md/REVIEWER-AGENT.md), 2 MB byte cap,
//            tmp+rename atomic write, on-disk bytes asserted; rejected writes
//            leave the prior file byte-identical.
//   SA-R-101 kanban_card.status is plain TEXT (no CHECK) → signoff's scoped
//            UPDATE may write 'passed'. Crafted mapping (US-02 → FOREIGN card id)
//            asserts the WHERE id=? AND project_id=? re-scope blocks the
//            cross-project flip (F-4 pattern).
//   SA-R-102 /env is the fixed {env:null, reason:'not_deployed'} shape.
//   SA-R-103 coverage join: parseStoryAcs (stories.md) × qa_test.ac_refs;
//            stories without AC blocks contribute 0 rows without error.
//   SA-R-106 screenshots served by test id + step index only; unknown id,
//            out-of-range index, resolution-escaped or missing file → 404.
//   Signoff 409 unless all-pass; success flips cards + advances stage rows
//            (QA→done, Shipped→active) — DB-verified via probe files.
//   Run scope selector: bad scope 422 (spec message), unknown ticket 422.

import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAUNCHER = path.resolve(__dirname, '..');

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`✗ ${name}${detail ? `\n      ${String(detail).slice(0, 600)}` : ''}`);
    console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 600)}` : ''}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok, `expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
}

function freePort(start: number): Promise<number> {
  return new Promise((res) => {
    const probe = (p: number): void => {
      const s = net.createServer();
      s.once('error', () => probe(p + 1));
      s.once('listening', () => s.close(() => res(p)));
      s.listen(p, '127.0.0.1');
    };
    probe(start);
  });
}

function read(p: string): string {
  return fs.readFileSync(p, 'utf-8');
}

// ── Fixture content ──────────────────────────────────────────────────────────

const PRD_MD = `# PRD — QA Verify Fixture

## 8. Business requirements

- BR-001 | must | approved | BA | The QA surface must show a story's test outcomes against its acceptance criteria.
`;

const STORIES_MD = `# Stories — QA Verify Fixture

Generated from the requirements sprint.

### US-01 — Reserve a book
<!-- story: priority=must status=approved owner=BA origin=generated reqs=BR-001 -->
**As a librarian**, **I want to reserve a book with a pickup window**, **so that I can hold it for a borrower**.

## Acceptance Criteria
- AC-001 | The reserve form requires the book id.
- AC-002 | Reserved books show a pickup window.

### US-02 — Renew a loan
<!-- story: priority=must status=approved owner=BA origin=generated reqs=BR-001 -->
**As a librarian**, **I want to renew a loan once**, **so that a borrower keeps the book another cycle**.

## Acceptance Criteria
- AC-003 | The renew endpoint accepts one extension.

### US-03 — No AC block (SA-R-103 tolerance)
<!-- story: priority=should status=approved owner=BA origin=generated reqs=BR-001 -->
**As a librarian**, **I want the QA surface to tolerate stories with no acceptance criteria**.
`;

// Foreign project owns US-99 — must stay invisible to the fixture project.
const FOREIGN_STORIES_MD = `# Stories — Foreign Project

### US-99 — Foreign story
<!-- story: priority=should status=draft owner=BA origin=generated reqs=BR-001 -->
**As a tenant**, **I want my own story**, **so that I can prove IDOR scoping**.
`;

async function main(): Promise<void> {
  const port = await freePort(5298);
  const base = `http://127.0.0.1:${port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-verify-'));
  const fixtureDir = path.join(tmp, 'proj-fixture');
  const foreignDir = path.join(tmp, 'proj-foreign');
  const emptyDir = path.join(tmp, 'proj-empty');
  for (const d of [path.join(fixtureDir, 'PRD'), path.join(foreignDir, 'PRD'), emptyDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
  fs.writeFileSync(path.join(fixtureDir, 'PRD', 'prd.md'), PRD_MD);
  fs.writeFileSync(path.join(fixtureDir, 'PRD', 'stories.md'), STORIES_MD);
  fs.writeFileSync(path.join(foreignDir, 'PRD', 'stories.md'), FOREIGN_STORIES_MD);

  // Isolated server copy + node_modules link + isolated DB (never the dev DB).
  fs.symlinkSync(path.join(LAUNCHER, 'node_modules'), path.join(tmp, 'node_modules'), 'dir');
  fs.cpSync(path.join(LAUNCHER, 'server'), path.join(tmp, 'server'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'data'));

  // Seed: projects + confirmed context + two kanban_card rows. The fixture
  // mapping is written AFTER seeding because it embeds the seeded card ids —
  // incl. the FOREIGN card id for the crafted-mapping signoff probe.
  const seedPath = path.join(tmp, 'seed.mts');
  fs.writeFileSync(
    seedPath,
    `import { migrate, db } from './server/db.js';\n` +
      `migrate();\n` +
      `const ins = db.prepare("INSERT INTO project (name, slug, one_liner, folder_path, current_stage, status) VALUES (?, ?, ?, ?, 'QA', 'active')");\n` +
      `const fixtureId = Number(ins.run('QA Verify Fixture', 'qa-verify-fixture', 'fixture', ${JSON.stringify(fixtureDir)}).lastInsertRowid);\n` +
      `const foreignId = Number(ins.run('QA Verify Foreign', 'qa-verify-foreign', 'fixture', ${JSON.stringify(foreignDir)}).lastInsertRowid);\n` +
      `const emptyId = Number(ins.run('QA Verify Empty', 'qa-verify-empty', 'fixture', ${JSON.stringify(emptyDir)}).lastInsertRowid);\n` +
      `db.prepare("INSERT INTO ba_context (project_id, confirmed, confirmed_at) VALUES (?, 1, datetime('now'))").run(fixtureId);\n` +
      `db.prepare("INSERT INTO ba_context (project_id, confirmed, confirmed_at) VALUES (?, 1, datetime('now'))").run(foreignId);\n` +
      `db.prepare("INSERT INTO ba_context (project_id, confirmed, confirmed_at) VALUES (?, 1, datetime('now'))").run(emptyId);\n` +
      `const card = db.prepare("INSERT INTO kanban_card (project_id, ticket_key, title, column, priority, points, assignee_agent, status) VALUES (?, ?, ?, 'todo', 'high', 0, '', '')");\n` +
      `const sfx1 = Number(card.run(fixtureId, 'TM-1', 'Reserve a book').lastInsertRowid);\n` +
      `const fgn1 = Number(card.run(foreignId, 'TM-99', 'Foreign card').lastInsertRowid);\n` +
      `console.log('SEED_IDS ' + JSON.stringify({ fixture: fixtureId, foreign: foreignId, empty: emptyId, sfx1, fgn1 }));\n`,
  );
  const seedOut = execFileSync(path.join(LAUNCHER, 'node_modules', '.bin', 'tsx'), [seedPath], { cwd: LAUNCHER }).toString();
  const ids = JSON.parse(seedOut.match(/SEED_IDS (\{.*\})/)?.[1] ?? '{}') as {
    fixture: number;
    foreign: number;
    empty: number;
    sfx1: number;
    fgn1: number;
  };

  // story-gen mapping, written to the isolated copy's data dir. US-02's entry
  // deliberately points at the FOREIGN project's card id (fgn1): the signoff
  // probe asserts the kanban_card UPDATE cannot cross project_id and write
  // that card even with a crafted mapping (F-4 pattern).
  const mappingDir = path.join(tmp, 'data', 'story-gen');
  fs.mkdirSync(mappingDir, { recursive: true });
  fs.writeFileSync(
    path.join(mappingDir, `${ids.fixture}.mapping.json`),
    JSON.stringify({
      stories: [
        { us: 'US-01', ticketKey: 'TM-1', cardId: ids.sfx1 },
        { us: 'US-02', ticketKey: 'TM-2', cardId: ids.fgn1 },
      ],
    }),
  );

  const child = spawn(path.join(LAUNCHER, 'node_modules', '.bin', 'tsx'), [path.join(tmp, 'server', 'index.ts')], {
    cwd: LAUNCHER,
    env: { ...process.env, PORT: String(port), OLLAMA_HOST: 'http://127.0.0.1:9' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverErr: string[] = [];
  child.stderr.on('data', (d) => serverErr.push(String(d)));
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`server did not start: ${serverErr.join('')}`)), 20000);
    child.stdout.on('data', (d) => {
      if (String(d).includes('listening on')) {
        clearTimeout(t);
        res();
      }
    });
    child.once('exit', (c) => {
      clearTimeout(t);
      rej(new Error(`server exited early (${c}): ${serverErr.join('')}`));
    });
  });

  const reqFetch = async (p: string, init?: RequestInit): Promise<{ status: number; body: any }> => {
    const res = await fetch(`${base}${p}`, init);
    const ct = res.headers.get('content-type') ?? '';
    const body = ct.includes('json') ? await res.json() : await res.text();
    return { status: res.status, body };
  };
  const json = (p: string, method: string, body: unknown) =>
    reqFetch(p, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const slug = 'qa-verify-fixture';
  const foreignSlug = 'qa-verify-foreign';
  const emptySlug = 'qa-verify-empty';
  const testingDir = path.join(fixtureDir, 'testing');
  const evidenceDir = path.join(fixtureDir, 'qa-evidence');

  // Read a row from the isolated DB directly (probe file so the relative
  // './server/db.js' import resolves from tmp/).
  const dbGet = (sql: string, args: (string | number)[]): Record<string, unknown> | null => {
    const probePath = path.join(tmp, 'probe.mts');
    fs.writeFileSync(
      probePath,
      `import { db } from './server/db.js';\n` +
        `const r = db.prepare(${JSON.stringify(sql)}).get(...${JSON.stringify(args)});\n` +
        `console.log(JSON.stringify(r));\n`,
    );
    const out = execFileSync(path.join(LAUNCHER, 'node_modules', '.bin', 'tsx'), [probePath], { cwd: tmp, encoding: 'utf-8' });
    return tryParse(out.trim());
  };

  function tryParse(s: string): Record<string, unknown> | null {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  try {
    console.log(`\n[verify-qa] API on ${base}, fixture ${tmp}\n`);

    // ── List (qa-tab.html §Q: rows + stats feeds + missing flag) ────────
    let r = await reqFetch(`/api/projects/${slug}/qa/stories`);
    check('GET stories → 200', r.status === 200);
    eq('fixture list has US-01 + US-02 (+ AC-less US-03)', r.body.stories?.map((s: { storyId: string }) => s.storyId).sort(), ['US-01', 'US-02', 'US-03']);
    const us01 = r.body.stories?.find((s: { storyId: string }) => s.storyId === 'US-01');
    check('row links its kanban card ticket', us01 && us01.ticket_key === 'TM-1', JSON.stringify(us01));
    check('row defaults to Ready for QA pill', us01 && us01.qa_status === 'ready_for_qa' && us01.status_pill === 'Ready for QA', JSON.stringify(us01));
    eq('row empty tests_strip + coverage (AC-001/002 uncovered)', us01?.tests_strip, { pass: 0, fail: 0, skip: 0, flaky: 0, blocked: 0, total: 0 });
    eq('coverage fields present', us01?.coverage, { covered: 0, total: 2 });
    eq('latest_run null before any run', us01?.latest_run, null);
    check('dimension_summary has 3 lanes', r.body.dimension_summary?.length === 3 && r.body.dimension_summary.every((d: any) => d.total === 0), JSON.stringify(r.body.dimension_summary));
    check('US-02 shows crafted ticket TM-2 (card is foreign — fallback key)', r.body.stories?.find((s: { storyId: string }) => s.storyId === 'US-02')?.ticket_key === 'TM-2');
    eq('missing_stories false', r.body.missing_stories, false);

    r = await reqFetch(`/api/projects/${emptySlug}/qa/stories`);
    check('empty project → missing_stories true, 0 rows', r.status === 200 && r.body.missing_stories === true && r.body.stories.length === 0, JSON.stringify(r.body));

    // F-6: another project's story is invisible — scoped by project folder.
    r = await reqFetch(`/api/projects/${slug}/qa/stories`);
    check('foreign US-99 never appears in fixture list', !r.body.stories?.some((s: { storyId: string }) => s.storyId === 'US-99'));
    r = await reqFetch(`/api/projects/definitely-not-a-project/qa/stories`);
    check('unknown project → 400', r.status === 400);

    // ── F-SEC-1 membership (reads) + detail shape ──────────────────────────
    r = await reqFetch(`/api/projects/${slug}/qa/tests/US-01`);
    check('GET detail → 200', r.status === 200);
    check('detail story header', r.body.story?.storyId === 'US-01' && r.body.story?.title === 'Reserve a book' && r.body.story?.ticket_key === 'TM-1' && r.body.story?.qa_status === 'ready_for_qa', JSON.stringify(r.body.story));
    check('detail dimensions + runs + tests + notes empty on fresh project', r.body.dimensions?.length === 3 && r.body.runs?.length === 0 && r.body.tests?.length === 0 && r.body.notes?.length === 0, JSON.stringify(r.body));
    r = await reqFetch(`/api/projects/${slug}/qa/tests/US-99`);
    check('foreign storyId detail → 404 (scoped)', r.status === 404);
    r = await reqFetch(`/api/projects/${slug}/qa/tests/not-a-story`);
    check('non-US grammar storyId → 404', r.status === 404);
    r = await reqFetch(`/api/projects/${slug}/qa/runs/US-99`);
    check('foreign storyId runs → 404 (read membership)', r.status === 404);
    r = await reqFetch(`/api/projects/${slug}/qa/runs/US-01`);
    check('own storyId runs → 200 empty', r.status === 200 && r.body.runs?.length === 0);

    // ── SA-R-102 env ──────────────────────────────────────────────────────
    r = await reqFetch(`/api/projects/${slug}/qa/env`);
    eq('env is the fixed not-deployed shape', { env: r.body?.env, reason: r.body?.reason }, { env: null, reason: 'not_deployed' });

    // ── SA-R-103 coverage (AC-less US-03 tolerated → contributes 0) ───────
    r = await reqFetch(`/api/projects/${slug}/qa/coverage`);
    check('coverage total = 3 real ACs (US-03 AC-less contributes none)', r.body?.total === 3 && r.body?.covered_count === 0 && r.body?.untested_count === 3, JSON.stringify(r.body));
    eq('AC ids are US-01/02-bound (3 rows: AC-001, AC-002 from US-01, AC-003 from US-02)', r.body?.untested?.map((u: { ac: string; storyId: string }) => [u.ac, u.storyId]).sort(), [['AC-001', 'US-01'], ['AC-002', 'US-01'], ['AC-003', 'US-02']]);

    // ── F-SEC-2 rules (fixed allowlist; write-back disk-verified) ─────────
    r = await reqFetch(`/api/projects/${slug}/qa/rules`);
    check('GET rules (missing) → 3 empty files', r.status === 200 && Object.keys(r.body.files ?? {}).length === 3 && (r.body.files['qa-rules.md'] ?? 'X') === '' , JSON.stringify(r.body));
    const rulesBody = '# QA rules\n\n- Run the full suite before sign-off.\n';
    r = await json(`/api/projects/${slug}/qa/rules`, 'PUT', { file: 'qa-rules.md', content: rulesBody });
    check('PUT qa-rules.md → 200', r.status === 200 && r.body.ok === true && r.body.file === 'qa-rules.md' && r.body.size === rulesBody.length, JSON.stringify(r.body));
    check('PUT disk-verify: testing/qa-rules.md written byte-for-byte', fs.existsSync(path.join(testingDir, 'qa-rules.md')) && read(path.join(testingDir, 'qa-rules.md')) === rulesBody);
    r = await reqFetch(`/api/projects/${slug}/qa/rules`);
    check('GET echoes saved bytes', r.body?.files?.['qa-rules.md'] === rulesBody);
    r = await json(`/api/projects/${slug}/qa/rules`, 'PUT', { file: 'evil.md', content: 'x' });
    check('non-allowlist filename → 422', r.status === 422 && String(r.body?.error).includes('Unknown rules file'), JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/qa/rules`, 'PUT', { file: 'QA-AGENT.md', content: 42 });
    check('non-string content → 422', r.status === 422);
    // >2 MB content — the route cap (qa.ts) is defense-in-depth; the global
    // 1mb json gate (index.ts) pre-empts it over HTTP, so the honest HTTP
    // contract is 413. The write must not touch the saved file on disk.
    r = await json(`/api/projects/${slug}/qa/rules`, 'PUT', { file: 'QA-AGENT.md', content: 'x'.repeat(2 * 1024 * 1024 + 1) });
    check('oversized rules body → 413 (global gate)', r.status === 413 && r.body?.error === 'Payload too large.', JSON.stringify(r.body));
    check('rejected writes leave saved file byte-identical', read(path.join(testingDir, 'qa-rules.md')) === rulesBody);
    r = await json(`/api/projects/${slug}/qa/rules`, 'PUT', { file: 'QA-AGENT.md', content: 'agent brief' });
    check('PUT QA-AGENT.md → 200 (second allowlisted file)', r.status === 200 && fs.existsSync(path.join(testingDir, 'QA-AGENT.md')) && read(path.join(testingDir, 'QA-AGENT.md')) === 'agent brief');

    // ── Scope selector (B.12): 422s + queueing ────────────────────────────
    r = await json(`/api/projects/${slug}/qa/runs`, 'POST', { scope: 'bogus' });
    check('bad scope → 422 with spec message', r.status === 422 && r.body?.error === "Scope must be 'full', 'smoke', or 'story TM-NN'.", JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/qa/runs`, 'POST', { scope: 'story TM-999' });
    check('unknown ticket → 422', r.status === 422 && String(r.body?.error).includes('Unknown ticket TM-999'));
    r = await json(`/api/projects/${slug}/qa/runs`, 'POST', { scope: 'story TM-1' });
    check('story TM-1 → 200 queues 1 run (reverse mapping)', r.status === 200 && r.body?.runs?.length === 1 && r.body.runs[0]?.story_id === 'US-01' && r.body.runs[0]?.run_no === 1, JSON.stringify(r.body));
    r = await reqFetch(`/api/projects/${slug}/qa/tests/US-01`);
    check('queued story flips to in_qa + run history', r.body?.story?.qa_status === 'in_qa' && r.body?.runs?.length === 1 && r.body.runs[0]?.run_no === 1 && r.body.runs[0]?.trigger === 'manual' && r.body.runs[0]?.result === null, JSON.stringify(r.body?.story));
    // smoke/full queue only stories that already have a state row: US-01 has
    // one from the story trigger above; US-02/US-03 don't until triggered.
    r = await json(`/api/projects/${slug}/qa/runs`, 'POST', { scope: 'smoke' });
    check('smoke queues only stories with a state row (US-01, run_no 2)', r.status === 200 && r.body?.runs?.length === 1 && r.body.runs[0]?.story_id === 'US-01' && r.body.runs[0]?.run_no === 2, JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/qa/runs`, 'POST', { scope: 'story TM-2' });
    check('story TM-2 → 1 run (crafted mapping reverse lookup)', r.status === 200 && r.body?.runs?.length === 1 && r.body.runs[0]?.story_id === 'US-02', JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/qa/runs`, 'POST', { scope: 'full' });
    check('full spans every story with a state row (US-01 run_no 3, US-02 run_no 2)', r.status === 200 && r.body?.runs?.length === 2 && r.body.runs.every((x: any) => x.run_no >= 2), JSON.stringify(r.body));

    // ── Notes (F-SEC-1 membership on POST + plan storage purity) ──────────
    r = await json(`/api/projects/${slug}/qa/US-01/notes`, 'POST', { author: 'Will', body: 'Evidence: reserve form fails empty submission.' });
    check('plain-text note → 200 with default author', r.status === 200 && r.body.note?.author === 'Will' && r.body.note?.body?.includes('Evidence'), JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/qa/US-01/notes`, 'POST', { body: '<b>injected</b>' });
    check('note containing "<" → 422 (storage guaranteed plain-text)', r.status === 422 && r.body?.error === 'Notes are plain text only.', JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/qa/US-01/notes`, 'POST', { body: 'x'.repeat(10 * 1024 + 1) });
    check('>10 KB note → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/qa/US-99/notes`, 'POST', { body: 'sneak' });
    check('foreign storyId notes POST → 404 (membership)', r.status === 404);
    r = await reqFetch(`/api/projects/${slug}/qa/tests/US-01`);
    check('note persisted in detail thread', r.body?.notes?.length === 1 && r.body.notes[0]?.body?.includes('Evidence'));

    // ── Tests + screenshots (seed a pass test with a shot, SA-R-106) ──────
    // Direct insert (the QA agent runtime backfill is out of scope): a run for
    // the smoke run above is reused; two tests — one functional pass w/ shot,
    // one a11y fail w/ a traversal step shot.
    const seedTestsPath = path.join(tmp, 'seed-tests.mts');
    fs.writeFileSync(
      seedTestsPath,
      `import { db } from './server/db.js';\n` +
        `const run = db.prepare("SELECT id FROM qa_run WHERE project_id = ? AND story_id = 'US-01' ORDER BY run_no DESC LIMIT 1").get(${JSON.stringify(ids.fixture)});\n` +
        `const runId = run.id;\n` +
        `const ins = db.prepare("INSERT INTO qa_test (run_id, project_id, story_id, name, dimension, status, expected, actual, trace_path, steps, ac_refs) VALUES (?, ?, 'US-01', ?, ?, ?, ?, ?, ?, ?, ?)");\n` +
        `const t1 = Number(ins.run(runId, ${JSON.stringify(ids.fixture)}, 'Reserve form requires book id', 'functional', 'pass', 'Book id error shown', 'Book id error shown', null, JSON.stringify([{label:'open reserve form',status:'pass',shot:'shot-1.png'}]), JSON.stringify(['AC-001'])).lastInsertRowid);\n` +
        `const t2 = Number(ins.run(runId, ${JSON.stringify(ids.fixture)}, 'Reserve form keyboard path', 'a11y', 'fail', 'focus visible', 'focus lost', 'trace-a11y.json', JSON.stringify([{label:'tab into submit',status:'fail',shot:'../evil.txt'}]), JSON.stringify(['AC-002'])).lastInsertRowid);\n` +
        `console.log('SEED_TESTS ' + JSON.stringify({ runId, t1, t2 }));\n`,
    );
    const seedTestsOut = execFileSync(path.join(LAUNCHER, 'node_modules', '.bin', 'tsx'), [seedTestsPath], { cwd: tmp, encoding: 'utf-8' });
    const tests = JSON.parse(seedTestsOut.match(/SEED_TESTS (\{.*\})/)?.[1] ?? '{}') as { runId: number; t1: number; t2: number };

    // Write the real screenshot under qa-evidence so the served bytes match.
    fs.mkdirSync(evidenceDir, { recursive: true });
    const pngBytes = Buffer.from('iVBORw0KGgo=fake-png', 'utf-8');
    fs.writeFileSync(path.join(evidenceDir, 'shot-1.png'), pngBytes);

    r = await reqFetch(`/api/projects/${slug}/qa/tests/US-01`);
    check('detail tests wire rows against the latest run with acs', r.body?.tests?.length === 2 && r.body.tests.every((t: any) => t.run_no === r.body.runs[0].run_no && t.acs?.length === 1), JSON.stringify({ tests: r.body?.tests, latest: r.body?.runs?.[0]?.run_no }));
    check('pass test wires its screenshot URL (by id+step, never a raw path)', r.body?.tests?.find((t: any) => t.name.includes('Reserve form requires'))?.screenshots?.pass?.[0] === `/api/projects/${ids.fixture}/qa/screenshots/${tests.t1}/0`, JSON.stringify(r.body?.tests));
    check('fail test wires an issue screenshot', r.body?.tests?.find((t: any) => t.name.includes('keyboard'))?.screenshots?.issue?.[0] === `/api/projects/${ids.fixture}/qa/screenshots/${tests.t2}/0`);
    eq('dimension summary reflects the seed (functional 1 pass, a11y 1 fail)', r.body?.dimensions?.map((d: any) => [d.dimension, d.pass, d.fail]).sort(), [['a11y', 0, 1], ['fidelity', 0, 0], ['functional', 1, 0]]);

    r = await reqFetch(`/api/projects/${slug}/qa/coverage`);
    check('coverage now counts AC-001 + AC-002 covered, AC-003 untested', r.body?.covered_count === 2 && r.body?.untested_count === 1 && r.body?.covered?.[0]?.ac === 'AC-001' && r.body?.untested?.[0]?.ac === 'AC-003', JSON.stringify(r.body));

    // SA-R-106: serve by test id + step; unknown/out-of-range/escape/missing → 404.
    const shotRes = await fetch(`${base}/api/projects/${slug}/qa/screenshots/${tests.t1}/0`);
    check('screenshot by id → 200 with image/png bytes', shotRes.status === 200 && (shotRes.headers.get('content-type') ?? '').includes('image/png') && Buffer.from(await shotRes.arrayBuffer()).equals(pngBytes));
    r = await reqFetch(`/api/projects/${slug}/qa/screenshots/999999/0`);
    check('unknown test id → 404', r.status === 404);
    r = await reqFetch(`/api/projects/${slug}/qa/screenshots/${tests.t1}/5`);
    check('out-of-range step → 404', r.status === 404);
    r = await reqFetch(`/api/projects/${slug}/qa/screenshots/${tests.t2}/0`);
    check('resolution-escaped step shot ("../evil.txt") → 404 (SA-R-106)', r.status === 404);
    r = await reqFetch(`/api/projects/${ids.fixture}/qa/screenshots/${tests.t1}/nope`);
    check('non-integer step → 404', r.status === 404);

    // ── Signoff ───────────────────────────────────────────────────────────
    r = await json(`/api/projects/${slug}/qa/signoff`, 'POST', {});
    check('signoff with stories in flight → 409 + blocking list', r.status === 409 && Array.isArray(r.body?.blocking) && r.body.blocking.length > 0, JSON.stringify(r.body));

    // Flip all stories to passed via direct state update (the QA agent's
    // backfill is out of scope) — then signoff must advance the pipeline.
    const flipPath = path.join(tmp, 'flip.mts');
    fs.writeFileSync(
      flipPath,
      `import { db } from './server/db.js';\n` +
        `const up = db.prepare("INSERT INTO qa_story_state (project_id, story_id, status, rework_rounds) VALUES (?, ?, 'passed', 2) ON CONFLICT(project_id, story_id) DO UPDATE SET status = 'passed', rework_rounds = 2, updated_at = datetime('now')");\n` +
        `for (const s of ['US-01', 'US-02', 'US-03']) up.run(${JSON.stringify(ids.fixture)}, s);\n` +
        `console.log('FLIPPED');\n`,
    );
    execFileSync(path.join(LAUNCHER, 'node_modules', '.bin', 'tsx'), [flipPath], { cwd: tmp, encoding: 'utf-8' });

    r = await json(`/api/projects/${slug}/qa/signoff`, 'POST', {});
    check('signoff all-pass → 200 {ok,deployed}', r.status === 200 && r.body?.ok === true && r.body?.deployed === true, JSON.stringify(r.body));

    // SA-R-101 + F-4: fixture card flipped to passed; FOREIGN card untouched
    // even though the crafted mapping points US-02 at it.
    let row = dbGet('SELECT status FROM kanban_card WHERE id = ? AND project_id = ?', [ids.sfx1, ids.fixture]);
    eq('SA-R-101 fixture card status = passed', row?.status, 'passed');
    row = dbGet('SELECT status FROM kanban_card WHERE id = ? AND project_id = ?', [ids.fgn1, ids.foreign]);
    eq('F-4 foreign card status still empty', row?.status, '');
    // Stage rows advanced: QA done, Shipped active.
    row = dbGet('SELECT status FROM stage WHERE project_id = ? AND stage_key = ?', [ids.fixture, 'QA']);
    eq('stage QA done', row?.status, 'done');
    row = dbGet('SELECT status FROM stage WHERE project_id = ? AND stage_key = ?', [ids.fixture, 'Shipped']);
    eq('stage Shipped active', row?.status, 'active');
    // Rework round persists through signoff (US-01 was flipped with 2 rounds).
    row = dbGet('SELECT rework_rounds FROM qa_story_state WHERE project_id = ? AND story_id = ?', [ids.fixture, 'US-01']);
    eq('rework_rounds = 2', row?.rework_rounds, 2);

    // ── Tail: 400s on garbage project ids for every scoped family ────────
    const tailBadProject = async (p: string, init?: RequestInit) => {
      const res = await reqFetch(`/api/projects/zzz-not-real/qa${p}`, init);
      check(`unknown project → 400 for /qa${p}`, res.status === 400, `status=${res.status}`);
    };
    await tailBadProject('/stories');
    await tailBadProject('/rules'); // GET
    await tailBadProject('/env');
    await tailBadProject('/coverage');
    await tailBadProject('/runs/US-01');
    await tailBadProject('/tests/US-01');
    await tailBadProject('/screenshots/1/0');
    await tailBadProject('/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'full' }) });
    await tailBadProject('/signoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  } finally {
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`\n[verify-qa] ${passed} checks passed, ${failures.length} failures`);
  if (failures.length) {
    console.log(failures.join('\n'));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[verify-qa] fatal: ${err?.stack ?? err}`);
  process.exit(1);
});
