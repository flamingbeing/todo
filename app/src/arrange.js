// How a list is arranged beyond its plain order, from the records alone (unit-tested, never loaded at startup): Display's
// filter, sort and groups; Upcoming's days; the done tasks by day; Browse's project tree and counts.
import { INBOX } from './items.js';
import { dueOf, isTime, addDays, dayTitle, isDay } from './dates.js';
import { byOrder } from './order.js';
import { isTask, projectOf, priorityOf, labelsOf, dayOrder, dayLines } from './tasks.js';

/** @typedef {import('./items.js').Task} Task */
/** @typedef {import('./items.js').Project} Project */
/** @typedef {import('./items.js').Label} Label */
/** @typedef {import('./tasks.js').Display} Display */
const num = (/** @type {unknown} */ v) => (typeof v === 'number' ? v : Infinity);
const open = (/** @type {Task[]} */ tasks) => tasks.filter(t => isTask(t) && !t.done);

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
  const by_ = (/** @type {Task} */ t) => (typeof t.deadline === 'string' ? t.deadline : '');
  /** @type {Record<string, (a: Task, b: Task) => number>} */
  const by = {
    name: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
    date: (a, b) => (when(a) < when(b) ? -1 : when(a) > when(b) ? 1 : 0),
    deadline: (a, b) => (by_(a) < by_(b) ? -1 : by_(a) > by_(b) ? 1 : 0),
    priority: (a, b) => priorityOf(a) - priorityOf(b),
    added: (a, b) => num(a.createdAt) - num(b.createdAt),
  };
  const f = by[sort];
  if (!f) return manual;
  const sign = dir === 'desc' ? -1 : 1;
  return (/** @type {Task} */ a, /** @type {Task} */ b) => {
    if (sort === 'date' && !when(a) !== !when(b)) return when(a) ? -1 : 1;
    if (sort === 'deadline' && !by_(a) !== !by_(b)) return by_(a) ? -1 : 1;
    return sign * f(a, b) || manual(a, b);
  };
}

/**
 * A flat list in groups (Display's grouping): by date (Overdue, each day, No date), deadline (the same, No deadline), priority, label (a task with two
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
  } else if (d.group === 'deadline') {
    for (const t of list) {
      const by = typeof t.deadline === 'string' && isDay(t.deadline) ? t.deadline : '';
      if (!by) into('~', 'No deadline', t);
      else if (by < c.today && !t.done) into('0', 'Overdue', t);
      else into(`1${by}`, dayTitle(by, c.today), t);
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
