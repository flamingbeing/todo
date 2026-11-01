// Browse > Manage projects: every project with a grip; a grip dragged, or moved with the arrow keys, puts the project
// before or after the one beside it at its level, and the new order is saved. The sheet passes axe.
import AxeBuilder from './axe.mjs';
import { test, expect, signIn, synced, uniq, db, openTab } from './fixtures.mjs';

const put = (id, fields) => db.put(`spaces/_/projects/${id}`, { color: 'blue', parentId: null, view: 'list', createdAt: Date.now(), updatedAt: Date.now(), ...fields });
const order = async id => (await db.get(`spaces/_/projects/${id}`))?.order;

test('a project moves with the keys and with its grip; the order is saved', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const a = uniq('mp-a'), b = uniq('mp-b');
  const base = -1e12 - Date.now();
  await put(a, { name: a, order: base });
  await put(b, { name: b, order: base + 1000 });
  await synced(page);
  await openTab(page, 'browse');
  await page.locator('#browse').getByRole('button', { name: 'Manage projects' }).click();
  const sheet = page.locator('#pick-sheet');
  // (which of a and b comes first among the names: other tests running at once add projects of their own, which may come first)
  const first = () => sheet.locator('.td-manage-name').allTextContents().then(n => (n.indexOf(a) < 0 || n.indexOf(b) < 0 ? null : n.indexOf(a) < n.indexOf(b) ? a : b));
  await expect(sheet.getByRole('heading', { name: 'Manage projects' })).toBeVisible();
  await expect.poll(first).toBe(a);
  expect(await AxeBuilder(page)).toEqual([]);

  // the keys: B up past A
  await sheet.getByRole('button', { name: `Move ${b}` }).focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await order(b)) < (await order(a)), { timeout: 15_000 }).toBe(true);
  await expect.poll(first).toBe(b);
  await expect(sheet.getByRole('button', { name: `Move ${b}` })).toBeFocused();

  // the grip: B back down past A
  const h = /** @type {{ height: number }} */ (await sheet.locator('.td-manage-row').first().boundingBox()).height;
  // (a real pointer: the grip takes it over, which a made-up one cannot be)
  const g = /** @type {{ x: number, y: number, width: number, height: number }} */ (await sheet.getByRole('button', { name: `Move ${b}` }).boundingBox());
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + h * 1.3, { steps: 6 });
  await expect(sheet.locator('.td-manage-row.dragging')).toHaveCount(1);
  await page.mouse.up();
  await expect.poll(async () => (await order(a)) < (await order(b)), { timeout: 15_000 }).toBe(true);
  await expect.poll(first).toBe(a);
});
