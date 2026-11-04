// The wide list pages (840 px and up, app/src/wide/list.js, wide/hover.js + wide.css): the big title at the column's left
// (Today's "n tasks" under it, a project's "My Projects /" over it), flat rows (the ring at the column's left, a hairline
// from it), group heads (Overdue's Reschedule), an inline "Add task" opening quick add for its place, and a mouse's row
// buttons (Date, Comment, More; a grip). A touch screen gets none of the buttons; under 840 px none of it shows.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, space, today } from './fixtures.mjs';

const now = () => ({ createdAt: Date.now(), updatedAt: Date.now() });
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
const task = (title, extra) => db.put(`${space()}/tasks/${title}`, { title, order: Date.now(), priority: 4, done: false, ...now(), ...extra });
const box = (loc) => loc.evaluate(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });

/** a parent project, a child with a section, and tasks: two today (one in the child), one overdue */
async function seed(page) {
  await signIn(page, 'member');
  const top = uniq('p'), pid = uniq('p'), sid = uniq('s'), topName = uniq('Home').replace(/-/g, ' '), name = uniq('Chores').replace(/-/g, ' ');
  await db.put(`${space()}/projects/${top}`, { name: topName, color: 'blue', parentId: null, view: 'list', order: Date.now(), ...now() });
  await db.put(`${space()}/projects/${pid}`, { name, color: 'green', parentId: top, view: 'list', order: Date.now(), ...now() });
  await db.put(`${space()}/sections/${sid}`, { name: 'Weekly', projectId: pid, order: 1, collapsed: false, ...now() });
  const late = uniq('late'), due = uniq('due');
  await task(late, { projectId: 'inbox', due: { date: day(-1) } });
  await task(due, { projectId: 'inbox', due: { date: day(0) }, priority: 1 });
  await task(uniq('chore'), { projectId: pid, due: { date: day(0) } });
  await task(uniq('weekly'), { projectId: pid, sectionId: sid });
  await synced(page);
  const wideReady = await page.evaluate(() => document.documentElement.hasAttribute('data-wide-ready'));
  return { pid, name, topName, late, due, wideReady };
}

test('wide Today, Inbox and a project: the title, the count, flat rows, Reschedule, the crumbs, inline Add task, axe', async ({ sized }) => {
  const page = await sized(1280);
  const s = await seed(page);
  await page.locator('#side [data-side="today"]').click();
  await expect(page.locator('#today-page')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-td-list-top', '');

  // the title: big, at the column's left (where the rows start); the bar shows no title
  const title = page.locator('#today-title');
  await expect(title).toHaveCSS('font-size', '26px');
  await expect(title).toHaveCSS('font-weight', '700');
  await expect(page.locator('.ui-bar-title')).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('.td-wide-count')).toHaveText(/^3 tasks$/);
  await expect(page.locator('.td-wide-count')).toHaveCSS('font-size', '13px');
  const row = page.locator('#today .td-row').filter({ hasText: s.due });
  const t = await box(title), check = await box(row.locator('.td-check')), r = await box(row);
  expect(Math.abs(t.x - check.x)).toBeLessThanOrEqual(1);
  expect(check.w).toBe(18);
  // the row's words 30 px right of the ring; its hairline from the ring to the end
  expect((await box(row.locator('.td-title'))).x - check.x).toBe(30);
  await expect(row.locator('.td-title')).toHaveCSS('font-size', '14px');
  const hair = await row.evaluate(e => { const a = getComputedStyle(e, '::after'); return { left: parseFloat(a.left), w: a.borderBottomWidth }; });
  expect(r.x + hair.left).toBe(check.x);
  expect(hair.w).toBe('1px');
  await expect(row.locator('.td-check')).toHaveCSS('border-top-width', '1px');

  // Overdue: its head with Reschedule at the right, bold, in the accent
  const resched = page.locator('#today .td-resched');
  await expect(resched).toBeVisible();
  await expect(resched).toHaveCSS('font-size', '14px');
  await expect(resched).toHaveCSS('font-weight', '700');
  const head = await box(page.locator('#today .td-group-head').first());
  expect(Math.abs((await box(resched)).x + (await box(resched)).w - (head.x + head.w))).toBeLessThanOrEqual(1);

  // inline Add task at the day's end: quick add for today, in the Inbox
  const add = page.locator('#today .td-wide-add');
  await expect(add).toHaveCount(1);
  await add.click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await expect(page.locator('#add-sheet .td-add-place')).toContainText('Inbox');
  await expect(page.locator('#add-sheet')).toContainText('Today');
  await page.keyboard.press('Escape');
  await expect(page.locator('#add-sheet')).toBeHidden();
  expect(await AxeBuilder(page)).toEqual([]);

  // the Inbox: its title the same; Add task after its tasks
  await page.locator('#side [data-side="inbox"]').click();
  await expect(page.locator('#inbox-page')).toBeVisible();
  await expect(page.locator('#inbox-title')).toHaveCSS('font-size', '26px');
  await expect(page.locator('#inbox .td-wide-add')).toHaveCount(1);
  await expect(page.locator('.td-wide-count')).toBeHidden();

  // a project: "My Projects / <parent> /" over its title; Add task after the loose tasks opens quick add in the project
  await page.locator(`#side [data-side="project:${s.pid}"]`).click();
  await expect(page.locator('#project-page')).toBeVisible();
  await expect(page.locator('.td-wide-crumb')).toHaveText(`My Projects / ${s.topName} /`);
  await expect(page.locator('.td-wide-crumb')).toHaveCSS('font-size', '13px');
  expect((await box(page.locator('.td-wide-crumb'))).y).toBeLessThan((await box(page.locator('#project-title'))).y);
  await expect(page.locator('#project-title')).toHaveCSS('font-size', '26px');
  const padd = page.locator('#project > .td-wide-add');
  await expect(padd).toHaveCount(1);
  await padd.click();
  await expect(page.locator('#add-sheet .td-add-place')).toContainText(s.name);
  await page.keyboard.press('Escape');
  await expect(page.locator('#add-sheet')).toBeHidden();
  // the section keeps its own (one each, no second)
  await expect(page.locator('#project .td-section .td-add-row')).toHaveCount(1);
  expect(await AxeBuilder(page)).toEqual([]);

  test.skip(!s.wideReady, 'needs app-ui rc.93: runs after the pin bump');
  // app-ui's frame: no + button (the side bar's Add task), the column 800 at most
  await expect(page.locator('#fab')).toBeHidden();
  expect((await box(page.locator('#project-page'))).w).toBeLessThanOrEqual(800);
});

test('a mouse over a row: Date, Comment and More at its right, a grip at its left; Date opens the scheduler', async ({ sized }) => {
  const page = await sized(1280, { mouse: true });
  const s = await seed(page);
  await page.locator('#side [data-side="today"]').click();
  const row = page.locator('#today .td-row').filter({ hasText: s.due });
  await row.locator('.td-title').hover();
  const acts = row.locator('.td-hover-actions > button');
  await expect(acts).toHaveCount(3);
  await expect(acts.nth(0)).toBeVisible();
  expect(await acts.evaluateAll(b => b.map(x => x.getAttribute('aria-label')))).toEqual(['Date', 'Comment', 'More actions']);
  expect((await box(acts.nth(0))).w).toBe(28);
  await expect(row.locator('.td-grip')).toBeVisible();
  expect((await box(row.locator('.td-grip'))).x).toBeLessThan((await box(row.locator('.td-check'))).x);
  expect(await AxeBuilder(page)).toEqual([]);
  await acts.nth(0).click();
  await expect(page.locator('#schedule-sheet')).toBeVisible();
  await page.keyboard.press('Escape');

  // More: the row's menu
  await row.locator('.td-title').hover();
  await acts.nth(2).click();
  await expect(page.getByRole('menuitem', { name: 'Schedule' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('a touch screen at 1280 gets no row buttons', async ({ sized }) => {
  const page = await sized(1280);
  const s = await seed(page);
  await page.locator('#side [data-side="today"]').click();
  const row = page.locator('#today .td-row').filter({ hasText: s.due });
  await row.locator('.td-title').tap();
  await page.keyboard.press('Escape');
  await expect(page.locator('.td-hover-actions')).toHaveCount(0);
});

test('at 390 px the lists are the phone\'s: no row buttons, no inline Add task, the title not 26 px', async ({ sized }) => {
  const page = await sized(390);
  await seed(page);
  await expect(page.locator('#today-page')).toBeVisible();
  await expect(page.locator('.td-hover-actions, .td-wide-add, .td-wide-count:not([hidden])')).toHaveCount(0);
  await expect(page.locator('#today-title')).not.toHaveCSS('font-size', '26px');
  await expect(page.locator('html')).not.toHaveAttribute('data-td-list-top', '');
});
