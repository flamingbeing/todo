// Swiping a row: right past the line completes it (Undo puts it back), left opens the scheduler for it, a short swipe
// springs back and changes nothing. The band shows the action's colour while the row moves.
import { test, expect, signIn, synced, uniq, today, db, finger, gesturesReady, steps } from './fixtures.mjs';

const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { projectId: 'inbox', order: Date.now(), priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });
const rowOf = id => `#today .td-row[data-id="${id}"]`;

test('right completes, with Undo; a short swipe springs back', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('swipe-right');
  await put(t, { title: t, due: { date: day(0) } });
  await synced(page);
  await gesturesReady(page);
  await expect(page.locator(rowOf(t))).toBeVisible();

  // short: back where it was
  await finger(page, rowOf(t), steps(40, 2, 4), { wait: 120 });
  await expect(page.locator(`${rowOf(t)} .td-row-main`)).toHaveCSS('transform', 'none');
  await expect(page.locator(`${rowOf(t)} .td-swipe-band`)).toHaveCount(0);
  expect((await db.get(`spaces/_/tasks/${t}`))?.done).toBe(false);

  // mid-swipe: the teal band
  await page.evaluate(sel => {
    const el = /** @type {HTMLElement} */ (document.querySelector(sel)), r = el.getBoundingClientRect(), x = r.left + 60, y = r.top + r.height / 2;
    const t = /** @type {HTMLElement} */ (el.querySelector('.td-row-main'));
    t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 42, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: 1 }));
    for (const dx of [10, 30, 60, 90]) t.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 42, pointerType: 'touch', isPrimary: true, clientX: x + dx, clientY: y, buttons: 1 }));
  }, rowOf(t));
  await expect(page.locator(`${rowOf(t)} .td-swipe-band[data-side="right"]`)).toHaveCSS('background-color', 'rgb(11, 122, 117)');
  await page.waitForTimeout(250);   // (stopped before the lift: no fling)
  await page.evaluate(sel => {
    const el = /** @type {HTMLElement} */ (document.querySelector(sel)), r = el.getBoundingClientRect();
    el.querySelector('.td-row-main')?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 42, pointerType: 'touch', isPrimary: true, clientX: r.left + 60, clientY: r.top + 10 }));
  }, rowOf(t));
  await expect(page.locator(`${rowOf(t)} .td-row-main`)).toHaveCSS('transform', 'none');

  // long: done
  await finger(page, rowOf(t), steps(260, 4, 8));
  await expect.poll(async () => (await db.get(`spaces/_/tasks/${t}`))?.done, { timeout: 15_000 }).toBe(true);
  await expect(page.locator('#today')).not.toContainText(t);
  await page.locator('.toast').last().getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#today')).toContainText(t);
});

test('left opens the scheduler for the row; its choice is saved', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('swipe-left');
  await put(t, { title: t, due: { date: day(0) } });
  await synced(page);
  await gesturesReady(page);
  await finger(page, rowOf(t), steps(-260, 3, 8));
  await expect(page.locator('#schedule-sheet')).toBeVisible();
  await page.locator('#schedule-sheet .td-sched-row').filter({ hasText: 'Tomorrow' }).click();
  await expect.poll(async () => (await db.get(`spaces/_/tasks/${t}`))?.due?.date, { timeout: 15_000 }).toBe(day(1));
  await expect(page.locator('#today')).not.toContainText(t);
});
