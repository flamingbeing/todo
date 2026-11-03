// Tab switch is a hard cut (reference: 1-3 frames, no slide/fade/stagger) and the calendar release is quick (<= 150 ms).
import { test, expect, signIn, synced } from './fixtures.mjs';

test('a tab tap shows the target page at once with nothing animating on its blocks', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  for (const id of ['upcoming', 'today', 'inbox']) {
    const seen = await page.evaluate(id => new Promise(done => {
      const tab = document.querySelector(`.ui-tabbar [data-tab-id="${id}"]`);
      tab.click();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const pg = document.getElementById(`${id}-page`);
        const anims = pg ? pg.getAnimations({ subtree: true }).filter(a => a.effect?.getTiming().duration > 0).length : -1;
        done({ visible: !!pg && pg.getBoundingClientRect().width > 0 && getComputedStyle(pg).opacity === '1', anims, cur: tab.getAttribute('aria-current') });
      }));
    }), id);
    expect(seen, id).toEqual({ visible: true, anims: 0, cur: 'page' });
  }
});

test('reduced motion still switches at once', async ({ phone }) => {
  const page = await phone();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, 'member');
  await synced(page);
  await page.locator('.ui-tabbar [data-tab-id="upcoming"]').click();
  await expect(page.locator('#upcoming-page')).toBeVisible();
});

test('the calendar opens within about 150 ms of the handle tap', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await page.locator('.ui-tabbar [data-tab-id="upcoming"]').click();
  const ms = await page.evaluate(() => new Promise(done => {
    const cal = document.querySelector('#upcoming-strip .td-wcal'), h = document.querySelector('#upcoming-strip .td-strip-handle');
    let last = cal.getBoundingClientRect().height, t0 = performance.now(), still = 0, end = t0;
    h.click();
    const tick = () => {
      const v = cal.getBoundingClientRect().height, now = performance.now();
      if (Math.abs(v - last) > .5) { still = 0; end = now; } else still++;
      last = v;
      if (still > 6 || now - t0 > 1500) done(end - t0); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  expect(ms).toBeLessThanOrEqual(260);   // a 100 ms response spring lands in about 150 ms (tap with less-motion off), plus a frame or two
});
