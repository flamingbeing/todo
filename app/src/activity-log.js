// What the activity screens list, worked out from what is saved (no log of its own): pure, so the tests can load it.
// Three kinds are known: a task added (createdAt), a task completed (doneAt) and a comment written (createdAt).
import { isTask } from './tasks.js';
import { dayKey } from './dates.js';

/** @typedef {import('./items.js').Task} Task */
/** @typedef {'added' | 'completed' | 'commented'} Kind */
/** @typedef {{ at: number, text: string, ic: 'circlePlus' | 'squareCheck' | 'messageSquare', kind?: Kind, title?: string, projectId?: string, sub?: boolean }} Event */

/** the kinds Reporting's filter offers, in its order */
export const KINDS = /** @type {const} */ ([['all', 'All'], ['completed', 'Completed'], ['added', 'Added'], ['commented', 'Comments']]);

/** the events for some tasks and comments, newest first. Exported for the unit tests.
 * @param {Task[]} tasks @param {import('./items.js').Comment[]} comments @param {{ extra?: Event[] }} [o] */
export function events(tasks, comments, o = {}) {
  /** @type {Event[]} */
  const out = [...(o.extra ?? [])];
  const projectOf = new Map(tasks.map(t => [t.id, t.projectId || 'inbox']));
  for (const t of tasks) {
    if (!isTask(t)) continue;
    const sub = !!t.parentId, word = sub ? 'Sub-task' : 'Task', projectId = t.projectId || 'inbox';
    if (t.createdAt) out.push({ at: t.createdAt, text: `${word} added: ${t.title}`, ic: 'circlePlus', kind: 'added', title: t.title, projectId, sub });
    if (t.done && t.doneAt) out.push({ at: t.doneAt, text: `${word} completed: ${t.title}`, ic: 'squareCheck', kind: 'completed', title: t.title, projectId, sub });
  }
  for (const c of comments) {
    if (!c.createdAt) continue;
    const short = c.text.length > 80 ? `${c.text.slice(0, 80)}…` : c.text;
    // (a project's own comment has the project's id in taskId)
    out.push({ at: c.createdAt, text: `${c.name || 'Someone'} commented: ${short}`, ic: 'messageSquare', kind: 'commented', title: short, projectId: projectOf.get(c.taskId) ?? c.taskId });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** only one kind ('all': every one) @param {Event[]} list @param {string} kind */
export const ofKind = (list, kind) => (kind === 'all' ? list : list.filter(e => e.kind === kind));

/** the events by local day, newest day first, each day's in their order @param {Event[]} list @returns {{ day: string, events: Event[] }[]} */
export function byDay(list) {
  /** @type {{ day: string, events: Event[] }[]} */
  const out = [];
  for (const e of list) {
    const day = dayKey(new Date(e.at)), last = out[out.length - 1];
    if (last && last.day === day) last.events.push(e); else out.push({ day, events: [e] });
  }
  return out;
}

/** Reporting's words before the title (shown in bold): "You completed a task:" @param {Event} e */
export function lead(e) {
  const what = e.sub ? 'a sub-task' : 'a task';
  return e.kind === 'completed' ? `You completed ${what}:` : e.kind === 'added' ? `You added ${what}:` : e.kind === 'commented' ? 'You commented:' : '';
}
