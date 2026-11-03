// Browse: the top card lists the places in a fixed order (Inbox, Today, Upcoming and Search only while off the tab bar;
// Filters & Labels, Reporting, Templates; Completed last); Settings > Navigation menu hides rows and turns counts on (this
// device). "My Projects" folds and stays folded after a reload; its last row opens Manage projects. Axe, light and dark.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, openTab, openSettings, settingsBack } from './fixtures.mjs';

const now = () => ({ createdAt: Date.now(), updatedAt: Date.now() });
const places = page => page.locator('#browse .td-browse-card').first().locator('.td-browse-label');

test('the top card order, with tabs on and off the bar; a hidden row; counts', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('inbox-task');
  await db.put(`spaces/_/tasks/${t}`, { title: t, projectId: 'inbox', order: Date.now(), priority: 4, done: false, ...now() });
  await synced(page);
  await openTab(page, 'browse');
  await expect(places(page)).toHaveText(['Search', 'Filters & Labels', 'Reporting', 'Templates', 'Completed'])   // (Search starts off the bar);
  await expect(page.locator('#browse-top #browse-settings')).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);

  // Inbox and Upcoming off the bar: they join the card, in their place
  await openSettings(page, 'Navigation bar');
  await page.getByRole('switch', { name: 'On the tab bar: Inbox' }).click();
  await page.getByRole('switch', { name: 'On the tab bar: Upcoming' }).click();
  await settingsBack(page);
  await openTab(page, 'browse');
  await expect(places(page)).toHaveText(['Inbox', 'Upcoming', 'Search', 'Filters & Labels', 'Reporting', 'Templates', 'Completed']);
  await expect(page.locator('#browse .td-browse-count')).toHaveCount(0);   // counts are off until turned on

  // Navigation menu: hide Reporting; counts on
  await openSettings(page, 'Navigation menu');
  await page.locator('.td-check[data-item="reporting"]').uncheck();
  await page.getByRole('switch', { name: /Show task count/ }).click();
  await openTab(page, 'browse');
  await expect(places(page)).toHaveText(['Inbox', 'Upcoming', 'Search', 'Filters & Labels', 'Templates', 'Completed']);
  const inbox = page.locator('#browse .td-browse-row', { hasText: 'Inbox' }).first();
  await expect.poll(async () => +((await inbox.locator('.td-browse-count').textContent()) ?? 0)).toBeGreaterThanOrEqual(1);
});

test('My Projects folds and stays folded; Manage projects opens; axe light and dark', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const name = uniq('Proj'), pid = uniq('p');
  await db.put(`spaces/_/projects/${pid}`, { name, color: 'blue', parentId: null, view: 'list', order: Date.now(), ...now() });
  await synced(page);
  await openTab(page, 'browse');
  const fold = page.locator('#browse .td-browse-fold');
  const proj = page.locator('#browse').getByRole('button', { name: new RegExp(`^${name}`) });
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await expect(proj).toBeVisible();
  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(proj).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openTab(page, 'browse');
  await expect(page.locator('#browse .td-browse-fold')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#browse .td-browse-fold').click();
  await expect(proj).toBeVisible();

  await page.locator('#browse').getByRole('button', { name: 'Manage projects' }).click();
  const sheet = page.locator('#pick-sheet');
  await expect(sheet.getByRole('heading', { name: 'Manage projects' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  for (const colorScheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme });
    expect(await AxeBuilder(page)).toEqual([]);
  }
});
