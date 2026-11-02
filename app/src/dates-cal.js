// Calendar-only date helpers, kept out of dates.js so the first screen does not load them (the month picker, the month grid
// and the calendar blocks' time span load with the screens that use them).
import { addDays, weekOf, minutesClock } from './dates.js';

/** @type {Intl.DateTimeFormat | null} */
let clock = null;
/** a span in that style, said once where both ends share it: "12:30 – 1:30 PM", "12:30–13:30" @param {number} a @param {number} b */
export const minutesSpan = (a, b) => {
  clock ??= new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const at = (/** @type {number} */ m) => new Date(2000, 0, 1, Math.floor(m / 60) % 24, m % 60);
  return clock.formatRange ? clock.formatRange(at(a), at(b)) : `${minutesClock(a)}–${minutesClock(b)}`;
};

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
