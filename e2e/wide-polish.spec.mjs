// The wide boards, the table, Upcoming and the keyboard ring (840 px and up: board.js + wide.css, wide/table.js,
// ui/week-strip.js's week buttons): board columns 260 wide with an "Add section" ghost at a project's end, the table's
// head and a row opening the task, Upcoming's seven days with a week back, on and Today, and a 2 px accent ring on
// whatever Tab reaches. Each passes axe. At 390 px the Display sheet and the board are the phone's.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, space, today } from './fixtures.mjs';

const now = () => ({ createdAt: Date.now(), updatedAt: Date.now() });
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
const task = (title, extra) => db.put(`${space()}/tasks/${title}`, { title, order: Date.now(), priority: 4, done: false, ...now(), ...extra });
const box = (loc) => loc.evaluate(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; });

/** a board project with two sections, and tasks: one overdue, two today (one in the project), one next week */
async function seed(page) {
  await signIn(page, 'member');
  const pid = uniq('p'), name = uniq('Trip').replace(/-/g, ' ');
  await db.put(`${space()}/projects/${pid}`, { name, color: 'orange', parentId: null, view: 'board', order: Date.now(), ...now() });
  await db.put(`${space()}/sections/${uniq('s')}`, { name: 'To book', projectId: pid, order: 1, collapsed: false, ...now() });
  await db.put(`${space()}/sections/${uniq('s')}`, { name: 'To pack', projectId: pid, order: 2, collapsed: false, ...now() });
  const late = uniq('late'), due = uniq('due'), trip = uniq('trip');
  await task(late, { projectId: 'inbox', due: { date: day(-1) }, priority: 1 });
  await task(due, { projectId: 'inbox', due: { date: day(0) }, labels: [] });
  await task(trip, { projectId: pid, due: { date: day(0) } });
  await task(uniq('later'), { projectId: 'inbox', due: { date: day(8) } });
  await synced(page);
  const wideReady = await page.evaluate(() => document.documentElement.hasAttribute('data-wide-ready'));
  return { pid, name, late, due, trip, wideReady };
}
/** Display's card (840 px and up): picks a layout tile, then closes the card */
async function layout(page, name) {
  await page.locator('#display-btn').click();
  const pop = page.locator('#display-pop');
  await expect(pop).toBeVisible();
  await pop.getByRole('radio', { name }).click();
  await expect(pop.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
}

test('wide boards: Today\'s columns 260 wide, Overdue\'s Reschedule, a project\'s "Add section" ghost, axe', async ({ sized }) => {
  const page = await sized(1280, { mouse: true });
  const s = await seed(page);
  await expect(page.locator('#today-page')).toBeVisible();
  await layout(page, 'Board');
  const cols = page.locator('#today.td-board > .td-col');
  await expect(cols.first()).toBeVisible();
  expect((await box(cols.first())).w).toBe(260);
  const gap = (await box(cols.nth(1))).x - ((await box(cols.first())).x + 260);
  expect(Math.abs(gap - 33)).toBeLessThanOrEqual(1);
  await expect(cols.first().locator('.td-col-head .td-resched')).toHaveText('Reschedule');
  expect(await AxeBuilder(page)).toEqual([]);

  test.skip(!s.wideReady, 'needs app-ui rc.97: runs after the pin bump');
  await page.locator('#side .td-side-row').filter({ hasText: new RegExp(`^${s.name}`) }).first().click();
  await expect(page.locator('#project.td-board')).toBeVisible();
  const ghost = page.locator('#project .td-col-new .td-add-section');
  await expect(ghost).toBeVisible();
  const g = await box(page.locator('#project .td-col-new'));
  expect(g.w).toBe(258);
  expect((await box(ghost)).h).toBe(40);
  expect(await AxeBuilder(page)).toEqual([]);
});

test('the table: its head (Task, Date, Priority, Project, Labels), chips, a row opens the task, axe', async ({ sized }) => {
  const page = await sized(1280, { mouse: true });
  const s = await seed(page);
  await layout(page, 'Table');
  const table = page.locator('#today .td-table');
  await expect(table).toBeVisible();
  await expect(table.locator('thead th')).toHaveText(['Task', 'Date', 'Priority', 'Project', 'Labels']);
  expect((await box(table.locator('thead tr'))).h).toBe(40);
  const row = table.locator('tr.td-trow').filter({ hasText: s.late });
  expect((await box(row)).h).toBe(48);
  await expect(row.locator('.td-date')).toHaveAttribute('data-tone', 'overdue');
  await expect(row.locator('.td-tchip-pri')).toHaveText('P1');
  await expect(table.locator('.td-tgroup-head').first()).toContainText('Overdue');
  expect(await AxeBuilder(page)).toEqual([]);
  // (the whole row opens the task)
  await row.locator('td').last().click();
  await expect(page.locator('#task-sheet')).toBeVisible();
  await expect(page.locator('#task-sheet .td-task-title')).toHaveValue(s.late);
  await page.keyboard.press('Escape');
  await expect(page.locator('#task-sheet')).toBeHidden();
  // the row's "…": the task's menu
  await row.hover();
  await row.locator('.td-tmore').click();
  await expect(page.getByRole('menuitem').first()).toBeVisible();
  await page.keyboard.press('Escape');
});

test('Upcoming at 1280: seven days, a week on and back, Today; the ring on Tab; axe', async ({ sized }) => {
  const page = await sized(1280, { mouse: true });
  await seed(page);
  await page.locator('.ui-tab[data-tab-page="#upcoming-page"]:visible, #side [data-side="upcoming"]:visible').first().click();
  await expect(page.locator('#upcoming-page')).toBeVisible();
  const strip = page.locator('#upcoming-strip');
  await expect(strip.locator('.td-week > .td-wday')).toHaveCount(7);
  const back = strip.getByRole('button', { name: 'Previous week' });
  await expect(back).toBeDisabled();
  const first = await strip.locator('.td-week > .td-wday').first().getAttribute('data-day');
  await strip.getByRole('button', { name: 'Next week' }).click();
  await expect(strip.locator('.td-week > .td-wday').first()).not.toHaveAttribute('data-day', String(first));
  await expect(back).toBeEnabled();
  await strip.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(strip.locator('.td-week > .td-wday').first()).toHaveAttribute('data-day', String(first));
  expect(await AxeBuilder(page)).toEqual([]);

  // the keyboard's ring: 2 px in the accent, 2 px out
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => { const e = document.activeElement, c = e && getComputedStyle(e); return c ? [c.outlineStyle, c.outlineWidth, c.outlineOffset] : []; });
  expect(ring).toEqual(['solid', '2px', '2px']);
});

test('at 390 px Display is the sheet, and a board is the phone\'s (272 wide columns), no week buttons', async ({ sized }) => {
  const page = await sized(390);
  await seed(page);
  await page.locator('#display-btn').click();
  await expect(page.locator('#display-sheet')).toBeVisible();
  await expect(page.locator('#display-pop')).toHaveCount(0);
  await expect(page.locator('#display-sheet .td-layout')).toHaveText(['List', 'Board', 'Calendar']);
  await page.locator('#display-sheet .td-layout').nth(1).click();
  await page.locator('#display-sheet .td-display-save').click();
  await expect(page.locator('#display-sheet')).toBeHidden();
  const col = page.locator('#today.td-board > .td-col').first();
  await expect(col).toBeVisible();
  expect((await box(col)).w).toBe(272);
  await expect(page.locator('#display-btn .td-display-words')).toHaveCount(0);
  await expect(page.locator('#today .td-resched')).toHaveCount(0);
  await page.locator('.ui-tab[data-tab-page="#upcoming-page"]').first().click();
  await expect(page.locator('#upcoming-strip .td-strip-nav')).toBeHidden();
});
