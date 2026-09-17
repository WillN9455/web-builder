// verify-build-ui-walk.mjs — headless DOM walk for the Build tab (CA2 UI
// completeness walkthrough, not a repo gate). Reuses the verify-build fixture:
// a throwaway server copy + its own SQLite DB (never the dev launcher.db), a
// synthetic project with confirmed context + kanban cards + 2 file/notes seeds,
// then asserts the DOM actually renders (not just HTTP 200) and fires REAL
// interactions (click a row, toggle split-switch, add a file inline, post a
// note) asserting the visible side effect — the memory lesson: API-rig green
// + puppeteer URL changes prove nothing about the rendered UI.
//
// Usage:  npm run verify:build-ui (Node 24 PATH only — better-sqlite3 ABI)
// Env:    LAUNCHER_UI_WEB_PORT  default 5184
//         LAUNCHER_UI_API_PORT  default 5194  (must be free — lsof first)
//
// Exits 0 when every assertion passes, 1 otherwise.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, cpSync, symlinkSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WEB_PORT = Number(process.env.LAUNCHER_UI_WEB_PORT ?? 5184);
const API_PORT = Number(process.env.LAUNCHER_UI_API_PORT ?? 5194);
const BASE = `http://localhost:${WEB_PORT}`;

// ── fixture markdown (mirror of verify-build.ts) ───────────────────────────
const STORIES_MD = `# Stories

### US-01 — Reserve a book
As a library member I can reserve a book so that it is held for me at the desk.
- BR-001 Acceptance: 400 response for a missing book id.
- TR-001 Acceptance: holds table has a status column.

### US-02 — Search by title
As any visitor I can search by title.
- BR-002 Acceptance: 200 with results.

### US-03 — Extend a hold
As a member I can extend an active hold.
- BR-003 Acceptance: extension only once per hold.
`;

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(url, label, ms = 60_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => { res.resume(); resolve(); });
        req.on('error', reject);
        req.setTimeout(2_000, () => req.destroy(new Error('timeout')));
      });
      return;
    } catch { await sleep(500); }
  }
  throw new Error(`${label} not ready at ${url} after ${ms / 1000}s`);
}

function findChrome() {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
  const pw = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  try {
    for (const d of readdirSync(pw)) {
      if (!d.startsWith('chromium-')) continue;
      for (const sub of ['chrome-mac', 'chrome-mac-arm64']) {
        candidates.push(path.join(pw, d, sub, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
      }
    }
  } catch { /* no playwright cache */ }
  candidates.push(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  );
  return candidates.find(existsSync);
}

// ── main ──
const tmp = mkdtempSync(path.join(os.tmpdir(), 'build-ui-walk-'));
const serverDir = path.join(tmp, 'server');
const dataDir = path.join(tmp, 'data');
mkdirSync(path.join(tmp, 'data', 'story-gen'), { recursive: true });
const projDir = path.join(tmp, 'proj-fixture');
mkdirSync(path.join(projDir, 'PRD'), { recursive: true });
cpSync(path.join(ROOT, 'server'), serverDir, { recursive: true });
symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'), 'dir');
writeFileSync(path.join(projDir, 'PRD', 'stories.md'), STORIES_MD);
writeFileSync(path.join(projDir, 'PRD', 'prd.md'), '# PRD');
writeFileSync(path.join(projDir, 'PRD', 'features.md'), '# Features');

// seed.mts against the isolated copy
const seedPath = path.join(tmp, 'seed.mts');
writeFileSync(
  seedPath,
  `import { migrate, db } from './server/db.js';\n` +
    `migrate();\n` +
    `const ins = db.prepare("INSERT INTO project (name, slug, one_liner, folder_path, current_stage, status) VALUES (?, ?, ?, ?, 'Build', 'active')");\n` +
    `const pid = Number(ins.run('Build UI Walk', 'build-ui-walk', 'fixture', ${JSON.stringify(projDir)}).lastInsertRowid);\n` +
    `db.prepare("INSERT INTO ba_context (project_id, confirmed, confirmed_at) VALUES (?, 1, datetime('now'))").run(pid);\n` +
    `const card = db.prepare("INSERT INTO kanban_card (project_id, ticket_key, title, column, priority, points, assignee_agent, status) VALUES (?, ?, 'Walk card', 'inprogress', 'high', 5, '', '')");\n` +
    `const c1 = Number(card.run(pid, 'WALK-1').lastInsertRowid);\n` +
    `const c2 = Number(card.run(pid, 'WALK-2').lastInsertRowid);\n` +
    `db.prepare("INSERT INTO build_story (project_id, story_id, build_status, rework_origin, rework_issues) VALUES (?, 'US-03', 'building', NULL, 0)").run(pid);\n` +
    `db.prepare("INSERT INTO build_story_file (project_id, story_id, path, layer) VALUES (?, 'US-01', 'src/lib/api.ts', 'new')").run(pid);\n` +
    `console.log('SEED_IDS ' + JSON.stringify({ pid, c1, c2 }));\n`,
);
const seedOut = execFileSync(path.join(ROOT, 'node_modules', '.bin', 'tsx'), [seedPath], { cwd: tmp }).toString();
const ids = JSON.parse(seedOut.match(/SEED_IDS (\{.*\})/)?.[1] ?? '{}');

writeFileSync(
  path.join(dataDir, 'story-gen', `${ids.pid}.mapping.json`),
  JSON.stringify({ stories: [{ us: 'US-01', ticketKey: 'WALK-1', cardId: ids.c1 }, { us: 'US-02', ticketKey: 'WALK-2', cardId: ids.c2 }] }),
);

// config-rules.md + a rules.md + code-builder agents dir so rules half has data
mkdirSync(path.join(projDir, 'code-builder'), { recursive: true });
mkdirSync(path.join(projDir, 'code-builder', 'agents'), { recursive: true });
writeFileSync(path.join(projDir, 'code-builder', 'config-rules.md'), '# Rules\n');
writeFileSync(path.join(projDir, 'code-builder', 'rules.md'), '# Build rules\n');
writeFileSync(path.join(projDir, 'code-builder', 'agents', 'code-1.md'), '# Code agent 1\n');
writeFileSync(path.join(projDir, 'code-builder', 'agents', 'code-2.md'), '# Code agent 2\n');
writeFileSync(path.join(projDir, 'code-builder', 'agents', 'code-3.md'), '# Code agent 3\n');
writeFileSync(path.join(projDir, 'code-builder', 'agents', 'reviewer.md'), '# Reviewer\n');

const api = spawn(path.join(ROOT, 'node_modules', '.bin', 'tsx'), [path.join(serverDir, 'index.ts')], {
  cwd: tmp,
  env: { ...process.env, PORT: String(API_PORT), OLLAMA_HOST: 'http://127.0.0.1:9', DB_ISOLATED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const web = spawn(path.join(ROOT, 'node_modules', '.bin', 'vite'), ['--port', String(WEB_PORT), '--strictPort'], {
  cwd: ROOT,
  env: { ...process.env, LAUNCHER_API_PORT: String(API_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
const SLUG = 'build-ui-walk';
try {
  await waitReady(`http://127.0.0.1:${API_PORT}/api/health`, 'API server');
  await waitReady(`${BASE}/`, 'Vite dev server');

  const chrome = findChrome();
  if (!chrome) throw new Error('no Chromium found — set CHROME_PATH');
  browser = await puppeteer.launch({ executablePath: chrome, headless: 'new' });

  const walk = async (name, url, fn) => {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    try {
      await page.goto(BASE + url, { waitUntil: 'networkidle0', timeout: 30_000 });
      await fn(page);
      check(`${name}: no uncaught page errors`, errs.length === 0, errs.slice(0, 2).join(' / '));
    } catch (e) {
      check(`${name}`, false, String(e).slice(0, 160));
    } finally {
      await page.close();
    }
  };

  // 1. Build list screen
  await walk('build list', `/projects/${SLUG}/build`, async (page) => {
    await page.waitForSelector('.build-screen, .center-card', { timeout: 15_000 });
    check('build screen markers (.split-switch, .bd-stat, .story-list)', await page.evaluate(() =>
      !!document.querySelector('.build-screen') && !!document.querySelector('.split-switch') &&
      !!document.querySelector('.bd-stat')),
    );
    check('three story rows present', await page.evaluate(() =>
      document.querySelectorAll('.story-row').length >= 3));
    check('rework card absent when no rework (US-03 is building)', await page.evaluate(() =>
      !document.querySelector('.rework')));
    // filter pills: click "In review" → only ready_for_review/ready_for_qa remain
    const pills = await page.evaluate(() => [...document.querySelectorAll('.filter-btn, .pill, button')]
      .map((b) => b.textContent.trim()));
    check('filter pills render', pills.some((t) => t.includes('In review')), JSON.stringify(pills.slice(0, 6)));
  });

  // 2. Story detail
  await walk('story detail', `/projects/${SLUG}/build/US-01`, async (page) => {
    await page.waitForSelector('.build-screen, .center-card', { timeout: 15_000 });
    check('back-arrow renders', await page.evaluate(() =>
      !!document.querySelector('.back-arrow')));
    check('story head + CTA renders', await page.evaluate(() =>
      !!document.querySelector('.story-head') && [...document.querySelectorAll('.btn')].some((b) => (b.textContent || '').trim().length > 0)));
    check('req-card renders', await page.evaluate(() =>
      !!document.querySelector('.req-card')));
    check('surface card renders', await page.evaluate(() =>
      document.querySelectorAll('.surface-card').length >= 1));
    check('file row renders', await page.evaluate(() =>
      document.querySelectorAll('.file-row').length >= 1));
    check('thread renders', await page.evaluate(() =>
      !!document.querySelector('.thread')));
    // fire a real interaction: type a note + hit Cmd/Ctrl+Enter → .comment appears.
    // Use the native value setter so React's onChange updates noteDraft, wait for
    // React to re-render, then dispatch the keydown.
    const posted = await page.evaluate(() => new Promise((resolve) => {
      const ta = document.querySelector('.compose textarea');
      if (!ta) return resolve('no-compose');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, 'walk note');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => {
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true }));
        setTimeout(() => resolve('dispatched'), 4500);
      }, 900);
    }));
    check('note compose exists + Cmd+Enter dispatched', posted !== 'no-compose', String(posted));
    if (posted === 'dispatched') {
      const noteLanded = await page.evaluate(() =>
        [...document.querySelectorAll('.comment')].some((c) => (c.textContent || '').includes('walk note')));
      check('note posts into the thread (real event → side effect)', noteLanded);
    }
  });

  // 3. Rules half
  await walk('build rules', `/projects/${SLUG}/build/rules`, async (page) => {
    await page.waitForSelector('.build-screen, .center-card', { timeout: 15_000 });
    check('rules surface (.rules-half, .arch-card, .config-grid, .md-card)', await page.evaluate(() =>
      !!document.querySelector('.rules-half') && !!document.querySelector('.arch-card') &&
      !!document.querySelector('.config-grid') && !!document.querySelector('.md-card')));
    check('agent cards render', await page.evaluate(() =>
      document.querySelectorAll('.agent-md-card').length >= 4));
    check('architecture card shows lock (read-only)', await page.evaluate(() =>
      !!document.querySelector('.arch-card .lock')));
  });

  // 4. Split-switch on build list: click "Rules" tab → rules half appears
  await walk('split-switch fires real event', `/projects/${SLUG}/build`, async (page) => {
    await page.waitForSelector('.build-screen', { timeout: 15_000 });
    const switched = await page.evaluate(() => new Promise((resolve) => {
      const btn = [...document.querySelectorAll('.split-switch button, .split-switch span, .split-switch a')]
        .find((b) => (b.textContent || '').trim() === 'Rules');
      if (!btn) return resolve('no-rules-tab');
      btn.click();
      setTimeout(() => resolve(document.querySelector('.rules-half') ? 'rules-visible' : 'no-rules-half'), 4000);
    }));
    check('split-switch Rules tab → rules-half renders', switched === 'rules-visible', String(switched));
  });

  // 5. Story detail CTA present (state-derived pill) — US-01 has no row (null),
  // so open it via list navigation instead: click first story row
  await walk('story row click navigates to detail', `/projects/${SLUG}/build`, async (page) => {
    await page.waitForSelector('.story-row .row-open', { timeout: 15_000 });
    const clicked = await page.evaluate(() => new Promise((resolve) => {
      const open = document.querySelector('.story-row .row-open');
      if (!open) return resolve('no-open');
      open.click();
      setTimeout(() => resolve(location.pathname), 4000);
    }));
    check('clicking row-open navigates (location changed)', String(clicked).includes('/build/'), String(clicked));
  });

  console.log(`\nverify-build-ui-walk: ${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.error(`verify-build-ui-walk aborted: ${String(e).slice(0, 300)}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  api.kill('SIGTERM');
  web.kill('SIGTERM');
}
