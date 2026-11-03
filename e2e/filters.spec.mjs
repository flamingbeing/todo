// Saved filters: Filters & Labels > + opens the filter sheet; its query counts the tasks it finds as it is typed (or
// says, in red, what is wrong and where); Add saves it and opens its page, one list per comma part headed by that
// part; a favourite shows in Browse. The sheet and the page pass axe. Deadline words find tasks by their deadline.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, today, db, openTab } from './fixtures.mjs';

const now = () => ({ createdAt: Date.now(), updatedAt: Date.now() });
const task = (id, fields) => db.put(`spaces/_/tasks/${id}`, { title: id, projectId: 'inbox', order: Date.now(), priority: 4, done: false, ...now(), ...fields });
const word = p => uniq(p).replace(/-/g, '_');

async function newFilter(page, name, query, { favorite = false } = {}) {
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: 'Filters & Labels' }).click();
  await page.getByRole('button', { name: 'Add filter' }).click();
  const sheet = page.locator('#edit-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('textbox', { name: 'Filter name' }).fill(name);
  await sheet.getByRole('textbox', { name: 'Query' }).fill(query);
  if (favorite) await sheet.locator('.td-switch-row input').check();
  return sheet;
}

test('"today & p1" and "(#Work | @errand) & !no date": the live count, an error, Add, the page', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const proj = word('Work'), lab = word('errand'), pid = uniq('p'), lid = uniq('l');
  await db.put(`spaces/_/projects/${pid}`, { name: proj, color: 'blue', parentId: null, view: 'list', order: Date.now(), ...now() });
  await db.put(`spaces/_/labels/${lid}`, { name: lab, color: 'green', order: Date.now(), favorite: false, ...now() });
  const urgent = uniq('urgent'), work = uniq('work'), errand = uniq('errand'), undated = uniq('undated');
  await task(urgent, { priority: 1, due: { date: today() } });
  await task(work, { projectId: pid, due: { date: today() } });
  await task(errand, { labels: [lid], due: { date: '2099-01-02' } });
  await task(undated, { projectId: pid });
  await synced(page);

  const sheet = await newFilter(page, word('Urgent'), 'today & p1');
  const count = sheet.locator('.td-query-count');
  await expect(count).toHaveText(/^\d+ tasks?$/);
  await sheet.getByRole('textbox', { name: 'Query' }).fill('today &');
  await expect(count).toHaveText('The query ends where a term should be (at 8)');
  await expect(count).toHaveClass(/is-error/);
  await sheet.getByRole('textbox', { name: 'Query' }).fill(`(#${proj} | @${lab}) & !no date`);
  await expect(count).toHaveText('2 tasks');
  expect(await AxeBuilder(page)).toEqual([]);
  await sheet.getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('#place-page')).toBeVisible();
  await expect(page.locator('#place .td-row')).toHaveCount(2);
  await expect(page.locator(`#place .td-row[data-id="${work}"]`)).toBeVisible();
  await expect(page.locator(`#place .td-row[data-id="${errand}"]`)).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);

  // today & p1 finds the urgent one
  await newFilter(page, word('P1'), 'today & p1');
  await page.locator('#edit-sheet').getByRole('button', { name: 'Add' }).click();
  await expect(page.locator(`#place .td-row[data-id="${urgent}"]`)).toBeVisible();
  await expect(page.locator(`#place .td-row[data-id="${work}"]`)).toHaveCount(0);
});

test('a comma makes a list per part; a favourite shows in Browse', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const lab = word('home'), lid = uniq('l'), a = uniq('ov'), b = uniq('lab');
  await db.put(`spaces/_/labels/${lid}`, { name: lab, color: 'red', order: Date.now(), favorite: false, ...now() });
  await task(a, { labels: [lid], priority: 2 });
  await task(b, { labels: [lid], priority: 3 });
  await synced(page);
  const name = word('Mine');
  const sheet = await newFilter(page, name, `@${lab} & p2, @${lab} & p3`, { favorite: true });
  await expect(sheet.locator('.td-query-count')).toHaveText('2 tasks');
  await sheet.getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('#place-page')).toBeVisible();
  await expect(page.locator('#place .td-group-title')).toHaveText([`@${lab} & p2`, `@${lab} & p3`]);
  await expect(page.locator('#place .td-group').nth(0).locator('.td-row')).toHaveAttribute('data-id', a);
  await expect(page.locator('#place .td-group').nth(1).locator('.td-row')).toHaveAttribute('data-id', b);
  await expect.poll(async () => (await db.list('spaces/_/filters')).find(f => f.name === name)?.favorite).toBe(true);
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.locator('#place-title')).toHaveText(name);
});

test('deadline words: "deadline before:", "!no deadline" and a project find the tasks by their deadline', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const proj = word('Due'), pid = uniq('p');
  await db.put(`spaces/_/projects/${pid}`, { name: proj, color: 'red', parentId: null, view: 'list', order: Date.now(), ...now() });
  const soon = uniq('soon'), later = uniq('later'), none = uniq('none');
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
  await task(soon, { projectId: pid, deadline: day(1) });
  await task(later, { projectId: pid, deadline: day(30) });
  await task(none, { projectId: pid });
  await synced(page);
  const sheet = await newFilter(page, word('Deadlines'), `#${proj} & deadline before: ${day(7)}`);
  const count = sheet.locator('.td-query-count');
  await expect(count).toHaveText('1 task');
  await sheet.getByRole('textbox', { name: 'Query' }).fill(`#${proj} & !no deadline`);
  await expect(count).toHaveText('2 tasks');
  await sheet.getByRole('textbox', { name: 'Query' }).fill(`#${proj} & no deadline`);
  await expect(count).toHaveText('1 task');
  await sheet.getByRole('textbox', { name: 'Query' }).fill(`#${proj} & deadline after: tomorrow`);
  await expect(count).toHaveText('1 task');
  await sheet.getByRole('button', { name: 'Add' }).click();
  await expect(page.locator(`#place .td-row[data-id="${later}"]`)).toBeVisible();
  await expect(page.locator('#place .td-row')).toHaveCount(1);
});

test('Filters & Labels: counts, a bad query marked, Manage rows, a group folds and stays folded, empty pages; axe light and dark', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const lab = word('lonely'), lid = uniq('l'), fname = word('Bad'), fid = uniq('f'), cname = word('Counted'), cid = uniq('f'), t = uniq('ct');
  await db.put(`spaces/_/labels/${lid}`, { name: lab, color: 'green', order: Date.now(), favorite: false, ...now() });
  await db.put(`spaces/_/filters/${fid}`, { name: fname, query: 'today &', color: 'red', order: Date.now(), favorite: false, ...now() });
  await db.put(`spaces/_/filters/${cid}`, { name: cname, query: `search: ${t}`, color: 'blue', order: Date.now() + 1, favorite: false, ...now() });
  await task(t, { title: t });
  await synced(page);
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: 'Filters & Labels' }).click();
  const host = page.locator('#filters');
  await expect(host.locator('.td-fl-name')).toHaveText(['My Filters', 'Labels']);
  await expect(host.locator('.td-fl-row', { hasText: cname }).locator('.td-fl-count')).toHaveText('1');
  await expect(host.locator('.td-fl-row', { hasText: fname }).locator('.td-fl-bad')).toHaveText('!');
  await expect(host.locator('.td-fl-row', { hasText: lab }).locator('.td-fl-count')).toHaveCount(0);   // (no tasks: no count)
  await expect(host.getByRole('button', { name: 'Manage filters' })).toBeVisible();
  await expect(host.getByRole('button', { name: 'Manage labels' })).toBeVisible();
  for (const colorScheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme });
    expect(await AxeBuilder(page)).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });

  // Manage: a tap on a row edits it, until Done
  await host.getByRole('button', { name: 'Manage labels' }).click();
  await expect(host.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true');
  await host.getByRole('button', { name: 'Done' }).click();
  await expect(host.getByRole('button', { name: 'Manage labels' })).toBeVisible();

  // the Labels group folds, and stays folded after a reload
  const fold = host.locator('.td-fl-fold', { hasText: 'Labels' });
  await fold.click();
  await expect(host.locator('.td-fl-row', { hasText: lab })).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: 'Filters & Labels' }).click();
  await expect(host.locator('.td-fl-fold', { hasText: 'Labels' })).toHaveAttribute('aria-expanded', 'false');
  await host.locator('.td-fl-fold', { hasText: 'Labels' }).click();

  // a label with no tasks: its page says so
  await host.locator('.td-fl-row', { hasText: lab }).click();
  await expect(page.locator('#place-page')).toBeVisible();
  await expect(page.locator('#place-page').getByText('No tasks with this label')).toBeVisible();
  for (const colorScheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme });
    expect(await AxeBuilder(page)).toEqual([]);
  }
});
