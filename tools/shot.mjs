// Dev tool: a PNG of one of the app's screens at iPhone size (390x844, 3x), signed in as a made-up account on the
// Firestore emulator with sample data, no real sign-in and no network but the UI kit (served from node_modules/app-ui).
//
//   node tools/shot.mjs <out.png> [--dark] [--tab <page id>] [--project <name>] [--task <title>] [--settings <page title>] [--seed <file.json>]
//                       [--click <selector or text=...>]... [--eval <js in the page>]... [--wait <ms>] [--full]
//                       [--width 390 --height 844 --dpr 3] [--ui <app-ui dir>] [--keep]
//
// --tab: a tab's page id (inbox-page, today-page, upcoming-page, search-page, browse-page; default the first screen).
// --project: open that project's page from Browse (its name). --task: open that task's sheet (its title, on the
// screen shown). --settings: open Settings from Browse's gear, then that page (About shows "Install this app"; 840 px and up: the dialog's nav row).
// --click / --eval run in order after that (a sheet, a swipe, a menu); --wait pauses; --full is the whole page.
// --seed: { "<firestore doc path>": { fields } }; "{{today}}" and "{{today+3}}" in a string become that day (YYYY-MM-DD),
//   "{{now}}" alone the time in ms, a number (default tools/shot-seed.json, the app's data model, kept in step with it).
// Starts the emulators (a temp folder, so no log files land in the repo) and the e2e server unless already up, and stops
// what it started. Needs Java, PW_CHROMIUM (tools/dev-setup.sh) and `npm ci`. Made-up data only; never a live project.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { fsAdmin, waitForEmulators, waitFor } from '../.devkit/playwright/helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opts = { click: /** @type {string[]} */ ([]), eval: /** @type {string[]} */ ([]) };
const out = argv[0] && !argv[0].startsWith('--') ? path.resolve(argv.shift()) : '';
for (let i = 0; i < argv.length; i++) {
  const k = argv[i].replace(/^--/, '');
  if (['dark', 'full', 'keep'].includes(k)) opts[k] = true;
  else if (k === 'click' || k === 'eval') opts[k].push(argv[++i]);
  else opts[k] = argv[++i];
}
if (!out) { console.error('usage: node tools/shot.mjs <out.png> [--dark] [--tab <id>] [--settings <title>] [--seed f.json] [--click sel]... [--wait ms] [--full]'); process.exit(2); }

const PORT = Number(opts.port || 4173);
const UI_DIR = path.resolve(opts.ui || path.join(ROOT, 'node_modules/app-ui'));
const CORE = path.join(ROOT, 'e2e/fixtures/core');
const started = /** @type {import('node:child_process').ChildProcess[]} */ ([]);
const up = url => fetch(url).then(r => r.status < 500, () => false);

// the emulators, from a temp folder (firebase writes its debug logs to the folder it runs in)
if (!(await up('http://127.0.0.1:9099')) || !(await up('http://127.0.0.1:8080'))) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-emu-'));
  started.push(spawn('npx', ['-y', 'firebase-tools@15.33.0', 'emulators:start', '--only', 'firestore,auth', '--project', 'demo-todo',
    '--config', path.join(ROOT, 'app/firebase.json')], { cwd, stdio: 'ignore', detached: true, env: { ...process.env, METADATA_SERVER_DETECTION: 'none' } }));
  await waitForEmulators(['firestore', 'auth'], { timeout: 180_000 });
}
// the e2e server (the real Worker in Node)
if (!(await up(`http://localhost:${PORT}/app/`))) {
  started.push(spawn('node', ['e2e/serve.mjs', String(PORT)], { cwd: ROOT, stdio: 'ignore', detached: true }));
  await waitFor(() => up(`http://localhost:${PORT}/app/`), { timeout: 30_000, message: 'e2e server' });
}
// (a process group: npx's child, firebase's and the emulators' Java all go with it)
const stop = () => { for (const p of started) { try { process.kill(-(/** @type {number} */ (p.pid)), 'SIGTERM'); } catch { /* gone */ } } };
process.on('exit', stop);

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const serve = (root, rel) => {
  const file = path.join(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return { status: 404, body: `not in ${root}: ${rel}` };
  return { status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) };
};

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: Number(opts.width || 390), height: Number(opts.height || 844) }, deviceScaleFactor: Number(opts.dpr || 3),
    isMobile: true, hasTouch: true, colorScheme: opts.dark ? 'dark' : 'light', locale: 'en-US',
  });
  await context.addInitScript(() => {
    const { get, set } = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
    Object.defineProperty(HTMLScriptElement.prototype, 'src', { configurable: true, get, set(url) {
      if (/^https:\/\/apis\.google\.com\//.test(url)) return void setTimeout(() => this.dispatchEvent(new Event('error')));
      set.call(this, url);
    } });
    try { localStorage.setItem('core-glass-guard', JSON.stringify({ solid: false, why: '' })); } catch { /* opaque origin */ }
  });
  // the kit from node_modules/app-ui (same version as the import map), sync/update from e2e/fixtures/core, nothing else online
  await context.route(/^https:\/\/core\.anawj\.com\/(.*)$/, route => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname);
    return route.fulfill(rel.startsWith('/ui/') ? serve(UI_DIR, rel.split('/').slice(3).join('/')) : serve(CORE, rel));
  });
  await context.route('https://design.flamingbeing.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route(/^https:\/\/(apis|www)\.google\.com\//, route => route.abort('blockedbyclient'));
  const page = await context.newPage();
  page.on('pageerror', e => console.error('page error:', e.message, process.env.SHOT_STACK ? e.stack : ''));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });

  // sign in as a made-up member
  const db = fsAdmin('demo-todo');
  await page.goto(`http://localhost:${PORT}/app/?emulator`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#signed-out', { state: 'visible' });
  await page.evaluate(e => window.starter.signInAs(e), `shot-${Date.now().toString(36)}@example.com`);
  await page.waitForSelector('#no-access', { state: 'visible' });
  const uid = (await page.locator('#uid').textContent()) || '';
  await db.put(`members/${uid}`, { role: 'member', v: 1 });
  await page.waitForSelector('#list-view', { state: 'visible' });

  // sample data (the seed file's paths name spaces/_/...: they go to this person's own space, spaces/<uid>/...), then wait for the app to hear it
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fill = v => v === '{{now}}' ? Date.now() : typeof v === 'string' ? v.replace(/\{\{today(?:\+(-?\d+))?\}\}/g, (_, n) => day(Number(n || 0))).replace(/\{\{now\}\}/g, String(Date.now()))
    : Array.isArray(v) ? v.map(fill) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v;
  const seed = JSON.parse(fs.readFileSync(path.resolve(opts.seed || path.join(ROOT, 'tools/shot-seed.json')), 'utf8'));
  for (const [p, doc] of Object.entries(seed)) {
    const f = fill(doc);
    await db.put(p.replace(/^spaces\/_\//, `spaces/${uid}/`), { ...(p.includes('/tasks/') ? { done: false } : {}), createdAt: Date.now(), updatedAt: Date.now(), ...f });
  }
  await page.waitForFunction(() => window.starter.ready === true);
  await page.waitForTimeout(800);

  // the screen
  const tab = opts.tab;
  if (tab) {
    await page.evaluate(() => { scrollTo(0, 0); document.querySelector('.ui-tabbar')?.classList.remove('is-minimised'); });
    await page.locator(`.ui-tab[data-tab-page="#${tab}"]:visible, .ui-side-link[data-tab-page="#${tab}"]:visible`).first().click();
    await page.waitForTimeout(500);
  }
  const browse = async () => {
    await page.locator('.ui-tab[data-tab-page="#browse-page"]:visible, .ui-side-link[data-tab-page="#browse-page"]:visible').first().click();
    await page.waitForSelector('#browse-settings', { state: 'visible' });
  };
  if (opts.project) {
    // (with the wide side bar: its My Projects row; else Browse's)
    const side = page.locator('#side .td-side-row:visible').filter({ hasText: new RegExp(`^${opts.project}`) });
    if (await side.count()) await side.first().click();
    else {
      await browse();
      await page.locator('#browse .td-browse-row').filter({ hasText: new RegExp(`^${opts.project}`) }).first().click();
    }
    await page.waitForTimeout(600);
  }
  if (opts.task) {
    await page.locator('.ui-screen:not([hidden]) .td-row-main:visible').filter({ hasText: opts.task }).first().click();
    await page.waitForSelector('#task-sheet[open]');
    await page.waitForTimeout(600);
  }
  if (opts.settings) {
    // (with the wide side bar: its account menu's Settings; else Browse's gear)
    if (await page.locator('.td-side-me:visible').count()) {
      await page.locator('.td-side-me').click();
      await page.locator('.td-menu .ui-menu-item').filter({ hasText: /^Settings/ }).first().click();
    } else {
      await browse();
      await page.locator('#browse-settings').click();
    }
    await page.waitForTimeout(500);
    // (840 px and up: the Settings dialog, its nav's row; else the screen's menu row)
    if (await page.locator('#settings-modal[open]').count()) {
      await page.locator('#settings-modal .td-set-row').filter({ hasText: new RegExp(`^${opts.settings}`) }).first().click();
    } else {
      const back = page.locator('#settings-host .ui-settings-back:visible');
      if (await back.count()) await back.click();
      await page.locator('#settings-host .ui-settings-menu-groups .ui-settings-go').filter({ hasText: new RegExp(`^${opts.settings}`) }).click();
    }
    await page.waitForTimeout(500);
  }
  for (const c of opts.click) { await page.locator(c).first().click(); await page.waitForTimeout(400); }
  for (const e of opts.eval) { await page.evaluate(e); await page.waitForTimeout(300); }
  await page.waitForTimeout(Number(opts.wait || 300));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: !!opts.full });
  console.log(`shot: ${out}`);
  if (opts.keep) { console.log('--keep: emulators and server left running'); started.length = 0; }
} finally {
  await browser?.close();
  stop();
}
