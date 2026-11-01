// A project as a board: Display > Board turns it on (kept with the project); each section is a column with its name,
// count and cards, "No section" first when it has tasks; a card held and dragged to the next column moves to that
// section (the board scrolls when the finger nears its side) and stays there. Passes axe.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, openTab, finger, gesturesReady } from './fixtures.mjs';

const now = () => ({ createdAt: Date.now(), updatedAt: Date.now() });

test('Display > Board: a column per section, a card dragged to the next one moves there', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const pid = uniq('bp'), name = uniq('Board'), s1 = uniq('s1'), s2 = uniq('s2'), a = uniq('card-a'), b = uniq('card-b'), loose = uniq('loose');
  await db.put(`spaces/_/projects/${pid}`, { name, color: 'blue', parentId: null, view: 'list', order: Date.now(), ...now() });
  await db.put(`spaces/_/sections/${s1}`, { name: 'Doing', projectId: pid, order: 1, collapsed: false, ...now() });
  await db.put(`spaces/_/sections/${s2}`, { name: 'Done soon', projectId: pid, order: 2, collapsed: false, ...now() });
  const task = (id, sectionId, order) => db.put(`spaces/_/tasks/${id}`, { title: id, projectId: pid, sectionId, order, priority: 4, done: false, ...now() });
  await task(a, s1, 1);
  await task(b, s1, 2);
  await task(loose, null, 1);
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.locator('#project-page')).toBeVisible();
  await page.locator('#more-btn').click();
  await page.getByRole('menuitem', { name: 'Display' }).click();
  const sheet = page.locator('#display-sheet');
  await expect(sheet).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
  await sheet.getByRole('radio', { name: 'Board' }).click();
  await expect(sheet.getByRole('radio', { name: 'Board' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await db.get(`spaces/_/projects/${pid}`))?.view).toBe('board');
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();

  const board = page.locator('#project.td-board');
  await expect(board).toBeVisible();
  await expect(board.locator('.td-col-title')).toHaveText(['No section', 'Doing', 'Done soon']);
  await expect(board.locator('.td-col').nth(1).locator('.td-col-count')).toHaveText('2');
  await expect(page.locator('#project-empty .td-dot')).toHaveCount(4);
  expect(await AxeBuilder(page)).toEqual([]);

  // "Doing" in view, then a's card to "Done soon"
  await board.evaluate(el => { el.scrollLeft = /** @type {HTMLElement} */ (el.children[1]).offsetLeft - 16; });
  await page.waitForTimeout(300);
  const box = await board.boundingBox();
  const right = box.x + box.width - 20;
  const card = await page.locator(`#project .td-row[data-id="${a}"]`).boundingBox();
  const dx = Math.round(right - (card.x + card.width / 2));
  const path = [...Array.from({ length: 8 }, (_, i) => [Math.round(dx * (i + 1) / 8), 0]), ...Array.from({ length: 40 }, () => [dx, 2])];
  await finger(page, `#project .td-row[data-id="${a}"]`, path, { hold: 650, wait: 120 });
  await expect.poll(async () => (await db.get(`spaces/_/tasks/${a}`))?.sectionId, { timeout: 15_000 }).toBe(s2);
  await expect(board.locator('.td-col').nth(2).locator(`.td-row[data-id="${a}"]`)).toBeAttached();

  // and stays a board after a reload
  await page.reload();
  await expect(page.locator('#list-view')).toBeVisible();
  await expect.poll(async () => (await db.get(`spaces/_/tasks/${a}`))?.sectionId).toBe(s2);
});
