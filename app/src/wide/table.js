// A list as a table (Display's Layout "Table", 840 px and up only: views.js loads this file then, and under 840 px the
// same list is drawn as a list). One row a task: the ring, the title and a "…" (the row's menu), then Date, Priority,
// Project and Labels, each a small bordered chip (the date coloured as on a row; a tap on it opens the scheduler). A tap
// on the row opens the task. Rows come in the list's groups (a project's sections, Today's Overdue and day, or Display's
// grouping), each under a head like a list's (Overdue keeps Reschedule); the table scrolls sideways when the page is
// narrower than it. Every change goes through the task's own ops (complete, the scheduler, the menu), as on a row.
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { isTask, projectOf, priorityOf, labelsOf, projectView, dayOrder } from '../tasks.js';
import { groupTasks, narrowTasks, sorter } from '../arrange.js';
import { flatten, countText } from '../tree.js';
import { dueLine, dayKey } from '../dates.js';
import { colorHex } from '../colors.js';
import { INBOX } from '../items.js';
import { addRow } from '../ui/row.js';
import { el } from '../screens/pick.js';
import { COLUMNS } from './table-parts.js';

/** @typedef {import('../screens/views.js').Ctx} Ctx */
/** @typedef {import('../items.js').Task} Task */
/** @typedef {{ key: string, title: string, lines: import('../tree.js').Line<Task>[], section?: import('../items.js').Section }} Group */

/**
 * @param {Ctx} ctx
 * @param {{ host: HTMLElement, empty: HTMLElement | null, tasks: Task[], d: import('../tasks.js').Display, pid?: string,
 *   base: import('../screens/views.js').AddContext, byDay?: boolean, label: string }} o
 *   host: the list's element (#today, #inbox, #project, #place); tasks: the list's tasks (a project's: all, it picks its own);
 *   pid: a project's page (its sections are the groups when Display groups by none); byDay: Today's day order
 */
export function drawTable(ctx, { host, empty, tasks, d, pid, base, byDay = false, label }) {
  const data = ctx.data(), today = dayKey(), all = data.tasks.filter(isTask), canWrite = ctx.canWrite();
  host.classList.remove('td-board');
  host.removeAttribute('data-swipe-own');
  host.removeAttribute('data-sorted');
  delete host.dataset.grouped;
  const keep = (/** @type {Task} */ t) => isTask(t) && (!t.done || d.completed);
  /** @type {Group[]} */
  let groups;
  if (pid !== undefined && d.group === 'none') {
    const v = projectView(data.tasks, data.sections, pid, { cmp: d.sort === 'manual' ? undefined : sorter(d.sort, d.dir), keep: t => keep(t) && !!narrowTasks([t], d, data.labels, today).length });
    groups = [{ key: '', title: '', lines: v.loose.filter(l => !l.depth) },
      ...v.sections.map(s => ({ key: s.section.id, title: s.section.name, lines: s.lines.filter(l => !l.depth), section: s.section }))];
  } else {
    const gs = groupTasks(narrowTasks(tasks.filter(keep), d, data.labels, today), d, { projects: data.projects, labels: data.labels, today, ...(byDay ? { manual: dayOrder } : {}) });
    groups = gs.map(g => ({ key: g.key, title: g.title, lines: flatten(g.tasks, all, { open: () => false }).filter(l => !l.depth) }));
  }

  const table = el('table', 'td-table');
  table.setAttribute('aria-label', label);
  const head = el('thead', '');
  const hr = el('tr', '');
  for (const c of COLUMNS) {
    const th = el('th', `td-th td-th-${c.key}`, c.label);
    th.setAttribute('scope', 'col');
    hr.append(th);
  }
  head.append(hr);
  table.append(head);
  const c = { today, own: undefined };
  let shown = 0;
  for (const g of groups) {
    if (!g.lines.length && !g.title) continue;
    const body = el('tbody', 'td-tgroup');
    if (g.title) {
      const tr = el('tr', 'td-tgroup-row');
      const th = /** @type {HTMLTableCellElement} */ (el('th', 'td-tgroup-head'));
      th.setAttribute('scope', 'colgroup');
      th.colSpan = COLUMNS.length;
      const line = el('div', 'td-tgroup-line');
      const open = g.lines.filter(l => !l.task.done).length;
      line.append(el('span', 'td-tgroup-title', g.title), el('span', 'td-tgroup-count', open ? String(open) : ''));
      if (canWrite && g.key === '0' && d.group === 'date') {
        const b = /** @type {HTMLButtonElement} */ (el('button', 'td-text-btn td-resched', 'Reschedule'));
        b.type = 'button';
        b.addEventListener('click', () => { void import('../screens/select.js').then(m => m.rescheduleTasks(ctx, g.lines.map(l => l.task))); });
        line.append(b);
      }
      th.append(line);
      tr.append(th);
      body.append(tr);
    }
    const own = d.group === 'date' && g.key[0] === '1' ? g.key.slice(1) : undefined;
    for (const l of g.lines) { body.append(taskLine(ctx, host, l, { ...c, own }, canWrite)); shown++; }
    table.append(body);
  }
  const box = el('div', 'td-table-box');
  box.append(table);
  const parts = [box];
  if (canWrite) {
    const add = addRow('Add task', () => ctx.openQuickAdd(base));
    add.classList.add('td-table-add');
    parts.push(add);
  }
  host.replaceChildren(...parts);
  empty?.replaceChildren();
  return shown;
}

/** one task's row @param {Ctx} ctx @param {HTMLElement} host @param {import('../tree.js').Line<Task>} line
 * @param {{ today: string, own: string | undefined }} c @param {boolean} canWrite */
function taskLine(ctx, host, line, c, canWrite) {
  const t = line.task, data = ctx.data();
  const tr = el('tr', 'td-trow');
  tr.dataset.id = t.id;
  if (t.done) tr.classList.add('is-complete');
  // the task: its ring (priority-coloured, as a row's), its title (opens it), its sub-task count and its "…"
  const th = el('th', 'td-tcell td-tcell-task');
  th.setAttribute('scope', 'row');
  const cell = el('div', 'td-tcell-in');
  cell.dataset.priority = String(priorityOf(t));
  const box = /** @type {HTMLButtonElement} */ (el('button', 'td-check'));
  box.type = 'button';
  box.setAttribute('role', 'checkbox');
  box.setAttribute('aria-checked', String(!!t.done));
  box.setAttribute('aria-label', `Complete: ${t.title}`);
  box.disabled = !canWrite;
  box.append(icon(ICONS.check, { class: 'td-check-mark' }));
  box.addEventListener('click', e => {
    e.stopPropagation();
    if (!t.done) { box.setAttribute('aria-checked', 'true'); tr.classList.add('is-done'); }
    if (t.done) void ctx.app.untick([t]); else void ctx.complete(t, null);
  });
  const name = /** @type {HTMLButtonElement} */ (el('button', 'td-tname'));
  name.type = 'button';
  name.append(el('span', 'td-tname-text', t.title));
  name.addEventListener('click', e => { e.stopPropagation(); ctx.openTask(t); });
  cell.append(box, name);
  const n = countText(line);
  if (n) {
    const kids = el('span', 'td-tchip td-tchip-kids');
    kids.setAttribute('aria-label', `${line.doneKids} of ${line.kids} subtasks done`);
    kids.append(icon(ICONS.gitBranch, { class: 'td-tchip-icon' }), n);
    cell.append(kids);
  }
  if (canWrite) {
    const more = /** @type {HTMLButtonElement} */ (el('button', 'td-icon-btn td-tmore'));
    more.type = 'button';
    more.setAttribute('aria-label', `More for ${t.title}`);
    more.setAttribute('aria-haspopup', 'menu');
    more.append(icon(ICONS.ellipsis));
    more.addEventListener('click', e => { e.stopPropagation(); void import('../screens/select.js').then(m => m.holdMenu(ctx, t, tr, host)); });
    cell.append(more);
  }
  th.append(cell);
  tr.append(th);

  // Date: a chip coloured by when (the scheduler from it)
  const due = dueLine(t.due, c.today, { own: c.own, dur: t.duration });
  const dateCell = el('td', 'td-tcell');
  if (due?.text) {
    const chip = /** @type {HTMLButtonElement} */ (el('button', 'td-tchip td-date'));
    chip.type = 'button';
    chip.dataset.tone = due.tone;
    chip.setAttribute('aria-label', `Date: ${due.text}`);
    chip.append(icon(ICONS.calendar, { class: 'td-tchip-icon' }), due.text);
    if (due.repeats) chip.append(icon(ICONS.repeat, { class: 'td-tchip-icon' }));
    chip.disabled = !canWrite;
    chip.addEventListener('click', e => { e.stopPropagation(); void import('../screens/select.js').then(m => m.scheduleTasks(ctx, [t])); });
    dateCell.append(chip);
  }
  // Priority, Project, Labels
  const p = priorityOf(t), pri = el('td', 'td-tcell');
  if (p < 4) {
    const chip = el('span', 'td-tchip td-tchip-pri');
    chip.dataset.priority = String(p);
    chip.append(icon(MORE.flag, { class: 'td-tchip-icon' }), `P${p}`);
    pri.append(chip);
  }
  const pid = projectOf(t), proj = data.projects.find(x => x.id === pid), place = el('td', 'td-tcell');
  const pc = el('span', 'td-tchip td-tchip-place');
  pc.style.setProperty('--td-place', colorHex(pid === INBOX ? 'charcoal' : proj?.color));
  pc.append(el('span', 'td-tchip-text', pid === INBOX ? 'Inbox' : proj?.name ?? 'Inbox'), icon(pid === INBOX ? ICONS.inbox : ICONS.hash, { class: 'td-tchip-icon' }));
  place.append(pc);
  const labs = el('td', 'td-tcell');
  for (const l of labelsOf(t, data.labels)) {
    const chip = el('span', 'td-tchip td-tchip-label');
    chip.style.setProperty('--c', colorHex(l.color));
    chip.append(icon(ICONS.tag, { class: 'td-tchip-icon' }), l.name);
    labs.append(chip);
  }
  tr.append(dateCell, pri, place, labs);
  tr.addEventListener('click', () => ctx.openTask(t));
  return tr;
}
