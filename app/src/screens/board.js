// A project as a board (its view is 'board'; Display switches it): one column per section, side by side, a column to
// a screen's width less a glimpse of the next, snapping as it is scrolled sideways. The tasks outside the sections
// come first in "No section" when there are any. A column has its name, how many tasks, a "…" (rename, add a task,
// delete), its cards and "Add task"; the last column adds a section. A card is held to lift it and dragged in its
// column or to another (row-drag.js knows a board). Dots under it say which column is shown.
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { projectView, sorter, narrowTasks } from '../tasks.js';
import { dayKey } from '../dates.js';
import { rowList, addRow, emptyNote } from '../ui/row.js';
import { el } from './pick.js';

/** @typedef {import('./views.js').Ctx} Ctx */

const watched = new WeakSet();

/**
 * @param {Ctx} ctx @param {string} pid @param {HTMLElement} host @param {HTMLElement} below  for the dots
 * @param {import('../tasks.js').Display} d
 */
export function drawBoard(ctx, pid, host, below, d) {
  const data = ctx.data(), canWrite = ctx.canWrite(), today = dayKey();
  const v = projectView(data.tasks, data.sections, pid, { cmp: d.sort === 'manual' ? undefined : sorter(d.sort, d.dir),
    keep: t => (!t.done || d.completed) && !!narrowTasks([t], d, data.labels, today).length });
  const c = ctx.rows({});
  const naming = ctx.sections.naming();
  /** @type {HTMLElement[]} */
  const cols = [];
  const column = (/** @type {import('../items.js').Section | null} */ s, /** @type {import('../tree.js').Line<import('../items.js').Task>[]} */ lines) => {
    const tops = lines.filter(l => l.depth === 0), name = s ? s.name : 'No section';
    const col = el('section', s ? 'td-group td-section td-col' : 'td-group td-col');
    if (s) col.dataset.id = s.id;
    col.setAttribute('aria-label', name);
    if (s && naming?.sectionId === s.id) col.append(ctx.sections.field(s.name, s, pid));
    else {
      const head = el('div', 'td-col-head');
      head.append(el('h2', 'td-col-title', name), el('span', 'td-col-count', tops.length ? String(tops.length) : ''));
      if (s && canWrite) {
        const more = /** @type {HTMLButtonElement} */ (el('button', 'td-icon-btn td-col-more'));
        more.type = 'button';
        more.setAttribute('aria-label', `More for ${name}`);
        more.setAttribute('aria-haspopup', 'menu');
        more.append(icon(ICONS.ellipsis));
        more.addEventListener('click', () => ctx.sections.menu(s, more));
        head.append(more);
      }
      col.append(head);
    }
    col.append(rowList(tops, c, name));
    if (canWrite) col.append(addRow('Add task', () => ctx.openQuickAdd({ projectId: pid, sectionId: s ? s.id : null })));
    cols.push(col);
  };
  if (v.loose.length || !v.sections.length) column(null, v.loose);
  for (const { section, lines } of v.sections) column(section, lines);
  if (canWrite) {
    const end = el('section', 'td-col td-col-new');
    if (naming && !naming.sectionId && naming.projectId === pid) end.append(ctx.sections.field('', null, pid));
    else {
      const b = /** @type {HTMLButtonElement} */ (el('button', 'td-add-section td-col-add-section'));
      b.type = 'button';
      b.append(icon(ICONS.plus, { class: 'td-add-icon' }), el('span', '', 'Add section'));
      b.addEventListener('click', () => ctx.sections.add(pid));
      end.append(b);
    }
    cols.push(end);
  }
  host.replaceChildren(...cols);

  // the dots: one per column, the one shown filled
  const dots = el('div', 'td-dots');
  dots.setAttribute('aria-hidden', 'true');
  dots.append(...cols.map(() => el('span', 'td-dot')));
  const none = !v.loose.length && v.sections.every(x => !x.lines.length);
  below.replaceChildren(...(none && !v.sections.length && canWrite ? [emptyNote('Nothing here yet', 'Tap + to add a task')] : []), ...(cols.length > 1 ? [dots] : []));
  const mark = () => {
    const w = host.clientWidth || 1, i = Math.round(host.scrollLeft / (w * 0.9));
    const all = below.querySelectorAll('.td-dot');
    all.forEach((n, k) => n.classList.toggle('is-on', k === Math.min(i, all.length - 1)));
  };
  mark();
  if (!watched.has(host)) {
    watched.add(host);
    host.addEventListener('scroll', () => { if (host.classList.contains('td-board')) requestAnimationFrame(mark); }, { passive: true });
  }
}
