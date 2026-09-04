// verify-visual.mjs — headless visual smoke for the launcher UI.
//
// Spawns the API server and Vite dev server on isolated ports, drives the
// four main screens in headless Chromium, asserts each screen's structural
// markers actually render (the DOM, not just the HTTP status), checks that
// the token layer is applied, and saves screenshots for eyeball review.
//
// Markers are alternates so empty/error variants count as rendered — this
// rig verifies "the screen renders", not "the screen has data".
//
// Usage:  npm run verify:visual
// Env:    CHROME_PATH           absolute path to a Chromium/Chrome binary
//                               (auto-discovers the Playwright cache and
//                               /Applications otherwise)
//         LAUNCHER_WEB_PORT     default 5195 (kept clear of the dev pair
//                               5183/5184 so concurrent sessions don't fight)
//         LAUNCHER_API_PORT     default 5196
//         SMOKE_SHOT_DIR        default <os tmpdir>/launcher-smoke
//
// Detail screens (background, requirements) are SKIPped when the DB has no
// projects — the rig never mutates your dev DB (write-back, never delete).
// Run `npm run db:seed` first for full coverage.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // launcher/
const WEB_PORT = Number(process.env.LAUNCHER_WEB_PORT ?? 5195);
const API_PORT = Number(process.env.LAUNCHER_API_PORT ?? 5196);
// localhost, not 127.0.0.1 — Vite binds ::1 on this host, and the browser
// resolves localhost the same way the probe does.
const BASE = `http://localhost:${WEB_PORT}`;
const SHOT_DIR = process.env.SMOKE_SHOT_DIR ?? path.join(os.tmpdir(), 'launcher-smoke');

// data/ is gitignored and absent in a fresh clone — create it if missing.
// Idempotent mkdir only; the rig never deletes or reseeds the DB (the schema
// migrates on boot, and the rig reads /api/projects read-only).
mkdirSync(path.join(ROOT, 'data'), { recursive: true });

let pass = 0, fail = 0, skip = 0;
const check = (name, cond, extra = '') => {
  if (cond === 'skip') { skip++; console.log(`  skip  ${name} ${extra}`); }
  else if (cond) { pass++; console.log(`  ok    ${name}`); }
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
  const pw = path.join(os.homedir(), '.cache', 'ms-playwright');
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

const killAll = [];
const spawnStep = (cmd, args, env) => {
  const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  killAll.push(child);
  child.stderr.on('data', (d) => process.stderr.write(`    [srv] ${d}`.split('\n').slice(-1)[0]));
  return child;
};

const SCREENS = [
  { name: 'projects', url: '/projects', markers: ['.tile-grid', '.sec-head', '.empty'] },
  { name: 'new-idea-chat', url: '/new', markers: ['.center-card', '.crumbs'] },
];

// ── main ──
let browser;
try {
  console.log(`verify-visual: web :${WEB_PORT} api :${API_PORT}`);

  // A project id for the detail screens (read-only — never mutates the DB).
  spawnStep('npx', ['tsx', 'server/index.ts'], { PORT: String(API_PORT) });
  spawnStep('npx', ['vite', '--port', String(WEB_PORT), '--strictPort'], { LAUNCHER_API_PORT: String(API_PORT) });
  await waitReady(`http://127.0.0.1:${API_PORT}/api/health`, 'API server');
  await waitReady(BASE + '/', 'Vite dev server');

  const projects = await (await fetch(`http://127.0.0.1:${API_PORT}/api/projects`)).json();
  const list = Array.isArray(projects) ? projects : projects.projects ?? [];
  if (list.length > 0) {
    const id = list[0].id;
    SCREENS.push(
      { name: 'background', url: `/projects/${id}/background`, markers: ['.ba-workspace', '.ba-error-card', '.ba-warn'] },
      { name: 'requirements', url: `/projects/${id}/requirements`, markers: ['.req-screen', '.center-card'] },
    );
  } else {
    console.log('  note  no projects in DB — detail screens skipped (run `npm run db:seed` for full coverage)');
  }

  const chrome = findChrome();
  if (!chrome) throw new Error('no Chromium/Chrome found — set CHROME_PATH');
  browser = await puppeteer.launch({ executablePath: chrome, headless: 'new' });
  mkdirSync(SHOT_DIR, { recursive: true });

  for (const screen of SCREENS) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    try {
      await page.goto(BASE + screen.url, { waitUntil: 'networkidle0', timeout: 30_000 });
      const rendered = await page.evaluate((markers) =>
        markers.some((m) => document.querySelector(m)),
      screen.markers);
      check(`${screen.name} renders (${screen.markers.join(' | ')})`, rendered);

      // Token layer applied — catches "stylesheets didn't load" regressions.
      const tokens = await page.evaluate(() =>
        ['--ink', '--coral'].every((v) =>
          getComputedStyle(document.documentElement).getPropertyValue(v).trim() !== ''));
      check(`${screen.name} token layer applied (--ink, --coral)`, tokens);

      check(`${screen.name} no uncaught page errors`, pageErrors.length === 0,
        pageErrors.slice(0, 2).join(' / '));

      await page.screenshot({ path: path.join(SHOT_DIR, `${screen.name}.png`), fullPage: true });
    } catch (e) {
      check(`${screen.name} load`, false, String(e).slice(0, 120));
    } finally {
      await page.close();
    }
  }

  console.log(`\nverify-visual: ${pass} passed, ${fail} failed, ${skip} skipped — screenshots in ${SHOT_DIR}`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.error(`verify-visual: aborted — ${String(e).slice(0, 300)}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const child of killAll) child.kill('SIGTERM');
}