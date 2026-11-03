// A row held and let go opens its menu; Select task starts select mode: taps tick rows (grey, a filled circle), the top bar counts
// them (a back arrow and "N tasks selected", the ticked row grey), and the five-icon bottom bar sets their priority; the "…" menu's Select tasks, Select all, then Complete N with Undo
// and Delete N (asked first) with Undo. The menu and both bars pass axe.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, today, db, finger, fingers, line, gesturesReady, openTab, boxOf } from './fixtures.mjs';

const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { projectId: 'inbox', order: Date.now(), priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });
const get = id => db.get(`spaces/_/tasks/${id}`);
const rowIn = (host, id) => `#${host} .td-row[data-id="${id}"]`;

test('hold opens the row\'s menu; Select task, a tap, and Priority for both', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const a = uniq('sel-a'), b = uniq('sel-b');
  await put(a, { title: a, due: { date: today() } });
  await put(b, { title: b, due: { date: today() } });
  await synced(page);
  await gesturesReady(page);
  await expect(page.locator(rowIn('today', b))).toBeVisible();
  await finger(page, rowIn('today', a), [], { hold: 650 });
  const menu = page.getByRole('menu', { name: a });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveText(['Select task', 'Schedule', 'Priority', 'Move to', 'Copy link', 'Delete']);
  await expect(page.locator('#task-sheet')).toBeHidden();
  expect(await AxeBuilder(page)).toEqual([]);
  await menu.getByRole('menuitem', { name: 'Select task' }).click();
  await expect(page.locator('.td-select-count')).toHaveText('1 task selected');
  await page.locator(`${rowIn('today', b)} .td-row-main`).click();
  await expect(page.locator('.td-select-count')).toHaveText('2 tasks selected');
  await expect(page.locator(rowIn('today', b))).toHaveClass(/is-selected/);
  // the picked row is told by a grey tint over the whole row, not a filled circle; the top bar is a back arrow, no Select all
  await expect(page.locator(`${rowIn('today', b)} > .td-check`)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.td-select-top').getByRole('button')).toHaveCount(1);
  await expect(page.locator('.td-select-top').getByRole('button', { name: 'Cancel selection' })).toBeVisible();
  await expect(page.locator('.td-select-top').getByRole('button', { name: 'Select all' })).toHaveCount(0);
  // the bar: five icon-only buttons, flat and full width
  const names = await page.locator('.td-select-bar button').evaluateAll(bs => bs.map(x => [x.getAttribute('aria-label'), x.textContent.trim()]));
  expect(names).toEqual([['Date', ''], ['Move', ''], ['Labels', ''], ['Priority', ''], ['More actions', '']]);
  expect((await boxOf(page, '.td-select-bar')).width).toBeGreaterThanOrEqual(389);
  await expect(page.locator(rowIn('today', b))).toHaveCSS('background-color', 'rgb(240, 240, 240)');
  await expect(page.locator('#task-sheet')).toBeHidden();
  expect(await AxeBuilder(page)).toEqual([]);
  await page.locator('.td-select-bar').getByRole('button', { name: 'Priority' }).click();
  await page.getByRole('menuitemradio', { name: 'Priority 1' }).click();
  await expect.poll(async () => [(await get(a))?.priority, (await get(b))?.priority], { timeout: 15_000 }).toEqual([1, 1]);
  await expect(page.locator('.td-select-top')).toHaveCount(0);
  await expect(page.locator(rowIn('today', a))).not.toHaveClass(/is-selected/);
});

test('"Select tasks" from the Inbox\'s "…": Select all, Complete N with Undo', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const a = uniq('bulk-a'), b = uniq('bulk-b');
  await put(a, { title: a });
  await put(b, { title: b });
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'inbox');
  await expect(page.locator(rowIn('inbox', b))).toBeVisible();
  await page.locator('#more-btn').click();
  await page.getByRole('menuitem', { name: 'Select tasks' }).click();
  await expect(page.locator('.td-select-count')).toHaveText('0 tasks selected');
  await page.locator('.td-select-bar').getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Select all' }).click();
  // (the Inbox is shared with tests running at once: rows that arrive after Select all are not selected, so the count
  // is checked against the ticked rows, not every row)
  await expect.poll(async () => {
    const said = Number((await page.locator('.td-select-count').textContent())?.match(/\d+/)?.[0]);
    const ticked = await page.locator('#inbox .td-row.is-selected').count();
    return said >= 2 && said === ticked;
  }, { timeout: 10_000 }).toBe(true);
  // just the two: all off, then each
  await page.locator('.td-select-bar').getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Deselect all' }).click();
  await page.locator(`${rowIn('inbox', a)} .td-row-main`).click();
  await page.locator(`${rowIn('inbox', b)} .td-row-main`).click();
  await expect(page.locator('.td-select-count')).toHaveText('2 tasks selected');
  await page.locator('.td-select-bar').getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Complete 2' }).click();
  await expect.poll(async () => [(await get(a))?.done, (await get(b))?.done], { timeout: 15_000 }).toEqual([true, true]);
  await page.locator('.toast').last().getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => [(await get(a))?.done, (await get(b))?.done], { timeout: 15_000 }).toEqual([false, false]);
  await expect(page.locator(rowIn('inbox', b))).toBeVisible();
});

test('Delete N asks first, then Undo brings both back', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const a = uniq('del-a'), b = uniq('del-b');
  await put(a, { title: a });
  await put(b, { title: b });
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'inbox');
  await expect(page.locator(rowIn('inbox', b))).toBeVisible();
  await page.locator('#more-btn').click();
  await page.getByRole('menuitem', { name: 'Select tasks' }).click();
  await page.locator(`${rowIn('inbox', a)} .td-row-main`).click();
  await page.locator(`${rowIn('inbox', b)} .td-row-main`).click();
  await page.locator('.td-select-bar').getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete 2' }).click();
  await page.getByRole('dialog', { name: 'Delete tasks' }).getByRole('button', { name: 'Delete' }).click();
  await expect.poll(async () => [await get(a), await get(b)], { timeout: 15_000 }).toEqual([null, null]);
  await page.locator('.toast').last().getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator(rowIn('inbox', a))).toBeVisible();
  await expect(page.locator(rowIn('inbox', b))).toBeVisible();
});

// Two fingers dragged down over rows start select mode and tick every row they pass (the list scrolls as usual with one).
test('two fingers dragged down over three rows select those three', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  // (a project of their own: tests running at once share the Today list)
  const pid = uniq('two-p'), name = uniq('Two');
  const ids = [0, 1, 2, 3].map(i => uniq(`two-${i}`));
  await db.put(`spaces/_/projects/${pid}`, { name, color: 'blue', parentId: null, view: 'list', order: Date.now(), createdAt: Date.now(), updatedAt: Date.now() });
  for (const [i, id] of ids.entries()) await put(id, { title: id, projectId: pid, order: i + 1 });
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.locator(rowIn('project', ids[3]))).toBeVisible();
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {}))));
  const mid = async id => { const r = await boxOf(page, rowIn('project', id)); return r.y + r.height / 2; };
  const y0 = await mid(ids[0]), y2 = await mid(ids[2]);
  await fingers(page, [line(120, y0, 0, y2 - y0, 14), line(260, y0, 0, y2 - y0, 14)], { wait: 24 });
  await expect(page.locator('.td-select-count')).toHaveText('3 tasks selected');
  for (const id of ids.slice(0, 3)) await expect(page.locator(rowIn('project', id))).toHaveClass(/is-selected/);
  await expect(page.locator(rowIn('project', ids[3]))).not.toHaveClass(/is-selected/);
});

// Select mode's "…" > Deadline: the scheduler for a day alone sets it on every selected task, one save each, with Undo;
// "No deadline" clears them (the toast counts the tasks that had one).
test('"…" > Deadline sets and clears the deadline on every selected task, with Undo', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const a = uniq('dl-a'), b = uniq('dl-b');
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
  await put(a, { title: a });
  await put(b, { title: b, deadline: day(5) });
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'inbox');
  await expect(page.locator(rowIn('inbox', b))).toBeVisible();
  await page.locator('#more-btn').click();
  await page.getByRole('menuitem', { name: 'Select tasks' }).click();
  await page.locator(`${rowIn('inbox', a)} .td-row-main`).click();
  await page.locator(`${rowIn('inbox', b)} .td-row-main`).click();
  await expect(page.locator('.td-select-count')).toHaveText('2 tasks selected');
  const more = () => page.locator('.td-select-bar').getByRole('button', { name: 'More actions' }).click();
  const got = async () => [(await get(a))?.deadline ?? null, (await get(b))?.deadline ?? null];

  await more();
  await page.getByRole('menuitem', { name: 'Deadline' }).click();
  const sheet = '#schedule-sheet';
  await expect(page.locator(sheet)).toBeVisible();
  await expect(page.locator(`${sheet} .td-sheet-title`)).toHaveText('Deadline');
  await expect(page.locator(`${sheet} .td-sched-row`).filter({ hasText: 'No deadline' })).toHaveCount(1);
  await page.locator(`${sheet} .td-cal-day[data-day="${day(3)}"]`).click();
  await page.locator(`${sheet} .td-sched-save`).click();
  await expect.poll(got, { timeout: 15_000 }).toEqual([day(3), day(3)]);
  await expect(page.locator('.toast').last()).toContainText('Deadline set on 2 tasks');
  await page.locator('.toast').last().getByRole('button', { name: 'Undo' }).click();
  await expect.poll(got, { timeout: 15_000 }).toEqual([null, day(5)]);

  // (select mode ended with the action: again, then clear)
  await page.locator('#more-btn').click();
  await page.getByRole('menuitem', { name: 'Select tasks' }).click();
  await page.locator(`${rowIn('inbox', a)} .td-row-main`).click();
  await page.locator(`${rowIn('inbox', b)} .td-row-main`).click();
  await more();
  await page.getByRole('menuitem', { name: 'Deadline' }).click();
  await page.locator(`${sheet} .td-sched-row`).filter({ hasText: 'No deadline' }).click();
  await expect.poll(got, { timeout: 15_000 }).toEqual([null, null]);
  await expect(page.locator('.toast').last()).toContainText('Deadline cleared on 1 task');
  await page.locator('.toast').last().getByRole('button', { name: 'Undo' }).click();
  await expect.poll(got, { timeout: 15_000 }).toEqual([null, day(5)]);
});

test('Completed\'s Select: two done tasks picked, Not done brings both back, Undo makes them done again', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const a = uniq('back-a'), b = uniq('back-b'), at = Date.now() - 3_600_000;
  await put(a, { title: a, done: true, doneAt: at });
  await put(b, { title: b, done: true, doneAt: at });
  await synced(page);
  await openTab(page, 'browse');
  await page.locator('#browse .td-browse-row', { hasText: 'Completed' }).click();
  await expect(page.locator(rowIn('completed', b))).toBeVisible();
  await page.locator('#completed').getByRole('button', { name: 'Select' }).click();
  await page.locator(`${rowIn('completed', a)} .td-row-main`).click();
  await page.locator(`${rowIn('completed', b)} .td-row-main`).click();
  await expect(page.locator('.td-select-count')).toHaveText('2 tasks selected');
  await expect(page.locator(`${rowIn('completed', a)}.is-selected`)).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
  await page.locator('.td-select-bar').getByRole('button', { name: 'Not done' }).click();
  await expect.poll(async () => [(await get(a))?.done, (await get(b))?.done], { timeout: 15_000 }).toEqual([false, false]);
  await expect(page.locator(rowIn('completed', a))).toHaveCount(0);
  await page.locator('.toast').last().getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => [(await get(a))?.done, (await get(a))?.doneAt, (await get(b))?.done], { timeout: 15_000 }).toEqual([true, at, true]);
  await expect(page.locator(rowIn('completed', b))).toBeVisible();
});
