// Browse (#browse): the person's pill and the Settings gear at the top, then cards of rows: the Inbox, Today, Upcoming
// and Completed; the favourite projects; and "My Projects" with its sub-projects under each and a + for a new one.
// Counts show when the showCounts option is on. The fold of "My Projects" is kept on this device.
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { INBOX } from '../items.js';
import { projectTree, projectCounts, todayCount, upcomingCount } from '../tasks.js';
import { colorHex } from '../colors.js';
import { dayKey } from '../dates.js';
import { byOrder } from '../order.js';
import { screens } from '../shell.js';
import { el } from './pick.js';

/** @typedef {import('./views.js').Ctx} Ctx */
const FOLD_KEY = 'browse:projects-folded';

/** a Browse row: an icon at 16, the name at 56, a count and a chevron
 * @param {{ label: string, ic: import('app-ui/icons/lucide.js').IconNodes, color?: string, count?: number | null, depth?: number, run: () => void }} o */
function row({ label, ic, color, count, depth, run }) {
  const li = el('li', '');
  const b = /** @type {HTMLButtonElement} */ (el('button', 'td-browse-row'));
  b.type = 'button';
  if (depth) b.style.setProperty('--depth', String(depth));
  const i = icon(ic, { class: 'td-browse-icon' });
  if (color) i.style.color = color;
  b.append(i, el('span', 'td-browse-label', label));
  if (typeof count === 'number' && count > 0) b.append(el('span', 'td-browse-count', String(count)));
  b.append(icon(ICONS.chevronRight, { class: 'td-browse-chevron' }));
  b.addEventListener('click', run);
  li.append(b);
  return li;
}

/** @param {string} label @param {HTMLElement[]} rows */
const card = (label, rows) => {
  const ul = el('ul', 'td-card td-browse-card');
  ul.setAttribute('aria-label', label);
  ul.append(...rows);
  return ul;
};

/** the tab a row stands for, as a tap on the tab bar would @param {string} id */
const tab = id => /** @type {HTMLElement | null} */ (document.querySelector(`.ui-tabbar > [data-tab-id="${id}"]`))?.click();

let watching = false;

/** @param {Ctx} ctx @param {HTMLElement} host */
export function drawBrowse(ctx, host) {
  if (!watching) { watching = true; ctx.app.settings.watch('showCounts', () => drawBrowse(ctx, host)); }
  const data = ctx.data(), today = dayKey(), counts = projectCounts(data.tasks);
  const showCounts = !!ctx.app.settings.get('showCounts');
  const n = (/** @type {number} */ v) => (showCounts ? v : null);

  // the top: the person, and the gear
  const top = el('div', 'td-browse-top');
  const me = el('span', 'td-pill'), u = ctx.user();
  const face = el('span', 'td-avatar');
  if (u?.photo) { const img = Object.assign(document.createElement('img'), { src: u.photo, alt: '', referrerPolicy: 'no-referrer' }); face.append(img); }
  else if (u?.name) face.textContent = u.name.trim().charAt(0).toUpperCase();
  else face.append(icon(ICONS.user));
  me.append(face, el('span', 'td-pill-name', u?.name || 'Signed out'));
  const gear = /** @type {HTMLButtonElement} */ (el('button', 'td-round'));
  gear.type = 'button';
  gear.id = 'browse-settings';
  gear.setAttribute('aria-label', 'Settings');
  gear.append(icon(ICONS.settings));
  gear.addEventListener('click', () => screens()?.push('#settings-page'));
  top.append(me, gear);

  const places = card('Places', [
    row({ label: 'Inbox', ic: ICONS.inbox, count: n(counts.get(INBOX) ?? 0), run: () => tab('inbox') }),
    row({ label: 'Today', ic: ICONS.calendar, count: n(todayCount(data.tasks, today)), run: () => tab('today') }),
    row({ label: 'Upcoming', ic: ICONS.calendarDays, count: n(upcomingCount(data.tasks, today)), run: () => tab('upcoming') }),
    row({ label: 'Completed', ic: ICONS.circleCheck, run: () => screens()?.push('#completed-page') }),
  ]);

  const projectRow = (/** @type {import('../items.js').Project} */ p, /** @type {number} */ depth) => row({
    label: p.name, ic: ICONS.hash, color: colorHex(p.color), depth, count: n(counts.get(p.id) ?? 0), run: () => ctx.openProject(p.id) });

  const parts = [top, places];
  const favs = byOrder(data.projects.filter(p => p.favorite && p.id !== INBOX && p.name));
  if (favs.length) {
    const h = el('h2', 'td-browse-head');
    h.append(el('span', '', 'Favorites'));
    parts.push(h, card('Favorites', favs.map(p => projectRow(p, 0))));
  }

  // My Projects: a fold, and a + for a new one
  const folded = localStorage.getItem(FOLD_KEY) === '1';
  const head = el('div', 'td-browse-head');
  const fold = /** @type {HTMLButtonElement} */ (el('button', 'td-browse-fold'));
  fold.type = 'button';
  fold.setAttribute('aria-expanded', String(!folded));
  fold.append(el('span', '', 'My Projects'), icon(folded ? ICONS.chevronRight : ICONS.chevronDown, { class: 'td-browse-fold-icon' }));
  fold.addEventListener('click', () => { localStorage.setItem(FOLD_KEY, folded ? '0' : '1'); drawBrowse(ctx, host); });
  head.append(fold);
  if (ctx.canWrite()) {
    const add = /** @type {HTMLButtonElement} */ (el('button', 'td-icon-btn td-browse-add'));
    add.type = 'button';
    add.setAttribute('aria-label', 'Add project');
    add.append(icon(ICONS.plus));
    add.addEventListener('click', () => ctx.openProjectSheet({}));
    head.append(add);
  }
  parts.push(head);
  if (!folded) {
    const tree = projectTree(data.projects);
    if (tree.length) parts.push(card('My Projects', tree.map(({ project, depth }) => projectRow(project, depth))));
    else parts.push(el('p', 'td-browse-none', ctx.canWrite() ? 'No projects yet. Tap + to add one.' : 'No projects yet.'));
  }
  host.replaceChildren(...parts);
}
