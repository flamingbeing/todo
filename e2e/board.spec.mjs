// A project as a board: Display > Board turns it on (kept with the project); each section is a column with its name,
// count and cards, "No section" first when it has tasks; a card held and dragged to the next column moves to that
// section (the board scrolls when the finger nears its side) and stays there. Passes axe. Grouped by priority, the
// columns are the priorities (no Add section), and a card dragged to another column takes that priority. A column's
// "…" > Add section after opens the name field between the columns; a change synced in meanwhile keeps it open.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, openTab, finger, gesturesReady, still, press, slide, letGo, boxOf } from './fixtures.mjs';

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
  await page.locator('#display-btn').click();
  const sheet = page.locator('#display-sheet');
  await expect(sheet).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
  await sheet.getByRole('radio', { name: 'Board' }).click();
  await expect(sheet.getByRole('radio', { name: 'Board' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await db.get(`spaces/_/projects/${pid}`))?.view).toBe('board');
  await sheet.getByRole('button', { name: /^(Done|Save)$/ }).click();
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
  const card = await boxOf(page, `#project .td-row[data-id="${a}"]`);
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

test('a board grouped by priority: a column per priority, a card dragged to Priority 1 gets it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const pid = uniq('gb-p'), a = uniq('gb-a'), b = uniq('gb-b');
  await db.put(`spaces/_/projects/${pid}`, { name: pid, color: 'blue', parentId: null, order: -1e12 - Date.now(), view: 'board', ...now() });
  await db.put(`spaces/_/tasks/${b}`, { title: b, projectId: pid, priority: 1, order: 1, done: false, ...now() });
  await db.put(`spaces/_/tasks/${a}`, { title: a, projectId: pid, priority: 4, order: 2, done: false, ...now() });
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'browse');
  await page.locator('#browse .td-browse-row').filter({ hasText: pid }).first().click();
  await expect(page.locator('#project-title')).toHaveText(pid);
  await page.locator('#display-btn').click();
  const sheet = page.locator('#display-sheet');
  await sheet.getByRole('button', { name: /^Grouping/ }).click();
  await page.locator('#pick-sheet').getByRole('option', { name: 'Priority', exact: true }).click();
  await expect(page.locator('#pick-sheet')).toBeHidden();
  await sheet.getByRole('button', { name: /^(Done|Save)$/ }).click();
  await expect(sheet).toBeHidden();
  const board = page.locator('#project.td-board');
  await expect(board.locator('.td-col-title')).toHaveText(['Priority 1', 'No priority']);
  await expect(board.locator('.td-col-add-section')).toHaveCount(0);
  await still(page, '#project');
  await press(page, `#project .td-row[data-id="${a}"]`);
  await slide(page, { to: `#project .td-row[data-id="${b}"]`, dy: 34 }, 10);
  await letGo(page);
  await expect.poll(async () => (await db.get(`spaces/_/tasks/${a}`))?.priority, { timeout: 15_000 }).toBe(1);
  await expect(board.locator('.td-col').first().locator('.td-row[data-id]')).toHaveCount(2);
});

test('a column\'s "…" > Add section after: the name field opens between the columns, the new section lands there', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const pid = uniq('bp'), name = uniq('Board'), s1 = uniq('s1'), s2 = uniq('s2'), made = uniq('Middle');
  await db.put(`spaces/_/projects/${pid}`, { name, color: 'blue', parentId: null, view: 'board', order: Date.now(), ...now() });
  await db.put(`spaces/_/sections/${s1}`, { name: 'First', projectId: pid, order: 1, collapsed: false, ...now() });
  await db.put(`spaces/_/sections/${s2}`, { name: 'Last', projectId: pid, order: 2, collapsed: false, ...now() });
  await synced(page);
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.locator('#project .td-col')).toHaveCount(3);
  await page.locator(`#project .td-col[data-id="${s1}"] .td-col-more`).click();
  await page.getByRole('menuitem', { name: 'Add section after' }).click();
  const field = page.getByRole('textbox', { name: 'Name of the new section' });
  await expect(field).toBeFocused();
  // (the field's column sits right after First)
  await expect(page.locator(`#project .td-col[data-id="${s1}"] + .td-col-new input`)).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
  // (a change synced in while naming, from another device or here another test, draws the board again: the field
  // stays open and focused with what was typed, and nothing is saved until Enter)
  await field.fill(made.slice(0, 3));
  const card = uniq('card');
  await db.put(`spaces/_/tasks/${card}`, { title: card, projectId: pid, sectionId: s2, order: 1, priority: 4, done: false, ...now() });
  await expect(page.locator(`#project .td-col[data-id="${s2}"]`)).toContainText(card);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(made.slice(0, 3));
  expect((await db.list('spaces/_/sections')).filter(d => d.projectId === pid)).toHaveLength(2);
  await field.pressSequentially(made.slice(3));
  await field.press('Enter');
  await expect(page.locator('#project .td-col-title')).toHaveText(['First', made, 'Last']);
  await expect.poll(async () => (await db.list('spaces/_/sections')).find(d => d.name === made)?.order, { timeout: 15_000 }).toBe(1.5);
});
