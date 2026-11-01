// Quick add: the words that set a date, priority, project, section, label or repeat are marked as typed and fill the
// chips; Enter adds and keeps the sheet open; a chip's x leaves the words as text; # suggests projects; an unsent name
// is kept; two pasted lines become two tasks once asked. The sheet passes axe.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, today, db } from './fixtures.mjs';

const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
const task = async title => (await db.list('spaces/_/tasks')).find(d => d.title === title);
const name = '#add-sheet .td-add-title';
/** @param {import('@playwright/test').Page} page */
const openAdd = async page => {
  await page.locator('#fab').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  // the date libraries are in (the words they read are marked)
  await page.waitForFunction(() => performance.getEntriesByType('resource').some(e => /chrono\.js/.test(e.name)), null, { timeout: 15_000 });
};

test('typed words mark a date, a time and a priority, fill the chips, and the task gets them', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await openAdd(page);
  const t = uniq('dry cleaning');
  await page.fill(name, `${t} p1 tomorrow 4 pm`);
  await expect(page.locator('#add-sheet .td-hl')).toHaveCount(2);
  await expect(page.locator('#add-sheet .td-hl').first()).toHaveText('p1');
  await expect(page.locator('#add-sheet .td-chip-main[aria-label^="Date"]')).toHaveAttribute('aria-label', /Tomorrow 4:00 PM/);
  await expect(page.locator('#add-sheet .td-chip-main[aria-label^="Priority"]')).toHaveAttribute('aria-label', 'Priority: P1');
  await expect(page.locator('#add-sheet .td-send')).toBeEnabled();
  expect(await AxeBuilder(page)).toEqual([]);
  await page.press(name, 'Enter');
  await expect(page.locator(name)).toHaveValue('');
  await expect(page.locator('#add-sheet .td-send')).toBeDisabled();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await expect.poll(async () => { const d = await task(t); return d && [d.priority, d.due?.date, d.due?.time]; }, { timeout: 15_000 })
    .toEqual([1, day(1), '16:00']);
});

test('a repeat, a label and a project by name; # suggests the projects', async ({ phone }) => {
  const page = await phone();
  const pname = uniq('Errands Home').replace(/-/g, ' ');
  await db.put(`spaces/_/projects/${uniq('p')}`, { name: pname, color: 'blue', parentId: null, order: 50, view: 'list', createdAt: Date.now(), updatedAt: Date.now() });
  await signIn(page, 'member');
  await synced(page);
  await openAdd(page);
  const t = uniq('standup');
  await page.locator(name).pressSequentially(`${t} every monday @meet #${pname.slice(0, 4)}`);
  const pick = page.locator('#add-sheet .td-suggest-item').filter({ hasText: pname });
  await expect(pick).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
  await pick.click();
  await expect(page.locator(name)).toHaveValue(`${t} every monday @meet #${pname} `);
  await expect(page.locator('#add-sheet .td-hl')).toHaveCount(3);
  await expect(page.locator('#add-sheet .td-chip-repeat')).toBeVisible();
  await expect(page.locator('#add-sheet .td-add-place')).toContainText(pname);
  await page.press(name, 'Enter');
  await expect.poll(async () => { const d = await task(t); return d && [d.due?.rrule, d.labels, typeof d.projectId === 'string' && d.projectId !== 'inbox']; }, { timeout: 15_000 })
    .toEqual(['FREQ=WEEKLY;BYDAY=MO', ['meet'], true]);
});

test('a chip\'s x leaves the words as plain text; the draft is kept; two pasted lines become two tasks', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await openAdd(page);
  const t = uniq('call');
  await page.fill(name, `${t} p2`);
  await expect(page.locator('#add-sheet .td-hl')).toHaveCount(1);
  await page.locator('#add-sheet .td-chip-x[aria-label="Clear priority"]').click();
  await expect(page.locator('#add-sheet .td-hl')).toHaveCount(0);
  await expect(page.locator('#add-sheet .td-chip-main[aria-label^="Priority"]')).toHaveAttribute('aria-label', 'Priority');
  // closed and opened again: the draft is there
  await page.keyboard.press('Escape');
  await expect(page.locator('#add-sheet')).toBeHidden();
  await openAdd(page);
  await expect(page.locator(name)).toHaveValue(`${t} p2`);
  await page.press(name, 'Enter');
  await expect.poll(async () => (await task(`${t} p2`))?.priority, { timeout: 15_000 }).toBe(4);

  const a = uniq('line a'), b = uniq('line b');
  await page.locator(name).focus();
  await page.evaluate(([a, b]) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', `${a}\n${b} p3\n`);
    document.querySelector('#add-sheet .td-add-title')?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [a, b]);
  await expect(page.getByRole('dialog', { name: 'Add tasks' })).toBeVisible();
  await page.getByRole('button', { name: 'Add 2' }).click();
  await expect.poll(async () => [(await task(a))?.priority, (await task(b))?.priority], { timeout: 15_000 }).toEqual([4, 3]);
});
