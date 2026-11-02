// Upcoming's head: the month (opens five weeks in place) and the week strip. A swipe goes to the next week; a tap on a
// day scrolls the list to it, and the + adds for that day; a task dragged onto a day of the strip
// moves to that day. Passes axe.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, today, db, openTab, finger, gesturesReady, steps, still, boxOf } from './fixtures.mjs';

const plus = (key, n) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekOf = key => plus(key, -((new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7));   // (weeks start on Monday)
const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { title: id, projectId: 'inbox', order: Date.now(), priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });

test('a swipe to next week, a tap scrolls to the day (the + adds there), the month opens in place, a task dragged onto a day', async ({ phone }) => {
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
  const row = await boxOf(page, `#upcoming .td-row[data-id="${far}"]`);
  const cell = await boxOf(page, `#upcoming-strip .td-wday[data-day="${drop}"]`);
  const dx = Math.round(cell.x + cell.width / 2 - (row.x + row.width / 2)), dy = Math.round(cell.y + cell.height / 2 - (row.y + row.height / 2));
  await finger(page, `#upcoming .td-row[data-id="${far}"]`, steps(dx, dy, 12), { hold: 650, wait: 80 });
  await expect.poll(async () => (await db.get(`spaces/_/tasks/${far}`))?.due?.date, { timeout: 15_000 }).toBe(drop);

  // the month: a scroller of weeks (a year and more) opens in place (no sheet); a day picked there closes it and picks it
  await strip.locator('.td-month').click();
  await expect(strip.locator('.td-month')).toHaveAttribute('aria-expanded', 'true');
  await expect(strip.locator('.td-weeks')).toBeVisible();
  await expect.poll(() => strip.locator('.td-weeks .td-wcell').count()).toBeGreaterThanOrEqual(53 * 7);
  expect(await AxeBuilder(page)).toEqual([]);
  await strip.locator(`.td-wcell[data-day="${plus(weekOf(now), 7)}"]`).click();
  await expect(strip.locator('.td-weeks')).toBeHidden();
  await expect(strip.locator('.td-wday').first()).toHaveAttribute('data-day', plus(weekOf(now), 7));
});

test('a long press on a day of the strip opens the quick add dated that day', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const now = today();
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'upcoming');
  await finger(page, `#upcoming-strip .td-wday[data-day="${now}"]`, [], { hold: 700 });
  await expect(page.locator('#add-sheet')).toBeVisible();
  await expect(page.locator('#add-sheet .td-chip-main').first()).toHaveAttribute('aria-label', 'Date: Today');
  const t = uniq('held');
  await page.locator('#add-sheet .td-add-title').fill(t);
  await page.keyboard.press('Enter');
  await expect(page.locator(`#upcoming .td-day[data-day="${now}"]`)).toContainText(t);
});
