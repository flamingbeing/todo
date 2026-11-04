// Row drag between days (Today/Upcoming): the red line glides 100 ms ease-out, rows do not shift, the card glides ~200 ms to the line on release; reduced motion: instant.
import { test, expect, signIn, synced, uniq, today, db, openTab, gesturesReady, still, press, slide, letGo, space } from './fixtures.mjs';

const put = (id, fields) => db.put(`${space()}/tasks/${id}`, { title: id, projectId: 'inbox', order: Date.now(), priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });
const setup = async (page) => {
  await signIn(page, 'member');
  const ids = [uniq('da'), uniq('db'), uniq('dc')];
  for (const [i, id] of ids.entries()) await put(id, { order: (i + 1) * 1000, due: { date: today() } });
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'today');
  await expect(page.locator(`#today .td-row[data-id="${ids[2]}"]`)).toBeVisible();
  await still(page, '#today');
  return ids;
};
const row = (id) => `#today .td-row[data-id="${id}"]`;

test('the drop line glides in 100 ms, rows stay put, the card glides ~200 ms on release', async ({ phone }) => {
  const page = await phone();
  const [a, b, c] = await setup(page);
  await press(page, row(c));
  await slide(page, { to: row(a), dy: 2 }, 8);
  await page.waitForTimeout(150);
  const got = await page.evaluate(([a, b]) => {
    const l = getComputedStyle(document.querySelector('.td-drop-line'));
    const t = id => getComputedStyle(document.querySelector(`#today .td-row[data-id="${id}"]`)).transform;
    return { d: l.transitionDuration, f: l.transitionTimingFunction, a: t(a), b: t(b) };
  }, [a, b]);
  expect(got.d).toContain('0.1s');
  expect(got.f).toContain('ease-out');
  expect(got.a).toBe('none');
  expect(got.b).toBe('none');
  await page.evaluate(id => { window.__anim = null; new MutationObserver(() => {}); const r = document.querySelector(`#today .td-row[data-id="${id}"]`); const t = setInterval(() => { const x = r.getAnimations().find(a => a.effect.getTiming().duration === 200); if (x) { window.__anim = x.effect.getTiming(); clearInterval(t); } }, 5); }, c);
  await letGo(page);
  await expect.poll(() => page.evaluate(() => window.__anim?.duration)).toBe(200);
});

test('reduced motion: no line glide, drop applies at once', async ({ phone }) => {
  const page = await phone();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const [a, , c] = await setup(page);
  await press(page, row(c));
  await slide(page, { to: row(a), dy: 2 }, 8);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.td-drop-line')).transitionDuration)).toBe('0s');
  await letGo(page);
  await page.waitForTimeout(60);
  expect(await page.evaluate(id => document.querySelector(`#today .td-row[data-id="${id}"]`)?.getAnimations().length ?? 0, c)).toBe(0);
});
