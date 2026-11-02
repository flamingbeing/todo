// The calendar layout's arithmetic, drawn by screens/calendar.js (and never loaded at startup): which days a week
// shows for a width (3 columns on a phone, 7 from 600 px, Today's one day), minutes <-> pixels at 48 px an hour with a
// 15-minute snap, side-by-side lanes for blocks that overlap, a month's weeks with a few chips a day and "+N more",
// what a drop changes (a day keeps the time, a slot sets it, the all-day row drops it), the period's title and paging,
// and a repeating task's later dates in a range.
import { addDays, weekOf, isTime, dueOf } from './dates.js';
import { monthGrid } from './dates-cal.js';

/** @typedef {import('./dates.js').Due} Due */
/** @typedef {{ due?: Due | null, duration?: number | null }} Timed */
/** @typedef {'day' | 'week' | 'month'} Period  week: 3 or 7 days by width */

export const GUTTER = 54, HOUR = 48, SNAP = 15, MIN_H = 20, DAY = 1440, PLAN = 30;
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');

/** how many day columns: Today's one; 3 under 600 px wide, 7 from 600 @param {number} width @param {boolean} [day] */
export const columnCount = (width, day = false) => (day ? 1 : width < 600 ? 3 : 7);

/**
 * The days a week view shows from `date` (7 columns start on the week's first day; 3 and 1 on the date) and a column's width.
 * @param {string} date @param {number} width @param {{ day?: boolean, weekStart?: number }} [o] @returns {{ days: string[], width: number }}
 */
export function weekColumns(date, width, { day = false, weekStart = 1 } = {}) {
  const n = columnCount(width, day), first = n === 7 ? weekOf(date, weekStart) : date;
  return { days: Array.from({ length: n }, (_, i) => addDays(first, i)), width: (width - GUTTER) / n };
}

/** "10:30" -> 630; anything else -> null @param {unknown} t */
export const minutesOf = t => (isTime(t) ? Number(/** @type {string} */ (t).slice(0, 2)) * 60 + Number(/** @type {string} */ (t).slice(3, 5)) : null);
/** 630 -> "10:30" @param {number} min */
export const timeOf = min => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
/** minutes from midnight -> px down the grid @param {number} min */
export const yOf = min => (min * HOUR) / 60;
/** px down the grid -> minutes @param {number} y */
export const minOf = y => (y * 60) / HOUR;
/** to the nearest 15 minutes, within the day (a block starts by 23:45) @param {number} min @param {number} [step] */
export const snap = (min, step = SNAP) => Math.max(0, Math.min(DAY - step, Math.round(min / step) * step));
/** a block's height: its duration (none: 30 minutes), at least 20 px, not past midnight @param {number} start @param {number | null | undefined} duration */
export const blockHeight = (start, duration) => Math.max(MIN_H, yOf(Math.min(duration || PLAN, DAY - start)));
/** where the grid opens: an hour before now, or the first timed task when that is earlier (never above 00:00)
 * @param {number} now minutes @param {number | null} [first] */
export const openAt = (now, first) => yOf(Math.max(0, Math.min(now - 60, first ?? Infinity)));

/**
 * Lanes for blocks that overlap (in time as drawn: at least MIN_H tall): each block's lane and how many lanes its
 * cluster of overlapping blocks needs, so they sit side by side at equal widths.
 * @param {{ id: string, start: number, end: number }[]} blocks @returns {Map<string, { lane: number, of: number }>}
 */
export function lanes(blocks) {
  const out = new Map(), sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  /** @type {{ id: string, lane: number }[]} */
  let cluster = [];
  /** @type {number[]} */
  let ends = [];
  let until = -1;
  const close = () => { for (const c of cluster) out.set(c.id, { lane: c.lane, of: ends.length }); cluster = []; ends = []; };
  for (const b of sorted) {
    if (b.start >= until) close();
    let lane = ends.findIndex(e => e <= b.start);
    if (lane < 0) { lane = ends.length; ends.push(b.end); } else ends[lane] = b.end;
    cluster.push({ id: b.id, lane });
    until = Math.max(until, b.end);
  }
  close();
  return out;
}

/**
 * A month's weeks (from weekStart), each day with its items: all of them when they fit in max, else max - 1 and how
 * many more ("+N more" takes the last line).
 * @template T @param {string} month YYYY-MM @param {number} weekStart @param {Map<string, T[]>} byDay @param {number} [max]
 * @returns {{ key: string, inMonth: boolean, shown: T[], more: number }[][]}
 */
export function monthCells(month, weekStart, byDay, max = 3) {
  return monthGrid(month, weekStart).map(week => week.map(key => {
    const all = byDay.get(key) ?? [], cut = all.length > max ? Math.max(0, max - 1) : all.length;
    return { key, inMonth: key.slice(0, 7) === month, shown: all.slice(0, cut), more: all.length - cut };
  }));
}

/**
 * What a drop changes. On a day (a month cell, a day header): the date, the time kept. In a slot (min): that day and
 * time, and 30 minutes when it had no duration. On the all-day row: the date, no time (the duration is kept).
 * @param {Timed} t @param {{ date: string, min?: number | null, allDay?: boolean }} at
 * @returns {{ due: Due, duration?: number }}
 */
export function dropPatch(t, at) {
  /** @type {Due} */
  const due = { ...(dueOf(t.due) ?? {}), date: at.date };
  /** @type {{ due: Due, duration?: number }} */
  const patch = { due };
  if (typeof at.min === 'number') {
    due.time = timeOf(snap(at.min));
    if (!t.duration) patch.duration = PLAN;
  } else if (at.allDay) delete due.time;
  return patch;
}
/** whether a patch leaves the task as it was @param {Timed} t @param {{ due: Due, duration?: number }} p */
export const unchanged = (t, p) => {
  const d = dueOf(t.due);
  return !!d && d.date === p.due.date && (d.time ?? '') === (p.due.time ?? '') && (p.duration === undefined || p.duration === t.duration);
};

/** "Nov 2026"; a period over two months "Oct – Nov 2026" (two years: both) @param {string} first @param {string} [last] */
export function periodTitle(first, last = first) {
  const m = (/** @type {string} */ k) => SHORT[Number(k.slice(5, 7)) - 1], y = (/** @type {string} */ k) => k.slice(0, 4);
  if (first.slice(0, 7) === last.slice(0, 7)) return `${m(first)} ${y(first)}`;
  return y(first) === y(last) ? `${m(first)} – ${m(last)} ${y(last)}` : `${m(first)} ${y(first)} – ${m(last)} ${y(last)}`;
}

/**
 * The first day of the period n steps from the one starting `first`: a month (its 1st), or `size` days (1, 3, 7).
 * @param {string} first @param {Period} kind @param {number} n @param {number} [size]
 */
export function stepPeriod(first, kind, n, size = 1) {
  if (kind !== 'month') return addDays(first, n * size);
  const d = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
/** the period that holds `date` starts on: its month's 1st, its week's first day (7 columns) or the day itself
 * @param {string} date @param {Period} kind @param {number} size @param {number} [weekStart] */
export const periodOf = (date, kind, size, weekStart = 1) => (kind === 'month' ? `${date.slice(0, 7)}-01` : size === 7 ? weekOf(date, weekStart) : date);

/**
 * A repeating task's later dates from `from` to `to` (both kept), after its own date: drawn faded, they are not tasks.
 * Repeats counted from the day it is done have no later dates yet. RRule: the vendored class (recur.js dateLibs).
 * @param {Due | null | undefined} due @param {string} from @param {string} to @param {any} RRule @param {number} [max]
 * @returns {string[]}
 */
export function occurrences(due, from, to, RRule, max = 62) {
  const d = dueOf(due);
  if (!d?.rrule || d.fromDone || to < from) return [];
  const utc = (/** @type {string} */ k) => new Date(Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10))));
  try {
    const rule = new RRule({ ...RRule.parseString(d.rrule), dtstart: utc(d.date) });
    return rule.between(utc(from), utc(to), true).map((/** @type {Date} */ x) => x.toISOString().slice(0, 10)).filter((/** @type {string} */ k) => k > d.date).slice(0, max);
  } catch { return []; }
}
