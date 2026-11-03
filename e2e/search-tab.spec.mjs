// The Search tab: the field has the focus as the tab opens; every word typed must match (any case, any accents);
// what matches shows as Tasks, Projects, Labels and Filters; a search left with Enter is kept as recent on this
// device, a tap runs it again and Clear forgets them. Passes axe.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, openSearch, openSettings, openTab } from './fixtures.mjs';

const now = () => ({ createdAt: Date.now(), updatedAt: Date.now() });

test('results in groups, accents ignored, recent searches kept and cleared', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const w = uniq('zq').replace(/-/g, '');
  const t = uniq('st'), pid = uniq('p'), lid = uniq('l'), fid = uniq('f');
  await db.put(`spaces/_/tasks/${t}`, { title: `Crème ${w} brûlée`, projectId: 'inbox', order: Date.now(), priority: 4, done: false, ...now() });
  await db.put(`spaces/_/projects/${pid}`, { name: `Proj ${w}`, color: 'blue', parentId: null, view: 'list', order: Date.now(), ...now() });
  await db.put(`spaces/_/labels/${lid}`, { name: `lab${w}`, color: 'red', order: Date.now(), favorite: false, ...now() });
  await db.put(`spaces/_/filters/${fid}`, { name: `Filter ${w}`, query: 'p1', color: 'red', order: Date.now(), favorite: false, ...now() });
  await synced(page);
  await openSearch(page);
  const field = page.locator('#search-text');
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('placeholder', 'Tasks, projects, and more');
  await field.fill(`CREME ${w}`);
  await expect(page.locator(`#search .td-row[data-id="${t}"]`)).toBeVisible();
  await expect(page.locator('#search .td-search-h')).toHaveText(['Tasks']);
  await field.fill(w);
  await expect(page.locator('#search .td-search-h')).toHaveText(['Tasks', 'Projects', 'Labels', 'Filters']);
  expect(await AxeBuilder(page)).toEqual([]);
  await field.press('Enter');
  await field.fill('');
  await expect(page.locator('#search .td-search-h').filter({ hasText: 'Recent searches' })).toHaveText(['Recent searches']);
  await expect(page.locator('#search .td-result').first()).toHaveText(w);
  expect(await AxeBuilder(page)).toEqual([]);
  await page.locator('#search .td-result').first().click();
  await expect(field).toHaveValue(w);
  await expect(page.locator('#search .td-search-h')).toHaveText(['Tasks', 'Projects', 'Labels', 'Filters']);
  await page.locator('#search').getByRole('button', { name: `Proj ${w}` }).click();
  await expect(page.locator('#project-page')).toBeVisible();
  await expect(page.locator('#project-title')).toHaveText(`Proj ${w}`);
  await page.goBack();
  await openSearch(page);
  await field.fill('');
  await page.getByRole('button', { name: 'Clear recent searches' }).click();
  await expect(page.locator('#search .td-search-h').filter({ hasText: 'Recent searches' })).toHaveCount(0);
});

// Search is a page pushed from Browse (Back returns to Browse); Settings > Navigation bar can also put it on the bar, where it is a
// tab (no Back). Both routes open the same page.
test('Search can be switched onto the tab bar; off it, Browse pushes it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const tab = page.locator('.ui-tabbar [data-tab-id="search"]');
  await expect(tab).toHaveAttribute('data-off-bar', '');

  await openSearch(page);
  await expect(page.locator('.ui-bar-back')).toBeVisible();
  await page.locator('.ui-bar-back').click();
  await expect(page.locator('#browse-page')).toBeVisible();

  await openSettings(page, 'Navigation bar');
  await page.getByRole('switch', { name: 'On the tab bar: Search' }).click();
  await expect(tab).not.toHaveAttribute('data-off-bar', '');
  await openTab(page, 'search');
  await expect(page.locator('#search-page')).toBeVisible();
  await expect(page.locator('#search-text')).toBeFocused();
  await expect(page.locator('.ui-bar-back')).toBeHidden();

  // on the bar, Browse has no Search row of its own
  await openTab(page, 'browse');
  await expect(page.locator('#browse .td-browse-row').filter({ hasText: /^Search/ })).toHaveCount(0);
});

test('"/" opens Search with the field focused, off the bar and as a tab; typed in a field it is just a character', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await openTab(page, 'inbox');
  await page.keyboard.press('/');
  await expect(page.locator('#search-page')).toBeVisible();
  await expect(page.locator('#search-text')).toBeFocused();
  await expect(page.locator('#search-text')).toHaveValue('');
  // in the field it types
  await page.keyboard.press('/');
  await expect(page.locator('#search-text')).toHaveValue('/');
  await page.locator('.ui-bar-back').click();

  await openSettings(page, 'Navigation bar');
  await page.getByRole('switch', { name: 'On the tab bar: Search' }).click();
  await openTab(page, 'inbox');
  await page.keyboard.press('/');
  await expect(page.locator('#search-page')).toBeVisible();
  await expect(page.locator('#search-text')).toBeFocused();
  await expect(page.locator('.ui-bar-back')).toBeHidden();
});
