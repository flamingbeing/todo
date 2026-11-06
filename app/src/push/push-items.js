// What the Worker is asked to send as Web Push (push-wire.js posts it to /api/push/schedule), and what the Worker checks again
// just before it sends (worker/push.js imports itemPath and stampOf from here, so both sides agree). The notifications are the
// reminders coming due soon, from the same logic as the on-screen ones (reminders.js firesOf); each key is the local
// notification's tag, so a push and a local one for the same reminder collapse into one.
import { COLL } from '../items.js';
import { spaceOf } from '../roles.js';
import { firesOf, bodyOf } from '../reminders.js';
import { cleanReminders } from '../tasks.js';

/** how far ahead the Worker's queue is filled (it takes up to 8 days) */
export const AHEAD_MS = 7 * 24 * 3600 * 1000;
/** the Worker sends what is due within 30 s of now; later than this from now is the queue's, so a re-post cannot bring one back */
export const MIN_AHEAD_MS = 60 * 1000;
/** the Worker's cap */
export const MAX_ITEMS = 200;

/** an id the Worker can read as a document name (Firestore refuses '/', '.', '..' and '__…__'; one such id in a batched read
 * would fail every run of the job) @param {unknown} id */
export const okId = id => typeof id === 'string' && id.length > 0 && id.length <= 128 && !id.includes('/') && id !== '.' && id !== '..' && !/^__.*__$/.test(id);

/** the task's document, which the Worker reads at send time: in its person's own space (roles.js spaceOf)
 * @param {string} itemId @param {string} uid the queued notification's person @param {(u: { uid: string }) => string} [space] */
export const itemPath = (itemId, uid, space = spaceOf) => `spaces/${space({ uid })}/${COLL}/${itemId}`;

/** what a reminder depends on: the task's due day, time and reminders while it is open; '' when there is nothing to notify
 * (done, deleted, no day). A queued reminder goes out only while the task's stamp is unchanged. @param {any} task @returns {string} */
export function stampOf(task) {
  if (!task || task.done || task._deleted || typeof task.due?.date !== 'string' || !task.due.date) return '';
  return `${task.due.date}|${typeof task.due.time === 'string' ? task.due.time : ''}|${cleanReminders(task.reminders).join(',')}`;
}

/** @typedef {{ key: string, at: number, title: string, body: string, itemId: string, stamp: string }} PushItem */

/** The reminders to queue, soonest first: later than a minute from now and within a week.
 * @param {import('../items.js').Task[]} tasks @param {number} now @returns {PushItem[]} */
export function pushItems(tasks, now) {
  const out = [];
  for (const t of tasks) {
    if (!okId(t.id)) continue;
    const stamp = stampOf(t);
    if (stamp) for (const f of firesOf(t)) if (f.at > now + MIN_AHEAD_MS && f.at <= now + AHEAD_MS) {
      out.push({ key: f.key, at: f.at, title: (f.title || 'Task').slice(0, 200), body: bodyOf(f), itemId: t.id, stamp });
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, MAX_ITEMS);
}
