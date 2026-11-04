// Settings > Export to Todoist: the API is answered by a made-up route; the preview counts what would be added (and notes that
// it adds, so a second run makes copies), the export sends Sync API commands (projects and sections with their links, parents
// before children, priorities turned back, a repeat's own words, the Inbox mapped to the account's Inbox), a failure is named in
// plain words with the rest still sent, and the token never lands in storage and leaves the field. The page passes axe.
import fs from 'node:fs';
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, openSettings } from './fixtures.mjs';

test.describe.configure({ mode: 'serial' });

const API = 'https://api.todoist.com/api/v1/sync';
const TITLE = 'Export to Todoist';
const REAL_INBOX = 'real-inbox-id';
const now = () => ({ createdAt: Date.now(), updatedAt: Date.now() });

/** the one place that writes the app's records (the data path changes with the space layout) @param {string} coll @param {string} id @param {object} rec */
const put = (coll, id, rec) => db.put(`spaces/_/${coll}/${id}`, { ...rec, ...now() });

/** a small made-up account: a project with a child project, a section, a label, a repeating task, a sub task, an Inbox task */
async function seed(u) {
  const ids = { home: `${u}-home`, shed: `${u}-shed`, sec: `${u}-sec`, lab: `${u}-lab`, have: `${u}-have`, top: `${u}-top`, sub: `${u}-sub`, rep: `${u}-rep`, inbox: `${u}-inbox`, done: `${u}-done` };
  const names = { home: `Home ${u}`, shed: `Shed ${u}`, sec: `Now ${u}`, lab: `errand ${u}`, have: `have ${u}`, top: `Call the plumber ${u}`, sub: `Find the number ${u}`, rep: `Water the ferns ${u}`, inbox: `Buy stamps ${u}`, done: `Finished ${u}` };
  await put('projects', ids.home, { name: names.home, color: 'blue', parentId: null, view: 'list', order: 5000, favorite: true });
  await put('projects', ids.shed, { name: names.shed, color: 'green', parentId: ids.home, view: 'board', order: 5001 });
  await put('sections', ids.sec, { name: names.sec, projectId: ids.home, order: 1, collapsed: false });
  await put('labels', ids.lab, { name: names.lab, color: 'red', order: 5000 });
  await put('labels', ids.have, { name: names.have, color: 'red', order: 5001 });
  await put('tasks', ids.top, { title: names.top, description: 'Ring before noon', projectId: ids.home, sectionId: ids.sec, order: 1, priority: 1, labels: [ids.lab, ids.have], deadline: '2099-12-01', done: false });
  await put('tasks', ids.sub, { title: names.sub, projectId: ids.home, sectionId: ids.sec, parentId: ids.top, order: 1, priority: 3, done: false });
  await put('tasks', ids.rep, { title: names.rep, projectId: ids.home, order: 2, priority: 4, due: { date: '2099-11-04', rrule: 'FREQ=DAILY;INTERVAL=3', string: 'every 3 days' }, done: false });
  await put('tasks', ids.inbox, { title: names.inbox, projectId: 'inbox', order: 5000, priority: 2, due: { date: '2099-11-05', time: '09:30' }, duration: 30, done: false });
  await put('tasks', ids.done, { title: names.done, projectId: ids.home, order: 3, priority: 4, done: true, doneAt: Date.now() });
  return names;
}

/** answer the API: a sync read gives the account's projects and labels; commands are all ok, unless `fail` names a project to refuse. Remembers each request */
async function mockApi(page, { fail = '', status = 200 } = {}) {
  const seen = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST' };
  await page.route(API, route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const form = new URLSearchParams(req.postData() ?? '');
    const commands = form.get('commands') ? JSON.parse(form.get('commands')) : null;
    seen.push({ auth: req.headers().authorization, form, commands, cookie: req.headers().cookie });
    if (status !== 200) return route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: 'bad token' }) });
    if (!commands) {
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({
        projects: [{ id: REAL_INBOX, name: 'Inbox', inbox_project: true }, { id: 'other', name: 'Elsewhere' }],
        labels: [{ id: 'l9', name: 'HAVE' }],   // (any case) each spec's own `have ${u}` label is added to the answer below
      }) });
    }
    const sync_status = {}, temp_id_mapping = {};
    for (const c of commands) {
      // (like the real API: a command naming a project that was refused in the same request is refused too)
      const refused = fail && commands.some(r => r.type === 'project_add' && r.args.name.startsWith(fail) && [c.args.project_id, c.args.parent_id].includes(r.temp_id));
      sync_status[c.uuid] = fail && c.type === 'project_add' && c.args.name.startsWith(fail) ? { error_code: 15, error: 'Invalid argument value' } : refused ? { error_code: 20, error: 'Project not found' } : 'ok';
      if (c.temp_id && sync_status[c.uuid] === 'ok') temp_id_mapping[c.temp_id] = `real-${c.temp_id}`;
    }
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ sync_status, temp_id_mapping }) });
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

const field = page => page.locator('#settings-host #export-token');
const countOf = (page, name) => page.locator('#settings-host .td-import-count').filter({ has: page.locator('dt', { hasText: new RegExp(`^${name}$`) }) }).locator('dd');
/** every command sent, in order, from the write requests */
const sent = seen => seen.flatMap(s => s.commands ?? []);

test('preview, export the commands, no token left behind', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const u = uniq('ex'), token = `tok_${uniq('secret')}`;
  const names = await seed(u);
  await synced(page);
  const seen = await mockApi(page);
  await openSettings(page, TITLE);
  const host = page.locator('#settings-host');
  await expect(field(page)).toHaveAttribute('type', 'password');
  expect(await AxeBuilder(page)).toEqual([]);
  await expect(host.getByRole('button', { name: 'Preview' })).toBeDisabled();
  await field(page).fill(token);
  await host.getByRole('button', { name: 'Preview' }).click();

  // the preview: what the account has, what will be added (the shared test account may hold other specs' records too), and that it only adds
  await expect(host.locator('.td-import-result .td-import-card')).toBeVisible();
  const sentence = await host.locator('.td-import-result .td-import-card > .td-import-h').textContent();
  const [, p, s, l, t] = /^(\d+) projects?, (\d+) sections?, (\d+) labels?, (\d+) tasks? will be added to your Todoist account$/.exec(sentence).map(Number);
  expect(p).toBeGreaterThanOrEqual(2); expect(s).toBeGreaterThanOrEqual(1); expect(l).toBeGreaterThanOrEqual(2); expect(t).toBeGreaterThanOrEqual(4);
  expect(Number(await countOf(page, 'Tasks').textContent())).toBe(t);
  await expect(host).toContainText('Your Todoist account has 1 project and 1 label now');
  await expect(host).toContainText('running it twice makes duplicates');
  await expect(host).toContainText('Only open tasks are exported');
  expect(seen).toHaveLength(1);
  expect(seen[0].auth).toBe(`Bearer ${token}`);
  expect(seen[0].form.get('sync_token')).toBe('*');
  expect(seen[0].form.get('resource_types')).toBe('["projects","labels"]');
  expect(seen[0].cookie).toBeUndefined();
  await expect(field(page)).toHaveValue('');   // the token left the field once the answer came
  expect(await AxeBuilder(page)).toEqual([]);

  await host.getByRole('button', { name: 'Export', exact: true }).click();
  const confirm = page.locator('dialog[open]');
  await expect(confirm).toContainText('to your Todoist account');
  await confirm.getByRole('button', { name: 'Export' }).click();
  await expect(host.locator('.td-import-done-title')).toContainText(`Added ${t} tasks`, { timeout: 30_000 });
  expect(await AxeBuilder(page)).toEqual([]);

  // the commands: every request carries the token, at most 100 commands each
  const writes = seen.slice(1);
  expect(writes.length).toBeGreaterThanOrEqual(1);
  for (const w of writes) { expect(w.auth).toBe(`Bearer ${token}`); expect(w.commands.length).toBeLessThanOrEqual(100); }
  const all = sent(seen);
  const project = name => all.find(c => c.type === 'project_add' && c.args.name === name);
  const section = name => all.find(c => c.type === 'section_add' && c.args.name === name);
  const item = name => all.find(c => c.type === 'item_add' && c.args.content === name);
  const home = project(names.home), shed = project(names.shed);
  expect(home.args).toMatchObject({ color: 'blue', view_style: 'list', is_favorite: true });
  expect(home.args.parent_id).toBeUndefined();
  expect(shed.args).toMatchObject({ view_style: 'board', parent_id: home.temp_id });
  expect(all.indexOf(home)).toBeLessThan(all.indexOf(shed));
  const sec = section(names.sec);
  expect(sec.args.project_id).toBe(home.temp_id);
  expect(all.find(c => c.type === 'label_add' && c.args.name === names.lab)).toBeTruthy();
  expect(all.find(c => c.type === 'label_add' && c.args.name === names.have)).toBeTruthy();   // (the account's `HAVE` is another name)
  const top = item(names.top), sub = item(names.sub), rep = item(names.rep), inbox = item(names.inbox);
  expect(top.args).toMatchObject({ priority: 4, project_id: home.temp_id, section_id: sec.temp_id, description: 'Ring before noon', deadline: { date: '2099-12-01' } });
  expect(top.args.labels).toEqual([names.lab, names.have]);
  expect(sub.args).toMatchObject({ priority: 2, parent_id: top.temp_id, section_id: sec.temp_id });
  expect(all.indexOf(top)).toBeLessThan(all.indexOf(sub));
  expect(rep.args).toMatchObject({ priority: 1, due: { string: 'every 3 days' } });
  expect(inbox.args).toMatchObject({ project_id: REAL_INBOX, priority: 3, due: { date: '2099-11-05T09:30:00' }, duration: { amount: 30, unit: 'minute' } });
  expect(all.some(c => c.type === 'project_add' && c.args.name === 'Inbox')).toBe(false);
  expect(item(names.done)).toBeUndefined();   // finished tasks stay here
  // (the token is only ever a header, never inside a command)
  for (const w of writes) for (const c of w.commands) expect(JSON.stringify(c)).not.toContain(token);

  // no token in any storage, and none left in the page
  expect(await stored(page)).not.toContain(token);
  await expect(field(page)).toHaveValue('');
});

test('a refused project is named in plain words and the rest is still sent', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const u = uniq('ef');
  const names = await seed(u);
  await synced(page);
  const seen = await mockApi(page, { fail: `Home ${u}` });
  await openSettings(page, TITLE);
  const host = page.locator('#settings-host');
  await field(page).fill(`tok_${uniq('secret')}`);
  await host.getByRole('button', { name: 'Preview' }).click();
  await host.getByRole('button', { name: 'Export', exact: true }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Export' }).click();
  await expect(host.locator('.td-import-unparsed')).toContainText(`project ${names.home}`, { timeout: 30_000 });
  await expect(host.locator('.td-import-unparsed')).toContainText('Invalid argument value');
  await expect(host).toContainText('not added');
  await expect(host.locator('.td-import-done-title')).toHaveCount(0);
  // what needed it was left out; the Inbox task still went
  const all = sent(seen);
  expect(all.some(c => c.type === 'item_add' && c.args.content === names.inbox)).toBe(true);
  await expect(host.locator('.td-import-unparsed')).toContainText(`project ${names.shed}`);
  await expect(host.locator('.td-import-unparsed')).toContainText('Project not found');
});

test('a token that is not accepted says so and sends nothing else', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const seen = await mockApi(page, { status: 401 });
  await openSettings(page, TITLE);
  const host = page.locator('#settings-host');
  await field(page).fill('tok_wrong');
  await host.getByRole('button', { name: 'Preview' }).click();
  await expect(host.locator('.td-import-status')).toHaveText('That token was not accepted');
  expect(seen).toHaveLength(1);
  await expect(host.getByRole('button', { name: 'Export', exact: true })).toHaveCount(0);
});

test('Download a backup file saves everything as JSON', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const u = uniq('eb');
  const names = await seed(u);
  await synced(page);
  await openSettings(page, TITLE);
  const host = page.locator('#settings-host');
  const [download] = await Promise.all([page.waitForEvent('download'), host.getByRole('button', { name: 'Download a backup file' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^todo-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  expect(file.tasks.find(t => t.title === names.top)).toMatchObject({ priority: 1, projectId: `${u}-home` });
  expect(file.tasks.find(t => t.title === names.done).done).toBe(true);   // finished tasks are in the backup
  expect(file.projects.map(p => p.name)).toContain(names.home);
  expect(JSON.stringify(file)).not.toMatch(/_edits|serverAt|_deleted/);
  await expect(host).toContainText('Saved todo-backup-');
});
