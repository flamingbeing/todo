// Held and dragged, a row moves: up or down among the others (the line shows where), and pulled right under the row
// above it becomes its subtask; on Today the day's own order is kept. The + button dragged between two rows opens
// quick add for a task there; let go on its grey x and nothing opens.
import { test, expect, signIn, synced, uniq, today, db, finger, gesturesReady, openTab, steps } from './fixtures.mjs';

const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { projectId: 'inbox', priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });
const get = id => db.get(`spaces/_/tasks/${id}`);
const rowIn = (host, id) => `#${host} .td-row[data-id="${id}"]`;
/** a project of its own (no other test's rows move under the finger) with three tasks; its page open */
const three = async (page, p) => {
  const pid = uniq(`${p}-p`), ids = [uniq(`${p}-a`), uniq(`${p}-b`), uniq(`${p}-c`)];
  await db.put(`spaces/_/projects/${pid}`, { name: pid, color: 'blue', parentId: null, order: -1e12 - Date.now(), view: 'list', createdAt: Date.now(), updatedAt: Date.now() });
  for (const [i, id] of ids.entries()) await put(id, { title: id, projectId: pid, order: (i + 1) * 1000 });
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'browse');
  await page.locator('#browse .td-browse-row').filter({ hasText: pid }).first().click();
  await expect(page.locator('#project-title')).toHaveText(pid);
  await expect(page.locator(rowIn('project', ids[2]))).toBeVisible();
  await still(page, '#project');
  return ids;
};
/** the list has slid in and not been drawn again for 400 ms (a row drawn anew under the finger never hears it) */
const still = (page, sel) => page.evaluate(sel => new Promise(done => {
  const host = /** @type {HTMLElement} */ (document.querySelector(sel));
  let t = setTimeout(() => { o.disconnect(); done(null); }, 400);
  const o = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { o.disconnect(); done(null); }, 400); });
  o.observe(host, { childList: true, subtree: true });
}).then(() => Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {})))), sel);
const box = async (page, sel) => /** @type {{ x: number, y: number, width: number, height: number }} */ (await page.locator(sel).boundingBox());

test('a held row moves above another; pulled right it becomes a subtask', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const [a, b, c] = await three(page, 'drag');
  const ra = await box(page, rowIn('project', a)), rc = await box(page, rowIn('project', c));
  // C's middle to A's top edge
  await finger(page, rowIn('project', c), steps(0, Math.round(ra.y - rc.y - rc.height / 2), 8), { hold: 650, wait: 80 });
  await expect.poll(async () => { const [x, z] = [await get(a), await get(c)]; return (z?.order ?? 0) < (x?.order ?? 0); }, { timeout: 15_000 }).toBe(true);
  await expect(page.locator('#project .td-drop-line')).toHaveCount(0);
  // (drawn again in the new order before the next hold)
  await expect(page.locator('#project .td-row').first()).toHaveAttribute('data-id', c);
  await expect(page.locator('#project .td-row').nth(1)).toHaveAttribute('data-id', a);
  await still(page, '#project');

  await finger(page, rowIn('project', b), steps(34, 3, 6), { hold: 650, wait: 80 });
  await expect.poll(async () => (await get(b))?.parentId, { timeout: 15_000 }).toBe(a);
  await expect(page.locator(rowIn('project', b))).toHaveCSS('--depth', '1');
  await expect(page.locator('#task-sheet')).toBeHidden();
});

test('on Today a held row keeps its new place in the day', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const a = uniq('day-a'), b = uniq('day-b');
  // (first in the day: below any earlier run's)
  const first = -1e12 - Date.now();
  await put(a, { title: a, order: 1, dayOrder: first, due: { date: today() } });
  await put(b, { title: b, order: 2, dayOrder: first + 1000, due: { date: today() } });
  await synced(page);
  await gesturesReady(page);
  await expect(page.locator(rowIn('today', b))).toBeVisible();
  await still(page, '#today');
  const ra = await box(page, rowIn('today', a)), rb = await box(page, rowIn('today', b));
  await finger(page, rowIn('today', b), steps(0, Math.round(ra.y - rb.y - rb.height / 2), 8), { hold: 650, wait: 80 });
  await expect.poll(async () => { const [x, z] = [await get(a), await get(b)]; return (z?.dayOrder ?? 0) < (x?.dayOrder ?? 0); }, { timeout: 15_000 }).toBe(true);
  await expect(page.locator('#today .td-row').first()).toHaveAttribute('data-id', b);
});

test('the + button dragged between two rows adds a task there; on its x nothing opens', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const [a, b] = await three(page, 'fab');
  const fab = await box(page, '#fab'), rb = await box(page, rowIn('project', b));
  const fx = fab.x + fab.width / 2, fy = fab.y + fab.height / 2;

  // out and back onto the x: nothing
  await finger(page, '#fab', [...steps(-60, -120, 5), ...steps(0, 0, 1)], { wait: 60 });
  await expect(page.locator('#add-sheet')).toBeHidden();
  await expect(page.locator('.td-fab-cancel')).toHaveCount(0);

  // to B's top edge: between A and B
  await finger(page, '#fab', steps(Math.round(rb.x + 40 - fx), Math.round(rb.y - fy), 10), { wait: 80 });
  await expect(page.locator('#add-sheet')).toBeVisible();
  const t = uniq('between');
  await page.fill('#add-sheet .td-add-title', t);
  await page.press('#add-sheet .td-add-title', 'Enter');
  let made;
  await expect.poll(async () => (made = (await db.list('spaces/_/tasks')).find(d => d.title === t))?.order, { timeout: 15_000 }).toBeDefined();
  const [oa, ob] = [(await get(a))?.order, (await get(b))?.order];
  expect(made.order > oa && made.order < ob).toBe(true);
});
