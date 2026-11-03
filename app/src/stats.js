// Productivity numbers, pure: from the completed tasks (done with a doneAt time) work out the days' counts, today's and this
// week's totals, the goals and the streak. No points: counts only. Loaded with the Productivity page (lazyModules), never at startup.
import { dayKey, addDays, weekOf, weekdayOf } from './dates.js';

/** @typedef {import('./items.js').Task} Task */

/** a goal option value: a whole number 0..999, 0 meaning no goal @param {unknown} v */
export const cleanGoal = v => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(999, n) : 0; };

/** how many tasks were completed on each day (local day of doneAt) @param {Task[]} tasks @returns {Map<string, number>} */
export function doneByDay(tasks) {
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const t of tasks) {
    if (!t || !t.done || typeof t.doneAt !== 'number' || !Number.isFinite(t.doneAt)) continue;
    const k = dayKey(new Date(t.doneAt));
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/**
 * @param {Task[]} tasks @param {{ today?: string, daily?: number, weekly?: number, weekStart?: number, daysOff?: number[], vacation?: boolean }} [o]
 *   daysOff: weekdays (0 Sunday) that never break a streak; vacation: the days since the last met one wait (the streak holds).
 *   daily / weekly: the goals (0: none). A day counts for the streak when it met the daily goal (with none: when anything was done);
 *   a day without a finish ends the streak, except that today may still be open (the streak then runs up to yesterday).
 * @returns {{ today: number, week: number, streak: number, best: number, days: { day: string, n: number }[], daily: number, weekly: number, max: number }}
 *   days: the last 7 days, oldest first
 */
export function productivity(tasks, { today = dayKey(), daily = 0, weekly = 0, weekStart = 1, daysOff = [], vacation = false } = {}) {
  const by = doneByDay(tasks), n = (/** @type {string} */ k) => by.get(k) ?? 0;
  const need = Math.max(1, daily || 1);
  const met = (/** @type {string} */ k) => n(k) >= need;
  // (Settings > Productivity: a day off that is not met neither counts nor breaks a streak)
  const off = (/** @type {string} */ k) => daysOff.includes(weekdayOf(k));
  const first = weekOf(today, weekStart);
  let week = 0;
  for (let k = first; k <= today; k = addDays(k, 1)) week += n(k);
  // the streak back from today (today not met yet does not break it); in vacation mode the days since the last met one wait
  let streak = 0, k = met(today) ? today : addDays(today, -1);
  const start = [...by.keys()].sort()[0] ?? today;
  for (; k >= start; k = addDays(k, -1)) {
    if (met(k)) streak++;
    else if (!off(k) && !(vacation && !streak)) break;
  }
  // the longest run anywhere in the history (days off bridge it)
  let best = 0;
  const days = [...by.keys()].filter(d => met(d)).sort();
  for (let d = days[0], run = 0; d && d <= today; d = addDays(d, 1)) {
    if (met(d)) { run++; if (run > best) best = run; } else if (!off(d)) run = 0;
  }
  const last7 = Array.from({ length: 7 }, (_, i) => { const day = addDays(today, i - 6); return { day, n: n(day) }; });
  return { today: n(today), week, streak, best: Math.max(best, streak), days: last7, daily: cleanGoal(daily), weekly: cleanGoal(weekly),
    max: Math.max(1, ...last7.map(d => d.n), cleanGoal(daily)) };
}
