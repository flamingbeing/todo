// Deadlines: the task sheet's Deadline row opens the scheduler for a day alone (no Time, no Repeat), the row shows the
// target and "in 3 days" in purple (red once past), "No deadline" clears it, and quick add reads {words} and has
// "…" > Deadline. The sheets pass axe.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, today, db, clickOpens, space } from './fixtures.mjs';

const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
const put = (id, fields) => db.put(`${space()}/tasks/${id}`, { projectId: 'inbox', order: Date.now(), priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });
const deadlineOf = async id => (await db.get(`${space()}/tasks/${id}`))?.deadline ?? null;
const sheet = '#schedule-sheet';

test('the sheet\'s Deadline row sets a day only; the row shows it; No deadline clears it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('report');
  await put(t, { title: t, due: { date: day(0) } });
  await synced(page);
  const row = page.locator('#today .td-row').filter({ hasText: t });
  await clickOpens(row.locator('.td-row-main'), page.locator('#task-sheet'));
  const attr = page.locator('#task-sheet .td-attr-chips [aria-label^="Deadline"]');
  await expect(attr).toHaveAttribute('aria-label', 'Deadline');
  await attr.click();
  await expect(page.locator(sheet)).toBeVisible();
  await expect(page.locator(`${sheet} .td-sheet-title`)).toHaveText('Deadline');
  await expect(page.locator(`${sheet} .td-sched-time`)).toHaveCount(0);
  await expect(page.locator(`${sheet} .td-sched-more`)).toHaveCount(0);
  // (No deadline only once there is one to take off)
  await expect(page.locator(`${sheet} .td-sched-row`).filter({ hasText: 'No deadline' })).toHaveCount(0);
  expect(await AxeBuilder(page)).toEqual([]);
  await page.locator(`${sheet} .td-cal-day[data-day="${day(3)}"]`).click();
  await page.locator(`${sheet} .td-sched-save`).click();
  await expect(page.locator(sheet)).toBeHidden();
  await expect.poll(() => deadlineOf(t), { timeout: 15_000 }).toBe(day(3));
  await expect(attr).toHaveAttribute('aria-label', 'Deadline: in 3 days');
  await page.keyboard.press('Escape');
  const meta = row.locator('.td-deadline');
  await expect(meta).toHaveText('in 3 days');
  await expect(meta).toHaveAttribute('data-tone', 'deadline');
  expect(await AxeBuilder(page)).toEqual([]);
  await clickOpens(row.locator('.td-row-main'), page.locator('#task-sheet'));
  await attr.click();
  await page.locator(`${sheet} .td-sched-row`).filter({ hasText: 'No deadline' }).click();
  await expect.poll(() => deadlineOf(t), { timeout: 15_000 }).toBe(null);
  await page.keyboard.press('Escape');
  await expect(row.locator('.td-deadline')).toHaveCount(0);
});

test('a deadline in the past is red', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('late');
  await put(t, { title: t, due: { date: day(0) }, deadline: day(-2) });
  await synced(page);
  const meta = page.locator('#today .td-row').filter({ hasText: t }).locator('.td-deadline');
  await expect(meta).toHaveAttribute('data-tone', 'overdue');
  await expect(meta).toHaveText(/\d+ \w{3}/);
});

test('quick add: {words} make the deadline, the "…" menu has Deadline, the task gets it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await page.locator('#fab').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.waitForFunction(() => performance.getEntriesByType('resource').some(e => /chrono\.js/.test(e.name)), null, { timeout: 15_000 });
  const name = '#add-sheet .td-add-title';
  const t = uniq('permit');
  await page.fill(name, `${t} {in 4 days}`);
  await expect(page.locator('#add-sheet .td-hl')).toHaveText('{in 4 days}');
  const chip = page.locator('#add-sheet .td-chip-main[aria-label^="Deadline"]');
  await expect(chip).toHaveAttribute('aria-label', 'Deadline: in 4 days');
  expect(await AxeBuilder(page)).toEqual([]);
  await page.press(name, 'Enter');
  await expect.poll(async () => (await db.list(`${space()}/tasks`)).find(d => d.title === t)?.deadline, { timeout: 15_000 }).toBe(day(4));
  // the menu
  const t2 = uniq('form');
  await page.fill(name, t2);
  await expect(chip).toBeHidden();
  await page.locator('#add-sheet .td-chip-plus').click();
  await page.getByRole('menuitem', { name: 'Deadline' }).click();
  await expect(page.locator(sheet)).toBeVisible();
  await page.locator(`${sheet} .td-cal-day[data-day="${day(6)}"]`).click();
  await page.locator(`${sheet} .td-sched-save`).click();
  await expect(chip).toHaveAttribute('aria-label', /^Deadline: in 6 days/);
  // the x leaves the words and the chip
  await chip.locator('xpath=following-sibling::button').click();
  await expect(chip).toBeHidden();
  await page.press(name, 'Enter');
  await expect.poll(async () => { const d = (await db.list(`${space()}/tasks`)).find(x => x.title === t2); return d ? (d.deadline ?? null) : 'missing'; }, { timeout: 15_000 }).toBe(null);
});
