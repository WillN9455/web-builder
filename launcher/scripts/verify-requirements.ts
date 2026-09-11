// Requirements-tab verification (plan §7, AC-7/8/9/10/11 — the server half of
// the smoke matrix). Spins up the REAL API against an isolated copy of the
// server + an isolated SQLite DB (never the dev launcher.db), seeds a fixture
// project whose folder contains a hand-written prd.md §8 + user-journeys.md in
// the exact grammar of server/requirements-model.ts, then walks every
// endpoint — byte-diffing the PRD files around each mutation to prove the
// surgical line-splice write-back (AC-9).
//
// Run: npm run verify:requirements   (tsx scripts/verify-requirements.ts)
//
// No test framework is installed in this repo (Playwright deferred, same as
// #18/#19) — this is a plain assert-and-exit script so it also runs in CI.

import { spawn, execFileSync } from 'node:child_process';
import { collectExistingIds, nextFreeId, parseRequirements } from '../server/requirements-model.js';
import {
  fileHasGeneratedRows,
  reconcileBusinessReqs,
  reconcileSectionsDone,
  reconcileStories,
  requireRows,
  spliceBusinessReqs,
  spliceStories,
} from '../server/req-gen-splice.js';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAUNCHER = resolve(__dirname, '..');

// ── Tiny assertion harness ─────────────────────────────────────────────────

let passed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// LCS line diff — the byte-diff proof for AC-9. Index-aligned comparison
// can't express insertions (every later line "changes"), so this reports
// exactly which lines were added/removed/kept in place.
function lcsDiff(a: string, b: string): { added: string[]; removed: string[] } {
  const al = a.split('\n');
  const bl = b.split('\n');
  const n = al.length;
  const m = bl.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = al[i] === bl[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const added: string[] = [];
  const removed: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (al[i] === bl[j]) {
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      removed.push(al[i++]);
    } else {
      added.push(bl[j++]);
    }
  }
  while (i < n) removed.push(al[i++]);
  while (j < m) added.push(bl[j++]);
  return { added, removed };
}

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

// ── Free-port probe (memory: the host has other dev servers — never 5184) ──

function freePort(start: number): Promise<number> {
  return new Promise((res, rej) => {
    const probe = (p: number): void => {
      const s = net.createServer();
      s.once('error', () => (p > start + 50 ? rej(new Error('no free port')) : probe(p + 1)));
      s.once('listening', () => s.close(() => res(p)));
      s.listen(p, '127.0.0.1');
    };
    probe(start);
  });
}

// ── Fixture (grammar §3.1 exactly) ─────────────────────────────────────────

const PRD_MD = `# PRD — Neighborhood Library

## 8. Business requirements

- BR-001 | must | approved | BA | The list form must require title, photo, condition, and a pickup window before save.
- BR-002 | should | draft | BA | Saved items must be visible to all approved members in the same neighborhood within 5 seconds.
- BR-004 | Legacy requirement row without meta segments, kept for the conversion flow.

## 9. Non-functional requirements

- The system must stay under 200ms p95 for list reads.
`;

const JOURNEYS_MD = [
  '# User journeys',
  '',
  '### US-01 — List an item for lending',
  '<!-- story: priority=must status=in_review owner=BA -->',
  '**As a** household owner, **I want to** list an item with title, photo, condition, and pickup window, **so that** nearby borrowers can find and request it.',
  '',
  '- TR-001 | must | in_review | DEV | Photo uploads must use signed URLs and store objects in the project bucket with public-read disabled.',
  '',
  '### US-02 — Reserve an item',
  '<!-- story: priority=should status=draft owner=SA -->',
  '**As a** borrower, **I want to** reserve an available item for pickup, **so that** nearby borrowers can plan around TR-001 pickup windows.',
  '',
].join('\n');

// ── Walk ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const port = await freePort(5297);
  const base = `http://127.0.0.1:${port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'req-verify-'));
  const projDir = path.join(tmp, 'proj-with-prd');
  const emptyDir = path.join(tmp, 'proj-empty');
  fs.mkdirSync(path.join(projDir, 'PRD'), { recursive: true });
  fs.mkdirSync(emptyDir, { recursive: true });
  const prdPath = path.join(projDir, 'PRD', 'prd.md');
  const journeysPath = path.join(projDir, 'PRD', 'user-journeys.md');
  fs.writeFileSync(prdPath, PRD_MD);
  fs.writeFileSync(journeysPath, JOURNEYS_MD);

  // Reopen-all fixtures (PR #26 follow-up): req-verify-approved carries all 17
  // BA_ARTIFACTS on disk + all Approved + context confirmed; req-verify-mixed
  // carries 5 Approved + 12 Draft. The 17 filenames are hardcoded here rather
  // than imported from ba-workspace.ts — importing it would pull in db.ts
  // (better-sqlite3) and open the real launcher.db at module load.
  const approvedDir = path.join(tmp, 'proj-approved');
  const mixedDir = path.join(tmp, 'proj-mixed');
  fs.mkdirSync(path.join(approvedDir, 'PRD'), { recursive: true });
  fs.mkdirSync(path.join(mixedDir, 'PRD'), { recursive: true });
  const BA_ARTIFACTS = [
    'prd.md', 'user-journeys.md', 'personas.md', 'glossary.md', 'stakeholder-map.md',
    'business-rules.md', 'assumptions.md', 'open-questions.md', 'data-model.md', 'data-flow.md',
    'rbac-matrix.md', 'nfr-catalog.md', 'phasing-plan.md', 'traffic-profile.md', 'cost-model.md',
    'risks.md', 'tech-decision-brief.md',
  ];
  for (const f of BA_ARTIFACTS) {
    fs.writeFileSync(path.join(approvedDir, 'PRD', f), `# ${f}\n\nPlaceholder body for the reopen-all fixture.\n`);
    fs.writeFileSync(path.join(mixedDir, 'PRD', f), `# ${f}\n\nPlaceholder body for the reopen-all fixture.\n`);
  }

  // Isolated server copy + node_modules link + isolated DB (never the dev DB).
  fs.symlinkSync(path.join(LAUNCHER, 'node_modules'), path.join(tmp, 'node_modules'), 'dir');
  fs.cpSync(path.join(LAUNCHER, 'server'), path.join(tmp, 'server'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'data'));

  const seedPath = path.join(tmp, 'seed.mts');
  fs.writeFileSync(
    seedPath,
    `import { migrate, db } from './server/db.js';\n` +
      `migrate();\n` +
      `const ARTIFACTS = ${JSON.stringify(BA_ARTIFACTS)};\n` +
      `const ins = db.prepare("INSERT INTO project (name, slug, one_liner, folder_path, current_stage, status) VALUES (?, ?, ?, ?, 'PRD', 'active')");\n` +
      `const fixtureId = Number(ins.run('Req Verify Fixture', 'req-verify-fixture', 'fixture', ${JSON.stringify(projDir)}).lastInsertRowid);\n` +
      `const emptyId = Number(ins.run('Req Verify Empty', 'req-verify-empty', 'fixture', ${JSON.stringify(emptyDir)}).lastInsertRowid);\n` +
      `const approvedId = Number(ins.run('Req Verify Approved', 'req-verify-approved', 'fixture', ${JSON.stringify(approvedDir)}).lastInsertRowid);\n` +
      `const mixedId = Number(ins.run('Req Verify Mixed', 'req-verify-mixed', 'fixture', ${JSON.stringify(mixedDir)}).lastInsertRowid);\n` +
      `const setStatus = db.prepare('INSERT INTO ba_artifacts_status (project_id, filename, status) VALUES (?, ?, ?)');\n` +
      `for (const f of ARTIFACTS) setStatus.run(approvedId, f, 'approved');\n` +
      `for (const f of ARTIFACTS.slice(0, 5)) setStatus.run(mixedId, f, 'approved');\n` +
      `for (const f of ARTIFACTS.slice(5)) setStatus.run(mixedId, f, 'draft');\n` +
      `db.prepare("INSERT INTO ba_context (project_id, confirmed, confirmed_at) VALUES (?, 1, datetime('now'))").run(approvedId);\n` +
      `console.log('SEED_IDS ' + JSON.stringify({ fixture: fixtureId, empty: emptyId, approved: approvedId, mixed: mixedId }));\n`,
  );
  const seedOut = execFileSync(path.join(LAUNCHER, 'node_modules', '.bin', 'tsx'), [seedPath], { cwd: LAUNCHER }).toString();
  const seedIds = JSON.parse(seedOut.match(/SEED_IDS (\{.*\})/)?.[1] ?? '{}') as {
    fixture: number;
    empty: number;
    approved: number;
    mixed: number;
  };

  const child = spawn(path.join(LAUNCHER, 'node_modules', '.bin', 'tsx'), [path.join(tmp, 'server', 'index.ts')], {
    cwd: LAUNCHER,
    // OLLAMA_HOST points at a dead port so a triggered req-gen job's model
    // fetch fails in ms (connection refused — callOllama has no retry loop):
    // no live Ollama is needed, fixtures stay synthetic, and the reconcile
    // tests below assert the FAILED run keeps artifactsChanged=true.
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

  const slug = 'req-verify-fixture';
  const emptySlug = 'req-verify-empty';

  try {
    console.log(`\n[verify-requirements] API on ${base}, fixture ${tmp}\n`);
    // Pristine fixture snapshots for the req-gen splice checks below (the
    // CRUD walk mutates the on-disk files).
    const prd0 = read(prdPath);
    const journeys0 = read(journeysPath);

    // ── GET (AC-10: populated + no-prd, never 500) ──
    let r = await reqFetch(`/api/projects/${slug}/requirements`);
    check('GET populated → 200 source ok', r.status === 200 && r.body.source === 'ok');
    eq('businessReqs = 3 (incl. the legacy BR-004)', r.body.businessReqs?.length, 3);
    eq('stories = 2', r.body.stories?.length, 2);
    eq('US-01 carries TR-001', r.body.stories?.[0]?.reqs?.map((x: any) => x.id), ['TR-001']);

    r = await reqFetch(`/api/projects/${emptySlug}/requirements`);
    check('GET no-prd → 200 with no-prd empty state (AC-10)', r.status === 200 && r.body.source === 'no-prd');

    // ── Containment (AC-10) ──
    r = await reqFetch('/api/projects/..%2F..%2Fetc/requirements');
    check('path-traversal slug → not 200 / no data leak', r.status !== 200);
    r = await reqFetch('/api/projects/req-verify-nonexistent/requirements');
    check('unknown project → 404', r.status === 404);

    // ── POST story (AC-4/8/9): appends US-03 to user-journeys.md only ──
    const beforeJ = read(journeysPath);
    const beforeP = read(prdPath);
    r = await json(`/api/projects/${slug}/stories`, 'POST', {
      title: 'Return an item on time',
      asA: 'borrower',
      iWantTo: 'return a borrowed item before its due date',
      soThat: 'the next borrower can pick it up without delay',
      priority: 'should',
      status: 'draft',
      owner: 'BA',
    });
    check('POST story → 201', r.status === 201);
    eq('new story id is lowest free (AC-8)', r.body?.story?.usId, 'US-03');
    const afterJ = read(journeysPath);
    check('user-journeys.md grew append-only (AC-9)', afterJ.startsWith(beforeJ));
    eq('prd.md byte-identical (AC-9)', read(prdPath), beforeP);

    // ── POST BR → prd.md §8 (story-first endpoint, type decides target) ──
    r = await json(`/api/projects/${slug}/stories/US-03/requirements`, 'POST', {
      type: 'BR',
      text: 'Returned items must reappear in the list within 10 seconds of check-in.',
      priority: 'must',
      status: 'draft',
      owner: 'BA',
    });
    check('POST BR → 201', r.status === 201);
    // QA-10: per-story BR allocation. US-03's linked-BR pool is empty, so
    // the new row takes BR-001 — the same id a TR-001 would use, which
    // is now expected behaviour, not a clash (BR and TR namespaces are
    // separate). The legacy global allocator would have produced BR-003.
    eq('BR gets per-story lowest free id BR-001 (QA-10)', r.body?.requirement?.id, 'BR-001');
    const brAfter = read(prdPath);
    const brDiff = lcsDiff(beforeP, brAfter);
    eq(
      'BR insert adds exactly 2 lines (row + story link), removes none (AC-9 / 2.7)',
      brDiff,
      {
        added: [
          // QA-10: per-story allocation; US-03's pool is empty, so the
          // new row takes BR-001 — same id the legacy BR-001 in
          // businessReqs carries. They live in different scopes and never
          // collide on disk. Find the *new* row by its unique text.
          brAfter
            .split('\n')
            .filter((l) => l.startsWith('- BR-001 |') && l.includes('Returned items must reappear'))
            .pop() ?? '',
          '<!-- BR-001: story=US-03, origin=manual -->',
        ],
        removed: [],
      },
    );
    eq('user-journeys.md byte-identical after BR (AC-9)', read(journeysPath), afterJ);

    // ── BR-under-story (item 2.7) — GET must move BR-001 into US-03's reqs,
    //    and legacy BR-004 (no story link) stays in businessReqs.
    const afterBrGet = await reqFetch(`/api/projects/${slug}/requirements`);
    const storyForUs03 = afterBrGet.body?.stories?.find((s: any) => s.usId === 'US-03');
    check('BR-001 lands inside US-03 (item 2.7)', !!storyForUs03 && storyForUs03.reqs.some((r: any) => r.id === 'BR-001'));
    eq(
      'BR-001 carries storyUsId=US-03 (item 2.7)',
      storyForUs03?.reqs?.find((r: any) => r.id === 'BR-001')?.storyUsId,
      'US-03',
    );
    eq(
      'legacy BRs (no link) stay in businessReqs (item 2.7)',
      afterBrGet.body?.businessReqs?.map((b: any) => b.id).sort().join(','),
      ['BR-001', 'BR-002', 'BR-004'].sort().join(','),
    );
    eq(
      'BR-001 carries origin=manual (item 2.6)',
      storyForUs03?.reqs?.find((r: any) => r.id === 'BR-001')?.origin,
      'manual',
    );
    // QA-2: every req row carries an origin tag — legacy rows render as
    // manual (null→manual). The wire format still surfaces origin=null so
    // the client can distinguish "marked manual" from "untouched legacy"
    // if it ever needs to; the UI default-folds it for display.
    check(
      'legacy BR-001 carries origin=null on disk (QA-2)',
      afterBrGet.body?.businessReqs?.find((b: any) => b.id === 'BR-001')?.origin === null,
    );

    // ── POST TR → the story block ──
    r = await json(`/api/projects/${slug}/stories/US-02/requirements`, 'POST', {
      type: 'TR',
      text: 'Reservations must expire automatically after 24 hours without pickup.',
      priority: 'should',
      status: 'draft',
      owner: 'DEV',
    });
    check('POST TR → 201 TR-001 (per-story, US-02 pool empty)', r.status === 201 && r.body?.requirement?.id === 'TR-001');
    const trAfter = read(journeysPath);
    const trDiff = lcsDiff(afterJ, trAfter);
    eq(
      'TR lands inside the US-02 block — one inserted row + origin marker (AC-9 / QA-2)',
      { removed: trDiff.removed, added: trDiff.added },
      {
        removed: [],
        added: [
          trDiff.added.find((l) => l.startsWith('- TR-001 |')) ?? '',
          '<!-- TR-001: origin=manual -->',
        ],
      },
    );

    // ── Story-first rule: body carrying a story field → 422 (spec VALID) ──
    r = await json(`/api/projects/${slug}/stories/US-02/requirements`, 'POST', {
      type: 'TR',
      text: 'Reservations must expire automatically after 24 hours without pickup.',
      priority: 'should',
      status: 'draft',
      owner: 'DEV',
      story: { title: 'sneaky' },
    });
    check('POST requirement with story field → 422', r.status === 422);

    // QA-5: a second POST into the same story must NOT land the new
    // [row, marker] pair between the previous TR and its trailing
    // `<!-- TR-NNN: origin=manual -->` comment — otherwise the previous
    // row's marker detaches, parses origin=null on re-parse, and the
    // file contract is scrambled. The new row pair lands AFTER the
    // previous marker. Same for BR: a second BR into US-03 must not
    // detach the first BR's `story=US-03` link.
    r = await json(`/api/projects/${slug}/stories/US-02/requirements`, 'POST', {
      type: 'TR',
      text: 'A second TR into US-02 — the marker-aware insert index must keep TR-001 glued to its origin marker.',
      priority: 'could',
      status: 'draft',
      owner: 'BA',
    });
    // QA-10: per-story allocation. US-02's TR pool now has TR-001, so the
    // second TR is TR-002 (not the legacy global TR-003).
    check('second POST TR into US-02 → 201 TR-002 (QA-5 + QA-10)', r.status === 201 && r.body?.requirement?.id === 'TR-002');
    check(
      'QA-5: TR-001 origin marker stays glued to its row on a second POST',
      read(journeysPath).indexOf('- TR-001 |') < read(journeysPath).indexOf('<!-- TR-001: origin=manual -->') &&
        read(journeysPath).indexOf('<!-- TR-001: origin=manual -->') < read(journeysPath).indexOf('- TR-002 |'),
    );
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    const tr001AfterSecond = r.body.stories
      .find((s: any) => s.usId === 'US-02')
      ?.reqs.find((x: any) => x.id === 'TR-001');
    eq('QA-5: TR-001 origin=manual after second POST (parsed)', tr001AfterSecond?.origin, 'manual');

    r = await json(`/api/projects/${slug}/stories/US-03/requirements`, 'POST', {
      type: 'BR',
      text: 'A second BR into US-03 — the marker-aware insert must keep BR-001 glued to its story link.',
      priority: 'could',
      status: 'draft',
      owner: 'BA',
    });
    // QA-10: US-03's linked-BR pool now has BR-001, so the second BR is
    // BR-002 (not the legacy global BR-005).
    check('second POST BR into US-03 → 201 BR-002 (QA-5 + QA-10)', r.status === 201 && r.body?.requirement?.id === 'BR-002');
    // QA-10: per-story numbering means the fixture's legacy BR-001 still
    // exists in §8 alongside US-03's new BR-001. Anchor the row/marker
    // proximity check on the linked row's marker line (find from the
    // marker backward to the nearest preceding BR-001 row line).
    {
      const text = read(prdPath);
      const m1 = text.indexOf('<!-- BR-001: story=US-03, origin=manual -->');
      const m2 = text.indexOf('<!-- BR-002: story=US-03, origin=manual -->');
      const i1 = m1 === -1 ? -1 : text.lastIndexOf('- BR-001 |', m1);
      const i2 = m2 === -1 ? -1 : text.lastIndexOf('- BR-002 |', m2);
      check(
        'QA-5: BR-001 story link stays glued to its row on a second BR POST',
        i1 !== -1 && m1 !== -1 && m2 !== -1 && i2 !== -1 && i1 < m1 && m1 < i2 && i2 < m2,
      );
    }
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    const us03AfterSecond = r.body.stories.find((s: any) => s.usId === 'US-03');
    check(
      'QA-5: BR-001 still rendered inside US-03 after second BR POST (link intact)',
      !!us03AfterSecond && us03AfterSecond.reqs.some((x: any) => x.id === 'BR-001'),
    );
    check(
      'QA-5: BR-002 lands inside US-03 too',
      !!us03AfterSecond && us03AfterSecond.reqs.some((x: any) => x.id === 'BR-002'),
    );

    // ── QA-14: linked-BR writes must land in prd.md, never user-journeys.md ──
    // The scoped locateReq used to return a linked BR from story.reqs stamped
    // as user-journeys.md (its untyped find() predates linked BRs living in
    // that list). PATCH/DELETE then struck user-journeys.md at the row's
    // prd.md line index: the real prd.md row survived (Will's "cannot delete
    // business requirements") and a phantom strike + marker landed in
    // journeys. US-03's linked BR-002 (POSTed above) is the probe row.
    const qa14JourneysBefore = read(journeysPath);
    r = await json(`/api/projects/${slug}/requirements/BR-002?storyUsId=US-03`, 'PATCH', { text: 'QA-14 linked-BR edit probe' });
    check('QA-14: PATCH linked BR-002 (storyUsId=US-03) → 200', r.status === 200);
    check(
      'QA-14: linked BR text edit landed in prd.md',
      /- BR-002 \| could \| draft \| BA \| QA-14 linked-BR edit probe/.test(read(prdPath)),
    );
    eq('QA-14: user-journeys.md byte-identical after linked-BR PATCH (AC-9)', read(journeysPath), qa14JourneysBefore);
    r = await json(`/api/projects/${slug}/requirements/BR-002/status?storyUsId=US-03`, 'PATCH', { status: 'in_review' });
    check('QA-14: status PATCH on linked BR-002 → 200', r.status === 200);
    check(
      'QA-14: linked BR status change landed in prd.md',
      /- BR-002 \| could \| in_review \| BA \| QA-14 linked-BR edit probe/.test(read(prdPath)),
    );
    eq('QA-14: journeys byte-identical after linked-BR status PATCH', read(journeysPath), qa14JourneysBefore);
    r = await json(`/api/projects/${slug}/requirements/BR-002?storyUsId=US-03`, 'PATCH', {
      text: 'A second BR into US-03 — the marker-aware insert must keep BR-001 glued to its story link.',
    });
    check('QA-14: linked BR text reset → 200', r.status === 200);

    // ── PATCH story (surgical heading splice) ──
    r = await json(`/api/projects/${slug}/stories/US-03`, 'PATCH', { title: 'Return an item before it is due' });
    check('PATCH story title → 200', r.status === 200);
    check('US-03 heading spliced (AC-9)', read(journeysPath).includes('### US-03 — Return an item before it is due'));
    const titleDiff = lcsDiff(trAfter, read(journeysPath));
    eq('title splice replaces exactly 1 line', { added: titleDiff.added.length, removed: titleDiff.removed.length }, { added: 3, removed: 1 });

    // QA-2: story origin stamping — US-03 was POSTed in this run, so its
    // meta comment should carry origin=manual; the wire format surfaces it.
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    const us03Origin = r.body?.stories?.find((s: any) => s.usId === 'US-03')?.origin;
    check('US-03 origin=manual after POST (QA-2)', us03Origin === 'manual');
    check('US-03 meta comment carries origin=manual (QA-2)', read(journeysPath).includes('<!-- story: priority=should status=draft owner=BA origin=manual -->'));

    // Legacy blocks (the fixture's US-01/US-02) keep origin=null on disk
    // until a PATCH touches the meta block; the UI renders null as manual.
    const us01Origin = r.body?.stories?.find((s: any) => s.usId === 'US-01')?.origin;
    check('legacy US-01 origin=null on the wire (QA-2)', us01Origin === null);

    // ── PATCH requirement meta ──
    // QA-10: per-story allocation, so the first TR into US-02 is TR-001
    // (not TR-002 as the legacy global allocator would produce). Pass
    // storyUsId to disambiguate from US-01's TR-001.
    r = await json(`/api/projects/${slug}/requirements/TR-001?storyUsId=US-02`, 'PATCH', { priority: 'must', owner: 'BA' });
    check('PATCH req meta → 200', r.status === 200);
    check('row re-rendered in place', read(journeysPath).includes('- TR-001 | must | draft | BA |'));

    // ── DES owner round-trip (refinement batch item 2.5) ──
    r = await json(`/api/projects/${slug}/requirements/TR-001?storyUsId=US-02`, 'PATCH', { owner: 'DES' });
    check('PATCH req owner=DES → 200', r.status === 200);
    check('DES owner re-rendered in place', read(journeysPath).includes('- TR-001 | must | draft | DES |'));
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    const tr001InUs02 = r.body.stories.find((s: any) => s.usId === 'US-02')?.reqs.find((x: any) => x.id === 'TR-001');
    check('GET US-02 TR-001 owner = DES', tr001InUs02?.owner === 'DES');
    // Reset to BA so later assertions still match the fixture
    r = await json(`/api/projects/${slug}/requirements/TR-001?storyUsId=US-02`, 'PATCH', { owner: 'BA' });
    check('PATCH req owner=BA reset → 200', r.status === 200);

    // ── QA-13: per-story formInitial scoping on the client ──
    // Both US-01 (legacy) and US-02 (POSTed above) now carry a `TR-001`.
    // PATCH with storyUsId=US-02 must only mutate US-02's row, leaving
    // US-01's fixture text untouched. The text discriminator proves the
    // server scoped the lookup (US-01 still says "Photo uploads…", US-02
    // now says the QA-13 probe).
    r = await json(`/api/projects/${slug}/requirements/TR-001?storyUsId=US-02`, 'PATCH', { text: 'QA-13 edit probe' });
    check('PATCH TR-001 with storyUsId=US-02 → 200', r.status === 200);
    const journeysAfterQa13 = read(journeysPath);
    check(
      'QA-13: PATCH hits US-02 TR-001 only — US-02 row carries probe text',
      /- TR-001 \| must \| draft \| BA \| QA-13 edit probe/.test(journeysAfterQa13),
    );
    check(
      'QA-13: US-01 TR-001 text is unchanged (Photo uploads…)',
      journeysAfterQa13.includes(
        '- TR-001 | must | in_review | DEV | Photo uploads must use signed URLs and store objects in the project bucket with public-read disabled.',
      ),
    );
    // GET confirms the API surface still resolves to US-02's row only.
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    const qa13Us02 = r.body.stories.find((s: any) => s.usId === 'US-02')?.reqs.find((x: any) => x.id === 'TR-001');
    const qa13Us01 = r.body.stories.find((s: any) => s.usId === 'US-01')?.reqs.find((x: any) => x.id === 'TR-001');
    eq('QA-13: GET US-02 TR-001 text = probe', qa13Us02?.text, 'QA-13 edit probe');
    eq('QA-13: GET US-01 TR-001 text = original fixture', qa13Us01?.text?.startsWith('Photo uploads'), true);
    // Reset US-02 TR-001 back to its original text so later assertions
    // (the QA-5 TR-001 marker test, the delete-guard test, etc.) still match.
    r = await json(`/api/projects/${slug}/requirements/TR-001?storyUsId=US-02`, 'PATCH', {
      text: 'Reservations must expire automatically after 24 hours without pickup.',
    });
    check('QA-13: PATCH US-02 TR-001 text reset → 200', r.status === 200);

    // Story comment owner also accepts DES
    r = await json(`/api/projects/${slug}/stories/US-02`, 'PATCH', { owner: 'DES' });
    check('PATCH story owner=DES → 200', r.status === 200);
    check('DES story owner re-rendered in place', /<!-- story: priority=should status=draft owner=DES origin=manual -->/.test(read(journeysPath)));
    r = await json(`/api/projects/${slug}/stories/US-02`, 'PATCH', { owner: 'SA' });
    check('PATCH story owner=SA reset → 200', r.status === 200);

    // ── Validation (AC-10): 422 with field errors ──
    r = await json(`/api/projects/${slug}/stories`, 'POST', { title: 'no', asA: '', iWantTo: '', soThat: '', priority: 'must', status: 'draft', owner: 'BA' });
    check('invalid story → 422 {errors}', r.status === 422 && typeof r.body?.errors === 'object');

    // ── State machine (AC-7): out-of-machine → 422, no-op ok ──
    // Stories move through the meta PATCH endpoint (no separate /status route).
    r = await json(`/api/projects/${slug}/stories/US-01`, 'PATCH', { status: 'draft' });
    check('US-01 in_review → draft is out-of-machine → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/requirements/BR-001/status`, 'PATCH', { status: 'in_review' });
    check('BR-001 approved → in_review is out-of-machine → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/requirements/BR-001/status`, 'PATCH', { status: 'approved' });
    check('BR-001 approved → approved (no-op) → 200', r.status === 200);
    r = await json(`/api/projects/${slug}/requirements/BR-002/status`, 'PATCH', { status: 'in_review' });
    check('BR-002 draft → in_review → 200', r.status === 200);

    // ── Delete guard (AC-11): approved + referenced by ANOTHER story → 409 ──
    // QA-10: per-story numbering means US-01 and US-02 both have a TR-001.
    // The delete guard targets US-01's TR-001 (the legacy fixture row that
    // US-02's body references), so the PATCH and DELETE both need the
    // storyUsId scope to disambiguate.
    r = await json(`/api/projects/${slug}/requirements/TR-001/status?storyUsId=US-01`, 'PATCH', { status: 'approved' });
    check('US-01 TR-001 in_review → approved → 200', r.status === 200);
    r = await reqFetch(`/api/projects/${slug}/requirements/TR-001?storyUsId=US-01`, { method: 'DELETE' });
    check('delete guard → 409 with referencedBy US-02 (AC-11)', r.status === 409 && JSON.stringify(r.body?.referencedBy) === '["US-02"]');
    check('guarded row NOT struck on disk', read(journeysPath).includes('- TR-001 | must | approved | DEV |'));

    // ── TR-delete regression (item 2.7) — the parser used to treat a
    //    `<!-- deleted … -->` marker *anywhere* in a story block as a
    //    story-level delete, which meant soft-deleting a TR also hid the
    //    parent story. The fix scopes story-delete markers to "before any
    //    requirement rows / body". Repro: add a second TR to US-01,
    //    delete it (unapproved, so no guard), then assert US-01 still
    //    surfaces. ──
    r = await json(`/api/projects/${slug}/stories/US-01/requirements`, 'POST', {
      type: 'TR',
      text: 'A throwaway TR whose delete marker used to hide the whole story.',
      priority: 'wont',
      status: 'draft',
      owner: 'DEV',
    });
    // QA-10: US-01's TR pool already has TR-001, so the new throwaway is
    // TR-002 (per-story) — not TR-004 as the legacy global allocator would
    // produce. storyUsId disambiguates the delete from any other TR-001.
    eq('regression seed: TR-002 added to US-01 (item 2.7 + QA-10)', r.body?.requirement?.id, 'TR-002');
    r = await reqFetch(`/api/projects/${slug}/requirements/TR-002?storyUsId=US-01`, { method: 'DELETE' });
    check('regression seed: TR-002 DELETE → 200 (item 2.7)', r.status === 200);
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    check(
      'regression: US-01 still listed after a TR was deleted in it (item 2.7)',
      Array.isArray(r.body?.stories) && r.body.stories.some((s: any) => s.usId === 'US-01'),
    );
    check(
      'regression: TR-001 still listed (struck) inside US-01 (item 2.7)',
      r.body?.stories?.find((s: any) => s.usId === 'US-01')?.reqs?.some((x: any) => x.id === 'TR-001') === true,
    );

    // ── B2 regression (review item B2): the parser used to flip
    //    story.deleted when a TR's row-delete marker appeared after a struck
    //    TR in a body-less story (heading → meta → ~~struck TR~~ → marker).
    //    The fix scopes story-delete markers to "before the first content
    //    line" — a committed body sentence OR any TR row (struck or not)
    //    freezes the position. Repro: append a body-less US-05 block with a
    //    single struck TR + the row-delete marker, then assert the story
    //    still surfaces. ──
    fs.writeFileSync(
      journeysPath,
      read(journeysPath) +
        '\n' +
        [
          '### US-05 — Body-less edge case for the parser',
          '<!-- story: priority=wont status=draft owner=BA -->',
          '- ~~TR-001 | wont | draft | DEV | A throwaway TR in a body-less story.~~',
          '<!-- deleted ' + new Date().toISOString().slice(0, 10) + ' by BA -->',
        ].join('\n') +
        '\n',
    );
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    check(
      'B2 regression: body-less + all-struck US-05 still surfaces (item B2)',
      Array.isArray(r.body?.stories) && r.body.stories.some((s: any) => s.usId === 'US-05'),
    );
    check(
      'B2 regression: struck TR-001 absent from US-05.reqs but the row is still in the block on disk (item B2)',
      r.body?.stories?.find((s: any) => s.usId === 'US-05')?.reqs?.some((x: any) => x.id === 'TR-001') !== true &&
        read(journeysPath).includes('~~TR-001'),
    );

    // ── DELETE requirement (AC-8/9): strike + marker, freed id reusable ──
    const beforeDel = read(prdPath);
    r = await reqFetch(`/api/projects/${slug}/requirements/BR-002`, { method: 'DELETE' });
    check('DELETE BR-002 → 200', r.status === 200);
    const afterDel = read(prdPath);
    const delDiff = lcsDiff(beforeDel, afterDel);
    // Blank-line alignment is ambiguous to an LCS diff; only content lines
    // must match exactly: the struck row (in place) + the delete marker.
    const delContent = delDiff.added.filter((l) => l !== '');
    eq(
      'delete = strike-in-place + marker line, nothing else (AC-9)',
      {
        removedCount: delDiff.removed.length,
        removedIsOldRow: delDiff.removed[0]?.startsWith('- BR-002 |') ?? false,
        contentAdded: delContent.length,
        struck: delContent.some((l) => /^- ~~BR-002 \| should \| in_review \| BA \|/.test(l)),
        marker: delContent.some((l) => /^<!-- deleted \d{4}-\d{2}-\d{2} by BA -->$/.test(l)),
      },
      { removedCount: 1, removedIsOldRow: true, contentAdded: 2, struck: true, marker: true },
    );
    check('struck row keeps its metadata', /^- ~~BR-002 \| should \| in_review \| BA \|/m.test(afterDel));
    check('soft-delete marker written', /<!-- deleted \d{4}-\d{2}-\d{2} by BA -->/.test(afterDel));
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    check('struck row absent from list (AC-8)', !JSON.stringify(r.body?.businessReqs).includes('BR-002'));

    // QA-10: the per-story allocator picks the next free id from US-03's
    // linked-BR pool (which now has BR-001). The freed BR-002 in the
    // unassigned pool is not what allocates here — that's a separate
    // pool. The new row is BR-002 within US-03's scope (per-story), not
    // the global-recycled BR-002 the legacy allocator would produce.
    r = await json(`/api/projects/${slug}/stories/US-03/requirements`, 'POST', {
      type: 'BR',
      text: 'A third BR into US-03 to confirm per-story allocation continues past BR-002.',
      priority: 'could',
      status: 'draft',
      owner: 'BA',
    });
    eq('next per-story BR after BR-002 is BR-003 (QA-10)', r.body?.requirement?.id, 'BR-003');

    // ── QA-14: deleting a LINKED BR must strike prd.md, never journeys ──
    // This is Will's exact repro: trash a business requirement that lives
    // inside a story. The wrong-file locateReq returned 200 + toast while
    // the real row survived and a phantom strike landed in
    // user-journeys.md. The byte-identical assertion is the load-bearing
    // one — it proves the strike never touched journeys on disk.
    const qa14JourneysBeforeDel = read(journeysPath);
    r = await reqFetch(`/api/projects/${slug}/requirements/BR-003?storyUsId=US-03`, { method: 'DELETE' });
    check('QA-14: DELETE linked BR-003 (storyUsId=US-03) → 200', r.status === 200);
    check(
      'QA-14: linked BR struck in prd.md (strike-in-place)',
      /- ~~BR-003 \| could \| draft \| BA \| A third BR into US-03/.test(read(prdPath)),
    );
    eq('QA-14: user-journeys.md byte-identical after linked-BR DELETE (AC-9)', read(journeysPath), qa14JourneysBeforeDel);
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    check(
      'QA-14: deleted linked BR absent from US-03.reqs (AC-8)',
      r.body?.stories?.find((s: any) => s.usId === 'US-03')?.reqs?.some((x: any) => x.id === 'BR-003') !== true,
    );

    // ── DELETE story: marker after heading, US id never reused (AC-8) ──
    r = await reqFetch(`/api/projects/${slug}/stories/US-03`, { method: 'DELETE' });
    check('DELETE US-03 → 200', r.status === 200);
    const jd = read(journeysPath);
    const delIdx = jd.indexOf('### US-03 —');
    check(
      'delete marker written directly after the heading',
      delIdx >= 0 && /^<!-- deleted \d{4}-\d{2}-\d{2} by BA -->$/m.test(jd.slice(delIdx, delIdx + 120)),
    );
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    check('deleted story absent from list (AC-8)', !JSON.stringify(r.body?.stories).includes('US-03'));
    r = await json(`/api/projects/${slug}/stories`, 'POST', {
      title: 'A fresh story after a delete',
      asA: 'borrower',
      iWantTo: 'check that deleted ids are not reused',
      soThat: 'stable ids never point at new content',
      priority: 'must',
      status: 'draft',
      owner: 'BA',
    });
    eq('deleted US id never reused (AC-8)', r.body?.story?.usId, 'US-04');

    // ── Legacy-row status-only PATCH (review N1): the server never invents ──
    // grammar values. BR-004 is a metadata-less legacy row (no priority or
    // owner); the thin status route must refuse instead of writing defaults.
    r = await json(`/api/projects/${slug}/requirements/BR-004/status`, 'PATCH', {
      status: 'in_review',
    });
    check('legacy row status-only PATCH → 422 (N1)', r.status === 422 && typeof r.body?.errors?._ === 'string');
    check('legacy row untouched on disk (N1)', read(prdPath).includes('- BR-004 | Legacy requirement row without meta segments, kept for the conversion flow.'));

    // QA-2: a real PATCH on a legacy row stamps origin=manual so the tag
    // starts rendering. BR-001 is the seeded legacy BR (no meta comment).
    const beforeLegacy = read(prdPath);
    r = await json(`/api/projects/${slug}/requirements/BR-001`, 'PATCH', {
      text: 'The list form must require title, photo, condition, and a pickup window before save.',
    });
    check('legacy row full PATCH → 200 (QA-2)', r.status === 200);
    const legacyAfter = read(prdPath);
    const legacyDiff = lcsDiff(beforeLegacy, legacyAfter);
    eq(
      'legacy PATCH adds the origin=manual marker (QA-2)',
      legacyDiff.added.filter((l) => l !== ''),
      ['<!-- BR-001: origin=manual -->'],
    );
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    eq(
      'legacy BR-001 now origin=manual after PATCH (QA-2)',
      r.body?.businessReqs?.find((b: any) => b.id === 'BR-001')?.origin,
      'manual',
    );

    // ── Parse-error resilience (AC-10): unreadable file → 200, hidden rows ──
    fs.chmodSync(prdPath, 0o000);
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    check('unreadable prd.md → 200, not 500 (AC-10)', r.status === 200);
    fs.chmodSync(prdPath, 0o644);

    // ── Interleaved-writer serialization (review B1: the prd-fs mutex) ──────
    // Two writers to one PRD file must queue FIFO through withPrdLock instead
    // of racing: an in-flight mutation holding the lock across an await (the
    // auto-draft write moment shape) cannot have a second write land under
    // it, and the queued write lands whole after it. Exercised in-process
    // against the same prd-fs module the routes and the job call (the
    // isolated server copy is byte-identical).
    const { withPrdLock, atomicWritePrd: atomicWrite } = await import('../server/prd-fs.js');
    const lockPath = path.join(tmp, 'mutex-prd.md');
    fs.writeFileSync(lockPath, 'v1\n', 'utf-8');
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    let holderLanded = false;
    const holder = withPrdLock(lockPath, async () => {
      await gate;
      fs.writeFileSync(lockPath, 'in-flight mutation result\n', 'utf-8');
      holderLanded = true;
    });
    await new Promise((res) => setTimeout(res, 20));
    const queued = atomicWrite(lockPath, '- TR-001 | must | in_review | DEV | spliced row\n');
    await new Promise((res) => setTimeout(res, 20));
    check(
      'interleaved: queued write did not land mid-flight, holder intact (B1)',
      read(lockPath) === 'v1\n' && !holderLanded,
    );
    release();
    await Promise.all([holder, queued]);
    check(
      'interleaved: file holds the queued write, FIFO order preserved (B1)',
      read(lockPath) === '- TR-001 | must | in_review | DEV | spliced row\n',
    );
    // A different file never queues behind a held lock.
    const otherPath = path.join(tmp, 'mutex-other.md');
    fs.writeFileSync(otherPath, 'o1\n', 'utf-8');
    let release2!: () => void;
    const gate2 = new Promise<void>((res) => (release2 = res));
    const holder2 = withPrdLock(lockPath, async () => {
      await gate2;
    });
    await new Promise((res) => setTimeout(res, 20));
    const independent = Promise.race([
      atomicWrite(otherPath, 'o2\n').then(() => true),
      new Promise<boolean>((res) => setTimeout(() => res(false), 500)),
    ]);
    check('different file: write lands while another path is locked', await independent);
    release2();
    await holder2;

    // PR #26 round-4 regression: agent-invoker used to nest
    // withPrdLock(path, () => atomicWritePrd(path, …)) on the SAME path.
    // atomicWritePrd already takes the lock, so the inner acquire queued
    // behind its own slot forever (non-reentrant mutex, deterministic
    // self-deadlock — the model call completed, the write never settled).
    // The AsyncLocalStorage re-entrancy makes a nested same-key acquire run
    // inline in the current chain; the race must resolve true ~immediately,
    // never wait out its 1s timeout.
    const nestedDeadlockRace = Promise.race([
      withPrdLock(lockPath, () => atomicWrite(lockPath, 're-entrant write\n')).then(() => true),
      new Promise<boolean>((res) => setTimeout(() => res(false), 1000)),
    ]);
    check(
      're-entrant: nested same-path withPrdLock→atomicWritePrd completes, no self-deadlock (round 4)',
      await nestedDeadlockRace,
    );
    check('re-entrant: nested write landed whole', read(lockPath) === 're-entrant write\n');

    // ── Req-gen splices (SA P0 redesign: rows land in the canonical files via
    // the requirements-model insert helpers — never file replacement). The
    // splice modules are pure, so these run without the API; the byte-identity
    // bar is the same AC-9 one the walk above proves for the CRUD routes. ──
    const genStories = [
      {
        title: 'Track a borrowed tool return',
        asA: 'lender',
        iWantTo: 'see when a borrowed tool is due back',
        soThat: 'I can plan my weekend projects',
        priority: 'must',
        trs: [{ text: 'Persist a due-back date with each loan', priority: 'must' }],
      },
      {
        title: 'Get a overdue-item digest',
        asA: 'lender',
        iWantTo: 'get a weekly digest of overdue items',
        soThat: 'I can follow up without checking manually',
        priority: 'should',
        trs: [{ text: 'Queue the digest email weekly', priority: 'should' }],
      },
    ];
    const idsBefore = collectExistingIds(prd0, journeys0);
    const nextUs = nextFreeId(idsBefore.us, 'US');
    const nextTr = nextFreeId(idsBefore.tr, 'TR');
    const splicedJ = spliceStories(journeys0, genStories);
    check('req-gen: story splice removes nothing (AC-9)', lcsDiff(journeys0, splicedJ.text).removed.length === 0);
    const reparsed = parseRequirements(prd0, splicedJ.text);
    const newStory = reparsed.stories.find((st: any) => st.usId === nextUs);
    check(`req-gen: first generated story takes ${nextUs} (sequence continues)`, !!newStory);
    check('req-gen: generated story stamps origin=generated', newStory?.origin === 'generated');
    check('req-gen: generated TR lands in the story block', newStory?.reqs?.some((r: any) => r.id === nextTr) === true);
    check('req-gen: second generated story gets a distinct US id', splicedJ.usIds.length === 2 && splicedJ.usIds[0] !== splicedJ.usIds[1]);

    const genBrs = [
      { text: 'Every loan shows its due-back date', priority: 'must', storyIndex: 0 },
      { text: 'Overdue items are surfaced weekly', priority: 'should', storyIndex: 1 },
    ];
    const nextBr = nextFreeId(idsBefore.br, 'BR');
    const splicedP = spliceBusinessReqs(prd0, genBrs, splicedJ.usIds);
    check('req-gen: BR splice removes nothing (AC-9)', lcsDiff(prd0, splicedP.text).removed.length === 0);
    const reparsedP = parseRequirements(splicedP.text, splicedJ.text);
    // A story-linked BR is MOVED into its story's reqs by parseRequirements —
    // search both surfaces.
    const allBrRows = (parsed: ReturnType<typeof parseRequirements>) => [
      ...parsed.businessReqs,
      ...parsed.stories.flatMap((st: any) => st.reqs.filter((r: any) => r.id.startsWith('BR-'))),
    ];
    const newBr = allBrRows(reparsedP).find((r: any) => r.id === nextBr);
    check(`req-gen: first generated BR takes ${nextBr} (sequence continues)`, !!newBr);
    check('req-gen: generated BR links to its story', newBr?.storyUsId === splicedJ.usIds[0]);
    check('req-gen: generated BR stamps origin=generated', newBr?.origin === 'generated');

    // Bidirectional resume reconcile (round 2): rows on disk ⇒ done even if
    // unmarked (crash between splice write and state persist must not
    // duplicate on retry); marked but rows deleted ⇒ regenerate.
    const r1 = reconcileSectionsDone(splicedJ.text, splicedP.text, []);
    check('req-gen: unmarked on-disk rows reconcile to done (P2-2 crash window)', r1.sectionsDone.includes('user stories') && r1.sectionsDone.includes('business requirements'));
    check('req-gen: reconcile rehydrates generated story ids for BR links (P2-1)', r1.storyIds.join(',') === splicedJ.usIds.join(','));
    const r2 = reconcileSectionsDone(journeys0, prd0, ['user stories', 'business requirements']);
    check('req-gen: marked sections with deleted rows reconcile to regenerate', r2.sectionsDone.length === 0 && r2.storyIds.length === 0);

    // ── Section-failure guard (round 4): a model call that yields zero
    // parseable rows must FAIL the section — an invisible empty advance would
    // be marked done and retry would skip it forever, generating nothing. ──
    const passthrough = requireRows([{ title: 'x' }], 'user stories');
    check('req-gen: non-empty rows pass through requireRows untouched', passthrough.length === 1);
    let zeroRowError: unknown = null;
    try {
      requireRows([], 'business requirements');
    } catch (e) {
      zeroRowError = e;
    }
    check(
      'req-gen: zero rows throws a section-naming error, silent empty advance impossible',
      zeroRowError instanceof Error && /Model returned no business requirements/.test(zeroRowError.message),
    );

    // ── Reconcile mode (fix #3, req-gen-splice.ts): a run that starts from
    // existing origin=generated rows must diff — echo valid generated ids,
    // update in place, remove omitted generated rows, append unknowns — and a
    // no-change echo must be a byte-identical no-op (the caller skips the
    // write). Pure module, same AC-9 bar as the generate-mode splices above. ──
    const us0 = splicedJ.usIds[0] ?? '';
    const us1 = splicedJ.usIds[1] ?? '';
    const genTr2Id =
      reparsed.stories
        .find((st: any) => st.usId === us1)
        ?.reqs?.find((r: any) => r.id.startsWith('TR-'))?.id ?? '';
    const genBr2Id =
      allBrRows(reparsedP).find((r: any) => r.origin === 'generated' && r.id !== nextBr)?.id ?? '';
    check(
      'reconcile: fixture resolves both generated ids (story TR + second BR)',
      genTr2Id.startsWith('TR-') &&
        genTr2Id !== nextTr &&
        genBr2Id.startsWith('BR-') &&
        genBr2Id !== nextBr,
    );

    const echoTr = (trId: string | null, text: string, priority: unknown) => ({ trId, text, priority });
    const echoStory = (i: 0 | 1, trs: ReturnType<typeof echoTr>[]) => ({
      usId: i === 0 ? us0 : us1,
      ...genStories[i],
      trs,
    });
    const bothStoryEchoes = () => [
      echoStory(0, [echoTr(nextTr, 'Persist a due-back date with each loan', 'must')]),
      echoStory(1, [echoTr(genTr2Id, 'Queue the digest email weekly', 'should')]),
    ];

    const rcNoChange = reconcileStories(splicedJ.text, bothStoryEchoes());
    check('reconcile: no-change echo is a byte-identical no-op (AC-9)', rcNoChange.text === splicedJ.text);
    eq('reconcile: no-change ops are zero', rcNoChange.ops, { added: 0, updated: 0, removed: 0 });
    eq('reconcile: no-change storyIds keep desired order', rcNoChange.storyIds, [us0, us1]);

    const rcUpd = reconcileStories(splicedJ.text, [
      { ...echoStory(0, [echoTr(nextTr, 'Persist a due-back date with each loan', 'must')]), soThat: 'I can plan my weekend projects faster' },
      echoStory(1, [echoTr(genTr2Id, 'Queue the digest email weekly', 'should')]),
    ]);
    eq('reconcile: story update ops', rcUpd.ops, { added: 0, updated: 1, removed: 0 });
    const updParsed = parseRequirements(splicedP.text, rcUpd.text);
    const updStory = updParsed.stories.find((st: any) => st.usId === us0);
    check('reconcile: story update rewrites soThat in place', updStory?.soThat === 'I can plan my weekend projects faster');
    eq(
      'reconcile: story update preserves status/owner',
      [updStory?.status, updStory?.owner],
      [newStory?.status, newStory?.owner],
    );
    check(
      'reconcile: manual stories survive an update',
      updParsed.stories.map((st: any) => st.usId).includes('US-01') &&
        updParsed.stories.map((st: any) => st.usId).includes('US-02'),
    );

    const rcRm = reconcileStories(splicedJ.text, [echoStory(0, [echoTr(nextTr, 'Persist a due-back date with each loan', 'must')])]);
    eq('reconcile: omitted story is removed (ops)', rcRm.ops, { added: 0, updated: 0, removed: 1 });
    check('reconcile: removed story leaves no trace', !rcRm.text.includes(us1) && !rcRm.text.includes(genTr2Id));
    const rmParsed = parseRequirements(splicedP.text, rcRm.text);
    eq(
      'reconcile: removal keeps manual + remaining story ids',
      rmParsed.stories.map((st: any) => st.usId),
      ['US-01', 'US-02', us0],
    );
    check('reconcile: removal preserves the file header', rcRm.text.startsWith('# User journeys'));

    const rcAdd = reconcileStories(splicedJ.text, [
      ...bothStoryEchoes(),
      { usId: null, title: 'Flag a lost tool', asA: 'lender', iWantTo: 'report a tool as lost', soThat: 'the borrower is billed', priority: 'must', trs: [] },
    ]);
    eq('reconcile: unknown story is appended (ops)', rcAdd.ops, { added: 1, updated: 0, removed: 0 });
    const addParsed = parseRequirements(splicedP.text, rcAdd.text);
    const addedStory = addParsed.stories.find(
      (st: any) => st.origin === 'generated' && ![us0, us1].includes(st.usId),
    );
    check('reconcile: appended story stamps origin=generated', addedStory?.origin === 'generated');
    eq('reconcile: storyIds = reused + appended in desired order', rcAdd.storyIds, [us0, us1, addedStory?.usId ?? '']);

    const rcTrAdd = reconcileStories(splicedJ.text, [
      echoStory(0, [echoTr(nextTr, 'Persist a due-back date with each loan', 'must'), { trId: null, text: 'Send a reminder the day before due', priority: 'must' }]),
      echoStory(1, [echoTr(genTr2Id, 'Queue the digest email weekly', 'should')]),
    ]);
    check('reconcile: added TR increments trCount', rcTrAdd.trCount === 1);
    check(
      'reconcile: added TR renders a generated-stamped row',
      /- TR-\d{3} \| must \| draft \| BA \| Send a reminder the day before due/.test(rcTrAdd.text) &&
        /<!-- TR-\d{3}: origin=generated -->/.test(rcTrAdd.text),
    );

    const rcTrOmit = reconcileStories(splicedJ.text, [
      echoStory(0, []),
      echoStory(1, [echoTr(genTr2Id, 'Queue the digest email weekly', 'should')]),
    ]);
    const trOmitParsed = parseRequirements(splicedP.text, rcTrOmit.text);
    const trOmit0 = trOmitParsed.stories.find((st: any) => st.usId === us0);
    const trOmit1 = trOmitParsed.stories.find((st: any) => st.usId === us1);
    check(
      'reconcile: omitted TR is genuinely removed, sibling echo untouched',
      (trOmit0?.reqs ?? []).filter((r: any) => r.type === 'TR').length === 0 &&
        (trOmit1?.reqs ?? []).filter((r: any) => r.type === 'TR').length === 1,
    );

    const rcTrUpd = reconcileStories(splicedJ.text, [
      echoStory(0, [echoTr(nextTr, 'Persist a due-back date plus a borrower note', 'must')]),
      echoStory(1, [echoTr(genTr2Id, 'Queue the digest email weekly', 'should')]),
    ]);
    check('reconcile: revised TR counts as changed', rcTrUpd.trCount === 1);
    const trUpdParsed = parseRequirements(splicedP.text, rcTrUpd.text);
    const trUpdRow = trUpdParsed.stories.find((st: any) => st.usId === us0)?.reqs?.find((r: any) => r.id === nextTr);
    eq(
      'reconcile: revised TR keeps its id and text',
      [trUpdRow?.id, trUpdRow?.text],
      [nextTr, 'Persist a due-back date plus a borrower note'],
    );

    const rcKeep = reconcileStories(splicedJ.text, [], [us0, us1]);
    check(
      'reconcile: keep-listed stories survive with no desired set (no-op)',
      rcKeep.text === splicedJ.text && rcKeep.ops.added === 0 && rcKeep.ops.updated === 0 && rcKeep.ops.removed === 0,
    );
    const rcWipe = reconcileStories(splicedJ.text, []);
    eq('reconcile: empty desired wipes only generated stories (ops)', rcWipe.ops, { added: 0, updated: 0, removed: 2 });
    check(
      'reconcile: wiped text keeps manual stories and header',
      rcWipe.text.startsWith('# User journeys') && rcWipe.text.includes('US-01') && rcWipe.text.includes('US-02') && !rcWipe.text.includes(us0),
    );

    const rcUnknown = reconcileStories(splicedJ.text, [
      { usId: 'US-99', title: 'Brand new via unknown echo', asA: 'lender', iWantTo: 'report a tool as lost', soThat: 'the borrower is billed', priority: 'must', trs: [] },
    ]);
    eq('reconcile: unknown echo adds + omitted stories are removed (ops)', rcUnknown.ops, { added: 1, updated: 0, removed: 2 });

    const rcGarbled = reconcileStories(
      splicedJ.text,
      [{ usId: us0, title: '', asA: '', iWantTo: '', soThat: '', priority: 'must', trs: [] }],
      [us0, us1],
    );
    check('reconcile: garbled echo cannot wipe a story (no-op)', rcGarbled.text === splicedJ.text && rcGarbled.ops.updated === 0);

    // BR-level reconcile mirrors the story checks against §8 rows.
    const echoBr = (brId: string | null, text: string, priority: unknown, storyUsId: string | null) => ({
      brId,
      text,
      priority,
      storyUsId,
    });
    const brEchoes = () => [
      echoBr(nextBr, 'Every loan shows its due-back date', 'must', us0),
      echoBr(genBr2Id, 'Overdue items are surfaced weekly', 'should', us1),
    ];

    const rcBrNoChange = reconcileBusinessReqs(splicedP.text, brEchoes());
    check('reconcile: no-change BR echo is a byte-identical no-op (AC-9)', rcBrNoChange.text === splicedP.text);
    eq('reconcile: no-change BR ops are zero', rcBrNoChange.ops, { added: 0, updated: 0, removed: 0 });

    const rcBrUpd = reconcileBusinessReqs(splicedP.text, [
      echoBr(nextBr, 'Every loan shows its due-back date and condition', 'must', us1),
      echoBr(genBr2Id, 'Overdue items are surfaced weekly', 'should', us1),
    ]);
    eq('reconcile: BR update ops', rcBrUpd.ops, { added: 0, updated: 1, removed: 0 });
    const brUpdParsed = parseRequirements(rcBrUpd.text, splicedJ.text);
    const brUpdRow = allBrRows(brUpdParsed).find((r: any) => r.id === nextBr);
    eq(
      'reconcile: BR update rewrites text + story link',
      [brUpdRow?.text, brUpdRow?.storyUsId],
      ['Every loan shows its due-back date and condition', us1],
    );
    check(
      'reconcile: manual BRs survive an update',
      ['BR-001', 'BR-002', 'BR-004'].every((id) => allBrRows(brUpdParsed).some((r: any) => r.id === id)),
    );

    const rcBrRm = reconcileBusinessReqs(splicedP.text, [echoBr(nextBr, 'Every loan shows its due-back date', 'must', us0)]);
    eq('reconcile: omitted BR is removed (ops)', rcBrRm.ops, { added: 0, updated: 0, removed: 1 });
    check('reconcile: removed BR leaves no trace', !rcBrRm.text.includes(genBr2Id));

    const rcBrAdd = reconcileBusinessReqs(splicedP.text, [
      ...brEchoes(),
      { brId: null, text: 'Late fees accrue per calendar day', priority: 'should', storyUsId: null },
    ]);
    eq('reconcile: unknown BR is appended (ops)', rcBrAdd.ops, { added: 1, updated: 0, removed: 0 });
    const brAddParsed = parseRequirements(rcBrAdd.text, splicedJ.text);
    const addedBr = allBrRows(brAddParsed).find((r: any) => r.text === 'Late fees accrue per calendar day');
    const addedBrId = addedBr?.id ?? '';
    check(
      'reconcile: appended BR stamps origin=generated with a fresh id',
      addedBr?.origin === 'generated' &&
        addedBrId !== '' &&
        !['BR-001', 'BR-002', 'BR-004', nextBr, genBr2Id].includes(addedBrId),
    );

    const rcBrKeep = reconcileBusinessReqs(splicedP.text, [], [nextBr, genBr2Id]);
    check(
      'reconcile: keep-listed BRs survive with no desired set (no-op)',
      rcBrKeep.text === splicedP.text && rcBrKeep.ops.added === 0 && rcBrKeep.ops.updated === 0 && rcBrKeep.ops.removed === 0,
    );

    check(
      'reconcile: fileHasGeneratedRows flags spliced journeys only',
      fileHasGeneratedRows(splicedJ.text) === true && fileHasGeneratedRows(journeys0) === false,
    );
    check(
      'reconcile: fileHasGeneratedRows flags spliced PRD only',
      fileHasGeneratedRows(splicedP.text) === true && fileHasGeneratedRows(prd0) === false,
    );

    // ── Stale-run reconcile (round 4, req-gen-state.ts) — the PR #26 round-4
    // failure shape: heartbeats stayed fresh for hours while the nested PRD
    // write-lock never settled, so heartbeat freshness alone proves nothing
    // about liveness. Staleness keys on EITHER a section that overruns
    // SECTION_STALL_MS (20 min, chosen above the model fetch's 15-min abort so
    // a slow-but-alive call can never false-fail) OR a heartbeat older than
    // STALE_MS; legacy states without a section stamp keep the heartbeat-only
    // fallback so the two pre-fix stuck runs (projects 10, 12) still recover
    // on a dev-server restart. Exercised in-process: req-gen-state.ts's only
    // runtime import is fs/path (the BaGenerationState import is type-only),
    // so it loads without the sqlite gate. ──
    const { reconcileStale } = await import('../server/req-gen-state.js');
    const sentinelDir = path.join(LAUNCHER, 'data', 'req-gen');
    const sentinelId = 98888;
    const sentinelPath = path.join(sentinelDir, `${sentinelId}.json`);
    const nowSt = Date.now();
    const fresh = (over: Record<string, unknown>) => ({
      state: 'generating',
      generated: 1,
      total: 2,
      currentSection: 'user stories',
      startedAt: nowSt - 3 * 60_000,
      lastHeartbeatAt: nowSt - 10_000,
      sectionStartedAt: nowSt - 10_000,
      error: null,
      ...over,
    });
    const readSentinel = () => JSON.parse(fs.readFileSync(sentinelPath, 'utf-8'));
    try {
      fs.mkdirSync(sentinelDir, { recursive: true });
      fs.writeFileSync(sentinelPath, JSON.stringify(fresh({})));
      check('staleness: fresh section + fresh heartbeat stays generating', reconcileStale(sentinelId, readSentinel()).state === 'generating');
      fs.writeFileSync(sentinelPath, JSON.stringify(fresh({ sectionStartedAt: nowSt - 21 * 60_000 })));
      const stalled = reconcileStale(sentinelId, JSON.parse(fs.readFileSync(sentinelPath, 'utf-8')));
      check('staleness: section past SECTION_STALL_MS with fresh heartbeat → failed', stalled.state === 'failed');
      check('staleness: stall error names the wedged section', /Generation of user stories stalled/.test(stalled.error ?? ''));
      fs.writeFileSync(sentinelPath, JSON.stringify(fresh({ lastHeartbeatAt: nowSt - 10 * 60_000 })));
      check('staleness: fresh section but dead heartbeat → failed', reconcileStale(sentinelId, readSentinel()).state === 'failed');
      fs.writeFileSync(sentinelPath, JSON.stringify(fresh({ sectionStartedAt: undefined, lastHeartbeatAt: nowSt - 10_000 })));
      check('staleness: legacy no-section-stamp + fresh heartbeat stays generating (recovery fallback)', reconcileStale(sentinelId, readSentinel()).state === 'generating');
      fs.writeFileSync(sentinelPath, JSON.stringify(fresh({ sectionStartedAt: undefined, lastHeartbeatAt: nowSt - 10 * 60_000 })));
      check('staleness: legacy no-section-stamp + dead heartbeat → failed', reconcileStale(sentinelId, readSentinel()).state === 'failed');
      fs.writeFileSync(sentinelPath, JSON.stringify(fresh({ state: 'pending', lastHeartbeatAt: nowSt - 10 * 60_000 })));
      check('staleness: pending state with dead heartbeat → failed', reconcileStale(sentinelId, readSentinel()).state === 'failed');
    } finally {
      fs.rmSync(sentinelPath, { force: true });
    }

    // ── Req-gen routes at runtime: idle before the gate, 409 while the 17
    // artifacts are not all Approved (Ollama is not exercised here — the job
    // needs a live model; the state machine is covered by the reconciled-read
    // design in req-gen-state.ts and the splice checks above). ──
    r = await reqFetch(`/api/projects/${slug}/requirements-generation-status`);
    check('req-gen: GET status before gate → idle', r.status === 200 && r.body.status === 'idle');
    r = await json(`/api/projects/${slug}/trigger-requirements-generation`, 'POST', {});
    check('req-gen: trigger while artifacts unapproved → 409', r.status === 409);
    // The route's first guard is the context gate (fires before the artifact check
    // on an unconfirmed fixture) — assert the 409 carries a server-side reason.
    check('req-gen: 409 carries a server-side reason', typeof r.body?.error === 'string' && r.body.error.length > 0);

    // ── Requirements staleness + reconcile trigger (fix #3). Runtime wiring:
    // a done run whose artifacts changed since it finished (artifactsChanged,
    // set by the per-file transition / reopen-all routes) flips
    // requirementsStale on GET /files and lets the trigger re-run in
    // reconcile mode; a done run WITHOUT the flag keeps the done-guard 409.
    //
    // Ordering: these run BEFORE the reopen-all tests below — the approved
    // fixture's trigger must reach a terminal state (failed, via the dead
    // OLLAMA_HOST) before the mid-run 409 test overwrites the same state
    // file, and the mixed fixture is restored to 5 Approved via a direct DB
    // patch (the AC-30 gate blocks draft→in_review without edited_since_send,
    // so the API cannot restore it). ──
    const approvedSlug = 'req-verify-approved';
    const mixedSlug = 'req-verify-mixed';
    const genStatePath = (pid: number) => path.join(tmp, 'data', 'req-gen', `${pid}.json`);
    const readGenState = (pid: number): any => {
      try {
        return JSON.parse(fs.readFileSync(genStatePath(pid), 'utf8'));
      } catch {
        return null;
      }
    };
    const writeGenState = (pid: number, over: Record<string, unknown>) => {
      fs.mkdirSync(path.join(tmp, 'data', 'req-gen'), { recursive: true });
      fs.writeFileSync(
        genStatePath(pid),
        JSON.stringify({
          state: 'done',
          generated: 2,
          total: 2,
          startedAt: Date.now(),
          lastHeartbeatAt: Date.now(),
          error: null,
          ...over,
        }),
      );
    };
    const waitForGenState = async (pid: number, pred: (s: any) => boolean, what: string): Promise<boolean> => {
      for (let i = 0; i < 100; i++) {
        const s = readGenState(pid);
        if (s && pred(s)) return true;
        await new Promise((res) => setTimeout(res, 100));
      }
      console.log(`    [waitForGenState] ${what} timed out; last: ${JSON.stringify(readGenState(pid))}`);
      return false;
    };

    // Seed origin=generated rows into the approved fixture's PRD dir — the
    // done-guard and requirementsStale both key on generated rows existing
    // (agent-invoker has its own fs wrapper; these files are the input).
    const GENERATED_JOURNEYS_FIXTURE = [
      '# User journeys',
      '',
      '### US-90 — Generated fixture story',
      '<!-- story: priority=must status=draft owner=BA origin=generated -->',
      '',
      '**As a** tester, **I want to** exercise reconcile, **so that** staleness flips.',
      '',
      '- TR-900 | must | draft | BA | Synthetic generated TR row.',
      '<!-- TR-900: origin=generated -->',
      '',
    ].join('\n');
    const GENERATED_PRD_FIXTURE = [
      '# PRD',
      '',
      '## 8. Business requirements',
      '',
      '- BR-900 | must | draft | BA | Synthetic generated BR row.',
      '<!-- BR-900: story=US-90, origin=generated -->',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(approvedDir, 'PRD', 'user-journeys.md'), GENERATED_JOURNEYS_FIXTURE);
    fs.writeFileSync(path.join(approvedDir, 'PRD', 'prd.md'), GENERATED_PRD_FIXTURE);

    // 1 — done run with no flag: not stale, trigger still 409s (done-guard).
    writeGenState(seedIds.approved, {});
    r = await reqFetch(`/api/projects/${approvedSlug}/ba-workspace/files`);
    check('stale: GET /files → 17 files, not stale with no flag', r.status === 200 && r.body?.files?.length === 17 && r.body?.requirementsStale === false);
    r = await json(`/api/projects/${approvedSlug}/trigger-requirements-generation`, 'POST', {});
    check('stale: trigger on done run without flag → 409 already generated', r.status === 409 && /already generated/i.test(String(r.body?.error)));

    // 2 — same done run + flag: requirementsStale flips on GET /files.
    writeGenState(seedIds.approved, { artifactsChanged: true });
    r = await reqFetch(`/api/projects/${approvedSlug}/ba-workspace/files`);
    eq('stale: requirementsStale true once artifacts changed', r.body?.requirementsStale, true);

    // 3 — trigger now re-enters reconcile: route 200, run labelled reconcile.
    r = await json(`/api/projects/${approvedSlug}/trigger-requirements-generation`, 'POST', {});
    check('stale: trigger on done run with flag → 200 reconcile', r.status === 200 && r.body?.ok === true);
    r = await reqFetch(`/api/projects/${approvedSlug}/requirements-generation-status`);
    check('stale: status labels the run reconcile', r.body?.mode === 'reconcile');

    // 4 — the run fails in ms (dead OLLAMA_HOST) but MUST keep
    // artifactsChanged=true + mode=reconcile on the failed state: a dropped
    // flag would make the retry fall back to generate mode and clobber or
    // silently no-op the reconciliation.
    const staleFlagSurvived = await waitForGenState(
      seedIds.approved,
      (s) => s.state === 'failed',
      'stale: waiting for failed run',
    );
    check('stale: failed reconcile run reached terminal state', staleFlagSurvived === true);
    eq('stale: failed run keeps artifactsChanged=true', readGenState(seedIds.approved)?.artifactsChanged, true);
    eq('stale: failed run keeps mode=reconcile', readGenState(seedIds.approved)?.mode, 'reconcile');

    // 5 — per-file transition mid-run → 409 (fresh heartbeats defeat
    // reconcileStale; the guard keys on raw pending/generating).
    writeGenState(seedIds.mixed, {
      state: 'generating',
      currentSection: 'user stories',
      sectionStartedAt: Date.now(),
      generated: 0,
    });
    r = await json(`/api/projects/${mixedSlug}/ba-workspace/files/personas.md/transition`, 'POST', { to: 'draft' });
    check('stale: per-file revert mid-run → 409 running', r.status === 409 && /running/i.test(String(r.body?.error)));

    // 6 — same revert on a done run → 200, and the route persists
    // artifactsChanged=true (the staleness signal for the next trigger).
    writeGenState(seedIds.mixed, {});
    r = await json(`/api/projects/${mixedSlug}/ba-workspace/files/personas.md/transition`, 'POST', { to: 'draft' });
    eq('stale: per-file revert on done run → 200 draft', [r.body?.ok, r.body?.filename, r.body?.status], [true, 'personas.md', 'draft']);
    eq('stale: revert persists artifactsChanged=true', readGenState(seedIds.mixed)?.artifactsChanged, true);

    // Restore the mixed fixture to 5 Approved for the reopen-all tests below
    // (AC-30 blocks draft→in_review via the API without edited_since_send, so
    // patch the DB directly), and clear the flag so reopen-all starts clean.
    const patchPath = path.join(tmp, 'patch-mixed.mts');
    fs.writeFileSync(
      patchPath,
      `import { db } from './server/db.js';\n` +
        `const info = db.prepare("UPDATE ba_artifacts_status SET status = 'approved' WHERE project_id = ${seedIds.mixed} AND filename IN (${BA_ARTIFACTS.slice(0, 5).map((f) => `'${f}'`).join(',')})").run();\n` +
        `console.log('PATCH_OK ' + info.changes);\n`,
    );
    const patchOut = execFileSync(path.join(LAUNCHER, 'node_modules', '.bin', 'tsx'), [patchPath], { cwd: LAUNCHER }).toString();
    check('stale: mixed fixture restored to 5 approved', /PATCH_OK 5/.test(patchOut));
    fs.rmSync(genStatePath(seedIds.mixed), { force: true });

    // ── BA-workspace reopen-all (PR #26 follow-up: bulk "send all back to
    // Draft" on the confirmed State D card). One atomic UPDATE of
    // ba_artifacts_status flips every Approved artifact back to Draft; the
    // fixtures are req-verify-approved (all 17 on disk, all Approved, context
    // confirmed) and req-verify-mixed (5 Approved + 12 Draft). The 409 mid-run
    // test writes a req-gen state file with a FRESH heartbeat + section stamp
    // so reconcileStale (req-gen-state.ts) leaves it generating — the route's
    // guard keys on the raw pending/generating state, not staleness. ──

    // 404 — unknown project.
    r = await json(`/api/projects/does-not-exist/background/reopen-all`, 'POST', {});
    check('reopen-all: unknown project → 404', r.status === 404);

    // 409 — requirements generation mid-run. The state file lives at
    // <tmp>/data/req-gen/<projectId>.json (req-gen-state DIR resolves against
    // the copied server dir → tmp/data/req-gen).
    const reopenNow = Date.now();
    const reqGenDir = path.join(tmp, 'data', 'req-gen');
    fs.mkdirSync(reqGenDir, { recursive: true });
    const midRunPath = path.join(reqGenDir, `${seedIds.approved}.json`);
    fs.writeFileSync(
      midRunPath,
      JSON.stringify({
        state: 'generating',
        generated: 1,
        total: 2,
        currentSection: 'user stories',
        startedAt: reopenNow - 3 * 60_000,
        lastHeartbeatAt: reopenNow - 10_000,
        sectionStartedAt: reopenNow - 10_000,
        error: null,
      }),
    );
    r = await json(`/api/projects/${approvedSlug}/background/reopen-all`, 'POST', {});
    check('reopen-all: mid-run generation → 409', r.status === 409);
    check('reopen-all: 409 carries a server-side reason', typeof r.body?.error === 'string' && r.body.error.length > 0);
    // Clear the state file so the 200-path tests below are not blocked.
    fs.rmSync(midRunPath, { force: true });

    // 200 — full reopen on the approved fixture: all 17 flip to Draft.
    r = await json(`/api/projects/${approvedSlug}/background/reopen-all`, 'POST', {});
    check('reopen-all: full reopen → 200 ok', r.status === 200 && r.body?.ok === true);
    eq('reopen-all: full reopen → reopened 17', r.body?.reopened, 17);

    // GET /files after reopen — every artifact Draft, contextReady false, and
    // contextChangedSinceConfirm true (confirmed but no longer ready). The
    // files array follows BA_BANDS order, matching BA_ARTIFACTS above.
    r = await reqFetch(`/api/projects/${approvedSlug}/ba-workspace/files`);
    check('reopen-all: GET /files → 200', r.status === 200);
    eq('reopen-all: all 17 files back to Draft', r.body?.files?.map((f: any) => f.status), BA_ARTIFACTS.map(() => 'draft'));
    eq('reopen-all: contextReady false after reopen', r.body?.contextReady, false);
    eq('reopen-all: contextChangedSinceConfirm true (confirmed, no longer ready)', r.body?.contextChangedSinceConfirm, true);
    eq('reopen-all: contextConfirmed still true (warn-only, no re-lock)', r.body?.contextConfirmed, true);

    // Idempotent — nothing Approved → reopened 0, no activity row.
    r = await json(`/api/projects/${approvedSlug}/background/reopen-all`, 'POST', {});
    eq('reopen-all: second call → reopened 0 (idempotent)', r.body?.reopened, 0);

    // Partial — the mixed fixture has 5 Approved + 12 Draft → only 5 flip.
    r = await json(`/api/projects/${mixedSlug}/background/reopen-all`, 'POST', {});
    eq('reopen-all: partial reopen → reopened 5', r.body?.reopened, 5);
    r = await reqFetch(`/api/projects/${mixedSlug}/ba-workspace/files`);
    eq('reopen-all: mixed fixture now all Draft', r.body?.files?.map((f: any) => f.status), BA_ARTIFACTS.map(() => 'draft'));
  } finally {
    child.kill('SIGTERM');
    await new Promise((res) => setTimeout(res, 300));
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`\n[verify-requirements] ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log('Failures:\n - ' + failures.join('\n - '));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('[verify-requirements] crashed:', e);
  process.exitCode = 1;
});
