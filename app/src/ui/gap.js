// The rows below a completed one slide up over its gap (transform only, 150 ms, the row drag's curve) before the list is
// drawn again, so nothing jumps; none under reduced motion. Loaded on first use (views.js, lazy.gap).

/** @param {HTMLElement} row @returns {Promise<unknown>} */
export function closeGap(row) {
  const h = row.offsetHeight, host = row.closest('[id$="-page"]') ?? document;
  if (!h || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  const below = [...host.querySelectorAll('.td-row')].filter(r => r !== row && (row.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING) && !row.contains(r));
  return Promise.all(below.map(r => r.animate([{ transform: 'none' }, { transform: `translateY(${-h}px)` }], { duration: 150, easing: 'cubic-bezier(.3,0,.7,1)', fill: 'forwards' }).finished.catch(() => {})));
}
