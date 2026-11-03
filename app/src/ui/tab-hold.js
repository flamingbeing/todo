// A long press anywhere on the tab bar opens Settings > Navigation bar (the tabs' order and which show), with a haptic. A tap still
// switches tabs; a press that moves (a slow tap turning into a swipe or a scroll), or lifts early, is no long press; the tap
// that ends a long press does not switch tabs.
import { haptic } from '@core/ui';
import { openSettingsPage } from '../shell.js';

const HOLD_MS = 500, SLOP = 10;

/** @param {HTMLElement} bar  nav.ui-tabbar @param {() => void} open @returns {() => void} stop */
export function holdTabBar(bar, open) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let x0 = 0, y0 = 0, fired = false;
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  /** @param {PointerEvent} e */
  const down = e => {
    fired = false;
    cancel();
    if (!e.isPrimary || e.button > 0) return;
    x0 = e.clientX; y0 = e.clientY;
    timer = setTimeout(() => { timer = undefined; fired = true; haptic('long'); open(); }, HOLD_MS);
  };
  /** @param {PointerEvent} e */
  const move = e => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > SLOP) cancel(); };
  /** @param {Event} e */
  const click = e => {
    // (a script's own click, shell.js openTabBarSettings, goes through)
    if (fired && e.isTrusted) { fired = false; e.preventDefault(); e.stopPropagation(); }
  };
  /** @param {Event} e */
  const menu = e => { e.preventDefault(); };   // (a long press can raise the browser's own menu)
  bar.addEventListener('pointerdown', down, { passive: true });
  bar.addEventListener('pointermove', move, { passive: true });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) bar.addEventListener(t, cancel, { passive: true });
  bar.addEventListener('click', click, true);
  bar.addEventListener('contextmenu', menu);
  return () => {
    cancel();
    bar.removeEventListener('pointerdown', down);
    bar.removeEventListener('pointermove', move);
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) bar.removeEventListener(t, cancel);
    bar.removeEventListener('click', click, true);
    bar.removeEventListener('contextmenu', menu);
  };
}

/** Settings > Navigation bar from anywhere: Browse's Settings screen, then its page */
export const openTabBarSettings = () => openSettingsPage('Navigation bar');
