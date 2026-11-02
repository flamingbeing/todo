// The date sheet (#schedule-sheet): a plain "Date" title (left, under the grab handle) and a small red Save pill floating at
// the bottom right; a pill field with a calendar icon that reads typed dates as they are typed ("fri 5pm", "every
// monday": parse.js) and shows the date short ("11 Nov", "every workday"); the shortcut rows (Today, Tomorrow, This
// weekend, Next week, and No date once there is one), each with its weekday ("Mon (9 Nov)" for Next week); a month
// calendar running on for half a year, with a dot under the days that have tasks, the chosen day's "Mon 4 Nov · 5 tasks
// due" and a bar of its tasks in their projects' colours; then one hairline panel of compact rows: Add time, Repeat (its
// menu of ready rules, and Custom: based on the scheduled or the completed date, every N days, weeks, months or years,
// on which weekdays, and when it ends). A shortcut row sets the date at once; a day in the calendar, a time or a repeat
// waits for Save. The sheet dismisses by swipe or scrim, changing nothing. With dateOnly (a deadline) the Add time and
// Repeat rows are left out. A task whose duration is given gets the Duration row (None, 15 min to 3 h, or minutes
// typed), which Save hands back, unless the caller keeps it in its own menu (durationRow: false).
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { INBOX } from '../items.js';
import { dayKey, addDays, weekdayOf, timeText, dueOf, isDay, minutesText, dateTone } from '../dates.js';
import { MORE } from '../icons-more.js';
import { colorHex } from '../colors.js';
import { parse } from '../parse.js';
import { dateLibs, describe, DAY_NAMES, presets, firstDay, buildRule, ruleChoices } from '../recur.js';
import { openMenu } from '../ui/menu.js';
import { el } from './pick.js';

/** @typedef {import('../dates.js').Due} Due */
/** @typedef {{ data?: import('../items.js').Data, weekStart?: number, dateOnly?: boolean, duration?: number | null, durationRow?: boolean, clearable?: boolean }} ScheduleOptions
 * dateOnly: the Deadline sheet, a day and nothing else (no time, no repeat); duration: the task's (null: none), for the Duration row
 * (durationRow false: handed back as it was, no row); clearable: No date even with no date given (several tasks, some dated) */
/** the Duration menu's lengths, in minutes */
export const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKS = 26;
const sheet = () => /** @type {HTMLDialogElement} */ (document.getElementById('schedule-sheet'));
/** @type {Awaited<ReturnType<typeof dateLibs>> | null} */
let libs = null;

/** @param {string} key "Mon 4 Nov" */
const dayLong = key => `${DAYS[weekdayOf(key)]} ${+key.slice(8, 10)} ${MONTHS[+key.slice(5, 7) - 1]}`;
/** @param {string} key "11 Nov" */
const dayShort = key => `${+key.slice(8, 10)} ${MONTHS[+key.slice(5, 7) - 1]}`;
/** @param {string} label @param {string} [cls] */
const textButton = (label, cls = '') => { const b = /** @type {HTMLButtonElement} */ (el('button', cls, label)); b.type = 'button'; return b; };

/**
 * Opens the scheduler for a date (null: none yet); done gets the new date, or null for "No date", and the duration
 * (with o.duration). Swipe, scrim or Esc changes nothing.
 * @param {Due | null | undefined} due @param {(due: Due | null, duration?: number | null) => unknown} done @param {ScheduleOptions} [o]
 */
export function pickDate(due, done, o = {}) {
  const d = sheet(), body = /** @type {HTMLElement} */ (d.querySelector('[data-fill]')), today = dayKey();
  const tasks = (o.data?.tasks ?? []).filter(t => !t.done && dueOf(t.due));
  const projects = o.data?.projects ?? [];
  /** the date as it stands (Done keeps it) */
  let pending = /** @type {Due | null} */ (dueOf(due) ? { ...due } : null);
  /** typed words that read as a date */
  let typed = /** @type {Due | null} */ (null);
  const timed = !o.dateOnly, hasDur = timed && o.duration !== undefined;
  let dur = o.duration ?? null;
  const finish = (/** @type {Due | null} */ v) => { d.close(); void done(v && o.dateOnly ? { date: v.date } : v, ...(hasDur ? [dur] : [])); };

  // ---- the head: the title, and Save floating over the content
  const head = el('div', 'td-sheet-head td-sched-head');
  const h = el('h2', 'td-sheet-title td-sched-title', o.dateOnly ? 'Deadline' : 'Date');
  h.id = 'schedule-sheet-title';
  d.setAttribute('aria-labelledby', h.id);
  head.append(h);
  const ok = textButton('Save', 'td-sched-save');
  ok.addEventListener('click', () => finish(typed ?? pending));
  const saveBar = el('div', 'td-sched-save-bar');
  saveBar.append(ok);

  // ---- the text field
  const words = Object.assign(document.createElement('input'), { type: 'text', className: 'td-sched-text', autocomplete: 'off', enterKeyHint: 'done',
    placeholder: 'Type a date' });
  words.setAttribute('aria-label', 'Type a date');
  const hint = el('p', 'td-sched-hint');
  hint.setAttribute('aria-live', 'polite');
  const read = () => {
    typed = null;
    const text = words.value.trim();
    if (!text || text === shownWords()) { hint.textContent = ''; return; }
    const p = parse(text, { now: new Date(), chrono: libs?.chrono ?? null, RRule: libs?.RRule ?? null });
    typed = p.due;
    hint.textContent = p.due ? sayDue(p.due) : p.noDate ? 'No date' : 'Not a date yet';
    if (p.due) { pick(p.due.date, false); }
  };
  words.addEventListener('input', read);
  words.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (typed || words.value.trim()) finish(typed ?? pending); } });
  /** what the field shows for the date as it stands */
  const shownWords = () => (pending ? (pending.rrule && pending.string ? pending.string : `${dayShort(pending.date)}${pending.time ? ` ${timeText(pending.time)}` : ''}`) : '');
  /** @param {Due} v */
  const sayDue = v => `${dayLong(v.date)}${v.time ? ` ${timeText(v.time)}` : ''}${v.rrule ? ` · ${describe({ rrule: v.rrule, fromDone: v.fromDone })}` : ''}`;

  // ---- the shortcut rows
  const wd = weekdayOf(today);
  // (on Saturday or Sunday, This weekend is the next Saturday: Today already names today)
  const sat = addDays(today, (6 - wd + 7) % 7 || 7);
  const mon = addDays(today, ((8 - wd) % 7) || 7);
  /** @type {[string, import('app-ui/icons/lucide.js').IconNodes, string, string | null][]} */
  const quick = [
    ['Today', ICONS.calendar, 'today', today], ['Tomorrow', MORE.sun, 'tomorrow', addDays(today, 1)],
    ['This weekend', MORE.sofa, 'weekend', sat], ['Next week', MORE.calendarArrowUp, 'week', mon],
    // (No date only once there is a date to take off)
    ...(dueOf(due) || o.clearable ? [/** @type {[string, import('app-ui/icons/lucide.js').IconNodes, string, string | null]} */ ([o.dateOnly ? 'No deadline' : 'No date', MORE.circleSlash, 'none', null])] : []),
  ];
  const rows = el('ul', 'td-sched-quick');
  rows.setAttribute('aria-label', 'Quick dates');
  for (const [label, ic, tone, date] of quick) {
    const li = el('li', ''), b = /** @type {HTMLButtonElement} */ (el('button', 'td-choice td-sched-row'));
    b.type = 'button';
    const i = icon(ic, { class: 'td-choice-icon' });
    i.dataset.tone = tone;
    b.append(i, el('span', 'td-choice-label', label));
    // the weekday at the right; Next week also says its date: "Mon (9 Nov)"
    if (date) b.append(el('span', 'td-choice-side', `${DAYS[weekdayOf(date)]}${label === 'Next week' ? ` (${dayShort(date)})` : ''}`));
    b.addEventListener('click', () => finish(date ? { ...(pending ?? {}), date } : null));
    li.append(b);
    rows.append(li);
  }

  // ---- the calendar
  const weekStart = o.weekStart ?? 1;
  const cal = el('div', 'td-cal');
  const heads = el('div', 'td-cal-days');
  heads.setAttribute('aria-hidden', 'true');
  for (let k = 0; k < 7; k++) heads.append(el('span', '', DAYS[(weekStart + k) % 7].slice(0, 1)));
  const sum = el('div', 'td-cal-sum');
  const sumText = el('p', 'td-cal-sum-text'), bar = el('div', 'td-cal-bar');
  sumText.setAttribute('aria-live', 'polite');
  sum.append(sumText, bar);
  const grid = el('div', 'td-cal-grid');
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Calendar');
  /** tasks by day */
  const busy = new Map();
  for (const t of tasks) { const k = /** @type {Due} */ (t.due).date; (busy.get(k) ?? busy.set(k, []).get(k)).push(t); }
  const first = addDays(today, -((weekdayOf(today) - weekStart + 7) % 7));
  /** @type {Map<string, HTMLButtonElement>} */
  const cells = new Map();
  for (let w = 0; w < WEEKS; w++) {
    const row = el('div', 'td-cal-week');
    row.setAttribute('role', 'row');
    for (let k = 0; k < 7; k++) {
      const key = addDays(first, w * 7 + k), n = busy.get(key)?.length ?? 0;
      const b = /** @type {HTMLButtonElement} */ (el('button', 'td-cal-day'));
      b.type = 'button';
      b.setAttribute('role', 'gridcell');
      b.dataset.day = key;
      if (key < today) b.classList.add('is-past');
      if (key === today) b.classList.add('is-today');
      if (+key.slice(8) === 1) b.append(el('span', 'td-cal-month', MONTHS[+key.slice(5, 7) - 1]), ' ');
      b.append(el('span', 'td-cal-num', String(+key.slice(8))));
      if (n) b.append(el('span', 'td-cal-dot'));
      // (the name starts as the cell reads: "Dec 1" on a month's first day)
      const said = +key.slice(8) === 1 ? `${MONTHS[+key.slice(5, 7) - 1]} 1, ${DAYS[weekdayOf(key)]}` : dayLong(key);
      b.setAttribute('aria-label', `${said}${n ? `, ${n} task${n === 1 ? '' : 's'}` : ''}`);
      b.addEventListener('click', () => { if (key >= today) { typed = null; words.value = ''; hint.textContent = ''; pick(key, true); } });
      cells.set(key, b);
      row.append(b);
    }
    grid.append(row);
  }
  cal.append(heads, sum, grid);

  /** the day chosen: marked in the calendar, its summary above @param {string | null} key @param {boolean} set it becomes the pending date */
  const pick = (key, set) => {
    for (const c of grid.querySelectorAll('[aria-selected="true"]')) c.setAttribute('aria-selected', 'false');
    const shown = key ?? today;
    const cell = key ? cells.get(key) : null;
    // (filled in its date's colour: green today, then tomorrow's and this week's; later days the accent)
    if (cell) { cell.setAttribute('aria-selected', 'true'); cell.dataset.tone = dateTone({ date: /** @type {string} */ (key) }, today, '00:00'); }
    if (set && key) {
      pending = { ...(pending ?? {}), date: key };
      if (pending.rrule && libs) pending.date = firstDay(pending.rrule, key, libs.RRule) ?? key;
      words.value = shownWords();
      drawRows();
    }
    const list = busy.get(shown) ?? [];
    sumText.textContent = `${dayLong(shown)} · ${list.length ? `${list.length} task${list.length === 1 ? '' : 's'} due` : 'No tasks'}`;
    // the bar: a segment per project, as long as its share
    /** @type {Map<string, number>} */
    const by = new Map();
    for (const t of list) { const pid = t.projectId || INBOX; by.set(pid, (by.get(pid) ?? 0) + 1); }
    bar.style.width = `${Math.min(100, list.length * 12)}%`;
    bar.replaceChildren(...[...by].map(([pid, n]) => {
      const s = el('span', '');
      s.style.flexGrow = String(n);
      s.style.background = pid === INBOX ? 'var(--td-p3)' : colorHex(projects.find(p => p.id === pid)?.color);
      return s;
    }));
  };

  // ---- time and repeat
  const more = el('ul', 'td-sched-more');
  const timeLi = el('li', ''), repeatLi = el('li', '');
  const timeRow = el('label', 'td-choice td-sched-row td-sched-time');
  const timeIn = Object.assign(document.createElement('input'), { type: 'time', className: 'td-sched-time-in' });
  timeIn.setAttribute('aria-label', 'Time');
  const timeSide = el('span', 'td-choice-side');
  const timeLabel = el('span', 'td-choice-label', 'Add time');
  timeRow.append(icon(MORE.clock, { class: 'td-choice-icon' }), timeLabel, timeSide, timeIn);
  timeIn.addEventListener('change', () => {
    pending = { ...(pending ?? { date: today }) };
    if (timeIn.value) pending.time = timeIn.value; else delete pending.time;
    words.value = shownWords(); typed = null; hint.textContent = '';
    pick(pending.date, false); drawRows();
  });
  const timeX = textButton('', 'td-sched-x');
  timeX.setAttribute('aria-label', 'Clear the time');
  timeX.append(icon(MORE.x));
  timeX.addEventListener('click', () => { if (pending) { delete pending.time; timeIn.value = ''; words.value = shownWords(); drawRows(); } });
  timeLi.append(timeRow, timeX);
  const repeatRow = /** @type {HTMLButtonElement} */ (el('button', 'td-choice td-sched-row'));
  repeatRow.type = 'button';
  const repeatSide = el('span', 'td-choice-side');
  repeatRow.append(icon(ICONS.repeat, { class: 'td-choice-icon' }), el('span', 'td-choice-label', 'Repeat'), repeatSide);
  repeatRow.setAttribute('aria-haspopup', 'menu');
  repeatLi.append(repeatRow);
  // the duration: a menu of lengths, or Custom's minutes typed in a row under it
  const durLi = el('li', ''), durRow = /** @type {HTMLButtonElement} */ (el('button', 'td-choice td-sched-row'));
  durRow.type = 'button';
  durRow.setAttribute('aria-haspopup', 'menu');
  const durSide = el('span', 'td-choice-side');
  durRow.append(icon(MORE.hourglass, { class: 'td-choice-icon' }), el('span', 'td-choice-label', 'Duration'), durSide);
  durLi.append(durRow);
  const minLi = el('li', 'td-sched-min');
  const minIn = Object.assign(document.createElement('input'), { type: 'number', min: '1', max: '1440', inputMode: 'numeric', className: 'td-sched-min-in', placeholder: '50' });
  minIn.id = 'td-sched-min';
  const minLabel = el('label', 'td-choice-label', 'Minutes');
  minLabel.setAttribute('for', minIn.id);
  minLi.append(minLabel, minIn);
  minLi.hidden = true;
  minIn.addEventListener('input', () => { const n = Math.round(+minIn.value); dur = n >= 1 && n <= 1440 ? n : null; drawRows(); });
  durRow.addEventListener('click', () => openMenu(durRow, [
    ...[null, ...DURATIONS].map(n => ({ label: n ? minutesText(n) : 'None', checked: dur === n, run: () => { dur = n; minLi.hidden = true; drawRows(); } })),
    { label: 'Custom', checked: !!dur && !DURATIONS.includes(dur), run: () => { minLi.hidden = false; minIn.value = dur ? String(dur) : ''; minIn.focus(); } },
  ], { label: 'Duration' }));
  more.append(timeLi, ...(hasDur && o.durationRow !== false ? [durLi, minLi] : []), repeatLi);
  /** a rule set from the menu or the custom screen @param {string | null} rrule @param {string} [label] @param {boolean} [fromDone] */
  const setRule = (rrule, label = '', fromDone = false) => {
    const day = pending?.date ?? today;
    if (!rrule) { if (pending) { delete pending.rrule; delete pending.string; delete pending.fromDone; } }
    else {
      pending = { ...(pending ?? { date: day }), rrule, string: label.toLowerCase() };
      if (fromDone) pending.fromDone = true; else delete pending.fromDone;
      if (libs) pending.date = firstDay(rrule, day, libs.RRule) ?? day;
    }
    typed = null; hint.textContent = '';
    words.value = shownWords();
    pick(pending?.date ?? null, false); drawRows();
  };
  repeatRow.addEventListener('click', () => {
    const day = pending?.date ?? today;
    openMenu(repeatRow, [
      ...presets(day).map(p => ({ label: p.label, checked: pending?.rrule === p.rrule, run: () => setRule(p.rrule, p.label) })),
      { label: 'Custom', checked: !!pending?.rrule && !presets(day).some(p => p.rrule === pending?.rrule), run: () => custom() },
      ...(pending?.rrule ? [null, { label: 'No repeat', run: () => setRule(null) }] : []),
    ], { label: 'Repeat' });
  });
  const drawRows = () => {
    // (a value only once set: no "None", no chevron)
    timeSide.textContent = pending?.time ? timeText(pending.time) : '';
    timeIn.value = pending?.time ?? '';
    timeX.hidden = !pending?.time;
    repeatSide.textContent = pending?.rrule ? describe({ rrule: pending.rrule, fromDone: pending.fromDone }) : '';
    durSide.textContent = dur ? minutesText(dur) : '';
  };

  // ---- the custom repeat screen
  const custom = () => {
    const c = pending?.rrule ? ruleChoices(pending.rrule) : { unit: /** @type {'week'} */ ('week'), every: 1, days: [weekdayOf(pending?.date ?? today)], until: null };
    let fromDone = !!pending?.fromDone;
    const page = el('div', 'td-custom');
    const top = el('div', 'td-sheet-head td-sched-head');
    const back = textButton('', 'td-text-btn td-back-btn');
    back.append(icon(MORE.chevronLeft), el('span', '', 'Date'));
    back.addEventListener('click', () => { body.replaceChildren(...main); });
    const ht = el('h2', 'td-sheet-title', 'Custom repeat');
    const save = textButton('Save', 'td-text-btn td-text-btn-strong');
    top.append(back, ht, save);
    /** @param {string} title */
    const group = title => el('h3', 'td-group-label', title);
    /** a card of rows with one ticked @param {string} label @param {[string, boolean][]} items @param {(i: number) => void} on */
    const ticks = (label, items, on) => {
      const ul = el('ul', 'td-card td-choices');
      ul.setAttribute('role', 'radiogroup');
      ul.setAttribute('aria-label', label);
      const draw = () => ul.replaceChildren(...items.map(([text, onNow], i) => {
        const li = el('li', ''), b = /** @type {HTMLButtonElement} */ (el('button', 'td-choice'));
        li.setAttribute('role', 'none');   // (a radio group's rows, not a list's)
        b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(onNow));
        b.append(el('span', 'td-choice-label', text));
        if (onNow) b.append(icon(ICONS.check, { class: 'td-choice-check' }));
        b.addEventListener('click', () => { items.forEach((x, k) => { x[1] = k === i; }); on(i); draw(); });
        li.append(b);
        return li;
      }));
      draw();
      return ul;
    };
    const basis = ticks('Based on', [['Scheduled date', !fromDone], ['Completed date', fromDone]], i => { fromDone = i === 1; });
    // every N units
    const everyCard = el('div', 'td-card td-custom-every');
    const n = Object.assign(document.createElement('input'), { type: 'number', min: '1', max: '999', value: String(c.every), inputMode: 'numeric' });
    n.setAttribute('aria-label', 'Every how many');
    const unit = document.createElement('select');
    unit.setAttribute('aria-label', 'Unit');
    for (const u of ['day', 'week', 'month', 'year']) unit.add(new Option(`${u}${c.every === 1 ? '' : 's'}`, u));
    unit.value = c.unit;
    n.addEventListener('input', () => { for (const op of unit.options) op.text = `${op.value}${+n.value === 1 ? '' : 's'}`; });
    everyCard.append(el('span', 'td-custom-every-label', 'Every'), n, unit);
    // on these weekdays
    const onLabel = group('On');
    const week = el('div', 'td-card td-weekdays');
    week.setAttribute('role', 'group');
    week.setAttribute('aria-label', 'On these days');
    const days = new Set(c.days);
    for (let k = 0; k < 7; k++) {
      const wdN = (weekStart + k) % 7, b = textButton(DAYS[wdN].slice(0, 1), 'td-weekday');
      b.setAttribute('aria-label', DAY_NAMES[wdN]);
      b.setAttribute('aria-pressed', String(days.has(wdN)));
      b.addEventListener('click', () => { if (days.has(wdN)) days.delete(wdN); else days.add(wdN); b.setAttribute('aria-pressed', String(days.has(wdN))); });
      week.append(b);
    }
    const showWeek = () => { onLabel.hidden = week.hidden = unit.value !== 'week'; };
    unit.addEventListener('change', showWeek);
    showWeek();
    // ends
    let until = c.until;
    const untilIn = Object.assign(document.createElement('input'), { type: 'date', className: 'td-custom-until', value: until ?? addDays(pending?.date ?? today, 30) });
    untilIn.setAttribute('aria-label', 'Ends on');
    const ends = ticks('Ends', [['Never', !until], ['On date', !!until]], i => { until = i === 1 ? untilIn.value : null; untilIn.hidden = i === 0; });
    untilIn.hidden = !until;
    untilIn.addEventListener('change', () => { until = untilIn.value || null; });
    save.addEventListener('click', () => {
      const every = Math.max(1, Math.min(999, Math.round(+n.value || 1)));
      const u = /** @type {'day' | 'week' | 'month' | 'year'} */ (unit.value);
      const rule = buildRule({ unit: u, every, days: u === 'week' ? [...days] : [], until: until && isDay(until) ? until : null });
      body.replaceChildren(...main);
      setRule(rule, describe({ rrule: rule }), fromDone);
    });
    page.append(group('Based on'), basis, everyCard, onLabel, week, group('Ends'), ends, untilIn);
    body.replaceChildren(top, page);
    save.focus();
  };

  const field = el('div', 'td-sched-field');
  const pill = el('div', 'td-sched-pill');
  pill.append(icon(ICONS.calendar, { class: 'td-sched-pill-icon' }), words);
  field.append(pill, hint);
  const main = o.dateOnly ? [head, field, rows, cal, saveBar] : [head, field, rows, cal, more, saveBar];
  body.replaceChildren(...main);
  words.value = shownWords();
  drawRows();
  pick(pending?.date ?? null, false);
  if (!d.open) d.showModal();
  // the chosen day (or today) in view
  const at = cells.get(pending?.date ?? today);
  if (at) grid.scrollTop = Math.max(0, /** @type {HTMLElement} */ (at.parentElement).offsetTop - grid.offsetTop);
  if (!libs) void dateLibs().then(l => { libs = l; if (words.value.trim() && words.value !== shownWords()) read(); }).catch(() => {});
}
