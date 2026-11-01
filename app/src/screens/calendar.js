// A list in its calendar layout (Display: Layout, Calendar; views.js hands the list over, lazyModules "calendar").
// Over it a row: the period's month (a tap picks a day), "No date N" (a list's undated tasks) or "Overdue N" (Today and
// Upcoming), Today when away, and back / on. Week: a column a day (3 on a phone, 7 from 600 px, Today's one) under a
// sticky head of days and an all-day row (two a day and "+N" until opened, the toggle in the gutter), then the hours at
// 48 px each with the tasks that have a time as blocks (their length, side by side when they overlap, filled by
// priority, label or project) and the time now in red. Month: the weeks, a few chips a day and "+N more" (the day's
// sheet). Agenda: by day, as Upcoming (week-strip.js). A sideways swipe goes a period on or back; a tap on an empty
// hour adds a task there; a held task (350 ms) drags to another time, day or the all-day row, with Undo. cal.js does the
// arithmetic; nothing here moves but by transform and opacity.
import { icon, drag, glide, haptic, claim, release } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { INBOX, REFUSED } from '../items.js';
import { isTask, dayOrder, priorityOf, projectOf, labelsOf, placeText } from '../tasks.js';
import { narrowTasks, sorter } from '../arrange.js';
import { dayKey, timeKey, addDays, dueOf, minutesClock } from '../dates.js';
import { colorHex } from '../colors.js';
import { edgeScroll, edgeSpeed, shownSpan } from '../ui/edge-scroll.js';
import { HOUR, columnCount, weekColumns, minutesOf, timeOf, yOf, minOf, snap, blockHeight, openAt, lanes, monthCells, dropPatch,
  unchanged, periodTitle, stepPeriod, periodOf, occurrences } from '../cal.js';
import { el } from './pick.js';
import { rowList, addRow } from '../ui/row.js';
import { underBar } from '../ui/stick.js';

/** @typedef {import('./views.js').Ctx} Ctx */
/** @typedef {import('../items.js').Task} Task */
/** @typedef {import('../tasks.js').Display} Display */
/**
 * @typedef {{ view: string, into: HTMLElement, empty: HTMLElement | null, tasks: Task[], d: Display, start: import('./views.js').AddContext,
 *   resched: (sec: HTMLElement, tasks: Task[]) => void }} CalOptions
 */
/** @typedef {{ date: string, min?: number, allDay?: boolean, at: HTMLElement }} Target */

const HOLD_MS = 350, SLOP = 10, ALL_DAY = 2, MONTH_MAX = 3;
// a held task near the week grid's side (24 px) turns the period after half a second, then every 0.7 s while it stays
const PAGE_EDGE = 24, PAGE_FIRST = 500, PAGE_NEXT = 700;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Tue 3 Nov" @param {string} key */
const dayText = key => `${DAYS[new Date(`${key}T12:00:00Z`).getUTCDay()]} ${+key.slice(8)} ${MONS[+key.slice(5, 7) - 1]}`;

/** each list's period and parts kept between draws (a draw follows every change) @type {Map<string, { first: string, kind: string, n: number,
 *   opened: boolean, tick?: ReturnType<typeof setInterval>, strip?: HTMLElement, list?: HTMLElement, redraw: () => void,
 *   sig?: string, root?: HTMLElement }>} */
const kept = new Map();
/** the rule library, once a list shows future dates @type {any} */
let RRule = null;
/** the sheet open over a calendar, drawn again with it @type {(() => void) | null} */
let sheetDraw = null;
let resizing = false;

/** @param {Ctx} ctx @param {CalOptions} o @param {boolean} [force] drawn anew even when nothing it shows has changed */
export function drawCalendar(ctx, o, force = false) {
  const today = dayKey(), d = o.d, ws = Number(ctx.app.settings.get('weekStart') ?? 1);
  const kind = o.view === 'today' ? 'day' : d.cal === 'month' ? 'month' : d.cal === 'agenda' ? 'agenda' : 'week';
  const width = o.into.clientWidth || document.documentElement.clientWidth || 390;
  const n = kind === 'day' ? 1 : kind === 'week' ? columnCount(width) : 0;
  let st = kept.get(o.view);
  if (!st || st.kind !== kind) {
    st = { first: '', kind, n, opened: false, redraw: () => {} };
    kept.set(o.view, st);
  }
  // (paged before on another width: the period that holds its first day)
  st.first = periodOf(st.first || today, kind === 'month' ? 'month' : 'week', n, ws);
  st.n = n;
  st.redraw = () => drawCalendar(ctx, { ...o, d: ctx.display(o.view) }, true);
  o.empty?.replaceChildren();
  if (!resizing) {
    resizing = true;
    addEventListener('resize', () => { for (const s of kept.values()) if (s.kind === 'week' && columnCount(innerWidth) !== s.n) { ctx.redraw(); return; } });
  }

  const labels = ctx.data().labels;
  const pool = narrowTasks(o.tasks.filter(t => isTask(t) && (!t.done || d.completed)), d, labels, today);
  const open = pool.filter(t => !t.done);
  const undated = /^(today|upcoming)$/.test(o.view) ? [] : open.filter(t => !dueOf(t.due));
  const overdue = /^(today|upcoming)$/.test(o.view) ? open.filter(t => { const k = dueOf(t.due)?.date; return !!k && k < today; }) : [];
  if (d.future && !RRule && pool.some(t => dueOf(t.due)?.rrule)) {
    void import('../recur.js').then(m => m.dateLibs()).then(l => { RRule = l.RRule; st?.redraw(); }).catch(() => {});
  }
  // a draw follows every change anywhere: one that changes nothing here keeps the grid (its scroll, a finger on it)
  const data = ctx.data();
  const sig = JSON.stringify([kind, n, width, st.first, today, d, ws, ctx.canWrite(), !!RRule,
    pool.map(t => [t.id, t.title, t.due, t.duration, t.priority, t.done, t.labels, t.projectId, t.sectionId]),
    d.color === 'label' ? labels.map(l => [l.id, l.color]) : d.color === 'project' ? data.projects.map(x => [x.id, x.color]) : 0]);
  if (!force && kind !== 'agenda' && st.sig === sig && st.root?.parentNode === o.into) return;
  st.sig = sig;
  clearInterval(st.tick);

  const root = el('div', `td-cv td-cv-${kind === 'day' ? 'week' : kind}`);
  const sticky = el('div', 'td-cv-sticky');
  if (kind === 'agenda') {
    // Upcoming's painter on this list's tasks (its strip and days kept, so the strip's place survives a draw)
    st.strip ??= el('div', 'td-strip td-cv-strip');
    st.list ??= el('div', 'td-cv-agenda');
    // the strip names its own month: the row over it keeps only the counts (none: no row)
    const counts = undated.length || overdue.length ? [top(ctx, o, st, { today, ws, undated, overdue, first: today, last: today, kind })] : [];
    o.into.replaceChildren(...counts, st.strip, st.list);
    const strip = st.strip, list = st.list;
    void import('../ui/week-strip.js').then(m => m.drawDays(ctx, { list, strip, tasks: pool, d, place: o.view !== 'inbox' && !o.view.startsWith('project:'),
      projectId: o.start.projectId ?? INBOX, resched: o.resched }));
    sheetDraw?.();
    return;
  }
  root.dataset.swipeOwn = '';
  const sorted = [...pool].sort(sorter(d.sort === 'manual' ? 'date' : d.sort, d.dir, dayOrder));
  /** @type {Map<string, Task[]>} */
  const byDay = new Map();
  for (const t of sorted) { const k = dueOf(t.due)?.date; if (k) byDay.set(k, [...(byDay.get(k) ?? []), t]); }
  const fill = (/** @type {HTMLElement} */ x, /** @type {Task} */ t) => tint(ctx, x, t, d.color);

  /** @type {HTMLElement} */
  let pane;
  let first = st.first, last = st.first;
  if (kind === 'month') {
    last = addDays(stepPeriod(first, 'month', 1), -1);
    pane = month(ctx, o, { first, today, ws, byDay, fill });
  } else {
    const cols = weekColumns(first, width, { day: kind === 'day', weekStart: ws });
    last = cols.days[cols.days.length - 1];
    const ghosts = d.future && RRule ? futureOf(pool, first, last) : new Map();
    pane = week(ctx, o, st, { days: cols.days, today, byDay, fill, ghosts, sticky, allOpen: d.allDay });
  }
  sticky.prepend(top(ctx, o, st, { today, ws, undated, overdue, first, last, kind }));
  root.append(sticky, pane);
  o.into.replaceChildren(root);
  st.root = root;
  underBar(sticky);
  pager(st, root, pane, kind === 'month' ? 'month' : 'week');
  holds(ctx, root, st);
  sheetDraw?.();
  if (kind !== 'month' && !st.opened) requestAnimationFrame(() => { if (st && root.isConnected && root.offsetParent) { st.opened = true; scrollToOpen(root, sticky, byDay, first, last); } });
}

/** the period's title, which opens the month picker @param {NonNullable<ReturnType<typeof kept.get>>} st @param {{ today: string, ws: number, first: string, last: string, kind: string }} p */
function periodButton(st, p) {
  const title = /** @type {HTMLButtonElement} */ (el('button', 'td-cv-title'));
  title.type = 'button';
  title.setAttribute('aria-haspopup', 'dialog');
  const words = periodTitle(p.first, p.last);
  title.append(el('span', '', words), icon(ICONS.chevronDown, { class: 'td-cv-title-chevron' }));
  title.setAttribute('aria-label', `${words}, pick a day`);
  title.addEventListener('click', () => {
    void import('../ui/week-strip.js').then(m => m.pickMonth({ pick: p.first, day: p.today, start: p.ws, min: '0000-01-01' }, key => {
      st.first = periodOf(key, p.kind === 'month' ? 'month' : 'week', st.n, p.ws);
      st.opened = false;
      st.redraw();
    }));
  });
  return title;
}

/** the row over the calendar @param {Ctx} ctx @param {CalOptions} o @param {NonNullable<ReturnType<typeof kept.get>>} st
 * @param {{ today: string, ws: number, undated: Task[], overdue: Task[], first: string, last: string, kind: string }} p */
function top(ctx, o, st, p) {
  const row = el('div', 'td-cv-top');
  if (p.kind !== 'agenda') row.append(periodButton(st, p));
  const count = (/** @type {string} */ cls, /** @type {string} */ label, /** @type {Task[]} */ tasks, /** @type {'nodate' | 'overdue'} */ what) => {
    const b = /** @type {HTMLButtonElement} */ (el('button', `td-cv-count ${cls}`, `${label} ${tasks.length}`));
    b.type = 'button';
    b.setAttribute('aria-haspopup', 'dialog');
    b.addEventListener('click', () => pickSheet(ctx, o, what));
    row.append(b);
  };
  if (p.undated.length) count('td-cv-nodate', 'No date', p.undated, 'nodate');
  if (p.overdue.length) count('td-cv-overdue', 'Overdue', p.overdue, 'overdue');
  row.append(el('span', 'td-cv-gap'));
  if (p.kind === 'agenda') return row;
  const home = periodOf(p.today, p.kind === 'month' ? 'month' : 'week', st.n, p.ws);
  if (p.today < p.first || p.today > p.last) {
    const t = /** @type {HTMLButtonElement} */ (el('button', 'td-text-btn td-cv-today', 'Today'));
    t.type = 'button';
    t.addEventListener('click', () => { st.first = home; st.opened = false; st.redraw(); });
    row.append(t);
  }
  const step = (/** @type {number} */ by, /** @type {string} */ label, /** @type {import('app-ui/icons/lucide.js').IconNodes} */ ic) => {
    const b = /** @type {HTMLButtonElement} */ (el('button', 'td-round td-cv-step'));
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.append(icon(ic));
    b.addEventListener('click', () => { st.first = stepPeriod(st.first, p.kind === 'month' ? 'month' : 'week', by, st.n); st.redraw(); });
    row.append(b);
  };
  const word = p.kind === 'month' ? 'month' : st.n === 1 ? 'day' : st.n === 3 ? 'days' : 'week';
  step(-1, `Last ${word}`, ICONS.chevronLeft);
  step(1, `Next ${word}`, ICONS.chevronRight);
  return row;
}

/** the fill of a block or chip: by priority, or the first label's or the project's colour @param {Ctx} ctx @param {HTMLElement} x @param {Task} t @param {string} by */
function tint(ctx, x, t, by) {
  const data = ctx.data();
  const hex = by === 'label' ? labelsOf(t, data.labels)[0]?.color : by === 'project' && projectOf(t) !== INBOX ? data.projects.find(p => p.id === projectOf(t))?.color : null;
  if (hex) { x.classList.add('is-tinted'); x.style.setProperty('--td-cv-c', colorHex(hex)); } else x.dataset.priority = String(priorityOf(t));
}

/** "Pay rent, Tue 3 Nov 10:00 AM to 10:45 AM, priority 1" (the clock in the device's own style) @param {Task} t */
function fullLabel(t) {
  const due = dueOf(t.due), start = minutesOf(due?.time);
  const when = due ? `${dayText(due.date)}${start !== null ? ` ${minutesClock(start)} to ${minutesClock(Math.min(1439, start + (t.duration || 30)))}` : ''}` : 'no date';
  return `${t.title}, ${when}, priority ${priorityOf(t)}${t.done ? ', completed' : ''}`;
}

/** a task's chip (the all-day row, a month day): a button that opens it @param {Ctx} ctx @param {Task} t @param {(x: HTMLElement, t: Task) => void} fill */
function chip(ctx, t, fill) {
  const b = /** @type {HTMLButtonElement} */ (el('button', 'td-cv-chip', t.title));
  b.type = 'button';
  b.dataset.calId = t.id;
  b.classList.toggle('is-done', !!t.done);
  b.setAttribute('aria-label', fullLabel(t));
  fill(b, t);
  b.addEventListener('click', () => ctx.openTask(t));
  return b;
}

/** a repeating task's later dates in the period (drawn faded; they are not tasks yet) @param {Task[]} pool @param {string} from @param {string} to */
function futureOf(pool, from, to) {
  /** @type {Map<string, Task[]>} */
  const out = new Map();
  for (const t of pool) {
    if (t.done) continue;
    for (const k of occurrences(t.due, from, to, RRule)) out.set(k, [...(out.get(k) ?? []), t]);
  }
  return out;
}

/** the week (or a day): heads, the all-day row, the hours @param {Ctx} ctx @param {CalOptions} o @param {NonNullable<ReturnType<typeof kept.get>>} st
 * @param {{ days: string[], today: string, byDay: Map<string, Task[]>, fill: (x: HTMLElement, t: Task) => void, ghosts: Map<string, Task[]>, sticky: HTMLElement, allOpen: boolean }} p */
function week(ctx, o, st, p) {
  const n = p.days.length;
  const heads = el('div', 'td-cv-heads');
  heads.style.setProperty('--n', String(n));
  heads.append(el('span', 'td-cv-corner'));
  const allRow = el('div', 'td-cv-allday');
  allRow.style.setProperty('--n', String(n));
  const toggle = /** @type {HTMLButtonElement} */ (el('button', 'td-cv-allday-toggle'));
  toggle.type = 'button';
  toggle.setAttribute('aria-label', p.allOpen ? 'Show fewer all-day tasks' : 'Show all all-day tasks');
  toggle.setAttribute('aria-expanded', String(p.allOpen));
  toggle.append(icon(MORE.chevronsUpDown));
  const setOpen = (/** @type {boolean} */ v) => {
    const all = /** @type {Record<string, unknown>} */ (ctx.app.settings.get('display') ?? {});
    ctx.app.settings.set('display', { ...all, [o.view]: { ...ctx.display(o.view), allDay: v } });
  };
  toggle.addEventListener('click', () => setOpen(!p.allOpen));
  allRow.append(toggle);
  let anyAllDay = false;
  const grid = el('div', 'td-cv-grid');
  grid.style.setProperty('--n', String(n));
  const hours = el('div', 'td-cv-hours');
  hours.setAttribute('aria-hidden', 'true');
  const fmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });
  for (let h = 1; h < 24; h++) {
    const l = el('span', 'td-cv-hour', fmt.format(new Date(2000, 0, 1, h)));
    l.style.transform = `translateY(${h * HOUR}px)`;
    hours.append(l);
  }
  grid.append(hours);
  /** @type {{ min: number, top: HTMLElement }[]} */
  const firsts = [];
  for (const key of p.days) {
    const h = el('div', 'td-cv-head');
    h.dataset.calHead = key;
    const num = el('span', 'td-cv-head-num', String(+key.slice(8)));
    h.classList.toggle('is-today', key === p.today);
    h.append(el('span', 'td-cv-head-day', DAYS[new Date(`${key}T12:00:00Z`).getUTCDay()]), num);
    h.setAttribute('aria-label', `${dayText(key)}${key === p.today ? ', today' : ''}`);
    h.setAttribute('role', 'heading');
    h.setAttribute('aria-level', '3');
    heads.append(h);

    const tasks = p.byDay.get(key) ?? [];
    const allDay = tasks.filter(t => minutesOf(dueOf(t.due)?.time) === null), timed = tasks.filter(t => minutesOf(dueOf(t.due)?.time) !== null);
    const cell = el('div', 'td-cv-allday-cell');
    cell.dataset.calAllday = key;
    cell.setAttribute('role', 'group');
    cell.setAttribute('aria-label', `All day, ${dayText(key)}`);
    const cut = p.allOpen || allDay.length <= ALL_DAY ? allDay.length : ALL_DAY - 1;
    for (const t of allDay.slice(0, cut)) cell.append(chip(ctx, t, p.fill));
    if (allDay.length > cut) {
      const more = /** @type {HTMLButtonElement} */ (el('button', 'td-cv-chip td-cv-chip-more', `+${allDay.length - cut}`));
      more.type = 'button';
      more.setAttribute('aria-label', `${allDay.length - cut} more all-day tasks on ${dayText(key)}`);
      more.addEventListener('click', () => setOpen(true));
      cell.append(more);
    }
    for (const t of p.ghosts.get(key) ?? []) if (minutesOf(dueOf(t.due)?.time) === null) cell.append(ghost(t, null));
    anyAllDay ||= allDay.length > 0;
    allRow.append(cell);

    const col = el('div', 'td-cv-col');
    col.dataset.calSlot = key;
    col.setAttribute('role', 'group');
    col.setAttribute('aria-label', dayText(key));
    col.classList.toggle('is-today', key === p.today);
    const spans = timed.map(t => { const s = /** @type {number} */ (minutesOf(dueOf(t.due)?.time)); return { id: t.id, start: s, end: s + Math.max(minOf(20), t.duration || 30) }; });
    const lane = lanes(spans);
    for (const t of timed) {
      const s = /** @type {number} */ (minutesOf(dueOf(t.due)?.time)), l = lane.get(t.id) ?? { lane: 0, of: 1 };
      const b = block(ctx, t, s, p.fill);
      b.style.top = `${yOf(s)}px`;
      b.style.height = `${blockHeight(s, t.duration)}px`;
      b.style.left = `calc(${(l.lane / l.of) * 100}% + 1px)`;
      b.style.width = `calc(${100 / l.of}% - 3px)`;
      col.append(b);
      firsts.push({ min: s, top: b });
    }
    for (const t of p.ghosts.get(key) ?? []) {
      const s = minutesOf(dueOf(t.due)?.time);
      if (s === null) continue;
      const g = ghost(t, s);
      g.style.top = `${yOf(s)}px`;
      g.style.height = `${blockHeight(s, t.duration)}px`;
      col.append(g);
    }
    // a tap on an empty half hour: a new task there, 30 minutes long
    col.addEventListener('click', e => {
      if (e.target !== col || !ctx.canWrite()) return;
      const min = Math.floor(minOf(e.clientY - col.getBoundingClientRect().top) / 30) * 30;
      ctx.openQuickAdd({ ...o.start, due: { date: key, time: timeOf(Math.max(0, Math.min(1410, min))) }, duration: 30 });
    });
    grid.append(col);
  }
  if (!anyAllDay && !p.allOpen) allRow.classList.add('is-empty');
  p.sticky.append(heads, allRow);
  nowLine(grid, p.days, p.today, st);
  return grid;
}

/** a timed task's block: the ring (complete) and the rest (open) @param {Ctx} ctx @param {Task} t @param {number} start @param {(x: HTMLElement, t: Task) => void} fill */
function block(ctx, t, start, fill) {
  const b = el('div', 'td-cv-block');
  b.dataset.calId = t.id;
  b.classList.toggle('is-done', !!t.done);
  b.classList.toggle('is-short', blockHeight(start, t.duration) < 34);
  b.classList.toggle('is-tall', blockHeight(start, t.duration) >= 60);
  fill(b, t);
  const ring = /** @type {HTMLButtonElement} */ (el('button', 'td-cv-ring'));
  ring.type = 'button';
  ring.setAttribute('role', 'checkbox');
  ring.setAttribute('aria-checked', String(!!t.done));
  ring.setAttribute('aria-label', `Complete: ${t.title}`);
  ring.disabled = !ctx.canWrite();
  ring.addEventListener('click', () => {
    if (t.done) { void ctx.app.untick([t]).then(r => r && ctx.toast(REFUSED)); return; }
    ring.setAttribute('aria-checked', 'true');
    b.classList.add('is-done');
    ctx.complete(t, b);
  });
  const main = /** @type {HTMLButtonElement} */ (el('button', 'td-cv-open'));
  main.type = 'button';
  main.setAttribute('aria-label', fullLabel(t));
  main.append(el('span', 'td-cv-block-title', t.title));
  if ((t.duration ?? 0) >= 45) {
    // (drawn from CSS: the label says the time in words, and seen text not in it would not match what is read)
    const tm = el('span', 'td-cv-block-time');
    tm.dataset.time = `${minutesClock(start)}–${minutesClock(Math.min(1439, start + /** @type {number} */ (t.duration)))}`;
    main.append(tm);
  }
  main.addEventListener('click', () => ctx.openTask(t));
  b.append(ring, main);
  return b;
}

/** a repeating task's later date: faded and dashed, for the eye only @param {Task} t @param {number | null} start */
function ghost(t, start) {
  const g = el('div', start === null ? 'td-cv-chip td-cv-ghost' : 'td-cv-block td-cv-ghost', start === null ? t.title : '');
  if (start !== null) g.append(el('span', 'td-cv-block-title', t.title));
  g.setAttribute('aria-hidden', 'true');
  return g;
}

/** the time now: a red line across today (a dot at its start, the time in the gutter), faint across the other days;
 * moved each minute @param {HTMLElement} grid @param {string[]} days @param {string} today @param {NonNullable<ReturnType<typeof kept.get>>} st */
function nowLine(grid, days, today, st) {
  const i = days.indexOf(today);
  if (i < 0) return;
  const line = el('div', 'td-cv-now');
  line.setAttribute('aria-hidden', 'true');
  line.style.setProperty('--i', String(i));
  const time = el('span', 'td-cv-now-time');
  line.append(el('span', 'td-cv-now-all'), el('span', 'td-cv-now-day'), time);
  const place = (first = false) => {
    if (!first && !grid.isConnected) { clearInterval(st.tick); return; }
    if (dayKey() !== today) { st.redraw(); return; }
    const now = /** @type {number} */ (minutesOf(timeKey()));
    line.style.transform = `translateY(${yOf(now)}px)`;
    time.textContent = minutesClock(now);
  };
  place(true);
  grid.append(line);
  st.tick = setInterval(place, 60_000);
}

/** the scroll that shows an hour before now, or the first timed task when that is earlier
 * @param {HTMLElement} root @param {HTMLElement} sticky @param {Map<string, Task[]>} byDay @param {string} first @param {string} last */
function scrollToOpen(root, sticky, byDay, first, last) {
  const grid = /** @type {HTMLElement | null} */ (root.querySelector('.td-cv-grid'));
  if (!grid) return;
  let low = /** @type {number | null} */ (null);
  for (const [k, ts] of byDay) if (k >= first && k <= last) for (const t of ts) { const m = minutesOf(dueOf(t.due)?.time); if (m !== null && (low === null || m < low)) low = m; }
  const sc = scroller(root), base = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
  const y = openAt(/** @type {number} */ (minutesOf(timeKey())), low);
  sc.scrollTo({ top: sc.scrollTop + grid.getBoundingClientRect().top - base + y - sticky.offsetHeight - (parseFloat(sticky.style.top) || 0) });
}

/** the element that scrolls the page @param {HTMLElement} from */
function scroller(from) {
  for (let n = from.parentElement; n && n !== document.body; n = n.parentElement) {
    const y = getComputedStyle(n).overflowY;
    if ((y === 'auto' || y === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return /** @type {HTMLElement} */ (document.scrollingElement ?? document.documentElement);
}

/** the month: weekday letters, then the weeks; a day's number (or "+N more") opens its sheet, the rest of it adds a task
 * @param {Ctx} ctx @param {CalOptions} o @param {{ first: string, today: string, ws: number, byDay: Map<string, Task[]>, fill: (x: HTMLElement, t: Task) => void }} p */
function month(ctx, o, p) {
  const box = el('div', 'td-cv-mbox');
  const head = el('div', 'td-cv-wk');
  head.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 7; i++) head.append(el('span', '', DAYS[(p.ws + i) % 7]));
  const weeks = el('div', 'td-cv-weeks');
  for (const wk of monthCells(p.first.slice(0, 7), p.ws, p.byDay, MONTH_MAX)) {
    const r = el('div', 'td-cv-mrow');
    for (const c of wk) {
      const cell = el('div', 'td-cv-cell');
      cell.dataset.calCell = c.key;
      cell.classList.toggle('is-out', !c.inMonth);
      cell.setAttribute('role', 'group');
      const count = c.shown.length + c.more;
      cell.setAttribute('aria-label', `${dayText(c.key)}${count ? `, ${count} task${count === 1 ? '' : 's'}` : ''}`);
      const num = /** @type {HTMLButtonElement} */ (el('button', 'td-cv-num', String(+c.key.slice(8))));
      num.type = 'button';
      num.classList.toggle('is-today', c.key === p.today);
      num.setAttribute('aria-label', `${dayText(c.key)}${c.key === p.today ? ', today' : ''}, show the day`);
      num.addEventListener('click', () => daySheet(ctx, o, c.key));
      cell.append(num, ...c.shown.map(t => chip(ctx, t, p.fill)));
      if (c.more) {
        const m = /** @type {HTMLButtonElement} */ (el('button', 'td-cv-more', `+${c.more} more`));
        m.type = 'button';
        m.addEventListener('click', () => daySheet(ctx, o, c.key));
        cell.append(m);
      }
      cell.addEventListener('click', e => { if (e.target === cell && ctx.canWrite()) ctx.openQuickAdd({ ...o.start, due: { date: c.key } }); });
      r.append(cell);
    }
    weeks.append(r);
  }
  box.append(head, weeks);
  return box;
}

/** the calendar's sheet (#cal-sheet) @returns {[HTMLDialogElement, HTMLElement]} */
const calSheet = () => { const s = /** @type {HTMLDialogElement} */ (document.getElementById('cal-sheet')); return [s, /** @type {HTMLElement} */ (s.querySelector('[data-fill]'))]; };
/** the sheet's head: Close, the title, and an action @param {HTMLDialogElement} s @param {string} title @param {HTMLElement | null} action */
function head(s, title, action) {
  const h = el('div', 'td-sheet-head');
  const x = /** @type {HTMLButtonElement} */ (el('button', 'td-round td-sheet-x td-sheet-grey'));
  x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.append(icon(ICONS.x));
  x.addEventListener('click', () => s.close());
  const t = el('h2', 'td-sheet-title', title);
  t.id = 'cal-sheet-title';
  s.setAttribute('aria-labelledby', t.id);
  h.append(x, t, action ?? el('span', 'td-sheet-spacer'));
  return h;
}
const opened = (/** @type {HTMLDialogElement} */ s) => {
  if (!s.open) { s.showModal(); s.addEventListener('close', () => { sheetDraw = null; }, { once: true }); }
};

/** a day of the month: its tasks as rows, and Add task @param {Ctx} ctx @param {CalOptions} o @param {string} key */
function daySheet(ctx, o, key) {
  const [s, body] = calSheet();
  sheetDraw = () => {
    const today = dayKey(), d = ctx.display(o.view);
    const tasks = narrowTasks(o.tasks.filter(t => isTask(t) && (!t.done || d.completed) && dueOf(t.due)?.date === key), d, ctx.data().labels, today)
      .sort(sorter(d.sort === 'manual' ? 'date' : d.sort, d.dir, dayOrder));
    const now = new Map(ctx.data().tasks.map(t => [t.id, t]));
    const parts = [head(s, dayText(key), null), rowList(tasks.map(t => ({ task: now.get(t.id) ?? t, depth: 0, kids: 0, doneKids: 0 })), ctx.rows({ place: true, own: key }), dayText(key))];
    if (ctx.canWrite()) parts.push(addRow('Add task', () => { s.close(); ctx.openQuickAdd({ ...o.start, due: { date: key } }); }));
    body.replaceChildren(...parts);
  };
  sheetDraw();
  opened(s);
}

/** No date (a list's undated tasks: tick some, Schedule) or Overdue (Today, Upcoming: tick some, Reschedule)
 * @param {Ctx} ctx @param {CalOptions} o @param {'nodate' | 'overdue'} what */
function pickSheet(ctx, o, what) {
  const [s, body] = calSheet();
  /** @type {Set<string>} */
  const picked = new Set();
  sheetDraw = () => {
    const today = dayKey(), d = ctx.display(o.view), ids = new Set(o.tasks.map(t => t.id));
    const tasks = narrowTasks(ctx.data().tasks.filter(t => ids.has(t.id) && isTask(t) && !t.done && (what === 'nodate' ? !dueOf(t.due) : (dueOf(t.due)?.date ?? '9') < today)), d, ctx.data().labels, today)
      .sort(sorter(d.sort === 'manual' ? 'date' : d.sort, d.dir, dayOrder));
    for (const id of picked) if (!tasks.some(t => t.id === id)) picked.delete(id);
    if (!tasks.length) { s.close(); return; }
    const go = /** @type {HTMLButtonElement} */ (el('button', 'td-sheet-done', what === 'nodate' ? 'Schedule' : 'Reschedule'));
    go.type = 'button';
    go.disabled = !picked.size || !ctx.canWrite();
    go.addEventListener('click', () => {
      const chosen = tasks.filter(t => picked.has(t.id));
      s.close();
      void import('./select.js').then(m => (what === 'nodate' ? m.scheduleTasks(ctx, chosen) : m.rescheduleTasks(ctx, chosen)));
    });
    const list = el('ul', 'td-cv-picks');
    list.setAttribute('aria-label', what === 'nodate' ? 'No date' : 'Overdue');
    for (const t of tasks) {
      const li = el('li', '');
      const b = /** @type {HTMLButtonElement} */ (el('button', 'td-cv-pick'));
      b.type = 'button';
      b.setAttribute('role', 'checkbox');
      b.setAttribute('aria-checked', String(picked.has(t.id)));
      const where = placeText(t, ctx.data().projects, ctx.data().sections);
      b.append(el('span', 'td-cv-pick-circle'), el('span', 'td-cv-pick-title', t.title), ...(where ? [el('span', 'td-cv-pick-place', where)] : []));
      b.addEventListener('click', () => { if (picked.has(t.id)) picked.delete(t.id); else picked.add(t.id); sheetDraw?.(); /** @type {HTMLElement | null} */ (body.querySelector(`[data-pick="${t.id}"]`))?.focus(); });
      b.dataset.pick = t.id;
      li.append(b);
      list.append(li);
    }
    body.replaceChildren(head(s, what === 'nodate' ? 'No date' : 'Overdue', go), list);
  };
  sheetDraw();
  opened(s);
}

/** a sideways swipe: the period follows the finger, then glides out and the next (or last) one glides in (gesture
 * module's drag, named "cards" as the week strip's) @param {NonNullable<ReturnType<typeof kept.get>>} st
 * @param {HTMLElement} root @param {HTMLElement} pane @param {'week' | 'month'} by */
function pager(st, root, pane, by) {
  const moving = () => /** @type {HTMLElement[]} */ ([pane, ...root.querySelectorAll('.td-cv-heads, .td-cv-allday')]);
  const set = (/** @type {number} */ k) => ({ transform: `translateX(${k}px)` });
  const wire = () => drag(root, { axis: 'x', mouse: true, name: 'cards',
    filter: e => !/** @type {Element} */ (e.target).closest('.td-cv-top'),
    move: x => { for (const m of moving()) m.style.transform = `translateX(${x}px)`; },
    end: (x, v) => {
      const w = root.clientWidth || 320, back = x > 0;
      if (Math.abs(x) < w / 4 && Math.abs(v) < 0.3) { void glide(moving().map(m => [m, set]), x, 0, v).done.then(() => { for (const m of moving()) m.style.transform = ''; }); return; }
      haptic();
      void glide(moving().map(m => [m, set]), x, back ? w : -w, v).done.then(() => {
        st.first = stepPeriod(st.first, by, back ? -1 : 1, st.n);
        st.redraw();
      });
    } });
  let stop = wire();
  // (a held task's drag is the hold's: the swipe stands down until it is let go. App-only stopgap: the kit's "cards"
  // outranks "drag" and a drag cannot be paused, so it is stopped and wired again; asked of app-ui)
  root.addEventListener('td-cv-hold', e => { stop(); if (!(/** @type {CustomEvent} */ (e).detail)) stop = wire(); });
}

/** hold a task (350 ms), then drag it: to an hour (15-minute steps; a line with the time shows where), to the all-day
 * row (no time), or to another day; one save and Undo. Near the top or foot the page scrolls by itself (edge-scroll.js);
 * held at the week grid's side the period turns (the month: at its top or foot, once the page can scroll no further),
 * the task floating over the new one @param {Ctx} ctx @param {HTMLElement} root @param {NonNullable<ReturnType<typeof kept.get>>} st */
function holds(ctx, root, st) {
  root.addEventListener('pointerdown', e => {
    if (!ctx.canWrite() || !e.isPrimary || e.button > 0) return;
    const at0 = /** @type {Element} */ (e.target);
    const item = /** @type {HTMLElement | null} */ (at0.closest('[data-cal-id]'));
    if (!item || at0.closest('.td-cv-ring') || item.classList.contains('is-done')) return;
    const task = ctx.data().tasks.find(t => t.id === item.dataset.calId);
    if (!task) return;
    const id = e.pointerId, x0 = e.clientX, y0 = e.clientY, grab = e.clientY - item.getBoundingClientRect().top, isBlock = item.classList.contains('td-cv-block');
    const sc = scroller(root), s0 = sc.scrollTop, b0 = item.getBoundingClientRect();
    let lifted = false, moved = false, fx = x0, fy = y0, dir = 0;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let turn;
    /** the task lifted out of a period turned away: over the page, where it was @type {HTMLElement | null} */
    let float = null;
    /** @type {Target | null} */
    let target = null;
    /** @type {HTMLElement | null} */
    let mark = null;
    root.dataset.holding = '';
    const timer = setTimeout(() => {
      if (!claim('drag')) { done(); return; }
      lifted = true;
      root.dispatchEvent(new CustomEvent('td-cv-hold', { detail: true }));
      item.classList.add('is-lifted');
      item.style.transform = 'scale(1.03)';
      haptic('long');
    }, HOLD_MS);
    const done = () => {
      clearTimeout(timer);
      clearTimeout(turn);
      edge.stop();
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      root.removeEventListener('touchmove', touch);
      delete root.dataset.holding;
    };
    const show = () => {
      const t = find(fx, fy, isBlock ? grab : 0);
      const same = t && target && t.at === target.at && t.min === target.min;
      if (same) return;
      mark?.remove(); mark = null;
      root.querySelector('.is-drop')?.classList.remove('is-drop');
      target = t;
      if (!t) return;
      haptic('tick');
      if (typeof t.min === 'number') {
        mark = el('div', 'td-cv-drop');
        mark.style.transform = `translateY(${yOf(t.min)}px)`;
        mark.append(el('span', 'td-cv-drop-time', minutesClock(t.min)));
        t.at.append(mark);
      } else t.at.classList.add('is-drop');
    };
    const place = () => { item.style.transform = `translate(${fx - x0}px, ${fy - y0 + (float ? 0 : sc.scrollTop - s0)}px) scale(1.03)`; show(); };
    const edge = edgeScroll({ el: () => sc, span: () => shownSpan(sc), at: () => fy, on: () => lifted && moved, moved: () => { place(); paging(); } });
    // which way the period would turn from here (0: it stays)
    const pageWay = () => {
      if (st.kind === 'month') {
        const [lo, hi] = shownSpan(sc), v = edgeSpeed(fy, lo, hi);
        const end = v < 0 ? sc.scrollTop <= 0 : sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
        return v && end ? Math.sign(v) : 0;
      }
      if (st.kind !== 'week' && st.kind !== 'day') return 0;
      const g = (st.root?.querySelector('.td-cv-grid') ?? root).getBoundingClientRect();
      return fy < g.top ? 0 : fx < g.left + PAGE_EDGE ? -1 : fx > g.right - PAGE_EDGE ? 1 : 0;
    };
    const paging = () => {
      const way = lifted && moved ? pageWay() : 0;
      if (way === dir) return;
      clearTimeout(turn);
      dir = way;
      if (!way) return;
      const next = (/** @type {number} */ ms) => {
        turn = setTimeout(() => {
          if (pageWay() !== dir) { dir = 0; return; }
          lift();
          st.first = stepPeriod(st.first, st.kind === 'month' ? 'month' : 'week', dir, st.n);
          st.opened = true;
          st.redraw();
          haptic('tick');
          show();
          next(PAGE_NEXT);
        }, ms);
      };
      next(PAGE_FIRST);
    };
    // the period's draw takes the task's root away: it floats over the page from where it was, in the calendar's look
    const lift = () => {
      if (float) return;
      float = el('div', `${root.className} td-cv-float`);
      float.dataset.holding = '';
      float.style.cssText = `position:fixed;left:${b0.left}px;top:${b0.top}px;width:${b0.width}px;height:${b0.height}px;z-index:30;pointer-events:none;margin:0`;
      item.style.position = 'absolute';
      item.style.inset = '0';
      item.style.width = item.style.height = '100%';
      float.append(item);
      document.body.append(float);
      place();
    };
    const move = (/** @type {PointerEvent} */ ev) => {
      if (ev.pointerId !== id) return;
      fx = ev.clientX; fy = ev.clientY;
      if (!lifted) { if (Math.hypot(fx - x0, fy - y0) > SLOP) done(); return; }
      moved = true;
      place();
      edge.poke();
      paging();
    };
    const touch = (/** @type {TouchEvent} */ ev) => { if (lifted && ev.cancelable) ev.preventDefault(); };
    const up = async (/** @type {PointerEvent} */ ev) => {
      if (ev.pointerId !== id) return;
      done();
      if (!lifted) return;
      release('drag');
      root.dispatchEvent(new CustomEvent('td-cv-hold', { detail: false }));
      const floated = float;
      float = null;
      // the click that follows the let-go is the drag's
      const eat = (/** @type {MouseEvent} */ c) => { c.preventDefault(); c.stopPropagation(); };
      root.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => root.removeEventListener('click', eat, true), 400);
      mark?.remove();
      root.querySelector('.is-drop')?.classList.remove('is-drop');
      const settle = () => {
        // (floated: the period it came from is gone; the one shown is drawn again without it)
        if (floated) { floated.remove(); st.redraw(); return; }
        item.classList.remove('is-lifted'); void glide([[item, k => ({ transform: `scale(${1 + 0.03 * k})` })]], 1, 0).done.then(() => { item.style.transform = ''; });
      };
      if (!moved || !target || ev.type === 'pointercancel') { settle(); return; }
      const patch = dropPatch(task, target);
      if (unchanged(task, patch)) { settle(); return; }
      floated?.remove();
      item.style.opacity = '0';
      const was = { due: task.due ?? null, ...(patch.duration !== undefined ? { duration: task.duration ?? null } : {}) };
      if (await ctx.app.editTask(task, patch)) { ctx.toast(REFUSED); item.style.opacity = ''; settle(); st.redraw(); return; }
      ctx.undo.show('Task moved', async () => {
        const now = ctx.data().tasks.find(x => x.id === task.id) ?? task;
        if (await ctx.app.editTask(now, was)) ctx.toast(REFUSED);
      });
    };
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    root.addEventListener('touchmove', touch, { passive: false });
  }, { passive: true });
}

/** what is under the finger: an hour of a day (the block's top, `grab` px above the finger), the all-day row, a day's
 * head or a month's day @param {number} x @param {number} y @param {number} grab @returns {Target | null} */
function find(x, y, grab) {
  for (const n of document.elementsFromPoint(x, y)) {
    if (!(n instanceof HTMLElement) || n.closest('.is-lifted')) continue;
    const c = /** @type {HTMLElement | null} */ (n.closest('[data-cal-slot], [data-cal-allday], [data-cal-head], [data-cal-cell]'));
    if (!c) continue;
    const ds = c.dataset;
    if (ds.calSlot) return { date: ds.calSlot, min: snap(minOf(y - grab - c.getBoundingClientRect().top)), at: c };
    if (ds.calAllday) return { date: ds.calAllday, allDay: true, at: c };
    return { date: String(ds.calHead ?? ds.calCell), at: c };
  }
  return null;
}
