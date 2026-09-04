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

  // Isolated server copy + node_modules link + isolated DB (never the dev DB).
  fs.symlinkSync(path.join(LAUNCHER, 'node_modules'), path.join(tmp, 'node_modules'), 'dir');
  fs.cpSync(path.join(LAUNCHER, 'server'), path.join(tmp, 'server'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'data'));

  const seedPath = path.join(tmp, 'seed.mts');
  fs.writeFileSync(
    seedPath,
    `import { migrate, db } from './server/db.js';\n` +
      `migrate();\n` +
      `const info = db.prepare("INSERT INTO project (name, slug, one_liner, folder_path, current_stage, status) VALUES (?, ?, ?, ?, 'PRD', 'active')").run(\n` +
      `  'Req Verify Fixture', 'req-verify-fixture', 'fixture', ${JSON.stringify(projDir)});\n` +
      `db.prepare("INSERT INTO project (name, slug, one_liner, folder_path, current_stage, status) VALUES (?, ?, ?, ?, 'PRD', 'active')").run(\n` +
      `  'Req Verify Empty', 'req-verify-empty', 'fixture', ${JSON.stringify(emptyDir)});\n` +
      `console.log('seeded', info.lastInsertRowid);\n`,
  );
  execFileSync(path.join(LAUNCHER, 'node_modules', '.bin', 'tsx'), [seedPath], { cwd: LAUNCHER });

  const child = spawn(path.join(LAUNCHER, 'node_modules', '.bin', 'tsx'), [path.join(tmp, 'server', 'index.ts')], {
    cwd: LAUNCHER,
    env: { ...process.env, PORT: String(port) },
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