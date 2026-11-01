// The small sheets the task sheet, quick add and the project sheet open over themselves (#pick-sheet): a list to pick
// one from (a project and section, a colour, a parent project) and the date sheet (a day, a time, or none).
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { INBOX } from '../items.js';
import { projectTree } from '../tasks.js';
import { colorHex } from '../colors.js';
import { dayKey, addDays, weekdayOf, dayWords, timeText } from '../dates.js';
import { byOrder } from '../order.js';

/** @typedef {{ label: string, icon?: import('app-ui/icons/lucide.js').IconNodes, color?: string, depth?: number, checked?: boolean, run: () => unknown }} Choice */

const sheet = () => /** @type {HTMLDialogElement} */ (document.getElementById('pick-sheet'));
/** @param {string} tag @param {string} cls @param {string} [text] */
export const el = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };

/** the sheet's head: a round close button, the title, and optionally a Done @param {string} title @param {HTMLDialogElement} d @param {(() => void) | null} [done] */
export function sheetHead(title, d, done = null) {
  const head = el('div', 'td-sheet-head');
  const x = /** @type {HTMLButtonElement} */ (el('button', 'td-round td-sheet-x'));
  x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.append(icon(ICONS.x));
  x.addEventListener('click', () => d.close());
  const h = el('h2', 'td-sheet-title', title);
  h.id = `${d.id}-title`;
  d.setAttribute('aria-labelledby', h.id);
  head.append(x, h);
  if (done) {
    const b = /** @type {HTMLButtonElement} */ (el('button', 'td-sheet-done', 'Done'));
    b.type = 'button'; b.addEventListener('click', done);
    head.append(b);
  } else head.append(el('span', 'td-sheet-spacer'));
  return head;
}

/** opens the pick sheet with a list; a pick closes it @param {string} title @param {Choice[]} choices */
export function pickOne(title, choices) {
  const d = sheet(), body = /** @type {HTMLElement} */ (d.querySelector('[data-fill]'));
  const list = el('ul', 'td-card td-choices');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', title);
  list.append(...choices.map(c => {
    const li = el('li', ''), b = /** @type {HTMLButtonElement} */ (el('button', 'td-choice'));
    b.type = 'button';
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', String(!!c.checked));
    if (c.depth) b.style.setProperty('--depth', String(c.depth));
    if (c.icon) { const i = icon(c.icon, { class: 'td-choice-icon' }); if (c.color) i.style.color = c.color; b.append(i); }
    b.append(el('span', 'td-choice-label', c.label));
    if (c.checked) b.append(icon(ICONS.check, { class: 'td-choice-check' }));
    b.addEventListener('click', () => { d.close(); void c.run(); });
    li.append(b);
    return li;
  }));
  body.replaceChildren(sheetHead(title, d), list);
  if (!d.open) d.showModal();
  /** @type {HTMLElement | null} */ (list.querySelector('[aria-selected="true"]') ?? list.querySelector('button'))?.focus({ preventScroll: true });
}

/**
 * Picks a project and section: the Inbox and its sections, then every project with its sections under it.
 * @param {import('../items.js').Data} data @param {{ projectId: string, sectionId?: string | null }} now
 * @param {(to: { projectId: string, sectionId: string | null }) => unknown} done
 */
export function pickPlace(data, now, done) {
  /** @type {Choice[]} */
  const choices = [];
  const sectionsOf = (/** @type {string} */ pid, /** @type {number} */ depth) => byOrder(data.sections.filter(s => s.projectId === pid)).forEach(s => choices.push({
    label: s.name, icon: ICONS.listTree, depth: depth + 1, checked: now.projectId === pid && now.sectionId === s.id, run: () => done({ projectId: pid, sectionId: s.id }) }));
  choices.push({ label: 'Inbox', icon: ICONS.inbox, checked: now.projectId === INBOX && !now.sectionId, run: () => done({ projectId: INBOX, sectionId: null }) });
  sectionsOf(INBOX, 0);
  for (const { project: p, depth } of projectTree(data.projects.map(x => ({ ...x, collapsed: false })))) {
    choices.push({ label: p.name, icon: ICONS.hash, color: colorHex(p.color), depth, checked: now.projectId === p.id && !now.sectionId,
      run: () => done({ projectId: p.id, sectionId: null }) });
    sectionsOf(p.id, depth);
  }
  pickOne('Move to', choices);
}

/**
 * The date sheet: Today, Tomorrow, the weekend, next week or no date, or a day and a time of one's own.
 * @param {import('../dates.js').Due | null | undefined} due @param {(due: import('../dates.js').Due | null) => unknown} done
 */
export function pickDate(due, done) {
  const d = sheet(), body = /** @type {HTMLElement} */ (d.querySelector('[data-fill]')), today = dayKey();
  const sat = addDays(today, (6 - weekdayOf(today) + 7) % 7 || 7), mon = addDays(today, (8 - weekdayOf(today)) % 7 || 7);
  const keep = (/** @type {string} */ date) => ({ ...(due ?? {}), date });
  const quick = /** @type {[string, import('app-ui/icons/lucide.js').IconNodes, string, string | null][]} */ ([
    ['Today', ICONS.calendar, 'today', today], ['Tomorrow', ICONS.sun, 'tomorrow', addDays(today, 1)],
    ['This weekend', ICONS.sofa, 'weekend', sat], ['Next week', ICONS.calendarArrowUp, 'week', mon], ['No date', ICONS.ban, 'none', null],
  ]);
  const list = el('ul', 'td-card td-choices');
  list.setAttribute('aria-label', 'Quick dates');
  list.append(...quick.map(([label, ic, tone, date]) => {
    const li = el('li', ''), b = /** @type {HTMLButtonElement} */ (el('button', 'td-choice'));
    b.type = 'button';
    const i = icon(ic, { class: 'td-choice-icon' });
    i.dataset.tone = tone;
    b.append(i, el('span', 'td-choice-label', label));
    if (date) b.append(el('span', 'td-choice-side', dayWords(date, today) === label ? '' : dayWords(date, today)));
    b.addEventListener('click', () => { d.close(); void done(date ? keep(date) : null); });
    li.append(b);
    return li;
  }));
  const form = /** @type {HTMLFormElement} */ (el('form', 'td-card td-date-form'));
  const day = Object.assign(document.createElement('input'), { type: 'date', value: due?.date ?? today, required: true });
  const time = Object.assign(document.createElement('input'), { type: 'time', value: due?.time ?? '' });
  const dl = el('label', 'td-field', 'Day'), tl = el('label', 'td-field', 'Time');
  dl.append(day); tl.append(time);
  const set = /** @type {HTMLButtonElement} */ (el('button', 'td-primary', 'Set date'));
  set.type = 'submit';
  form.append(dl, tl, set);
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!day.value) return;
    const next = { ...(due ?? {}), date: day.value };
    if (time.value) next.time = time.value; else delete next.time;
    d.close(); void done(next);
  });
  const now = due?.time ? ` ${timeText(due.time)}` : '';
  body.replaceChildren(sheetHead(due ? `${dayWords(due.date, today)}${now}` : 'Date', d), list, form);
  if (!d.open) d.showModal();
}
