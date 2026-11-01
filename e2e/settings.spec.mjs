// @core/settings on the sample Settings sheet: a device value stays on this device, an account value reaches the
// account's other devices, the settings file drops what it should not carry, and the open sheet passes axe.
import { test, expect, signIn, signInAgain, synced, openSettings, openToday, openTab } from './fixtures.mjs';
import AxeBuilder from './axe.mjs';

const open = (page, title = 'Tasks') => openSettings(page, title);
const big = page => page.getByRole('switch', { name: /Larger rows/ });
const count = page => page.getByRole('switch', { name: /Show task counts/ });
// the Inbox row's count on Browse (drawn once Browse has opened; it follows the option from then on)
const shown = page => page.locator('#browse .td-browse-row', { hasText: 'Inbox' }).locator('.td-browse-count');
const browse = async page => { await page.evaluate(() => window.starter.add('counted')); await openTab(page, 'browse'); };
const note = page => page.locator('.ui-settings-status');

test('a device value stays on this device; an account value reaches the other one', async ({ phone }) => {
  const a = await phone();
  const { email } = await signIn(a, 'member');
  await synced(a);
  await browse(a);
  await open(a);
  await big(a).check();
  await count(a).check();
  await openToday(a);
  await expect(a.locator('.ui-screens')).toHaveClass(/big/);
  await expect(shown(a)).toHaveCount(1);
  await synced(a);

  const b = await phone();
  await signInAgain(b, email);
  await browse(b);
  await expect(shown(b)).toHaveCount(1);                       // the account's option arrived
  await expect(b.locator('.ui-screens')).not.toHaveClass(/big/);        // this device's did not
  await open(b);
  await expect(big(b)).not.toBeChecked();
  await expect(count(b)).toBeChecked();

  // and a change on b comes back to a without a reload
  await count(b).uncheck();
  await expect(shown(a)).toHaveCount(0, { timeout: 15_000 });
  await expect(a.locator('.ui-screens')).toHaveClass(/big/);
});

test('the device value survives sign-out and a reload', async ({ phone }) => {
  const a = await phone();
  const { email } = await signIn(a, 'member');
  await open(a);
  await big(a).check();
  await openSettings(a);
  await a.click('#sign-out');
  await openToday(a);
  await expect(a.locator('#signed-out')).toBeVisible();
  await a.reload({ waitUntil: 'domcontentloaded' });
  await expect(a.locator('#signed-out')).toBeVisible();
  await a.evaluate(e => window.starter.signInAs(e), email);
  await expect(a.locator('#list-view')).toBeVisible();
  await expect(a.locator('.ui-screens')).toHaveClass(/big/);
});

test('a settings file: exported, imported on another account, bad keys dropped', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  await synced(a);
  await open(a);
  await count(a).check();
  await open(a, 'Settings file');
  const [download] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'Export' }).click()]);
  const file = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
  expect(file.kind).toBe('core-settings');
  expect(file.settings).toEqual({ showCounts: true });             // the device option stays behind

  const b = await phone();
  await signIn(b, 'member');
  await synced(b);
  await open(b);
  const bad = { ...file, settings: { ...file.settings, bigRows: true, nope: 1 } };
  await b.setInputFiles('.ui-settings input[type=file]', { name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(note(b)).toContainText('Imported: 1 change, 2 left out');
  await expect(count(b)).toBeChecked();
  await expect(big(b)).not.toBeChecked();
  await b.setInputFiles('.ui-settings input[type=file]', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
  await expect(note(b)).toContainText('not JSON');
  await expect(count(b)).toBeChecked();
});

test('the Settings page passes axe', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  await openSettings(a);
  expect(await AxeBuilder(a)).toEqual([]);   // the menu
  await open(a);
  expect(await AxeBuilder(a)).toEqual([]);   // a page
});

test('a direct switch from one account to another follows the new account\'s settings', async ({ phone }) => {
  const b = await phone();
  const { email } = await signIn(b, 'member');   // account B, on its own phone
  const a = await phone();
  await signIn(a, 'member');                      // account A
  await synced(a);
  // straight from A to B, no sign-out in between
  await a.evaluate(e => window.starter.signInAs(e), email);
  await expect.poll(() => a.locator('#uid').textContent()).not.toBe('');
  await expect(a.locator('#list-view')).toBeVisible();
  await expect.poll(() => a.evaluate(() => window.starter.ready)).toBe(true);
  await browse(a);
  await expect(shown(a)).toHaveCount(0);
  // B's change on its other phone reaches a without a reload
  await open(b);
  await count(b).check();
  await openToday(b);
  await synced(b);
  await expect(shown(a)).toHaveCount(1, { timeout: 15_000 });
});

test('Settings > About offers "Install this app" as a button, (a tap shows how, nothing prompts unasked)', async ({ phone }) => {
  const a = await phone();
  await signIn(a, 'member');
  await open(a, 'About');
  const row = a.locator('#settings-host .ui-setting').filter({ hasText: 'Install this app' });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Install this app' })).toBeVisible();
  // no browser prompt kept here, so a tap says how to install from the browser's menu
  await row.getByRole('button', { name: 'Install this app' }).click();
  await expect(a.locator('dialog[open]')).toContainText(/Add to Home screen|Install app/i);
});

test('Settings > About: the Install row is hidden when the app already runs installed (standalone)', async ({ phone }) => {
  const a = await phone();
  await a.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await signIn(a, 'member');
  await open(a, 'About');
  await expect(a.locator('#settings-host .ui-setting').filter({ hasText: /Version|About|Account/ }).first()).toBeVisible();
  await expect(a.locator('#settings-host .ui-setting').filter({ hasText: 'Install this app' })).toHaveCount(0);
  await expect(a.getByRole('button', { name: 'Install this app' })).toHaveCount(0);
});

test('no install banner, dialog or prompt on load; the browser\'s offer is kept for the Settings row', async ({ phone }) => {
  const a = await phone();
  await a.addInitScript(() => { window.__prompted = 0; addEventListener('beforeinstallprompt', e => { e.prompt = () => { window.__prompted++; return Promise.resolve(); }; }, true); });
  await signIn(a, 'member');
  await synced(a);
  // the browser offers installing: the page stops the mini-infobar and keeps the event
  const held = await a.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    window.dispatchEvent(e);
    return { prevented: e.defaultPrevented, kept: globalThis.coreInstallPrompt === e };
  });
  expect(held).toEqual({ prevented: true, kept: true });
  await expect(a.locator('dialog[open]')).toHaveCount(0);
  await expect(a.locator('text=/install/i >> visible=true')).toHaveCount(0);   // (the Settings row is built but its page is not shown)
  expect(await a.evaluate(() => window.__prompted)).toBe(0);
  // only a tap on the Settings row asks
  await open(a, 'About');
  await a.getByRole('button', { name: 'Install this app' }).click();
  expect(await a.evaluate(() => window.__prompted)).toBe(1);
});
