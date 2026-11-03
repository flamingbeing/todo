// Held and dragged, a row moves: up or down among the others (the line shows where), and pulled right under the row
// above it becomes its subtask; on Today the day's own order is kept. The + button dragged between two rows opens
// quick add for a task there; let go on its grey x and nothing opens. On Today a place at the foot shows while a row
// is dragged: let go there, the task moves to tomorrow (its time kept), with Undo.
import { test, expect, signIn, synced, uniq, today, db, finger, gesturesReady, openTab, steps, still, press, slide, letGo, boxOf } from './fixtures.mjs';

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

test('a held row moves above another; pulled right it becomes a subtask', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const [a, b, c] = await three(page, 'drag');
  const ra = await boxOf(page, rowIn('project', a)), rc = await boxOf(page, rowIn('project', c));
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
  // (a parent starts folded: open A to see B under it)
  await still(page, '#project');
  const fold = page.locator(`${rowIn('project', a)} .td-fold`);
  await expect(async () => {
    if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();
    await expect(fold).toHaveAttribute('aria-expanded', 'true', { timeout: 1500 });
  }).toPass({ timeout: 10_000 });
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
  // (other tests' tasks for today arriving draw the list anew: measure again until both rows are there)
  let dy = 0;
  await expect(async () => {
    await still(page, '#today');
    const [ra, rb] = [await page.locator(rowIn('today', a)).boundingBox(), await page.locator(rowIn('today', b)).boundingBox()];
    expect(ra && rb).toBeTruthy();
    dy = Math.round(/** @type {any} */ (ra).y - /** @type {any} */ (rb).y - /** @type {any} */ (rb).height / 2);
  }).toPass({ timeout: 15_000 });
  await finger(page, rowIn('today', b), steps(0, dy, 8), { hold: 650, wait: 80 });
  await expect.poll(async () => { const [x, z] = [await get(a), await get(b)]; return (z?.dayOrder ?? 0) < (x?.dayOrder ?? 0); }, { timeout: 15_000 }).toBe(true);
  // (b above a: Today is shared with the other tests running, whose tasks for today may sit anywhere around them)
  const order = () => page.locator('#today .td-row').evaluateAll(rows => rows.map(r => r.getAttribute('data-id')));
  await expect.poll(async () => { const ids = await order(); return ids.indexOf(b) >= 0 && ids.indexOf(b) < ids.indexOf(a); }, { timeout: 10_000 }).toBe(true);
});

test('the + button dragged between two rows adds a task there; on its x nothing opens', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const [a, b] = await three(page, 'fab');
  const fab = await boxOf(page, '#fab'), rb = await boxOf(page, rowIn('project', b));
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

test('on Today the postpone place shows while a row is dragged; let go there, it moves to tomorrow, Undo puts it back', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const a = uniq('pp-a');
  await put(a, { title: a, order: 1, dayOrder: -1e12 - Date.now(), due: { date: today(), time: '09:30' } });
  await synced(page);
  await gesturesReady(page);
  await expect(page.locator(rowIn('today', a))).toBeVisible();
  await still(page, '#today');
  await expect(page.locator('.td-postpone')).toHaveCount(0);
  // (other tests' tasks for today arriving draw the list anew: boxOf measures again if the row was replaced meanwhile)
  const r = await boxOf(page, rowIn('today', a));
  await press(page, rowIn('today', a));
  await slide(page, { y: r.y + r.height / 2 + 60 }, 6);
  const zone = page.locator('.td-postpone');
  await expect(zone).toHaveClass(/is-on/);
  await expect(zone).toContainText('Tomorrow');
  await slide(page, { to: '.td-postpone' }, 8);
  await expect(zone).toHaveClass(/is-over/);
  await letGo(page);
  await expect(zone).toHaveCount(0);
  const tomorrow = today(new Date(Date.now() + 86_400_000));
  await expect.poll(async () => (await get(a))?.due, { timeout: 15_000 }).toEqual({ date: tomorrow, time: '09:30' });
  await page.locator('.toast').filter({ hasText: 'Moved to Tomorrow' }).getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await get(a))?.due?.date, { timeout: 15_000 }).toBe(today());
});

test('a label page keeps its smart order: a held row does not move, the toast says so', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const name = uniq('own'), a = uniq('own-a'), b = uniq('own-b');
  await db.put(`spaces/_/labels/${name}`, { name, color: 'green', favorite: true, order: -1e12 - Date.now(), updatedAt: Date.now() });
  await put(a, { title: `A ${a}`, labels: [name], order: 1 });
  await put(b, { title: `B ${b}`, labels: [name], order: 2 });
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.locator('#place-page')).toBeVisible();
  await expect(page.locator(rowIn('place', b))).toBeVisible();
  await still(page, '#place');
  await press(page, rowIn('place', b));
  await slide(page, { to: rowIn('place', a), dy: 4 }, 8);
  await expect(page.locator('.toast').filter({ hasText: 'Filters and labels keep their smart order' })).toBeVisible();
  await letGo(page);
  await expect(page.locator('#place .td-drop-line')).toHaveCount(0);
  expect((await get(b))?.order).toBe(2);
  expect((await get(a))?.order).toBe(1);
});
