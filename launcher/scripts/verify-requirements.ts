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
  reconcileFeatures,
  requireRows,
  spliceBusinessReqs,
  spliceFeatures,
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

const FEATURES_MD = [
  '# Features',
  '',
  '### FE-01 — List an item for lending',
  '<!-- feature: priority=must status=in_review owner=BA origin=manual -->',
  '<!-- source: user-journeys.md §3 -->',
  'Household owners can list an item with title, photo, condition, and pickup window so that nearby borrowers can find and request it.',
  '',
  '## Acceptance Criteria',
  '- AC-001 | met | The list form must expose title, photo, condition, and pickup window.',
  '<!-- AC-001: origin=manual -->',
  '- TR-001 | must | in_review | DEV | Photo uploads must use signed URLs and store objects in the project bucket with public-read disabled.',
  '<!-- TR-001: origin=manual -->',
  '',
  '### FE-02 — Reserve an item',
  '<!-- feature: priority=should status=draft owner=SA origin=manual -->',
  'Borrowers can reserve an available item for pickup so that nearby borrowers can plan around TR-001 pickup windows.',
  '',
  '## Acceptance Criteria',
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
  const featuresPath = path.join(projDir, 'PRD', 'features.md');
  fs.writeFileSync(prdPath, PRD_MD);
  fs.writeFileSync(featuresPath, FEATURES_MD);

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
    const features0 = read(featuresPath);

    // ── GET (AC-10: populated + no-prd, never 500) ──
    let r = await reqFetch(`/api/projects/${slug}/requirements`);
    check('GET populated → 200 source ok', r.status === 200 && r.body.source === 'ok');
    eq('businessReqs = 3 (incl. the legacy BR-004)', r.body.businessReqs?.length, 3);
    eq('features = 2', r.body.features?.length, 2);
    eq('FE-01 carries TR-001', r.body.features?.[0]?.reqs?.map((x: any) => x.id), ['TR-001']);
    eq('FE-01 carries AC-001', r.body.features?.[0]?.acs?.map((a: any) => a.id), ['AC-001']);

    r = await reqFetch(`/api/projects/${emptySlug}/requirements`);
    check('GET no-prd → 200 with no-prd empty state (AC-10)', r.status === 200 && r.body.source === 'no-prd');

    // ── Containment (AC-10) ──
    r = await reqFetch('/api/projects/..%2F..%2Fetc/requirements');
    check('path-traversal slug → not 200 / no data leak', r.status !== 200);
    r = await reqFetch('/api/projects/req-verify-nonexistent/requirements');
    check('unknown project → 404', r.status === 404);

    // ── POST feature (AC-4/8/9): appends FE-03 to features.md only ──
    const beforeF = read(featuresPath);
    const beforeP = read(prdPath);
    r = await json(`/api/projects/${slug}/features`, 'POST', {
      title: 'Return an item on time',
      description: 'Borrowers hand items back before the due date so the next borrower can pick them up without delay.',
      source: null,
      priority: 'should',
      status: 'draft',
      owner: 'BA',
    });
    check('POST feature → 201', r.status === 201);
    eq('new feature id is lowest free (AC-8)', r.body?.feature?.feId, 'FE-03');
    const afterF = read(featuresPath);
    check('features.md grew append-only (AC-9)', afterF.startsWith(beforeF));
    eq('prd.md byte-identical (AC-9)', read(prdPath), beforeP);

    // ── POST BR → feature block in features.md (feature-scoped endpoint) ──
    r = await json(`/api/projects/${slug}/features/FE-03/requirements`, 'POST', {
      type: 'BR',
      text: 'Returned items must reappear in the list within 10 seconds of check-in.',
      priority: 'must',
      status: 'draft',
      owner: 'BA',
    });
    check('POST BR → 201', r.status === 201);
    // QA-10: per-feature BR allocation. FE-03's linked-BR pool is empty, so
    // the new row takes BR-001 — the same id a TR-001 would use, which
    // is now expected behaviour, not a clash (BR and TR namespaces are
    // separate). The legacy global allocator would have produced BR-003.
    eq('BR gets per-feature lowest free id BR-001 (QA-10)', r.body?.requirement?.id, 'BR-001');
    const brAfter = read(prdPath);
    const brDiff = lcsDiff(beforeP, brAfter);
    eq(
      'BR insert adds exactly 2 lines (row + feature link), removes none (AC-9 / 2.7)',
      brDiff,
      {
        added: [
          // QA-10: per-feature allocation; FE-03's pool is empty, so the
          // new row takes BR-001 — same id the legacy BR-001 in
          // businessReqs carries. They live in different scopes and never
          // collide on disk. Find the *new* row by its unique text.
          brAfter
            .split('\n')
            .filter((l) => l.startsWith('- BR-001 |') && l.includes('Returned items must reappear'))
            .pop() ?? '',
          '<!-- BR-001: feature=FE-03, origin=manual -->',
        ],
        removed: [],
      },
    );
    eq('features.md byte-identical after BR (AC-9)', read(featuresPath), afterF);

    // ── BR-under-feature (item 2.7) — GET must move BR-001 into FE-03's reqs,
    //    and legacy BR-004 (no feature link) stays in businessReqs.
    const afterBrGet = await reqFetch(`/api/projects/${slug}/requirements`);
    const feForFe03 = afterBrGet.body?.features?.find((f: any) => f.feId === 'FE-03');
    check('BR-001 lands inside FE-03 (item 2.7)', !!feForFe03 && feForFe03.reqs.some((r: any) => r.id === 'BR-001'));
    eq(
      'BR-001 carries featureId=FE-03 (item 2.7)',
      feForFe03?.reqs?.find((r: any) => r.id === 'BR-001')?.featureId,
      'FE-03',
    );
    eq(
      'legacy BRs (no link) stay in businessReqs (item 2.7)',
      afterBrGet.body?.businessReqs?.map((b: any) => b.id).sort().join(','),
      ['BR-001', 'BR-002', 'BR-004'].sort().join(','),
    );
    eq(
      'BR-001 carries origin=manual (item 2.6)',
      feForFe03?.reqs?.find((r: any) => r.id === 'BR-001')?.origin,
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

    // ── POST TR → the feature block (feature-scoped endpoint, slice 2) ──
    r = await json(`/api/projects/${slug}/features/FE-02/requirements`, 'POST', {
      type: 'TR',
      text: 'Reservations must expire automatically after 24 hours without pickup.',
      priority: 'should',
      status: 'draft',
      owner: 'DEV',
    });
    check('POST TR → 201 TR-001 (per-feature, FE-02 pool empty)', r.status === 201 && r.body?.requirement?.id === 'TR-001');
    const trAfter = read(featuresPath);
    const trDiff = lcsDiff(afterF, trAfter);
    eq(
      'TR lands inside the FE-02 block — one inserted row + origin marker (AC-9 / QA-2)',
      { removed: trDiff.removed, added: trDiff.added },
      {
        removed: [],
        added: [
          trDiff.added.find((l) => l.startsWith('- TR-001 |')) ?? '',
          '<!-- TR-001: origin=manual -->',
        ],
      },
    );

    // ── Story-first rule (redesigned): body carrying a feature field → 422 ──
    r = await json(`/api/projects/${slug}/features/FE-02/requirements`, 'POST', {
      type: 'TR',
      text: 'Reservations must expire automatically after 24 hours without pickup.',
      priority: 'should',
      status: 'draft',
      owner: 'DEV',
      feature: { title: 'sneaky' },
    });
    check('POST requirement with feature field → 422', r.status === 422);

    // QA-5: a second POST into the same feature must NOT land the new
    // [row, marker] pair between the previous TR and its trailing
    // `<!-- TR-NNN: origin=manual -->` comment — otherwise the previous
    // row's marker detaches, parses origin=null on re-parse, and the
    // file contract is scrambled. The new row pair lands AFTER the
    // previous marker. Same for BR: a second BR into FE-03 must not
    // detach the first BR's `feature=FE-03` link.
    r = await json(`/api/projects/${slug}/features/FE-02/requirements`, 'POST', {
      type: 'TR',
      text: 'A second TR into FE-02 — the marker-aware insert index must keep TR-001 glued to its origin marker.',
      priority: 'could',
      status: 'draft',
      owner: 'BA',
    });
    // QA-10: per-feature allocation. FE-02's TR pool now has TR-001, so the
    // second TR is TR-002 (not the legacy global TR-003).
    check('second POST TR into FE-02 → 201 TR-002 (QA-5 + QA-10)', r.status === 201 && r.body?.requirement?.id === 'TR-002');
    check(
      'QA-5: TR-001 origin marker stays glued to its row on a second POST',
      read(featuresPath).indexOf('- TR-001 |') < read(featuresPath).indexOf('<!-- TR-001: origin=manual -->') &&
        read(featuresPath).indexOf('<!-- TR-001: origin=manual -->') < read(featuresPath).indexOf('- TR-002 |'),
    );
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    const tr001AfterSecond = r.body.features
      .find((f: any) => f.feId === 'FE-02')
      ?.reqs.find((x: any) => x.id === 'TR-001');
    eq('QA-5: TR-001 origin=manual after second POST (parsed)', tr001AfterSecond?.origin, 'manual');

    r = await json(`/api/projects/${slug}/features/FE-03/requirements`, 'POST', {
      type: 'BR',
      text: 'A second BR into FE-03 — the marker-aware insert must keep BR-001 glued to its feature link.',
      priority: 'could',
      status: 'draft',
      owner: 'BA',
    });
    // QA-10: FE-03's linked-BR pool now has BR-001, so the second BR is
    // BR-002 (not the legacy global BR-005).
    check('second POST BR into FE-03 → 201 BR-002 (QA-5 + QA-10)', r.status === 201 && r.body?.requirement?.id === 'BR-002');
    // QA-10: per-feature numbering means the fixture's legacy BR-001 still
    // exists in §8 alongside FE-03's new BR-001. Anchor the row/marker
    // proximity check on the linked row's marker line (find from the
    // marker backward to the nearest preceding BR-001 row line).
    {
      const text = read(prdPath);
      const m1 = text.indexOf('<!-- BR-001: feature=FE-03, origin=manual -->');
      const m2 = text.indexOf('<!-- BR-002: feature=FE-03, origin=manual -->');
      const i1 = m1 === -1 ? -1 : text.lastIndexOf('- BR-001 |', m1);
      const i2 = m2 === -1 ? -1 : text.lastIndexOf('- BR-002 |', m2);
      check(
        'QA-5: BR-001 feature link stays glued to its row on a second BR POST',
        i1 !== -1 && m1 !== -1 && m2 !== -1 && i2 !== -1 && i1 < m1 && m1 < i2 && i2 < m2,
      );
    }
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    const fe03AfterSecond = r.body.features.find((f: any) => f.feId === 'FE-03');
    check(
      'QA-5: BR-001 still rendered inside FE-03 after second BR POST (link intact)',
      !!fe03AfterSecond && fe03AfterSecond.reqs.some((x: any) => x.id === 'BR-001'),
    );
    check(
      'QA-5: BR-002 lands inside FE-03 too',
      !!fe03AfterSecond && fe03AfterSecond.reqs.some((x: any) => x.id === 'BR-002'),
    );

    // ── QA-14: linked-BR writes must land in prd.md, never features.md ──
    // The scoped locateReq (slice 1) resolves BR rows to prd.md and TR rows
    // to features.md by row TYPE — a linked BR living inside FE-03 must
    // still be struck in prd.md at the right index, never in features.md
    // (the original QA-14 failure shape). FE-03's linked BR-002 (POSTed
    // above) is the probe row.
    const qa14FeaturesBefore = read(featuresPath);
    r = await json(`/api/projects/${slug}/requirements/BR-002?feId=FE-03`, 'PATCH', { text: 'QA-14 linked-BR edit probe' });
    check('QA-14: PATCH linked BR-002 (feId=FE-03) → 200', r.status === 200);
    check(
      'QA-14: linked BR text edit landed in prd.md',
      /- BR-002 \| could \| draft \| BA \| QA-14 linked-BR edit probe/.test(read(prdPath)),
    );
    eq('QA-14: features.md byte-identical after linked-BR PATCH (AC-9)', read(featuresPath), qa14FeaturesBefore);
    // PR #28 security lens: the `?feId` query param is grammar-validated like
    // every other ID param — malformed input is rejected 400, never 404'd
    // through the lookup (which would read as "row missing" instead of
    // "request malformed").
    r = await json(`/api/projects/${slug}/requirements/BR-002?feId=FE`, 'PATCH', { text: 'malformed feId probe' });
    check('malformed feId query param → 400 (not a lookup miss)', r.status === 400);
    r = await json(`/api/projects/${slug}/requirements/BR-002/status?feId=NOT-FE`, 'PATCH', { status: 'in_review' });
    check('malformed feId on status route → 400', r.status === 400);
    r = await json(`/api/projects/${slug}/requirements/BR-002/status?feId=FE-03`, 'PATCH', { status: 'in_review' });
    check('QA-14: status PATCH on linked BR-002 → 200', r.status === 200);
    check(
      'QA-14: linked BR status change landed in prd.md',
      /- BR-002 \| could \| in_review \| BA \| QA-14 linked-BR edit probe/.test(read(prdPath)),
    );
    eq('QA-14: features.md byte-identical after linked-BR status PATCH', read(featuresPath), qa14FeaturesBefore);
    r = await json(`/api/projects/${slug}/requirements/BR-002?feId=FE-03`, 'PATCH', {
      text: 'A second BR into FE-03 — the marker-aware insert must keep BR-001 glued to its feature link.',
    });
    check('QA-14: linked BR text reset → 200', r.status === 200);

    // ── PATCH feature (surgical heading splice) ──
    r = await json(`/api/projects/${slug}/features/FE-03`, 'PATCH', { title: 'Return an item before it is due' });
    check('PATCH feature title → 200', r.status === 200);
    check('FE-03 heading spliced (AC-9)', read(featuresPath).includes('### FE-03 — Return an item before it is due'));
    const titleDiff = lcsDiff(trAfter, read(featuresPath));
    eq('title splice replaces exactly 1 line', { added: titleDiff.added.length, removed: titleDiff.removed.length }, { added: 3, removed: 1 });

    // QA-2: feature origin stamping — FE-03 was POSTed in this run, so its
    // meta comment should carry origin=manual; the wire format surfaces it.
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    const fe03Origin = r.body?.features?.find((f: any) => f.feId === 'FE-03')?.origin;
    check('FE-03 origin=manual after POST (QA-2)', fe03Origin === 'manual');
    check('FE-03 meta comment carries origin=manual (QA-2)', read(featuresPath).includes('<!-- feature: priority=should status=draft owner=BA origin=manual -->'));

    // The fixture's legacy blocks stamp an explicit origin=manual token in
    // their meta comments, so the wire value is 'manual' — the null→manual
    // coalescing only applies to meta comments missing the token entirely.
    const fe01Origin = r.body?.features?.find((f: any) => f.feId === 'FE-01')?.origin;
    check('legacy FE-01 origin=manual on the wire (QA-2)', fe01Origin === 'manual');

    // ── PATCH requirement meta ──
    // QA-10: per-feature allocation, so the first TR into FE-02 is TR-001
    // (not TR-002 as the legacy global allocator would produce). Pass
    // feId to disambiguate from FE-01's TR-001.
    r = await json(`/api/projects/${slug}/requirements/TR-001?feId=FE-02`, 'PATCH', { priority: 'must', owner: 'BA' });
    check('PATCH req meta → 200', r.status === 200);
    check('row re-rendered in place', read(featuresPath).includes('- TR-001 | must | draft | BA |'));

    // ── DES owner round-trip (refinement batch item 2.5) ──
    r = await json(`/api/projects/${slug}/requirements/TR-001?feId=FE-02`, 'PATCH', { owner: 'DES' });
    check('PATCH req owner=DES → 200', r.status === 200);
    check('DES owner re-rendered in place', read(featuresPath).includes('- TR-001 | must | draft | DES |'));
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    const tr001InFe02 = r.body.features.find((f: any) => f.feId === 'FE-02')?.reqs.find((x: any) => x.id === 'TR-001');
    check('GET FE-02 TR-001 owner = DES', tr001InFe02?.owner === 'DES');
    // Reset to BA so later assertions still match the fixture
    r = await json(`/api/projects/${slug}/requirements/TR-001?feId=FE-02`, 'PATCH', { owner: 'BA' });
    check('PATCH req owner=BA reset → 200', r.status === 200);

    // ── QA-13: per-feature formInitial scoping on the client ──
    // Both FE-01 (legacy) and FE-02 (POSTed above) now carry a `TR-001`.
    // PATCH with feId=FE-02 must only mutate FE-02's row, leaving
    // FE-01's fixture text untouched. The text discriminator proves the
    // server scoped the lookup (FE-01 still says "Photo uploads…", FE-02
    // now says the QA-13 probe).
    r = await json(`/api/projects/${slug}/requirements/TR-001?feId=FE-02`, 'PATCH', { text: 'QA-13 edit probe' });
    check('PATCH TR-001 with feId=FE-02 → 200', r.status === 200);
    const featuresAfterQa13 = read(featuresPath);
    check(
      'QA-13: PATCH hits FE-02 TR-001 only — FE-02 row carries probe text',
      /- TR-001 \| must \| draft \| BA \| QA-13 edit probe/.test(featuresAfterQa13),
    );
    check(
      'QA-13: FE-01 TR-001 text is unchanged (Photo uploads…)',
      featuresAfterQa13.includes(
        '- TR-001 | must | in_review | DEV | Photo uploads must use signed URLs and store objects in the project bucket with public-read disabled.',
      ),
    );
    // GET confirms the API surface still resolves to FE-02's row only.
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    const qa13Fe02 = r.body.features.find((f: any) => f.feId === 'FE-02')?.reqs.find((x: any) => x.id === 'TR-001');
    const qa13Fe01 = r.body.features.find((f: any) => f.feId === 'FE-01')?.reqs.find((x: any) => x.id === 'TR-001');
    eq('QA-13: GET FE-02 TR-001 text = probe', qa13Fe02?.text, 'QA-13 edit probe');
    eq('QA-13: GET FE-01 TR-001 text = original fixture', qa13Fe01?.text?.startsWith('Photo uploads'), true);
    // Reset FE-02 TR-001 back to its original text so later assertions
    // (the QA-5 TR-001 marker test, the delete-guard test, etc.) still match.
    r = await json(`/api/projects/${slug}/requirements/TR-001?feId=FE-02`, 'PATCH', {
      text: 'Reservations must expire automatically after 24 hours without pickup.',
    });
    check('QA-13: PATCH FE-02 TR-001 text reset → 200', r.status === 200);

    // Feature comment owner also accepts DES
    r = await json(`/api/projects/${slug}/features/FE-02`, 'PATCH', { owner: 'DES' });
    check('PATCH feature owner=DES → 200', r.status === 200);
    check('DES feature owner re-rendered in place', /<!-- feature: priority=should status=draft owner=DES origin=manual -->/.test(read(featuresPath)));
    r = await json(`/api/projects/${slug}/features/FE-02`, 'PATCH', { owner: 'SA' });
    check('PATCH feature owner=SA reset → 200', r.status === 200);

    // ── Validation (AC-10): 422 with field errors ──
    r = await json(`/api/projects/${slug}/features`, 'POST', { title: 'no', description: '', priority: 'must', status: 'draft', owner: 'BA' });
    check('invalid feature → 422 {errors}', r.status === 422 && typeof r.body?.errors === 'object');

    // ── State machine (AC-7): out-of-machine → 422, no-op ok ──
    // Features move through the meta PATCH endpoint (no separate /status route).
    r = await json(`/api/projects/${slug}/features/FE-01`, 'PATCH', { status: 'draft' });
    check('FE-01 in_review → draft is out-of-machine → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/requirements/BR-001/status`, 'PATCH', { status: 'in_review' });
    check('BR-001 approved → in_review is out-of-machine → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/requirements/BR-001/status`, 'PATCH', { status: 'approved' });
    check('BR-001 approved → approved (no-op) → 200', r.status === 200);
    r = await json(`/api/projects/${slug}/requirements/BR-002/status`, 'PATCH', { status: 'in_review' });
    check('BR-002 draft → in_review → 200', r.status === 200);

    // ── Delete guard (AC-11): approved + referenced by ANOTHER feature → 409 ──
    // FE-03's BR-001 (POSTed above, unapproved) is the target: approve it,
    // then POST a second feature whose text mentions BR-001 — the guard
    // must refuse the delete and name FE-04 as the referencing feature.
    r = await json(`/api/projects/${slug}/requirements/BR-001/status?feId=FE-03`, 'PATCH', { status: 'in_review' });
    check('FE-03 BR-001 draft → in_review → 200', r.status === 200);
    r = await json(`/api/projects/${slug}/requirements/BR-001/status?feId=FE-03`, 'PATCH', { status: 'approved' });
    check('FE-03 BR-001 in_review → approved → 200', r.status === 200);
    // The referencing feature must exist BEFORE the delete attempt — its
    // text (description) mentioning BR-001 is what the guard matches on.
    r = await json(`/api/projects/${slug}/features`, 'POST', {
      title: 'Guard fixture: references BR-001',
      description: 'This feature narrative mentions BR-001 so the delete guard can find it.',
      source: null,
      priority: 'could',
      status: 'draft',
      owner: 'BA',
    });
    check('guard fixture FE-04 created → 201', r.status === 201 && r.body?.feature?.feId === 'FE-04');
    r = await reqFetch(`/api/projects/${slug}/requirements/BR-001?feId=FE-03`, { method: 'DELETE' });
    check('delete guard → 409 with referencedBy FE-04 (AC-11)', r.status === 409 && JSON.stringify(r.body?.referencedBy) === '["FE-04"]');
    check('guarded row NOT struck on disk', read(prdPath).includes('- BR-001 | must | approved | BA |'));
    r = await reqFetch(`/api/projects/${slug}/features/FE-04`, { method: 'DELETE' });
    check('guard fixture FE-04 removed → 200', r.status === 200);

    // ── TR-delete regression (item 2.7) — the parser used to treat a
    //    `<!-- deleted … -->` marker *anywhere* in a story block as a
    //    story-level delete, which meant soft-deleting a TR also hid the
    //    parent story. The fix scopes story-delete markers to "before any
    //    requirement rows / body". Repro: add a second TR to FE-01,
    //    delete it (unapproved, so no guard), then assert FE-01 still
    //    surfaces. ──
    r = await json(`/api/projects/${slug}/features/FE-01/requirements`, 'POST', {
      type: 'TR',
      text: 'A throwaway TR whose delete marker used to hide the whole story.',
      priority: 'wont',
      status: 'draft',
      owner: 'DEV',
    });
    // QA-10: FE-01's TR pool already has TR-001, so the new throwaway is
    // TR-002 (per-feature) — not TR-004 as the legacy global allocator would
    // produce. feId disambiguates the delete from any other TR-001.
    eq('regression seed: TR-002 added to FE-01 (item 2.7 + QA-10)', r.body?.requirement?.id, 'TR-002');
    r = await reqFetch(`/api/projects/${slug}/requirements/TR-002?feId=FE-01`, { method: 'DELETE' });
    check('regression seed: TR-002 DELETE → 200 (item 2.7)', r.status === 200);
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    check(
      'regression: FE-01 still listed after a TR was deleted in it (item 2.7)',
      Array.isArray(r.body?.features) && r.body.features.some((f: any) => f.feId === 'FE-01'),
    );
    check(
      'regression: TR-001 still listed (struck) inside FE-01 (item 2.7)',
      r.body?.features?.find((f: any) => f.feId === 'FE-01')?.reqs?.some((x: any) => x.id === 'TR-001') === true,
    );

    // ── B2 regression (review item B2): the parser used to flip
    //    feature.deleted when a TR's row-delete marker appeared after a
    //    struck TR in a body-less feature (heading → meta → ~~struck TR~~ →
    //    marker). The fix scopes feature-delete markers to "before the
    //    first content line" — a committed body sentence OR any TR row
    //    (struck or not) freezes the position. Repro: append a body-less
    //    FE-05 block with a single struck TR + the row-delete marker, then
    //    assert the feature still surfaces. ──
    fs.writeFileSync(
      featuresPath,
      read(featuresPath) +
        '\n' +
        [
          '### FE-05 — Body-less edge case for the parser',
          '<!-- feature: priority=wont status=draft owner=BA -->',
          '- ~~TR-001 | wont | draft | DEV | A throwaway TR in a body-less story.~~',
          '<!-- deleted ' + new Date().toISOString().slice(0, 10) + ' by BA -->',
        ].join('\n') +
        '\n',
    );
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    check(
      'B2 regression: body-less + all-struck FE-05 still surfaces (item B2)',
      Array.isArray(r.body?.features) && r.body.features.some((f: any) => f.feId === 'FE-05'),
    );
    check(
      'B2 regression: struck TR-001 absent from FE-05.reqs but the row is still in the block on disk (item B2)',
      r.body?.features?.find((f: any) => f.feId === 'FE-05')?.reqs?.some((x: any) => x.id === 'TR-001') !== true &&
        read(featuresPath).includes('~~TR-001'),
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

    // QA-10: the per-feature allocator picks the next free id from FE-03's
    // linked-BR pool (which now has BR-001 and BR-002). The freed BR-002 in
    // the unassigned §8 pool is not what allocates here — that's a separate
    // pool. The new row is BR-003 within FE-03's scope (per-feature), not
    // the global-recycled id the legacy allocator would produce.
    r = await json(`/api/projects/${slug}/features/FE-03/requirements`, 'POST', {
      type: 'BR',
      text: 'A third BR into FE-03 to confirm per-feature allocation continues past BR-002.',
      priority: 'could',
      status: 'draft',
      owner: 'BA',
    });
    eq('next per-feature BR after BR-002 is BR-003 (QA-10)', r.body?.requirement?.id, 'BR-003');

    // ── QA-14: deleting a LINKED BR must strike prd.md, never features.md ──
    // Redesigned QA-14: trash a business requirement that lives inside a
    // feature. The scoped locateReq resolves BR rows to prd.md by row TYPE
    // (QA-14 original failure shape). The byte-identical assertion is the
    // load-bearing one — it proves the strike never touched features.md.
    const qa14FeaturesBeforeDel = read(featuresPath);
    r = await reqFetch(`/api/projects/${slug}/requirements/BR-003?feId=FE-03`, { method: 'DELETE' });
    check('QA-14: DELETE linked BR-003 (feId=FE-03) → 200', r.status === 200);
    check(
      'QA-14: linked BR struck in prd.md (strike-in-place)',
      /- ~~BR-003 \| could \| draft \| BA \| A third BR into FE-03/.test(read(prdPath)),
    );
    eq('QA-14: features.md byte-identical after linked-BR DELETE (AC-9)', read(featuresPath), qa14FeaturesBeforeDel);
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    check(
      'QA-14: deleted linked BR absent from FE-03.reqs (AC-8)',
      r.body?.features?.find((f: any) => f.feId === 'FE-03')?.reqs?.some((x: any) => x.id === 'BR-003') !== true,
    );

    // ── DELETE feature: marker after heading, FE id never reused (AC-8) ──
    r = await reqFetch(`/api/projects/${slug}/features/FE-03`, { method: 'DELETE' });
    check('DELETE FE-03 → 200', r.status === 200);
    const fd = read(featuresPath);
    const delIdx = fd.indexOf('### FE-03 —');
    check(
      'delete marker written directly after the heading',
      delIdx >= 0 && /^<!-- deleted \d{4}-\d{2}-\d{2} by BA -->$/m.test(fd.slice(delIdx, delIdx + 120)),
    );
    r = await reqFetch(`/api/projects/${slug}/requirements`);
    check('deleted feature absent from list (AC-8)', !JSON.stringify(r.body?.features).includes('FE-03'));
    r = await json(`/api/projects/${slug}/features`, 'POST', {
      title: 'A fresh feature after a delete',
      description: 'Proves the FE id allocator never reuses a deleted id.',
      source: null,
      priority: 'must',
      status: 'draft',
      owner: 'BA',
    });
    eq('deleted FE id never reused (AC-8)', r.body?.feature?.feId, 'FE-06');

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
    const genFeatures = [
      {
        title: 'Track a borrowed tool return',
        description: 'Lenders can see when a borrowed tool is due back and mark it returned.',
        source: 'user-journeys.md §3',
        priority: 'must',
        acs: [{ text: 'The return view must show the due-back date for every active loan.' }],
        trs: [{ text: 'Persist a due-back date with each loan.', priority: 'must' }],
      },
      {
        title: 'Get an overdue-item digest',
        description: 'Neighbors receive a weekly digest of overdue items so nothing slips.',
        source: null,
        priority: 'should',
        acs: [],
        trs: [{ text: 'Queue the digest email weekly.', priority: 'should' }],
      },
    ];

    // Gap-fill id math against the pristine snapshots: FE ids continue from the
    // fixture's FE-01/FE-02, ACs from AC-001, TRs from TR-001, BRs from the §8
    // pool (BR-001/002/004 → the allocator fills the BR-003 gap). All computed,
    // never hardcoded.
    const idsBefore = collectExistingIds(prd0, '', features0);
    const nextFe = nextFreeId(idsBefore.fe, 'FE');
    const nextFe2 = nextFreeId([...idsBefore.fe, nextFe], 'FE');
    const nextAc = nextFreeId(idsBefore.ac, 'AC');
    const nextTr = nextFreeId(idsBefore.tr, 'TR');
    const nextBr = nextFreeId(idsBefore.br, 'BR');

    const splicedF = spliceFeatures(features0, genFeatures);
    eq('spliceFeatures: allocates the next two FE ids', splicedF.feIds, [nextFe, nextFe2]);
    check('spliceFeatures: counts 1 AC + 2 TRs', splicedF.acCount === 1 && splicedF.trCount === 2);
    check(
      'spliceFeatures: leaves the manual fixture blocks untouched',
      splicedF.text.startsWith('# Features') &&
        splicedF.text.includes('### FE-01 — List an item for lending') &&
        splicedF.text.includes('### FE-02 — Reserve an item'),
    );

    const genBrs = [
      { text: 'A returned tool must free its calendar slot within 5 minutes.', priority: 'must', featureIndex: 0 },
      { text: 'Overdue digests must go out at most once per week.', priority: 'should', featureIndex: 1 },
    ];
    const splicedP = spliceBusinessReqs(prd0, genBrs, splicedF.feIds);
    eq('spliceBusinessReqs: gap-fill BR ids', splicedP.brIds, [nextBr, nextFreeId([...idsBefore.br, nextBr], 'BR')]);
    const genBr2Id = splicedP.brIds[1];

    // Parse back the spliced texts — features.md is the second argument now.
    const parsed = parseRequirements(splicedP.text, splicedF.text);
    const fe0 = splicedF.feIds[0];
    const fe1 = splicedF.feIds[1];
    const newFeature = parsed.features.find((f) => f.feId === fe0);
    check('generated feature block parses with origin=generated', newFeature?.origin === 'generated');
    check('generated feature keeps its source link', newFeature?.source === 'user-journeys.md §3');
    eq(
      'generated AC allocated next, status=unmet, origin=generated',
      [newFeature?.acs?.[0]?.id, newFeature?.acs?.[0]?.status, newFeature?.acs?.[0]?.origin],
      [nextAc, 'unmet', 'generated'],
    );
    const newTr = newFeature?.reqs?.find((x) => x.type === 'TR');
    eq('generated TR lands in-block with the next id', [newTr?.id, newTr?.featureId], [nextTr, fe0]);
    check(
      'second generated feature parses with its TR',
      parsed.features.some((f) => f.feId === fe1 && f.reqs.some((x) => x.type === 'TR')),
    );
    const genTr2Id = parsed.features.find((f) => f.feId === fe1)?.reqs?.find((x) => x.type === 'TR')?.id;

    const allBrRows = parsed.features.flatMap((f) => f.reqs.filter((x) => x.type === 'BR'));
    const newBr = allBrRows.find((b) => b.id === nextBr);
    check('generated BR links to its feature via the marker', newBr?.featureId === fe0);
    check(
      'unlinked fixture BRs stay in the unassigned pool',
      parsed.businessReqs.length === 3 && parsed.businessReqs.every((b) => b.featureId == null),
    );

    // reconcileSectionsDone: keys on the origin=generated marks the splices
    // wrote, so the retry path can skip straight to reconcile.
    const r1 = reconcileSectionsDone(splicedF.text, splicedP.text, []);
    check(
      'resume: spliced sections marked done',
      r1.sectionsDone.includes('features') && r1.sectionsDone.includes('business requirements'),
    );
    eq('resume: generated feIds collected in order', r1.featureIds, splicedF.feIds);
    const r2 = reconcileSectionsDone(features0, prd0, ['features', 'business requirements']);
    check('resume: pristine fixture clears both sections', r2.sectionsDone.length === 0 && r2.featureIds.length === 0);

    // requireRows: passthrough identity, and the empty case throws with the
    // section name interpolated (the retry generates only the failed section).
    check('requireRows: passthrough identity', requireRows(parsed.features, 'features') === parsed.features);
    let noRowsErr: unknown = null;
    try {
      requireRows([], 'features');
    } catch (e) {
      noRowsErr = e;
    }
    check(
      'requireRows: empty features throws with the section name',
      noRowsErr instanceof Error && /Model returned no features rows/.test((noRowsErr as Error).message),
    );

    // ── reconcileFeatures / reconcileBusinessReqs (retry path) ──
    // Echo helpers rebuild a desired feature/BR from exactly what the splices
    // wrote — an echoed id may only be reused inside its own generated block,
    // so a no-op round-trip must be byte-identical (same AC-9 bar as above).
    const echoFeature = (feId: string) => {
      const f = parsed.features.find((x) => x.feId === feId);
      if (!f) throw new Error(`echoFeature: ${feId} not parsed`);
      return {
        feId,
        title: f.title,
        description: f.description ?? '',
        source: f.source,
        priority: f.priority,
        acs: f.acs.map((a) => ({ acId: a.id, text: a.text })),
        trs: f.reqs
          .filter((x) => x.type === 'TR')
          .map((t) => ({ trId: t.id, text: t.text, priority: t.priority })),
      };
    };

    const rcNoChange = reconcileFeatures(splicedF.text, [echoFeature(fe0), echoFeature(fe1)]);
    check('reconcile no-op: byte-identical', rcNoChange.text === splicedF.text);
    check(
      'reconcile no-op: zero ops',
      rcNoChange.ops.added === 0 && rcNoChange.ops.updated === 0 && rcNoChange.ops.removed === 0,
    );
    eq('reconcile no-op: feIds preserved in order', rcNoChange.featureIds, splicedF.feIds);

    const updDesc = 'Revised description from the retry pass.';
    const rcUpd = reconcileFeatures(splicedF.text, [echoFeature(fe0), { ...echoFeature(fe1), description: updDesc }]);
    check('reconcile update: one feature updated', rcUpd.ops.added === 0 && rcUpd.ops.updated === 1 && rcUpd.ops.removed === 0);
    check('reconcile update: description spliced in', rcUpd.text.includes(updDesc));
    const updBack = parseRequirements(splicedP.text, rcUpd.text);
    const updFeat = updBack.features.find((f) => f.feId === fe1);
    check('reconcile update: status/owner preserved', updFeat?.status === 'draft' && updFeat?.owner === 'BA');
    check(
      'reconcile update: manual fixture features survive',
      updBack.features.some((f) => f.feId === 'FE-01') && updBack.features.some((f) => f.feId === 'FE-02'),
    );

    const rcRm = reconcileFeatures(splicedF.text, [echoFeature(fe0)]);
    check(
      'reconcile remove: omitted generated feature spliced out',
      rcRm.ops.removed === 1 && rcRm.ops.added === 0 && rcRm.ops.updated === 0,
    );
    check('reconcile remove: no trace of the removed block', !rcRm.text.includes(fe1) && !rcRm.text.includes('Get an overdue-item digest'));
    eq(
      'reconcile remove: remaining order',
      Array.from(rcRm.text.matchAll(/^### (FE-\d+)/gm)).map((m) => m[1]),
      ['FE-01', 'FE-02', fe0],
    );

    const rcAdd = reconcileFeatures(splicedF.text, [
      echoFeature(fe0),
      echoFeature(fe1),
      { feId: null, title: 'Lend out a shared drill', description: 'Manual add from the retry pass.', source: null, priority: 'could', acs: [], trs: [] },
    ]);
    check('reconcile add: unknown desired appends a new block', rcAdd.ops.added === 1 && rcAdd.ops.updated === 0 && rcAdd.ops.removed === 0);
    eq(
      'reconcile add: appended block takes the next id',
      rcAdd.featureIds[rcAdd.featureIds.length - 1],
      nextFreeId(collectExistingIds('', '', splicedF.text).fe, 'FE'),
    );
    check(
      'reconcile add: appended block is generated/draft/BA',
      /<!-- feature: priority=could status=draft owner=BA origin=generated -->/.test(rcAdd.text),
    );

    const fe0Echo = echoFeature(fe0);
    const fe0Tr = fe0Echo.trs[0]!;

    const trAddText = 'New technical requirement from the retry pass.';
    const rcTrAdd = reconcileFeatures(splicedF.text, [
      { ...fe0Echo, trs: [...fe0Echo.trs, { trId: null, text: trAddText, priority: 'must' }] },
      echoFeature(fe1),
    ]);
    check('reconcile TR add: counts one new TR', rcTrAdd.trCount === 1);
    const trPool = parsed.features.flatMap((f) => f.reqs.filter((x) => x.type === 'TR').map((x) => x.id));
    const expectedTr = nextFreeId(trPool, 'TR');
    check(
      'reconcile TR add: row + marker land in the block',
      rcTrAdd.text.includes(`- ${expectedTr} | must | draft | BA | ${trAddText}`) &&
        rcTrAdd.text.includes(`<!-- ${expectedTr}: origin=generated -->`),
    );

    const rcTrOmit = reconcileFeatures(splicedF.text, [{ ...fe0Echo, trs: [] }, echoFeature(fe1)]);
    check(
      'reconcile TR omit: block rewritten without the row',
      !rcTrOmit.text.includes(`- ${fe0Tr.trId} |`) && rcTrOmit.ops.updated === 1,
    );

    const trUpdText = 'Revised TR text from the retry pass.';
    const rcTrUpd = reconcileFeatures(splicedF.text, [
      { ...fe0Echo, trs: [{ trId: fe0Tr.trId, text: trUpdText, priority: fe0Tr.priority }] },
      echoFeature(fe1),
    ]);
    check(
      'reconcile TR update: same id, revised text',
      rcTrUpd.text.includes(`- ${fe0Tr.trId} | must | draft | BA | ${trUpdText}`) && !rcTrUpd.text.includes(fe0Tr.text),
    );

    const rcKeep = reconcileFeatures(splicedF.text, [echoFeature(fe0)], [fe1]);
    check(
      'reconcile keep: kept feature survives untouched',
      rcKeep.text === splicedF.text && rcKeep.ops.added === 0 && rcKeep.ops.updated === 0 && rcKeep.ops.removed === 0,
    );

    const rcWipe = reconcileFeatures(splicedF.text, []);
    check('reconcile wipe: both generated blocks removed', rcWipe.ops.removed === 2);
    check(
      'reconcile wipe: manual fixture survives',
      rcWipe.text.startsWith('# Features') &&
        rcWipe.text.includes('### FE-01') &&
        rcWipe.text.includes('### FE-02') &&
        !rcWipe.text.includes(fe0) &&
        !rcWipe.text.includes(fe1),
    );

    const rcUnknown = reconcileFeatures(splicedF.text, [
      echoFeature(fe0),
      { feId: 'FE-99', title: 'Unknown id lands as an add', description: 'An id that matches no existing block cannot echo.', source: null, priority: 'could', acs: [], trs: [] },
    ]);
    check('reconcile unknown id: appends, never echoes', rcUnknown.ops.added === 1 && rcUnknown.ops.updated === 0 && rcUnknown.ops.removed === 1);
    check(
      'reconcile unknown id: omitted generated block spliced out, add appended',
      // fe1's id is recycled by the appended add (spliceFeatures allocates
      // against the already-mutated lines), so the title is the stable
      // assertion — plus the recycled heading pins that behavior exactly.
      !rcUnknown.text.includes('Get an overdue-item digest') &&
        rcUnknown.text.includes(`### ${fe1} — Unknown id lands as an add`),
    );

    // fe1's echo keeps the genuinely-omitted sweep out of the picture: with
    // only the garbled entry the sweep would legitimately remove fe1, so the
    // zero-removal assertion would not isolate the garbled-row behavior.
    const rcGarbled = reconcileFeatures(splicedF.text, [{ ...fe0Echo, title: '   ' }, echoFeature(fe1)]);
    check(
      'reconcile garbled: silently skipped, byte-identical',
      rcGarbled.text === splicedF.text && rcGarbled.ops.added === 0 && rcGarbled.ops.updated === 0 && rcGarbled.ops.removed === 0,
    );

    const echoBr = (brId: string) => {
      const row = [...allBrRows, ...parsed.businessReqs].find((b) => b.id === brId);
      if (!row) throw new Error(`echoBr: ${brId} not parsed`);
      return { brId, text: row.text, priority: row.priority, featureId: row.featureId ?? null };
    };

    const rcBrNoChange = reconcileBusinessReqs(splicedP.text, [echoBr(nextBr), echoBr(genBr2Id!)]);
    check(
      'BR reconcile no-op: byte-identical, zero ops',
      rcBrNoChange.text === splicedP.text &&
        rcBrNoChange.ops.added === 0 &&
        rcBrNoChange.ops.updated === 0 &&
        rcBrNoChange.ops.removed === 0,
    );

    const brUpdText = 'Revised BR text from the retry pass.';
    const rcBrUpd = reconcileBusinessReqs(splicedP.text, [
      echoBr(nextBr),
      { ...echoBr(genBr2Id!), text: brUpdText, featureId: fe0 },
    ]);
    check('BR reconcile update: one row updated', rcBrUpd.ops.updated === 1 && rcBrUpd.ops.added === 0 && rcBrUpd.ops.removed === 0);
    check(
      'BR reconcile update: text + link rewritten',
      rcBrUpd.text.includes(`- ${genBr2Id} | should | draft | BA | ${brUpdText}`) &&
        rcBrUpd.text.includes(`<!-- ${genBr2Id}: feature=${fe0}, origin=generated -->`),
    );
    check(
      'BR reconcile update: manual fixture rows survive',
      ['BR-001', 'BR-002', 'BR-004'].every((id) => rcBrUpd.text.includes(`- ${id} `)),
    );

    const rcBrRm = reconcileBusinessReqs(splicedP.text, [echoBr(genBr2Id!)]);
    check('BR reconcile remove: omitted generated row spliced out', rcBrRm.ops.removed === 1 && !rcBrRm.text.includes(nextBr));
    check(
      'BR reconcile remove: manual rows survive',
      ['BR-001', 'BR-002', 'BR-004'].every((id) => rcBrRm.text.includes(`- ${id} `)),
    );

    const brAddText = 'Late fees accrue per calendar day.';
    const rcBrAdd = reconcileBusinessReqs(splicedP.text, [
      echoBr(nextBr),
      echoBr(genBr2Id!),
      { brId: null, text: brAddText, priority: 'should', featureId: null },
    ]);
    check('BR reconcile add: appends one unassigned row', rcBrAdd.ops.added === 1);
    const brPool = [...allBrRows, ...parsed.businessReqs].map((b) => b.id);
    const expectedBr = nextFreeId(brPool, 'BR');
    check(
      'BR reconcile add: gap-fill id + marker without a feature link',
      rcBrAdd.text.includes(`- ${expectedBr} | should | draft | BA | ${brAddText}`) &&
        rcBrAdd.text.includes(`<!-- ${expectedBr}: origin=generated -->`),
    );

    const rcBrKeep = reconcileBusinessReqs(splicedP.text, [echoBr(genBr2Id!)], [nextBr]);
    check(
      'BR reconcile keep: kept row survives untouched',
      rcBrKeep.text === splicedP.text && rcBrKeep.ops.added === 0 && rcBrKeep.ops.updated === 0 && rcBrKeep.ops.removed === 0,
    );

    check(
      'fileHasGeneratedRows flags spliced features only',
      fileHasGeneratedRows(splicedF.text) === true && fileHasGeneratedRows(features0) === false,
    );
    check(
      'fileHasGeneratedRows flags spliced PRD only',
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
      currentSection: 'features',
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
      check('staleness: stall error names the wedged section', /Generation of features stalled/.test(stalled.error ?? ''));
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
    // Feature-shaped per the redesign: a generated feature block in
    // features.md + its linked BR row in prd.md. user-journeys.md keeps the
    // hand-written seeded copy — stories are no longer generated here.
    const GENERATED_FEATURES_FIXTURE = [
      '# Features',
      '',
      '### FE-90 — Generated fixture feature',
      '<!-- feature: priority=must status=draft owner=BA origin=generated -->',
      '',
      'Synthetic generated feature block for the staleness walk.',
      '',
      '## Acceptance Criteria',
      '',
      '- AC-900 | met | Synthetic generated AC row.',
      '<!-- AC-900: origin=generated -->',
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
      '<!-- BR-900: feature=FE-90, origin=generated -->',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(approvedDir, 'PRD', 'features.md'), GENERATED_FEATURES_FIXTURE);
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
      currentSection: 'features',
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
        currentSection: 'features',
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
