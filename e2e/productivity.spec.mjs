// Productivity (Browse row): today's and this week's counts from completed tasks, a 7-day bar chart in SVG, the streak, and
// goals set in Settings > General (this device, off by default). The page passes axe.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, openTab, openSettings, settingsBack } from './fixtures.mjs';

const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { projectId: 'inbox', order: Date.now(), priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });

test('counts, the 7-day chart and the streak; a goal shows a bar', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const a = uniq('done'), b = uniq('done');
  await put(a, { title: a, done: true, doneAt: Date.now() });
  await put(b, { title: b, done: true, doneAt: Date.now() });
  await synced(page);
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: 'Reporting' }).click();
  const host = page.locator('#productivity');
  await expect(host.locator('.td-stat').first().locator('.td-stat-cap')).toHaveText('Done today');
  await expect.poll(async () => +(await host.locator('.td-stat-n').first().textContent())).toBeGreaterThanOrEqual(2);
  expect(+(await host.locator('.td-stat-n').nth(1).textContent())).toBeGreaterThanOrEqual(2);
  await expect(host.locator('svg.td-chart')).toBeVisible();
  await expect(host.locator('svg.td-chart .td-chart-l')).toHaveCount(7);
  await expect(host.locator('svg.td-chart .td-chart-bar.is-today')).toHaveCount(1);
  await expect(host.locator('.td-streak-n')).toContainText('day');
  await expect(host.locator('.td-stat-bar')).toHaveCount(0);   // goals are off until set
  expect(await AxeBuilder(page)).toEqual([]);

  // a daily goal in Settings > Productivity shows a bar on the page
  await openSettings(page, 'Productivity');
  await page.getByRole('combobox', { name: /Daily goal/ }).selectOption({ label: '3' }).catch(async () => {
    await page.locator('#settings-host').getByText('Daily goal', { exact: true }).click();
    await page.getByRole('option', { name: '3', exact: true }).click();
  });
  await settingsBack(page);
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: 'Reporting' }).click();
  await expect(host.locator('.td-stat-bar')).toHaveCount(1);
  await expect(host.locator('svg.td-chart .td-chart-goal')).toHaveCount(1);
});
