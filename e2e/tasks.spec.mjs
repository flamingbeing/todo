// The views and what moves a task between them: due days, no day, completing (with Undo) and Completed; the quick add,
// the task sheet's priority and subtasks; a new project with a section; Reschedule, which moves every overdue task (so
// this file's tests run one after another: an overdue task of one would be moved by another). Each view passes axe.
import AxeBuilder from './axe.mjs';
import { test, expect, clickOpens, signIn, synced, serverHas, uniq, today, openToday, openTab, db } from './fixtures.mjs';

const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { projectId: 'inbox', order: Date.now(), priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });
test.describe.configure({ mode: 'default' });
const row = (page, host, title) => page.locator(`${host} .td-row`).filter({ hasText: title });

test('a task shows on Today, Upcoming (under its day) or the Inbox by its date, and in Completed once done', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const [now, late, soon, none] = [uniq('now'), uniq('late'), uniq('soon'), uniq('none')];
  await put(now, { title: now, due: { date: day(0) } });
  await put(late, { title: late, due: { date: day(-2) } });
  await put(soon, { title: soon, due: { date: day(3) } });
  await put(none, { title: none });
  await expect(page.locator('#today')).toContainText(now);
  await expect(page.locator('#today')).toContainText(late);
  await expect(page.locator('#today')).not.toContainText(soon);
  await expect(row(page, '#today', late).locator('.td-date[data-tone="overdue"]')).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);

  await openTab(page, 'upcoming');
  await expect(page.locator(`#upcoming .td-day[data-day="${day(3)}"]`)).toContainText(soon);
  await expect(page.locator('#upcoming')).not.toContainText(none);
  expect(await AxeBuilder(page)).toEqual([]);

  await openTab(page, 'inbox');
  await expect(page.locator('#inbox')).toContainText(none);
  expect(await AxeBuilder(page)).toEqual([]);

  await openToday(page);
  await page.getByRole('checkbox', { name: `Complete: ${now}` }).click();
  await expect(page.locator('#today')).not.toContainText(now);
  await openTab(page, 'browse');
  expect(await AxeBuilder(page)).toEqual([]);
  await page.locator('#browse .td-browse-row', { hasText: 'Completed' }).click();
  await expect(page.locator('#completed')).toContainText(now);
  await page.getByRole('checkbox', { name: `Not done: ${now}` }).click();
  await expect(page.locator('#completed')).not.toContainText(now);
  await openToday(page);
  await expect(page.locator('#today')).toContainText(now);
});

test('completing shows Undo, which puts the task back', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('undo');
  await put(t, { title: t, due: { date: day(0) } });
  await page.getByRole('checkbox', { name: `Complete: ${t}` }).click();
  await expect(page.locator('#today')).not.toContainText(t);
  await page.locator('.toast').last().getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#today')).toContainText(t);
});

test('a repeating task ticked moves to its next date and opens its done subtasks again; Undo puts both back', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const [r, sub] = [uniq('weekly'), uniq('step')];
  await put(r, { title: r, due: { date: day(0), rrule: 'FREQ=WEEKLY', string: 'every week' } });
  await put(sub, { title: sub, parentId: r, done: true, doneAt: Date.now() });
  await page.getByRole('checkbox', { name: `Complete: ${r}` }).click();
  await expect(page.locator('#today')).not.toContainText(r);
  await expect.poll(async () => (await db.get(`spaces/_/tasks/${sub}`))?.done, { timeout: 15_000 }).toBe(false);
  // (the task's own save and its subtask's are separate writes: either can reach the server first)
  await expect.poll(async () => (await db.get(`spaces/_/tasks/${r}`))?.due?.date, { timeout: 15_000 }).toBe(day(7));
  await page.locator('.toast').last().getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#today')).toContainText(r);
  await expect.poll(async () => (await db.get(`spaces/_/tasks/${sub}`))?.done, { timeout: 15_000 }).toBe(true);
});

test('Reschedule on Overdue moves every overdue task to the day picked; Undo puts them back', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const [a, b] = [uniq('over-a'), uniq('over-b')];
  await put(a, { title: a, due: { date: day(-1) } });
  await put(b, { title: b, due: { date: day(-3), time: '09:00' } });
  await synced(page);
  await expect(page.locator('#today')).toContainText(a);
  await expect(page.locator('#today')).toContainText(b);
  const button = page.locator('#today .td-resched');
  await expect(button).toHaveText('Reschedule');
  expect(await AxeBuilder(page)).toEqual([]);
  await button.click();
  await expect(page.locator('#schedule-sheet')).toBeVisible();
  await page.locator('#schedule-sheet .td-sched-row').filter({ hasText: 'Tomorrow' }).click();
  await expect(page.locator('#schedule-sheet')).toBeHidden();
  const dueOf = async id => (await db.get(`spaces/_/tasks/${id}`))?.due;
  await expect.poll(() => dueOf(a), { timeout: 15_000 }).toEqual({ date: day(1) });
  await expect.poll(() => dueOf(b), { timeout: 15_000 }).toEqual({ date: day(1), time: '09:00' });
  await expect(page.locator('#today')).not.toContainText(a);
  await expect(page.locator('#today .td-resched')).toHaveCount(0);
  await page.locator('.toast').last().getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => dueOf(a), { timeout: 15_000 }).toEqual({ date: day(-1) });
  await expect.poll(() => dueOf(b), { timeout: 15_000 }).toEqual({ date: day(-3), time: '09:00' });
  await expect(page.locator('#today')).toContainText(a);
});

test('the + on Upcoming dates the new task for the day in sight; the sheet sets its priority and adds a subtask', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  const t = uniq('sheet'), sub = uniq('sub');
  await openTab(page, 'upcoming');
  await page.locator(`#upcoming-strip .td-wday[data-day="${day(1)}"]`).click();
  await expect(page.locator(`#upcoming-strip .td-wday[data-day="${day(1)}"]`)).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#fab').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
  await page.fill('#add-sheet .td-add-title', t);
  await page.press('#add-sheet .td-add-title', 'Enter');
  await page.keyboard.press('Escape');
  await expect(page.locator(`#upcoming .td-day[data-day="${day(1)}"]`)).toContainText(t);
  await serverHas(t);

  await clickOpens(row(page, '#upcoming', t).locator('.td-row-main'), page.locator('#task-sheet'));
  await page.locator('#task-sheet .td-attr-chips [aria-label^="Priority"]').click();
  await page.getByRole('menuitemradio', { name: 'Priority 1' }).click();
  await expect(row(page, '#upcoming', t)).toHaveAttribute('data-priority', '1');
  // "Add sub-task" opens quick add over the sheet (one add, then it closes and the sheet shows the new sub-task)
  await page.locator('#task-sheet .td-add-sub').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.fill('#add-sheet .td-add-title', sub);
  await page.press('#add-sheet .td-add-title', 'Enter');
  await expect(page.locator('#add-sheet')).toBeHidden();
  await expect(page.locator('#task-sheet')).toBeVisible();
  await expect(page.locator('#task-sheet .td-subtasks')).toContainText(sub);
  expect(await AxeBuilder(page)).toEqual([]);
  await expect.poll(async () => {
    const all = await db.list('spaces/_/tasks');
    return all.find(d => d.title === t)?.priority === 1 && all.some(d => d.title === sub && typeof d.parentId === 'string');
  }, { timeout: 15_000 }).toBe(true);
});

test('a new project from Browse opens on its page; a section and a task in it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  const name = uniq('proj'), sec = uniq('sec'), t = uniq('intask');
  await openTab(page, 'browse');
  await page.locator('#browse .td-browse-add').click();
  await expect(page.locator('#project-sheet')).toBeVisible();
  await page.fill('#project-sheet .td-project-name', name);
  await page.press('#project-sheet .td-project-name', 'Enter');
  await expect(page.locator('#project-page')).toBeVisible();
  await expect(page.locator('#project-title')).toHaveText(name);

  await page.locator('#more-btn').click();
  await page.getByRole('menuitem', { name: 'Add section' }).click();
  await page.fill('#section-name', sec);
  await page.press('#section-name', 'Enter');
  await expect(page.locator('#project-page')).toBeVisible();
  const section = page.locator('#project .td-section', { hasText: sec });
  await expect(section).toBeVisible();
  await section.locator('.td-add-row').click();
  await page.fill('#add-sheet .td-add-title', t);
  await page.press('#add-sheet .td-add-title', 'Enter');
  await page.keyboard.press('Escape');
  await expect(section).toContainText(t);
  expect(await AxeBuilder(page)).toEqual([]);
  await serverHas(t);
});

test('a start with nothing kept for Today: the early skeleton goes once the tasks arrive', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await page.evaluate(() => localStorage.setItem('app:last-list', '[]'));   // as after a visit with Today empty
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.starter.ready)).toBe(true);
  await expect(page.locator('#today-state .load-row')).toHaveCount(0);
  await expect(page.locator('#today-state')).not.toHaveAttribute('aria-busy', 'true');
});

test('the task sheet shows the words\' marks (bold, code, struck, a link to a new tab) until the field is tapped', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('md');
  await put(t, { title: `Read **${t}** guide`, description: 'Run `npm test`, ~~old~~ [notes](https://example.com/n) <b>x</b>', due: { date: day(0) } });
  await synced(page);
  await clickOpens(row(page, '#today', t).locator('.td-row-main'), page.locator('#task-sheet'));
  // the row: the marks too, a link's words underlined (the row is a button: no link inside)
  await expect(row(page, '#today', t).locator('.td-title strong')).toHaveText(t);
  await expect(row(page, '#today', t).locator('.td-title')).toHaveText(`Read ${t} guide`);
  const title = page.locator('#task-sheet .td-md-title'), desc = page.locator('#task-sheet .td-md-desc');
  await expect(title.locator('strong')).toHaveText(t);
  await expect(desc.locator('code')).toHaveText('npm test');
  await expect(desc.locator('s')).toHaveText('old');
  await expect(desc.locator('b')).toHaveCount(0);
  await expect(desc).toContainText('<b>x</b>');
  const link = desc.locator('a');
  await expect(link).toHaveAttribute('href', 'https://example.com/n');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  expect(await AxeBuilder(page)).toEqual([]);
  // tapped: the field as typed, marks and all
  await page.locator('#task-sheet .td-task-title').click();
  await expect(title).toBeHidden();
  await expect(page.locator('#task-sheet .td-task-title')).toHaveValue(`Read **${t}** guide`);
});

test('the sheet\'s Copy link gives #task=<id>, which opens that task\'s sheet when the app loads with it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('link');
  await put(t, { title: t, due: { date: day(0) } });
  await synced(page);
  await page.evaluate(() => { window.copied = ''; navigator.clipboard.writeText = async s => { window.copied = s; }; });
  await clickOpens(row(page, '#today', t).locator('.td-row-main'), page.locator('#task-sheet'));
  await page.locator('#task-sheet .td-sheet-more').click();
  await page.getByRole('menuitem', { name: 'Copy link' }).click();
  await expect.poll(() => page.evaluate(() => window.copied)).toMatch(new RegExp(`#task=${t}$`));
  const url = await page.evaluate(() => window.copied);
  // (a fresh load, as a link opened in a new tab: a goto that changes only the hash would not load the page again)
  await page.goto('about:blank');
  await page.goto(url.replace(/^https?:\/\/[^/]+/, ''), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#list-view')).toBeVisible();
  await expect(page.locator('#task-sheet')).toBeVisible();
  await expect(page.locator('#task-sheet .td-task-title')).toHaveValue(t);
  expect(await page.evaluate(() => location.hash)).not.toContain('task=');
});

test('the sheet\'s ••• menu: the added-on line, its rows in order, Move to… as a pill; Complete forever ends a repeating task', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const t = uniq('forever');
  await put(t, { title: t, due: { date: day(0), rrule: 'FREQ=DAILY' } });
  await synced(page);
  await clickOpens(row(page, '#today', t).locator('.td-row-main'), page.locator('#task-sheet'));
  // Move to… is a grey pill under the rows, not a menu row; the header has ••• and ×
  await expect(page.locator('#task-sheet .td-attr.is-chip').filter({ hasText: 'Move to…' })).toBeVisible();
  await expect(page.locator('#task-sheet [aria-label="Close"]')).toHaveCount(0);
  // the pills: one sideways-scrolling row, in order
  await expect(page.locator('#task-sheet .ui-scroll-x')).toHaveCount(1);
  await expect(page.locator('#task-sheet .ui-scroll-x > button')).toHaveText(['Description', 'Priority', 'Reminder', 'Labels', 'Deadline', 'Move to…']);
  const box = await page.locator('#task-sheet').boundingBox();
  const vh = page.viewportSize()?.height ?? 844;
  expect(box && box.height / vh).toBeGreaterThan(0.52);
  expect(box && box.height / vh).toBeLessThan(0.58);
  for (const scheme of ['light', 'dark']) { await page.emulateMedia({ colorScheme: scheme }); expect(await AxeBuilder(page)).toEqual([]); }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.locator('#task-sheet .td-sheet-more').click();
  await expect(page.locator('.ui-menu-note')).toContainText('Added on');
  await expect(page.locator('#task-sheet .ui-menu-panel')).toBeVisible();
  const mb = await page.locator('#task-sheet .ui-menu-panel').boundingBox();
  expect(mb && Math.abs(mb.y + mb.height - (page.viewportSize()?.height ?? 844))).toBeLessThan(2);
  await expect(page.getByRole('menuitem')).toHaveText(['Edit task', 'Duplicate task', 'Complete forever', 'Copy link to task', 'Hide completed sub-tasks',
    'View activity', 'Email to this task', 'Delete task']);
  expect(await AxeBuilder(page)).toEqual([]);
  await page.getByRole('menuitem', { name: 'Complete forever' }).click();
  await expect(page.locator('#task-sheet')).toBeHidden();
  await expect.poll(async () => { const d = await db.get(`spaces/_/tasks/${t}`); return [d?.done, d?.due?.rrule ?? null]; }, { timeout: 15_000 }).toEqual([true, null]);
  await expect(row(page, '#today', t)).toHaveCount(0);
});
