// Upcoming motion: the selected-day circle cross-fades in 60 ms, the month caret flips at once, the Overdue head scrolls
// away (day heads pin), and the calendar settles in under 200 ms after the finger lets go.
import { test, expect, signIn, synced, uniq, today, db, openTab, gesturesReady } from './fixtures.mjs';

const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { title: id, projectId: 'inbox', order: Date.now(), priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });

test('day circle fades in 60 ms, caret has no transform transition, Overdue head not sticky, calendar settles fast', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await put(uniq('late'), { due: { date: '2020-01-01' } });
  await put(uniq('now'), { due: { date: today() } });
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'upcoming');
  const css = (sel, prop) => page.locator(sel).first().evaluate((e, p) => getComputedStyle(e)[p], prop);
  await expect(page.locator('#upcoming-strip .td-wday')).toHaveCount(7);
  expect(await css('#upcoming-strip .td-wday-num', 'transitionDuration')).toBe('0.06s');
  expect(await css('.td-month-chevron', 'transitionDuration')).toBe('0s');
  await expect(page.locator('#upcoming .td-group:not(.td-day) > .td-group-head').first()).toBeVisible();
  expect(await css('#upcoming .td-group:not(.td-day) > .td-group-head', 'position')).not.toBe('sticky');
  expect(await css('#upcoming .td-day > .td-group-head', 'position')).toBe('sticky');
  // open the calendar; it lands in under 200 ms + the tap
  await page.locator('#upcoming-strip .td-month').click();
  const t0 = Date.now();
  await expect.poll(async () => page.locator('#upcoming-strip .td-wcal').evaluate(e => e.getBoundingClientRect().height), { intervals: [10] }).toBeGreaterThan(150);
  expect(Date.now() - t0).toBeLessThan(400);
});

test('with reduced motion the day circle does not transition', async ({ phone }) => {
  const page = await phone();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, 'member');
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'upcoming');
  await expect(page.locator('#upcoming-strip .td-wday')).toHaveCount(7);
  expect(await page.locator('#upcoming-strip .td-wday-num').first().evaluate(e => getComputedStyle(e).transitionDuration)).toBe('0s');
});
