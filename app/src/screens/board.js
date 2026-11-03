// A project as a board (its view is 'board'; Display switches it): one column per section, side by side, a column to
// a screen's width less a glimpse of the next, snapping as it is scrolled sideways. The tasks outside the sections
// come first in "No section" when there are any. A column has its name, how many tasks, a "…" (rename, add a task,
// add a section after it, delete), its cards and "Add task"; the last column adds a section. A card is held to lift it and dragged in its
// column or to another (row-drag.js knows a board). Dots under it say which column is shown.
// Any other list as a board (Display's Layout, this device's), and a project grouped by Display: one column per group
// (drawGroupBoard), with no "Add section"; a card dragged to another column takes that group's value (group-drop.js).
// Today's columns are its days (Overdue, Today), Upcoming's its days, a list in no group one column.
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { projectView, projectOf, isTask, dayOrder } from '../tasks.js';
import { sorter, narrowTasks, groupTasks } from '../arrange.js';
import { flatten } from '../tree.js';
import { dayKey } from '../dates.js';
import { rowList, addRow, emptyNote, groupHead } from '../ui/row.js';
import { addFor } from '../group-drop.js';
import { el } from './pick.js';
export { addFor };

/** @typedef {import('./views.js').Ctx} Ctx */

const watched = new WeakSet();

/** Display's sort and filter for a project's list (views.js and the board) @param {import('../tasks.js').Display} d
 * @param {import('../items.js').Label[]} labels @param {string} today */
export const arranged = (d, labels, today) => ({ cmp: sorter(d.sort, d.dir),
  keep: (/** @type {import('../items.js').Task} */ t) => (!t.done || d.completed) && !!narrowTasks([t], d, labels, today).length });

/**
 * A flat list in Display's groups (views.js), a section per group with its name and "+" (quick add with the group's
 * value; not Overdue, which has Reschedule) -> how many tasks it shows. data-gkey: the groups a row is dragged between
 * (ui/row-drag.js). @param {Ctx} ctx
 * @param {{ into: HTMLElement, tasks: import('../items.js').Task[], d: import('../tasks.js').Display, c: import('../ui/row.js').RowContext,
 *   base: import('./views.js').AddContext, resched: (sec: HTMLElement, tasks: import('../items.js').Task[]) => void, byDay?: boolean }} o
 *   byDay: a day's list (Today), in the day's own order (dayOrder) whatever the grouping
 */
export function drawGroups(ctx, { into, tasks, d, c, base, resched, byDay }) {
  const data = ctx.data(), all = data.tasks.filter(isTask);
  const gs = groupTasks(narrowTasks(tasks.filter(t => isTask(t) && (!t.done || d.completed)), d, data.labels, c.today), d,
    { projects: data.projects, labels: data.labels, today: c.today, ...(byDay ? { manual: dayOrder } : {}) });
  into.replaceChildren(...gs.map(g => {
    const sec = el('section', 'td-group');
    const day = d.group === 'date' && g.key[0] === '1' ? g.key.slice(1) : undefined;
    if (day) sec.dataset.day = day;
    sec.dataset.gkey = g.key;
    if (g.title) sec.append(groupHead(g.title, { label: g.title, onAdd: ctx.canWrite() && g.key !== '0' ? () => ctx.openQuickAdd(addFor(d.group, g.key, data, base) ?? base) : undefined }));
    if (g.key === '0' && d.group === 'date') resched(sec, g.tasks);
    sec.append(rowList(flatten(g.tasks, all, { open: () => false }), { ...c, own: day }, g.title || 'Tasks'));
    return sec;
  }));
  return gs.reduce((n, g) => n + g.tasks.length, 0);
}

/**
 * @param {Ctx} ctx @param {string} pid @param {HTMLElement} host @param {HTMLElement} below  for the dots
 * @param {import('../tasks.js').Display} d
 */
export function drawBoard(ctx, pid, host, below, d) {
  if (d.group !== 'none') {
    // a project grouped by Display: its groups as columns
    const n = drawGroupBoard(ctx, { host, below, tasks: ctx.data().tasks.filter(t => projectOf(t) === pid), d, group: d.group, base: { projectId: pid }, title: '' });
    if (!n && ctx.canWrite()) below.prepend(emptyNote('No tasks yet', 'Tap + to add the first one.', 'project'));
    return;
  }
  delete host.dataset.grouped;
  const data = ctx.data(), canWrite = ctx.canWrite(), today = dayKey();
  const v = projectView(data.tasks, data.sections, pid, { ...arranged(d, data.labels, today), ...(d.sort === 'manual' ? { cmp: undefined } : {}) });
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
    // (a new section named here, between this column and the next: its "…" > Add section after)
    if (s && naming && !naming.sectionId && naming.after === s.id) { const add = el('section', 'td-col td-col-new'); add.append(ctx.sections.field('', null, pid)); cols.push(add); }
  };
  if (v.loose.length || !v.sections.length) column(null, v.loose);
  for (const { section, lines } of v.sections) column(section, lines);
  if (canWrite) {
    const end = el('section', 'td-col td-col-new');
    if (naming && !naming.sectionId && !naming.after && naming.projectId === pid) end.append(ctx.sections.field('', null, pid));
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
  const none = !v.loose.length && v.sections.every(x => !x.lines.length);
  below.replaceChildren(...(none && !v.sections.length && canWrite ? [emptyNote('No tasks yet', 'Tap + to add the first one.', 'project')] : []));
  dotsFor(host, below, cols.length);
}

/**
 * A list as a board of Display's groups -> how many tasks it shows. @param {Ctx} ctx
 * @param {{ host: HTMLElement, below: HTMLElement | null, tasks: import('../items.js').Task[], d: import('../tasks.js').Display, group: string,
 *   base: import('./views.js').AddContext, title: string }} o  group: the columns' grouping; base: what a new task starts with; title: a single column's name
 */
export function drawGroupBoard(ctx, { host, below, tasks, d, group, base, title }) {
  const data = ctx.data(), canWrite = ctx.canWrite(), today = dayKey(), all = data.tasks.filter(isTask);
  host.classList.add('td-board');
  host.setAttribute('data-swipe-own', '');
  host.dataset.grouped = group;
  host.toggleAttribute('data-sorted', d.sort !== 'manual');
  const gs = groupTasks(narrowTasks(tasks.filter(t => isTask(t) && (!t.done || d.completed)), d, data.labels, today), { ...d, group },
    { projects: data.projects, labels: data.labels, today });
  // (a list in no group with nothing in it still has its column, to add to)
  if (!gs.length && group === 'none') gs.push({ key: '', title: '', tasks: [] });
  const c = ctx.rows({ place: true });
  const cols = gs.map(g => {
    const name = g.title || title, day = group === 'date' && g.key[0] === '1' ? g.key.slice(1) : undefined;
    const col = el('section', 'td-group td-col');
    col.dataset.gkey = g.key;
    if (day) col.dataset.day = day;
    col.setAttribute('aria-label', name);
    const head = el('div', 'td-col-head');
    head.append(el('h2', 'td-col-title', name), el('span', 'td-col-count', g.tasks.length ? String(g.tasks.length) : ''));
    col.append(head, rowList(flatten(g.tasks, all, { open: () => false }), { ...c, own: day }, name));
    const a = addFor(group, g.key, data, base);
    if (canWrite && a) col.append(addRow('Add task', () => ctx.openQuickAdd(a)));
    return col;
  });
  host.replaceChildren(...cols);
  below?.replaceChildren();
  if (below) dotsFor(host, below, cols.length);
  return gs.reduce((n, g) => n + g.tasks.length, 0);
}

/** the dots under a board: one per column, the one shown filled @param {HTMLElement} host @param {HTMLElement} below @param {number} n */
function dotsFor(host, below, n) {
  const dots = el('div', 'td-dots');
  dots.setAttribute('aria-hidden', 'true');
  dots.append(...Array.from({ length: n }, () => el('span', 'td-dot')));
  if (n > 1) below.append(dots);
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
