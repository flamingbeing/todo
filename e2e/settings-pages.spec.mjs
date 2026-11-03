// The Settings pages of round 3: the menu's order and group headings, the Settings screen loaded only when it first
// opens, the Theme cards, the App icon list, the add button's place, the Navigation menu checklist, the days off, the
// automatic reminder, Notifications and the licences behind About.
import { test, expect, signIn, synced, openSettings, openTab, settingsBack, uniq, db } from './fixtures.mjs';

const menu = page => page.locator('#settings-host .ui-settings-menu-groups');
const go = page => menu(page).locator('.ui-settings-go:visible');

test('the menu: pages in order under their headings; the screen loads when Settings first opens', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  // nothing of the Settings screen is there before it opens
  await expect(page.locator('#settings-host')).toBeEmpty();
  await openSettings(page);
  await expect(go(page).first()).toBeVisible();
  const titles = (await go(page).allTextContents()).map(t => t.trim());
  const order = ['Account', 'General', 'Theme', 'App icon', 'Navigation bar', 'Navigation menu', 'Quick Add', 'Productivity', 'Reminders', 'Notifications'];
  const at = order.map(t => titles.findIndex(x => x.startsWith(t)));
  expect(at.every(i => i >= 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  await expect(menu(page).locator('.ui-settings-title')).toContainText(['Personalization', 'Productivity', 'More']);
  // the licences are not a menu row (they open from About)
  expect(titles.some(t => t.startsWith('Open source licences'))).toBe(false);
});

test('Theme cards pick a style and keep the kit\'s pickers in step; App icon swaps the page icon', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openSettings(page, 'Theme');
  const card = page.locator('.td-theme-card[data-preset="navy"]');
  await card.click();
  await expect(card).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#preset-pick')).toHaveValue('navy');
  await page.locator('.td-seg-btn[data-theme="dark"]').click();
  await expect(page.locator('#theme-pick')).toHaveValue('dark');
  await page.locator('#preset-pick').selectOption('default');
  await expect(page.locator('.td-theme-card[data-preset="default"]')).toHaveAttribute('aria-checked', 'true');

  await openSettings(page, 'App icon');
  await page.locator('.td-icon-row[data-icon="mint"]').click();
  await expect(page.locator('.td-icon-row[data-icon="mint"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', 'icons/variants/mint.svg');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', 'icons/variants/mint.png');
});

test('Navigation bar moves the add button; Navigation menu hides Browse rows, the tabs on the bar stay out', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await openSettings(page, 'Navigation bar');
  const right = await page.locator('#fab').boundingBox();
  await page.locator('.td-fab-place[data-place="left"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-fab', 'left');
  await settingsBack(page);

  await openSettings(page, 'Navigation menu');
  await expect(page.locator('.td-check[data-item="inbox"]')).toBeDisabled();
  await page.locator('.td-check[data-item="reporting"]').uncheck();
  await openTab(page, 'browse');
  await expect(page.locator('#browse').getByRole('button', { name: 'Reporting' })).toHaveCount(0);
  await expect(page.locator('#browse').getByRole('button', { name: 'Templates' })).toBeVisible();
  await expect(page.locator('#browse').getByRole('button', { name: 'Inbox', exact: true })).toHaveCount(0);
  const left = await page.locator('#fab').boundingBox();
  if (right && left) expect(left.x).toBeLessThan(right.x);

  await openSettings(page, 'Navigation menu');
  await page.locator('#settings-host .td-link-btn').click();   // Hide all
  await openTab(page, 'browse');
  await expect(page.locator('#browse').getByRole('button', { name: 'Search' })).toHaveCount(0);
  await expect(page.locator('#browse').getByRole('button', { name: 'Completed' })).toBeVisible();
});

test('Productivity days off, an automatic reminder on a timed task, Notifications and the licences', async ({ phone }) => {
  test.setTimeout(120_000);
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await openSettings(page, 'Productivity');
  const sat = page.locator('.td-day[data-day="6"]');
  await sat.click();
  await expect(sat).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#settings-host .td-day')).toHaveCount(7);

  await openSettings(page, 'Reminders');
  await page.getByRole('combobox', { name: /Send automatic reminders/ }).selectOption({ label: '30 minutes before' });
  await page.locator('#settings-host .td-info-row').click();
  await expect(page.locator('#settings-host .ui-settings-group:not([hidden])')).toContainText('Notify me');
  await expect(page.locator('#settings-host .td-notify-state')).not.toBeEmpty();

  const t = uniq('auto-rem');
  await openTab(page, 'today');
  await page.locator('#fab').click();
  await page.fill('#add-sheet .td-add-title', `${t} today 18:00`);
  await page.press('#add-sheet .td-add-title', 'Enter');
  await page.keyboard.press('Escape');
  await expect.poll(async () => {
    const all = await db.list('spaces/_/tasks');
    return all.find(x => x.title === t)?.reminders;
  }, { timeout: 15_000 }).toEqual([30]);

  await openSettings(page);
  await page.locator('#settings-host .ui-settings-go').filter({ hasText: /^About/ }).click();
  await page.locator('#settings-host .ui-about-extra').filter({ hasText: 'Open source licences' }).locator('.ui-about-row').click();
  await expect(page.locator('#settings-host .td-licence').first()).toContainText(/MIT|Permission|licen/i, { timeout: 10_000 });
});
