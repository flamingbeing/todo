// The sizes the app is drawn at (1 pt = 1 CSS px, 3 device px on a phone): a two-line row is 74 pt, the checkbox 22,
// the title starts at 50, the add button is 68 (the reference's rounded square), and a title-only row is 52. The task
// sheet: a 44 pt head with 28 pt round buttons, the ring 22 at x 19, the title and row text at x 56, rows 48.5 apart.
// Light and dark keep the same sizes.
import { test, expect, signIn, synced, uniq, today, db, clickOpens } from './fixtures.mjs';

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

for (const scheme of ['light', 'dark']) {
  test(`task sheet sizes (${scheme})`, async ({ phone }) => {
    const page = await phone();
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page, 'member');
    const t = uniq('sheet');
    await put(t, { title: t, description: 'notes', priority: 1, due: { date: today() } });
    await synced(page);
    await clickOpens(page.locator('#today .td-row').filter({ hasText: t }).locator('.td-row-main'), page.locator('#task-sheet'));
    const m = () => page.locator('#task-sheet').evaluate(s => {
      const box = e => e.getBoundingClientRect(), x0 = box(s).x + s.clientLeft;   // (inside the sheet's border)
      const head = box(s.querySelector('.td-sheet-head')), more = box(s.querySelector('.td-sheet-more')), ring = box(s.querySelector('.td-task-card > .td-check'));
      const rows = [...s.querySelectorAll('.td-attrs > .td-attr')].map(box);
      return { head: Math.round(head.height), more: [more.width, more.height], ring: [ring.width, Math.round(ring.x - x0)],
        rowTextX: Math.round(box(s.querySelector('.td-attrs .td-attr-desc .td-task-words') ?? s.querySelector('.td-attrs > .td-attr')).x - x0),
        pitch: Math.round((rows[2].y - rows[1].y) * 10) / 10 };
    });
    await expect.poll(m, { timeout: 10_000 }).toEqual({ head: 44, more: [28, 28], ring: [22, 19], rowTextX: 56, pitch: 48.5 });
  });
}
