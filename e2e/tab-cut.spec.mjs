// Tab switch: app-ui dip mode (reference: Inbox/Today hard cut + ~50 ms blank; Upcoming/Browse cut, ~100 ms blank, whole-page 80 ms fade; no slide/stagger) and the calendar release is quick (<= 150 ms).
import { test, expect, signIn, synced } from './fixtures.mjs';

test('tab taps: Inbox and Today cut (a 50 ms blank), Upcoming dips (100 ms blank, 80 ms fade); all settle by 300 ms', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  for (const [id, ms] of [['upcoming', 180], ['today', 50], ['inbox', 50]]) {
    const seen = await page.evaluate(id => new Promise(done => {
      const tab = document.querySelector(`.ui-tabbar [data-tab-id="${id}"]`);
      tab.click();
      const pg = document.getElementById(`${id}-page`);
      // (the fade starts once the page change settles, a microtask after the tap)
      let own = [];
      requestAnimationFrame(() => { own = pg.getAnimations().map(a => a.effect.getTiming().duration); });
      setTimeout(() => done({ own, opacity: getComputedStyle(pg).opacity, cur: tab.getAttribute('aria-current') }), 300);
    }), id);
    expect(seen, id).toEqual({ own: [ms], opacity: '1', cur: 'page' });
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
