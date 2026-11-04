// The wide dialogs (840 px and up): the task view as a dialog in the middle with two sides (wide/task-modal.js + the
// task sheet's own parts) and Settings as a dialog with a nav (wide/settings-modal.js). Under 840 px the task is still
// the bottom sheet and Settings the pushed screen.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, space, today } from './fixtures.mjs';

const now = () => ({ createdAt: Date.now(), updatedAt: Date.now() });
const task = (title, extra) => db.put(`${space()}/tasks/${title}`, { title, order: Date.now(), priority: 4, done: false, ...now(), ...extra });
const box = (loc) => loc.evaluate(e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
/** the ids of the rows the page shows, in order (not the ones in a dialog) */
const shownIds = page => page.evaluate(() => [...new Set([...document.querySelectorAll('.ui-screen:not([hidden]) li.td-row[data-id]')]
  .filter(li => li.getClientRects().length && !li.closest('dialog')).map(li => li.getAttribute('data-id')))]);

/** three tasks due today in the Inbox */
async function seed(page) {
  await signIn(page, 'member');
  const names = [uniq('alpha'), uniq('beta'), uniq('gamma')];
  for (const [i, n] of names.entries()) await task(n, { projectId: 'inbox', due: { date: today() }, order: i + 1 });
  await synced(page);
  const wideReady = await page.evaluate(() => document.documentElement.hasAttribute('data-wide-ready'));
  return { names, wideReady };
}
const rowOf = (page, title) => page.locator('.ui-screen:not([hidden]) li.td-row').filter({ hasText: title }).first();

/** opens Settings: the side bar's account menu (app-ui rc.97) or Browse's gear */
async function openSettings(page) {
  if (await page.locator('.td-side-me:visible').count()) {
    await page.locator('.td-side-me').click();
    await page.locator('.td-menu .ui-menu-item').filter({ hasText: /^Settings/ }).first().click();
  } else {
    await page.locator('.ui-tab[data-tab-page="#browse-page"]:visible').first().click();
    await page.locator('#browse-settings').click();
  }
}

test('wide task view: a dialog with two sides, next and previous, saves, the scheduler, the menu, Escape, Tab, axe', async ({ sized }) => {
  const page = await sized(1280, { mouse: true });
  const s = await seed(page);
  const [, beta] = s.names;
  await rowOf(page, beta).locator('.td-row-main').click();
  const sheet = page.locator('#task-sheet');
  await expect(sheet).toHaveAttribute('data-td-modal', '');
  await expect(sheet.locator('.td-task-title')).toHaveValue(beta);
  await page.waitForTimeout(200);   // (its 120 ms fade)

  // 860 wide, min(817, the window less 64) tall; the left side 600, the rail 260; the head 48
  const size = await box(sheet);
  expect(Math.abs(size.w - 860)).toBeLessThanOrEqual(4);
  expect(Math.abs(size.h - Math.min(817, 800 - 64))).toBeLessThanOrEqual(4);
  expect(Math.abs((await box(sheet.locator('.td-modal-rail'))).w - 260)).toBeLessThanOrEqual(4);
  expect(Math.abs((await box(sheet.locator('.td-modal-left'))).w - 600)).toBeLessThanOrEqual(4);
  expect((await box(sheet.locator('.td-sheet-head'))).h).toBe(48);
  await expect(sheet.locator('.td-rail-label')).toHaveText(['Project', 'Date', 'Deadline', 'Priority', 'Labels', 'Reminders']);
  await expect(sheet.locator('[data-rail="date"] .td-rail-value')).toHaveText(/^Today/);
  await expect(sheet.locator('[data-rail="labels"]')).toHaveAttribute('aria-label', 'Labels: add');
  expect(await AxeBuilder(page)).toEqual([]);

  // the tasks before and after it in the list it was opened from
  const ids = await shownIds(page);
  const at = ids.indexOf(beta);
  expect(at).toBeGreaterThanOrEqual(0);
  const next = sheet.getByRole('button', { name: 'Next task' }), prev = sheet.getByRole('button', { name: 'Previous task' });
  if (at < ids.length - 1) {
    await next.click();
    await expect(sheet.locator('.td-task-title')).toHaveValue(/** @type {string} */ (ids[at + 1]));
    await prev.click();
    await expect(sheet.locator('.td-task-title')).toHaveValue(beta);
  }
  // at the first one, Previous is off
  await page.keyboard.press('Escape');
  await expect(sheet).not.toBeVisible();
  await rowOf(page, /** @type {string} */ (ids[0])).locator('.td-row-main').click();
  await expect(sheet.locator('.td-task-title')).toHaveValue(/** @type {string} */ (ids[0]));
  await expect(prev).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(sheet).not.toBeVisible();

  // Escape closes it and the focus is back on its row
  await rowOf(page, beta).locator('.td-row-main').click();
  await expect(sheet).toHaveAttribute('data-td-modal', '');
  await page.keyboard.press('Escape');
  await expect(sheet).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('li.td-row')?.getAttribute('data-id'))).toBe(beta);

  // Tab stays inside the dialog
  await rowOf(page, beta).locator('.td-row-main').click();
  await expect(sheet).toHaveAttribute('data-td-modal', '');
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#task-sheet'))).toBe(true);
  }

  // the menu: a card with the day it was added on top, Delete at the end
  await sheet.getByRole('button', { name: 'More' }).click();
  const menu = page.locator('.td-modal-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.ui-menu-note')).toHaveText(/^Added on /);
  await expect(menu.locator('.ui-menu-item').filter({ hasText: 'Delete task' })).toContainText('Shift Delete');
  await expect(menu.locator('.ui-menu-item').filter({ hasText: 'Copy link to task' })).toBeVisible();
  expect(Math.abs((await box(menu)).w - 224)).toBeLessThanOrEqual(2);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // Date opens the scheduler
  await sheet.locator('[data-rail="date"]').click();
  await expect(page.locator('#schedule-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#schedule-sheet')).not.toBeVisible();
  await expect(sheet).toBeVisible();

  // a new title saves (and is there after a reload)
  const renamed = `${beta} renamed`;
  await sheet.locator('.td-task-title').fill(renamed);
  await sheet.locator('.td-task-title').press('Enter');
  await synced(page);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(rowOf(page, renamed)).toBeVisible();
});

test('wide Settings: a dialog with a nav, its search, a page, Escape, axe', async ({ sized }) => {
  const page = await sized(1280, { mouse: true });
  await seed(page);
  await openSettings(page);
  const modal = page.locator('#settings-modal');
  await expect(modal).toBeVisible();
  await page.waitForTimeout(200);
  const size = await box(modal);
  expect(Math.abs(size.w - 767)).toBeLessThanOrEqual(4);
  expect(Math.abs(size.h - Math.min(820, 800 - 64))).toBeLessThanOrEqual(4);
  expect(Math.abs((await box(modal.locator('.td-set-nav'))).w - 220)).toBeLessThanOrEqual(2);
  await expect(page.locator('#settings-page')).toBeHidden();
  const rows = modal.locator('.td-set-rows > li:not([hidden])');
  expect(await rows.count()).toBeGreaterThan(5);
  await expect(modal.locator('.td-set-row[aria-current="page"]')).toHaveCount(1);
  expect(await AxeBuilder(page)).toEqual([]);

  // the search keeps the pages holding every word typed
  await modal.getByRole('searchbox', { name: 'Search settings' }).fill('week start');
  await expect(rows.filter({ hasText: 'General' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Theme' })).toHaveCount(0);
  await modal.getByRole('searchbox', { name: 'Search settings' }).fill('');
  await expect(rows.filter({ hasText: 'Theme' })).toHaveCount(1);

  // a row shows its page under its title
  await modal.locator('.td-set-row').filter({ hasText: /^Theme$/ }).click();
  await expect(modal.locator('.td-set-title')).toHaveText('Theme');
  await expect(modal.locator('#settings-host section.ui-settings-group:not([hidden])')).toHaveCount(1);
  await expect(modal.locator('#settings-host section.ui-settings-group:not([hidden]) h2')).toHaveText('Theme');
  await expect(modal.locator('.td-set-row[aria-current="page"]')).toHaveText('Theme');
  expect(await AxeBuilder(page)).toEqual([]);

  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('#settings-modal'))).toBe(true);
  }

  // Escape closes it; the pages go back to the Settings screen
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  await expect(page.locator('#settings-page #settings-host')).toHaveCount(1);
});

test('under 840 px: the task is the bottom sheet, Settings the pushed screen', async ({ sized }) => {
  const page = await sized(390);
  const s = await seed(page);
  await rowOf(page, s.names[0]).locator('.td-row-main').click();
  const sheet = page.locator('#task-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).not.toHaveAttribute('data-td-modal', '');
  await expect(sheet.locator('.td-sheet-scroll')).toHaveCount(1);
  await expect(sheet.locator('.td-modal-rail')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet).not.toBeVisible();
  await page.locator('.ui-tab[data-tab-page="#browse-page"]').click();
  await page.locator('#browse-settings').click();
  await expect(page.locator('#settings-page')).toBeVisible();
  await expect(page.locator('#settings-modal')).toHaveCount(0);
});

test('narrowed below 840 px while open: the task goes on in the bottom sheet, Settings on its screen, nothing typed lost', async ({ sized }) => {
  const page = await sized(1280, { mouse: true });
  const s = await seed(page);
  await rowOf(page, s.names[1]).locator('.td-row-main').click();
  const sheet = page.locator('#task-sheet');
  await expect(sheet).toHaveAttribute('data-td-modal', '');
  await sheet.locator('.td-task-desc').fill('typed while wide');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sheet).not.toHaveAttribute('data-td-modal', '');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.td-sheet-scroll .td-task-desc')).toHaveValue('typed while wide');
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(sheet).toHaveAttribute('data-td-modal', '');
  await expect(sheet.locator('.td-modal-left .td-task-desc')).toHaveValue('typed while wide');
  await page.keyboard.press('Escape');
  await expect(sheet).not.toBeVisible();

  await openSettings(page);
  const modal = page.locator('#settings-modal');
  await modal.locator('.td-set-row').filter({ hasText: /^Theme$/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(modal).not.toBeVisible();
  await expect(page.locator('#settings-page')).toBeVisible();
  await expect(page.locator('#settings-title')).toHaveText('Theme');
});
