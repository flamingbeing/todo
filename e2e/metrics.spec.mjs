// The sizes the app is drawn at (1 pt = 1 CSS px, 3 device px on a phone): a two-line row is 74 pt, the checkbox 22,
// the title starts at 50, the add button is 68 (the reference's rounded square), and a title-only row is 52. Light and dark keep the same sizes.
import { test, expect, signIn, synced, uniq, today, db } from './fixtures.mjs';

const put = (id, fields) => db.put(`spaces/_/tasks/${id}`, { projectId: 'inbox', order: Date.now(), priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });

for (const scheme of ['light', 'dark']) {
  test(`row, checkbox, title and add button sizes (${scheme})`, async ({ phone }) => {
    const page = await phone();
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page, 'member');
    const b = uniq('dated');
    await put(b, { title: b, due: { date: today(), time: '23:59' } });
    await synced(page);
    const size = async t => page.locator('#today .td-row').filter({ hasText: t }).evaluate(row => {
      const r = row.getBoundingClientRect(), c = row.querySelector('.td-check').getBoundingClientRect(), n = row.querySelector('.td-title').getBoundingClientRect();
      return { row: Math.round(r.height * 10) / 10, check: [c.width, c.height], titleX: Math.round(n.x - r.x) };
    });
    // (a dated task shows its time on the meta line, which makes it the two-line row)
    // (once it has settled: a row drawn anew as other tests' tasks arrive slides in from no height)
    // (all three measured in one go, and again until they agree: a redraw mid-measure gives a row whose box has no size yet)
    await expect.poll(() => size(b), { timeout: 10_000 }).toEqual({ row: 74, check: [22, 22], titleX: 50 });
    const fab = await page.locator('#fab').evaluate(e => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]);
    expect(fab).toEqual([68, 68]);
  });
}
