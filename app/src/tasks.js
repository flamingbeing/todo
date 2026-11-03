// What each list shows, from the records alone (no page here, so it is unit-tested): a project's tasks under its
// sections and Today by day (Display's sorts and groups, Upcoming, the done tasks and Browse's tree: arrange.js, lazy). A record without a title is
// skipped (an older copy, or not a task yet).
import { INBOX } from './items.js';
import { dueOf, isDay, isTime } from './dates.js';
import { flatten, descendants } from './tree.js';
import { byOrder } from './order.js';
import { isColor, DEFAULT_COLOR } from './colors.js';

/** @typedef {import('./items.js').Task} Task */
/** @typedef {import('./items.js').Project} Project */
/** @typedef {import('./items.js').Section} Section */
/** @typedef {import('./tree.js').Line<Task>} Line */
/** @typedef {import('./items.js').Label} Label */

/** @param {unknown} x @returns {x is Task} */
export const isTask = x => !!x && typeof (/** @type {Task} */ (x)).title === 'string' && !!(/** @type {Task} */ (x)).title;
/** @param {Task} t */
export const projectOf = t => (typeof t.projectId === 'string' && t.projectId ? t.projectId : INBOX);
/** @param {Task} t @returns {1 | 2 | 3 | 4} */
export const priorityOf = t => (t.priority === 1 || t.priority === 2 || t.priority === 3 ? t.priority : 4);
const num = (/** @type {unknown} */ v) => (typeof v === 'number' ? v : Infinity);
const open = (/** @type {Task[]} */ tasks) => tasks.filter(t => isTask(t) && !t.done);

/**
 * A project's page (the Inbox too): its open top tasks with no section first, then each section with its own. A
 * subtask shows under its parent; one whose parent is gone or done shows as a top task.
 * Display's order (cmp; done tasks last) and its choice of tasks (keep) when given.
 * @param {Task[]} tasks @param {Section[]} sections @param {string} projectId
 * @returns {{ loose: Line[], sections: { section: Section, lines: Line[] }[] }}
 */
export function projectView(tasks, sections, projectId, { cmp, keep } = /** @type {{ cmp?: (a: Task, b: Task) => number, keep?: (t: Task) => boolean }} */ ({})) {
  const mine = (keep ? tasks.filter(t => isTask(t) && keep(t)) : open(tasks)).filter(t => projectOf(t) === projectId), ids = new Set(mine.map(t => t.id));
  const own = byOrder(sections.filter(s => s && s.projectId === projectId && s.name));
  const known = new Set(own.map(s => s.id));
  const tops = mine.filter(t => !t.parentId || !ids.has(t.parentId));
  if (cmp) tops.sort((a, b) => Number(!!a.done) - Number(!!b.done) || cmp(a, b)); else tops.splice(0, Infinity, ...byOrder(tops));
  const sectionOf = (/** @type {Task} */ t) => (t.sectionId && known.has(t.sectionId) ? t.sectionId : '');
  // (subtasks show by the same choice as the tasks: keep's, done ones too when it keeps them; the counts are of them all)
  const all = tasks.filter(isTask), o = { open: (/** @type {Task} */ t) => ids.has(t.id) };
  return {
    loose: flatten(tops.filter(t => !sectionOf(t)), all, o),
    sections: own.map(section => ({ section, lines: flatten(tops.filter(t => sectionOf(t) === section.id), all, o) })),
  };
}

/** the smart order (a day, a filter, a label): by day first (an undated task by its deadline's day; neither, last); on
 * a day the tasks placed by hand (dayOrder, as dragged) first, in that order; then the others, timed ones first by
 * time, then by priority, then by deadline (none last), then by their own order, then oldest first. (Placed or not
 * decides first, so the order is the same whichever pairs are compared: a sort needs that.) @param {Task} a @param {Task} b */
export function dayOrder(a, b) {
  const da = dueOf(a.due), db = dueOf(b.due), la = deadlineOf(a), lb = deadlineOf(b);
  const ka = da?.date ?? la, kb = db?.date ?? lb;
  if (!ka !== !kb) return ka ? -1 : 1;
  if (ka && kb && ka !== kb) return ka < kb ? -1 : 1;
  const pa = typeof a.dayOrder === 'number', pb = typeof b.dayOrder === 'number';
  if (pa !== pb) return pa ? -1 : 1;
  if (pa && pb && a.dayOrder !== b.dayOrder) return /** @type {number} */ (a.dayOrder) - /** @type {number} */ (b.dayOrder);
  const ta = isTime(da?.time) ? /** @type {string} */ (da?.time) : '~', tb = isTime(db?.time) ? /** @type {string} */ (db?.time) : '~';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return priorityOf(a) - priorityOf(b) || (la !== lb ? (!la ? 1 : !lb ? -1 : la < lb ? -1 : 1) : 0)
    || num(a.order) - num(b.order) || num(a.createdAt) - num(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
/** whether a list keeps its smart order, never a hand-made one (a filter's or a label's page, as the reference's)
 * @param {string} view  Display's view key */
export const ownOrder = view => /^(labels|filters):/.test(String(view));
export const OWN_ORDER = 'Filters and labels keep their smart order';
/** a task's deadline day, or '' @param {Task} t */
const deadlineOf = t => (typeof t.deadline === 'string' ? t.deadline : '');
/** a title as the name sort reads it: leading symbols, emoji, punctuation and spaces left out @param {unknown} title */
export const sortKey = title => String(title ?? '').replace(/^[^\p{L}\p{N}]+/u, '');
/** rows for a list by day: each task alone (its subtasks show only on their own dates), with its counts */
export const dayLines = (/** @type {Task[]} */ list, /** @type {Task[]} */ all, cmp = dayOrder) => flatten(list.sort(cmp), all, { open: () => false });

/** Today: what is overdue (before today), then what is due today @param {Task[]} tasks @param {string} today */
export function todayView(tasks, today) {
  const dated = open(tasks).filter(t => dueOf(t.due)), all = tasks.filter(isTask);
  return {
    overdue: dayLines(dated.filter(t => /** @type {any} */ (t.due).date < today), all),
    today: dayLines(dated.filter(t => /** @type {any} */ (t.due).date === today), all),
  };
}

/** where a task is, in words: "Inbox", "Work" or "Work / Admin" @param {Task} t @param {Project[]} projects @param {Section[]} sections */
export function placeText(t, projects, sections) {
  const pid = projectOf(t), p = projects.find(x => x.id === pid);
  const name = pid === INBOX ? 'Inbox' : p?.name || 'Inbox';
  const s = t.sectionId ? sections.find(x => x.id === t.sectionId && x.projectId === pid) : null;
  return s ? `${name} / ${s.name}` : name;
}

/** a project and everything in it: its sub-projects, all their sections and tasks (a delete takes them all)
 * @param {string} id @param {Project[]} projects @param {Section[]} sections @param {Task[]} tasks */
export function projectCascade(id, projects, sections, tasks) {
  const ids = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const p of projects) if (p.parentId && ids.has(p.parentId) && !ids.has(p.id)) { ids.add(p.id); grew = true; }
  }
  return {
    projects: projects.filter(p => ids.has(p.id)),
    sections: sections.filter(s => ids.has(s.projectId)),
    tasks: tasks.filter(t => ids.has(projectOf(t))),
  };
}

/** a section's tasks with their subtasks (a delete takes them) @param {string} id @param {Task[]} tasks */
export function sectionCascade(id, tasks) {
  const top = tasks.filter(t => t.sectionId === id && !(t.parentId && tasks.some(p => p.id === t.parentId && p.sectionId === id)));
  const out = new Map();
  for (const t of top) { out.set(t.id, t); for (const d of descendants(t.id, tasks)) out.set(d.id, d); }
  return [...out.values()];
}

/** reminders as saved: whole minutes before due, 0..4 weeks, once each, up to 5 @param {unknown} v @returns {number[]} */
export const cleanReminders = v => [...new Set((Array.isArray(v) ? v : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 40320))].sort((a, b) => a - b).slice(0, 5);

/** @param {unknown} v @returns {import('./dates.js').Due | null} */
export function cleanDue(v) {
  const d = dueOf(v);
  if (!d || !isDay(d.date)) return null;
  /** @type {import('./dates.js').Due} */
  const out = { date: d.date };
  if (isTime(d.time)) out.time = d.time;
  if (typeof d.rrule === 'string' && d.rrule) out.rrule = d.rrule.slice(0, 300);
  if (typeof d.string === 'string' && d.string) out.string = d.string.slice(0, 200);
  if (d.fromDone === true) out.fromDone = true;
  return out;
}

/**
 * What an add or an edit stores, made to fit the rules: text trimmed and cut to size, a priority of 1 to 4, a due map
 * of known parts, empty ids as null. Only the fields given are returned.
 * @param {import('./items.js').Fields} f @returns {import('./items.js').Fields}
 */
export function cleanFields(f) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (f.title !== undefined) out.title = String(f.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (f.description !== undefined) out.description = f.description ? String(f.description).slice(0, 16000) : null;
  if (f.projectId !== undefined) out.projectId = f.projectId ? String(f.projectId).slice(0, 64) : INBOX;
  for (const k of /** @type {const} */ (['sectionId', 'parentId'])) if (f[k] !== undefined) out[k] = f[k] ? String(f[k]).slice(0, 64) : null;
  if (f.priority !== undefined) out.priority = [1, 2, 3, 4].includes(Number(f.priority)) ? Number(f.priority) : 4;
  if (f.labels !== undefined) out.labels = [...new Set((f.labels ?? []).map(String).filter(Boolean))].slice(0, 20);
  if (f.due !== undefined) out.due = cleanDue(f.due);
  if (f.deadline !== undefined) out.deadline = isDay(f.deadline) ? f.deadline : null;
  if (f.duration !== undefined) { const n = Math.round(Number(f.duration)); out.duration = f.duration && n >= 1 ? Math.min(1440, n) : null; }
  if (f.reminders !== undefined) out.reminders = cleanReminders(f.reminders);
  if (f.order !== undefined && typeof f.order === 'number') out.order = f.order;
  if (f.collapsed !== undefined) out.collapsed = !!f.collapsed;
  return /** @type {import('./items.js').Fields} */ (out);
}

/** a colour key the rules take @param {unknown} c */
export const cleanColor = c => (isColor(c) ? /** @type {string} */ (c) : DEFAULT_COLOR);

/** a task's labels as records: by id, or by name for older tasks; one whose label is gone is left out
 * @param {Task} t @param {Label[]} labels @returns {Label[]} */
export function labelsOf(t, labels) {
  const out = /** @type {Label[]} */ ([]);
  for (const v of Array.isArray(t.labels) ? t.labels : []) {
    const l = labels.find(x => x.id === v) ?? labels.find(x => x.name && x.name.toLowerCase() === String(v).toLowerCase());
    if (l && !out.includes(l)) out.push(l);
  }
  return out;
}

// ---- Display: a list's grouping, sorting, filter and completed switch (per view, this device; screens/display.js)
// layout: '' (a project's own view, else list), list, board (any list; a project's own is its view) or calendar; cal: week, month or agenda (Today: its day;
// Upcoming: no agenda); color: the calendar's fill (Inbox and projects: not by project); allDay: the all-day row open in full
// (shut: two a day and "+N")
/** @typedef {{ group: string, sort: string, dir: 'asc' | 'desc', completed: boolean, priority: number, label: string, date: string,
 *   layout: string, cal: string, color: string, allDay: boolean, future: boolean }} Display */
export const GROUPS = ['none', 'date', 'deadline', 'priority', 'label', 'project'];
export const SORTS = ['manual', 'name', 'date', 'deadline', 'priority', 'added'];
export const DATE_FILTERS = ['', 'today', 'week', 'overdue', 'nodate'];
/** a view's Display choices, known values only (Today groups by date, the rest by none)
 * @param {unknown} v @param {string} view @returns {Display} */
export function cleanDisplay(v, view) {
  const o = /** @type {Record<string, unknown>} */ (v && typeof v === 'object' ? v : {}), str = (/** @type {string} */ k) => String(o[k] ?? '');
  return {
    group: GROUPS.includes(str('group')) ? str('group') : view === 'today' ? 'date' : 'none',
    sort: SORTS.includes(str('sort')) ? str('sort') : 'manual',
    dir: o.dir === 'desc' ? 'desc' : 'asc',
    completed: o.completed === true,
    priority: [1, 2, 3, 4].includes(Number(o.priority)) ? Number(o.priority) : 0,
    label: typeof o.label === 'string' ? o.label.slice(0, 64) : '',
    date: DATE_FILTERS.includes(str('date')) ? str('date') : '',
    layout: ['list', 'calendar', 'board'].includes(str('layout')) ? str('layout') : '',
    cal: ['month', ...(view === 'upcoming' ? [] : ['agenda'])].includes(str('cal')) ? str('cal') : 'week',
    color: ['label', ...(view === 'inbox' || view.startsWith('project:') ? [] : ['project'])].includes(str('color')) ? str('color') : 'priority',
    allDay: o.allDay === true,
    future: o.future === true,
  };
}
/** whether a view's choices are the defaults @param {Display} d @param {string} view */
export const plainDisplay = (d, view) => JSON.stringify(d) === JSON.stringify(cleanDisplay({}, view));

/** the address that opens a task's sheet on load (this page with #task=<id>) @param {string} id */
export const taskLink = id => `${location.origin}${location.pathname}${location.search}#task=${encodeURIComponent(id)}`;

/** the address that opens a project's page on load (this page with #project=<id>; the Inbox is "inbox") @param {string} id */
export const projectLink = id => `${location.origin}${location.pathname}${location.search}#project=${encodeURIComponent(id)}`;
