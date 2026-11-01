// What each list shows, from the records alone (no page here, so it is unit-tested): a project's tasks under its
// sections, Today and Upcoming by day, the done tasks, the projects' tree and the counts. A record without a title is
// skipped (an older copy, or not a task yet).
import { INBOX } from './items.js';
import { dueOf, isDay, isTime, addDays, dayTitle } from './dates.js';
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

/** a day's order (by day first, undated last): the tasks placed on the day by hand (dayOrder, as dragged) first, in that order; then the others,
 * timed ones first by time, then by priority, then by their own order. (Placed or not decides first, so the order is
 * the same whichever pairs are compared: a sort needs that.) @param {Task} a @param {Task} b */
export function dayOrder(a, b) {
  const da = dueOf(a.due), db = dueOf(b.due);
  if (!da !== !db) return da ? -1 : 1;
  if (da && db && da.date !== db.date) return da.date < db.date ? -1 : 1;
  const pa = typeof a.dayOrder === 'number', pb = typeof b.dayOrder === 'number';
  if (pa !== pb) return pa ? -1 : 1;
  if (pa && pb && a.dayOrder !== b.dayOrder) return /** @type {number} */ (a.dayOrder) - /** @type {number} */ (b.dayOrder);
  const ta = isTime(da?.time) ? /** @type {string} */ (da?.time) : '~', tb = isTime(db?.time) ? /** @type {string} */ (db?.time) : '~';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return priorityOf(a) - priorityOf(b) || num(a.order) - num(b.order) || num(a.createdAt) - num(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
/** rows for a list by day: each task alone (its subtasks show only on their own dates), with its counts */
const dayLines = (/** @type {Task[]} */ list, /** @type {Task[]} */ all, cmp = dayOrder) => flatten(list.sort(cmp), all, { open: () => false });

/** Today: what is overdue (before today), then what is due today @param {Task[]} tasks @param {string} today */
export function todayView(tasks, today) {
  const dated = open(tasks).filter(t => dueOf(t.due)), all = tasks.filter(isTask);
  return {
    overdue: dayLines(dated.filter(t => /** @type {any} */ (t.due).date < today), all),
    today: dayLines(dated.filter(t => /** @type {any} */ (t.due).date === today), all),
  };
}

/** Upcoming: what is overdue, then every day from today for `days` days, empty days included (each in cmp's order)
 * @param {Task[]} tasks @param {string} today @param {number} days @param {(a: Task, b: Task) => number} [cmp] */
export function upcomingView(tasks, today, days, cmp = dayOrder) {
  const dated = open(tasks).filter(t => dueOf(t.due)), all = tasks.filter(isTask);
  /** @type {Map<string, Task[]>} */
  const by = new Map();
  for (const t of dated) { const k = /** @type {any} */ (t.due).date; (by.get(k) ?? by.set(k, []).get(k))?.push(t); }
  return {
    overdue: dayLines(dated.filter(t => /** @type {any} */ (t.due).date < today), all, cmp),
    days: Array.from({ length: days }, (_, i) => { const key = addDays(today, i); return { key, lines: dayLines(by.get(key) ?? [], all, cmp) }; }),
  };
}

/** the done tasks, newest first, by the day they were done ('' for none known) @param {Task[]} tasks @returns {{ key: string, tasks: Task[] }[]} */
export function completedView(tasks) {
  const done = tasks.filter(t => isTask(t) && t.done).sort((a, b) => (Number(b.doneAt) || 0) - (Number(a.doneAt) || 0));
  /** @type {Map<string, Task[]>} */
  const by = new Map();
  for (const t of done) {
    const at = typeof t.doneAt === 'number' ? new Date(t.doneAt) : null;
    const k = at ? `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}` : '';
    (by.get(k) ?? by.set(k, []).get(k))?.push(t);
  }
  return [...by].map(([key, list]) => ({ key, tasks: list }));
}

/** the projects as Browse lists them (not the Inbox): each with its sub-projects under it, deeper each level, a folded one's hidden
 * @param {Project[]} projects @returns {{ project: Project, depth: number, kids: number }[]} */
export function projectTree(projects) {
  const live = projects.filter(p => p && p.name && p.id !== INBOX && !p.inbox), ids = new Set(live.map(p => p.id));
  /** @type {Map<string, Project[]>} */
  const kids = new Map();
  for (const p of live) { const k = p.parentId && ids.has(p.parentId) ? p.parentId : ''; (kids.get(k) ?? kids.set(k, []).get(k))?.push(p); }
  const out = /** @type {{ project: Project, depth: number, kids: number }[]} */ ([]), seen = new Set();
  const walk = (/** @type {string} */ at, /** @type {number} */ depth) => {
    for (const p of byOrder(kids.get(at) ?? [])) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ project: p, depth, kids: (kids.get(p.id) ?? []).length });
      if (!p.collapsed) walk(p.id, depth + 1);
    }
  };
  walk('', 0);
  return out;
}

/** open tasks in each project (subtasks too) @param {Task[]} tasks @returns {Map<string, number>} */
export function projectCounts(tasks) {
  const m = new Map();
  for (const t of open(tasks)) m.set(projectOf(t), (m.get(projectOf(t)) ?? 0) + 1);
  return m;
}
/** open tasks due today or before @param {Task[]} tasks @param {string} today */
export const todayCount = (tasks, today) => open(tasks).filter(t => { const d = dueOf(t.due); return d && d.date <= today; }).length;
/** open tasks due after today @param {Task[]} tasks @param {string} today */
export const upcomingCount = (tasks, today) => open(tasks).filter(t => { const d = dueOf(t.due); return d && d.date > today; }).length;

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
// layout: '' (a project's own view, else list), list, board or calendar; cal: week, month or agenda (Today: its day;
// Upcoming: no agenda); color: the calendar's fill (Inbox and projects: not by project); allDay: the all-day row open
/** @typedef {{ group: string, sort: string, dir: 'asc' | 'desc', completed: boolean, priority: number, label: string, date: string,
 *   layout: string, cal: string, color: string, allDay: boolean, future: boolean }} Display */
export const GROUPS = ['none', 'date', 'priority', 'label', 'project'];
export const SORTS = ['manual', 'name', 'date', 'priority', 'added'];
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
    layout: ['list', 'calendar', ...(view.startsWith('project:') ? ['board'] : [])].includes(str('layout')) ? str('layout') : '',
    cal: ['month', ...(view === 'upcoming' ? [] : ['agenda'])].includes(str('cal')) ? str('cal') : 'week',
    color: ['label', ...(view === 'inbox' || view.startsWith('project:') ? [] : ['project'])].includes(str('color')) ? str('color') : 'priority',
    allDay: o.allDay !== false,
    future: o.future === true,
  };
}
/** whether a view's choices are the defaults @param {Display} d @param {string} view */
export const plainDisplay = (d, view) => JSON.stringify(d) === JSON.stringify(cleanDisplay({}, view));

/** the tasks the Display filter lets through @param {Task[]} tasks @param {Display} d @param {Label[]} labels @param {string} today */
export function narrowTasks(tasks, d, labels, today) {
  return tasks.filter(t => {
    if (d.priority && priorityOf(t) !== d.priority) return false;
    if (d.label && !labelsOf(t, labels).some(l => l.id === d.label)) return false;
    const due = dueOf(t.due)?.date;
    if (d.date === 'today') return !!due && due <= today;
    if (d.date === 'week') return !!due && due <= addDays(today, 6);
    if (d.date === 'overdue') return !!due && due < today;
    if (d.date === 'nodate') return !due;
    return true;
  });
}

/** a comparator for a sort key and direction; manual is the list's own order (a task with no date sorts last either way)
 * @param {string} sort @param {'asc' | 'desc'} dir @param {(a: Task, b: Task) => number} [manual] */
export function sorter(sort, dir, manual = (a, b) => num(a.order) - num(b.order)) {
  const when = (/** @type {Task} */ t) => { const d = dueOf(t.due); return d ? `${d.date}T${isTime(d.time) ? d.time : '~'}` : ''; };
  /** @type {Record<string, (a: Task, b: Task) => number>} */
  const by = {
    name: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
    date: (a, b) => (when(a) < when(b) ? -1 : when(a) > when(b) ? 1 : 0),
    priority: (a, b) => priorityOf(a) - priorityOf(b),
    added: (a, b) => num(a.createdAt) - num(b.createdAt),
  };
  const f = by[sort];
  if (!f) return manual;
  const sign = dir === 'desc' ? -1 : 1;
  return (/** @type {Task} */ a, /** @type {Task} */ b) => {
    if (sort === 'date' && !when(a) !== !when(b)) return when(a) ? -1 : 1;
    return sign * f(a, b) || manual(a, b);
  };
}

/**
 * A flat list in groups (Display's grouping): by date (Overdue, each day, No date), priority, label (a task with two
 * shows under both; No label last) or project; none is one group. Done tasks (when given) go to each group's end.
 * @param {Task[]} tasks @param {Display} d
 * @param {{ projects: Project[], labels: Label[], today: string, manual?: (a: Task, b: Task) => number }} c
 * @returns {{ key: string, title: string, tasks: Task[] }[]}
 */
export function groupTasks(tasks, d, c) {
  /** @type {Map<string, { key: string, title: string, tasks: Task[] }>} */
  const by = new Map();
  const into = (/** @type {string} */ key, /** @type {string} */ title, /** @type {Task} */ t) => (by.get(key) ?? by.set(key, { key, title, tasks: [] }).get(key))?.tasks.push(t);
  const list = tasks.filter(isTask);
  if (d.group === 'date') {
    for (const t of list) {
      const due = dueOf(t.due)?.date;
      if (!due) into('~', 'No date', t);
      else if (due < c.today && !t.done) into('0', 'Overdue', t);
      else into(`1${due}`, dayTitle(due, c.today), t);
    }
  } else if (d.group === 'priority') for (const t of list) into(String(priorityOf(t)), priorityOf(t) === 4 ? 'No priority' : `Priority ${priorityOf(t)}`, t);
  else if (d.group === 'label') {
    for (const t of list) { const ls = labelsOf(t, c.labels); if (!ls.length) into('~', 'No label', t); for (const l of ls) into(l.id, l.name, t); }
  } else if (d.group === 'project') {
    for (const t of list) { const p = c.projects.find(x => x.id === projectOf(t)); into(projectOf(t), projectOf(t) === INBOX || !p ? 'Inbox' : p.name, t); }
  } else for (const t of list) into('', '', t);
  const rank = d.group === 'label' ? new Map(byOrder(c.labels).map((l, i) => [l.id, i]))
    : d.group === 'project' ? new Map([[INBOX, -1], ...projectTree(c.projects).map((x, i) => /** @type {[string, number]} */ ([x.project.id, i]))]) : null;
  const pos = (/** @type {string} */ k) => (k === '~' ? Infinity : rank ? rank.get(k) ?? 1e9 : 0);
  const groups = [...by.values()].sort((a, b) => (rank ? pos(a.key) - pos(b.key) : a.key === '~' ? 1 : b.key === '~' ? -1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const cmp = sorter(d.sort, d.dir, c.manual ?? (d.group === 'date' ? dayOrder : undefined));
  for (const g of groups) g.tasks.sort((a, b) => Number(!!a.done) - Number(!!b.done) || cmp(a, b));
  return groups;
}
