// The empty states' drawings, loaded after the first paint so they stay out of the startup budget.
const SVG = 'http://www.w3.org/2000/svg';
/** a small SVG from a list of [tag, attributes] @param {[string, Record<string, string>][]} nodes */
function art(nodes) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 220 170'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.classList.add('td-empty-svg');
  for (const [tag, attrs] of nodes) { const n = document.createElementNS(SVG, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); svg.append(n); }
  return svg;
}
const SPARK = 'M0-9 2.2-2.2 9 0 2.2 2.2 0 9-2.2 2.2-9 0-2.2-2.2z';
/** the empty states' own drawings: a tray with a spark (the Inbox), a sun over a horizon (a day), else a ticked circle */
/** @param {'inbox' | 'day'} kind */
export const emptyArt = kind => ART[kind]();
const ART = {
  inbox: () => art([
    ['ellipse', { cx: '110', cy: '150', rx: '62', ry: '8', fill: 'currentColor', opacity: '.12' }],
    ['path', { d: 'M52 96c-8-22 10-46 34-46 14 0 20 6 24 6s12-10 30-10c26 0 40 28 30 50z', fill: 'currentColor', opacity: '.1' }],
    ['path', { d: 'M62 88h96l14 34v18a8 8 0 0 1-8 8H56a8 8 0 0 1-8-8v-18z', fill: '#f2a31b' }],
    ['path', { d: 'M62 88h96l14 34h-42l-8 12h-24l-8-12H48z', fill: '#ffcf55' }],
    ['path', { d: 'M48 122h34l8 12h40l8-12h34', fill: 'none', stroke: '#d98a0b', 'stroke-width': '3', 'stroke-linejoin': 'round' }],
    ['path', { d: SPARK, transform: 'translate(150 52) scale(1.6)', fill: '#ffc83d' }],
    ['path', { d: SPARK, transform: 'translate(52 76) scale(.8)', fill: '#ffc83d' }],
    ['path', { d: SPARK, transform: 'translate(176 90) scale(.7)', fill: '#ffc83d' }],
  ]),
  day: () => art([
    ['ellipse', { cx: '110', cy: '150', rx: '66', ry: '8', fill: 'currentColor', opacity: '.12' }],
    ['circle', { cx: '110', cy: '84', r: '44', fill: '#ffcf55' }],
    ['circle', { cx: '110', cy: '84', r: '30', fill: '#f2a31b' }],
    ['path', { d: 'M30 118h160', stroke: 'currentColor', 'stroke-width': '4', 'stroke-linecap': 'round', opacity: '.35' }],
    ['path', { d: 'M54 134h112', stroke: 'currentColor', 'stroke-width': '4', 'stroke-linecap': 'round', opacity: '.2' }],
    ['path', { d: SPARK, transform: 'translate(168 40) scale(1.2)', fill: '#ffc83d' }],
    ['path', { d: SPARK, transform: 'translate(50 52) scale(.8)', fill: '#ffc83d' }],
  ]),
};
