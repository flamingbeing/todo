// Saved filters: a query in words read into a tree and tested against each open task. Pure (no page), unit-tested.
//
// The words: terms joined by & (and), | (or), ! (not) and brackets; a comma splits the query into lists shown one
// after the other. A backslash makes the next character plain text (so "#Work\&Life" is one project name); * in a
// name matches any run of letters ("@home*", "#*Work").
// Terms: today, tomorrow, yesterday, overdue (od), no date, no time, "N days" or "next N days" (today to N days on),
// "-N days" (the N days before today), date: / date before: / date after: (due: the same) with a day, a weekday
// name, recurring, p1 to p4, no priority, @label or %label, no labels, #Project, ##Project (its sub-projects too),
// /Section, /* (any section), search: words, subtask.
// A query that can't be read gives a message with where it went wrong (1 is the first character).
import { addDays, isDay, weekdayOf } from './dates.js';
import { labelsOf, priorityOf, projectOf, isTask } from './tasks.js';

/** @typedef {import('./items.js').Task} Task */
/**
 * @typedef {object} QueryContext
 * @property {import('./items.js').Project[]} projects
 * @property {import('./items.js').Section[]} sections
 * @property {import('./items.js').Label[]} labels
 * @property {string} today  YYYY-MM-DD
 * @property {number} [weekStart]  0 Sunday, 1 Monday
 * @property {(text: string) => string | null} [parseDate]  more ways to write a day (the app passes its quick add reader)
 */
/** @typedef {{ kind: 'and' | 'or', a: Node, b: Node, at: number } | { kind: 'not', a: Node, at: number } | { kind: 'term', text: string, at: number }} Node */
/** @typedef {{ message: string, at: number }} QueryError */
/** @typedef {{ text: string, test: (t: Task) => boolean }} QueryPart */

const OPS = '&|(),';
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SHORT_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** lower case without accents, for matching names and words @param {string} s */
export const fold = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** @param {string} message @param {number} at @returns {never} */
const fail = (message, at) => { throw Object.assign(new Error(message), { at }); };

/** @typedef {{ type: 'op', v: string, at: number } | { type: 'term', v: string, at: number }} Tok */
/** the query as operators and terms (a term keeps its escaped characters as plain text) @param {string} q @returns {Tok[]} */
export function tokenize(q) {
  /** @type {Tok[]} */
  const out = [];
  let buf = '', start = -1;
  const flush = () => { if (buf.trim()) out.push({ type: 'term', v: buf.trim(), at: start + 1 }); buf = ''; start = -1; };
  for (let i = 0; i < q.length; i++) {
    const ch = q[i];
    if (ch === '\\') {
      if (i + 1 >= q.length) fail('A backslash needs a character after it', i + 1);
      if (start < 0) start = i;
      buf += `\u0000${q[++i]}`;   // (kept apart from a written "*" so an escaped one is plain)
      continue;
    }
    if (OPS.includes(ch)) { flush(); out.push({ type: 'op', v: ch, at: i + 1 }); continue; }
    if (ch === '!' && !buf.trim()) { flush(); out.push({ type: 'op', v: '!', at: i + 1 }); continue; }
    if (start < 0 && ch.trim()) start = i;
    buf += ch;
  }
  flush();
  return out;
}

/** a list of tokens (one comma part) as a tree @param {Tok[]} toks @param {number} end where the part ends (for messages) @returns {Node} */
function parseTokens(toks, end) {
  let i = 0;
  const peek = () => toks[i];
  /** @returns {Node} */
  const primary = () => {
    const t = toks[i];
    if (!t) fail('The query ends where a term should be', end);
    if (t.type === 'op' && t.v === '!') { i++; return { kind: 'not', a: primary(), at: t.at }; }
    if (t.type === 'op' && t.v === '(') {
      i++;
      const inner = or();
      const close = toks[i];
      if (!close || close.type !== 'op' || close.v !== ')') fail('A bracket is opened here and not closed', t.at);
      i++;
      return inner;
    }
    if (t.type === 'op') fail(`“${t.v}” can't be here`, t.at);
    i++;
    return { kind: 'term', text: t.v, at: t.at };
  };
  /** @returns {Node} */
  const and = () => {
    let a = primary();
    for (let t = peek(); t && t.type === 'op' && t.v === '&'; t = peek()) { i++; a = { kind: 'and', a, b: primary(), at: t.at }; }
    return a;
  };
  /** @returns {Node} */
  const or = () => {
    let a = and();
    for (let t = peek(); t && t.type === 'op' && t.v === '|'; t = peek()) { i++; a = { kind: 'or', a, b: and(), at: t.at }; }
    return a;
  };
  const tree = or();
  const rest = toks[i];
  if (rest) {
    if (rest.type === 'op' && rest.v === ')') fail('This bracket closes nothing', rest.at);
    if (rest.type === 'term') fail(`Join “${rest.v.replace(/\0/g, '')}” with & or |`, rest.at);
    fail(`“${rest.v}” can't be here`, rest.at);
  }
  return tree;
}

/**
 * Reads a query into its comma parts. @param {string} q
 * @returns {{ parts: { text: string, tree: Node }[], error: QueryError | null }}
 */
export function parseQuery(q) {
  try {
    const toks = tokenize(String(q ?? ''));
    /** @type {{ text: string, tree: Node }[]} */
    const parts = [];
    let depth = 0, from = 0, fromChar = 0;
    const cut = (/** @type {number} */ to, /** @type {number} */ endChar) => {
      const list = toks.slice(from, to);
      if (!list.length) fail(parts.length || to < toks.length ? 'A comma needs a list on each side' : 'The query is empty', endChar);
      parts.push({ text: q.slice(fromChar, endChar - 1).trim(), tree: parseTokens(list, endChar) });
    };
    toks.forEach((t, k) => {
      if (t.type !== 'op') return;
      if (t.v === '(') depth++;
      else if (t.v === ')') depth = Math.max(0, depth - 1);
      else if (t.v === ',') {
        if (depth) fail('A comma can\'t be inside brackets', t.at);
        cut(k, t.at);
        from = k + 1; fromChar = t.at;
      }
    });
    cut(toks.length, q.length + 1);
    return { parts, error: null };
  } catch (e) {
    return { parts: [], error: { message: /** @type {Error} */ (e).message, at: /** @type {any} */ (e).at ?? 1 } };
  }
}

/** a name with * as "any letters", as a test on a folded name @param {string} pattern */
const wild = pattern => {
  const body = fold(pattern).split('\0').map((piece, k) => {
    // after an escape, the piece's first character is plain
    const plain = k > 0 ? piece.slice(0, 1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
    const rest = (k > 0 ? piece.slice(1) : piece).split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return plain + rest;
  }).join('');
  const re = new RegExp(`^${body}$`);
  return (/** @type {string | undefined} */ name) => !!name && re.test(fold(name.trim()));
};
const plainText = (/** @type {string} */ s) => s.replace(/\0/g, '');

/** a day written in a query: today, tomorrow, yesterday, YYYY-MM-DD, "3 Jan", "Jan 3" (a year optional), a weekday
 * (the next one, today counted), else the context's own reader @param {string} text @param {QueryContext} c */
export function readDay(text, c) {
  const s = fold(plainText(text)).trim().replace(/\s+/g, ' ');
  if (s === 'today') return c.today;
  if (s === 'tomorrow') return addDays(c.today, 1);
  if (s === 'yesterday') return addDays(c.today, -1);
  if (isDay(s)) return addDays(s, 0) === s ? s : null;
  const wd = weekdayIndex(s);
  if (wd >= 0) return addDays(c.today, (wd - weekdayOf(c.today) + 7) % 7);
  const m = s.match(/^(\d{1,2}) ([a-z]{3})[a-z]*\.?(?: (\d{4}))?$/) ?? s.match(/^([a-z]{3})[a-z]*\.? (\d{1,2})(?:,? (\d{4}))?$/);
  if (m) {
    const [day, mon] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]], k = MONTHS.indexOf(mon);
    if (k >= 0) {
      let year = m[3] ? +m[3] : +c.today.slice(0, 4);
      const key = (/** @type {number} */ y) => `${y}-${String(k + 1).padStart(2, '0')}-${String(+day).padStart(2, '0')}`;
      if (!m[3] && key(year) < c.today) year++;
      if (isDay(key(year)) && addDays(key(year), 0) === key(year)) return key(year);
    }
  }
  return c.parseDate?.(plainText(text)) ?? null;
}
const weekdayIndex = (/** @type {string} */ s) => { const k = WEEKDAYS.indexOf(s); return k >= 0 ? k : SHORT_DAYS.indexOf(s); };

/** one term as a test @param {string} raw @param {number} at @param {QueryContext} c @returns {(t: Task) => boolean} */
function termTest(raw, at, c) {
  const text = raw.trim(), s = fold(plainText(text)).replace(/\s+/g, ' ');
  const due = (/** @type {Task} */ t) => (t.due && typeof t.due === 'object' && isDay(t.due.date) ? t.due : null);
  const on = (/** @type {(d: string) => boolean} */ f) => (/** @type {Task} */ t) => { const d = due(t); return !!d && f(d.date); };
  const { today } = c;
  switch (s) {
    case 'today': return on(d => d === today);
    case 'tomorrow': return on(d => d === addDays(today, 1));
    case 'yesterday': return on(d => d === addDays(today, -1));
    case 'overdue': case 'od': return on(d => d < today);
    case 'no date': return t => !due(t);
    case 'no time': return t => { const d = due(t); return !!d && !d.time; };
    case 'recurring': return t => !!due(t)?.rrule;
    case 'subtask': case 'subtasks': return t => !!t.parentId;
    case 'no priority': return t => priorityOf(t) === 4;
    case 'no labels': case 'no label': return t => !labelsOf(t, c.labels).length;
    default: break;
  }
  let m = s.match(/^p([1-4])$/);
  if (m) { const p = Number(m[1]); return t => priorityOf(t) === p; }
  m = s.match(/^(?:next )?(\d{1,3}) days?$/);
  if (m) { const end = addDays(today, Number(m[1])); return on(d => d >= today && d <= end); }
  m = s.match(/^-(\d{1,3}) days?$/);
  if (m) { const from = addDays(today, -Number(m[1])); return on(d => d >= from && d < today); }
  m = s.match(/^(?:date|due) ?(before|after)?: ?(.+)$/);
  if (m) {
    const day = readDay(m[2], c);
    if (!day) fail(`“${m[2]}” isn't a date this can read`, at);
    return m[1] === 'before' ? on(d => d < day) : m[1] === 'after' ? on(d => d > day) : on(d => d === day);
  }
  const wd = weekdayIndex(s);
  if (wd >= 0) { const day = addDays(today, (wd - weekdayOf(today) + 7) % 7); return on(d => d === day); }
  m = text.match(/^search:\s*(.+)$/i);
  if (m) {
    const words = fold(plainText(m[1])).split(/\s+/).filter(Boolean);
    return t => { const hay = fold(`${t.title} ${t.description ?? ''}`); return words.every(w => hay.includes(w)); };
  }
  if (text.startsWith('@') || text.startsWith('%')) {
    const is = wild(text.slice(1));
    return t => labelsOf(t, c.labels).some(l => is(l.name));
  }
  if (text.startsWith('##')) {
    const is = wild(text.slice(2)), roots = new Set(c.projects.filter(p => is(p.name)).map(p => p.id));
    if (is('Inbox')) roots.add('inbox');
    for (let grew = true; grew;) { grew = false; for (const p of c.projects) if (p.parentId && roots.has(p.parentId) && !roots.has(p.id)) { roots.add(p.id); grew = true; } }
    return t => roots.has(projectOf(t));
  }
  if (text.startsWith('#')) {
    const is = wild(text.slice(1)), ids = new Set(c.projects.filter(p => is(p.name)).map(p => p.id));
    if (is('Inbox')) ids.add('inbox');
    return t => ids.has(projectOf(t));
  }
  if (text.startsWith('/')) {
    const name = text.slice(1);
    if (name.trim() === '*') return t => !!t.sectionId && c.sections.some(x => x.id === t.sectionId);
    const is = wild(name), ids = new Set(c.sections.filter(x => is(x.name)).map(x => x.id));
    return t => !!t.sectionId && ids.has(t.sectionId);
  }
  return fail(`“${plainText(text)}” isn't a term this knows`, at);
}

/** @param {Node} n @param {QueryContext} c @returns {(t: Task) => boolean} */
function compile(n, c) {
  if (n.kind === 'term') return termTest(n.text, n.at, c);
  if (n.kind === 'not') { const a = compile(n.a, c); return t => !a(t); }
  const a = compile(n.a, c), b = compile(n.b, c);
  return n.kind === 'and' ? t => a(t) && b(t) : t => a(t) || b(t);
}

/**
 * A query as tests, one per comma part, or the first error. @param {string} q @param {QueryContext} c
 * @returns {{ parts: QueryPart[], error: QueryError | null }}
 */
export function compileQuery(q, c) {
  const read = parseQuery(q);
  if (read.error) return { parts: [], error: read.error };
  try {
    return { parts: read.parts.map(p => ({ text: p.text, test: compile(p.tree, c) })), error: null };
  } catch (e) {
    return { parts: [], error: { message: /** @type {Error} */ (e).message, at: /** @type {any} */ (e).at ?? 1 } };
  }
}

/**
 * The open tasks a query shows, a list per comma part (each headed by its own words). @param {string} q
 * @param {Task[]} tasks @param {QueryContext} c @returns {{ groups: { title: string, tasks: Task[] }[], error: QueryError | null }}
 */
export function runQuery(q, tasks, c) {
  const { parts, error } = compileQuery(q, c);
  const open = tasks.filter(t => isTask(t) && !t.done);
  return { groups: parts.map(p => ({ title: p.text, tasks: open.filter(p.test) })), error };
}

/** how many open tasks a query shows (a task in two lists counts once), or the error @param {string} q @param {Task[]} tasks @param {QueryContext} c */
export function countQuery(q, tasks, c) {
  const { groups, error } = runQuery(q, tasks, c);
  return error ? { count: 0, error } : { count: new Set(groups.flatMap(g => g.tasks.map(t => t.id))).size, error: null };
}

/** an error in words: "… (at 7)" @param {QueryError} e */
export const errorText = e => `${e.message} (at ${e.at})`;
