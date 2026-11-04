// Display: a list's grouping, order and direction, and whether done tasks show, are kept for that list on this
// device: they hold after a reload, another list keeps its own, and another device sees the list as it was. The
// sheet passes axe. Deadline groups and sorts too.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, openTab, today, space, signInAgain } from './fixtures.mjs';

const now = () => ({ createdAt: Date.now(), updatedAt: Date.now() });

async function openProject(page, name) {
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.locator('#project-page')).toBeVisible();
}
async function display(page) {
  await page.locator('#display-btn').click();
  const sheet = page.locator('#display-sheet');
  await expect(sheet).toBeVisible();
  return sheet;
}
const choose = async (page, sheet, row, value) => {
  await sheet.getByRole('button', { name: new RegExp(`^${row}`) }).click();
  await page.locator('#pick-sheet').getByRole('option', { name: value, exact: true }).click();
  await expect(page.locator('#pick-sheet')).toBeHidden();
};

test('grouping by priority, by name descending, done tasks shown: kept per list, on this device only', async ({ phone }) => {
  const page = await phone();
  const { email } = await signIn(page, 'member');
  const pid = uniq('dp'), name = uniq('Disp'), u = uniq('x');
  await db.put(`${space()}/projects/${pid}`, { name, color: 'blue', parentId: null, view: 'list', order: Date.now(), ...now() });
  const task = (title, priority, order, done = false) => db.put(`${space()}/tasks/${uniq('t')}`, { title, projectId: pid, order, priority, done, ...(done ? { doneAt: Date.now() } : {}), ...now() });
  await task(`B ${u}`, 1, 1);
  await task(`A ${u}`, 3, 2);
  await task(`C ${u}`, 1, 3);
  await task(`D ${u}`, 1, 4, true);
  await synced(page);
  await openProject(page, name);
  await expect(page.locator('#project .td-title')).toHaveText([`B ${u}`, `A ${u}`, `C ${u}`]);
  await expect(page.locator('#display-btn')).not.toHaveClass(/has-dot/);   // (the dot: this list's view is not the plain one)
  const sheet = await display(page);
  await expect(sheet.getByRole('button', { name: /^Grouping/ })).toContainText('None');
  expect(await AxeBuilder(page)).toEqual([]);
  await choose(page, sheet, 'Grouping', 'Priority');
  await choose(page, sheet, 'Sorting', 'Name');
  await choose(page, sheet, 'Direction', 'Descending');
  await sheet.locator('.td-display-done input').check();
  await sheet.getByRole('button', { name: /^(Done|Save)$/ }).click();
  const want = async p => {
    await expect(p.locator('#project .td-group-title')).toHaveText(['Priority 1', 'Priority 3']);
    await expect(p.locator('#project .td-group').nth(0).locator('.td-title')).toHaveText([`C ${u}`, `B ${u}`, `D ${u}`]);
    await expect(p.locator('#project .td-row.is-complete .td-title')).toHaveText(`D ${u}`);
  };
  await want(page);
  await expect(page.locator('#display-btn')).toHaveClass(/has-dot/);
  await page.reload();
  await expect(page.locator('#list-view')).toBeVisible();
  await synced(page);
  await openProject(page, name);
  await want(page);
  // the line over the list: what is applied, and Reset (grouping and order back; done tasks still shown)
  const line = page.locator('#project-page .td-applied');
  await expect(line).toHaveText(/Sorted by name, descending · Grouped by priority/);
  expect(await AxeBuilder(page)).toEqual([]);
  await line.getByRole('button', { name: /^Reset/ }).click();
  await expect(line).toHaveCount(0);
  await expect(page.locator('#project .td-group-title')).toHaveCount(0);
  await expect(page.locator('#project .td-title')).toHaveText([`B ${u}`, `A ${u}`, `C ${u}`, `D ${u}`]);

  // Today keeps its own
  await openTab(page, 'today');
  const today = await display(page);
  await expect(today.getByRole('button', { name: /^Grouping/ })).toContainText('Date');
  await expect(today.getByRole('button', { name: /^Sorting/ })).toContainText('Manual');
  await page.keyboard.press('Escape');

  // another device of the same person: the list as it was
  const other = await phone();
  await signInAgain(other, email);
  await synced(other);
  await openProject(other, name);
  await expect(other.locator('#project .td-title')).toHaveText([`B ${u}`, `A ${u}`, `C ${u}`]);
  await expect(other.locator('#project .td-group-title')).toHaveCount(0);
});

test('Today and the Inbox offer List, Board and Calendar; Calendar is kept for that list on this device', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  for (const tab of ['today', 'inbox']) {
    await openTab(page, tab);
    const sheet = await display(page);
    const layouts = sheet.getByRole('radiogroup', { name: 'Layout' }).getByRole('radio');
    await expect(layouts).toHaveText(['List', 'Board', 'Calendar']);
    await expect(sheet.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
    expect(await AxeBuilder(page)).toEqual([]);
    await sheet.getByRole('radio', { name: 'Calendar' }).click();
    await expect(sheet.getByRole('radio', { name: 'Calendar' })).toHaveAttribute('aria-checked', 'true');
    // Today is its day (no Agenda, Week or Month); the Inbox has all three
    const layoutRow = sheet.getByRole('button', { name: /^Layout/ });
    if (tab === 'today') await expect(layoutRow).toHaveCount(0);
    else {
      // the Layout row opens its own small sheet: Agenda, N-day and Month, radio dots, a left title, no X
      await layoutRow.click();
      const pick = page.locator('#pick-sheet');
      await expect(pick.getByRole('option')).toHaveText([/^Agenda$/, /^\d-day$/, /^Month$/]);
      await expect(pick.getByRole('button', { name: 'Close' })).toHaveCount(0);
      await pick.getByRole('option').nth(2).click();
      await expect(layoutRow).toContainText('Month');
    }
    await expect(sheet.locator('.td-display-done')).toBeVisible();
    await sheet.getByRole('button', { name: /^(Done|Save)$/ }).click();
    await expect(page.locator(`#${tab}-page .td-cv`)).toBeVisible();
  }
  await page.reload();
  await expect(page.locator('#list-view')).toBeVisible();
  await synced(page);
  await openTab(page, 'inbox');
  await expect(page.locator('#inbox-page .td-cv')).toBeVisible();
  await openTab(page, 'today');
  await expect(page.locator('#today-page .td-cv-head')).toHaveCount(1);
});

test('grouping and sorting by deadline: Overdue, each day, No deadline; nearest first', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const pid = uniq('dl'), name = uniq('Dead'), u = uniq('x');
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
  await db.put(`${space()}/projects/${pid}`, { name, color: 'red', parentId: null, view: 'list', order: Date.now(), ...now() });
  const task = (title, order, deadline) => db.put(`${space()}/tasks/${uniq('t')}`, { title, projectId: pid, order, priority: 4, done: false, ...(deadline ? { deadline } : {}), ...now() });
  await task(`A ${u}`, 1, day(5));
  await task(`B ${u}`, 2);
  await task(`C ${u}`, 3, day(-3));
  await task(`D ${u}`, 4, day(5));
  await task(`E ${u}`, 5, day(2));
  await synced(page);
  await openProject(page, name);
  let sheet = await display(page);
  await choose(page, sheet, 'Sorting', 'Deadline');
  await sheet.getByRole('button', { name: /^(Done|Save)$/ }).click();
  await expect(page.locator('#project .td-title')).toHaveText([`C ${u}`, `E ${u}`, `A ${u}`, `D ${u}`, `B ${u}`]);
  sheet = await display(page);
  await choose(page, sheet, 'Grouping', 'Deadline');
  expect(await AxeBuilder(page)).toEqual([]);
  await sheet.getByRole('button', { name: /^(Done|Save)$/ }).click();
  await expect(page.locator('#project .td-group-title')).toHaveCount(4);
  await expect(page.locator('#project .td-group-title').first()).toHaveText('Overdue');
  await expect(page.locator('#project .td-group-title').last()).toHaveText('No deadline');
  await expect(page.locator('#project .td-group').nth(2).locator('.td-title')).toHaveText([`A ${u}`, `D ${u}`]);
});

test('840 px and up: Display is a card under its button (right edges lined up), a choice is kept at once, "Display: n", Reset all', async ({ sized }) => {
  const page = await sized(1280, { mouse: true });
  await signIn(page, 'member');
  await synced(page);
  await expect(page.locator('#today-page')).toBeVisible();
  const btn = page.locator('#display-btn');
  await btn.click();
  const pop = page.locator('#display-pop');
  await expect(pop).toBeVisible();
  await expect(page.locator('#display-sheet')).toBeHidden();
  await page.waitForTimeout(250);   // (the dialog's own fade in)
  const [b, p] = await Promise.all([btn, pop].map(l => l.evaluate(e => { const r = e.getBoundingClientRect(); return { right: r.right, top: r.top, bottom: r.bottom, w: /** @type {HTMLElement} */ (e).offsetWidth }; })));
  expect(Math.round(p.w)).toBe(300);
  expect(Math.abs(p.right - b.right)).toBeLessThanOrEqual(2);
  expect(p.top).toBeGreaterThanOrEqual(b.bottom);
  await expect(pop.getByRole('radio')).toHaveText(['List', 'Board', 'Table', 'Calendar']);
  expect(await AxeBuilder(page)).toEqual([]);
  // a choice is kept at once, with an orange dot on its row
  await pop.getByLabel('Sorting').selectOption('name');
  await expect(pop.locator('.td-pop-row').filter({ hasText: 'Sorting' }).locator('.td-pop-dot')).toHaveCount(1);
  await pop.getByRole('radio', { name: 'Table' }).click();
  await expect(page.locator('#today .td-table')).toBeVisible();
  const wideReady = await page.evaluate(() => document.documentElement.hasAttribute('data-wide-ready'));
  if (wideReady) await expect(btn).toHaveAccessibleName('Display: 2');
  await pop.getByRole('button', { name: 'Reset all' }).click();
  await expect(pop.locator('.td-pop-dot')).toHaveCount(0);
  await expect(pop.getByRole('button', { name: 'Reset all' })).toBeDisabled();
  await expect(page.locator('#today .td-table')).toHaveCount(0);
  if (wideReady) await expect(btn).toHaveAccessibleName('Display');
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
});
