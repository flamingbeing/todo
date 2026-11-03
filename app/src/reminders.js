// Reminders, the plain part (no page needed, so node tests it): a task's `reminders` is a list of offsets, each the whole
// minutes before the task's due time (0 = at the time), up to 5, none twice. A task with a date and no time is due at
// 09:00 that day. The delivery (reminder-delivery.js) asks this file what is due now.
import { isDay, isTime } from './dates.js';
import { cleanReminders } from './tasks.js';
export { cleanReminders };

/** the time a date-only task is due, for its reminders */
export const DEFAULT_TIME = '09:00';
/** a reminder later than this after its time is not shown (the app was shut; a late buzz is noise) */
export const LATE_MS = 15 * 60 * 1000;

/** @type {[number, string][]} the leads the sheet offers */
export const LEADS = [[0, 'At time of task'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'],
  [60, '1 hour before'], [120, '2 hours before'], [1440, '1 day before'], [2880, '2 days before'], [10080, '1 week before']];

/** "At time", "30 minutes before", "1 hour before", "2 days before" @param {number} n */
export function leadText(n) {
  if (n <= 0) return 'At time of task';
  const unit = n % 10080 === 0 ? [n / 10080, 'week'] : n % 1440 === 0 ? [n / 1440, 'day'] : n % 60 === 0 ? [n / 60, 'hour'] : [n, 'minute'];
  return `${unit[0]} ${unit[1]}${unit[0] === 1 ? '' : 's'} before`;
}

/**
 * Settings > Reminders "Send automatic reminders": the reminders a task gets when it is saved with a due time. A lead
 * (minutes before, option autoReminder; -1 off) is added only when the due has a time and the task has none of its own.
 * @param {{ time?: unknown } | null | undefined} due @param {number[] | null | undefined} reminders @param {unknown} lead
 * @returns {number[]}
 */
export function autoReminders(due, reminders, lead) {
  const own = reminders ?? [];
  const n = Number(lead);
  if (own.length || !due || !isTime(due.time) || !Number.isInteger(n) || n < 0) return own;
  return cleanReminders([n]);
}

/** the short form for a row or a chip: "At time", "30m", "1h", "2d" @param {number} n */
export function leadShort(n) {
  if (n <= 0) return 'At time';
  return n % 1440 === 0 ? `${n / 1440}d` : n % 60 === 0 ? `${n / 60}h` : `${n}m`;
}

/** the moment (ms) a task is due, in this device's time; null with no date @param {{ due?: { date?: unknown, time?: unknown } | null }} t */
export function dueMs(t) {
  const due = t.due;
  if (!due || !isDay(due.date)) return null;
  const time = isTime(due.time) ? String(due.time) : DEFAULT_TIME;
  const [y, m, d] = String(due.date).split('-').map(Number), [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

/** @typedef {{ key: string, taskId: string, title: string, at: number, lead: number, dueAt: number }} Fire */

/** every reminder of a task as a moment to fire; the key is the same for the same task, lead and due moment, so a
 * repeating task (whose due moves on) fires again at its next one @param {import('./items.js').Task} t @returns {Fire[]} */
export function firesOf(t) {
  const due = dueMs(t);
  if (due === null || t.done || t._deleted) return [];
  return cleanReminders(t.reminders).map(lead => ({ key: `${t.id}|${lead}|${due}`, taskId: t.id, title: String(t.title ?? ''), at: due - lead * 60000, lead, dueAt: due }));
}

/** what is due to show now: its time has come, it is not more than LATE_MS past, and its key is not in `sent`
 * @param {import('./items.js').Task[]} tasks @param {number} now @param {Set<string>} sent @returns {Fire[]} */
export function dueNow(tasks, now, sent) {
  const out = /** @type {Fire[]} */ ([]);
  for (const t of tasks) for (const f of firesOf(t)) if (f.at <= now && now - f.at <= LATE_MS && !sent.has(f.key)) out.push(f);
  return out.sort((a, b) => a.at - b.at);
}

/** the next moment after `now` anything fires, or null @param {import('./items.js').Task[]} tasks @param {number} now */
export function nextAt(tasks, now) {
  let best = /** @type {number | null} */ (null);
  for (const t of tasks) for (const f of firesOf(t)) if (f.at > now && (best === null || f.at < best)) best = f.at;
  return best;
}

/** the notification's words: the task title, and when it is due @param {Fire} f */
export function bodyOf(f) {
  const time = new Date(f.dueAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return f.lead === 0 ? `Due now, ${time}` : `${leadText(f.lead).replace(' before', '')} to go, due ${time}`;
}
