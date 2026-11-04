// The wide side bar (840 px and up, app/src/wide/side.js + wide.css): the person and the account menu, Add task, the
// places with their counts (Today's icon holds the day's number), My Projects; the page on top lights its row; Q opens
// quick add. Under 840 px (a phone, a narrow window) none of it loads and the side bar is as before. The parts that need
// app-ui rc.97's frame (the 280 px bar, its hide button) wait for the pin bump.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, space, today } from './fixtures.mjs';

const now = () => ({ createdAt: Date.now(), updatedAt: Date.now() });
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
const sideLoaded = page => page.evaluate(() => performance.getEntriesByType('resource').some(r => /\/wide\/side\.js/.test(r.name)));

test('the wide side bar: rows, counts, the day, the lit row, a project, Add task and Q, the account menu, axe', async ({ sized }) => {
  const page = await sized(1280);
  await signIn(page, 'member');
  const pid = uniq('p'), name = uniq('Proj');
  await db.put(`${space()}/projects/${pid}`, { name, color: 'blue', parentId: null, view: 'list', order: Date.now(), ...now() });
  const task = (title, extra) => db.put(`${space()}/tasks/${title}`, { title, order: Date.now(), priority: 4, done: false, ...now(), ...extra });
  await task(uniq('in1'), { projectId: 'inbox' });
  await task(uniq('in2'), { projectId: 'inbox', due: { date: day(0) } });
  await task(uniq('pr1'), { projectId: pid, due: { date: day(-1) } });
  await task(uniq('pr2'), { projectId: pid, due: { date: day(3) } });
  await synced(page);
  const wideReady = await page.evaluate(() => document.documentElement.hasAttribute('data-wide-ready'));

  const nav = page.locator('#side .td-side-nav');
  await expect(page.locator('#side')).toHaveAttribute('data-td-side', '');
  await expect(nav.locator(':scope > .td-side-row .td-side-label')).toHaveText(['Search', 'Inbox', 'Today', 'Upcoming', 'Filters & Labels', 'Reporting']);
  await expect(page.locator('#side .td-side-add')).toHaveText('Add task');
  await expect(page.locator('#side > a.ui-side-link').first()).toBeHidden();   // index.html's links give way
  await expect(nav.locator('.td-side-day .today-num')).toHaveText(String(new Date().getDate()));
  // counts: Inbox 2 (open, in the Inbox), Today 2 (due today or overdue); the project 2
  await expect(nav.locator('[data-side="inbox"] .ui-side-count')).toHaveText('2');
  await expect(nav.locator('[data-side="today"] .ui-side-count')).toHaveText('2');
  await expect(nav.locator(`[data-side="project:${pid}"] .ui-side-count`)).toHaveText('2');
  await expect(nav.locator('.td-side-group')).toHaveText('My Projects');

  // the lit row follows the page on top, in the selected tint
  await nav.locator('[data-side="today"]').click();
  await expect(page.locator('#today-page')).toBeVisible();
  const lit = nav.locator('[aria-current="page"]');
  await expect(lit).toHaveAttribute('data-side', 'today');
  await expect(lit).toHaveCSS('background-color', 'rgb(255, 239, 229)');
  await nav.locator('[data-side="upcoming"]').click();
  await expect(lit).toHaveAttribute('data-side', 'upcoming');

  // a project row opens its page and lights; My Projects folds (kept on this device)
  await nav.locator(`[data-side="project:${pid}"]`).click();
  await expect(page.locator('#project-page')).toBeVisible();
  await expect(lit).toHaveAttribute('data-side', `project:${pid}`);
  await nav.locator('.td-side-group').click();
  await expect(nav.locator('.td-side-group')).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.locator(`[data-side="project:${pid}"]`)).toHaveCount(0);
  await nav.locator('.td-side-group').click();
  await expect(nav.locator(`[data-side="project:${pid}"]`)).toBeVisible();

  // Add task and Q: quick add, as a card in the middle
  await page.locator('#side .td-side-add').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#add-sheet')).toBeHidden();
  await page.locator('body').click({ position: { x: 900, y: 400 } });
  await page.keyboard.press('q');
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#add-sheet')).toBeHidden();

  // the account menu: Settings, Sync with its time, Sign out, the version
  await page.locator('#side .td-side-me').click();
  const menu = page.locator('.td-side-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.ui-menu-item')).toHaveText([/^Settings/, /^Sync\s*(Synced|Not synced)/, /^Sign out/, /^Version/]);
  expect(await AxeBuilder(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  expect(await AxeBuilder(page)).toEqual([]);

  test.skip(!wideReady, 'needs app-ui rc.97: runs after the pin bump');
  // app-ui's frame: 280 px; its hide button hides it and the option sideHidden keeps that after a reload
  await expect.poll(() => page.locator('#side').evaluate(e => Math.round(e.getBoundingClientRect().width))).toBe(280);
  await page.locator('#side .ui-side-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-side-hidden', /.*/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-side-hidden', /.*/);
});

for (const width of [390, 700]) {
  test(`at ${width} px the wide rows never load and the side bar is as before`, async ({ sized }) => {
    const page = await sized(width);
    await signIn(page, 'member');
    await synced(page);
    await expect(page.locator('#side')).not.toHaveAttribute('data-td-side', '');
    await expect(page.locator('.td-side-nav, .td-side-me, .td-side-add')).toHaveCount(0);
    expect(await sideLoaded(page)).toBe(false);
    expect(await page.evaluate(() => [...document.styleSheets].some(s => /wide\.css$/.test(s.href ?? '') && matchMedia(s.media.mediaText).matches))).toBe(false);
  });
}
