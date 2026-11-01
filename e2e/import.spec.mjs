// Settings > Import: the API is answered by a made-up route (app/test/fixtures/import-sync.json, ids and
// names made unique per run), the preview counts what would come over, the import writes it, a second import adds
// nothing, and the token never lands in storage and leaves the field. The page passes axe.
import fs from 'node:fs';
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, openSettings, settingsBack, openTab } from './fixtures.mjs';

const API = 'https://api.todoist.com/api/v1/sync';
const TITLE = 'Import from Todoist';

/** the fixture with every id, name and label made unique, and every date moved far ahead (nothing overdue for other specs) */
function answer(u) {
  const raw = JSON.parse(fs.readFileSync(new URL('../app/test/fixtures/import-sync.json', import.meta.url), 'utf8').replaceAll('2026-', '2099-'));
  const ids = ['id', 'project_id', 'section_id', 'parent_id'];
  for (const list of Object.values(raw)) {
    if (!Array.isArray(list)) continue;
    for (const x of list) {
      for (const k of ids) if (typeof x[k] === 'string') x[k] = `${u}-${x[k]}`;
      if (!x.inbox_project && typeof x.name === 'string') x.name = `${x.name} ${u}`;
      if (typeof x.content === 'string') x.content = `${x.content} ${u}`;
      if (Array.isArray(x.labels)) x.labels = x.labels.map(l => `${l} ${u}`);
    }
  }
  return raw;
}

/** answer the API from the made-up JSON; remembers what the page sent */
async function mockApi(page, body, { status = 200 } = {}) {
  const seen = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST' };
  await page.route(API, route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    seen.push({ auth: req.headers().authorization, body: req.postData(), credentials: req.headers().cookie });
    return route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(status === 200 ? body : { error: 'bad token', error_code: 477 }) });
  });
  return seen;
}

/** everything the page stores: local and session storage, every IndexedDB database, cookies */
const stored = page => page.evaluate(async () => {
  const out = { local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie, idb: {} };
  for (const { name } of await indexedDB.databases()) {
    const db = await new Promise((ok, no) => { const r = indexedDB.open(name); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
    out.idb[name] = {};
    for (const store of [...db.objectStoreNames]) {
      out.idb[name][store] = await new Promise((ok, no) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
    }
    db.close();
  }
  return JSON.stringify(out);
});

const field = page => page.locator('#settings-host #import-token');
const countOf = (page, name) => page.locator('#settings-host .td-import-count').filter({ has: page.locator('dt', { hasText: new RegExp(`^${name}$`) }) }).locator('dd');
const byExt = async (coll, prefix) => (await db.list(`spaces/_/${coll}`)).filter(d => String(d.extId ?? '').startsWith(prefix));

test('preview, import, no token left behind, a second import adds nothing', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  const u = uniq('im'), token = `tok_${uniq('secret')}`;
  const seen = await mockApi(page, answer(u));
  await openSettings(page, TITLE);
  const host = page.locator('#settings-host');
  await expect(field(page)).toHaveAttribute('type', 'password');
  expect(await AxeBuilder(page)).toEqual([]);

  await expect(host.getByRole('button', { name: 'Preview' })).toBeDisabled();
  await field(page).fill(token);
  await host.getByRole('button', { name: 'Show token' }).click();
  await expect(field(page)).toHaveAttribute('type', 'text');
  await host.getByRole('button', { name: 'Hide token' }).click();
  await host.getByRole('button', { name: 'Preview' }).click();
  await expect(countOf(page, 'Tasks')).toHaveText('9');
  for (const [name, n] of [['Projects', '3'], ['Sections', '3'], ['Labels', '3'], ['Repeating tasks', '4'], ['Filters', '2']]) await expect(countOf(page, name)).toHaveText(n);
  await expect(host.locator('.td-import-unparsed')).toContainText('every blue moon');
  // the call: the token as a bearer header, a full sync of the five resources, no cookies
  expect(seen).toHaveLength(1);
  expect(seen[0].auth).toBe(`Bearer ${token}`);
  expect(seen[0].body).toContain('sync_token=*');
  expect(decodeURIComponent(seen[0].body)).toContain('["projects","sections","labels","items","filters"]');
  expect(seen[0].credentials).toBeUndefined();
  // the token left the field the moment the answer came
  await expect(field(page)).toHaveValue('');
  expect(await AxeBuilder(page)).toEqual([]);

  await host.getByRole('button', { name: 'Import', exact: true }).click();
  const confirm = page.locator('dialog[open]');
  await expect(confirm).toContainText('Import 9 tasks into this account?');
  await confirm.getByRole('button', { name: 'Import' }).click();
  await expect(host.locator('.td-import-done-title')).toContainText('Imported 9 tasks', { timeout: 30_000 });
  expect(await AxeBuilder(page)).toEqual([]);

  // what was written: ids kept in extId, priority inverted, sections and labels, the recurring date, a deadline
  const pre = `${u}-`;
  await synced(page);
  const tasks = await byExt('tasks', pre), projects = await byExt('projects', pre), sections = await byExt('sections', pre);
  expect(tasks).toHaveLength(9);
  expect(projects.map(p => p.name.replace(` ${u}`, '')).sort()).toEqual(['Garden', 'Home', 'Inbox', 'Shed']);   // (the Inbox is the app's own, with the source id added)
  expect(sections).toHaveLength(3);
  const task = start => tasks.find(t => t.title.startsWith(start));
  expect(task('Call the plumber').priority).toBe(1);
  expect(task('Buy stamps').priority).toBe(4);
  expect(task('Call the plumber').labels).toHaveLength(2);
  expect(task('Water the ferns').due).toEqual({ date: '2099-11-04', rrule: 'FREQ=DAILY;INTERVAL=3', string: 'every 3 days' });
  expect(task('Water the ferns').deadline).toBe('2099-12-01');
  expect(task('Sort the drawers').due).toEqual({ date: '2099-11-09' });
  expect(task('Buy stamps').projectId).toBe('inbox');
  expect((await db.list('spaces/_/projects')).filter(p => p.inbox)).toHaveLength(1);
  expect(await byExt('filters', `${u}-`)).toHaveLength(2);

  // on screen: the projects in Browse, a project with its sections and the rings' priorities
  await synced(page);
  await host.getByRole('button', { name: 'Open Inbox' }).click();
  await openTab(page, 'browse');
  const home = projects.find(p => p.name.startsWith('Home'));
  await expect(page.getByLabel('Favorites').getByRole('button', { name: new RegExp(`^Garden ${u}`) })).toBeVisible();   // (the source's favourite)
  await page.getByLabel('My Projects').getByRole('button', { name: new RegExp(`^Home ${u}`) }).click();
  await expect(page.locator('#project-page')).toBeVisible();
  await expect(page.locator('#project-page .td-group-title')).toContainText(['Now', 'Later']);
  const row = start => page.locator('#project-page .td-row', { hasText: start });
  await expect(row('Water the ferns')).toHaveAttribute('data-priority', '3');
  await expect(row('Check the mailbox')).toHaveAttribute('data-priority', '2');
  await expect(row('Sort the drawers')).toHaveAttribute('data-priority', '4');
  await expect(row('Water the ferns').locator('.td-date:not(.td-deadline)')).toContainText('4 Nov 2099');
  expect(home.view).toBe('list');

  // nothing stored, nothing in the field
  const dump = await stored(page);
  expect(dump).not.toContain(token);
  expect(dump).not.toContain(token.slice(4));

  // the same answer again: the preview says everything is there; no duplicates
  await openSettings(page, TITLE);
  await expect(field(page)).toHaveValue('');
  await field(page).fill(token);
  await host.getByRole('button', { name: 'Preview' }).click();
  await expect(countOf(page, 'Tasks')).toHaveText('9');
  await expect(host.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
  await expect(host).toContainText('already imported');
  expect(await byExt('tasks', pre)).toHaveLength(9);
  expect(await byExt('projects', pre)).toHaveLength(4);
  expect((await stored(page))).not.toContain(token);
});

test('a token that is not accepted says so, and leaving the page empties the field', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const seen = await mockApi(page, {}, { status: 401 });
  await openSettings(page, TITLE);
  const host = page.locator('#settings-host');
  await field(page).fill('not-a-real-token');
  await host.getByRole('button', { name: 'Preview' }).click();
  await expect(host.locator('.td-import-status')).toHaveText('That token was not accepted');
  expect(seen).toHaveLength(1);
  await expect(host.locator('.td-import-card')).toHaveCount(0);
  expect(await AxeBuilder(page)).toEqual([]);
  // back to the Settings menu and in again: nothing typed is kept
  await field(page).fill('typed-and-left');
  await settingsBack(page);
  await openSettings(page, TITLE);
  await expect(field(page)).toHaveValue('');
  await expect(host.locator('.td-import-status')).toHaveText('');
});

test('the server cannot be reached: a plain message, and the token stays to try again', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await page.route(API, route => route.abort('failed'));
  await openSettings(page, TITLE);
  await field(page).fill('some-token');
  await page.locator('#settings-host').getByRole('button', { name: 'Preview' }).click();
  await expect(page.locator('#settings-host .td-import-status')).toContainText('Could not reach the server');
  await expect(field(page)).toHaveValue('some-token');
});
