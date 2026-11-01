// Upcoming's head: the month and the week strip. A day with tasks has a dot; a swipe goes to the next week; a tap on a
// day scrolls the list to it, and the + adds for that day; Today goes back; a task dragged onto a day of the strip
// moves to that day. Passes axe.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, today, db, openTab, finger, gesturesReady, steps, still } from './fixtures.mjs';

const plus = (key, n) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekOf = key => plus(key, -((new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7));   // (weeks start on Monday)
const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { title: id, projectId: 'inbox', order: Date.now(), priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });

test('dots, a swipe to next week, a tap scrolls to the day (the + adds there), Today, a task dragged onto a day', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const now = today(), next = plus(weekOf(now), 7), there = plus(next, 1), drop = plus(next, 2);
  const far = uniq('far'), mine = uniq('mine');
  await put(far, { due: { date: there } });
  await put(mine, { due: { date: now } });
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'upcoming');
  const strip = page.locator('#upcoming-strip');
  await expect(strip.locator('.td-wday')).toHaveCount(7);
  await expect(strip.locator('.td-wday').first()).toHaveAttribute('data-day', weekOf(now));
  await expect(strip.locator(`.td-wday[data-day="${now}"]`)).toHaveClass(/is-today/);
  await expect(strip.locator(`.td-wday[data-day="${now}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(strip.locator('.td-month-name')).not.toBeEmpty();
  expect(await AxeBuilder(page)).toEqual([]);

  // a swipe to the left: next week, with the dot on the day of the far task
  await finger(page, '#upcoming-strip .td-week-view', steps(-260, 4, 10), { wait: 30 });
  await expect(strip.locator('.td-wday').first()).toHaveAttribute('data-day', next);
  await expect(strip.locator(`.td-wday[data-day="${there}"] .td-wday-dot`)).toBeVisible();

  // a tap on that day: the list scrolls to it
  await strip.locator(`.td-wday[data-day="${there}"]`).click();
  await expect(strip.locator(`.td-wday[data-day="${there}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`#upcoming .td-day[data-day="${there}"] .td-group-head`)).toBeInViewport();
  await expect(page.locator(`#upcoming .td-day[data-day="${now}"] .td-group-head`)).not.toBeInViewport();

  // the + adds for the day in sight, not today
  const added = uniq('plus');
  await page.locator('#fab').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.fill('#add-sheet .td-add-title', added);
  await page.press('#add-sheet .td-add-title', 'Enter');
  await expect(page.locator('#add-sheet .td-add-title')).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(page.locator('#add-sheet')).toBeHidden();
  await expect.poll(async () => (await db.list('spaces/_/tasks')).find(d => d.title === added)?.due?.date, { timeout: 15_000 }).toBe(there);

  // a task held and dragged onto a day of the strip moves to it
  // (the list is drawn anew as the added task and other tests' tasks arrive: let it settle, and again if it was redrawn)
  await still(page, '#upcoming');
  await expect(() => page.locator(`#upcoming .td-row[data-id="${far}"]`).scrollIntoViewIfNeeded({ timeout: 2_000 })).toPass({ timeout: 10_000 });
  const row = await page.locator(`#upcoming .td-row[data-id="${far}"]`).boundingBox();
  const cell = await strip.locator(`.td-wday[data-day="${drop}"]`).boundingBox();
  const dx = Math.round(cell.x + cell.width / 2 - (row.x + row.width / 2)), dy = Math.round(cell.y + cell.height / 2 - (row.y + row.height / 2));
  await finger(page, `#upcoming .td-row[data-id="${far}"]`, steps(dx, dy, 12), { hold: 650, wait: 80 });
  await expect.poll(async () => (await db.get(`spaces/_/tasks/${far}`))?.due?.date, { timeout: 15_000 }).toBe(drop);

  // Today: back to this week, today picked
  await strip.getByRole('button', { name: 'Today' }).click();
  await expect(strip.locator(`.td-wday[data-day="${now}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(strip.getByRole('button', { name: 'Today' })).toBeHidden();

  // the month: a day picked there
  await strip.locator('.td-month').click();
  const sheet = page.locator('#pick-sheet');
  await expect(sheet).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
  await page.keyboard.press('Escape');
});
