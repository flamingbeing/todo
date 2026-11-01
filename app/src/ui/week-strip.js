// A list by day from today on (Upcoming, and a list's Agenda: screens/calendar.js): Overdue first (with Reschedule),
// then each day with its tasks and an Add task row, more days drawn as the end comes near; over it the strip.
// The strip (#upcoming-strip, or the Agenda's): the month of the week shown (a tap opens the month to pick a day) and Today, then
// the week as seven days: the weekday's letter over the day's number, today's in the accent, the day picked
// underlined, a dot under a day with tasks. A swipe sideways goes a week on or back (not before this week); a tap on
// a day scrolls the list to it, and scrolling the list moves the pick. A task dragged onto a day moves to it
// (row-drag.js reads data-drop-day). The week starts on the day the setting says.
import { icon, drag, glide, haptic } from '@core/ui';
import { ICONS } from '../icons.js';
import { isTask, dayOrder } from '../tasks.js';
import { upcomingView, narrowTasks, sorter } from '../arrange.js';
import { dayKey, addDays, daysBetween, weekOf, monthGrid, monthTitle, weekdayName, dueOf, dayTitle } from '../dates.js';
import { rowList, addRow, groupHead } from './row.js';
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
/** how many days each list draws @type {WeakMap<HTMLElement, number>} */
const shown = new WeakMap();

/** @param {Ctx} ctx @param {DaysOptions} o */
export function drawDays(ctx, o) {
  const today = dayKey(), d = o.d, n = shown.get(o.list) ?? STEP;
  const v = upcomingView(narrowTasks(o.tasks, d, ctx.data().labels, today), today, n, sorter(d.sort, d.dir, dayOrder)), parts = [];
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
    const title = dayTitle(day.key, today);
    g.append(groupHead(title));
    if (day.lines.length) g.append(rowList(day.lines, ctx.rows({ place: o.place, own: day.key }), title));
    if (ctx.canWrite()) g.append(addRow('Add task', () => ctx.openQuickAdd({ projectId: o.projectId, due: { date: day.key } })));
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
}

/** the strip's parts, made once @param {HTMLElement} host @param {NonNullable<ReturnType<typeof state.get>>} s */
function build(host, s) {
  const top = el('div', 'td-strip-top');
  const month = /** @type {HTMLButtonElement} */ (el('button', 'td-month'));
  month.type = 'button';
  month.setAttribute('aria-haspopup', 'dialog');
  const monthName = el('span', 'td-month-name');
  month.append(monthName, icon(ICONS.chevronDown, { class: 'td-month-chevron' }));
  const todayBtn = /** @type {HTMLButtonElement} */ (el('button', 'td-text-btn td-strip-today', 'Today'));
  todayBtn.type = 'button';
  top.append(month, todayBtn);
  const view = el('div', 'td-week-view');
  view.dataset.swipeOwn = '';
  const week = el('div', 'td-week');
  week.setAttribute('role', 'group');
  view.append(week);
  host.replaceChildren(top, view);

  const count = () => {
    /** @type {Map<string, number>} */
    const by = new Map();
    for (const t of s.o.tasks?.() ?? s.ctx.data().tasks) { const d = isTask(t) && !t.done ? dueOf(t.due) : null; if (d) by.set(d.date, (by.get(d.date) ?? 0) + 1); }
    return by;
  };
  s.draw = () => {
    const today = s.day, by = count();
    monthName.textContent = monthTitle(s.pick >= s.week && s.pick <= addDays(s.week, 6) ? s.pick : s.week).replace(` ${today.slice(0, 4)}`, '');
    month.setAttribute('aria-label', `${monthName.textContent}, pick a day`);
    todayBtn.hidden = s.pick === today && s.week === weekOf(today, s.start);
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
      dot.hidden = !n || key < today;
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
  const onScroll = () => {
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
  addEventListener('scroll', onScroll, { passive: true, capture: true });

  month.addEventListener('click', () => pickMonth(s, key => go(key, true)));
  todayBtn.addEventListener('click', () => go(s.day, true));

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
    nav.append(name, step(-1, 'Last month', ICONS.chevronLeft ?? ICONS.chevronRight), step(1, 'Next month', ICONS.chevronRight));
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
