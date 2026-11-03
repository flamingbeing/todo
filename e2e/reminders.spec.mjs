// Reminders: the task sheet's Reminders row ticks leads (needs a date), the option is off by default and asks for
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
  const row = page.locator(`${sheet} button.td-attr[aria-label^="Reminders"]`);
  await expect(row).toHaveAttribute('aria-label', 'Reminders');
  await row.click();
  await page.getByRole('menuitemradio', { name: '30 minutes before' }).click();
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
