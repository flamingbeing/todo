// Quick add: the words that set a date, priority, project, section, label or repeat are marked as typed and fill the
// chips; Enter adds and keeps the sheet open; a chip's x leaves the words as text; # suggests projects; an unsent name
// is kept; two pasted lines become two tasks once asked. The sheet passes axe. "for 45 min" sets a duration. A day picked
// in the Date sheet is written into the name as words, # opens the My Projects card above the sheet, the + menu stacks
// upward with Reminders, and the send button is grey until the name has text.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, today, db, space } from './fixtures.mjs';

const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return today(d); };
const task = async title => (await db.list(`${space()}/tasks`)).find(d => d.title === title);
const name = '#add-sheet .td-add-title';
/** @param {import('@playwright/test').Page} page */
const openAdd = async page => {
  await page.locator('#fab').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.evaluate(() => Promise.all(document.getElementById('add-sheet').getAnimations().map(a => a.finished)));   // (the card grows from the add button: measure it once settled)
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
  await signIn(page, 'member');
  await db.put(`${space()}/projects/${uniq('p')}`, { name: pname, color: 'blue', parentId: null, order: 50, view: 'list', createdAt: Date.now(), updatedAt: Date.now() });
  await synced(page);
  await openAdd(page);
  const t = uniq('standup');
  await page.locator(name).pressSequentially(`${t} every monday @meet #${pname.slice(0, 4)}`);
  const pick = page.locator('#add-sheet .td-suggest-item').filter({ hasText: pname });
  await expect(page.locator('#add-sheet .td-suggest-head')).toHaveText('My Projects');
  await expect(pick).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
  await pick.click();
  await expect(page.locator(name)).toHaveValue(`${t} every monday @meet #${pname} `);
  await expect(page.locator('#add-sheet .td-hl')).toHaveCount(3);
  await expect(page.locator('#add-sheet .td-chip-repeat')).toBeVisible();
  await expect(page.locator('#add-sheet .td-add-place')).toContainText(pname);
  await page.press(name, 'Enter');
  // (a task keeps its label's id; the label "meet" is made if it isn't there yet)
  await expect.poll(async () => {
    const d = await task(t);
    const names = d ? await Promise.all((d.labels ?? []).map(async id => (await db.get(`${space()}/labels/${id}`))?.name)) : [];
    return d && [d.due?.rrule, names, typeof d.projectId === 'string' && d.projectId !== 'inbox'];
  }, { timeout: 15_000 }).toEqual(['FREQ=WEEKLY;BYDAY=MO', ['meet'], true]);
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
  await expect(page.locator('#add-sheet .td-chip-main[aria-label^="Priority"]')).toBeHidden();
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

test('"for 45 min" is marked, shows the Duration chip, and the task gets the minutes; the chip menu changes them', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await openAdd(page);
  const t = uniq('plumber');
  await page.fill(name, `${t} today 3 pm for 45 min`);
  await expect(page.locator('#add-sheet .td-hl[data-kind="duration"]')).toHaveText('for 45 min');
  const chip = page.locator('#add-sheet .td-chip-main[aria-label^="Duration"]');
  await expect(chip).toHaveAttribute('aria-label', 'Duration: 45 min');
  expect(await AxeBuilder(page)).toEqual([]);
  await page.press(name, 'Enter');
  await expect.poll(async () => { const d = await task(t); return d && [d.duration, d.due?.time]; }, { timeout: 15_000 }).toEqual([45, '15:00']);

  // set from the chip menu: the words stay text
  const u = uniq('walk');
  await page.fill(name, `${u} today 7 am for 1 hour`);
  await expect(chip).toHaveAttribute('aria-label', 'Duration: 1 h');
  await chip.click();
  await page.getByRole('menuitemradio', { name: '30 min', exact: true }).or(page.getByRole('menuitem', { name: '30 min', exact: true })).click();
  await expect(chip).toHaveAttribute('aria-label', 'Duration: 30 min');
  await expect(page.locator('#add-sheet .td-hl[data-kind="duration"]')).toHaveCount(0);
  await page.press(name, 'Enter');
  await expect.poll(async () => (await task(`${u} for 1 hour`))?.duration, { timeout: 15_000 }).toBe(30);
});

test('a day picked in the Date sheet is written into the name; the + menu; Inbox from the # card; a grey send', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await openAdd(page);
  const add = page.locator('#add-sheet');
  // the description is not there until the + menu offers it; the send button is grey and disabled with no name
  await expect(add.locator('.td-add-desc')).toBeHidden();
  await expect(add.locator('.td-send')).toBeDisabled();
  const t = uniq('write');
  await page.fill(name, t);
  await expect(add.locator('.td-send')).toBeEnabled();
  await add.locator('.td-chip-main[aria-label^="Date"]').click();
  const sheet = page.locator('#schedule-sheet');
  await expect(sheet).toBeVisible();
  await sheet.locator(`.td-cal-day[data-day="${day(9)}"]`).click();
  await sheet.locator('.td-sched-save').click();
  // the date's words lead the name, marked, and the chip has no x
  const words = await page.locator(name).inputValue();
  expect(words.endsWith(` ${t}`)).toBe(true);
  await expect(add.locator('.td-hl')).toHaveCount(1);
  await expect(add.locator('.td-chip-x[aria-label="Clear date"]')).toBeHidden();
  // editing the words changes the date: taking them away leaves the page's own date
  await page.fill(name, t);
  await expect(add.locator('.td-hl')).toHaveCount(0);
  // the + menu: Description, Priority, Reminders, Labels, Deadline, Duration, then Customize Quick Add (no ticks), above the +
  await add.locator('.td-chip-plus').click();
  await expect(page.getByRole('menuitem')).toHaveText(['Description', 'Priority', 'Reminders', 'Labels', 'Deadline', 'Duration', 'Customize Quick Add']);
  const plusBox = await add.locator('.td-chip-plus').boundingBox(), menuBox = await page.getByRole('menu').boundingBox();
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(plusBox.y + 1);
  await page.getByRole('menuitem', { name: 'Description' }).click();
  await expect(add.locator('.td-add-desc')).toBeVisible();
  await expect(add.locator('.td-add-desc')).toBeFocused();
  // # opens the card above the sheet, Inbox first
  await page.locator(name).pressSequentially(' #');
  const card = add.locator('.td-suggest.is-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.td-suggest-item').first()).toHaveText('Inbox');
  const c = await card.boundingBox(), a = await add.boundingBox();
  expect(c.y + c.height).toBeLessThanOrEqual(a.y);
});

test('a reminder set from the + menu is saved with the task', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await openAdd(page);
  const t = uniq('remind');
  await page.fill(name, `${t} tomorrow 4 pm`);
  await page.locator('#add-sheet .td-chip-plus').click();
  await page.getByRole('menuitem', { name: 'Reminders' }).click();
  await page.getByRole('menuitemradio', { name: '30 minutes before' }).click();
  await expect(page.locator('#add-sheet .td-chip-main[aria-label^="Reminders"]')).toHaveAttribute('aria-label', 'Reminders: 30m');
  await page.press(name, 'Enter');
  await expect.poll(async () => (await task(t))?.reminders, { timeout: 15_000 }).toEqual([30]);
});

test('the layout: a compact card, + / project / Date in one row with a round send; chips appear once set; Customize opens Settings', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await openAdd(page);
  const add = page.locator('#add-sheet');
  // the card is compact (no description line): at most 72 px tall
  await expect.poll(async () => (await add.boundingBox()).height).toBeLessThanOrEqual(72);
  // the row: + , the project, the date (the page's own: Today); Priority, Reminders, Labels only once set
  await expect(add.locator('.td-chips > :visible')).toHaveCount(3);
  await expect(add.locator('.td-chips > .td-chip-plus')).toBeVisible();
  await expect(add.locator('.td-chips > .td-add-place')).toContainText('Inbox');
  await expect(add.locator('.td-chips .td-chip-main:visible')).toHaveText([/^(Today|Date)$/]);
  await expect(add.locator('.td-chip-main[aria-label^="Priority"]')).toBeHidden();
  const chip = await add.locator('.td-chip').first().boundingBox();
  expect(Math.round(chip.height)).toBe(30);
  // send: a round button at the right of the same row (28px, faint until the name has text)
  const send = add.locator('.td-add-row2 .td-send');
  await expect(send).toBeDisabled();
  expect(await send.evaluate(b => [getComputedStyle(b).width, getComputedStyle(b).opacity])).toEqual(['28px', '0.4']);
  await page.fill(name, 'Call mum tomorrow 5pm p1');
  await expect(send).toBeEnabled();
  await expect(add.locator('.td-chip-main[aria-label^="Priority"]')).toHaveAttribute('aria-label', 'Priority: P1');
  expect(await AxeBuilder(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await AxeBuilder(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: 'light' });
  // Customize Quick Add: the sheet closes (the name kept as a draft) and Settings > Quick Add opens
  await add.locator('.td-chip-plus').click();
  await page.getByRole('menuitem', { name: 'Customize Quick Add' }).click();
  await expect(add).toBeHidden();
  await expect(page.locator('#settings-page')).toBeVisible();
  await expect(page.getByText('Quick Add actions')).toBeVisible();
});

test('the tab bar and the add button fade out while the keyboard is up', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await expect(page.locator('html')).toHaveAttribute('data-keyboard-bar', 'fade');
  await page.evaluate(() => document.documentElement.classList.add('ui-keyboard-open'));
  await expect.poll(() => page.locator('.ui-tabbar').evaluate(e => getComputedStyle(e).opacity)).toBe('0');
  await page.evaluate(() => document.documentElement.classList.remove('ui-keyboard-open'));
  await expect.poll(() => page.locator('.ui-tabbar').evaluate(e => getComputedStyle(e).opacity)).toBe('1');
});
