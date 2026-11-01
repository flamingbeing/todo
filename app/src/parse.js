// Quick add's words: a task's name as typed becomes its title and its parts. "#Work" picks a project (the longest
// known name, so "#Home Renovation" works), "/Admin" a section, "@errand" and "%errand" labels, "p1".."p4" a priority,
// "every …" a repeat (recur.js), "{march 30}" a deadline (a day, no time, no repeat), and dates: the app's own shortcuts first ("tod", "tmr", "next week", "this weekend",
// "evening", "mid jan", "end of month", "in 3 days", "+3 days"), then the chrono library for the rest ("next friday",
// "dec 5", "at 5pm"). Each part found is a token with where it sits in the text, so the editor can colour it and the
// chip can clear it; a range the person cleared (ignore) stays text. With smart dates off only #, /, @, % and p count.
// Pure: the chrono and rrule libraries are passed in by the caller, which loads them lazily.
import { addDays, dayKey, timeKey, weekdayOf, isDay } from './dates.js';
import { findRecur, timeOf, firstDay, TIME_RE } from './recur.js';

/** @typedef {'project' | 'section' | 'label' | 'priority' | 'date' | 'recur' | 'deadline'} TokenKind */
/** @typedef {{ start: number, end: number, kind: TokenKind, value: unknown }} Token */
/** @typedef {{ id: string, name: string }} Named */
/** @typedef {{ id: string, name: string, projectId: string }} SectionLike */
/**
 * @typedef {{
 *   projects?: Named[], sections?: SectionLike[], labels?: string[], projectId?: string,
 *   now?: Date, weekStart?: number, nextWeekDay?: number, weekendDay?: number, smartDates?: boolean,
 *   ignore?: Array<{ start: number, end: number }>,
 *   chrono?: { parse(text: string, ref?: Date, option?: { forwardDate?: boolean }): Array<{ index: number, text: string, start: { isCertain(c: string): boolean, get(c: string): number | null } }> } | null,
 *   RRule?: typeof import('rrule').RRule | null,
 * }} ParseContext
 */
/**
 * @typedef {{
 *   title: string, tokens: Token[], due: import('./dates.js').Due | null, noDate: boolean,
 *   projectId: string | null, sectionId: string | null, labels: string[], priority: number | null, deadline: string | null,
 * }} Parsed
 */

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
const MON = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monNum = (/** @type {string} */ m) => ['ja', 'fe', 'mar', 'ap', 'may', 'jun', 'jul', 'au', 'se', 'oc', 'no', 'de'].findIndex(p => m.startsWith(p)) + 1;
const PARTS = /** @type {Record<string, string>} */ ({ morning: '09:00', afternoon: '12:00', evening: '19:00', night: '22:00', tonight: '22:00' });
const END = '(?![\\p{L}\\p{N}])';
const START = '(?<![\\p{L}\\p{N}])';

/** @param {string} key @returns {string} the month's last day */
const monthEnd = key => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).toISOString().slice(0, 10);
/** @param {string} today @param {number} wd 0 Sunday..6 @param {boolean} [strict] after today, not on it */
const nextWeekday = (today, wd, strict = false) => { const n = (wd - weekdayOf(today) + 7) % 7; return addDays(today, n === 0 && strict ? 7 : n); };

/**
 * The app's own date words, tried before chrono. Each gives a day (null: no date), and some a time.
 * @type {Array<{ re: string, day: (m: RegExpExecArray, c: { today: string, nextWeekDay: number, weekendDay: number }) => { date: string | null, time?: string } | null }>}
 */
const SHORTCUTS = [
  { re: '(?:no\\s+date|someday)', day: () => ({ date: null }) },
  { re: '(?:today|tod)', day: (_, c) => ({ date: c.today }) },
  { re: '(?:tomorrow|tmrw|tmr|tom)', day: (_, c) => ({ date: addDays(c.today, 1) }) },
  { re: 'next\\s+week', day: (_, c) => ({ date: nextWeekday(c.today, c.nextWeekDay, true) }) },
  { re: 'later\\s+this\\s+week', day: (_, c) => ({ date: addDays(c.today, 2) }) },
  { re: 'this\\s+weekend', day: (_, c) => ({ date: weekdayOf(c.today) === (c.weekendDay + 1) % 7 ? c.today : nextWeekday(c.today, c.weekendDay) }) },
  { re: 'next\\s+weekend', day: (_, c) => ({ date: addDays(weekdayOf(c.today) === (c.weekendDay + 1) % 7 ? addDays(c.today, -1) : nextWeekday(c.today, c.weekendDay), 7) }) },
  { re: 'end\\s+of\\s+(?:the\\s+)?month|eom', day: (_, c) => ({ date: monthEnd(c.today) }) },
  { re: `mid[\\s-]+(${MON})`, day: (m, c) => {
    const mo = monNum(m[1]);
    let y = +c.today.slice(0, 4);
    if (`${y}-${pad(mo)}-15` < c.today) y++;
    return { date: `${y}-${pad(mo)}-15` };
  } },
  { re: '(?:in\\s+(\\d{1,3})|\\+(\\d{1,3}))\\s*(d|days?|w|wks?|weeks?)', day: (m, c) => {
    const n = +(m[1] ?? m[2]);
    return { date: addDays(c.today, m[3][0] === 'w' ? n * 7 : n) };
  } },
  { re: '(tonight|morning|afternoon|evening|night)', day: (m, c) => ({ date: c.today, time: PARTS[m[1]] }) },
];

/** @param {string} s @param {number} i @param {string} re @returns {RegExpExecArray | null} a match of re right at s[i] */
const at = (s, i, re) => { const r = new RegExp(re, 'yiu'); r.lastIndex = i; return r.exec(s); };

/** a time after a day: " 4 pm", " at 16:00", " at 9", " in the evening", " evening" @param {string} s @param {number} i */
function timeAfter(s, i) {
  const part = at(s, i, `\\s+(?:in\\s+the\\s+)?(morning|afternoon|evening|night)${END}`);
  if (part) return { time: PARTS[part[1].toLowerCase()], end: i + part[0].length };
  const m = at(s, i, `\\s+(at\\s+)?(${TIME_RE})(?![\\p{L}\\p{N}:])`);
  if (!m) return null;
  const time = timeOf(m[2].toLowerCase().replace(/\s+/g, ''), !!m[1]);
  return time ? { time, end: i + m[0].length } : null;
}

/** the day some words name (the app's shortcuts, else chrono), or null @param {string} s @param {{ today: string, nextWeekDay: number, weekendDay: number }} c @param {Date} now @param {ParseContext['chrono']} [chrono] */
function dayOf(s, c, now, chrono) {
  for (const sc of SHORTCUTS) {
    const m = new RegExp(`^(?:${sc.re})$`, 'iu').exec(s);
    if (m) return sc.day(/** @type {RegExpExecArray} */ (/** @type {unknown} */ (m.slice(0).map(x => x?.toLowerCase()))), c)?.date ?? null;
  }
  const g = chrono?.parse(s, now, { forwardDate: true })[0]?.start;
  if (!g?.isCertain('day') && !g?.isCertain('weekday')) return null;
  const date = `${g.get('year')}-${pad(g.get('month') ?? 0)}-${pad(g.get('day') ?? 0)}`;
  return isDay(date) ? date : null;
}

/**
 * Splits a task name into its title and parts. @param {string} text @param {ParseContext} [ctx] @returns {Parsed}
 */
export function parse(text, ctx = {}) {
  const now = ctx.now ?? new Date();
  const today = dayKey(now);
  const nextWeekDay = ctx.nextWeekDay ?? 1, weekendDay = ctx.weekendDay ?? 6;
  /** @type {Token[]} */
  const tokens = [];
  // what is taken (a token or a cleared range): later kinds see spaces there
  const taken = new Uint8Array(text.length);
  for (const r of ctx.ignore ?? []) taken.fill(1, Math.max(0, r.start), Math.min(text.length, r.end));
  const free = (/** @type {number} */ a, /** @type {number} */ b) => { for (let i = a; i < b; i++) if (taken[i]) return false; return true; };
  const masked = () => [...text].map((ch, i) => (taken[i] ? ' ' : ch)).join('');
  /** @param {number} start @param {number} end @param {TokenKind} kind @param {unknown} value */
  const take = (start, end, kind, value) => { tokens.push({ start, end, kind, value }); taken.fill(1, start, end); };
  const lower = text.toLowerCase();

  /** the longest known name right after s[i] that ends at a word end, free from s[from] @param {number} i @param {string[]} names */
  const longest = (i, names, from = i - 1) => {
    let best = -1, len = 0;
    names.forEach((n, k) => {
      const l = n.length;
      if (l > len && lower.startsWith(n.toLowerCase(), i) && !/[\p{L}\p{N}_-]/u.test(text[i + l] ?? '') && free(from, i + l)) { best = k; len = l; }
    });
    return best < 0 ? null : { k: best, end: i + len };
  };
  const mark = /** @param {string} ch */ ch => [...text.matchAll(new RegExp(`(?<=^|\\s)[${ch}]`, 'g'))].map(m => /** @type {number} */ (m.index));

  // #Project: the first known one
  const projects = ctx.projects ?? [];
  let projectId = /** @type {string | null} */ (null);
  for (const i of mark('#')) {
    const hit = longest(i + 1, projects.map(p => p.name));
    if (!hit) continue;
    projectId = projects[hit.k].id;
    take(i, hit.end, 'project', projectId);
    break;
  }
  // /Section in that project (or the one quick add opened in)
  const inProject = projectId ?? ctx.projectId ?? 'inbox';
  const sections = (ctx.sections ?? []).filter(s => s.projectId === inProject);
  let sectionId = /** @type {string | null} */ (null);
  const afterProject = tokens[0] && text[tokens[0].end] === '/' ? [tokens[0].end] : [];   // "#Work/Admin"
  for (const i of [...afterProject, ...mark('/')]) {
    const hit = longest(i + 1, sections.map(s => s.name));
    if (!hit) continue;
    sectionId = sections[hit.k].id;
    take(i, hit.end, 'section', sectionId);
    break;
  }
  // @label and %label: a known one (longest name), else a new one up to the next space
  const known = ctx.labels ?? [];
  /** @type {string[]} */
  const labels = [];
  for (const i of mark('@%')) {
    if (!free(i, i + 1)) continue;
    const hit = longest(i + 1, known);
    if (hit) { const name = known[hit.k]; if (!labels.includes(name)) labels.push(name); take(i, hit.end, 'label', name); continue; }
    const m = at(text, i + 1, '[\\p{L}\\p{N}_-]+');
    if (!m || !free(i, i + 1 + m[0].length)) continue;
    const name = m[0];
    if (!labels.some(l => l.toLowerCase() === name.toLowerCase())) labels.push(name);
    take(i, i + 1 + name.length, 'label', name);
  }
  // p1..p4 (and !!1..!!4)
  let priority = /** @type {number | null} */ (null);
  for (const m of text.matchAll(/(?<=^|\s)(?:p|!!)([1-4])(?=$|\s)/gi)) {
    const i = /** @type {number} */ (m.index);
    if (!free(i, i + m[0].length)) continue;
    if (priority == null) { priority = +m[1]; take(i, i + m[0].length, 'priority', priority); }
  }

  /** @type {import('./dates.js').Due | null} */
  let due = null;
  let noDate = false;
  let deadline = /** @type {string | null} */ (null);
  if (ctx.smartDates !== false) {
    // {march 30}: a deadline, read by the shortcuts or chrono; the braces hide it from the date scan below
    for (const m of text.matchAll(/\{([^{}]+)\}/g)) {
      const i = /** @type {number} */ (m.index), end = i + m[0].length;
      if (!free(i, end)) continue;
      const day = dayOf(m[1].trim(), { today, nextWeekDay, weekendDay }, now, ctx.chrono);
      if (day) { deadline = day; take(i, end, 'deadline', day); break; }
    }
    // every …: the repeat, its time and its start
    const r = findRecur(masked(), { today });
    let recur = null;
    if (r && free(r.index, r.end)) { recur = r.recur; take(r.index, r.end, 'recur', r.recur); }
    // a day: the app's shortcuts, else chrono
    /** @type {{ date: string | null, time?: string } | null} */
    let day = null;
    const m0 = masked();
    let best = /** @type {{ i: number, end: number, day: { date: string | null, time?: string } } | null} */ (null);
    for (const sc of SHORTCUTS) {
      const re = new RegExp(`${START}(?:${sc.re})${END}`, 'giu');
      for (const m of m0.matchAll(re)) {
        const i = /** @type {number} */ (m.index);
        const got = sc.day(/** @type {RegExpExecArray} */ (/** @type {unknown} */ (m.slice(0).map(x => x?.toLowerCase()))), { today, nextWeekDay, weekendDay });
        if (got && (!best || i < best.i)) best = { i, end: i + m[0].length, day: got };
        break;
      }
    }
    if (best) {
      let { end } = best;
      const d = { ...best.day };
      if (d.date) {
        const t = timeAfter(m0, end);
        if (t && free(end, t.end)) { d.time = t.time; end = t.end; }
      }
      // "on" before a day reads as part of it: "on tmr"
      const on = /(?:^|\s)(on\s+)$/i.exec(m0.slice(0, best.i));
      const start = on ? best.i - on[1].length : best.i;
      take(start, end, 'date', d);
      day = d;
    } else if (ctx.chrono) {
      for (const c of ctx.chrono.parse(m0, now, { forwardDate: true })) {
        const s = c.start;
        // a month on its own ("review march report") is a word, not a date
        if (!s.isCertain('day') && !s.isCertain('weekday') && !s.isCertain('hour')) continue;
        if (!free(c.index, c.index + c.text.length)) continue;
        // the rest of a repeat this app doesn't say ("every 4 hours") stays words with it
        if (/(?:^|\s)(?:every|ev)!?\s+$/i.test(m0.slice(0, c.index))) continue;
        const y = s.get('year'), mo = s.get('month'), dd = s.get('day');
        if (y == null || mo == null || dd == null) continue;
        let date = `${y}-${pad(mo)}-${pad(dd)}`;
        if (!isDay(date)) continue;
        const time = s.isCertain('hour') ? `${pad(s.get('hour') ?? 0)}:${pad(s.get('minute') ?? 0)}` : undefined;
        // a time alone that has passed today is tomorrow's
        if (time && !s.isCertain('day') && !s.isCertain('weekday') && date === today && time <= timeKey(now)) date = addDays(today, 1);
        day = { date, ...(time ? { time } : {}) };
        take(c.index, c.index + c.text.length, 'date', day);
        break;
      }
    }
    if (recur) {
      const startDay = recur.start ?? day?.date ?? today;
      const date = (ctx.RRule ? firstDay(recur.rrule, startDay, ctx.RRule) : null) ?? startDay;
      const time = recur.time ?? day?.time;
      due = { date, ...(time ? { time } : {}), rrule: recur.rrule, string: recur.string, ...(recur.fromDone ? { fromDone: true } : {}) };
    } else if (day) {
      if (day.date) due = { date: day.date, ...(day.time ? { time: day.time } : {}) };
      else noDate = true;
    }
  }
  tokens.sort((a, b) => a.start - b.start);
  return { title: titleOf(text, tokens), tokens, due, noDate, projectId, sectionId, labels, priority, deadline };
}

/** the text without its tokens, spaces tidied @param {string} text @param {Token[]} tokens */
export function titleOf(text, tokens) {
  let out = '', i = 0;
  for (const t of [...tokens].sort((a, b) => a.start - b.start)) { out += text.slice(i, t.start); i = Math.max(i, t.end); }
  out += text.slice(i);
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Moves cleared ranges along when the text changes: an edit before a range shifts it, an edit inside drops it.
 * @param {string} was @param {string} now @param {Array<{ start: number, end: number }>} ranges
 */
export function shiftRanges(was, now, ranges) {
  let a = 0;
  while (a < was.length && a < now.length && was[a] === now[a]) a++;
  let b = 0;
  while (b < was.length - a && b < now.length - a && was[was.length - 1 - b] === now[now.length - 1 - b]) b++;
  const cutEnd = was.length - b, delta = now.length - was.length;
  return ranges.flatMap(r => (r.end <= a ? [r] : r.start >= cutEnd ? [{ start: r.start + delta, end: r.end + delta }] : []));
}
