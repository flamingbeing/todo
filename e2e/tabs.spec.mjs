// Arrange tabs (Settings, Tab bar; @core/ui tabArranger): a tab taken off the bar is listed in Browse's top card, one tap
// away (the Settings menu has no list of its own, like the reference), and stays off after a reload (the tabs option, this device).
import { test, expect, APP, openSettings, openTab, settingsBack, signIn, synced, gesturesReady, fingers, finger, steps, boxOf } from './fixtures.mjs';

test('a tab taken off the bar is one tap away in Browse and stays off', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const search = page.locator('.ui-tabbar [data-tab-id="upcoming"]');
  await expect(search).toBeVisible();
  // the current tab's icon sits in a 56 x 32 pill
  const pill = page.locator('.ui-tabbar .ui-tab[aria-current="page"] .ui-tab-icon');
  await expect.poll(() => pill.evaluate(e => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)])).toEqual([56, 32]);

  await openSettings(page, 'Navigation bar');
  await expect(page.getByRole('switch', { name: 'On the tab bar: Browse' })).toBeDisabled();   // Browse (and Settings in it) stays
  await page.getByRole('switch', { name: 'On the tab bar: Upcoming' }).click();
  await expect(search).toHaveAttribute('data-off-bar', '');
  await expect(search).toBeHidden();

  await settingsBack(page);
  await expect(page.locator('#settings-host .ui-settings-top')).toHaveCount(0);
  await openTab(page, 'browse');
  await page.locator('#browse .td-browse-card').first().locator('.td-browse-label', { hasText: 'Upcoming' }).click();
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

test('the app opts in to the tab dip, the sheet bar fade, the keyboard bar fade and the held press', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await expect(page.locator('html')).toHaveAttribute('data-slide', 'dip');
  await expect(page.locator('html')).toHaveAttribute('data-sheet-bar', 'fade');
  await expect(page.locator('html')).toHaveAttribute('data-keyboard-bar', 'fade');
  await expect(page.locator('html')).toHaveAttribute('data-ripple', 'hold');
  // a tab tap switches the page (dip mode, like the reference)
  await page.locator('.ui-tabbar [data-tab-id="upcoming"]').click();
  await expect(page.locator('#upcoming-page')).toBeVisible();
  await expect(page.locator('.ui-tabbar [data-tab-id="upcoming"]')).toHaveAttribute('aria-current', 'page');
});
