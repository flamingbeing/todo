// The sizes the app is drawn at (1 pt = 1 CSS px, 3 device px on a phone): a two-line row is 73 pt, the checkbox 20 at
// x 16, the title starts at 48, the add button is 68 (the reference's rounded square), and a title-only row is 52. The task
// sheet: a 44 pt head with 28 pt round buttons, the ring 22 at x 19, the title and row text at x 56, the date row 48.5, then one sideways row of 35 pt pills 8 apart from x 16.
// Light and dark keep the same sizes.
import { test, expect, signIn, synced, uniq, today, db, clickOpens, space } from './fixtures.mjs';

const put = (id, fields) => db.put(`${space()}/tasks/${id}`, { projectId: 'inbox', order: Date.now(), priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });

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
      return { row: Math.round(r.height * 10) / 10, check: [c.width, c.height], checkX: Math.round(c.x - r.x), titleX: Math.round(n.x - r.x) };
    });
    // (a dated task shows its time on the meta line, which makes it the two-line row)
    // (once it has settled: a row drawn anew as other tests' tasks arrive slides in from no height)
    // (all three measured in one go, and again until they agree: a redraw mid-measure gives a row whose box has no size yet)
    await expect.poll(() => size(b), { timeout: 10_000 }).toEqual({ row: 73, check: [20, 20], checkX: 16, titleX: 48 });
    const fab = await page.locator('#fab').evaluate(e => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]);
    expect(fab).toEqual([68, 68]);
    // dark: the page, the group's one card and the text are the reference's exact greys; light rows are flat
    // (polled: the colours ease in when the scheme flips)
    const look = () => page.locator('#today .td-row').filter({ hasText: b }).evaluate(row => ({
      page: getComputedStyle(document.body).backgroundColor,
      card: getComputedStyle(row.closest('.td-rows')).backgroundColor,
      text: getComputedStyle(row.querySelector('.td-title')).color,
    }));
    if (scheme === 'dark') await expect.poll(look).toEqual({ page: 'rgb(32, 32, 32)', card: 'rgb(39, 39, 39)', text: 'rgb(255, 255, 255)' });
    else await expect.poll(async () => (await look()).card).toBe('rgba(0, 0, 0, 0)');
  });
}

// a row with a time span, a repeat and a long project / section keeps the two-line 73: in dark's inset card the project
// shrinks with an ellipsis on the date line instead of dropping to a third line
for (const scheme of ['light', 'dark']) {
  test(`a dated row with a long project stays two lines (${scheme})`, async ({ phone }) => {
    const page = await phone();
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page, 'member');
    const pid = uniq('p'), sid = uniq('s'), t = uniq('trip');
    const stamp = { createdAt: Date.now(), updatedAt: Date.now() };
    await db.put(`${space()}/projects/${pid}`, { name: 'Weekend trip away', color: 'orange', parentId: null, view: 'list', order: Date.now(), ...stamp });
    await db.put(`${space()}/sections/${sid}`, { name: 'On the day itself', projectId: pid, order: 1, collapsed: false, ...stamp });
    await put(t, { title: t, projectId: pid, sectionId: sid, due: { date: today(), time: '07:30', rrule: 'FREQ=DAILY', string: 'every day' }, duration: 30 });
    await synced(page);
    const row = page.locator('#today .td-row').filter({ hasText: t });
    await expect.poll(() => row.evaluate(r => Math.round(r.getBoundingClientRect().height * 10) / 10), { timeout: 10_000 }).toBe(73);
    // the project sits on the date line
    const tops = await row.evaluate(r => [r.querySelector('.td-date').getBoundingClientRect().top, r.querySelector('.td-place').getBoundingClientRect().top]);
    expect(Math.abs(tops[0] - tops[1])).toBeLessThan(4);
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
      const date = box(s.querySelector('.td-attrs > .td-attr:not(.td-attr-desc)')), pills = [...s.querySelectorAll('.td-attr-chips > .td-attr.is-chip')].map(box);
      return { head: Math.round(head.height), more: [more.width, more.height], ring: [ring.width, Math.round(ring.x - x0)],
        rowTextX: Math.round(box(s.querySelector('.td-attrs .td-attr-desc .td-task-words') ?? s.querySelector('.td-attrs > .td-attr')).x - x0),
        dateRow: Math.round(date.height * 10) / 10, pillCount: pills.length, pillH: [...new Set(pills.map(p => p.height))],
        oneRow: new Set(pills.map(p => Math.round(p.y))).size, pillX: Math.round(pills[0].x - x0), pillGap: Math.round((pills[1].x - pills[0].right) * 10) / 10,
        pillsBelowDate: pills[0].y >= date.bottom };
    });
    await expect.poll(m, { timeout: 10_000 }).toEqual({ head: 44, more: [28, 28], ring: [22, 19], rowTextX: 56,
      dateRow: 48.5, pillCount: 6, pillH: [35], oneRow: 1, pillX: 16, pillGap: 8, pillsBelowDate: true });
  });
}
