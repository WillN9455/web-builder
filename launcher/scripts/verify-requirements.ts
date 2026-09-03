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
    eq('BR gets lowest free id BR-003 (AC-8)', r.body?.requirement?.id, 'BR-003');
    const brAfter = read(prdPath);
    const brDiff = lcsDiff(beforeP, brAfter);
    eq(
      'BR insert adds exactly 1 line, removes none (AC-9)',
      brDiff,
      { added: [brAfter.split('\n').find((l) => l.startsWith('- BR-003 |')) ?? ''], removed: [] },
    );
    eq('user-journeys.md byte-identical after BR (AC-9)', read(journeysPath), afterJ);

    // ── POST TR → the story block ──
    r = await json(`/api/projects/${slug}/stories/US-02/requirements`, 'POST', {
      type: 'TR',
      text: 'Reservations must expire automatically after 24 hours without pickup.',
      priority: 'should',
      status: 'draft',
      owner: 'DEV',
    });
    check('POST TR → 201 TR-002', r.status === 201 && r.body?.requirement?.id === 'TR-002');
    const trAfter = read(journeysPath);
    const trDiff = lcsDiff(afterJ, trAfter);
    eq(
      'TR lands inside the US-02 block — one inserted row, nothing else (AC-9)',
      { removed: trDiff.removed, added: trDiff.added },
      { removed: [], added: [trDiff.added.find((l) => l.startsWith('- TR-002 |')) ?? ''] },
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

    // ── PATCH story (surgical heading splice) ──
    r = await json(`/api/projects/${slug}/stories/US-03`, 'PATCH', { title: 'Return an item before it is due' });
    check('PATCH story title → 200', r.status === 200);
    check('US-03 heading spliced (AC-9)', read(journeysPath).includes('### US-03 — Return an item before it is due'));
    const titleDiff = lcsDiff(trAfter, read(journeysPath));
    eq('title splice replaces exactly 1 line', { added: titleDiff.added.length, removed: titleDiff.removed.length }, { added: 1, removed: 1 });

    // ── PATCH requirement meta ──
    r = await json(`/api/projects/${slug}/requirements/TR-002`, 'PATCH', { priority: 'must', owner: 'BA' });
    check('PATCH req meta → 200', r.status === 200);
    check('row re-rendered in place', read(journeysPath).includes('- TR-002 | must | draft | BA |'));

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
    r = await json(`/api/projects/${slug}/requirements/TR-001/status`, 'PATCH', { status: 'approved' });
    check('TR-001 in_review → approved → 200', r.status === 200);
    r = await reqFetch(`/api/projects/${slug}/requirements/TR-001`, { method: 'DELETE' });
    check('delete guard → 409 with referencedBy US-02 (AC-11)', r.status === 409 && JSON.stringify(r.body?.referencedBy) === '["US-02"]');
    check('guarded row NOT struck on disk', read(journeysPath).includes('- TR-001 | must | approved | DEV |'));

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

    // Freed number is reusable (spec DATA: BR/TR ids recycle)
    r = await json(`/api/projects/${slug}/stories/US-03/requirements`, 'POST', {
      type: 'BR',
      text: 'A brand-new business requirement to prove the freed id is reused.',
      priority: 'could',
      status: 'draft',
      owner: 'BA',
    });
    eq('freed BR-002 id reused (AC-8)', r.body?.requirement?.id, 'BR-002');

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