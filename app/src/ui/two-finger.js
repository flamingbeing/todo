// Two fingers dragged up or down over a list (or a board's column) select the rows they pass: select mode starts at the
// first row and every row between the fingers' highest and lowest point is ticked, more as they go further. One finger
// keeps its work (scrolling, a hold's menu, a drag, a swipe). Touch events, so the move can be cancelled before the page
// scrolls with two fingers; the touch is claimed as 'select' so a part above it keeps its own.
import { claim, haptic } from '@core/ui';

const SLOP = 12;   // px of travel before a two-finger move counts as a drag

/**
 * @param {HTMLElement} host  a list page's body
 * @param {{ can: () => boolean, tick: (ids: string[]) => void }} o  tick: select these rows (the ones passed so far)
 * @returns {() => void} stop
 */
export function twoFingerSelect(host, o) {
  /** @type {{ y: number[], x: number[], lo: number, hi: number, col: Element | null, live: boolean, n: number } | null} */
  let g = null;
  const ids = () => {
    if (!g) return [];
    const { lo, hi, col } = g;
    return /** @type {HTMLElement[]} */ ([...host.querySelectorAll('.td-row[data-id]')])
      .filter(r => (!col || col.contains(r)) && r.getBoundingClientRect().top < hi && r.getBoundingClientRect().bottom > lo)
      .map(r => String(r.dataset.id));
  };
  /** the two fingers' targets: a row drawn anew (select mode starts) leaves its finger's target out of the page, and
   * a touch's events go to that target only, never up to the host: so the moves are heard there @type {EventTarget[]} */
  let held = [];
  const release = () => {
    for (const t of held) { t.removeEventListener('touchmove', /** @type {EventListener} */ (move)); t.removeEventListener('touchend', end); t.removeEventListener('touchcancel', end); }
    held = [];
  };
  /** @param {TouchEvent} e */
  const start = e => {
    g = null;
    release();
    if (e.touches.length !== 2 || !o.can()) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    if (!host.contains(/** @type {Node} */ (a.target)) || !host.contains(/** @type {Node} */ (b.target))) return;
    const board = host.classList.contains('td-board');
    const col = board ? /** @type {Element} */ (a.target).closest('.td-col') : null;
    held = [...new Set([a.target, b.target])];
    for (const t of held) { t.addEventListener('touchmove', /** @type {EventListener} */ (move), { passive: false }); t.addEventListener('touchend', end); t.addEventListener('touchcancel', end); }
    g = { y: [a.clientY, b.clientY], x: [a.clientX, b.clientX], lo: Math.min(a.clientY, b.clientY), hi: Math.max(a.clientY, b.clientY), col, live: false, n: 0 };
  };
  /** @param {TouchEvent} e */
  const move = e => {
    if (!g || e.touches.length !== 2) return;
    const t = [e.touches[0], e.touches[1]];
    const dy = (Math.abs(t[0].clientY - g.y[0]) + Math.abs(t[1].clientY - g.y[1])) / 2;
    const dx = (Math.abs(t[0].clientX - g.x[0]) + Math.abs(t[1].clientX - g.x[1])) / 2;
    if (!g.live) {
      if (dy < SLOP && dx < SLOP) return;
      if (dy < dx * 1.5 || !claim('select')) { g = null; return; }   // sideways, or a part above has the touch
      g.live = true;
    }
    if (e.cancelable) e.preventDefault();
    g.lo = Math.min(g.lo, t[0].clientY, t[1].clientY);
    g.hi = Math.max(g.hi, t[0].clientY, t[1].clientY);
    const now = ids();
    if (now.length > g.n) { g.n = now.length; haptic('tick'); }
    if (now.length) o.tick(now);
  };
  const end = () => { g = null; release(); };
  host.addEventListener('touchstart', start, { passive: true });
  return () => { host.removeEventListener('touchstart', start); end(); };
}
