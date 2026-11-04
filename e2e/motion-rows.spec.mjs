// Row motion: a completion bursts about 30 bits from the checkbox over 2 s and the row fades away; while a row is
// dragged its neighbours slide one row's height in 150 ms; under reduced motion neither animates.
import { test, expect, signIn, synced, uniq, db, gesturesReady, openTab, still, press, slide, letGo, boxOf, space } from './fixtures.mjs';

const put = (id, fields) => db.put(`${space()}/tasks/${id}`, { projectId: 'inbox', priority: 4, done: false, createdAt: Date.now(), updatedAt: Date.now(), ...fields });
const rowIn = (host, id) => `#${host} .td-row[data-id="${id}"]`;
const project = async (page, p) => {
  const pid = uniq(`${p}-p`), ids = [uniq(`${p}-a`), uniq(`${p}-b`), uniq(`${p}-c`)];
  await db.put(`${space()}/projects/${pid}`, { name: pid, color: 'blue', parentId: null, order: -1e12 - Date.now(), view: 'list', createdAt: Date.now(), updatedAt: Date.now() });
  for (const [i, id] of ids.entries()) await put(id, { title: id, projectId: pid, order: (i + 1) * 1000 });
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'browse');
  await page.locator('#browse .td-browse-row').filter({ hasText: pid }).first().click();
  await expect(page.locator('#project-title')).toHaveText(pid);
  await expect(page.locator(rowIn('project', ids[2]))).toBeVisible();
  await still(page, '#project');
  return ids;
};

test('a completion bursts about 30 bits for 2 s and the row fades away', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const [a] = await project(page, 'conf');
  await page.locator(`${rowIn('project', a)} .td-check`).click();
  await expect(page.locator('.td-confetti-bit').first()).toBeAttached();
  const seen = await page.evaluate(() => {
    const bits = [...document.querySelectorAll('.td-confetti-bit')];
    const a = bits[0].getAnimations()[0];
    return { n: bits.length, ms: a.effect.getTiming().duration, props: [...new Set(a.effect.getKeyframes().flatMap(k => Object.keys(k)).filter(k => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)))] };
  });
  expect(seen.n).toBeGreaterThanOrEqual(28);
  expect(seen.n).toBeLessThanOrEqual(32);
  expect(seen.ms).toBe(2000);
  expect(seen.props.sort()).toEqual(['opacity', 'transform']);
  await expect(page.locator(rowIn('project', a))).toHaveCount(0, { timeout: 5000 });
});

test('a dragged row: neighbours slide one row height in 150 ms', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const [a, b, c] = await project(page, 'slide');
  const rb = await boxOf(page, rowIn('project', b));
  await press(page, rowIn('project', c));
  await slide(page, { to: rowIn('project', a), dy: 2 }, 8);
  await page.waitForTimeout(250);
  const got = await page.evaluate(([a, b]) => {
    const f = id => { const r = document.querySelector(`#project .td-row[data-id="${id}"]`); const s = getComputedStyle(r); return { t: s.transform, d: s.transitionDuration, h: r.offsetHeight }; };
    return { a: f(a), b: f(b) };
  }, [a, b]);
  expect(got.a.d).toBe('0.15s');
  expect(got.a.t).toBe(`matrix(1, 0, 0, 1, 0, ${got.a.h})`);
  expect(got.b.t).toBe(`matrix(1, 0, 0, 1, 0, ${got.b.h})`);
  expect(Math.abs(got.a.h - rb.height)).toBeLessThan(2);
  await letGo(page);
});

test('with reduced motion nothing bursts and rows do not slide', async ({ phone }) => {
  const page = await phone();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, 'member');
  const [a, b, c] = await project(page, 'calm');
  await page.locator(`${rowIn('project', a)} .td-check`).click();
  await page.waitForTimeout(500);
  expect(await page.locator('.td-confetti-bit').count()).toBe(0);
  await press(page, rowIn('project', c));
  await slide(page, { to: rowIn('project', b), dy: 2 }, 8);
  await page.waitForTimeout(200);
  expect(await page.evaluate(id => getComputedStyle(document.querySelector(`#project .td-row[data-id="${id}"]`)).transitionDuration, b)).toBe('0s');
  await letGo(page);
});

test('a pressed row shades whole and square, not as a pill on its words', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  const [a] = await project(page, 'press');
  const seen = await page.evaluate(sel => {
    const row = document.querySelector(sel), main = row.querySelector('.td-row-main');
    const bg0 = getComputedStyle(row).backgroundColor;
    main.setAttribute('data-pressed', '');
    const out = { bg0, bg: getComputedStyle(row).backgroundColor, shadow: getComputedStyle(main).boxShadow, parent: main.hasAttribute('data-press-parent') };
    main.removeAttribute('data-pressed');
    return out;
  }, rowIn('project', a));
  expect(seen.bg).not.toBe(seen.bg0);
  expect(seen.shadow).toBe('none');
  expect(seen.parent, 'the words hand their press to the row (app-ui data-press-parent)').toBe(true);
});

// any press paint the kit adds later (shade, ripple, scale) must land on the row, never as a pill on the words (owner 3 Nov:
// the pill came back three times, each time from a new kit press effect on the words' rounded button)
test('a real touch on a row paints nothing on its words: the ripple and tint are on the row', async ({ phone }) => {
  const page = await phone();
  await page.emulateMedia({ colorScheme: 'dark' });
  await signIn(page, 'member');
  const [a] = await project(page, 'ripple');
  const sel = rowIn('project', a);
  await press(page, sel, { hold: 200, at: [250, 20] });
  const seen = await page.evaluate(sel => {
    const row = document.querySelector(sel), main = row.querySelector('.td-row-main'), m = getComputedStyle(main), r = getComputedStyle(row);
    return { mainImage: m.backgroundImage, mainShadow: m.boxShadow, mainRipple: main.getAttribute('data-ripple'), rowImage: r.backgroundImage };
  }, sel);
  await letGo(page);
  expect(seen.mainRipple).toBe(null);
  expect(seen.mainImage).toBe('none');
  expect(seen.mainShadow).toBe('none');
  expect(seen.rowImage).toMatch(/radial-gradient/);
});
