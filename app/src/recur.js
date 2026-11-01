// Repeating dates: the "every …" words a person types (quick add, the scheduler's text field) become an RRULE body
// (RFC 5545, without DTSTART: "FREQ=WEEKLY;BYDAY=MO,FR"), a flag for "every!" (the next date counts from the day it
// was done, not from the day it was due) and the words themselves, kept for display. The other way, a rule becomes
// readable words again. The next date comes from the rrule library, passed in by the caller (it loads lazily).
// Days are local 'YYYY-MM-DD' text; the rule runs on them as UTC midnights, so no time zone moves a day.
// Phrases this grammar does not know (hour-based repeats, "except", two rules in one) give null: the words stay text.
import { addDays, weekdayOf, isDay } from './dates.js';

/** @typedef {{ rrule: string, fromDone: boolean, string: string, time?: string, start?: string }} Recur */
/** @typedef {{ index: number, end: number, recur: Recur }} RecurHit  index..end: the words in the text */
/** @typedef {typeof import('rrule').RRule} RRuleClass */

export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WORKDAYS = 'MO,TU,WE,TH,FR';

// word patterns (lower case text)
const WD = '(?:mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)';
const MON = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const ORD = '(?:st|nd|rd|th)';
const NTH = '(?:1st|2nd|3rd|4th|5th|first|second|third|fourth|fifth|last)';
const UNIT = '(?:day|week|month|year)s?';
/** @param {string} w a weekday word -> 0 Sunday .. 6 */
const wdNum = w => ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'].indexOf(w.slice(0, 2));
/** @param {string} m a month word -> 1..12 */
const monNum = m => ['ja', 'fe', 'mar', 'ap', 'may', 'jun', 'jul', 'au', 'se', 'oc', 'no', 'de'].findIndex(p => m.startsWith(p)) + 1;
/** @param {string} n an nth word -> 1..5, -1 for last */
const nthNum = n => n === 'last' ? -1 : (/^\d/.test(n) ? +n[0] : ['first', 'second', 'third', 'fourth', 'fifth'].indexOf(n) + 1);
/** @param {string} u a unit word -> the rrule FREQ */
const freqOf = u => ({ d: 'DAILY', w: 'WEEKLY', m: 'MONTHLY', y: 'YEARLY' })[/** @type {'d'} */ (u[0])];
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');

/**
 * A time: "20:00", "8pm", "8:30 am", "noon", "midnight"; bare "9" only after "at". @param {string} s @param {boolean} afterAt
 * @returns {string | null} HH:MM
 */
export function timeOf(s, afterAt) {
  if (s === 'noon') return '12:00';
  if (s === 'midnight') return '00:00';
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/.exec(s);
  if (!m || (!afterAt && !m[2] && !m[3])) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (m[3]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[3][0] === 'p' ? 12 : 0); }
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}
export const TIME_RE = '(?:noon|midnight|\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|a|p)\\b|\\d{1,2}:\\d{2}|\\d{1,2})';

/**
 * A day in the words a start or end takes: today, tomorrow, "3 aug", "aug 3rd", "3 aug 2027", "2027-08-03", "3/8".
 * A day of a month without a year is the next one from today on. @param {string} s @param {string} today
 * @returns {string | null}
 */
export function dayOf(s, today) {
  s = s.trim();
  if (/^(today|tod)$/.test(s)) return today;
  if (/^(tomorrow|tmr|tom)$/.test(s)) return addDays(today, 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isDay(s) ? s : null;
  let d = 0, mo = 0, y = 0, m;
  if ((m = new RegExp(`^(\\d{1,2})${ORD}?\\s+(${MON})(?:\\s+(\\d{4}))?$`).exec(s))) { d = +m[1]; mo = monNum(m[2]); y = +(m[3] ?? 0); }
  else if ((m = new RegExp(`^(${MON})\\s+(\\d{1,2})${ORD}?(?:,?\\s+(\\d{4}))?$`).exec(s))) { d = +m[2]; mo = monNum(m[1]); y = +(m[3] ?? 0); }
  else if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(s))) { d = +m[1]; mo = +m[2]; y = +(m[3] ?? 0); }
  else if ((m = new RegExp(`^(${WD})$`).exec(s))) { const n = wdNum(m[1]); return addDays(today, ((n - weekdayOf(today)) + 7) % 7); }
  else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (!y) {
    y = +today.slice(0, 4);
    if (`${y}-${pad(mo)}-${pad(d)}` < today) y++;
  }
  const key = `${y}-${pad(mo)}-${pad(d)}`;
  return isDay(key) && addDays(key, 0) === key ? key : null;
}
const DATE_WORDS = `(?:today|tod|tomorrow|tmr|tom|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}(?:/\\d{4})?|\\d{1,2}${ORD}?\\s+${MON}(?:\\s+\\d{4})?|${MON}\\s+\\d{1,2}${ORD}?(?:,?\\s+\\d{4})?|${WD})`;

/** @param {string} s @param {number} at @param {string} re @returns {RegExpExecArray | null} a match of re right at s[at] */
const at = (s, at, re) => { const r = new RegExp(re, 'y'); r.lastIndex = at; return r.exec(s); };

/**
 * The rule's body after "every" (or "every!"), from s[i]: the rule parts and where the body ends, or null.
 * @param {string} s lower case @param {number} i @returns {{ parts: Record<string, string>, end: number } | null}
 */
function body(s, i) {
  /** @type {RegExpExecArray | null} */
  let m;
  const B = '(?![a-z0-9])';
  if ((m = at(s, i, `other\\s+(day|week|month|year|${WD})${B}`))) {
    const w = m[1];
    if (/^(day|week|month|year)$/.test(w)) return { parts: { FREQ: freqOf(w), INTERVAL: '2' }, end: i + m[0].length };
    return { parts: { FREQ: 'WEEKLY', INTERVAL: '2', BYDAY: WEEKDAY_CODES[wdNum(w)] }, end: i + m[0].length };
  }
  if ((m = at(s, i, `(\\d{1,3})\\s+(${UNIT})${B}`))) {
    const n = +m[1];
    if (!n) return null;
    return { parts: { FREQ: freqOf(m[2]), ...(n > 1 ? { INTERVAL: String(n) } : {}) }, end: i + m[0].length };
  }
  if ((m = at(s, i, `(first|last)\\s+(?:workday|weekday|work day)${B}`))) {
    return { parts: { FREQ: 'MONTHLY', BYDAY: WORKDAYS, BYSETPOS: m[1] === 'first' ? '1' : '-1' }, end: i + m[0].length };
  }
  if ((m = at(s, i, `last\\s+day(?:\\s+of\\s+(?:the\\s+)?month)?${B}`))) return { parts: { FREQ: 'MONTHLY', BYMONTHDAY: '-1' }, end: i + m[0].length };
  if ((m = at(s, i, `(${NTH})\\s+(${WD})(?:\\s+(?:of\\s+)?(${MON}))?${B}`))) {
    const n = nthNum(m[1]), day = `${n > 0 ? '+' : ''}${n}${WEEKDAY_CODES[wdNum(m[2])]}`;
    return { parts: m[3] ? { FREQ: 'YEARLY', BYMONTH: String(monNum(m[3])), BYDAY: day } : { FREQ: 'MONTHLY', BYDAY: day }, end: i + m[0].length };
  }
  if ((m = at(s, i, `(?:day|daily)${B}`))) return { parts: { FREQ: 'DAILY' }, end: i + m[0].length };
  if ((m = at(s, i, `(?:weekday|workday|work day)${B}`))) return { parts: { FREQ: 'WEEKLY', BYDAY: WORKDAYS }, end: i + m[0].length };
  if ((m = at(s, i, `(?:week|weekly)${B}`))) return { parts: { FREQ: 'WEEKLY' }, end: i + m[0].length };
  if ((m = at(s, i, `(?:month|monthly)${B}`))) return { parts: { FREQ: 'MONTHLY' }, end: i + m[0].length };
  if ((m = at(s, i, `(?:year|yearly|annually)${B}`))) return { parts: { FREQ: 'YEARLY' }, end: i + m[0].length };
  if ((m = at(s, i, `(?:quarter|quarterly)${B}`))) return { parts: { FREQ: 'MONTHLY', INTERVAL: '3' }, end: i + m[0].length };
  // weekdays: "mon, fri", "monday and friday", "tue thu"
  if ((m = at(s, i, `${WD}(?:\\s*(?:,|and|&)?\\s*${WD})*${B}`))) {
    const days = [...m[0].matchAll(new RegExp(WD, 'g'))].map(x => wdNum(x[0]));
    const codes = [...new Set([1, 2, 3, 4, 5, 6, 0].filter(d => days.includes(d)))].map(d => WEEKDAY_CODES[d]);
    return { parts: { FREQ: 'WEEKLY', BYDAY: codes.join(',') }, end: i + m[0].length };
  }
  // days of the year: "14 jan", "jan 14th", "14 jan, 14 apr" (one day of the month for every month listed)
  const doy = `(?:\\d{1,2}${ORD}?\\s+${MON}|${MON}\\s+\\d{1,2}${ORD}?)`;
  if ((m = at(s, i, `${doy}(?:\\s*,\\s*${doy})*${B}`))) {
    const each = m[0].split(/\s*,\s*/).map(x => {
      const a = new RegExp(`^(\\d{1,2})${ORD}?\\s+(${MON})$`).exec(x), b = new RegExp(`^(${MON})\\s+(\\d{1,2})${ORD}?$`).exec(x);
      return a ? { d: +a[1], mo: monNum(a[2]) } : b ? { d: +b[2], mo: monNum(b[1]) } : null;
    });
    if (each.some(e => !e || e.d < 1 || e.d > 31)) return null;
    const days = new Set(each.map(e => e?.d));
    if (days.size > 1) return null;   // different days in different months: one rule can't say it
    return { parts: { FREQ: 'YEARLY', BYMONTH: [...new Set(each.map(e => e?.mo))].sort((a, b) => Number(a) - Number(b)).join(','), BYMONTHDAY: String(each[0]?.d) }, end: i + m[0].length };
  }
  // days of the month: "2, 15, 27", "15th"
  if ((m = at(s, i, `\\d{1,2}${ORD}?(?:\\s*(?:,|and|&)\\s*\\d{1,2}${ORD}?)*(?![a-z0-9:])`))) {
    const nums = [...m[0].matchAll(/\d{1,2}/g)].map(x => +x[0]);
    if (nums.some(n => n < 1 || n > 31)) return null;
    // a number followed by am/pm is a time ("every 5pm"), by hours or workdays a rule this grammar doesn't say
    if (at(s, i + m[0].length, '\\s*(?:am|pm|hours?|hrs?|minutes?|mins?|workdays?|work days?)(?![a-z])')) return null;
    return { parts: { FREQ: 'MONTHLY', BYMONTHDAY: [...new Set(nums)].sort((a, b) => a - b).join(',') }, end: i + m[0].length };
  }
  return null;
}

/** "every", "every!", "ev", "ev!", or the one-word rules ("daily") and "after N days" */
const START_RE = new RegExp(`(?<![a-z0-9!])(?:(every!|ev!|every|ev)\\s+|(daily|weekly|monthly|yearly|annually|quarterly)(?![a-z0-9])|(after)\\s+(?=\\d+\\s+${UNIT}))`, 'g');

/**
 * Finds the first "every …" phrase in a text, with its time, start and end: where the words are and the rule.
 * @param {string} text @param {{ today: string }} o @returns {RecurHit | null}
 */
export function findRecur(text, { today }) {
  const s = text.toLowerCase();
  START_RE.lastIndex = 0;
  /** @type {RegExpExecArray | null} */
  let m;
  while ((m = START_RE.exec(s))) {
    const index = m.index;
    /** @type {{ parts: Record<string, string>, end: number } | null} */
    let b;
    let fromDone = false;
    if (m[2]) b = body(s, index);
    else {
      fromDone = !!m[3] || m[1].endsWith('!');
      b = body(s, index + m[0].length);
    }
    if (!b) continue;
    let end = b.end;
    /** @type {string | undefined} */
    let time, start;
    const parts = b.parts;
    // what may follow, in any order: a time, a start, an end
    for (;;) {
      let x;
      if (!time && (x = at(s, end, `\\s+at\\s+(${TIME_RE})(?![a-z0-9:])`)) && timeOf(x[1].replace(/\s+/g, ''), true)) { time = timeOf(x[1].replace(/\s+/g, ''), true) ?? undefined; end += x[0].length; continue; }
      if (!time && (x = at(s, end, `\\s+(${TIME_RE})(?![a-z0-9:])`)) && timeOf(x[1].replace(/\s+/g, ''), false)) { time = timeOf(x[1].replace(/\s+/g, ''), false) ?? undefined; end += x[0].length; continue; }
      if (!start && (x = at(s, end, `\\s+(?:starting(?:\\s+on)?|starts|from)\\s+(${DATE_WORDS})(?![a-z0-9])`)) && dayOf(x[1], today)) { start = dayOf(x[1], today) ?? undefined; end += x[0].length; continue; }
      if (!parts.UNTIL && (x = at(s, end, `\\s+(?:ending(?:\\s+on)?|ends|until|till|to)\\s+(${DATE_WORDS})(?![a-z0-9])`)) && dayOf(x[1], start ?? today)) {
        parts.UNTIL = `${/** @type {string} */ (dayOf(x[1], start ?? today)).replaceAll('-', '')}T235959Z`; end += x[0].length; continue;
      }
      if (!parts.UNTIL && (x = at(s, end, `\\s+for\\s+(\\d{1,3})\\s+(${UNIT})(?![a-z0-9])`))) {
        const n = +x[1], u = x[2][0], from = start ?? today;
        const last = u === 'd' ? addDays(from, n - 1) : u === 'w' ? addDays(from, n * 7 - 1) : addMonths(from, u === 'm' ? n : n * 12, -1);
        parts.UNTIL = `${last.replaceAll('-', '')}T235959Z`; end += x[0].length; continue;
      }
      break;
    }
    // two rules in one, or "except": not something this grammar says; leave it all as words
    const rest = s.slice(end);
    if (/^\s*(?:,|and)?\s*(?:every|except)\b/.test(rest) || /^\s+on\s/.test(rest) || new RegExp(`^\\s*,\\s*${WD}\\s+at\\b`).test(rest)) return null;
    const rrule = Object.entries(parts).map(([k, v]) => `${k}=${v}`).join(';');
    return { index, end, recur: { rrule, fromDone, string: text.slice(index, end), ...(time ? { time } : {}), ...(start ? { start } : {}) } };
  }
  return null;
}

/** @param {string} key @param {number} n @param {number} [days] then add days */
function addMonths(key, n, days = 0) {
  const y = +key.slice(0, 4), m = +key.slice(5, 7) - 1 + n, d = +key.slice(8, 10);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const k = new Date(Date.UTC(y, m, Math.min(d, last), 12)).toISOString().slice(0, 10);
  return addDays(k, days);
}

/** @param {string} key @returns {Date} the day's UTC midnight */
const utc0 = key => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)));
/** @param {Date} d */
const keyOf = d => d.toISOString().slice(0, 10);

/** @param {RRuleClass} RRule @param {string} rrule @param {string} from */
function ruleFrom(RRule, rrule, from) {
  return new RRule({ ...RRule.parseString(rrule), dtstart: utc0(from) });
}

/**
 * The first day a new rule falls on, from a day on (that day counts). @param {string} rrule @param {string} from
 * @param {RRuleClass} RRule @returns {string | null}
 */
export function firstDay(rrule, from, RRule) {
  try {
    const d = ruleFrom(RRule, rrule, from).after(utc0(from), true);
    return d ? keyOf(d) : null;
  } catch { return null; }
}

/**
 * The next date of a repeating task once it is done: "every" counts from the day it was due (done late, the cycle
 * holds), and when that is still before today it jumps to the first match from today on; "every!" counts from the day
 * it was done. Past the rule's end: null (it is done for good).
 * @param {import('./dates.js').Due} due @param {{ done: string, today: string }} o @param {RRuleClass} RRule
 * @returns {string | null}
 */
export function nextDay(due, { done, today }, RRule) {
  if (!due.rrule) return null;
  try {
    if (due.fromDone) {
      const d = ruleFrom(RRule, due.rrule, done).after(utc0(done), false);
      return d ? keyOf(d) : null;
    }
    const rule = ruleFrom(RRule, due.rrule, due.date);
    let d = rule.after(utc0(due.date), false);
    if (d && keyOf(d) < today) d = rule.after(utc0(today), true);
    return d ? keyOf(d) : null;
  } catch { return null; }
}

/** @param {string} rrule @returns {Record<string, string>} */
export const ruleParts = rrule => Object.fromEntries(rrule.split(';').filter(Boolean).map(p => { const [k, ...v] = p.split('='); return [k.toUpperCase(), v.join('=')]; }));
/** "1st", "2nd", "23rd" @param {number} n */
export const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
/** @param {string} code "MO" or "+1MO" */
const dayName = code => DAY_NAMES[WEEKDAY_CODES.indexOf(code.slice(-2))];
/** "+3TH" -> "3rd Thursday", "-1FR" -> "last Friday" @param {string} code */
const nthDay = code => { const n = parseInt(code, 10); return `${n === -1 ? 'last' : ordinal(n)} ${dayName(code)}`; };

/**
 * A rule in plain words: "Every day", "Every Monday, Friday", "Every other week", "Every month on the 5th", "Every
 * year on 14 Jan", with "at 20:00", "until 3 Aug" and "after it's done" when they apply.
 * @param {{ rrule: string, fromDone?: boolean | null, time?: string | null }} r @param {{ time?: (hhmm: string) => string }} [o]
 */
export function describe({ rrule, fromDone, time }, { time: clock = t => t } = {}) {
  const p = ruleParts(rrule), n = Math.max(1, +(p.INTERVAL ?? 1)), days = p.BYDAY ? p.BYDAY.split(',') : [];
  let w = '';
  const every = (/** @type {string} */ one, /** @type {string} */ many) => n === 1 ? `Every ${one}` : n === 2 ? `Every other ${one}` : `Every ${n} ${many}`;
  if (p.FREQ === 'DAILY') w = every('day', 'days');
  else if (p.FREQ === 'WEEKLY') {
    if (p.BYDAY === WORKDAYS && n === 1) w = 'Every weekday';
    else if (days.length) w = n === 1 ? `Every ${days.map(dayName).join(', ')}` : n === 2 ? `Every other ${days.map(dayName).join(', ')}` : `Every ${n} weeks on ${days.map(dayName).join(', ')}`;
    else w = every('week', 'weeks');
  } else if (p.FREQ === 'MONTHLY') {
    const base = n === 3 && !p.BYDAY && !p.BYMONTHDAY ? 'Every quarter' : every('month', 'months');
    if (p.BYSETPOS && p.BYDAY === WORKDAYS) w = `${base} on the ${p.BYSETPOS === '1' ? 'first' : 'last'} workday`;
    else if (p.BYMONTHDAY === '-1') w = `${base} on the last day`;
    else if (p.BYMONTHDAY) w = `${base} on the ${p.BYMONTHDAY.split(',').map(x => ordinal(+x)).join(', ')}`;
    else if (days.length) w = `${base} on the ${days.map(nthDay).join(', ')}`;
    else w = base;
  } else if (p.FREQ === 'YEARLY') {
    const months = (p.BYMONTH ?? '').split(',').filter(Boolean).map(x => MONTH_NAMES[+x - 1]);
    if (p.BYMONTHDAY && months.length) w = `${every('year', 'years')} on ${months.map(m => `${p.BYMONTHDAY} ${m}`).join(', ')}`;
    else if (days.length && months.length) w = `${every('year', 'years')} on the ${nthDay(days[0])} of ${months[0]}`;
    else w = every('year', 'years');
  } else w = 'Repeats';
  if (time) w += ` at ${clock(time)}`;
  if (p.UNTIL && /^\d{8}/.test(p.UNTIL)) w += ` until ${+p.UNTIL.slice(6, 8)} ${MONTH_NAMES[+p.UNTIL.slice(4, 6) - 1]}`;
  if (fromDone) w += ', counted from completion';
  return w;
}

/**
 * The repeat menu's ready-made rules for a day: every day, every week on its weekday, every weekday, every month on
 * its day, every year on its date. @param {string} key
 * @returns {{ label: string, rrule: string }[]}
 */
export function presets(key) {
  const wd = weekdayOf(key), d = +key.slice(8, 10), mo = +key.slice(5, 7);
  return [
    { label: 'Every day', rrule: 'FREQ=DAILY' },
    { label: `Every week on ${DAY_NAMES[wd].slice(0, 3)}`, rrule: `FREQ=WEEKLY;BYDAY=${WEEKDAY_CODES[wd]}` },
    { label: 'Every weekday (Mon - Fri)', rrule: `FREQ=WEEKLY;BYDAY=${WORKDAYS}` },
    { label: `Every month on the ${ordinal(d)}`, rrule: `FREQ=MONTHLY;BYMONTHDAY=${d}` },
    { label: `Every year on ${d} ${MONTH_NAMES[mo - 1]}`, rrule: `FREQ=YEARLY;BYMONTH=${mo};BYMONTHDAY=${d}` },
  ];
}

/**
 * A rule from the custom repeat screen's choices. @param {{ unit: 'day' | 'week' | 'month' | 'year', every: number,
 * days?: number[], until?: string | null }} c  days: 0 Sunday .. 6 (weekly only); until: the last day
 */
export function buildRule({ unit, every, days = [], until }) {
  const parts = [`FREQ=${freqOf(unit)}`];
  if (every > 1) parts.push(`INTERVAL=${Math.round(every)}`);
  if (unit === 'week' && days.length) parts.push(`BYDAY=${[1, 2, 3, 4, 5, 6, 0].filter(x => days.includes(x)).map(x => WEEKDAY_CODES[x]).join(',')}`);
  if (until) parts.push(`UNTIL=${until.replaceAll('-', '')}T235959Z`);
  return parts.join(';');
}

/** the custom screen's choices back from a rule @param {string} rrule
 * @returns {{ unit: 'day' | 'week' | 'month' | 'year', every: number, days: number[], until: string | null }} */
export function ruleChoices(rrule) {
  const p = ruleParts(rrule);
  const unit = /** @type {'day' | 'week' | 'month' | 'year'} */ (({ DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' })[p.FREQ] ?? 'week');
  const days = (p.BYDAY ?? '').split(',').filter(c => /^[A-Z]{2}$/.test(c)).map(c => WEEKDAY_CODES.indexOf(c));
  const until = p.UNTIL && /^\d{8}/.test(p.UNTIL) ? `${p.UNTIL.slice(0, 4)}-${p.UNTIL.slice(4, 6)}-${p.UNTIL.slice(6, 8)}` : null;
  return { unit, every: Math.max(1, +(p.INTERVAL ?? 1)), days, until };
}

/** @type {Promise<{ chrono: import('chrono-node').Chrono, RRule: RRuleClass }> | undefined} */
let libs;
/** the date libraries (vendored, tools/vendor-lib.mjs), fetched the first time a screen needs them */
export const dateLibs = () => (libs ??= Promise.all([import('chrono-node'), import('rrule')]).then(([c, r]) => ({ chrono: c.casual, RRule: r.RRule })));
