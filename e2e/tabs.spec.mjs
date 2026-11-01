// Arrange tabs (Settings, Tab bar; @core/ui tabArranger): a tab taken off the bar is listed at the top of the Settings
// menu, one tap away, and stays off after a reload (the tabs option, this device).
import { test, expect, APP, openSettings } from './fixtures.mjs';

test('a tab taken off the bar is one tap away in Settings and stays off', async ({ phone }) => {
  const page = await phone();
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  const search = page.locator('.ui-tabbar [data-tab-id="search"]');
  await expect(search).toBeVisible();

  await openSettings(page, 'Tab bar');
  await expect(page.getByRole('switch', { name: 'On the tab bar: Browse' })).toBeDisabled();   // Browse (and Settings in it) stays
  await page.getByRole('switch', { name: 'On the tab bar: Search' }).click();
  await expect(search).toHaveAttribute('data-off-bar', '');
  await expect(search).toBeHidden();

  await page.locator('#settings-host .ui-settings-back:visible').click();
  const off = page.locator('#settings-host .ui-settings-top').getByRole('button', { name: 'Search' });
  await off.click();
  await expect(page.locator('#search-page')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.ui-tabbar [data-tab-id="search"]')).toHaveAttribute('data-off-bar', '');
});
