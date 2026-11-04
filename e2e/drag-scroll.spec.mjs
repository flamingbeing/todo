// A row held and dragged near the foot of a long list scrolls the list by itself (faster the deeper the finger goes),
// and lands where it is let go once the finger leaves the edge: here between tasks 34 and 35 of 40. The same in a
// board's column, and a card held at the board's side scrolls the board sideways to the next columns.
import { test, expect, signIn, synced, uniq, db, openTab, gesturesReady, still, press, slide, letGo, listFoot, space } from './fixtures.mjs';

const now = () => ({ createdAt: Date.now(), updatedAt: Date.now() });
const get = id => db.get(`${space()}/tasks/${id}`);
const n2 = i => String(i).padStart(2, '0');

/** a project of its own with 40 tasks (or the sections given, two tasks each), its page open */
async function project(page, p, { view = 'list', sections = [] } = {}) {
  const pid = uniq(`${p}-p`), u = uniq(p);
  await db.put(`${space()}/projects/${pid}`, { name: pid, color: 'blue', parentId: null, order: -1e12 - Date.now(), view, ...now() });
  /** @type {string[]} */
  const ids = [];
  if (sections.length) {
    for (const [k, s] of sections.entries()) {
      await db.put(`${space()}/sections/${s}`, { name: `Column ${k + 1}`, projectId: pid, order: k + 1, collapsed: false, ...now() });
      for (const j of [1, 2]) { const id = `${u}-${k + 1}${j}`; ids.push(id); await db.put(`${space()}/tasks/${id}`, { title: id, projectId: pid, sectionId: s, order: j * 1000, priority: 4, done: false, ...now() }); }
    }
  } else {
    for (let i = 1; i <= 40; i++) { const id = `${u}-${n2(i)}`; ids.push(id); await db.put(`${space()}/tasks/${id}`, { title: id, projectId: pid, order: i * 1000, priority: 4, done: false, ...now() }); }
  }
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'browse');
  await page.locator('#browse .td-browse-row').filter({ hasText: pid }).first().click();
  await expect(page.locator('#project-title')).toHaveText(pid);
  await expect(page.locator(`#project .td-row[data-id="${ids.at(-1)}"]`)).toBeAttached();
  await still(page, '#project');
  return ids;
}
const row = id => `#project .td-row[data-id="${id}"]`;

/** hold task 3, into the foot's edge until task 35 is well in sight, then onto 35's top: it lands between 34 and 35 */
async function scrollDown(page, ids) {
  const scrolled = () => page.evaluate(() => scrollY);
  await page.evaluate(() => scrollTo(0, 0));
  const y0 = await scrolled();
  await press(page, row(ids[2]));
  const foot = await listFoot(page);
  await slide(page, { y: foot - 12 }, 10);
  await page.waitForFunction(([sel, foot]) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return !!r && r.bottom < foot - 160; }, [row(ids[34]), foot], { timeout: 15_000 });
  expect(await scrolled()).toBeGreaterThan(y0 + 400);
  await slide(page, { to: row(ids[34]), dy: 2 }, 8);
  await letGo(page);
  await expect.poll(async () => {
    const [a, b, me] = [await get(ids[33]), await get(ids[34]), await get(ids[2])];
    return (a?.order ?? 0) < (me?.order ?? 0) && (me?.order ?? 0) < (b?.order ?? 0);
  }, { timeout: 15_000 }).toBe(true);
}

test('a row held at the list\'s foot scrolls it, and lands between tasks 34 and 35', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const ids = await project(page, 'ds');
  await scrollDown(page, ids);
  await expect(page.locator('#project .td-row').nth(33)).toHaveAttribute('data-id', ids[2]);
});

test('a board column scrolls the same way; a card at the board\'s side scrolls it to the next columns', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const ids = await project(page, 'dsb', { view: 'board' });
  await expect(page.locator('#project.td-board')).toBeVisible();
  await scrollDown(page, ids);

  const s = [uniq('c1'), uniq('c2'), uniq('c3')];
  const cards = await project(page, 'dss', { view: 'board', sections: s });
  const board = page.locator('#project.td-board');
  await expect(board.locator('.td-col-title')).toHaveText(['Column 1', 'Column 2', 'Column 3']);
  expect(await board.evaluate(b => b.scrollLeft)).toBe(0);
  // card 1 of column 1 to the board's right side: it scrolls until column 3 is in sight, then onto column 3
  await press(page, row(cards[0]));
  const right = await board.evaluate(b => b.getBoundingClientRect().right);
  await slide(page, { x: right - 8 }, 10);
  const col3 = `#project .td-col[data-id="${s[2]}"]`;
  await page.waitForFunction(sel => { const r = document.querySelector(sel)?.getBoundingClientRect(); return !!r && r.left < innerWidth / 2; }, col3, { timeout: 15_000 });
  await slide(page, { to: `${col3} .td-row:last-child`, dy: 40 }, 6);
  await letGo(page);
  await expect.poll(async () => (await get(cards[0]))?.sectionId, { timeout: 15_000 }).toBe(s[2]);
  await expect(page.locator(`${col3} .td-row`)).toHaveCount(3);
});
