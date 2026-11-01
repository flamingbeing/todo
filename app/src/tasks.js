// What each list shows, from the records alone (no page here, so it is unit-tested): a project's tasks under its
// sections, Today and Upcoming by day, the done tasks, the projects' tree and the counts. A record without a title is
// skipped (an older copy, or not a task yet).
import { INBOX } from './items.js';
import { dueOf, isDay, isTime, addDays } from './dates.js';
import { flatten, descendants } from './tree.js';
import { byOrder } from './order.js';
import { isColor, DEFAULT_COLOR } from './colors.js';

/** @typedef {import('./items.js').Task} Task */
/** @typedef {import('./items.js').Project} Project */
/** @typedef {import('./items.js').Section} Section */
/** @typedef {import('./tree.js').Line<Task>} Line */

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
 * @param {Task[]} tasks @param {Section[]} sections @param {string} projectId
 * @returns {{ loose: Line[], sections: { section: Section, lines: Line[] }[] }}
 */
export function projectView(tasks, sections, projectId) {
  const mine = open(tasks).filter(t => projectOf(t) === projectId), ids = new Set(mine.map(t => t.id));
  const own = byOrder(sections.filter(s => s && s.projectId === projectId && s.name));
  const known = new Set(own.map(s => s.id));
  const tops = byOrder(mine.filter(t => !t.parentId || !ids.has(t.parentId)));
  const sectionOf = (/** @type {Task} */ t) => (t.sectionId && known.has(t.sectionId) ? t.sectionId : '');
  const all = tasks.filter(isTask);
  return {
    loose: flatten(tops.filter(t => !sectionOf(t)), all),
    sections: own.map(section => ({ section, lines: flatten(tops.filter(t => sectionOf(t) === section.id), all) })),
  };
}

/** a day's order: as dragged when both were placed on the day by hand (dayOrder), else timed tasks first by time, then
 * by priority, then by their own order @param {Task} a @param {Task} b */
export function dayOrder(a, b) {
  const da = dueOf(a.due), db = dueOf(b.due);
  if (da && db && da.date !== db.date) return da.date < db.date ? -1 : 1;
  if (typeof a.dayOrder === 'number' && typeof b.dayOrder === 'number' && a.dayOrder !== b.dayOrder) return a.dayOrder - b.dayOrder;
  const ta = isTime(da?.time) ? /** @type {string} */ (da?.time) : '~', tb = isTime(db?.time) ? /** @type {string} */ (db?.time) : '~';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return priorityOf(a) - priorityOf(b) || num(a.dayOrder ?? a.order) - num(b.dayOrder ?? b.order) || num(a.createdAt) - num(b.createdAt);
}
/** rows for a list by day: each task alone (its subtasks show only on their own dates), with its counts */
const dayLines = (/** @type {Task[]} */ list, /** @type {Task[]} */ all) => flatten(list.sort(dayOrder), all, { open: () => false });

/** Today: what is overdue (before today), then what is due today @param {Task[]} tasks @param {string} today */
export function todayView(tasks, today) {
  const dated = open(tasks).filter(t => dueOf(t.due)), all = tasks.filter(isTask);
  return {
    overdue: dayLines(dated.filter(t => /** @type {any} */ (t.due).date < today), all),
    today: dayLines(dated.filter(t => /** @type {any} */ (t.due).date === today), all),
  };
}

/** Upcoming: what is overdue, then every day from today for `days` days, empty days included @param {Task[]} tasks @param {string} today @param {number} days */
export function upcomingView(tasks, today, days) {
  const dated = open(tasks).filter(t => dueOf(t.due)), all = tasks.filter(isTask);
  /** @type {Map<string, Task[]>} */
  const by = new Map();
  for (const t of dated) { const k = /** @type {any} */ (t.due).date; (by.get(k) ?? by.set(k, []).get(k))?.push(t); }
  return {
    overdue: dayLines(dated.filter(t => /** @type {any} */ (t.due).date < today), all),
    days: Array.from({ length: days }, (_, i) => { const key = addDays(today, i); return { key, lines: dayLines(by.get(key) ?? [], all) }; }),
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
  if (f.order !== undefined && typeof f.order === 'number') out.order = f.order;
  if (f.collapsed !== undefined) out.collapsed = !!f.collapsed;
  return /** @type {import('./items.js').Fields} */ (out);
}

/** a colour key the rules take @param {unknown} c */
export const cleanColor = c => (isColor(c) ? /** @type {string} */ (c) : DEFAULT_COLOR);
