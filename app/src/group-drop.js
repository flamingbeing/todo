// What a drag between a list's groups changes (Display's grouping; ui/row-drag.js and the board apply it), what the
// "+" by a group's name starts a task with, the date a postponed task moves to, and why a sorted list has no drag.
// Pure: no page, no saves. Loaded with the gestures (lazyModules), never at startup.
//
// Groups and their keys are tasks.js groupTasks's: date ('0' Overdue, '1YYYY-MM-DD' a day, '~' No date), priority
// ('1'..'4'), label (a label's id, '~' No label), project (a project's id). A subtask sits in its own group, flat.
import { INBOX } from './items.js';
import { labelsOf, priorityOf, projectOf, cleanDue } from './tasks.js';
import { addDays, dayWords, dueOf } from './dates.js';
import { placeAt } from './order.js';

/** @typedef {import('./items.js').Task} Task */
/** @typedef {import('./items.js').Fields} Fields */
/** @typedef {import('./items.js').Label} Label */
/** @typedef {import('./items.js').Project} Project */
/**
 * A move to another group: the fields it sets, a new place (a project: top level, no section), which number orders
 * the group ('dayOrder' for days), the group's name for the toast, and what Undo puts back.
 * @typedef {{ fields: Fields, place?: { projectId: string, sectionId: null, parentId: null }, key: 'order' | 'dayOrder', title: string,
 *   was: Fields & { sectionId?: string | null, parentId?: string | null } }} GroupMove
 */

/** a group's name in a toast @param {string} group @param {string} key @param {{ labels: Label[], projects: Project[], today: string }} c */
export function groupName(group, key, c) {
  if (group === 'date') return key === '~' ? 'No date' : key === '0' ? 'Overdue' : dayWords(key.slice(1), c.today);
  if (group === 'priority') return key === '4' ? 'No priority' : `Priority ${key}`;
  if (group === 'label') return key === '~' ? 'No label' : c.labels.find(l => l.id === key)?.name ?? 'Label';
  if (group === 'project') return key === INBOX ? 'Inbox' : c.projects.find(p => p.id === key)?.name ?? 'Project';
  return '';
}

/**
 * A task dragged from one group to another (or within its own: then only its place changes) -> the move, or null
 * when that group takes no drop (Overdue: a task is not made late by hand).
 * @param {Task} task @param {string} group  Display's grouping @param {string} from  the group it was in @param {string} to  the group let go in
 * @param {{ labels: Label[], projects: Project[], today: string }} c @returns {GroupMove | null}
 */
export function groupMove(task, group, from, to, c) {
  const key = group === 'date' ? 'dayOrder' : 'order', title = groupName(group, to, c);
  if (from === to) return { fields: {}, key, title, was: {} };
  if (group === 'date') {
    if (to === '0') return null;
    const due = dueOf(task.due);
    // a day keeps the time, the repeat and its words; No date drops them (Undo brings them back)
    if (to === '~') return { fields: { due: null }, key, title, was: { due: due ?? null } };
    return { fields: { due: cleanDue({ ...(due ?? {}), date: to.slice(1) }) }, key, title, was: { due: due ?? null } };
  }
  if (group === 'priority') return { fields: { priority: Number(to) }, key, title, was: { priority: priorityOf(task) } };
  if (group === 'label') {
    const have = Array.isArray(task.labels) ? task.labels.map(String) : [];
    const source = from === '~' ? null : c.labels.find(l => l.id === from);
    // (a task may keep a label by its name, from before labels had ids)
    const kept = have.filter(v => !source || (v !== source.id && v.toLowerCase() !== source.name.toLowerCase()));
    const target = to === '~' ? null : c.labels.find(l => l.id === to);
    const next = target && !labelsOf({ ...task, labels: kept }, c.labels).includes(target) ? [...kept, target.id] : kept;
    return { fields: { labels: [...new Set(next)] }, key, title, was: { labels: have } };
  }
  if (group === 'project') {
    // to the project's top level; its subtasks go along (task-ops placeTask)
    return { fields: {}, place: { projectId: to, sectionId: null, parentId: null }, key, title,
      was: { projectId: projectOf(task), sectionId: task.sectionId ?? null, parentId: task.parentId ?? null } };
  }
  return { fields: {}, key, title, was: {} };
}

/**
 * Where a task goes among a group's tasks (shown in order, without it) at index at: its number and the others to
 * renumber first. By `order`: the midpoint of its neighbours (order.js). By `dayOrder`: the day numbered again from 1,
 * as Today and Upcoming keep it (a task there may have no dayOrder yet).
 * @param {Task[]} list @param {number} at @param {Task} task @param {'order' | 'dayOrder'} key
 * @returns {{ value: number, renumber: { item: Task, order: number }[] }}
 */
export function slotIn(list, at, task, key) {
  if (key === 'order') { const r = placeAt(list, at); return { value: r.order, renumber: r.renumber }; }
  const all = [...list];
  all.splice(Math.max(0, Math.min(at, all.length)), 0, task);
  return { value: all.indexOf(task) + 1, renumber: all.map((item, k) => ({ item, order: k + 1 })).filter(x => x.item !== task && x.item.dayOrder !== x.order) };
}

/** a group's "+": what a new task there starts with (null: no "+", as Overdue)
 * @param {string} group @param {string} key @param {{ labels: Label[] }} c @param {import('./screens/views.js').AddContext} base */
export function addFor(group, key, c, base) {
  if (group === 'date') return key === '0' ? null : { ...base, due: key === '~' ? null : { date: key.slice(1) } };
  if (group === 'priority') return { ...base, priority: Number(key) };
  if (group === 'label') { const l = c.labels.find(x => x.id === key); return { ...base, labels: l ? [l.name] : [] }; }
  if (group === 'project') return { ...base, projectId: key, sectionId: null, parentId: null };
  return base;
}

/** the date a task let go on Today's postpone place gets: tomorrow, keeping its time and repeat
 * @param {Task} task @param {string} today */
export const postponed = (task, today) => cleanDue({ ...(dueOf(task.due) ?? {}), date: addDays(today, 1) });

const SORT_NAMES = /** @type {Record<string, string>} */ ({ name: 'name', date: 'date', priority: 'priority', added: 'date added' });
/** why a sorted list has no drag, in a toast @param {string} sort */
export const sortedNote = sort => `This list is in ${SORT_NAMES[sort] ?? 'its own'} order`;
