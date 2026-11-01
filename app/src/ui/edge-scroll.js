// Scrolling by itself while something is dragged near an edge (rows, board cards, the + button, calendar blocks).
// A hot zone at each end of the scroll area (below the top bar and above the tab bar, or a board's sides): the
// deeper the finger goes into it, the faster the area scrolls, from 0 at the zone's inner edge up to the most at the
// edge, easing in (v = max * t^2, t = 0..1 into the zone). The numbers (60 px zones, 900 px/s) follow the usual iOS
// feel; no published figure was found, so they are a convention, unmeasured. A frame loop runs on real elapsed time
// and stops when the finger leaves the zone, the area can scroll no further that way, or the drag ends; after each
// step the caller measures its drop target again.
// App-only: app-ui's drag-list.js has no auto-scroll and select-mode.js keeps its own unexported one. Asked of app-ui
// as an `autoScroll` option; drop this file once the kit has it.

export const ZONE = 60, MAX_SPEED = 900;

/**
 * The scroll speed (px/s; negative: back, towards the start) for a finger at p in an area from lo to hi.
 * @param {number} p @param {number} lo @param {number} hi @param {number} [zone] @param {number} [max]
 */
export function edgeSpeed(p, lo, hi, zone = ZONE, max = MAX_SPEED) {
  const z = Math.max(1, Math.min(zone, (hi - lo) / 2));
  const t = p < lo + z ? -(lo + z - p) / z : p > hi - z ? (p - (hi - z)) / z : 0;
  const k = Math.max(-1, Math.min(1, t));
  return Math.sign(k) * max * k * k;
}

/** the element a list scrolls in (the page when none of its boxes does) @param {Element} from */
export function scrollerOf(from) {
  for (let n = from.parentElement; n && n !== document.body; n = n.parentElement) {
    const y = getComputedStyle(n).overflowY;
    if ((y === 'auto' || y === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return /** @type {HTMLElement} */ (document.scrollingElement ?? document.documentElement);
}

/** what of a scroller shows: below the top bar, above the tab bar (and above `foot` when given) @param {Element} sc
 * @param {number} [foot] @returns {[number, number]} */
export function shownSpan(sc, foot = Infinity) {
  const page = sc === document.scrollingElement || sc === document.documentElement;
  const r = page ? { top: 0, bottom: innerHeight } : sc.getBoundingClientRect();
  let lo = r.top, hi = Math.min(r.bottom, innerHeight, foot);
  const bar = document.querySelector('.ui-bar'), tabs = document.querySelector('.ui-tabbar');
  if (bar instanceof HTMLElement && bar.offsetParent) lo = Math.max(lo, bar.getBoundingClientRect().bottom);
  if (tabs instanceof HTMLElement && tabs.offsetParent) { const t = tabs.getBoundingClientRect(); if (t.height && t.top > lo) hi = Math.min(hi, t.top); }
  return [lo, hi];
}

/**
 * The loop. poke() after each finger move (it starts the loop when needed); stop() when the drag ends.
 * @param {{ el: () => Element, axis?: 'x' | 'y', span: () => [number, number], at: () => number, on: () => boolean, moved: () => void,
 *   zone?: number }} o  el: what scrolls; span: its hot area's ends on screen; at: the finger on that axis; on: whether the
 *   drag still runs; moved: called after each step (measure the drop target again)
 */
export function edgeScroll(o) {
  let raf = 0, last = 0, rest = 0;
  const stop = () => { cancelAnimationFrame(raf); raf = 0; rest = 0; };
  const step = (/** @type {number} */ now) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const [lo, hi] = o.span(), v = o.on() ? edgeSpeed(o.at(), lo, hi, o.zone) : 0;
    if (!v) { stop(); return; }
    const el = o.el(), key = o.axis === 'x' ? 'scrollLeft' : 'scrollTop';
    rest += v * dt;
    const by = Math.trunc(rest);
    if (by) {
      const was = el[key];
      el[key] = was + by;
      rest -= by;
      // (the end of the list that way)
      if (el[key] === was) { stop(); return; }
      o.moved();
    }
    raf = requestAnimationFrame(step);
  };
  return {
    poke() {
      if (raf || !o.on()) return;
      const [lo, hi] = o.span();
      if (!edgeSpeed(o.at(), lo, hi, o.zone)) return;
      last = performance.now();
      raf = requestAnimationFrame(step);
    },
    stop,
  };
}
