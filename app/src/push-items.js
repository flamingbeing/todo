// What the Worker is asked to send as Web Push (push-wire.js): the reminders coming due soon, from the same logic as the
// on-screen ones (reminders.js). Each item's key is the local notification's tag, so a push and a local one for the same
// reminder collapse into one.
import { firesOf, bodyOf } from './reminders.js';

/** how far ahead the Worker's queue is filled (it takes up to 8 days) */
export const AHEAD_MS = 7 * 24 * 3600 * 1000;
/** the Worker sends what is due within 30 s of now; later than this from now is the queue's, so a re-post cannot bring one back */
export const MIN_AHEAD_MS = 60 * 1000;
/** the Worker's cap */
export const MAX_ITEMS = 200;

/** date, time and lead: what the reminder was made from; the Worker sends it only while the task still has them
 * @param {import('./items.js').Task[]} tasks @param {number} now
 * @returns {{ key: string, at: number, title: string, body: string, taskId: string, date: string, time: string, lead: number }[]} soonest first */
export function pushItems(tasks, now) {
  const out = [];
  for (const t of tasks) for (const f of firesOf(t)) if (f.at > now + MIN_AHEAD_MS && f.at <= now + AHEAD_MS) {
    out.push({ key: f.key, at: f.at, title: (f.title || 'Task').slice(0, 200), body: bodyOf(f), taskId: f.taskId, date: String(t.due?.date), time: String(t.due?.time || ''), lead: f.lead });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_ITEMS);
}
