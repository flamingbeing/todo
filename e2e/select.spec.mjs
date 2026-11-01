// A row held and let go opens its menu; Select task starts select mode: taps tick rows (grey), the top bar counts
// them, and the bottom bar sets their priority; the "…" menu's Select tasks, Select all, then Complete N with Undo
// and Delete N (asked first) with Undo. The menu and both bars pass axe.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, today, db, finger, gesturesReady, openTab } from './fixtures.mjs';

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
  await expect(menu.getByRole('menuitem')).toHaveText(['Select task', 'Schedule', 'Priority', 'Move to', 'Delete']);
  await expect(page.locator('#task-sheet')).toBeHidden();
  expect(await AxeBuilder(page)).toEqual([]);
  await menu.getByRole('menuitem', { name: 'Select task' }).click();
  await expect(page.locator('.td-select-count')).toHaveText('1 selected');
  await page.locator(`${rowIn('today', b)} .td-row-main`).click();
  await expect(page.locator('.td-select-count')).toHaveText('2 selected');
  await expect(page.locator(rowIn('today', b))).toHaveClass(/is-selected/);
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
  await expect(page.locator('.td-select-count')).toHaveText('0 selected');
  await page.locator('.td-select-top').getByRole('button', { name: 'Select all' }).click();
  const n = await page.locator('#inbox .td-row').count();
  await expect(page.locator('.td-select-count')).toHaveText(`${n} selected`);
  // just the two: all off, then each
  await page.locator('.td-select-top').getByRole('button', { name: 'Deselect all' }).click();
  await page.locator(`${rowIn('inbox', a)} .td-row-main`).click();
  await page.locator(`${rowIn('inbox', b)} .td-row-main`).click();
  await expect(page.locator('.td-select-count')).toHaveText('2 selected');
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
