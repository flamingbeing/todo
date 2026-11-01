// Days and times, all local (floating): a task due 9:00 is due at 9:00 wherever the person is. A day is 'YYYY-MM-DD'
// text, a time 'HH:MM'. The words a row or a group header shows, and the tone its colour comes from.

/** @typedef {{ date: string, time?: string | null, rrule?: string | null, string?: string | null, fromDone?: boolean | null }} Due */
/** @typedef {'overdue' | 'today' | 'tomorrow' | 'week' | 'later'} Tone */

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
/** @param {Date} [d] @returns {string} the local day */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** @param {Date} [d] @returns {string} the local time, HH:MM */
export const timeKey = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** @param {unknown} v */
export const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8))).toISOString().slice(0, 10) === v;
/** @param {unknown} v */
export const isTime = v => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
/** @param {string} key @returns {Date} noon UTC of that day (day maths only) */
const utc = key => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10), 12));
/** @param {string} key @param {number} n @returns {string} */
export const addDays = (key, n) => { const d = utc(key); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** days from a to b (b later: positive) @param {string} a @param {string} b */
export const daysBetween = (a, b) => Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);
/** @param {string} key @returns {number} 0 Sunday .. 6 Saturday */
export const weekdayOf = key => utc(key).getUTCDay();

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** @param {string} key */
export const weekdayName = key => WEEKDAYS[weekdayOf(key)];
/** "3 Nov", or "3 Nov 2027" in another year @param {string} key @param {string} today */
export const shortDate = (key, today) => `${+key.slice(8, 10)} ${MONTHS[+key.slice(5, 7) - 1]}${key.slice(0, 4) === today.slice(0, 4) ? '' : ` ${key.slice(0, 4)}`}`;

/** @type {Intl.DateTimeFormat | null} */
let clock = null;
/** a time in the person's own clock style ("9:30 AM", "09:30") @param {string} hhmm */
export const timeText = hhmm => {
  clock ??= new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return clock.format(new Date(2000, 0, 1, +hhmm.slice(0, 2), +hhmm.slice(3, 5)));
};
/** minutes after midnight in the person's own clock style (the calendar's blocks, now line, drop line) @param {number} min */
export const minutesClock = min => timeText(`${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`);
/** a span in that style, said once where both ends share it: "12:30 – 1:30 PM", "12:30–13:30" @param {number} a @param {number} b */
export const minutesSpan = (a, b) => {
  clock ??= new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const at = (/** @type {number} */ m) => new Date(2000, 0, 1, Math.floor(m / 60) % 24, m % 60);
  return clock.formatRange ? clock.formatRange(at(a), at(b)) : `${minutesClock(a)}–${minutesClock(b)}`;
};

/** @param {unknown} due @returns {Due | null} a usable due map, or null */
export const dueOf = due => (due && typeof due === 'object' && isDay(/** @type {Due} */ (due).date) ? /** @type {Due} */ (due) : null);

/**
 * The tone of a due date: overdue before today (or today, past its time), then today, tomorrow, this week (2 to 6 days
 * ahead) and later.
 * @param {Due} due @param {string} today @param {string} [now] the time now, HH:MM
 * @returns {Tone}
 */
export function dateTone(due, today, now = timeKey()) {
  const n = daysBetween(today, due.date);
  if (n < 0 || (n === 0 && isTime(due.time) && /** @type {string} */ (due.time) < now)) return 'overdue';
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n <= 6 ? 'week' : 'later';
}

/** "Today", "Tomorrow", "Yesterday", a weekday within 6 days, else "3 Nov" @param {string} key @param {string} today */
export function dayWords(key, today) {
  const n = daysBetween(today, key);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 1 && n <= 6 ? weekdayName(key) : shortDate(key, today);
}

/** a deadline in words: "Today", "Tomorrow", "in 5 days" (within two weeks), else "3 Nov"; past ones are red, the rest purple
 * @param {unknown} date @param {string} today @returns {{ text: string, tone: 'overdue' | 'deadline' } | null} */
export function deadlineLine(date, today) {
  if (typeof date !== 'string' || !isDay(date)) return null;
  const n = daysBetween(today, date);
  const text = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 1 && n <= 14 ? `in ${n} days` : shortDate(date, today);
  return { text, tone: n < 0 ? 'overdue' : 'deadline' };
}

/** "45 min", "1 h", "2 h 30 min" @param {number} n minutes */
export const minutesText = n => (n < 60 ? `${n} min` : `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}`);

/**
 * What a row shows for its due date: the words (with the time, and its end when the task has a duration: "10:00–10:45"),
 * the tone and whether it repeats. own: the day of the group the row is in (Today, an Upcoming day), whose date is not
 * repeated (only the time shows, or nothing).
 * @param {unknown} due @param {string} today @param {{ own?: string, now?: string, dur?: number | null }} [o]
 * @returns {{ text: string, tone: Tone, repeats: boolean } | null}
 */
export function dueLine(due, today, { own, now, dur } = {}) {
  const d = dueOf(due);
  if (!d) return null;
  const t = isTime(d.time) ? /** @type {string} */ (d.time) : '', end = t && dur ? (+t.slice(0, 2) * 60 + +t.slice(3) + dur) % 1440 : -1;
  const time = t ? timeText(t) + (end < 0 ? '' : `–${timeText(`${pad(Math.floor(end / 60))}:${pad(end % 60)}`)}`) : '';
  const day = d.date === own ? '' : dayWords(d.date, today);
  return { text: [day, time].filter(Boolean).join(' '), tone: dateTone(d, today, now), repeats: !!d.rrule };
}

/** an Upcoming or Today group header: "1 Nov · Today · Sunday", "3 Nov · Tuesday" @param {string} key @param {string} today */
export function dayTitle(key, today) {
  const n = daysBetween(today, key);
  return [shortDate(key, today), n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : '', weekdayName(key)].filter(Boolean).join(' · ');
}

/** the first day of key's week (weekStart 1: Monday, 0: Sunday) @param {string} key @param {number} [weekStart] */
export const weekOf = (key, weekStart = 1) => addDays(key, -((weekdayOf(key) - weekStart + 7) % 7));
/** a month as weeks of 7 days, from the week its 1st is in to the week its last day is in (days of the months
 * beside it included) @param {string} month YYYY-MM @param {number} [weekStart] @returns {string[][]} */
export function monthGrid(month, weekStart = 1) {
  const first = `${month}-01`, next = addDays(first, 32).slice(0, 7), last = addDays(`${next}-01`, -1);
  const weeks = [];
  for (let d = weekOf(first, weekStart); d <= last; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  return weeks;
}
/** "November 2026" @param {string} key */
export const monthTitle = key => `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;
