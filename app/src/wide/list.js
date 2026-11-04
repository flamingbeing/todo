// The wide list pages (840 px and up only; wide/side.js imports this file, so a phone or a tablet never loads it):
// Today, the Inbox, a project's page and a label's or filter's page. Their look is wide.css's; this file adds what the
// phone's lists do not have:
//   html[data-td-list-top]  set while one of those pages is on top: the bar keeps only its buttons, the page shows its
//                           own big title (wide.css)
//   Today's count           "(circle-check) 9 tasks" under the title, the bar's own count (views.js data-sub) copied
//   a project's crumbs      "My Projects /" (and its parents) over its title
//   inline "Add task"       at the end of Today's day, of the Inbox's and a project's tasks outside sections (each
//                           section already has one): quick add for that place
//   the Display button      reads "Display", or "Display: n" while n of the list's choices are not its own
//   group heads' count and  a heading the phone draws bare (Today's Overdue and day, Upcoming's days, a grouped list's
//   fold chevron            groups) gets its open tasks' count beside it and a chevron 24 px to its left that folds the
//                           group (remembered on this device only)
// The hover actions on a row are wide/hover.js's. Back under 840 px everything added here goes (and the phone's
// lists are as they were).
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { dayKey } from '../dates.js';
import { addRow } from '../ui/row.js';
import { el } from '../screens/pick.js';
import { LIST_PAGES, addPreset, crumbs } from './list-parts.js';
import { changedCount } from './table-parts.js';
import { cleanDisplay } from '../tasks.js';

/** @typedef {import('../screens/views.js').Ctx} Ctx */

let started = false;

/** @param {Ctx} ctx */
export function startList(ctx) {
  if (started) return;
  started = true;
  const big = matchMedia('(min-width: 840px)'), html = document.documentElement;
  const $ = (/** @type {string} */ id) => document.getElementById(id);

  // Today's count, under its title
  const count = el('p', 'td-wide-count');
  const words = el('span', '');
  count.append(icon(ICONS.circleCheck, { class: 'td-wide-count-icon' }), words);
  $('today-title')?.after(count);
  // a project's crumbs, over its title
  const crumb = el('p', 'td-wide-crumb');
  $('project-title')?.before(crumb);

  const bar = /** @type {HTMLElement | null} */ (document.querySelector('.ui-bar-title'));
  const sync = () => {
    const on = big.matches, top = ctx.top();
    html.toggleAttribute('data-td-list-top', on && LIST_PAGES.includes(top));
    if (top === 'today-page' && bar) words.textContent = bar.dataset.sub ?? '';
    count.hidden = !on || !words.textContent;
    const c = on && top === 'project-page' ? crumbs(ctx.data().projects, ctx.project()) : [];
    crumb.textContent = c.length ? `${c.join(' / ')} /` : '';
    crumb.hidden = !c.length;
    if (!on) for (const b of document.querySelectorAll('.td-wide-add, .td-wide-fold, .td-wide-gcount')) b.remove();
    else for (const h of HOSTS) adds(ctx, h);
    if (!on) for (const g of document.querySelectorAll('[data-wide-folded]')) g.removeAttribute('data-wide-folded');
    else for (const h of HEAD_HOSTS) heads(h);
  };
  if (bar) new MutationObserver(sync).observe(bar, { attributes: true, attributeFilter: ['data-sub'] });
  const host = document.querySelector('.ui-screens');
  host?.addEventListener('ui-tab', () => requestAnimationFrame(sync));
  host?.addEventListener('ui-screen', () => requestAnimationFrame(sync));
  big.addEventListener('change', sync);
  // (each list is drawn again whole on every change: its rows are put back once it is)
  for (const h of HEAD_HOSTS) {
    const into = $(h);
    if (into) new MutationObserver(() => {
      if (big.matches) { const a = HOSTS.find(x => x === h); if (a) adds(ctx, a); heads(h); }
      if (h === 'project') sync();
    }).observe(into, { childList: true });
  }
  sync();

  // the Display button's words (views.js keeps its list in data-view)
  const btn = $('display-btn');
  if (btn) {
    const words = el('span', 'td-display-words');
    const put = () => {
      const on = big.matches, v = btn.dataset.view;
      const n = on && v ? changedCount(ctx.display(v), cleanDisplay({}, v)) : 0;
      words.textContent = n ? `Display: ${n}` : 'Display';
      if (on && !words.isConnected) btn.append(words);
      if (!on) words.remove();
      btn.setAttribute('aria-label', words.textContent);
    };
    new MutationObserver(put).observe(btn, { attributes: true, attributeFilter: ['class', 'data-view', 'hidden'] });
    ctx.app.settings.watch('display', put);
    big.addEventListener('change', put);
    put();
  }
}

/** @type {('today' | 'inbox' | 'project')[]} */
const HOSTS = ['today', 'inbox', 'project'];

/** the lists whose bare group heads get a count and a fold chevron */
const HEAD_HOSTS = [...HOSTS, 'upcoming', 'place'];

const FOLDS = 'td-wide-folds';
/** the groups folded on this device ("host|day or title") @type {Set<string>} */
let folds;
try { folds = new Set(JSON.parse(localStorage.getItem(FOLDS) || '[]')); } catch { folds = new Set(); }

/** a bare group head's count and fold chevron (a section's head has its own: ui/row.js) @param {string} h */
function heads(h) {
  const into = document.getElementById(h);
  if (!into || into.classList.contains('td-board')) return;
  for (const head of into.querySelectorAll(':scope > .td-group > .td-group-head:not(.is-plain)')) {
    const title = head.querySelector(':scope > h2.td-group-title');
    if (!title || head.querySelector(':scope > .td-wide-fold')) continue;
    const g = /** @type {HTMLElement} */ (head.parentElement);
    const n = g.querySelectorAll(':scope > .td-rows > .td-row:not(.is-complete):not([style*="--depth"])').length;
    if (!g.querySelector(':scope > .td-rows > .td-row')) continue;
    if (n) title.append(el('span', 'td-group-count td-wide-gcount', String(n)));
    const name = title.firstChild?.textContent ?? '';
    const key = `${h}|${g.dataset.day ?? name}`;
    const b = /** @type {HTMLButtonElement} */ (el('button', 'td-wide-fold'));
    b.type = 'button';
    b.setAttribute('aria-label', `Fold ${name}`);
    b.append(icon(ICONS.chevronDown, { class: 'td-wide-fold-ic' }));
    const put = (/** @type {boolean} */ shut) => { b.setAttribute('aria-expanded', String(!shut)); g.toggleAttribute('data-wide-folded', shut); };
    put(folds.has(key));
    b.addEventListener('click', () => {
      const shut = !folds.has(key);
      if (shut) folds.add(key); else folds.delete(key);
      try { localStorage.setItem(FOLDS, JSON.stringify([...folds])); } catch { /* private window: open again on reload */ }
      put(shut);
    });
    head.prepend(b);
  }
}

/** the inline "Add task" rows a list lacks @param {Ctx} ctx @param {'today' | 'inbox' | 'project'} h */
function adds(ctx, h) {
  const into = document.getElementById(h);
  if (!into) return;
  const plain = ctx.canWrite() && !into.classList.contains('td-board') && !into.dataset.grouped && into.dataset.sorted !== 'cal' && !into.querySelector(':scope > .td-table-box');
  const have = into.querySelector(':scope > .td-wide-add, :scope > .td-group > .td-wide-add');
  if (!plain) { have?.remove(); return; }
  if (have) return;
  const today = dayKey();
  const row = addRow('Add task', () => ctx.openQuickAdd(addPreset(h, { today, projectId: ctx.project() })));
  row.classList.add('td-wide-add');
  if (h === 'today') {
    const day = into.querySelector(`:scope > .td-group[data-day="${today}"]`);
    if (day) day.append(row); else into.append(row);
    return;
  }
  // after the tasks outside sections; with none, before the first section (none at all: the list is the row)
  const loose = into.querySelector(':scope > .td-rows');
  if (loose) loose.after(row);
  else if (!into.querySelector(':scope > .td-section')) into.append(row);
}
