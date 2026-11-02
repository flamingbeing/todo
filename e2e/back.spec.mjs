// Back with tabs: switching tabs adds at most one Back step; Back on another tab goes to the Home view (Today unless set
// in Settings > General), Back there asks once, then leaves the app.
import { test, expect, signIn, openTab, openSearch, openSettings, APP } from './fixtures.mjs';

test('tabs A -> B -> C add at most one Back step; Back goes Home, then (asked once) out of the app', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await expect(page.locator('#today-page')).toBeVisible();
  const start = await page.evaluate(() => history.length);
  const appUrl = page.url();

  await openTab(page, 'upcoming');
  await openSearch(page);
  await openTab(page, 'browse');
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(start + 1);

  await page.goBack();
  await expect(page.locator('#today-page')).toBeVisible();   // Home: Today, though Inbox is the first tab on the bar
  expect(page.url()).toBe(appUrl);

  await page.goBack();   // the first Back on Home asks, the second within 2 s leaves
  await expect(page.getByText('Press Back again to close')).toBeVisible();
  expect(page.url()).toBe(appUrl);
  await page.goBack();
  await expect.poll(() => page.url()).not.toBe(appUrl);
});

test('Back from Inbox, Upcoming and Browse each goes Home (Today)', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  for (const name of ['inbox', 'upcoming', 'browse']) {
    await openTab(page, name);
    await page.goBack();
    await expect(page.locator('#today-page')).toBeVisible();
    await expect(page.locator(`#${name}-page`)).toBeHidden();
  }
});

test('with Home view set to Upcoming the app opens there and Back comes back to it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openSettings(page, 'General');
  await page.locator('#settings-host select').filter({ has: page.locator('option', { hasText: 'Upcoming' }) }).selectOption({ label: 'Upcoming' });
  expect(await page.evaluate(() => localStorage.getItem('td-home'))).toBe('upcoming');
  await page.goto('about:blank');   // (a new visit: a reload keeps the Settings page's history step)
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#upcoming-page')).toBeVisible();
  await expect(page.locator('#today-page')).toBeHidden();
  await openTab(page, 'inbox');
  await page.goBack();
  await expect(page.locator('#upcoming-page')).toBeVisible();   // Home is Upcoming now
  await page.goBack();
  await expect(page.getByText('Press Back again to close')).toBeVisible();
});

test('a Settings page hides the tab bar, and Back leaves it for Browse, with the tab bar back', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openSettings(page, 'General');
  await expect(page.locator('.ui-tabbar')).toBeHidden();
  await expect(async () => {   // (Back from the page to Settings' menu, then out of Settings)
    if (!(await page.locator('.ui-tabbar').isVisible())) await page.locator('.ui-bar-back:visible').first().click();
    await expect(page.locator('.ui-tabbar')).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 10_000 });
  await page.locator('.ui-tabbar [data-tab-id="upcoming"]').click();
  await expect(page.locator('#upcoming-page')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#settings-host')).toBeHidden();
});
