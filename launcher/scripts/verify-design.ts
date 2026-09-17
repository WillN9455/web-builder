// Design tab — server verification walk (design-tab build plan §5, v5.5).
//
// Mirrors scripts/verify-requirements.ts: isolated temp checkout of server/ +
// an isolated SQLite DB (never the dev launcher.db), synthetic fixtures on
// disk, server spawned on a free private port, then a full CRUD/security walk.
//
// Coverage — one check per acceptance criterion + Dev Reviewer 2 pre-code
// hardenings (F-1…F-6), all disk-verified where the assertion is destructive:
//   F-6  per-project scoping: foreign storyId 404s, foreign project's stories
//        never appear in a project's list, unknown project → 400.
//   F-1  validateFigmaUrl: https-only, figma.com / *.figma.com host, /file/ or
//        /design/ path → else 422 with the spec's message.
//   F-5  HTML upload: .html/.htm only, 5 MB byte cap, ../ and NUL filename
//        rejection, resolved-inside-sources containment + on-disk file assert.
//   F-3  notes: bodies containing '<' are rejected (422) — storage guaranteed
//        plain-text; body required.
//   F-4  transition: illegal moves 409; ready_for_dev flips the local
//        kanban_card read-model via UPDATE … WHERE id=? AND project_id=? — a
//        crafted mapping pointing at another project's card id must not touch
//        that card (the project_id re-scope is the assertion).
//   Rules: GET (missing → '') / PUT write-back (disk-verified) / traversal+type
//        guards / GET echoes the saved bytes.

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

const PRD_MD = `# PRD — Design Verify Fixture

## 8. Business requirements

- BR-001 | must | approved | BA | The design surface must show a story's source requirement and design status.
`;

const FEATURES_MD = [
  '# Features',
  '',
  '### FE-01 — Attach a design source',
  '<!-- feature: priority=must status=approved owner=BA origin=manual -->',
  'Designers can attach a Figma frame or HTML preview to a story so that reviewers validate the interaction states.',
  '',
  '## Acceptance Criteria',
  '- TR-001 | must | approved | DEV | Attached sources render in a sandboxed preview that cannot execute scripts.',
  '<!-- TR-001: origin=manual -->',
  '',
].join('\n');

const STORIES_MD = `# Stories — Design Verify Fixture

Generated from the requirements sprint.

### US-01 — Reserve a book
<!-- story: priority=must status=approved owner=BA origin=generated reqs=BR-001,TR-001 -->
**As a librarian**, **I want to reserve a book with a pickup window**, **so that I can hold it for a borrower**.

## Acceptance Criteria
- AC-001 | The reserve form requires the book id.
- AC-002 | Reserved books show a pickup window.
`;

// Foreign project owns US-99 — must stay invisible to the fixture project.
const FOREIGN_STORIES_MD = `# Stories — Foreign Project

### US-99 — Foreign story
<!-- story: priority=should status=draft owner=BA origin=generated reqs=BR-001 -->
**As a tenant**, **I want my own story**, **so that I can prove IDOR scoping**.

## Acceptance Criteria
- AC-001 | This story never renders outside its project.
`;

async function main(): Promise<void> {
  const port = await freePort(5297);
  const base = `http://127.0.0.1:${port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-verify-'));
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

  // Seed: projects + context + kanban_card rows. The fixture mapping is written
  // AFTER seeding because it embeds the seeded card ids (and the foreign card
  // id for the F-4 cross-project probe).
  const seedPath = path.join(tmp, 'seed.mts');
  fs.writeFileSync(
    seedPath,
    `import { migrate, db } from './server/db.js';\n` +
      `migrate();\n` +
      `const ins = db.prepare("INSERT INTO project (name, slug, one_liner, folder_path, current_stage, status) VALUES (?, ?, ?, ?, 'PRD', 'active')");\n` +
      `const fixtureId = Number(ins.run('Design Verify Fixture', 'design-verify-fixture', 'fixture', ${JSON.stringify(fixtureDir)}).lastInsertRowid);\n` +
      `const foreignId = Number(ins.run('Design Verify Foreign', 'design-verify-foreign', 'fixture', ${JSON.stringify(foreignDir)}).lastInsertRowid);\n` +
      `const emptyId = Number(ins.run('Design Verify Empty', 'design-verify-empty', 'fixture', ${JSON.stringify(emptyDir)}).lastInsertRowid);\n` +
      `db.prepare("INSERT INTO ba_context (project_id, confirmed, confirmed_at) VALUES (?, 1, datetime('now'))").run(fixtureId);\n` +
      `db.prepare("INSERT INTO ba_context (project_id, confirmed, confirmed_at) VALUES (?, 1, datetime('now'))").run(foreignId);\n` +
      `db.prepare("INSERT INTO ba_context (project_id, confirmed, confirmed_at) VALUES (?, 1, datetime('now'))").run(emptyId);\n` +
      `const card = db.prepare("INSERT INTO kanban_card (project_id, ticket_key, title, column, priority, points, assignee_agent, status) VALUES (?, ?, 'SFX card', 'todo', 'high', 0, '', '')");\n` +
      `const sfx1 = Number(card.run(fixtureId, 'SFX-1').lastInsertRowid);\n` +
      `const fgn1 = Number(card.run(foreignId, 'FGN-1').lastInsertRowid);\n` +
      `db.prepare("UPDATE kanban_card SET column = 'inprogress' WHERE id = ?").run(fgn1);\n` +
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

  // story-gen mapping, written to the isolated copy's data dir (server side
  // reads data/story-gen/<projectId>.mapping.json relative to server/index).
  // US-02's entry deliberately points at the FOREIGN project's card id (fgn1):
  // the F-4 test asserts the transition's kanban_card UPDATE cannot cross
  // project_id and move that card, even with a crafted mapping.
  const mappingDir = path.join(tmp, 'data', 'story-gen');
  fs.mkdirSync(mappingDir, { recursive: true });
  fs.writeFileSync(
    path.join(mappingDir, `${ids.fixture}.mapping.json`),
    JSON.stringify({
      stories: [
        { us: 'US-01', ticketKey: 'SFX-1', cardId: ids.sfx1 },
        { us: 'US-02', ticketKey: 'FGN-1', cardId: ids.fgn1 },
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

  const slug = 'design-verify-fixture';
  const foreignSlug = 'design-verify-foreign';
  const emptySlug = 'design-verify-empty';
  const sourcesDir = path.join(fixtureDir, 'design-system', 'sources');

  try {
    console.log(`\n[verify-design] API on ${base}, fixture ${tmp}\n`);

    // ── List (design-tab.html §D: rows + stats feeds + missing flag) ────
    let r = await reqFetch(`/api/projects/${slug}/design/stories`);
    check('GET stories → 200', r.status === 200);
    eq('fixture list has US-01', r.body.stories?.map((s: { storyId: string }) => s.storyId), ['US-01']);
    const us01 = r.body.stories?.[0];
    check('row has design_status + pill', us01 && us01.design_status === 'not_started' && us01.status_pill === 'Picked up', JSON.stringify(us01));
    check('row links its kanban card', us01 && us01.ticket_key === 'SFX-1' && us01.card_column === 'todo', JSON.stringify(us01));
    eq('row reqs resolved via meta + requirement index', us01?.reqs?.sort((a: any, b: any) => a.id.localeCompare(b.id)).map((x: any) => [x.id, !!x.text]), [['BR-001', true], ['TR-001', true]]);
    eq('missing_stories false', r.body.missing_stories, false);

    r = await reqFetch(`/api/projects/${emptySlug}/design/stories`);
    check('empty project → missing_stories true, 0 rows', r.status === 200 && r.body.missing_stories === true && r.body.stories.length === 0, JSON.stringify(r.body));

    // F-6: another project's story is invisible — scoped by project folder.
    r = await reqFetch(`/api/projects/${slug}/design/stories`);
    check('foreign US-99 never appears in fixture list', !r.body.stories?.some((s: { storyId: string }) => s.storyId === 'US-99'));
    r = await reqFetch(`/api/projects/definitely-not-a-project/design/stories`);
    check('unknown project → 400', r.status === 400);

    // ── Detail (requirement card + empty source + empty notes) ───────────
    r = await reqFetch(`/api/projects/${slug}/design/US-01`);
    check('GET detail → 200', r.status === 200);
    check('detail reqs includes BR-001 + TR-001 with text', r.body.story?.reqs?.length === 2 && r.body.story.reqs.every((x: any) => x.text));
    check('detail source null + notes empty', r.body.source?.type === null && Array.isArray(r.body.notes) && r.body.notes.length === 0);
    // F-6: foreign storyId 404s on this project.
    r = await reqFetch(`/api/projects/${slug}/design/US-99`);
    check('foreign storyId → 404 (scoped)', r.status === 404);
    r = await reqFetch(`/api/projects/${slug}/design/not-a-story`);
    check('non-US grammar storyId → 404', r.status === 404);

    // ── F-1 Figma source validation ──────────────────────────────────────
    r = await json(`/api/projects/${slug}/design/US-01/source`, 'POST', { type: 'figma', url: 'https://www.figma.com/file/AbC123/Design' });
    check('valid figma.com file URL → 200', r.status === 200 && r.body.source?.type === 'figma', JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/design/US-01/source`, 'POST', { type: 'figma', url: 'https://evil.example.com/file/x' });
    check('F-1 non-figma host → 422', r.status === 422 && r.body.error?.includes("doesn't look like a Figma URL"), JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/design/US-01/source`, 'POST', { type: 'figma', url: 'http://www.figma.com/file/x' });
    check('F-1 http (non-https) → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/design/US-01/source`, 'POST', { type: 'figma', url: 'https://figma.com/team/123' });
    check('F-1 non-file/design path → 422', r.status === 422, JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/design/US-01/source`, 'POST', { type: 'figma', url: 'https://embed.figma.com/file/x' });
    check('F-1 subdomain .figma.com allowed', r.status === 200);
    r = await json(`/api/projects/${slug}/design/US-01/source`, 'POST', { type: 'figma', url: '' });
    check('F-1 empty url → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/design/US-01/source`, 'POST', { type: 'bogus', url: 'https://www.figma.com/file/x' });
    check('unknown source type → 422', r.status === 422);

    // ── F-5 HTML upload (all server-side, disk-verified) ─────────────────
    const htmlDoc = '<!doctype html><html><body><h1>Preview one</h1></body></html>';
    r = await json(`/api/projects/${slug}/design/US-01/source`, 'POST', { type: 'html', filename: 'preview-one.html', content: htmlDoc });
    check('F-5 valid .html upload → 200', r.status === 200, JSON.stringify(r.body));
    check('F-5 upload echoes preview_html for the iframe srcdoc', r.body.preview_html === htmlDoc);
    const storedLeaf = path.join(sourcesDir, 'story-01.html');
    check('F-5 disk-write: sources/story-01.html exists + byte-match', fs.existsSync(storedLeaf) && read(storedLeaf) === htmlDoc);

    let before = read(storedLeaf);
    r = await json(`/api/projects/${slug}/design/US-01/source`, 'POST', { type: 'html', filename: 'preview-two.pdf', content: '<h1>nope</h1>' });
    check('F-5 non-html extension → 422', r.status === 422);
    check('F-5 rejected upload leaves prior file untouched', read(storedLeaf) === before);
    r = await json(`/api/projects/${slug}/design/US-01/source`, 'POST', { type: 'html', filename: '..%2Fevil.html', content: '<h1>x</h1>' });
    check('F-5 "../"-style filename → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/design/US-01/source`, 'POST', { type: 'html', filename: 'evil\x00.html', content: '<h1>x</h1>' });
    check('F-5 NUL in filename → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/design/US-01/source`, 'POST', { type: 'html', filename: 'big.html', content: `<!--${'x'.repeat(5 * 1024 * 1024 + 1)}-->` });
    check('F-5 >5 MB content → 422', r.status === 422, `status=${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`);
    check('F-5 rejected sizes leave prior file untouched', read(storedLeaf) === before);

    // Reload gap: the detail GET re-reads the stored file (preview_html).
    r = await reqFetch(`/api/projects/${slug}/design/US-01`);
    check('GET detail after upload re-reads stored html (preview_html)', r.body.source?.preview_html === htmlDoc, JSON.stringify(r.body.source));

    // ── DELETE source (disk-verified) ────────────────────────────────────
    r = await reqFetch(`/api/projects/${slug}/design/US-01/source`, { method: 'DELETE' });
    check('DELETE source → 200 source null', r.status === 200 && r.body.source === null);
    check('DELETE disk-verify: stored file removed', !fs.existsSync(storedLeaf));
    r = await reqFetch(`/api/projects/${slug}/design/US-01/source`, { method: 'DELETE' });
    check('second DELETE idempotent → source null', r.status === 200 && r.body.source === null);

    // ── F-3 notes (storage purity enforced server-side) ──────────────────
    r = await json(`/api/projects/${slug}/design/US-01/notes`, 'POST', { author: 'Will', body: '**Aligning** the header with *tokens*.' });
    check('plain-text note (markdown chars ok) → 200', r.status === 200 && r.body.note?.body === '**Aligning** the header with *tokens*.' && r.body.note?.author === 'Will', JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/design/US-01/notes`, 'POST', { body: '<b>injected</b>' });
    check('F-3 body containing "<" → 422', r.status === 422, JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/design/US-01/notes`, 'POST', { body: '   ' });
    check('empty note body → 422', r.status === 422);
    r = await reqFetch(`/api/projects/${slug}/design/US-01`);
    check('note persisted + author default applied', r.body.notes?.length === 1 && r.body.notes[0].author === 'Will' && r.body.notes[0].body === '**Aligning** the header with *tokens*.');

    // ── F-4 transitions (409 illegal, ready_for_dev flips the card, scoped)
    r = await json(`/api/projects/${slug}/design/US-01/transition`, 'POST', { to: 'ready_for_dev' });
    check('not_started → ready_for_dev → 409 illegal', r.status === 409, JSON.stringify(r.body));
    r = await json(`/api/projects/${slug}/design/US-01/transition`, 'POST', { to: 'bogus' });
    check('unknown target status → 422', r.status === 422);
    for (const [step, to] of [['not_started', 'in_design'], ['in_design', 'peer_review'], ['peer_review', 'design_complete']] as const) {
      r = await json(`/api/projects/${slug}/design/US-01/transition`, 'POST', { to });
      check(`${step} → ${to} → 200`, r.status === 200 && r.body.design_status === to, JSON.stringify(r.body));
    }
    r = await json(`/api/projects/${slug}/design/US-01/transition`, 'POST', { to: 'ready_for_dev' });
    check('design_complete → ready_for_dev → 200 (card read-model flip)', r.status === 200);

    const checkCard = (name: string, id: number, expected: string): void => {
      // Read the isolated DB directly (same db.ts the server copy uses) — a
      // kanban_card mutation assert, not a 200-toast assert. A probe file (not
      // tsx -e) so the relative './server/db.js' import resolves from tmp/.
      const probePath = path.join(tmp, 'probe.mts');
      fs.writeFileSync(probePath, `import { db } from './server/db.js';\nconst r = db.prepare('SELECT column FROM kanban_card WHERE id = ?').get(${id});\nconsole.log(r ? r.column : 'MISSING');\n`);
      const out = execFileSync(path.join(LAUNCHER, 'node_modules', '.bin', 'tsx'), [probePath], { cwd: tmp, encoding: 'utf-8' });
      const col = out.trim();
      check(name, col === expected, `column=${col}`);
    };
    checkCard('F-4 fixture card flipped to done', ids.sfx1, 'done');

    // Crafted mapping (US-02 → foreign card fgn1): walk US-02 to
    // design_complete, then flip to ready_for_dev. The transition's kanban_card
    // UPDATE carries WHERE id=? AND project_id=? — the probe asserts the
    // FOREIGN project's card is untouched even though the crafted mapping
    // points at it (a cross-project write would set fgn1 to done).
    for (const [step, to] of [['not_started', 'in_design'], ['in_design', 'peer_review'], ['peer_review', 'design_complete']] as const) {
      r = await json(`/api/projects/${slug}/design/US-02/transition`, 'POST', { to });
      check(`US-02 ${step} → ${to} → 200`, r.status === 200, JSON.stringify(r.body));
    }
    r = await json(`/api/projects/${slug}/design/US-02/transition`, 'POST', { to: 'ready_for_dev' });
    check('US-02 design_complete → ready_for_dev → 200 (crafted mapping path ok)', r.status === 200, JSON.stringify(r.body));
    checkCard('F-4 foreign card untouched by fixture transition', ids.fgn1, 'inprogress');

    // ── Rules (write-back to design-system/, disk-verified) ─────────────
    const rulesPath = path.join(fixtureDir, 'design-system', 'design-rules.md');
    r = await reqFetch(`/api/projects/${slug}/design/rules`);
    check('GET rules (missing) → 200 empty content', r.status === 200 && r.body.content === '', JSON.stringify(r.body));
    const rulesBody = '# Design rules\n\n- Use the design tokens, never hard-coded colors.\n';
    r = await json(`/api/projects/${slug}/design/rules`, 'PUT', { content: rulesBody });
    check('PUT rules → 200', r.status === 200 && r.body.ok === true, JSON.stringify(r.body));
    check('PUT disk-verify: design-rules.md written', fs.existsSync(rulesPath) && read(rulesPath) === rulesBody);
    r = await reqFetch(`/api/projects/${slug}/design/rules`);
    check('GET rules echoes saved bytes', r.status === 200 && r.body.content === rulesBody);
    r = await json(`/api/projects/${slug}/design/rules`, 'PUT', { content: 'escape ../outside' });
    check('rules traversal sequence → 422', r.status === 422);
    r = await json(`/api/projects/${slug}/design/rules`, 'PUT', { content: 42 });
    check('rules non-string → 422', r.status === 422);
    check('traversal rejections leave saved file byte-identical', read(rulesPath) === rulesBody);

    // ── Tail: 400s on garbage project ids for every scoped family ────────
    // (source/notes/transition are write routes — exercise them with their
    // real methods so they reach the project guard rather than the 404 fallback.)
    const tailBadProject = async (path: string, init?: RequestInit) => {
      const res = await reqFetch(`/api/projects/zzz-not-real/design/${path}`, init);
      check(`unknown project → 400 for ${path}`, res.status === 400, `status=${res.status}`);
    };
    await tailBadProject('stories');
    await tailBadProject('US-01');
    await tailBadProject('rules'); // GET
    await tailBadProject('US-01/source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await tailBadProject('US-01/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await tailBadProject('US-01/transition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  } finally {
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`\n[verify-design] ${passed} checks passed, ${failures.length} failures`);
  if (failures.length) {
    console.log(failures.join('\n'));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[verify-design] fatal: ${err?.stack ?? err}`);
  process.exit(1);
});
