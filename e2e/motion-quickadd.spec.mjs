// Quick add's motion: the card grows out of the add button in about 300ms, decelerating with no spring or overshoot; the
// add button fades instead of vanishing; the Date sheet can rest at half height; under reduced motion nothing animates.
import { test, expect, signIn, synced } from './fixtures.mjs';

// No browser here shows a real keyboard, so app-ui's keyboard watch is played as its own test does: the page made shorter
// (a keyboard up) and tall again (it went). The sheet is marked data-keyboard-close, so the kit closes it.
const KEYBOARD_H = 344;
const keyboardUp = async page => { const v = page.viewportSize(); await page.setViewportSize({ width: v.width, height: v.height - KEYBOARD_H }); await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('ui-keyboard-open'))).toBe(true); };
const keyboardDown = async page => { const v = page.viewportSize(); await page.setViewportSize({ width: v.width, height: v.height + KEYBOARD_H }); await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('ui-keyboard-open'))).toBe(false); };

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

test('the keyboard going (Back on a phone) takes quick add with it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  await page.locator('#fab').click();
  await expect(page.locator('#add-sheet')).toHaveJSProperty('open', true);
  await expect(page.locator('#add-sheet .td-add-title')).toBeFocused();
  // the keyboard hides with the caret still in the field (Back on a phone)
  await keyboardUp(page);
  await keyboardDown(page);
  await expect(page.locator('#add-sheet')).toHaveJSProperty('open', false);
});

test('quick add closes in ~150ms back toward the button; keyboard hide with the field blurred closes, a chip keeps it', async ({ phone }) => {
  const page = await phone();
  await signIn(page, 'member');
  await synced(page);
  const sheet = page.locator('#add-sheet');
  await page.locator('#fab').click();
  await expect(sheet).toHaveJSProperty('open', true);
  await page.locator('#add-sheet .td-add-title').fill('keep me');
  const css = await page.evaluate(() => { const s = document.getElementById('add-sheet'); s.removeAttribute('open'); const c = getComputedStyle(s); const r = { d: c.transitionDuration, t: c.transform }; s.setAttribute('open', ''); return r; });
  expect(css.d).toMatch(/0\.15s/);
  expect(css.t).toMatch(/matrix/);
  await keyboardUp(page);
  await page.evaluate(() => document.querySelector('#add-sheet .td-add-title').blur());   // (Android blurs the field as the keyboard hides)
  await expect(sheet).toHaveJSProperty('open', false);
  await keyboardDown(page);
  await page.locator('#fab').click();
  await expect(page.locator('#add-sheet .td-add-title')).toHaveValue('keep me');
  const chip = page.locator('#add-sheet .td-add button').first();
  await keyboardUp(page);
  await chip.focus();
  await keyboardDown(page);
  await expect(sheet).toHaveJSProperty('open', true);
});

test('reduced motion: quick add has no close transition', async ({ phone }) => {
  const page = await phone();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, 'member');
  await synced(page);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('add-sheet')).transitionDuration)).toBe('0s');
});
