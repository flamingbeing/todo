// Templates (Browse > Manage projects): save a project with its sections and tasks as a template (dates cleared), make a new
// project from it, and delete the template. The sheets pass axe.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, today, openTab, space } from './fixtures.mjs';

const now = () => Date.now();

test('save a project as a template and make a new project from it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const name = uniq('plan'), pid = uniq('p'), sid = uniq('s'), t1 = uniq('step'), t2 = uniq('sub');
  await db.put(`${space()}/projects/${pid}`, { name, color: 'blue', parentId: null, order: now(), view: 'list', createdAt: now(), updatedAt: now() });
  await db.put(`${space()}/sections/${sid}`, { name: 'Phase one', projectId: pid, order: 1, createdAt: now(), updatedAt: now() });
  await db.put(`${space()}/tasks/${t1}`, { title: t1, projectId: pid, sectionId: sid, order: 1, priority: 2, done: false, due: { date: today() }, createdAt: now(), updatedAt: now() });
  await db.put(`${space()}/tasks/${t2}`, { title: t2, projectId: pid, sectionId: sid, parentId: t1, order: 1, priority: 4, done: false, createdAt: now(), updatedAt: now() });
  await synced(page);
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: 'Manage projects' }).click();
  const sheet = page.locator('#pick-sheet');
  await sheet.getByRole('button', { name: 'Save a project as a template' }).click();
  await sheet.getByRole('option', { name }).click();
  await expect.poll(async () => (await db.list(`${space()}/templates`)).find(d => d.name === name)?.tasks?.length, { timeout: 15_000 }).toBe(2);
  const saved = (await db.list(`${space()}/templates`)).find(d => d.name === name);
  expect(saved.sections).toEqual(['Phase one']);
  expect(saved.tasks.some(t => 'due' in t || 'deadline' in t || 'done' in t)).toBe(false);   // dates are cleared

  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: 'Manage projects' }).click();
  await sheet.getByRole('button', { name: 'New project from a template' }).click();
  await expect(sheet.getByRole('heading', { name: 'New from template' })).toBeVisible();
  expect(await AxeBuilder(page)).toEqual([]);
  await sheet.getByRole('button', { name: new RegExp(`^${name} `) }).click();
  await expect.poll(async () => (await db.list(`${space()}/projects`)).filter(p => p.name === name).length, { timeout: 15_000 }).toBe(2);
  // (the made project's tasks are the copies with the same titles but another project id)
  const copies = () => db.list(`${space()}/tasks`).then(l => l.filter(t => t.title === t1 || t.title === t2).filter(t => t.projectId !== pid));
  await expect.poll(async () => (await copies()).length, { timeout: 15_000 }).toBe(2);
  const tasks = await copies();
  // (the sections' writes may land after the tasks')
  await expect.poll(async () => (await db.list(`${space()}/sections`)).filter(x => x.projectId === tasks[0].projectId).map(x => x.name), { timeout: 15_000 }).toEqual(['Phase one']);
  expect(tasks.every(t => !t.done && !t.due)).toBe(true);
  expect(tasks.find(t => t.title === t2).parentId).toBeTruthy();
  expect(tasks.find(t => t.title === t1).parentId).toBeNull();
  await expect(page.locator('#project-page')).toBeVisible();

  // delete the template
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: 'Manage projects' }).click();
  await sheet.getByRole('button', { name: 'New project from a template' }).click();
  await sheet.getByRole('button', { name: `Delete template ${name}` }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(async () => (await db.list(`${space()}/templates`)).some(d => d.name === name), { timeout: 15_000 }).toBe(false);
});
