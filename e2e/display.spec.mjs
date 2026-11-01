// Display: a list's grouping, order and direction, and whether done tasks show, are kept for that list on this
// device: they hold after a reload, another list keeps its own, and another device sees the list as it was. The
// sheet passes axe.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, openTab } from './fixtures.mjs';

const now = () => ({ createdAt: Date.now(), updatedAt: Date.now() });

async function openProject(page, name) {
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.locator('#project-page')).toBeVisible();
}
async function display(page) {
  await page.locator('#more-btn').click();
  await page.getByRole('menuitem', { name: 'Display' }).click();
  const sheet = page.locator('#display-sheet');
  await expect(sheet).toBeVisible();
  return sheet;
}
const choose = async (page, sheet, row, value) => {
  await sheet.getByRole('button', { name: new RegExp(`^${row}`) }).click();
  await page.locator('#pick-sheet').getByRole('option', { name: value, exact: true }).click();
  await expect(page.locator('#pick-sheet')).toBeHidden();
};

test('grouping by priority, by name descending, done tasks shown: kept per list, on this device only', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const pid = uniq('dp'), name = uniq('Disp'), u = uniq('x');
  await db.put(`spaces/_/projects/${pid}`, { name, color: 'blue', parentId: null, view: 'list', order: Date.now(), ...now() });
  const task = (title, priority, order, done = false) => db.put(`spaces/_/tasks/${uniq('t')}`, { title, projectId: pid, order, priority, done, ...(done ? { doneAt: Date.now() } : {}), ...now() });
  await task(`B ${u}`, 1, 1);
  await task(`A ${u}`, 3, 2);
  await task(`C ${u}`, 1, 3);
  await task(`D ${u}`, 1, 4, true);
  await synced(page);
  await openProject(page, name);
  await expect(page.locator('#project .td-title')).toHaveText([`B ${u}`, `A ${u}`, `C ${u}`]);
  const sheet = await display(page);
  await expect(sheet.getByRole('button', { name: /^Grouping/ })).toContainText('None');
  expect(await AxeBuilder(page)).toEqual([]);
  await choose(page, sheet, 'Grouping', 'Priority');
  await choose(page, sheet, 'Sorting', 'Name');
  await choose(page, sheet, 'Direction', 'Descending');
  await sheet.locator('.td-display-done input').check();
  await sheet.getByRole('button', { name: 'Done' }).click();
  const want = async p => {
    await expect(p.locator('#project .td-group-title')).toHaveText(['Priority 1', 'Priority 3']);
    await expect(p.locator('#project .td-group').nth(0).locator('.td-title')).toHaveText([`C ${u}`, `B ${u}`, `D ${u}`]);
    await expect(p.locator('#project .td-row.is-complete .td-title')).toHaveText(`D ${u}`);
  };
  await want(page);
  await page.reload();
  await expect(page.locator('#list-view')).toBeVisible();
  await synced(page);
  await openProject(page, name);
  await want(page);

  // Today keeps its own
  await openTab(page, 'today');
  const today = await display(page);
  await expect(today.getByRole('button', { name: /^Grouping/ })).toContainText('Date');
  await expect(today.getByRole('button', { name: /^Sorting/ })).toContainText('Manual');
  await page.keyboard.press('Escape');

  // another device: the list as it was
  const other = await phone();
  await signIn(other, 'member');
  await synced(other);
  await openProject(other, name);
  await expect(other.locator('#project .td-title')).toHaveText([`B ${u}`, `A ${u}`, `C ${u}`]);
  await expect(other.locator('#project .td-group-title')).toHaveCount(0);
});
