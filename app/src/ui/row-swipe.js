// Swiping a task row sideways (app-ui's drag, as 'cards' in the arbiter, so a page swipe stands down over a row): the
// row slides over a coloured band with the action's icon, green with a check for Complete and violet with a calendar
// for Schedule (red with a bin for Delete), as chosen per device in Settings > General. Past about a third of the row
// (a tick there), or flung that way, the action runs; short of it the row springs back. Nothing swipes in select mode,
// while a row is held up for a drag, or for a person who may only read.
import { drag, glide, haptic, icon } from '@core/ui';
import { ICONS } from '../icons.js';

/** @typedef {'complete' | 'schedule' | 'delete' | 'none'} Swipe */
const LOOK = /** @type {Record<Exclude<Swipe, 'none'>, { color: string, ic: import('app-ui/icons/lucide.js').IconNodes }>} */ ({
  complete: { color: '#058527', ic: ICONS.check },
  schedule: { color: '#692EC2', ic: ICONS.calendar },
  delete: { color: '#DC4C3E', ic: ICONS.trash2 },
});
const FLING = 0.6;   // px/ms

/**
 * @param {HTMLElement} host  a list page's body (its rows come and go; the host stays)
 * @param {{ ways: () => { right: Swipe, left: Swipe }, can: () => boolean, run: (way: Swipe, id: string, row: HTMLElement) => unknown }} o  run: false (or a promise of it) when nothing was done
 * @returns {() => void} stop
 */
export function swipeRows(host, o) {
  /** @type {HTMLElement | null} */
  let row = null;
  /** @type {HTMLElement | null} */
  let band = null;
  /** @type {HTMLElement[]} */
  let parts = [];
  let width = 1, past = false, side = 0;
  const reach = () => Math.min(140, width * 0.35);
  const ways = () => o.ways();
  const wayOf = (/** @type {number} */ x) => (x > 0 ? ways().right : x < 0 ? ways().left : 'none');
  /** the band behind for the side the row moves to @param {number} s 1 right, -1 left */
  const showBand = s => {
    if (!row || side === s) return;
    side = s;
    band?.remove();
    const way = wayOf(s);
    if (way === 'none') { band = null; return; }
    band = document.createElement('div');
    band.className = 'td-swipe-band';
    band.dataset.side = s > 0 ? 'right' : 'left';
    band.style.background = LOOK[way].color;
    band.append(icon(LOOK[way].ic, { class: 'td-swipe-icon' }));
    row.prepend(band);
  };
  const place = (/** @type {number} */ x) => {
    for (const p of parts) p.style.transform = x ? `translateX(${x}px)` : '';
    // the band covers just the room the row has left, its icon at the row's edge
    if (band) band.style.transform = x > 0 ? `translateX(calc(${x}px - 100%))` : `translateX(calc(100% + ${x}px))`;
    const i = /** @type {HTMLElement | null | undefined} */ (band?.firstElementChild);
    if (i) {
      const far = Math.abs(x) >= reach();
      i.style.opacity = String(Math.min(1, Math.abs(x) / reach()));
      i.style.transform = far ? 'scale(1.15)' : '';
    }
  };
  /** the moving parts for a glide: the row's own, and the band with them @returns {[HTMLElement, (k: number) => Record<string, string>][]} */
  const slide = () => [
    ...parts.map(p => /** @type {[HTMLElement, (k: number) => Record<string, string>]} */ ([p, k => ({ transform: k ? `translateX(${k}px)` : '' })])),
    ...(band ? [/** @type {[HTMLElement, (k: number) => Record<string, string>]} */ ([band, k => ({ transform: k > 0 ? `translateX(calc(${k}px - 100%))` : `translateX(calc(100% + ${k}px))` })])] : []),
  ];
  // (a glide holds its last frame: let it go, so the next drag's own transforms show)
  const settle = (/** @type {HTMLElement[]} */ els) => { for (const e of els) { for (const a of e.getAnimations()) a.cancel(); e.style.transform = ''; } };
  const reset = () => {
    settle(parts);
    band?.remove();
    row?.classList.remove('is-swiping');
    row = null; band = null; parts = []; side = 0; past = false;
  };

  return drag(host, {
    axis: 'x', name: 'cards',
    filter: e => {
      if (!o.can() || row) return false;
      const r = /** @type {HTMLElement | null} */ (/** @type {Element} */ (e.target).closest('.td-row'));
      if (!r || !host.contains(r) || r.classList.contains('is-done') || r.classList.contains('is-lifted')) return false;
      const w = ways();
      if (w.right === 'none' && w.left === 'none') return false;
      row = r;
      width = r.getBoundingClientRect().width || 1;
      parts = /** @type {HTMLElement[]} */ ([...r.children].filter(c => !c.classList.contains('td-swipe-band')));
      return true;
    },
    start: () => 0,
    bounds: () => [ways().left === 'none' ? 0 : -width, ways().right === 'none' ? 0 : width],
    move: x => {
      if (!row) return;
      if (!o.can() || row.classList.contains('is-lifted')) { place(0); return; }
      if (x) { row.classList.add('is-swiping'); showBand(Math.sign(x)); }
      place(x);
      const now = Math.abs(x) >= reach() && wayOf(x) !== 'none';
      if (now !== past) { past = now; haptic('threshold'); }
    },
    end: (x, v) => {
      const r = row;
      if (!r) return;
      const way = wayOf(x);
      const go = way !== 'none' && o.can() && !r.classList.contains('is-lifted')
        && (Math.abs(x) >= reach() || (Math.abs(v) > FLING && Math.sign(v) === Math.sign(x) && Math.abs(x) > 24));
      const id = String(r.dataset.id);
      if (!go) {
        void glide(slide(), x, 0, v).done.then(reset);
        return;
      }
      // Complete and Delete take the row off the far side; Schedule springs it back behind the sheet
      const off = way === 'schedule' ? 0 : Math.sign(x) * width;
      const kept = parts;
      void glide(slide(), x, off, v).done.then(() => {
        if (way === 'schedule') reset();
        else { band?.remove(); r.classList.remove('is-swiping'); row = null; band = null; parts = []; side = 0; past = false; }
        // (an action that did not go ahead, a delete not confirmed, puts the row back)
        void Promise.resolve(o.run(way, id, r)).then(ok => { if (ok === false) settle(kept); });
      });
    },
  });
}
