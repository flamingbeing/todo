// Reporting (Browse > Reporting): what was added, completed and commented, by day, newest first ("3 Nov · Today"); the
// funnel in the bar shows one kind; the chart button opens Productivity. Axe, light and dark.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, openTab } from './fixtures.mjs';

test('a completion under Today, the kind filter, the Productivity link', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('rep-done');
  await db.put(`spaces/_/tasks/${t}`, { title: t, projectId: 'inbox', order: Date.now(), priority: 4, done: true, doneAt: Date.now(), createdAt: Date.now() - 60_000, updatedAt: Date.now() });
  await synced(page);
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: 'Reporting' }).click();
  await expect(page.locator('#reporting-page')).toBeVisible();
  const host = page.locator('#reporting');
  const today = host.locator('section.td-rep-day').first();
  await expect(today.locator('.td-rep-h')).toContainText('Today');
  const done = today.locator('.td-rep-row[data-kind="completed"]', { hasText: t });
  await expect(done).toHaveCount(1);
  await expect(done).toContainText('You completed a task:');
  await expect(done.locator('.td-rep-where')).toContainText('Inbox');
  await expect(today.locator('.td-rep-row[data-kind="added"]', { hasText: t })).toHaveCount(1);
  await expect(page.locator('#reporting-filter')).toBeVisible();
  for (const colorScheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme });
    expect(await AxeBuilder(page)).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });

  // the funnel: Completed only
  await page.locator('#reporting-filter').click();
  const pick = page.locator('#pick-sheet');
  await pick.getByRole('option', { name: 'Completed' }).click();
  await expect(pick).toBeHidden();
  await expect(page.locator('#reporting-filter')).toHaveClass(/is-on/);
  await expect(host.locator('.td-rep-row[data-kind="completed"]', { hasText: t })).toHaveCount(1);
  await expect(host.locator('.td-rep-row:not([data-kind="completed"])')).toHaveCount(0);
  await page.locator('#reporting-filter').click();
  await pick.getByRole('option', { name: 'All' }).click();
  // the filter resets to one page; tests running in parallel share the database, so newer rows can push ours onto the next
  const added = host.locator('.td-rep-row[data-kind="added"]', { hasText: t });
  await expect(async () => {
    if (!(await added.count())) await host.locator('.td-rep-more').click({ timeout: 1000 }).catch(() => {});
    await expect(added).toHaveCount(1, { timeout: 500 });
  }).toPass({ timeout: 10_000 });

  // the chart: Productivity; its back goes to Reporting
  await page.locator('#reporting-chart').click();
  await expect(page.locator('#productivity-page')).toBeVisible();
  await expect(page.locator('#reporting-chart')).toBeHidden();
});
