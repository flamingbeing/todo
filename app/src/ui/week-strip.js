// A list by day from today on (Upcoming, and a list's Agenda: screens/calendar.js): Overdue first (with Reschedule),
// then each day with its tasks (done ones after them when Display's Completed tasks is on) and an Add task row, more days drawn as the end comes near; over it the strip.
// The strip (#upcoming-strip, or the Agenda's): the month and year of the week shown with a caret, then the week as seven
// days: the weekday's letter over the day's number, today's in a filled accent circle, the day picked in a soft one. A
// swipe sideways goes a week on or back (not before this week); a tap on a day scrolls the list to it, and scrolling the
// list moves the pick. The month opens from the handle under the week: dragging it down grows the calendar under the
// finger, row by row, from the one week to six rows; dragging up shrinks it back; let go, it settles open or shut by
// distance and speed (a tap on the handle or the month title toggles; less motion: it just switches). Out, the month
// title is in the accent colour from the first pull (the caret turns up once open) and the weeks run on in a scroller from this week, with more drawn
// near the end (a year and more ahead), the title following the top row's month; past days are disabled; a day picked
// there closes the calendar and scrolls the list to it. A task dragged onto a day moves to it
// (row-drag.js reads data-drop-day); a long press on a day opens the quick add dated that day. The week starts on the
// day the setting says.
import { icon, drag, glide, spring, still, haptic } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { isTask, dayOrder } from '../tasks.js';
import { upcomingView, narrowTasks, sorter } from '../arrange.js';
import { dayKey, addDays, daysBetween, weekOf, weekdayName, dueOf, shortDate } from '../dates.js';
import { monthGrid, monthTitle } from '../dates-cal.js';
import { rowList, groupHead } from './row.js';
import { el, sheetHead } from '../screens/pick.js';
import { underBar } from './stick.js';

/** @typedef {import('../screens/views.js').Ctx} Ctx */
/** @typedef {import('../items.js').Task} Task */
/** @typedef {{ list: HTMLElement, days: () => number, more: (n: number) => void, tasks?: () => Task[] }} StripOptions */
/**
 * @typedef {{ list: HTMLElement, strip: HTMLElement, tasks: Task[], d: import('../tasks.js').Display, place: boolean, projectId: string,
 *   resched: (sec: HTMLElement, tasks: Task[]) => void }} DaysOptions
 */

const STEP = 28;
/** the open calendar: a week row's height (keep in step with .td-weeks-row in app.css), the letters row above the weeks,
 * the rows the open calendar shows, and the weeks drawn at a time (the first draw reaches a year and more ahead) */
const ROW = 48, HEAD = 20, ROWS = 6, CHUNK = 26;
/** how many days each list draws @type {WeakMap<HTMLElement, number>} */
const shown = new WeakMap();

/** @param {Ctx} ctx @param {DaysOptions} o */
export function drawDays(ctx, o) {
  const today = dayKey(), d = o.d, n = shown.get(o.list) ?? STEP;
  const v = upcomingView(narrowTasks(o.tasks, d, ctx.data().labels, today), today, n, sorter(d.sort, d.dir, dayOrder), d.completed), parts = [];
  o.list.toggleAttribute('data-sorted', d.sort !== 'manual');
  // (back from Upcoming's board or calendar)
  o.list.classList.remove('td-board');
  o.list.removeAttribute('data-swipe-own');
  delete o.list.dataset.grouped;
  if (v.overdue.length) {
    const g = document.createElement('section'); g.className = 'td-group';
    g.append(groupHead('Overdue'), rowList(v.overdue, ctx.rows({ place: o.place }), 'Overdue'));
    o.resched(g, v.overdue.map(l => l.task));
    parts.push(g);
  }
  for (const day of v.days) {
    const g = document.createElement('section'); g.className = 'td-group td-day'; g.dataset.day = day.key;
    // "Monday, 2 Nov • Today": an empty day's head is dimmed and roomier, about 70px (it stays, so a task can be dropped on it; a new task for
    // it comes from the + while the day is in sight, or a long press on the day in the strip)
    const n = daysBetween(today, day.key);
    const title = `${weekdayName(day.key)}, ${shortDate(day.key, today)}${n === 0 ? ' \u2022 Today' : n === 1 ? ' \u2022 Tomorrow' : ''}`;
    g.classList.toggle('is-empty', !day.lines.length);
    // (today's head in the text colour, the days after it dimmed: app.css)
    g.classList.toggle('is-today', n === 0);
    g.append(groupHead(title));
    if (day.lines.length) g.append(rowList(day.lines, ctx.rows({ place: o.place, own: day.key }), title));
    parts.push(g);
  }
  o.list.replaceChildren(...parts);
  const more = (/** @type {number} */ m) => { shown.set(o.list, Math.max(shown.get(o.list) ?? STEP, m)); drawDays(ctx, o); };
  drawStrip(ctx, o.strip, { list: o.list, days: () => shown.get(o.list) ?? STEP, more, tasks: () => o.tasks });
  // near the end of the days drawn: draw more
  const last = /** @type {HTMLElement | undefined} */ (parts.at(-3) ?? parts.at(-1));
  if (last && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); more(n + STEP); } });
    io.observe(last);
  }
}

const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** what the strip keeps between draws @type {WeakMap<HTMLElement, { week: string, pick: string, start: number, day: string, o: StripOptions, ctx: Ctx, draw: () => void }>} */
const state = new WeakMap();

/** @param {Ctx} ctx @param {HTMLElement} host @param {StripOptions} o */
export function drawStrip(ctx, host, o) {
  const today = dayKey(), start = Number(ctx.app.settings.get('weekStart') ?? 1);
  let s = state.get(host);
  if (!s || s.start !== start || s.day !== today) {
    const pick = s && s.pick >= today ? s.pick : today;
    s = { week: weekOf(pick, start), pick, start, day: today, o, ctx, draw: () => {} };
    state.set(host, s);
    build(host, s);
  }
  s.o = o; s.ctx = ctx;
  underBar(host);
  s.draw();
  foot(host);
}

/** where the strip ends while stuck, for the day heads to stick under it (--td-strip-foot on the page: a day's head
 * pins below the strip, not behind it); kept as the strip grows (the month calendar) @param {HTMLElement} host */
function foot(host) {
  const set = () => host.parentElement?.style.setProperty('--td-strip-foot', `${(parseFloat(host.style.top) || 0) + host.offsetHeight}px`);
  set();
  if (!feet.has(host)) { feet.add(host); new ResizeObserver(set).observe(host); }
}
/** the list-scroll listener each strip has, to drop on a rebuild @type {WeakMap<HTMLElement, AbortController>} */
const scrolls = new WeakMap();
/** strips whose foot is watched @type {WeakSet<HTMLElement>} */
const feet = new WeakSet();

/** the strip's parts, made once @param {HTMLElement} host @param {NonNullable<ReturnType<typeof state.get>>} s */
function build(host, s) {
  const top = el('div', 'td-strip-top');
  const month = /** @type {HTMLButtonElement} */ (el('button', 'td-month'));
  month.type = 'button';
  const monthName = el('span', 'td-month-name');
  const caret = icon(ICONS.chevronDown, { class: 'td-month-chevron' });
  month.append(monthName, caret);
  month.setAttribute('aria-expanded', 'false');
  top.append(month);
  const view = el('div', 'td-week-view');
  view.dataset.swipeOwn = '';
  const week = el('div', 'td-week');
  week.setAttribute('role', 'group');
  view.append(week);
  // the calendar: a clip (its height follows the finger) over the letters and a scroller of weeks, drawn from this week
  // while the calendar is open or moving
  const cal = el('div', 'td-wcal');
  cal.hidden = true;
  const letters = el('div', 'td-weeks-head');
  letters.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 7; i++) letters.append(el('span', '', LETTERS[(s.start + i) % 7]));
  const grid = el('div', 'td-weeks');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Weeks');
  cal.append(letters, grid);
  const handle = /** @type {HTMLButtonElement} */ (el('button', 'td-strip-handle'));
  handle.type = 'button';
  handle.setAttribute('aria-label', 'Show more weeks');
  handle.append(el('span', 'td-strip-grab'));
  host.replaceChildren(top, view, cal, handle);
  /** open: settled open (or going there); busy: the calendar is drawn (open, or moving between the two) */
  let open = false, busy = false;
  /** the week the scroller starts at, the weeks drawn, the week row's month shown in the title, the closed height */
  let first = '', rows = 0, topKey = '', baseH = 64;
  /** the settle now @type {{ stop: () => number, running: () => boolean, done: Promise<boolean> } | undefined} */
  let run;
  const full = HEAD + ROWS * ROW;
  const span = () => full - baseH;
  const setH = (/** @type {number} */ h) => { cal.style.height = `${h}px`; };
  const sync = () => { view.hidden = open || busy; cal.hidden = !(open || busy); month.toggleAttribute('data-out', open || busy); };

  /** draws weeks until n are there */
  const ensure = (/** @type {number} */ n) => {
    const today = s.day, parts = [];
    for (; rows < n; rows++) {
      const r = el('div', 'td-weeks-row');
      r.setAttribute('role', 'group');
      for (let i = 0; i < 7; i++) {
        const key = addDays(first, rows * 7 + i), b = /** @type {HTMLButtonElement} */ (el('button', 'td-wday td-wcell'));
        b.type = 'button'; b.dataset.day = key;
        if (key >= today) b.dataset.dropDay = key; else b.disabled = true;
        b.classList.toggle('is-today', key === today);
        b.setAttribute('aria-pressed', String(key === s.pick));
        if (key.endsWith('-01')) b.append(el('span', 'td-wcell-mon', MONTHS[+key.slice(5, 7) - 1].slice(0, 3)));
        b.append(el('span', 'td-sr', `${weekdayName(key)} `), el('span', 'td-wday-num', String(+key.slice(8))), el('span', 'td-sr', ` ${MONTHS[+key.slice(5, 7) - 1]}`));
        r.append(b);
      }
      parts.push(r);
    }
    grid.append(...parts);
  };
  /** the month the title shows: while the calendar is out, the top row's (or the pick, when that row has it) */
  const titleKey = () => (busy || open) && topKey ? topKey : s.pick >= s.week && s.pick <= addDays(s.week, 6) ? s.pick : s.week;
  const title = () => {
    monthName.textContent = monthTitle(titleKey());
    month.setAttribute('aria-label', `${monthName.textContent}, ${open ? 'close' : 'show'} the weeks`);
  };
  /** the weeks start at this week, the shown one at the top */
  const place = () => {
    first = weekOf(s.day, s.start);
    const at = daysBetween(first, s.week) / 7;
    ensure(at + 60);
    grid.scrollTop = at * ROW;
    topKey = s.pick >= s.week && s.pick <= addDays(s.week, 6) ? s.pick : s.week;
  };
  /** the calendar comes out at the week's height */
  const prep = () => {
    if (busy || open) return;
    baseH = view.offsetHeight || baseH;
    setH(baseH);
    busy = true; sync();
    place();
  };
  /** the calendar has landed: open at full height, or put away (the weeks are dropped) */
  const land = () => {
    run = undefined; busy = false;
    if (open) setH(full);
    else { cal.style.height = ''; grid.replaceChildren(); rows = 0; topKey = ''; }
    sync(); s.draw();
  };
  /** to open (or shut) from `from` px of growth, the finger's speed v (px/ms); less motion: a switch. Resolves once it lands @returns {Promise<void>} */
  const settle = (/** @type {boolean} */ want, /** @type {number} */ from, /** @type {number} */ v, /** @type {boolean} */ calm = false) => {
    open = want; s.draw();
    run?.stop();
    if (calm) { land(); return Promise.resolve(); }
    // (a live height, on purpose: the list below the calendar has to be pushed down or pulled up with it, which only
    // layout does, and one spring per settle is all that runs; the drag's own frames are the finger's)
    run = spring(x => setH(baseH + x), from, want ? span() : 0, v, { response: .15 });
    const mine = run;
    return mine.done.then(landed => { if (landed && run === mine) land(); });
  };
  /** a tap on the handle or the title */
  const toggle = () => {
    const want = !open;
    if (busy && run?.running()) { void settle(want, run.stop() , 0); return; }
    prep();
    void settle(want, open ? span() : 0, 0, still());
  };

  const count = () => {
    /** @type {Map<string, number>} */
    const by = new Map();
    for (const t of s.o.tasks?.() ?? s.ctx.data().tasks) { const d = isTask(t) && !t.done ? dueOf(t.due) : null; if (d) by.set(d.date, (by.get(d.date) ?? 0) + 1); }
    return by;
  };
  s.draw = () => {
    const today = s.day, by = count();
    title();
    month.setAttribute('aria-expanded', String(open));
    handle.setAttribute('aria-label', open ? 'Show one week' : 'Show more weeks');
    host.classList.toggle('is-open', open);
    sync();
    caret.classList.toggle('is-up', open);
    if (rows) {
      grid.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
      grid.querySelector(`[data-day="${s.pick}"]`)?.setAttribute('aria-pressed', 'true');
    }
    week.setAttribute('aria-label', `Week of ${+s.week.slice(8)} ${MONTHS[+s.week.slice(5, 7) - 1]}`);
    week.replaceChildren(...Array.from({ length: 7 }, (_, i) => {
      const key = addDays(s.week, i), n = by.get(key) ?? 0;
      const b = /** @type {HTMLButtonElement} */ (el('button', 'td-wday'));
      b.type = 'button';
      b.dataset.day = key;
      if (key >= today) b.dataset.dropDay = key; else b.disabled = true;
      b.classList.toggle('is-today', key === today);
      b.setAttribute('aria-pressed', String(key === s.pick));
      // (read as "Monday 26 October, 2 tasks": the letter is for the eye)
      const dot = el('span', 'td-wday-dot'), letter = el('span', 'td-wday-letter', LETTERS[new Date(`${key}T12:00:00Z`).getUTCDay()]);
      dot.hidden = true;
      letter.setAttribute('aria-hidden', 'true');
      b.append(letter, el('span', 'td-sr', `${weekdayName(key)} `), el('span', 'td-wday-num', String(+key.slice(8))),
        el('span', 'td-sr', ` ${MONTHS[+key.slice(5, 7) - 1]}${n ? `, ${n} task${n === 1 ? '' : 's'}` : ''}`), dot);
      b.addEventListener('click', () => go(key, true));
      return b;
    }));
  };

  /** picks a day: its week shows, and (asked) the list scrolls to it @param {string} key @param {boolean} scroll */
  const go = (key, scroll) => {
    if (key < s.day) key = s.day;
    s.pick = key; s.week = weekOf(key, s.start);
    s.draw();
    if (scroll) toDay(key);
  };
  const scroller = () => { let n = s.o.list.parentElement; while (n && n !== document.body) { const y = getComputedStyle(n).overflowY; if ((y === 'auto' || y === 'scroll') && n.scrollHeight > n.clientHeight) return n; n = n.parentElement; } return /** @type {HTMLElement} */ (document.scrollingElement ?? document.documentElement); };
  /** @param {string} key */
  const toDay = key => {
    const need = daysBetween(s.day, key) + 7;
    if (need > s.o.days()) s.o.more(need + 14);
    const sec = /** @type {HTMLElement | null} */ (s.o.list.querySelector(`[data-day="${key}"]`));
    if (!sec) return;
    const sc = scroller(), base = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
    const off = base + (parseFloat(host.style.top) || 0) + host.offsetHeight;   // (where the strip's foot is once it sticks)
    following = performance.now() + 900;
    sc.scrollTo({ top: sc.scrollTop + sec.getBoundingClientRect().top - off - 4, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  // the list scrolled by hand: the first day in sight is picked (not while a tap's own scroll runs)
  let following = 0, queued = false;
  const onScroll = (/** @type {Event} */ e) => {
    if (host.contains(/** @type {Node} */ (e.target))) return;   // (the calendar's own scroll is its own)
    if (queued || performance.now() < following || host.closest('[hidden]')) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const line = host.getBoundingClientRect().bottom + 8;
      const days = /** @type {HTMLElement[]} */ ([...s.o.list.querySelectorAll(':scope > section[data-day]')]);
      const seen = days.find(d => d.getBoundingClientRect().bottom > line);
      const key = seen?.dataset.day;
      if (key && key !== s.pick) go(key, false);
    });
  };
  // (one listener per build: a rebuild, for a new day or week start, drops the last one)
  scrolls.get(host)?.abort();
  const own = new AbortController();
  scrolls.set(host, own);
  addEventListener('scroll', onScroll, { passive: true, capture: true, signal: own.signal });

  month.addEventListener('click', toggle);
  handle.addEventListener('click', toggle);
  // a day in the calendar: it closes, and the list scrolls to the day
  grid.addEventListener('click', e => {
    const b = /** @type {HTMLButtonElement | null} */ (/** @type {Element} */ (e.target).closest('.td-wcell'));
    if (!b || b.disabled) return;
    const key = String(b.dataset.day);
    void settle(false, run?.running() ? run.stop() : span(), 0, still()).then(() => go(key, true));
  });
  // the weeks scroll: the title follows the top row, more weeks are drawn near the end
  grid.addEventListener('scroll', () => {
    const i = Math.max(0, Math.round(grid.scrollTop / ROW)), a = addDays(first, i * 7);
    topKey = s.pick >= a && s.pick <= addDays(a, 6) ? s.pick : addDays(a, 3);
    title();
    if (grid.scrollTop + grid.clientHeight > grid.scrollHeight - 13 * ROW) ensure(rows + CHUNK);
  }, { passive: true });
  // the handle: dragged down, the calendar grows under the finger (from the one week to six rows); up, it shrinks;
  // let go, it settles by distance and speed
  let moved = false;
  drag(handle, { axis: 'y', mouse: true, name: 'cards',
    start: () => { moved = false; if (busy && run?.running()) { moved = true; return run.stop(); } return open ? span() : 0; },
    bounds: () => [0, span()],
    move: d => { moved = true; if (!busy) prep(); setH(baseH + d); },
    end: (d, v) => {
      if (!moved) return;
      const want = Math.abs(v) > 0.3 ? v > 0 : d > span() / 2;
      if (want !== open) haptic();
      void settle(want, d, v, still());
    } });

  // a long press on a day (today on): the quick add, dated that day; the tap that ends it does not also pick the day
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let hold;
  let x0 = 0, y0 = 0, held = false;
  const letGo = () => { clearTimeout(hold); hold = undefined; };
  week.addEventListener('pointerdown', e => {
    held = false; letGo();
    const b = /** @type {HTMLButtonElement | null} */ (/** @type {Element} */ (e.target).closest('.td-wday'));
    if (!e.isPrimary || e.button > 0 || !b || b.disabled || !s.ctx.canWrite()) return;
    x0 = e.clientX; y0 = e.clientY;
    hold = setTimeout(() => { hold = undefined; held = true; haptic('long'); s.ctx.openQuickAdd({ due: { date: String(b.dataset.day) } }); }, 500);
  });
  week.addEventListener('pointermove', e => { if (hold && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) letGo(); });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) week.addEventListener(t, letGo);
  week.addEventListener('click', e => { if (held && e.isTrusted) { held = false; e.preventDefault(); e.stopPropagation(); } }, true);
  week.addEventListener('contextmenu', e => e.preventDefault());

  // a swipe: the week follows the finger, then glides out and the next (or last) one glides in
  drag(view, { axis: 'x', mouse: true, name: 'cards',
    bounds: () => (s.week <= weekOf(s.day, s.start) ? [0, Infinity] : [-Infinity, Infinity]),
    move: x => { week.style.transform = `translateX(${x}px)`; },
    end: (x, v) => {
      const w = view.clientWidth || 320, back = x > 0, can = !back || s.week > weekOf(s.day, s.start);
      if (!can || (Math.abs(x) < w / 4 && Math.abs(v) < 0.3)) { void glide([[week, k => ({ transform: `translateX(${k}px)` })]], x, 0, v).done.then(() => { week.style.transform = ''; }); return; }
      haptic();
      const to = back ? w : -w;
      void glide([[week, k => ({ transform: `translateX(${k}px)` })]], x, to, v).done.then(() => {
        s.week = addDays(s.week, back ? -7 : 7);
        s.pick = s.week < s.day ? s.day : s.week;
        s.draw();
        toDay(s.pick);
        return glide([[week, k => ({ transform: `translateX(${k}px)` })]], -to, 0).done;
      }).then(() => { week.style.transform = ''; });
    } });
}

/** the month sheet: a month's days in weeks, a tap on one (from min: the strip's today, a calendar's any) picks it
 * @param {{ pick: string, day: string, start: number, min?: string }} s @param {(key: string) => void} done */
export function pickMonth(s, done) {
  const min = s.min ?? s.day;
  const d = /** @type {HTMLDialogElement} */ (document.getElementById('pick-sheet'));
  const body = /** @type {HTMLElement} */ (d.querySelector('[data-fill]'));
  let month = s.pick.slice(0, 7);
  const draw = () => {
    const nav = el('div', 'td-mon-nav');
    const name = el('h3', 'td-mon-name', monthTitle(`${month}-01`));
    const step = (/** @type {number} */ n, /** @type {string} */ label, /** @type {import('app-ui/icons/lucide.js').IconNodes} */ ic) => {
      const b = /** @type {HTMLButtonElement} */ (el('button', 'td-icon-btn'));
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.append(icon(ic));
      const [y, m] = month.split('-').map(Number), next = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
      b.disabled = next < min.slice(0, 7);
      b.addEventListener('click', () => { month = next; draw(); });
      return b;
    };
    nav.append(name, step(-1, 'Last month', MORE.chevronLeft ?? ICONS.chevronRight), step(1, 'Next month', ICONS.chevronRight));
    const grid = el('div', 'td-mon');
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', monthTitle(`${month}-01`));
    const head = el('div', 'td-mon-row td-mon-head');
    head.setAttribute('role', 'row');
    for (let i = 0; i < 7; i++) { const c = el('span', 'td-mon-letter', LETTERS[(s.start + i) % 7]); c.setAttribute('role', 'columnheader'); head.append(c); }
    grid.append(head);
    for (const wk of monthGrid(month, s.start)) {
      const r = el('div', 'td-mon-row');
      r.setAttribute('role', 'row');
      for (const key of wk) {
        const cell = el('span', '');
        cell.setAttribute('role', 'gridcell');
        if (key.slice(0, 7) === month) {
          const b = /** @type {HTMLButtonElement} */ (el('button', 'td-mon-day', String(+key.slice(8))));
          b.type = 'button';
          b.disabled = key < min;
          b.classList.toggle('is-today', key === s.day);
          b.setAttribute('aria-pressed', String(key === s.pick));
          b.prepend(el('span', 'td-sr', `${weekdayName(key)} `));
          b.append(el('span', 'td-sr', ` ${MONTHS[+key.slice(5, 7) - 1]}`));
          b.addEventListener('click', () => { d.close(); done(key); });
          cell.append(b);
        }
        r.append(cell);
      }
      grid.append(r);
    }
    body.replaceChildren(sheetHead('Pick a day', d), nav, grid);
  };
  draw();
  if (!d.open) d.showModal();
  /** @type {HTMLElement | null} */ (body.querySelector('.td-mon-day[aria-pressed="true"]'))?.focus({ preventScroll: true });
}
