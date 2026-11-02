// The calendar layout. A project picked as Calendar in Display shows a week of 3 days on a phone: a timed task is a
// block as tall as its duration (48 px an hour), an untimed one a chip in the all-day row (two, then "+N"; the toggle
// shows them all), the now line on today. A tap on an empty half hour adds a task there for 30 minutes; the ring
// completes (Undo puts it back); a held block dragged an hour down moves an hour (one save, Undo); an all-day chip
// dropped into an hour gets that time and 30 minutes. Month: chips on their day, "+N more" opens the day, a chip
// dragged to another day moves there. The "No date" count opens a sheet: two ticked and scheduled for tomorrow. Today
// is one day; Upcoming's calendar has no strip. Week, Month and the No date sheet pass axe.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, today, db, openTab, finger, gesturesReady, steps, still } from './fixtures.mjs';

const plus = (key, n) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const stamp = () => ({ createdAt: Date.now(), updatedAt: Date.now() });
const HOUR = 48;

async function project(page, name) {
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.locator('#project-page')).toBeVisible();
}
/** Display > Calendar (and a kind: Week, Month, Agenda), then Done */
async function calendar(page, kind = '') {
  await page.locator('#display-btn').click();
  const sheet = page.locator('#display-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('radio', { name: 'Calendar' }).click();
  await expect(sheet.getByRole('radio', { name: 'Calendar' })).toHaveAttribute('aria-checked', 'true');
  if (kind) await sheet.locator('.td-seg').getByRole('radio', { name: kind }).click();
  await sheet.getByRole('button', { name: /^(Done|Save)$/ }).click();
  await expect(sheet).toBeHidden();
}
/** a made-up project with these tasks -> its name */
async function seed(tasks) {
  const pid = uniq('cp'), name = uniq('Cal');
  await db.put(`spaces/_/projects/${pid}`, { name, color: 'blue', parentId: null, view: 'list', order: Date.now(), ...stamp() });
  for (const [id, f] of Object.entries(tasks)) await db.put(`spaces/_/tasks/${id}`, { title: id, projectId: pid, order: Date.now(), priority: 4, done: false, ...stamp(), ...f });
  return name;
}
const task = id => db.get(`spaces/_/tasks/${id}`);
/** an element's box (again if it was drawn anew meanwhile) */
async function box(loc) {
  let b = null;
  await expect(async () => { b = await loc.boundingBox({ timeout: 2_000 }); expect(b).not.toBeNull(); }).toPass({ timeout: 10_000 });
  return b;
}
/** puts an element in the middle of the screen (clear of the edges, where a drag scrolls) */
const centre = (page, sel) => page.locator(sel).evaluate(e => e.scrollIntoView({ block: 'center' }));

test('week: blocks, all-day chips, the now line; a slot tap adds, the ring completes, a drag moves (Undo), a chip into an hour', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const now = today(), rent = uniq('rent'), ring = uniq('ring'), a1 = uniq('a1'), a2 = uniq('a2'), a3 = uniq('a3');
  const name = await seed({
    [rent]: { due: { date: now, time: '10:00' }, duration: 45, priority: 1 },
    [ring]: { due: { date: now, time: '13:00' } },
    [a1]: { due: { date: now }, order: 1 }, [a2]: { due: { date: now }, order: 2 }, [a3]: { due: { date: now }, order: 3 },
  });
  await synced(page);
  await gesturesReady(page);
  await project(page, name);
  await calendar(page);
  const cal = page.locator('#project-page .td-cv');
  await expect(cal.locator('.td-cv-head')).toHaveCount(3);
  await expect(cal.locator('.td-cv-head').first()).toHaveAttribute('data-cal-head', now);
  await expect(cal.locator('.td-cv-head.is-today')).toHaveCount(1);

  // a block as tall as its 45 minutes, its full name read out, P1's fill
  const block = cal.locator(`.td-cv-block[data-cal-id="${rent}"]`);
  await expect(block).toBeVisible();
  expect((await box(block)).height).toBeCloseTo(HOUR * 45 / 60, 0);
  await expect(block).toHaveAttribute('data-priority', '1');
  // times in the device's own clock style, as the rows and the hour gutter (the tests run en-US: 12-hour)
  await expect(block.locator('.td-cv-open')).toHaveAttribute('aria-label', new RegExp(`^${rent}, .*10:00\\sAM to 10:45\\sAM, priority 1$`));
  await expect(block.locator('.td-cv-block-time')).toHaveAttribute('data-time', /^10:00\s–\s10:45\sAM$/);
  // a task with no duration is half an hour
  // (other tests' tasks arriving draw the calendar anew: measure once it has settled)
  await expect(cal.locator(`.td-cv-block[data-cal-id="${ring}"]`)).toBeVisible();
  await still(page, '#project-page');
  expect((await box(cal.locator(`.td-cv-block[data-cal-id="${ring}"]`))).height).toBeCloseTo(HOUR / 2, 0);

  // the all-day row: one chip and "+2"; the toggle shows all three, and again fewer
  const allDay = cal.locator(`.td-cv-allday-cell[data-cal-allday="${now}"]`);
  await expect(allDay.locator('.td-cv-chip[data-cal-id]')).toHaveCount(1);
  await expect(allDay.locator('.td-cv-chip-more')).toHaveText('+2');
  await cal.getByRole('button', { name: 'Show all all-day tasks' }).click();
  await expect(allDay.locator('.td-cv-chip[data-cal-id]')).toHaveCount(3);
  await cal.getByRole('button', { name: 'Show fewer all-day tasks' }).click();
  await expect(allDay.locator('.td-cv-chip[data-cal-id]')).toHaveCount(1);

  // the now line on today, at the time now
  const line = cal.locator('.td-cv-now');
  await expect(line).toHaveCount(1);
  const shown = await cal.locator('.td-cv-now-time').textContent();
  const clock = await page.evaluate(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  const [, hh, mm, ap] = /** @type {RegExpMatchArray} */ (String(shown).match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/));
  const h = (+hh % 12) + (ap === 'PM' ? 12 : 0), m = +mm;
  expect(Math.abs(h * 60 + m - clock)).toBeLessThanOrEqual(1);
  const col = cal.locator(`.td-cv-col[data-cal-slot="${now}"]`);
  const lineY = (await box(cal.locator('.td-cv-now-day'))).y - (await box(col)).y;
  expect(Math.abs(lineY - (h * 60 + m) * HOUR / 60)).toBeLessThanOrEqual(2);

  expect(await AxeBuilder(page)).toEqual([]);

  // a tap on an empty half hour (11:00 to 11:30): quick add at 11:00, 30 minutes
  await centre(page, `#project-page .td-cv-block[data-cal-id="${rent}"]`);
  let c = await box(col);
  await page.mouse.click(c.x + c.width - 8, c.y + 11 * HOUR + 10);
  await expect(page.locator('#add-sheet')).toBeVisible();
  await expect(page.locator('#add-sheet .td-chip-main[aria-label^="Date"]')).toHaveAttribute('aria-label', /11:00/);
  const added = uniq('slot');
  await page.fill('#add-sheet .td-add-title', added);
  await page.press('#add-sheet .td-add-title', 'Enter');
  await expect(page.locator('#add-sheet .td-add-title')).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(page.locator('#add-sheet')).toBeHidden();
  await expect.poll(async () => { const d = (await db.list('spaces/_/tasks')).find(x => x.title === added); return d && [d.due?.date, d.due?.time, d.duration]; }, { timeout: 15_000 })
    .toEqual([now, '11:00', 30]);
  await expect(cal.locator('.td-cv-block').filter({ hasText: added })).toBeVisible();

  // the ring completes; Undo puts it back
  await cal.getByRole('checkbox', { name: `Complete: ${ring}` }).click();
  await expect.poll(async () => (await task(ring))?.done, { timeout: 15_000 }).toBe(true);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await task(ring))?.done, { timeout: 15_000 }).toBe(false);

  // held and dragged an hour down: 11:00 (its 45 minutes kept); Undo: 10:00
  await centre(page, `#project-page .td-cv-block[data-cal-id="${rent}"]`);
  await finger(page, `#project-page .td-cv-block[data-cal-id="${rent}"] .td-cv-open`, steps(0, HOUR, 8), { hold: 500, wait: 80 });
  await expect.poll(async () => { const d = await task(rent); return [d?.due?.time, d?.duration]; }, { timeout: 15_000 }).toEqual(['11:00', 45]);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await task(rent))?.due?.time, { timeout: 15_000 }).toBe('10:00');

  // an all-day chip dropped into 12:00: that time, 30 minutes
  await expect(block).toHaveCSS('top', `${10 * HOUR}px`);
  await centre(page, `#project-page .td-cv-block[data-cal-id="${rent}"]`);
  await still(page, '#project-page');
  const id = await allDay.locator('.td-cv-chip[data-cal-id]').first().getAttribute('data-cal-id');
  const from = await box(cal.locator(`.td-cv-chip[data-cal-id="${id}"]`));
  c = await box(col);
  const dx = Math.round(c.x + c.width / 2 - (from.x + from.width / 2)), dy = Math.round(c.y + 12 * HOUR + 4 - (from.y + from.height / 2));
  await finger(page, `#project-page .td-cv-chip[data-cal-id="${id}"]`, steps(dx, dy, 10), { hold: 500, wait: 80 });
  await expect.poll(async () => { const d = await task(id); return [d?.due?.date, d?.due?.time, d?.duration]; }, { timeout: 15_000 }).toEqual([now, '12:00', 30]);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
});

test('month: chips on their day, "+N more" opens the day, a chip dragged to another day; passes axe', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const now = today(), ids = [1, 2, 3, 4].map(i => uniq(`m${i}`));
  const name = await seed(Object.fromEntries(ids.map((id, i) => [id, { due: { date: now }, order: i }])));
  await synced(page);
  await gesturesReady(page);
  await project(page, name);
  await calendar(page, 'Month');
  const cal = page.locator('#project-page .td-cv');
  const cell = cal.locator(`.td-cv-cell[data-cal-cell="${now}"]`);
  await expect(cell.locator('.td-cv-chip[data-cal-id]')).toHaveCount(2);
  expect(ids).toEqual(expect.arrayContaining(await cell.locator('.td-cv-chip[data-cal-id]').evaluateAll(cs => cs.map(c => c.dataset.calId))));
  await expect(cell.locator('.td-cv-more')).toHaveText('+2 more');
  await expect(cal.locator('.td-cv-cell .td-cv-chip[data-cal-id]')).toHaveCount(2);
  expect(await AxeBuilder(page)).toEqual([]);

  // "+2 more": the day, all four and Add task
  await cell.locator('.td-cv-more').click();
  const sheet = page.locator('#cal-sheet');
  await expect(sheet).toBeVisible();
  for (const id of ids) await expect(sheet.getByText(id, { exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Add task' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // a chip held and dragged to another day of the month moves there
  const other = (await cal.locator('.td-cv-cell').evaluateAll((cs, now) => cs.map(c => c.dataset.calCell).filter(k => k !== now), now))[8];
  await still(page, '#project-page');
  const id = await cell.locator('.td-cv-chip[data-cal-id]').first().getAttribute('data-cal-id');
  const chip = cal.locator(`.td-cv-chip[data-cal-id="${id}"]`);
  await expect(() => chip.scrollIntoViewIfNeeded({ timeout: 2_000 })).toPass({ timeout: 10_000 });
  const from = await box(chip), to = await box(cal.locator(`.td-cv-cell[data-cal-cell="${other}"]`));
  const dx = Math.round(to.x + to.width / 2 - (from.x + from.width / 2)), dy = Math.round(to.y + to.height / 2 - (from.y + from.height / 2));
  await finger(page, `#project-page .td-cv-chip[data-cal-id="${id}"]`, steps(dx, dy, 10), { hold: 500, wait: 80 });
  await expect.poll(async () => (await task(id))?.due?.date, { timeout: 15_000 }).toBe(other);
  await expect(cal.locator(`.td-cv-cell[data-cal-cell="${other}"] .td-cv-chip[data-cal-id="${id}"]`)).toBeVisible();

  // the chevrons page a month, and Today comes back
  const title = await cal.locator('.td-cv-title').textContent();
  await cal.getByRole('button', { name: 'Next month' }).click();
  await expect(cal.locator('.td-cv-title')).not.toHaveText(String(title));
  await cal.getByRole('button', { name: 'Today' }).click();
  await expect(cal.locator('.td-cv-title')).toHaveText(String(title));
});

test('"No date 2" opens a sheet: two ticked, Schedule, Tomorrow; passes axe', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const now = today(), u1 = uniq('u1'), u2 = uniq('u2');
  const name = await seed({ [u1]: { order: 1 }, [u2]: { order: 2 }, [uniq('dated')]: { due: { date: now } } });
  await synced(page);
  await project(page, name);
  await calendar(page);
  const count = page.locator('#project-page .td-cv-nodate');
  await expect(count).toHaveText('No date 2');
  await count.click();
  const sheet = page.locator('#cal-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.td-cv-pick')).toHaveCount(2);
  expect(await AxeBuilder(page)).toEqual([]);
  await sheet.getByRole('checkbox', { name: new RegExp(u1) }).click();
  await sheet.getByRole('checkbox', { name: new RegExp(u2) }).click();
  await expect(sheet.locator('.td-cv-pick[aria-checked="true"]')).toHaveCount(2);
  await sheet.getByRole('button', { name: 'Schedule' }).click();
  await page.locator('#schedule-sheet .td-sched-row').filter({ hasText: 'Tomorrow' }).click();
  for (const id of [u1, u2]) await expect.poll(async () => (await task(id))?.due?.date, { timeout: 15_000 }).toBe(plus(now, 1));
  await expect(count).toBeHidden();
});

test('Today is one day; Upcoming\'s calendar is three days with no strip', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const now = today(), mine = uniq('today');
  await db.put(`spaces/_/tasks/${mine}`, { title: mine, projectId: 'inbox', order: Date.now(), priority: 2, done: false, due: { date: now, time: '09:00' }, duration: 60, ...stamp() });
  await synced(page);
  await openTab(page, 'today');
  await calendar(page);
  const day = page.locator('#today-page .td-cv');
  await expect(day.locator('.td-cv-head')).toHaveCount(1);
  await expect(day.locator('.td-cv-head')).toHaveClass(/is-today/);
  await expect(day.locator(`.td-cv-block[data-cal-id="${mine}"]`)).toBeVisible();
  // a column as wide as the screen less the hours
  const w = (await box(day.locator('.td-cv-col'))).width;
  expect(w).toBeGreaterThan(300);

  await openTab(page, 'upcoming');
  await calendar(page);
  const up = page.locator('#upcoming-page .td-cv');
  await expect(up.locator('.td-cv-head')).toHaveCount(3);
  await expect(page.locator('#upcoming-strip')).toBeHidden();
  await expect(up.locator(`.td-cv-block[data-cal-id="${mine}"]`)).toBeVisible();
});
