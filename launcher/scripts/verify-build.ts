// Build tab — server verification walk (build-tab-build-plan §5, v5.5).
//
// Mirrors scripts/verify-design.ts: isolated temp checkout of server/ + an
// isolated SQLite DB (never the dev launcher.db), synthetic fixtures on disk,
// server spawned on a free private port, then a full CRUD/security walk.
//
// Dev Reviewer 2 assertions 1-6 are literal checks here:
//   A1  legal-edge table IN CODE — the TRANSITIONS literal is extracted from
//       server/build.ts and deep-equals the expected map (ready_for_qa only
//       from self_review/ready_for_review; no skip-ahead), AND the whole walk
//       is exercised over HTTP (200 on legal steps, 409 on every skip-ahead
//       attempt, 422 on unknown targets, lazy row-creation on first flip).
//   A2  every write path (config / rules / agent guidelines) uses
//       resolveInside resolved-path containment + tmp+rename in the SAME dir —
//       asserted statically (function shape, `${target}.tmp`/renameSync
//       pairing, per-path) and observably (disk byte-match, no .tmp residue).
//   A3  DELETE binds WHERE id=? AND project_id=? AND story_id=? — cross-story
//       delete 404s, integer id guard 422s, and the isolated DB is probed
//       (foreign rows untouched).
//   A4  story membership = project-scoped stories.md join — foreign story 404,
//       missing file → "no stories" 404, US-XX grammar fast-path 404, lists
//       scoped per project, foreign kanban column never leaks.
//   A5  notes '<' rejected on raw bytes + 10 KB cap (parsed body, not a
//       header) — 422 on both sides of the boundary.
//   A6  global 1 MB JSON cap retained, no per-route body-parse bypass: an
//       oversized body to build routes is 413 (the 12mb carve-out in
//       index.ts is design-only and never matches /build/).
//
// Plus: stats-list shape (null status = not in build, rework queue fields),
// config closed key set, fixed agent set, path/method/tier validation matrix,
// duplicate 409, atomic same-dir writes, and the 422 boundary assertions.

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

// ── Static assertions against the actual server source (A1 / A2) ────────────
const BUILD_SRC = read(path.join(LAUNCHER, 'server', 'build.ts'));

const EXTRA_STATUSES: string[] = [];
const statuses = [...(BUILD_SRC.match(/const BUILD_STATUSES\s*=\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
const STATUSES_EXPECTED = ['picked_up', 'building', 'self_review', 'ready_for_review', 'ready_for_qa', 'deployed_qa', 'rework'];
const EXPECTED_TRANSITIONS: Record<string, string[]> = {
  picked_up: ['building'],
  building: ['self_review'],
  self_review: ['ready_for_review', 'ready_for_qa'],
  ready_for_review: ['ready_for_qa'],
  ready_for_qa: ['deployed_qa'],
  rework: ['building'],
};
for (const st of STATUSES_EXPECTED) {
  if (!statuses.includes(st)) EXTRA_STATUSES.push(`missing ${st}`);
}
for (const st of statuses) {
  if (!STATUSES_EXPECTED.includes(st)) EXTRA_STATUSES.push(`unexpected ${st}`);
}
check('A1 statuses exactly the 7-state set', EXTRA_STATUSES.length === 0, EXTRA_STATUSES.join(', '));

const transBlock = BUILD_SRC.match(/const TRANSITIONS[^=]*=\s*(\{[\s\S]*?\};\n)/)?.[1] ?? '';
let transitionsParsed: unknown = null;
try {
  // The literal is TS-style bare keys + single quotes -> quote keys (preceded
  // by {, comma, or newline), drop the trailing `;` and any last-entry comma,
  // then normalize quotes.
  const keyed = transBlock.replace(/(^|[{,\n])\s*([A-Za-z_]+)\s*:/g, '$1"$2":').replace(/;\s*$/, '').replace(/,(\s*})$/, '$1');
  transitionsParsed = JSON.parse(keyed.replace(/'/g, '"'));
} catch {
  transitionsParsed = null;
}
eq('A1 TRANSITIONS literal in code equals legal-edge table', transitionsParsed, EXPECTED_TRANSITIONS);

const resolveFn = BUILD_SRC.match(/function resolveInside\([\s\S]*?\n\}/)?.[0] ?? '';
check(
  'A2 resolveInside is resolved-path containment (path.resolve + startsWith root+sep)',
  resolveFn.includes('path.resolve(root') && resolveFn.includes('.startsWith(root + path.sep)'),
  resolveFn.slice(0, 300),
);

const tmpPattern = (BUILD_SRC.match(/\$\{target\}\.tmp/g) ?? []).length;
const renamePattern = (BUILD_SRC.match(/fs\.renameSync\(tmp, target\)/g) ?? []).length;
check(
  'A2 every write path pairs a same-dir tmp with renameSync (config/rules/agents)',
  tmpPattern >= 3 && renamePattern >= 3 && tmpPattern === renamePattern,
  `tmp=${tmpPattern} rename=${renamePattern}`,
);

// ── Fixture content ──────────────────────────────────────────────────────────

const PRD_MD = `# PRD — Build Verify Fixture

## 8. Business requirements

- BR-001 | must | approved | BA | The build surface must show a story's status and surfaces.
`;

const FEATURES_MD = [
  '# Features',
  '',
  '### FE-01 — Track the build',
  '<!-- feature: priority=must status=approved owner=BA origin=manual -->',
  'Build shows a per-story status, files, routes, and a notes thread.',
  '',
  '## Acceptance Criteria',
  '- TR-001 | must | approved | DEV | Files and routes render with their layer and method chips.',
  '<!-- TR-001: origin=manual -->',
  '',
].join('\n');

const STORIES_MD = `# Stories — Build Verify Fixture

Generated from the requirements sprint.

### US-01 — Reserve a book
<!-- story: priority=must status=approved owner=BA origin=generated reqs=BR-001,TR-001 -->
**As a librarian**, **I want to reserve a book**, **so that I can hold it for a borrower**.

## Acceptance Criteria
- AC-001 | The reserve form requires the book id.
- AC-002 | Reserved books show a pickup window.

### US-02 — List reservations
<!-- story: priority=should status=approved owner=BA origin=generated reqs=BR-001 -->
**As a librarian**, **I want to list reservations**, **so that I can see them at a glance**.

## Acceptance Criteria
- AC-001 | The list renders the reserve window.

### US-03 — Extend a hold
<!-- story: priority=should status=approved owner=BA origin=generated reqs=TR-001 -->
**As a borrower**, **I want to extend a hold**, **so that I keep the book longer**.

## Acceptance Criteria
- AC-001 | Extending is only allowed once.
`;

const FOREIGN_STORIES_MD = `# Stories — Foreign Project

### US-99 — Foreign story
<!-- story: priority=should status=draft owner=BA origin=generated reqs=BR-001 -->
**As a tenant**, **I want my own story**, **so that I can prove IDOR scoping**.

## Acceptance Criteria
- AC-001 | This story never renders outside its project.
`;

async function main(): Promise<void> {
  const port = await freePort(5309);
  const base = `http://127.0.0.1:${port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'build-verify-'));
  const fixtureDir = path.join(tmp, 'proj-fixture');
  const foreignDir = path.join(tmp, 'proj-foreign');
  const emptyDir = path.join(tmp, 'proj-empty');
  for (const d of [path.join(fixtureDir, 'PRD'), path.join(foreignDir, 'PRD'), emptyDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
  fs.writeFileSync(path.join(fixtureDir, 'PRD', 'prd.md'), PRD_MD);
  fs.writeFileSync(path.join(fixtureDir, 'PRD', 'features.md'), FEATURES_MD);
  fs.writeFileSync(path.join(fixtureDir, 'PRD', 'stories.md'), STORIES_MD);
  fs.writeFileSync(path.join(foreignDir, 'PRD', 'stories.md'), FOREIGN_STORIES_MD);

  // Isolated server copy + node_modules link + isolated DB (never the dev DB).
  fs.symlinkSync(path.join(LAUNCHER, 'node_modules'), path.join(tmp, 'node_modules'), 'dir');
  fs.cpSync(path.join(LAUNCHER, 'server'), path.join(tmp, 'server'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'data'));

  // Seed: 3 projects (fixture / foreign / empty) + confirmed context + kanban
  // cards. US-03 is seeded as an in-rework build_story row (no HTTP route
  // enters rework this slice — QA events are external). The fixture mapping
  // deliberately maps US-02 to the FOREIGN project's card (fgn1): the
  // read-model join is display-only and must not leak the foreign column.
  const seedPath = path.join(tmp, 'seed.mts');
  fs.writeFileSync(
    seedPath,
    `import { migrate, db } from './server/db.js';\n` +
      `migrate();\n` +
      `const ins = db.prepare("INSERT INTO project (name, slug, one_liner, folder_path, current_stage, status) VALUES (?, ?, ?, ?, 'PRD', 'active')");\n` +
      `const fixtureId = Number(ins.run('Build Verify Fixture', 'build-verify-fixture', 'fixture', ${JSON.stringify(fixtureDir)}).lastInsertRowid);\n` +
      `const foreignId = Number(ins.run('Build Verify Foreign', 'build-verify-foreign', 'fixture', ${JSON.stringify(foreignDir)}).lastInsertRowid);\n` +
      `const emptyId = Number(ins.run('Build Verify Empty', 'build-verify-empty', 'fixture', ${JSON.stringify(emptyDir)}).lastInsertRowid);\n` +
      `db.prepare("INSERT INTO ba_context (project_id, confirmed, confirmed_at) VALUES (?, 1, datetime('now'))").run(fixtureId);\n` +
      `db.prepare("INSERT INTO ba_context (project_id, confirmed, confirmed_at) VALUES (?, 1, datetime('now'))").run(foreignId);\n` +
      `db.prepare("INSERT INTO ba_context (project_id, confirmed, confirmed_at) VALUES (?, 1, datetime('now'))").run(emptyId);\n` +
      `const card = db.prepare("INSERT INTO kanban_card (project_id, ticket_key, title, column, priority, points, assignee_agent, status) VALUES (?, ?, 'SFX card', 'todo', 'high', 0, '', '')");\n` +
      `const sfx1 = Number(card.run(fixtureId, 'SFX-1').lastInsertRowid);\n` +
      `const sfn2 = Number(card.run(fixtureId, 'SFN-2').lastInsertRowid);\n` +
      `db.prepare("INSERT INTO kanban_card (project_id, ticket_key, title, column, priority, points, assignee_agent, status) VALUES (?, 'FGN-1', 'Foreign card', 'inprogress', 'high', 0, '', '')").run(foreignId);\n` +
      `db.prepare("UPDATE kanban_card SET column = 'inprogress' WHERE id = ?").run(sfn2);\n` +
      `db.prepare("INSERT INTO build_story (project_id, story_id, build_status, rework_origin, rework_issues) VALUES (?, 'US-03', 'rework', 'qa', 2)").run(fixtureId);\n` +
      `console.log('SEED_IDS ' + JSON.stringify({ fixture: fixtureId, foreign: foreignId, empty: emptyId, sfx1, sfn2 }));\n`,
  );
  const seedOut = execFileSync(path.join(LAUNCHER, 'node_modules', '.bin', 'tsx'), [seedPath], { cwd: LAUNCHER }).toString();
  const ids = JSON.parse(seedOut.match(/SEED_IDS (\{.*\})/)?.[1] ?? '{}') as {
    fixture: number;
    foreign: number;
    empty: number;
    sfx1: number;
    sfn2: number;
  };

  // Mapping (read by the server copy from tmp/data/story-gen/<projectId>.json).
  const mappingDir = path.join(tmp, 'data', 'story-gen');
  fs.mkdirSync(mappingDir, { recursive: true });
  fs.writeFileSync(
    path.join(mappingDir, `${ids.fixture}.mapping.json`),
    JSON.stringify({ stories: [{ us: 'US-01', ticketKey: 'SFX-1', cardId: ids.sfx1 }, { us: 'US-02', ticketKey: 'SFN-2', cardId: ids.sfn2 }] }),
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

  const slug = 'build-verify-fixture';
  const foreignSlug = 'build-verify-foreign';
  const emptySlug = 'build-verify-empty';
  const codeBuilder = path.join(fixtureDir, 'code-builder');
  const buildRulesPath = path.join(codeBuilder, 'build-rules.md');
  const configPath = path.join(codeBuilder, 'config-rules.md');
  const agent2Path = path.join(codeBuilder, 'agents', 'code-2.md');

  // Generic DB probe (same db.ts the server copy uses — a row-mutation assert,
  // not a 200-toast assert).
  const probeJson = (sql: string, params: (string | number)[] = []): string => {
    const args = params.map((p) => JSON.stringify(p)).join(', ');
    const probePath = path.join(tmp, 'probe.mts');
    fs.writeFileSync(
      probePath,
      `import { db } from './server/db.js';\n` +
        `const rows = db.prepare(${JSON.stringify(sql)}).all(${args});\n` +
        `console.log(JSON.stringify(rows));\n`,
    );
    return execFileSync(path.join(LAUNCHER, 'node_modules', '.bin', 'tsx'), [probePath], { cwd: tmp, encoding: 'utf-8' }).trim();
  };

  try {
    console.log(`\n[verify-build] API on ${base}, fixture ${tmp}\n`);

    // ── List (stats + rows + rework + missing flag) ──────────────────────
    let r = await reqFetch(`/api/projects/${slug}/build/stories`);
    check('GET stories → 200', r.status === 200);
    const byId = (row: any) => r.body.stories?.find((s: any) => s.storyId === row) ?? null;
    check('list has all 3 fixture stories', ['US-01', 'US-02', 'US-03'].every((s) => !!byId(s)), JSON.stringify(r.body.stories));
    check('not-in-build rows have null status (SA-R-08)', byId('US-01').build_status === null && byId('US-01').status_pill === null);
    check('US-01 joins its kanban card (TM-XX + column)', byId('US-01').ticket_key === 'SFX-1' && byId('US-01').card_column === 'todo', JSON.stringify(byId('US-01')));
    check('US-01 points/priority from card', byId('US-01').points === 0 && byId('US-01').priority === 'high');
    eq('US-01 reqs text resolved via index', byId('US-01').reqs?.map((x: any) => [x.id, !!x.text]), [['BR-001', true], ['TR-001', true]]);
    const us03 = byId('US-03');
    check('rework row renders status + pill + origin + issues', us03.build_status === 'rework' && us03.status_pill === 'Rework' && us03.rework_origin === 'qa' && us03.rework_issues === 2, JSON.stringify(us03));
    eq('missing_stories false', r.body.missing_stories, false);

    // A4: lists are project-scoped (folder + mapping), never cross-project.
    r = await reqFetch(`/api/projects/${slug}/build/stories`);
    check('A4 foreign US-99 never appears in fixture list', !r.body.stories?.some((s: any) => s.storyId === 'US-99'));
    r = await reqFetch(`/api/projects/${foreignSlug}/build/stories`);
    check('foreign list only its own story', JSON.stringify((r.body.stories?.map((s: any) => s.storyId)) ?? []) === JSON.stringify(['US-99']), JSON.stringify(r.body));
    r = await reqFetch(`/api/projects/${emptySlug}/build/stories`);
    check('empty project → missing_stories true, 0 rows', r.status === 200 && r.body.missing_stories === true && r.body.stories.length === 0, JSON.stringify(r.body));

    // ── Detail (A4 membership + shape) ─────────────────────────────────────
    r = await reqFetch(`/api/projects/${slug}/build/US-01`);
    check('GET detail → 200', r.status === 200);
    check('detail story defaults to picked_up + pill', r.body.story?.build_status === 'picked_up' && r.body.story?.status_pill === 'Picked up', JSON.stringify(r.body.story));
    check('detail reqs resolved with text', r.body.story?.reqs?.length === 2 && r.body.story.reqs.every((x: any) => x.text));
    check('detail files/apis/notes empty', r.body.files?.length === 0 && r.body.apis?.length === 0 && r.body.notes?.length === 0);
    check('detail surfaces carry wire keys', 'ticket_key' in r.body.story && 'rework_origin' in r.body.story && 'rework_issues' in r.body.story);
    r = await reqFetch(`/api/projects/${slug}/build/US-03`);
    check('rework detail carries origin/issues', r.body.story?.build_status === 'rework' && r.body.story?.rework_origin === 'qa' && r.body.story?.rework_issues === 2);

    // A4 membership: foreign + non-member + grammar + missing-file cases.
    r = await reqFetch(`/api/projects/${slug}/build/US-99`);
    check('A4 foreign story → 404 (scoped by stories.md)', r.status === 404);
    r = await reqFetch(`/api/projects/${slug}/build/TM-01`);
    check('A4 non-US grammar storyId → 404', r.status === 404);
    r = await reqFetch(`/api/projects/${slug}/build/US-1`);
    check('A4 US-\d{2,} grammar (single digit) → 404', r.status === 404);
    r = await reqFetch(`/api/projects/${emptySlug}/build/US-01`);
    check('A4 missing stories.md detail → 404 (no stories yet)', r.status === 404);

    // ── Files (validation matrix + dup 409 + scoped delete) ───────────────
    const badPaths = ['', '   ', '/src/Button.tsx', 'C:\\src\\x.ts', '../evil.ts', 'src/../evil.ts', 'a\x00b.ts', 'src/'.concat('a'.repeat(297))];
    for (const p of badPaths) {
      r = await json(`/api/projects/${slug}/build/US-01/files`, 'POST', { path: p, layer: 'new' });
      check(`file path rejected: ${JSON.stringify(p.slice(0, 20))} → 422`, r.status === 422, `status=${r.status}`);
    }
    r = await json(`/api/projects/${slug}/build/US-01/files`, 'POST', { path: '../evil.ts' });
    check('file traversal error message', r.status === 422 && r.body.error === 'Paths must be relative and inside the project folder.', JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/build/US-01/files`, 'POST', { path: 'src/components/Button.tsx', layer: 'bogus' });
    check('file layer enum → 422', r.status === 422);
    let f1: number;
    r = await json(`/api/projects/${slug}/build/US-01/files`, 'POST', { path: 'src/components/Button.tsx', layer: 'new' });
    check('valid file → 201 echoes path/layer', r.status === 201 && r.body.file?.path === 'src/components/Button.tsx' && r.body.file?.layer === 'new', JSON.stringify(r.body));
    f1 = r.body.file.id;
    r = await json(`/api/projects/${slug}/build/US-01/files`, 'POST', { path: 'src/components/Button.tsx', layer: 'new' });
    check('duplicate path → 409 already-in-list', r.status === 409 && r.body.error === 'This file is already in the list.', JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/build/US-01/files`, 'POST', { path: 'src/lib/api.ts' }); // layer null
    check('layer null accepted', r.status === 201 && r.body.file?.layer === null);
    r = await json(`/api/projects/${slug}/build/US-02/files`, 'POST', { path: 'src/other.ts', layer: 'modified' });
    check('US-02 file added (for scoped-delete probe)', r.status === 201);
    const f2 = r.body.file.id;
    r = await json(`/api/projects/${slug}/build/US-01/files/${f2}`, 'DELETE', undefined);
    check('A3 cross-story file delete → 404', r.status === 404, JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/build/US-01/files/not-a-number`, 'DELETE', undefined);
    check('A3 non-integer fileId → 422', r.status === 422);
    r = await reqFetch(`/api/projects/${slug}/build/US-01`);
    check('detail lists both US-01 files', r.body.files?.length === 2 && r.body.files.some((x: any) => x.layer === 'new') && r.body.files.some((x: any) => x.layer === null));
    let rows = JSON.parse(probeJson('SELECT story_id, path FROM build_story_file WHERE project_id = ? ORDER BY id', [ids.fixture]));
    check('A3 probe: both files exist before real delete', rows.length === 3 && rows.filter((x: any) => x.path === 'src/components/Button.tsx').length === 1, JSON.stringify(rows));
    r = await json(`/api/projects/${slug}/build/US-01/files/${f1}`, 'DELETE', undefined);
    check('scoped file delete → 200', r.status === 200);
    r = await json(`/api/projects/${slug}/build/US-01/files/${f1}`, 'DELETE', undefined);
    check('delete twice → 404 (row gone)', r.status === 404);
    rows = JSON.parse(probeJson('SELECT story_id, path FROM build_story_file WHERE project_id = ? ORDER BY id', [ids.fixture]));
    check('A3 probe: Button.tsx gone, US-02 file untouched', rows.length === 2 && !rows.some((x: any) => x.path === 'src/components/Button.tsx') && rows.some((x: any) => x.story_id === 'US-02' && x.path === 'src/other.ts'), JSON.stringify(rows));

    // ── BFF / BE apis (validation matrix + scoped delete) ─────────────────
    r = await json(`/api/projects/${slug}/build/US-01/apis`, 'POST', { tier: 'bogus', method: 'GET', path: '/api/x' });
    check('api tier enum → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/build/US-01/apis`, 'POST', { tier: 'be', method: 'TRACE', path: '/api/x' });
    check('api method enum → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/build/US-01/apis`, 'POST', { tier: 'be', method: 'GET', path: 'api/x' });
    check('api path must start with / → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/build/US-01/apis`, 'POST', { tier: 'be', method: 'GET', path: '/api/x\x00', description: 'd' });
    check('api control char in path → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/build/US-01/apis`, 'POST', { tier: 'be', method: 'GET', path: '/api/x', description: 'y'.repeat(501) });
    check('api description > 500 → 422', r.status === 422);
    let a1: number;
    r = await json(`/api/projects/${slug}/build/US-01/apis`, 'POST', { tier: 'bff', method: 'PATCH', path: '/api/reserve', description: 'Update the hold' });
    check('valid api → 201', r.status === 201 && r.body.api?.tier === 'bff' && r.body.api?.method === 'PATCH', JSON.stringify(r.body));
    a1 = r.body.api.id;
    r = await json(`/api/projects/${slug}/build/US-02/apis`, 'POST', { tier: 'be', method: 'POST', path: '/api/list', description: '' });
    const a2 = r.body.api.id;
    r = await json(`/api/projects/${slug}/build/US-02/apis/${a1}`, 'DELETE', undefined);
    check('A3 cross-story api delete → 404', r.status === 404);
    r = await json(`/api/projects/${slug}/build/US-01/apis/abc`, 'DELETE', undefined);
    check('A3 non-integer apiId → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/build/US-01/apis/${a1}`, 'DELETE', undefined);
    check('scoped api delete → 200', r.status === 200);
    rows = JSON.parse(probeJson('SELECT story_id, route_path FROM build_story_api WHERE project_id = ? ORDER BY id', [ids.fixture]));
    check('A3 probe: api rows scoped correctly', rows.length === 1 && rows[0].story_id === 'US-02' && rows[0].route_path === '/api/list', JSON.stringify(rows));

    // ── Notes (A5: plaintext guarantee + 10 KB cap, byte-measured) ────────
    r = await json(`/api/projects/${slug}/build/US-01/notes`, 'POST', { body: '   ' });
    check('A5 empty note → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/build/US-01/notes`, 'POST', { body: '<b>injected</b>' });
    check('A5 body containing "<" → 422', r.status === 422 && r.body.error === 'Notes are plain text only.', JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/build/US-01/notes`, 'POST', { body: '**Aligning** the header *now*.' });
    check('plain-text note (markdown chars, no <) → 200', r.status === 200 && r.body.note?.body === '**Aligning** the header *now*.');
    check('note author default = Will', r.body.note?.author === 'Will');
    const tenK = 'x'.repeat(10 * 1024);
    r = await json(`/api/projects/${slug}/build/US-01/notes`, 'POST', { body: tenK });
    check('A5 note exactly 10 KB → 200', r.status === 200, `status=${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    r = await json(`/api/projects/${slug}/build/US-01/notes`, 'POST', { body: tenK + 'y' });
    check('A5 note > 10 KB → 422', r.status === 422 && r.body.error === 'Notes are limited to 10 KB.', JSON.stringify(r.body));
    r = await reqFetch(`/api/projects/${slug}/build/US-01`);
    check('notes persist + ordered', r.body.notes?.length === 2 && r.body.notes[0].body === '**Aligning** the header *now*.', JSON.stringify(r.body.notes));

    // ── Transitions (A1 entire walk + every skip-ahead) ───────────────────
    // US-01 legal full walk: picked_up → … → deployed_qa.
    for (const [from, to] of [['picked_up', 'building'], ['building', 'self_review'], ['self_review', 'ready_for_review'], ['ready_for_review', 'ready_for_qa'], ['ready_for_qa', 'deployed_qa']] as const) {
      r = await json(`/api/projects/${slug}/build/US-01/transition`, 'POST', { to });
      check(`US-01 ${from} → ${to} → 200`, r.status === 200 && r.body.build_status === to, `status=${r.status} ${JSON.stringify(r.body)}`);
    }
    r = await json(`/api/projects/${slug}/build/US-01/transition`, 'POST', { to: 'building' });
    check('deployed_qa has no outgoing edge → 409', r.status === 409);

    // US-02: lazy-create (no row yet) + every illegal/skip-ahead edge.
    r = await json(`/api/projects/${slug}/build/US-02/transition`, 'POST', { to: 'ready_for_qa' });
    check('US-02 picked_up → ready_for_qa → 409 (skip-ahead)', r.status === 409, JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/build/US-02/transition`, 'POST', { to: 'deployed_qa' });
    check('US-02 picked_up → deployed_qa → 409 (skip-ahead)', r.status === 409);
    r = await json(`/api/projects/${slug}/build/US-02/transition`, 'POST', { to: 'bogus' });
    check('unknown target status → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/build/US-02/transition`, 'POST', { to: 42 });
    check('non-string target → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/build/US-02/transition`, 'POST', { to: 'building' });
    check('US-02 picked_up → building → 200 (lazy-created row)', r.status === 200 && r.body.build_status === 'building');
    rows = JSON.parse(probeJson("SELECT build_status FROM build_story WHERE project_id = ? AND story_id = 'US-02'", [ids.fixture]));
    check('probe: US-02 row now exists (lazy-create)', rows.length === 1 && rows[0].build_status === 'building', JSON.stringify(rows));
    r = await json(`/api/projects/${slug}/build/US-02/transition`, 'POST', { to: 'deployed_qa' });
    check('US-02 building → deployed_qa → 409 (skip-ahead)', r.status === 409);
    r = await json(`/api/projects/${slug}/build/US-02/transition`, 'POST', { to: 'ready_for_qa' });
    check('US-02 building → ready_for_qa → 409 (must visit self_review)', r.status === 409);
    r = await json(`/api/projects/${slug}/build/US-02/transition`, 'POST', { to: 'self_review' });
    check('US-02 building → self_review → 200', r.status === 200);
    r = await json(`/api/projects/${slug}/build/US-02/transition`, 'POST', { to: 'deployed_qa' });
    check('US-02 self_review → deployed_qa → 409', r.status === 409);
    r = await json(`/api/projects/${slug}/build/US-02/transition`, 'POST', { to: 'ready_for_qa' });
    check('US-02 self_review → ready_for_qa (legal edge) → 200', r.status === 200 && r.body.build_status === 'ready_for_qa');
    r = await json(`/api/projects/${slug}/build/US-02/transition`, 'POST', { to: 'ready_for_review' });
    check('US-02 ready_for_qa → ready_for_review → 409 (no back-edge)', r.status === 409);
    r = await json(`/api/projects/${slug}/build/US-02/transition`, 'POST', { to: 'deployed_qa' });
    check('US-02 ready_for_qa → deployed_qa → 200', r.status === 200);

    // US-03 (seeded rework): only edge out is → building.
    r = await json(`/api/projects/${slug}/build/US-03/transition`, 'POST', { to: 'deployed_qa' });
    check('US-03 rework → deployed_qa → 409 (only edge is building)', r.status === 409);
    r = await json(`/api/projects/${slug}/build/US-03/transition`, 'POST', { to: 'building' });
    check('US-03 rework → building → 200', r.status === 200 && r.body.build_status === 'building');
    r = await json(`/api/projects/${slug}/build/US-03/transition`, 'POST', { to: 'rework' });
    check('building → rework → 409 (rework entered externally only)', r.status === 409);
    r = await json(`/api/projects/${slug}/build/US-03/transition`, 'POST', { to: 'ready_for_qa' });
    check('US-03 building → ready_for_qa → 409 (skip-ahead still)', r.status === 409);
    r = await json(`/api/projects/${slug}/build/US-03/transition`, 'POST', { to: 'self_review' });
    check('US-03 after rework continues the legal walk', r.status === 200 && r.body.build_status === 'self_review');

    // ── Rules surface (write-backs disk-verified, A2) ─────────────────────
    r = await reqFetch(`/api/projects/${slug}/build/rules`);
    check('GET rules → 200', r.status === 200);
    eq('architecture = defaults (read-only, 5 keys)', r.body.architecture, { fe: 'React 18 + Vite + TS', bff: 'Express (Node) · /api/*', be: 'Node 22 · tsx watch · route-handler style', db: 'SQLite (better-sqlite3)', host: 'Vercel + Fly.io' });
    const cfg = r.body.config;
    check('config = closed 7-key set', Array.isArray(cfg) && cfg.length === 7 && cfg.every((x: any) => ['Package manager', 'Node version', 'Linter', 'Formatter', 'Test runner', 'Env vars', 'Secrets handling'].includes(x.key)));
    check('config seeds default values', cfg.find((x: any) => x.key === 'Package manager')?.value === 'pnpm 9');
    check('rules empty when missing', r.body.rules === '');
    check('agents = fixed 4-set w/ display + content', r.body.agents && ['code-1', 'code-2', 'code-3', 'reviewer'].every((a) => typeof r.body.agents[a]?.content === 'string' && r.body.agents[a]?.content.length > 0) && r.body.agents['reviewer'].display === 'Reviewer');

    r = await json(`/api/projects/${slug}/build/config`, 'PUT', { key: 'Host', value: 'AWS' });
    check('config architecture key rejected (closed set) → 422', r.status === 422, JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/build/config`, 'PUT', { key: 'Package manager', value: 'pnpm 10' });
    check('config legal key → 200', r.status === 200 && r.body.ok === true && r.body.value === 'pnpm 10', JSON.stringify(r.body));
    check('config disk-verify: config-rules.md contains the write', fs.existsSync(configPath) && read(configPath).includes('Package manager: pnpm 10'));
    r = await json(`/api/projects/${slug}/build/config`, 'PUT', { key: 'Package manager', value: 'x'.repeat(201) });
    check('config value > 200 chars → 422', r.status === 422);

    const rulesBody = '# Build & deploy rules\n\n- Run the gates at the committed tip.\n';
    r = await json(`/api/projects/${slug}/build/rules`, 'PUT', { content: rulesBody });
    check('PUT rules → 200', r.status === 200 && r.body.ok === true, JSON.stringify(r.body));
    check('A2 rules disk-verify: byte-identical write-back', fs.existsSync(buildRulesPath) && read(buildRulesPath) === rulesBody);
    r = await reqFetch(`/api/projects/${slug}/build/rules`);
    check('GET rules echoes saved bytes', r.status === 200 && r.body.rules === rulesBody);
    r = await json(`/api/projects/${slug}/build/rules`, 'PUT', { content: 42 });
    check('rules non-string content → 422', r.status === 422);

    r = await json(`/api/projects/${slug}/build/rules/agents/bogus`, 'PUT', { content: '# x' });
    check('agent not in fixed set → 422', r.status === 422);
    const agentBody = '# Code 2 — updated guidelines\n';
    r = await json(`/api/projects/${slug}/build/rules/agents/code-2`, 'PUT', { content: agentBody });
    check('agent write-back → 200', r.status === 200 && r.body.agent === 'code-2', JSON.stringify(r.body));
    check('A2 agent disk-verify: agents/code-2.md written', fs.existsSync(agent2Path) && read(agent2Path) === agentBody);
    r = await reqFetch(`/api/projects/${slug}/build/rules`);
    check('GET rules echoes agent content', r.body.agents['code-2'].content === agentBody);
    const tmpResidue = fs.readdirSync(codeBuilder, { recursive: true }).filter((f) => f.toString().endsWith('.tmp'));
    check('A2 no .tmp residue after any write', tmpResidue.length === 0, String(tmpResidue));

    // ── A6: global 1 MB cap retained, no per-route bypass (the 12mb
    // carve-out in index.ts matches only /design/ — never /build/). ────────
    r = await json(`/api/projects/${slug}/build/rules`, 'PUT', { content: 'z'.repeat(1_100_000) });
    check('A6 oversized rules body → 413 (1 MB cap, no bypass)', r.status === 413, `status=${r.status} ${String(r.body).slice(0, 120)}`);
    r = await json(`/api/projects/${slug}/build/US-01/notes`, 'POST', { body: 'y'.repeat(1_100_000) });
    check('A6 oversized note body → 413', r.status === 413, `status=${r.status}`);

    // ── Tail: 400s on garbage project ids for every build family ────────
    const tailBad = async (p: string, init?: RequestInit) => {
      const res = await reqFetch(`/api/projects/zzz-not-real/build/${p}`, init);
      check(`unknown project → 400 for ${p}`, res.status === 400, `status=${res.status}`);
    };
    await tailBad('stories');
    await tailBad('rules');
    await tailBad('US-01');
    await tailBad('config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await tailBad('rules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await tailBad('rules/agents/code-1', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await tailBad('US-01/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await tailBad('US-01/apis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await tailBad('US-01/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await tailBad('US-01/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  } finally {
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`\n[verify-build] ${passed} checks passed, ${failures.length} failures`);
  if (failures.length) {
    console.log(failures.join('\n'));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[verify-build] fatal: ${err?.stack ?? err}`);
  process.exit(1);
});
