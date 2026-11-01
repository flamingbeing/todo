// Labels: Browse > Filters & Labels adds one (name, colour, favourite); the task sheet's Labels row and quick add's
// "…" pick them (or make one there); a label's page lists its tasks; select mode adds or takes one off several tasks
// at once; a favourite shows in Browse. The screen, the sheet and the picker pass axe.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, openTab, gesturesReady } from './fixtures.mjs';

const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { projectId: 'inbox', order: Date.now(), priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });
const get = id => db.get(`spaces/_/tasks/${id}`);
const labelsNamed = async name => (await db.list('spaces/_/labels')).filter(d => d.name === name);
const openFL = async page => {
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: 'Filters & Labels' }).click();
  await expect(page.locator('#filters-page')).toBeVisible();
};

test('a label made in Filters & Labels, picked in the task sheet, its page, a favourite in Browse', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const name = uniq('lab').replace(/-/g, '_'), t = uniq('lab-task');
  await put(t, { title: t });
  await synced(page);
  await openFL(page);
  await expect(page.locator('#filters .td-fl-name')).toHaveText(['Filters', 'Labels']);
  expect(await AxeBuilder(page)).toEqual([]);
  await page.getByRole('button', { name: 'Add label' }).click();
  const sheet = page.locator('#edit-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('textbox', { name: 'Label name' }).fill(name);
  await sheet.locator('.td-switch-row input').check();
  expect(await AxeBuilder(page)).toEqual([]);
  await sheet.getByRole('button', { name: 'Add' }).click();
  await expect(sheet).toBeHidden();
  // (Add opens its page)
  await expect(page.locator('#place-page')).toBeVisible();
  await expect(page.locator('#place-title')).toHaveText(name);
  await expect.poll(async () => (await labelsNamed(name)).map(l => l.favorite)).toEqual([true]);

  // the task sheet: Labels, a tick
  await openTab(page, 'inbox');
  await page.locator(`#inbox .td-row[data-id="${t}"] .td-row-main`).click();
  const ts = page.locator('#task-sheet');
  await expect(ts).toBeVisible();
  await ts.getByRole('button', { name: /^Labels/ }).click();
  const pick = page.locator('#pick-sheet');
  await expect(pick).toBeVisible();
  await pick.getByRole('searchbox', { name: 'Find or create a label' }).fill(name.slice(0, 8));
  await pick.getByRole('checkbox', { name }).click();
  await expect(pick.getByRole('checkbox', { name })).toHaveAttribute('aria-checked', 'true');
  expect(await AxeBuilder(page)).toEqual([]);
  await pick.getByRole('button', { name: 'Done' }).click();
  await expect.poll(async () => (await get(t))?.labels?.length).toBe(1);
  const id = (await get(t)).labels[0];
  // (the new label and the task are separate saves: either can reach the server first)
  await expect.poll(async () => (await db.get(`spaces/_/labels/${id}`))?.name, { timeout: 15_000 }).toBe(name);
  await page.keyboard.press('Escape');
  await expect(ts).toBeHidden();

  // Browse: the favourite, and its page with the task
  await openTab(page, 'browse');
  const fav = page.locator('#browse').getByRole('button', { name: new RegExp(`^${name}`) });
  await expect(fav).toBeVisible();
  await fav.click();
  await expect(page.locator('#place-page')).toBeVisible();
  await expect(page.locator(`#place .td-row[data-id="${t}"]`)).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
});

test('quick add\'s "…" > Labels makes one, and select mode puts a label on several tasks with one Undo', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const name = uniq('qa').replace(/-/g, '_'), title = uniq('qa-task');
  await synced(page);
  await openTab(page, 'inbox');
  await page.locator('#fab').click();
  const add = page.locator('#add-sheet');
  await expect(add).toBeVisible();
  await add.locator('.td-add-title').fill(title);
  await add.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Labels' }).click();
  const pick = page.locator('#pick-sheet');
  await expect(pick).toBeVisible();
  await pick.getByRole('searchbox').fill(name);
  await pick.getByRole('button', { name: `Create label “${name}”` }).click();
  await expect(pick.getByRole('checkbox', { name })).toHaveAttribute('aria-checked', 'true');
  await pick.getByRole('button', { name: 'Done' }).click();
  await expect(pick).toBeHidden();
  await add.locator('.td-add-title').press('Enter');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await db.list('spaces/_/tasks')).find(d => d.title === title)?.labels?.length, { timeout: 15_000 }).toBe(1);
  const [made] = await labelsNamed(name);
  expect(made).toBeTruthy();

  // select mode: two tasks, Labels, the new one on both
  const a = uniq('bl-a'), b = uniq('bl-b');
  await put(a, { title: a });
  await put(b, { title: b });
  await gesturesReady(page);
  await expect(page.locator(`#inbox .td-row[data-id="${b}"]`)).toBeVisible();
  await page.locator('#more-btn').click();
  await page.getByRole('menuitem', { name: 'Select tasks' }).click();
  await page.locator(`#inbox .td-row[data-id="${a}"] .td-row-main`).click();
  await page.locator(`#inbox .td-row[data-id="${b}"] .td-row-main`).click();
  await page.locator('.td-select-bar').getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Labels' }).click();
  await expect(pick).toBeVisible();
  await pick.getByRole('searchbox').fill(name);
  await pick.getByRole('checkbox', { name }).click();
  await pick.getByRole('button', { name: 'Done' }).click();
  await expect.poll(async () => [(await get(a))?.labels?.length, (await get(b))?.labels?.length], { timeout: 15_000 }).toEqual([1, 1]);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => [(await get(a))?.labels?.length ?? 0, (await get(b))?.labels?.length ?? 0], { timeout: 15_000 }).toEqual([0, 0]);
});
