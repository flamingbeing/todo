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
    if (!on) for (const b of document.querySelectorAll('.td-wide-add')) b.remove();
    else for (const h of HOSTS) adds(ctx, h);
  };
  if (bar) new MutationObserver(sync).observe(bar, { attributes: true, attributeFilter: ['data-sub'] });
  const host = document.querySelector('.ui-screens');
  host?.addEventListener('ui-tab', () => requestAnimationFrame(sync));
  host?.addEventListener('ui-screen', () => requestAnimationFrame(sync));
  big.addEventListener('change', sync);
  // (each list is drawn again whole on every change: its rows are put back once it is)
  for (const h of HOSTS) {
    const into = $(h);
    if (into) new MutationObserver(() => { if (big.matches) adds(ctx, h); if (h === 'project') sync(); }).observe(into, { childList: true });
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
