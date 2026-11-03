// Quick add's motion: the card grows out of the add button in about 300ms, decelerating with no spring or overshoot; the
// add button fades instead of vanishing; the Date sheet can rest at half height; under reduced motion nothing animates.
import { test, expect, signIn, synced } from './fixtures.mjs';

test('quick add opens in about 300ms, decelerating, from the add button', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  const seen = await page.evaluate(() => new Promise(done => {
    const sheet = document.getElementById('add-sheet'), fab = document.getElementById('fab');
    const mo = new MutationObserver(() => {
      if (!sheet.open) return;
      mo.disconnect();
      queueMicrotask(() => requestAnimationFrame(() => {
        const a = sheet.getAnimations().find(x => x.animationName === 'td-qa-open');
        const t = a?.effect.getTiming();
        const fabFade = fab.getAnimations().some(x => x.transitionProperty === 'opacity') || getComputedStyle(fab).opacity !== '1';
        done({ duration: t?.duration, easing: t?.easing, fabFade, fabDisplay: getComputedStyle(fab).display, props: a?.effect.getKeyframes().flatMap(k => Object.keys(k)).filter(k => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)) });
      }));
    });
    mo.observe(sheet, { attributes: true, attributeFilter: ['open'] });
    fab.click();
  }));
  expect(seen.duration).toBeGreaterThanOrEqual(250);
  expect(seen.duration).toBeLessThanOrEqual(350);
  expect(seen.easing).not.toMatch(/spring|linear\(/);
  for (const n of seen.easing.match(/-?\d*\.?\d+(?=\s*[,)])/g) ?? []) expect(Number(n)).toBeLessThanOrEqual(1);   // no overshoot
  expect(new Set(seen.props)).toEqual(new Set(['opacity', 'transform']));
  expect(seen.fabFade).toBe(true);
  expect(seen.fabDisplay).not.toBe('none');
});

test('the Date sheet has a half-height resting place', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await expect(page.locator('#schedule-sheet')).toHaveAttribute('data-detents', /medium/);
});

test('with reduced motion nothing animates', async ({ phone }) => {
  const page = await phone();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, 'member');
  await synced(page);
  await page.locator('#fab').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  expect(await page.evaluate(() => document.getAnimations().filter(a => /td-qa-open|td-fab-pop/.test(a.animationName ?? '')).length)).toBe(0);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('fab')).display)).toBe('none');
});
