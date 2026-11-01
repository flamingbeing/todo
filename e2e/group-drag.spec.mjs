// A list grouped by Display: a row dragged to another group takes that group's value (a priority, a label in place
// of the one it had, a project with its subtasks), with Undo naming the group. A sorted list has no drag: moved after
// the hold, a toast says why and offers manual order, which brings the drag back. The "+" by a group's name opens
// quick add with that group's value.
import { test, expect, signIn, synced, uniq, db, openTab, gesturesReady, still, press, slide, letGo } from './fixtures.mjs';

const now = () => ({ createdAt: Date.now(), updatedAt: Date.now() });
const get = id => db.get(`spaces/_/tasks/${id}`);
const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { title: id, projectId: 'inbox', priority: 4, done: false, ...now(), ...fields });

async function display(page) {
  await page.locator('#more-btn').click();
  await page.getByRole('menuitem', { name: 'Display' }).click();
  const sheet = page.locator('#display-sheet');
  await expect(sheet).toBeVisible();
  return sheet;
}
const choose = async (page, row, value) => {
  const sheet = await display(page);
  await sheet.getByRole('button', { name: new RegExp(`^${row}`) }).click();
  await page.locator('#pick-sheet').getByRole('option', { name: value, exact: true }).click();
  await expect(page.locator('#pick-sheet')).toBeHidden();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
};
/** a project of its own, its page open */
async function project(page, p, tasks) {
  const pid = uniq(`${p}-p`);
  await db.put(`spaces/_/projects/${pid}`, { name: pid, color: 'blue', parentId: null, order: -1e12 - Date.now(), view: 'list', ...now() });
  for (const [id, f] of Object.entries(tasks)) await put(id, { projectId: pid, ...f });
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'browse');
  await page.locator('#browse .td-browse-row').filter({ hasText: pid }).first().click();
  await expect(page.locator('#project-title')).toHaveText(pid);
  return pid;
}
/** hold a row and let it go just under another one's middle */
const dragOnto = async (page, from, onto) => {
  await press(page, from);
  await slide(page, { to: onto, dy: 34 }, 10);
  await letGo(page);
};
const row = (host, id) => `#${host} .td-row[data-id="${id}"]`;

test('grouped by priority: a No priority row dragged under Priority 1 gets P1; Undo puts it back', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const a = uniq('gp-a'), b = uniq('gp-b');
  await project(page, 'gp', { [b]: { priority: 1, order: 1 }, [a]: { priority: 4, order: 2 } });
  await choose(page, 'Grouping', 'Priority');
  await expect(page.locator('#project .td-group-title')).toHaveText(['Priority 1', 'No priority']);
  await still(page, '#project');
  await dragOnto(page, row('project', a), row('project', b));
  await expect.poll(async () => (await get(a))?.priority, { timeout: 15_000 }).toBe(1);
  await expect(page.locator('.toast').filter({ hasText: 'Moved to Priority 1' })).toBeVisible();
  await expect(page.locator('#project .td-group').first().locator('.td-row')).toHaveCount(2);
  await page.locator('.toast').filter({ hasText: 'Moved to Priority 1' }).getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await get(a))?.priority, { timeout: 15_000 }).toBe(4);
});

test('grouped by label: dragged to another label\'s group, the label is swapped', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const l1 = uniq('l1'), l2 = uniq('l2'), n1 = uniq('errand'), n2 = uniq('garden'), a = uniq('gl-a'), b = uniq('gl-b');
  await db.put(`spaces/_/labels/${l1}`, { name: n1, color: 'blue', order: -2e12, favorite: false, ...now() });
  await db.put(`spaces/_/labels/${l2}`, { name: n2, color: 'green', order: -2e12 + 1, favorite: false, ...now() });
  await project(page, 'gl', { [a]: { labels: [l1], order: 1 }, [b]: { labels: [l2], order: 2 } });
  await choose(page, 'Grouping', 'Label');
  await expect(page.locator('#project .td-group-title')).toHaveText([n1, n2]);
  await still(page, '#project');
  await dragOnto(page, row('project', a), row('project', b));
  await expect.poll(async () => (await get(a))?.labels, { timeout: 15_000 }).toEqual([l2]);
  await expect(page.locator('.toast').filter({ hasText: `Moved to ${n2}` })).toBeVisible();
});

test('grouped by project on a label\'s page: dragged to another project, it moves there with its subtask', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const l = uniq('lp'), name = uniq('trip'), p1 = uniq('gpa'), p2 = uniq('gpb'), a = uniq('pj-a'), kid = uniq('pj-kid'), b = uniq('pj-b');
  await db.put(`spaces/_/labels/${l}`, { name, color: 'blue', order: -3e12, favorite: true, ...now() });
  const first = -1e12 - Date.now();
  for (const [k, p] of [p1, p2].entries()) await db.put(`spaces/_/projects/${p}`, { name: p, color: 'blue', parentId: null, order: first + k, view: 'list', ...now() });
  await put(a, { projectId: p1, labels: [l], order: 1 });
  await put(kid, { projectId: p1, parentId: a, order: 1 });
  await put(b, { projectId: p2, labels: [l], order: 1 });
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.locator('#place-page')).toBeVisible();
  await choose(page, 'Grouping', 'Project');
  await expect(page.locator('#place .td-subgroup')).toHaveText([p1, p2]);
  await still(page, '#place');
  await dragOnto(page, row('place', a), row('place', b));
  await expect.poll(async () => (await get(a))?.projectId, { timeout: 15_000 }).toBe(p2);
  await expect.poll(async () => (await get(kid))?.projectId, { timeout: 15_000 }).toBe(p2);
  expect((await get(a))?.sectionId ?? null).toBe(null);
  await expect(page.locator('.toast').filter({ hasText: `Moved to ${p2}` })).toBeVisible();
});

test('a sorted list has no drag: the toast says so, and Manual order brings it back', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const a = uniq('so-b'), b = uniq('so-a');
  await project(page, 'so', { [a]: { title: `B ${a}`, order: 1 }, [b]: { title: `A ${b}`, order: 2 } });
  await choose(page, 'Sorting', 'Name');
  await expect(page.locator('#project')).toHaveAttribute('data-sorted', '');
  await expect(page.locator('#project .td-row').first()).toHaveAttribute('data-id', b);
  await still(page, '#project');
  await press(page, row('project', b));
  await slide(page, { to: row('project', a), dy: 40 }, 8);
  const note = page.locator('.toast').filter({ hasText: 'This list is in name order' });
  await expect(note).toBeVisible();
  // the row went back; nothing was saved
  await letGo(page);
  await expect(page.locator('#project .td-drop-line')).toHaveCount(0);
  expect((await get(b))?.order).toBe(2);
  await note.getByRole('button', { name: 'Manual order' }).click();
  await expect(page.locator('#project')).not.toHaveAttribute('data-sorted');
  await expect(page.locator('#project .td-row').first()).toHaveAttribute('data-id', a);
  await still(page, '#project');
  // back in manual order, a drag moves it
  await press(page, row('project', b));
  await slide(page, { to: row('project', a), dy: 4 }, 8);
  await letGo(page);
  await expect.poll(async () => ((await get(b))?.order ?? 9) < ((await get(a))?.order ?? 0), { timeout: 15_000 }).toBe(true);
});

test('the "+" by a group\'s name opens quick add with that group\'s priority', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const a = uniq('pl-a'), b = uniq('pl-b');
  const pid = await project(page, 'pl', { [a]: { priority: 2, order: 1 }, [b]: { priority: 4, order: 2 } });
  await choose(page, 'Grouping', 'Priority');
  await page.locator('#project').getByRole('button', { name: 'Add task to Priority 2' }).click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await expect(page.locator('#add-sheet .td-chip-main[aria-label^="Priority"]')).toHaveAttribute('aria-label', 'Priority: P2');
  const t = uniq('from plus');
  await page.fill('#add-sheet .td-add-title', t);
  await page.locator('#add-sheet .td-send').click();
  await expect.poll(async () => (await db.list('spaces/_/tasks')).find(d => d.title === t), { timeout: 15_000 }).toMatchObject({ priority: 2, projectId: pid });
});
