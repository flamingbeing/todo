// Reminders: the task sheet's Reminders pill opens the Reminders sheet (needs a date), the option is off by default and asks for
// permission only when turned on in Settings, and a due reminder shows a notification.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, today, db, clickOpens, openSettings } from './fixtures.mjs';

const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { projectId: 'inbox', order: Date.now(), priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });
const sheet = '#task-sheet';

test('tick reminders in the task sheet; they are saved on the task', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('rem');
  await put(t, { title: t, due: { date: today(), time: '23:00' } });
  await synced(page);
  await clickOpens(page.locator('#today .td-row').filter({ hasText: t }).locator('.td-row-main'), page.locator(sheet));
  const row = page.locator(`${sheet} .td-attr-chips [aria-label^="Reminder"]`);
  await expect(row).toHaveAttribute('aria-label', 'Reminder');
  await row.click();
  // the Reminders sheet: Suggestions (not set yet, each with its clock time), Date & time (the set ones), + Add reminder
  const pick = page.locator('#pick-sheet');
  await expect(pick.getByRole('heading', { name: 'Reminders' })).toBeVisible();
  await expect(pick.getByRole('heading', { name: 'Suggestions' })).toBeVisible();
  await expect(pick.getByRole('heading', { name: 'Date & time' })).toBeVisible();
  await expect(pick.locator('[data-suggestion="0"] .td-remind-when')).toContainText('23:00');
  await pick.locator('[data-suggestion="30"]').click();
  await expect(row).toHaveAttribute('aria-label', 'Reminders: 30 minutes');
  await expect(pick.locator('.td-remind-set')).toHaveCount(1);
  await expect(pick.locator('.td-remind-set')).toContainText('22:30');
  // + Add reminder opens every lead; a pick adds it and returns to the sheet
  await pick.getByRole('button', { name: 'Add reminder' }).click();
  await pick.getByRole('option', { name: '1 hour before' }).click();
  await expect(pick.locator('.td-remind-set')).toHaveCount(2);
  await expect(row).toHaveAttribute('aria-label', 'Reminders: 30 minutes, 1 hour');
  await pick.getByRole('button', { name: 'Remove 1 hour before' }).click();
  await expect(pick.locator('.td-remind-set')).toHaveCount(1);
  await expect(row).toHaveAttribute('aria-label', 'Reminders: 30 minutes');
  expect(await AxeBuilder(page)).toEqual([]);
  await synced(page);
  expect((await db.get(`spaces/_/tasks/${t}`)).reminders).toEqual([30]);
});

test('Settings has Reminders, off by default; a refused permission leaves it off', async ({ phone }) => {
  const page = await phone();
  await page.addInitScript(() => {
    window.__asked = 0;
    // @ts-ignore a browser that answers "denied"
    Object.defineProperty(window, 'Notification', { value: Object.assign(function () {}, { permission: 'default', requestPermission: async () => { window.__asked++; return 'denied'; } }), configurable: true });
  });
  await signIn(page, 'member');
  await synced(page);
  expect(await page.evaluate(() => window.__asked)).toBe(0);   // never asked on load
  await openSettings(page, 'Notifications');
  const sw = page.locator('#settings-host').getByRole('switch', { name: /Notify me/ });
  await expect(sw).not.toBeChecked();
  expect(await page.evaluate(() => window.__asked)).toBe(0);
  await sw.click();
  await expect.poll(() => page.evaluate(() => window.__asked)).toBe(1);
  await expect(sw).not.toBeChecked();   // refused: back off
});
