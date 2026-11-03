// The empty states' drawings, loaded after the first paint so they stay out of the startup budget, and the Inbox's
// small "?" (bottom left) that opens a few tips of our own.
import { alertModal, icon } from '@core/ui';
import { MORE } from '../icons-more.js';
const SVG = 'http://www.w3.org/2000/svg';
/** a small SVG from a list of [tag, attributes] @param {[string, Record<string, string>][]} nodes */
function art(nodes) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 220 170'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.classList.add('td-empty-svg');
  for (const [tag, attrs] of nodes) { const n = document.createElementNS(SVG, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); svg.append(n); }
  return svg;
}
const SPARK = 'M0-9 2.2-2.2 9 0 2.2 2.2 0 9-2.2 2.2-9 0-2.2-2.2z';
/** the empty states' own drawings: a tray with a spark (the Inbox), a sun over a horizon (a day), a ticked badge (a day
 * all done), stacked cards with a plus (a project), a tag beside a drop (Filters & Labels), a funnel (a filter), a tag (a
 * label), a page of lines (Reporting), rising bars (Productivity) */
/** @typedef {'inbox' | 'day' | 'done' | 'project' | 'tags' | 'filter' | 'label' | 'activity' | 'chart'} ArtKind */
/** @param {ArtKind} kind */
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
  done: () => art([
    ['ellipse', { cx: '110', cy: '150', rx: '62', ry: '8', fill: 'currentColor', opacity: '.12' }],
    ['circle', { cx: '110', cy: '84', r: '50', fill: '#8fd0a4' }],
    ['circle', { cx: '110', cy: '84', r: '38', fill: '#3fa465' }],
    ['path', { d: 'M90 85l14 14 28-30', fill: 'none', stroke: '#fff', 'stroke-width': '9', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ['path', { d: SPARK, transform: 'translate(170 42) scale(1.3)', fill: '#ffc83d' }],
    ['path', { d: SPARK, transform: 'translate(48 110) scale(.8)', fill: '#ffc83d' }],
  ]),
  project: () => art([
    ['ellipse', { cx: '110', cy: '150', rx: '62', ry: '8', fill: 'currentColor', opacity: '.12' }],
    ['rect', { x: '58', y: '54', width: '96', height: '80', rx: '10', fill: '#f2a31b', transform: 'rotate(-6 106 94)' }],
    ['rect', { x: '66', y: '46', width: '96', height: '80', rx: '10', fill: '#ffcf55' }],
    ['path', { d: 'M80 70h52M80 88h40', stroke: '#d98a0b', 'stroke-width': '5', 'stroke-linecap': 'round' }],
    ['circle', { cx: '160', cy: '124', r: '18', fill: '#7ab8f5' }],
    ['path', { d: 'M160 115v18M151 124h18', stroke: '#fff', 'stroke-width': '4', 'stroke-linecap': 'round' }],
  ]),
  tags: () => art([
    ['ellipse', { cx: '110', cy: '150', rx: '62', ry: '8', fill: 'currentColor', opacity: '.12' }],
    ['path', { d: 'M58 52h44l42 42-36 36-50-50z', fill: '#ffcf55', transform: 'rotate(-8 100 90)' }],
    ['circle', { cx: '76', cy: '68', r: '6', fill: '#f2a31b' }],
    ['path', { d: 'M156 72c0 0-20 22-20 36a20 20 0 0 0 40 0c0-14-20-36-20-36z', fill: '#7ab8f5' }],
    ['path', { d: SPARK, transform: 'translate(176 46) scale(1.1)', fill: '#ffc83d' }],
  ]),
  filter: () => art([
    ['ellipse', { cx: '110', cy: '150', rx: '62', ry: '8', fill: 'currentColor', opacity: '.12' }],
    ['path', { d: 'M56 46h108l-40 50v38l-28 12V96z', fill: '#7ab8f5' }],
    ['path', { d: 'M56 46h108l-10 12H66z', fill: '#4d97e0' }],
    ['path', { d: SPARK, transform: 'translate(170 100) scale(1.2)', fill: '#ffc83d' }],
    ['path', { d: SPARK, transform: 'translate(48 92) scale(.8)', fill: '#ffc83d' }],
  ]),
  label: () => art([
    ['ellipse', { cx: '110', cy: '150', rx: '62', ry: '8', fill: 'currentColor', opacity: '.12' }],
    ['path', { d: 'M70 60h46l44 44-38 38-52-52z', fill: '#ffcf55' }],
    ['path', { d: 'M70 60h46l10 10H80z', fill: '#f2a31b', opacity: '.6' }],
    ['circle', { cx: '90', cy: '80', r: '7', fill: '#f2a31b' }],
    ['path', { d: SPARK, transform: 'translate(160 50) scale(1.3)', fill: '#ffc83d' }],
  ]),
  activity: () => art([
    ['ellipse', { cx: '110', cy: '150', rx: '62', ry: '8', fill: 'currentColor', opacity: '.12' }],
    ['rect', { x: '66', y: '30', width: '88', height: '112', rx: '10', fill: '#ffcf55' }],
    ['rect', { x: '92', y: '24', width: '36', height: '14', rx: '5', fill: '#f2a31b' }],
    ['path', { d: 'M82 64h56M82 84h56M82 104h36', stroke: '#d98a0b', 'stroke-width': '5', 'stroke-linecap': 'round' }],
    ['path', { d: SPARK, transform: 'translate(172 56) scale(1.2)', fill: '#ffc83d' }],
  ]),
  chart: () => art([
    ['ellipse', { cx: '110', cy: '150', rx: '62', ry: '8', fill: 'currentColor', opacity: '.12' }],
    ['rect', { x: '56', y: '102', width: '24', height: '40', rx: '5', fill: '#ffcf55' }],
    ['rect', { x: '98', y: '78', width: '24', height: '64', rx: '5', fill: '#f2a31b' }],
    ['rect', { x: '140', y: '50', width: '24', height: '92', rx: '5', fill: '#7ab8f5' }],
    ['path', { d: SPARK, transform: 'translate(176 34) scale(1.2)', fill: '#ffc83d' }],
  ]),
};

/** the Inbox's "?": a small round button that opens our own short tips */
export function inboxHelp() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'td-empty-help';
  b.setAttribute('aria-label', 'Inbox tips');
  b.append(icon(MORE.circleHelp));
  b.addEventListener('click', () => { void alertModal(TIPS, { title: 'Inbox tips' }); });
  return b;
}
const TIPS = 'New tasks with no project wait here.\nType a date, #project or p1 in quick add and it is set for you.\nMove a task out with a swipe, a drag or its sheet.';
