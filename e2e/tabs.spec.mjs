// Arrange tabs (Settings, Tab bar; @core/ui tabArranger): a tab taken off the bar is listed at the top of the Settings
// menu, one tap away, and stays off after a reload (the tabs option, this device).
import { test, expect, APP, openSettings, settingsBack, signIn, synced, gesturesReady, fingers, finger, steps, boxOf } from './fixtures.mjs';

test('a tab taken off the bar is one tap away in Settings and stays off', async ({ phone }) => {
  const page = await phone();
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  const search = page.locator('.ui-tabbar [data-tab-id="upcoming"]');
  await expect(search).toBeVisible();

  await openSettings(page, 'Navigation bar');
  await expect(page.getByRole('switch', { name: 'On the tab bar: Browse' })).toBeDisabled();   // Browse (and Settings in it) stays
  await page.getByRole('switch', { name: 'On the tab bar: Upcoming' }).click();
  await expect(search).toHaveAttribute('data-off-bar', '');
  await expect(search).toBeHidden();

  await settingsBack(page);
  const off = page.locator('#settings-host .ui-settings-top').getByRole('button', { name: 'Upcoming' });
  await off.click();
  await expect(page.locator('#upcoming-page')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.ui-tabbar [data-tab-id="upcoming"]')).toHaveAttribute('data-off-bar', '');
});

// A long press (500 ms, with a tick) on the bar opens Settings > Navigation bar. A tap still switches tabs; a press that turns
// into a swipe, or is lifted early, opens nothing.
test('a long press on the tab bar opens Tab bar settings; a tap still switches tabs', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await gesturesReady(page);
  const at = async id => { const r = await boxOf(page, `.ui-tabbar [data-tab-id="${id}"]`); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const tabBarOpen = () => page.getByRole('switch', { name: 'On the tab bar: Browse' }).count();

  // a tap: the tab
  let [x, y] = await at('upcoming');
  await fingers(page, [[[x, y]]]);
  await expect(page.locator('#upcoming-page')).toBeVisible();
  expect(await tabBarOpen()).toBe(0);

  // lifted early, or a slow tap that turns into a swipe before 500 ms: nothing opens (timed in the page: a busy machine
  // can stretch a real touch's 250 ms, sent from here, past the 500)
  await finger(page, '.ui-tabbar [data-tab-id="upcoming"]', [], { hold: 250 });
  await finger(page, '.ui-tabbar [data-tab-id="upcoming"]', steps(60, 0, 6), { hold: 300 });
  await page.waitForTimeout(700);
  expect(await page.locator('#settings-host').isVisible()).toBe(false);

  // held: Settings > Navigation bar, and no tab switch from that lift
  [x, y] = await at('inbox');
  await fingers(page, [[[x, y]]], { hold: 700 });
  await expect(page.getByRole('switch', { name: 'On the tab bar: Browse' })).toBeVisible();
  await expect(page.locator('#inbox-page')).toBeHidden();
});

// A pushed Settings page hides the tab bar; Back (twice: page, menu) shows it again over Browse.
test('a pushed Settings page hides the tab bar until Back leaves Settings', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await openSettings(page, 'General');
  await expect(page.locator('.ui-tabbar')).toBeHidden();
  await expect(async () => {
    if (!(await page.locator('.ui-tabbar').isVisible())) await page.locator('.ui-bar-back:visible').first().click();
    await expect(page.locator('.ui-tabbar')).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 10_000 });
  await expect(page.locator('#settings-host')).toBeHidden();
});
