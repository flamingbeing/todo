// A task row: the round checkbox in the priority's colour, the title, one line of description, and the meta line (the
// due date in its tone, a repeat mark, the subtask count, labels, and on day lists the project at the right). Subtasks
// sit 24 px further in per level; a parent has a fold chevron at the right. A tap on the row opens the task; a tap on
// the box completes it (the row then fades out and the list shows the undo toast). A title starting "* " is a note:
// no box and no swipe to complete (plainRow).
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { dueLine, deadlineLine } from '../dates.js';
import { countText } from '../tree.js';
import { colorHex } from '../colors.js';
import { priorityOf, projectOf, labelsOf } from '../tasks.js';
import { INBOX } from '../items.js';

/** @typedef {import('../items.js').Task} Task */
/**
 * @typedef {object} RowContext
 * @property {string} today
 * @property {string} [own]  the day of the group the row is in (its date is not repeated)
 * @property {boolean} [place]  show the project at the right (day lists, search)
 * @property {import('../items.js').Data} data
 * @property {boolean} canWrite
 * @property {Set<string>} [changed]  rows to flash (changed elsewhere since the last draw)
 * @property {(t: Task) => void} onOpen
 * @property {(t: Task, row: HTMLElement) => void} onComplete
 * @property {(t: Task) => void} [onFold]
 * @property {(span: HTMLElement, text: string) => void} [marks]  shows a title's markdown (markdown.js, loaded when a title has some)
 */

/** the comments each task has, counted once per data (a new data object on every change) @type {WeakMap<object, Map<string, number>>} */
const counted = new WeakMap();
/** @param {import('../items.js').Data} data @param {string} id */
const commentCount = (data, id) => {
  let m = counted.get(data);
  if (!m) { m = new Map(); for (const x of data.comments ?? []) m.set(x.taskId, (m.get(x.taskId) || 0) + 1); counted.set(data, m); }
  return m.get(id) || 0;
};

/** a title starting "* " is a note in the list: no box to tick (shown without the "* ") @param {Task} t */
export const plainRow = t => /^\* \S/.test(String(t.title));

/** @param {string} tag @param {string} cls @param {string} [text] */
const el = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };

/** the meta line's parts, or null when there are none @param {import('../tree.js').Line<Task>} line @param {RowContext} c */
function meta(line, c) {
  const t = line.task, parts = [];
  const due = dueLine(t.due, c.today, { own: c.own, dur: t.duration });
  if (due && (due.text || due.repeats)) {
    const d = el('span', 'td-date');
    d.dataset.tone = due.tone;
    if (due.text) d.append(icon(ICONS.calendar, { class: 'td-meta-icon' }), due.text);
    if (due.repeats) d.append(icon(ICONS.repeat, { class: 'td-meta-icon td-repeat' }));
    parts.push(d);
  }
  const dl = deadlineLine(t.deadline, c.today);
  if (dl) {
    const d = el('span', 'td-date td-deadline');
    d.dataset.tone = dl.tone;
    d.setAttribute('aria-label', `Deadline: ${dl.text}`);
    d.append(icon(ICONS.target, { class: 'td-meta-icon' }), dl.text);
    parts.push(d);
  }
  const count = countText(line);
  if (count) {
    const n = el('span', 'td-count');
    n.append(icon(ICONS.listTree, { class: 'td-meta-icon' }), count);
    n.setAttribute('aria-label', `${line.doneKids} of ${line.kids} subtasks done`);
    parts.push(n);
  }
  const talk = commentCount(c.data, t.id);
  if (talk) {
    const n = el('span', 'td-count td-comments-count');
    n.append(icon(ICONS.messageSquare, { class: 'td-meta-icon' }), String(talk));
    n.setAttribute('aria-label', `${talk} ${talk === 1 ? 'comment' : 'comments'}`);
    parts.push(n);
  }
  for (const known of labelsOf(t, c.data.labels)) {
    const l = el('span', 'td-label');
    l.style.setProperty('--c', colorHex(known.color));
    l.append(icon(ICONS.tag, { class: 'td-meta-icon' }), known.name);
    parts.push(l);
  }
  if (c.place) {
    const pid = projectOf(t), p = c.data.projects.find(x => x.id === pid);
    const s = t.sectionId ? c.data.sections.find(x => x.id === t.sectionId) : null;
    const where = el('span', 'td-place');
    where.style.setProperty('--td-place', colorHex(pid === INBOX ? 'charcoal' : p?.color));
    where.append(`${pid === INBOX ? 'Inbox' : p?.name ?? 'Inbox'}${s ? ` / ${s.name}` : ''}`, icon(pid === INBOX ? ICONS.inbox : ICONS.hash, { class: 'td-meta-icon' }));
    parts.push(where);
  }
  if (!parts.length) return null;
  const m = el('span', 'td-meta');
  m.append(...parts);
  return m;
}

/**
 * @param {import('../tree.js').Line<Task>} line @param {RowContext} c @returns {HTMLLIElement}
 */
export function taskRow(line, c) {
  const t = line.task, p = priorityOf(t);
  const li = /** @type {HTMLLIElement} */ (el('li', 'td-row'));
  li.dataset.id = t.id;
  li.toggleAttribute('data-swipe-own', c.canWrite);   // (a sideways swipe on a row is the row's: ui/row-swipe.js)
  li.dataset.priority = String(p);
  if (line.depth) li.style.setProperty('--depth', String(line.depth));
  if (c.changed?.has(t.id)) li.classList.add('changed');
  if (t.done) li.classList.add('is-complete');

  const box = /** @type {HTMLButtonElement} */ (el('button', 'td-check'));
  box.type = 'button';
  box.setAttribute('role', 'checkbox');
  box.setAttribute('aria-checked', String(!!t.done));
  box.setAttribute('aria-label', `Complete: ${t.title}`);
  box.disabled = !c.canWrite;
  box.append(icon(ICONS.check, { class: 'td-check-mark' }));
  if (plainRow(t)) { li.classList.add('is-plain'); box.disabled = true; box.tabIndex = -1; box.setAttribute('aria-hidden', 'true'); }
  box.addEventListener('click', () => {
    if (t.done) { c.onComplete(t, li); return; }
    if (li.classList.contains('is-done')) return;
    li.classList.add('is-done');
    box.setAttribute('aria-checked', 'true');
    c.onComplete(t, li);
  });

  const main = /** @type {HTMLButtonElement} */ (el('button', 'td-row-main'));
  main.type = 'button';
  const name = plainRow(t) ? t.title.slice(2) : t.title, head = el('span', 'td-title', name);
  // (a title that may have marks: drawn again with them once markdown.js is in)
  if (c.marks && /[*_`~]|https?:\/\//.test(name)) c.marks(head, name);
  main.append(head);
  if (t.description) main.append(el('span', 'td-desc', String(t.description).split('\n')[0]));
  const m = meta(line, c);
  if (m) main.append(m);
  main.addEventListener('click', () => c.onOpen(t));
  li.append(box, main);

  if (line.kids && c.onFold) {
    const fold = /** @type {HTMLButtonElement} */ (el('button', 'td-fold'));
    fold.type = 'button';
    fold.setAttribute('aria-expanded', String(!t.collapsed));
    fold.setAttribute('aria-label', `${t.collapsed ? 'Show' : 'Hide'} the subtasks of ${t.title}`);
    fold.append(icon(t.collapsed ? ICONS.chevronRight : ICONS.chevronDown));
    fold.disabled = !c.canWrite;
    fold.addEventListener('click', () => c.onFold?.(t));
    li.append(fold);
  }
  return li;
}

/** a list of rows @param {import('../tree.js').Line<Task>[]} lines @param {RowContext} c @param {string} label */
export function rowList(lines, c, label) {
  const ul = el('ul', 'td-rows');
  ul.setAttribute('aria-label', label);
  ul.append(...lines.map(l => taskRow(l, c)));
  return ul;
}

/** the muted "+ Add task" row at the end of a section or a day @param {string} label @param {() => void} onClick */
export function addRow(label, onClick) {
  const b = /** @type {HTMLButtonElement} */ (el('button', 'td-add-row'));
  b.type = 'button';
  b.append(icon(ICONS.plus, { class: 'td-add-icon' }), el('span', '', label));
  b.addEventListener('click', onClick);
  return b;
}

/** a group's header (a section, a day): its title, and optionally a fold chevron, a "+" (add a task there) and a "…" button
 * @param {string} title @param {{ id?: string, collapsed?: boolean, onFold?: () => void, onMore?: (b: HTMLElement) => void, onAdd?: () => void, label?: string }} [o] */
export function groupHead(title, { id, collapsed, onFold, onMore, onAdd, label } = {}) {
  const h = el('div', 'td-group-head');
  const name = el(onFold ? 'button' : 'h2', 'td-group-title');
  if (id) name.id = id;
  if (onFold) {
    /** @type {HTMLButtonElement} */ (name).type = 'button';
    name.setAttribute('aria-expanded', String(!collapsed));
    name.append(icon(collapsed ? ICONS.chevronRight : ICONS.chevronDown, { class: 'td-group-chevron' }), el('span', '', title));
    name.addEventListener('click', onFold);
    const wrap = el('h2', 'td-group-h');
    wrap.append(name);
    h.append(wrap);
  } else { name.textContent = title; h.append(name); }
  if (onAdd) {
    const add = /** @type {HTMLButtonElement} */ (el('button', 'td-icon-btn td-group-add'));
    add.type = 'button';
    add.setAttribute('aria-label', `Add task to ${label ?? title}`);
    add.append(icon(ICONS.plus));
    add.addEventListener('click', onAdd);
    h.append(add);
  }
  if (onMore) {
    const more = /** @type {HTMLButtonElement} */ (el('button', 'td-icon-btn td-group-more'));
    more.type = 'button';
    more.setAttribute('aria-label', label ? `More for ${label}` : 'More');
    more.setAttribute('aria-haspopup', 'menu');
    more.append(icon(ICONS.ellipsis));
    more.addEventListener('click', () => onMore(more));
    h.append(more);
  }
  return h;
}

/** the list's own empty state: a soft circle with a check, a title and a hint @param {string} title @param {string} hint */
export function emptyNote(title, hint) {
  const box = el('div', 'td-empty');
  const art = el('span', 'td-empty-art');
  art.append(icon(ICONS.circleCheck));
  box.append(art, el('p', 'td-empty-title', title), el('p', 'td-empty-hint', hint));
  return box;
}
