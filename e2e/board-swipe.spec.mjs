// Swipe on board cards: cards follow the row swipes (Settings > General > Swipe right / Swipe left, this device). With a
// swipe way set (the default), a mostly-sideways swipe on a card runs it (right completes, with Undo; left opens the
// scheduler), and the board still pages from a column gap. With both set to None, a swipe on a card pages the board. Real touches (CDP),
// so the browser's own panning and touch-action rules take part.
import { test, expect, signIn, synced, uniq, db, openTab, openSettings, gesturesReady, fingers, line } from './fixtures.mjs';

const now = () => ({ createdAt: Date.now(), updatedAt: Date.now() });

/** a board of two sections with cards, open on the page; -> ids, its name and the card selector (the data is shared with tests running at once: each has its own project) */
async function board(page, pre) {
  await signIn(page, 'member');
  if (pre) await pre(page);
  const pid = uniq('bp'), name = uniq('Board'), s1 = uniq('s1'), s2 = uniq('s2'), a = uniq('card-a'), b = uniq('card-b');
  await db.put(`spaces/_/projects/${pid}`, { name, color: 'blue', parentId: null, view: 'board', order: Date.now(), ...now() });
  await db.put(`spaces/_/sections/${s1}`, { name: 'Doing', projectId: pid, order: 1, collapsed: false, ...now() });
  await db.put(`spaces/_/sections/${s2}`, { name: 'Later', projectId: pid, order: 2, collapsed: false, ...now() });
  const task = (id, sectionId, order) => db.put(`spaces/_/tasks/${id}`, { title: id, projectId: pid, sectionId, order, priority: 4, done: false, ...now() });
  await task(a, s1, 1);
  await task(b, s2, 1);
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.locator('#project.td-board')).toBeVisible();
  await expect(page.locator(`#project .td-row[data-id="${a}"]`)).toBeVisible();
  await settled(page);
  return { a, b, name, card: id => `#project .td-row[data-id="${id}"]` };
}
// (the page slides in: a touch lands where the card is once it has stopped)
const settled = page => page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {}))));
const scrollLeft = page => page.locator('#project.td-board').evaluate(el => el.scrollLeft);
const centre = async (page, sel) => { await page.locator(sel).waitFor(); const r = await page.locator(sel).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
const swipesOff = async page => {
  await openSettings(page, 'General');
  for (const name of ['Swipe right', 'Swipe left']) {
    const sel = page.locator('#settings-host select').filter({ has: page.locator('option', { hasText: 'None' }) })
      .and(page.getByLabel(name, { exact: false }));
    await sel.selectOption({ label: 'None' });
  }
  await expect(page.locator('html')).not.toHaveAttribute('data-board-swipe', '');
};

test('swipes set to None: a sideways swipe on a card pages the board', async ({ phone }) => {
  const page = await phone();
  const { a, card } = await board(page, swipesOff);
  expect(await scrollLeft(page)).toBe(0);
  const [x, y] = await centre(page, card(a));
  await fingers(page, [line(x + 120, y, -300, 0, 12)]);
  await expect.poll(() => scrollLeft(page), { timeout: 5000 }).toBeGreaterThan(100);
  expect((await db.get(`spaces/_/tasks/${a}`))?.done).toBe(false);
});

test('by default: right completes with Undo, left opens the scheduler, a column gap still pages', async ({ phone }) => {
  const page = await phone();
  const { a, b, name, card } = await board(page);
  await expect(page.locator('html')).toHaveAttribute('data-board-swipe', '');

  // left: the scheduler for that card
  let [x, y] = await centre(page, card(a));
  await fingers(page, [line(x + 100, y, -260, 0, 12)]);
  await expect(page.locator('#schedule-sheet')).toBeVisible();
  expect(await scrollLeft(page)).toBe(0);
  await page.locator('#schedule-sheet .td-sched-row').filter({ hasText: 'Tomorrow' }).click();
  await expect.poll(async () => !!(await db.get(`spaces/_/tasks/${a}`))?.due?.date, { timeout: 15_000 }).toBe(true);
  await expect(page.locator('#schedule-sheet')).toBeHidden();
  await settled(page);

  // a gap: the board pages
  const cols = await page.locator('#project .td-col').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; }));
  const gapX = (cols[0][1] + cols[1][0]) / 2;
  const top = (await page.locator('#project.td-board').boundingBox()).y + 40;
  expect(cols[1][0] - cols[0][1]).toBeGreaterThan(4);
  await fingers(page, [line(gapX, top, -150, 0, 12)]);
  await expect.poll(() => scrollLeft(page), { timeout: 5000 }).toBeGreaterThan(100);
  await page.locator('#project.td-board').evaluate(el => { el.scrollLeft = 0; });

  // right: done, with Undo
  [x, y] = await centre(page, card(a));
  await fingers(page, [line(x - 100, y, 260, 0, 12)]);
  await expect.poll(async () => (await db.get(`spaces/_/tasks/${a}`))?.done, { timeout: 15_000 }).toBe(true);
  expect((await db.get(`spaces/_/tasks/${b}`))?.done).toBe(false);
  await page.locator('.toast').last().getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await db.get(`spaces/_/tasks/${a}`))?.done, { timeout: 15_000 }).toBe(false);
});
