// What the activity screen lists, worked out from what is saved (no log of its own): pure, so the tests can load it.
import { isTask } from './tasks.js';

/** @typedef {import('./items.js').Task} Task */
/** @typedef {{ at: number, text: string, ic: 'circlePlus' | 'squareCheck' | 'messageSquare' }} Event */

/** the events for some tasks and comments, newest first. Exported for the unit tests.
 * @param {Task[]} tasks @param {import('./items.js').Comment[]} comments @param {{ extra?: Event[] }} [o] */
export function events(tasks, comments, o = {}) {
  /** @type {Event[]} */
  const out = [...(o.extra ?? [])];
  for (const t of tasks) {
    if (!isTask(t)) continue;
    const sub = t.parentId ? 'Sub-task' : 'Task';
    if (t.createdAt) out.push({ at: t.createdAt, text: `${sub} added: ${t.title}`, ic: 'circlePlus' });
    if (t.done && t.doneAt) out.push({ at: t.doneAt, text: `${sub} completed: ${t.title}`, ic: 'squareCheck' });
  }
  for (const c of comments) if (c.createdAt) out.push({ at: c.createdAt, text: `${c.name || 'Someone'} commented: ${c.text.length > 80 ? `${c.text.slice(0, 80)}…` : c.text}`, ic: 'messageSquare' });
  return out.sort((a, b) => b.at - a.at);
}

