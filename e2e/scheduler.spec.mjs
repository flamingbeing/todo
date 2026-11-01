// The scheduler, from the task sheet's Date: a quick row sets the day and closes; a calendar day, a time and a repeat
// wait for Done; the custom repeat builds its rule; typed words set the date. A repeating task, ticked, stays open on
// its next date, and Undo puts the old one back. The sheet and the custom screen pass axe. Duration (a menu or typed minutes) and Postpone (the next day, time kept).
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, today, db, clickOpens } from './fixtures.mjs';

const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { projectId: 'inbox', order: Date.now(), priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });
const dueOf = async id => (await db.get(`spaces/_/tasks/${id}`))?.due ?? null;
const sheet = '#schedule-sheet';
/** @param {import('@playwright/test').Page} page @param {string} t */
const openScheduler = async (page, t) => {
  await clickOpens(page.locator('#today .td-row').filter({ hasText: t }).locator('.td-row-main'), page.locator('#task-sheet'));
  await page.locator('#task-sheet .td-attr[aria-label^="Date"]').click();
  await expect(page.locator(sheet)).toBeVisible();
};

test('a quick row sets the day and closes; the sheet passes axe', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('quick');
  await put(t, { title: t, due: { date: day(0) } });
  await synced(page);
  await openScheduler(page, t);
  await expect(page.locator(`${sheet} .td-sched-row`).filter({ hasText: 'Today' })).toHaveCount(0);
  await expect(page.locator(`${sheet} .td-cal-sum`)).toContainText(/task/);
  expect(await AxeBuilder(page)).toEqual([]);
  await page.locator(`${sheet} .td-sched-row`).filter({ hasText: 'Tomorrow' }).click();
  await expect(page.locator(sheet)).toBeHidden();
  await expect.poll(() => dueOf(t), { timeout: 15_000 }).toEqual({ date: day(1) });
});

test('a calendar day, a time and a repeat wait for Done; Cancel keeps the date', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('cal');
  await put(t, { title: t, due: { date: day(0) } });
  await synced(page);
  await openScheduler(page, t);
  await page.locator(`${sheet} .td-cal-day[data-day="${day(3)}"]`).click();
  await expect(page.locator(`${sheet} .td-cal-day[data-day="${day(3)}"]`)).toHaveAttribute('aria-selected', 'true');
  await page.locator(`${sheet} .td-sched-time-in`).fill('09:30');
  await expect(page.locator(`${sheet} .td-sched-time`)).toContainText('9:30 AM');
  await page.locator(`${sheet} .td-sched-row`).filter({ hasText: 'Repeat' }).click();
  await page.getByRole('menuitemradio', { name: 'Every day' }).or(page.getByRole('menuitem', { name: 'Every day' })).click();
  await expect(page.locator(`${sheet} .td-sched-row`).filter({ hasText: 'Repeat' })).toContainText('Every day');
  expect(await dueOf(t)).toEqual({ date: day(0) });
  await page.locator(`${sheet} .td-text-btn`).filter({ hasText: 'Done' }).click();
  await expect(page.locator(sheet)).toBeHidden();
  await expect.poll(async () => { const d = await dueOf(t); return d && [d.date, d.time, d.rrule]; }, { timeout: 15_000 }).toEqual([day(3), '09:30', 'FREQ=DAILY']);

  // Cancel: nothing changes
  await page.locator('#task-sheet .td-attr[aria-label^="Date"]').click();
  await page.locator(`${sheet} .td-cal-day[data-day="${day(5)}"]`).click();
  await page.locator(`${sheet} .td-text-btn`).filter({ hasText: 'Cancel' }).click();
  await expect(page.locator(sheet)).toBeHidden();
  expect((await dueOf(t))?.date).toBe(day(3));
});

test('the custom repeat builds its rule; typed words set the date', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('custom');
  await put(t, { title: t, due: { date: day(0) } });
  await synced(page);
  await openScheduler(page, t);
  await page.locator(`${sheet} .td-sched-row`).filter({ hasText: 'Repeat' }).click();
  await page.getByRole('menuitemradio', { name: 'Custom' }).or(page.getByRole('menuitem', { name: 'Custom' })).click();
  await expect(page.locator(`${sheet} .td-sheet-title`)).toHaveText('Custom repeat');
  await page.locator(`${sheet} input[aria-label="Every how many"]`).fill('2');
  await page.locator(`${sheet} select[aria-label="Unit"]`).selectOption('week');
  const wed = page.locator(`${sheet} .td-weekday[aria-label="Wednesday"]`);
  if (await wed.getAttribute('aria-pressed') !== 'true') await wed.click();
  await expect(wed).toHaveAttribute('aria-pressed', 'true');
  await page.locator(`${sheet} .td-choice`).filter({ hasText: 'Completed date' }).click();
  expect(await AxeBuilder(page)).toEqual([]);
  await page.locator(`${sheet} .td-text-btn`).filter({ hasText: 'Save' }).click();
  await expect(page.locator(`${sheet} .td-sheet-title`)).toHaveText('Schedule');
  await page.locator(`${sheet} .td-text-btn`).filter({ hasText: 'Done' }).click();
  await expect.poll(async () => { const d = await dueOf(t); return d && [/^FREQ=WEEKLY;INTERVAL=2;BYDAY=.*WE/.test(d.rrule ?? ''), d.fromDone]; }, { timeout: 15_000 }).toEqual([true, true]);

  // words: "in 4 days"
  await page.locator('#task-sheet .td-attr[aria-label^="Date"]').click();
  await page.locator(`${sheet} .td-sched-text`).fill('in 4 days');
  await expect(page.locator(`${sheet} .td-sched-hint`)).not.toBeEmpty();
  await page.press(`${sheet} .td-sched-text`, 'Enter');
  await expect(page.locator(sheet)).toBeHidden();
  await expect.poll(async () => (await dueOf(t))?.date, { timeout: 15_000 }).toBe(day(4));
});

test('a repeating task, ticked, moves to its next date; Undo puts it back', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('daily');
  await put(t, { title: t, due: { date: day(0), rrule: 'FREQ=DAILY', string: 'every day' } });
  await synced(page);
  await expect(page.locator('#today')).toContainText(t);
  await page.getByRole('checkbox', { name: `Complete: ${t}` }).click();
  await expect.poll(async () => (await dueOf(t))?.date, { timeout: 15_000 }).toBe(day(1));
  expect((await db.get(`spaces/_/tasks/${t}`))?.done).toBe(false);
  await expect(page.locator('#today')).not.toContainText(t);
  await page.locator('.toast').last().getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#today')).toContainText(t);
  await expect.poll(async () => (await dueOf(t))?.date, { timeout: 15_000 }).toBe(day(0));
});

test('Duration: a length from the menu or typed minutes waits for Done; the row and the sheet show the range', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('dur');
  await put(t, { title: t, due: { date: day(0), time: '10:00' } });
  await synced(page);
  await openScheduler(page, t);
  const row = page.locator(`${sheet} .td-sched-row`).filter({ hasText: 'Duration' });
  await expect(row).toContainText('None');
  await row.click();
  await page.getByRole('menuitemradio', { name: '45 min' }).or(page.getByRole('menuitem', { name: '45 min' })).click();
  await expect(row).toContainText('45 min');
  expect(await AxeBuilder(page)).toEqual([]);
  await page.locator(`${sheet} .td-text-btn`).filter({ hasText: 'Done' }).click();
  await expect(page.locator(sheet)).toBeHidden();
  await expect.poll(async () => (await db.get(`spaces/_/tasks/${t}`))?.duration, { timeout: 15_000 }).toBe(45);
  await expect(page.locator('#task-sheet .td-attr[aria-label^="Date"]')).toContainText(/10:00\s?AM–10:45\s?AM/);

  // Custom: minutes typed
  await page.locator('#task-sheet .td-attr[aria-label^="Date"]').click();
  await row.click();
  await page.getByRole('menuitemradio', { name: 'Custom' }).or(page.getByRole('menuitem', { name: 'Custom' })).click();
  await page.locator('#td-sched-min').fill('50');
  await expect(row).toContainText('50 min');
  await page.locator(`${sheet} .td-text-btn`).filter({ hasText: 'Done' }).click();
  await expect.poll(async () => (await db.get(`spaces/_/tasks/${t}`))?.duration, { timeout: 15_000 }).toBe(50);
  await page.keyboard.press('Escape');
  await expect(page.locator('#today .td-row').filter({ hasText: t })).toContainText(/10:00\s?AM–10:50\s?AM/);
  // Today's summary counts every open task due by today and adds up their minutes, other tests' tasks too (the data is
  // shared): it matches the data, which holds this task's 50 min
  const sum = async () => {
    const ts = (await db.list('spaces/_/tasks')).filter(x => x.title && !x.done && x.due?.date && x.due.date <= day(0));
    return [ts.length, ts.reduce((n, x) => n + (x.duration || 0), 0)];
  };
  const shown = async () => {
    const m = (await page.locator('#today-sum').textContent() ?? '').match(/(\d+) tasks?(?: · (?:(\d+) h)? ?(?:(\d+) min)?)?/);
    return m ? [Number(m[1]), Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)] : null;
  };
  await expect.poll(async () => { const [want, got] = [await sum(), await shown()]; return `${got}` === `${want}` || `page ${got}, data ${want}`; }, { timeout: 15_000 }).toBe(true);
});

test('Postpone moves the day by one and keeps the time; a repeating task moves this time only', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('later'), r = uniq('weekly');
  await put(t, { title: t, due: { date: day(0), time: '18:15' } });
  await put(r, { title: r, due: { date: day(0), rrule: 'FREQ=WEEKLY', string: 'every week' } });
  await synced(page);
  await openScheduler(page, t);
  await page.locator(`${sheet} .td-sched-row`).filter({ hasText: 'Postpone' }).click();
  await expect(page.locator(sheet)).toBeHidden();
  await expect.poll(() => dueOf(t), { timeout: 15_000 }).toEqual({ date: day(1), time: '18:15' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#task-sheet')).toBeHidden();
  await openScheduler(page, r);
  await page.locator(`${sheet} .td-sched-row`).filter({ hasText: 'Postpone' }).click();
  await expect.poll(async () => { const d = await dueOf(r); return d && [d.date, d.rrule]; }, { timeout: 15_000 }).toEqual([day(1), 'FREQ=WEEKLY']);
});
