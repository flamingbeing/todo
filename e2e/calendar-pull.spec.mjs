// The Upcoming calendar pull (reference: five rows, no rubber band, no start hitch, the title turns coral only once the
// open is committed, the handle has no held press pill, the caret is a filled triangle).
import { test, expect, signIn, synced, openTab, gesturesReady, boxOf } from './fixtures.mjs';

const FULL = 20 + 5 * 44;   // HEAD + ROWS * ROW in week-strip.js

test('the pull: few rows at the first move, a hard clamp at the end, coral only after the open commits', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await gesturesReady(page);
  await openTab(page, 'upcoming');
  const strip = page.locator('#upcoming-strip');
  await expect(strip.locator('.td-wday')).toHaveCount(7);
  // hold the idle work back, to see what the first frame itself draws
  await page.evaluate(() => { const q = window.__idle = []; window.requestIdleCallback = f => q.push(f); });
  const handle = strip.locator('.td-strip-handle');
  expect(await handle.getAttribute('data-no-press')).toBe('');
  const h = () => strip.locator('.td-wcal').evaluate(e => e.getBoundingClientRect().height);
  const b = await boxOf(page, '#upcoming-strip .td-strip-handle');
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // press: nothing has moved, the title is not coral
  expect(await strip.locator('.td-month').getAttribute('data-out')).toBeNull();
  await page.mouse.move(x, y + 12, { steps: 3 });
  // the first move draws a handful of weeks, not sixty at once
  expect(await strip.locator('.td-weeks-row').count()).toBeLessThan(20);
  await page.evaluate(() => window.__idle.splice(0).forEach(f => f()));   // (then the rest, a year ahead)
  await page.mouse.move(x, y + 700, { steps: 12 });
  // far past the end: clamped at the five rows, no stretch; still white while the finger is down
  expect(await h()).toBeLessThanOrEqual(FULL);
  expect(await strip.locator('.td-month').getAttribute('data-out')).toBeNull();
  await page.mouse.up();
  await expect(strip.locator('.td-month')).toHaveAttribute('aria-expanded', 'true');
  await expect(strip.locator('.td-month')).toHaveAttribute('data-out', '');
  await expect.poll(h).toBe(FULL);
  await expect.poll(() => strip.locator('.td-weeks .td-wcell').count()).toBeGreaterThanOrEqual(53 * 7);
  expect(await strip.locator('.td-month-caret').evaluate(e => getComputedStyle(e).clipPath)).toContain('polygon');
  // pull it shut again: the coral clears with the first move, the handle (no held press) stays bare
  const o = await boxOf(page, '#upcoming-strip .td-strip-handle');
  const x2 = o.x + o.width / 2, y2 = o.y + o.height / 2;
  await page.mouse.move(x2, y2);
  await page.mouse.down();
  await page.mouse.move(x2, y2 - 20, { steps: 3 });
  await expect(strip.locator('.td-month')).not.toHaveAttribute('data-out', /.*/);
  await page.mouse.move(x2, y2 - 60, { steps: 4 });
  await page.mouse.move(x2, y2 - 500, { steps: 8 });
  expect(await h()).toBeGreaterThanOrEqual(0);
  await page.mouse.up();
  await expect(strip.locator('.td-month')).toHaveAttribute('aria-expanded', 'false');
  await expect(strip.locator('.td-wcal')).toBeHidden();
});
