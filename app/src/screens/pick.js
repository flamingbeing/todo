// The small sheets the task sheet, quick add and the project sheet open over themselves (#pick-sheet): a list to pick
// one from (a project and section, a colour, a parent project). Dates have their own sheet (scheduler.js).
// Every pick sheet has the reference's look: the title left-aligned under the grab handle, no X; the chosen row has a
// red radio dot. A short list sizes the sheet to its content (data-fit); Move to opens tall (.td-tall) with a Search
// field. pickPriority is the four-tile sheet (P1..P4); pickReminders is the Reminders sheet (Suggestions, Date & time,
// + Add reminder). This file is lazy (not on the startup path).
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { INBOX } from '../items.js';
import { projectTree } from '../arrange.js';
import { colorHex } from '../colors.js';
import { byOrder } from '../order.js';
import { LEADS, leadText, suggestLeads, whenText } from '../reminders.js';

/** @typedef {{ label: string, icon?: import('app-ui/icons/lucide.js').IconNodes, color?: string, depth?: number, checked?: boolean, run: () => unknown }} Choice */

const sheet = () => /** @type {HTMLDialogElement} */ (document.getElementById('pick-sheet'));
/** @param {string} tag @param {string} cls @param {string} [text] */
export const el = (tag, cls, text) => { const e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; };

/** the sheet's head: a round close button, the title, and optionally a Done; { x: false } = the pick sheets' head, the
 * title alone, left-aligned @param {string} title @param {HTMLDialogElement} d @param {(() => void) | null} [done] @param {{ x?: boolean }} [opts] */
export function sheetHead(title, d, done = null, opts = {}) {
  const plain = opts.x === false;
  const head = el('div', plain ? 'td-sheet-head td-sheet-head-plain' : 'td-sheet-head');
  const h = el('h2', 'td-sheet-title', title);
  h.id = `${d.id}-title`;
  d.setAttribute('aria-labelledby', h.id);
  if (plain) { head.append(h); return head; }
  const x = /** @type {HTMLButtonElement} */ (el('button', 'td-round td-sheet-x'));
  x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.append(icon(MORE.x));
  x.addEventListener('click', () => d.close());
  head.append(x, h);
  if (done) {
    const b = /** @type {HTMLButtonElement} */ (el('button', 'td-sheet-done', 'Done'));
    b.type = 'button'; b.addEventListener('click', done);
    head.append(b);
  } else head.append(el('span', 'td-sheet-spacer'));
  return head;
}

/** the pick sheet's shape for this open: sized to its content (data-fit), or tall @param {HTMLDialogElement} d @param {{ fit?: boolean, tall?: boolean }} how */
function shape(d, how) {
  d.toggleAttribute('data-fit', !!how.fit);
  d.classList.toggle('td-tall', !!how.tall);
}
/** a list this short sizes the sheet to itself */
const FIT_MAX = 7;

/**
 * opens the pick sheet with a list; a pick closes it (unless keep: the caller redraws the sheet). search = a Search
 * field on top that filters the rows as you type; tall = the near-full sheet.
 * @param {string} title @param {Choice[]} choices @param {{ search?: boolean, tall?: boolean, keep?: boolean }} [opts]
 */
export function pickOne(title, choices, opts = {}) {
  const d = sheet(), body = /** @type {HTMLElement} */ (d.querySelector('[data-fill]'));
  shape(d, { fit: !opts.tall && choices.length <= FIT_MAX, tall: opts.tall });
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
    b.append(el('span', 'td-choice-radio'));
    b.addEventListener('click', () => { if (!opts.keep) d.close(); void c.run(); });
    li.append(b);
    return li;
  }));
  /** @type {Node[]} */
  const parts = [sheetHead(title, d, null, { x: false })];
  /** @type {HTMLInputElement | null} */
  let find = null;
  if (opts.search) {
    const box = el('div', 'td-pick-search');
    find = /** @type {HTMLInputElement} */ (el('input', 'td-pick-find'));
    find.type = 'search'; find.placeholder = 'Search'; find.setAttribute('aria-label', 'Search'); find.autocomplete = 'off';
    box.append(icon(MORE.search, { class: 'td-pick-find-icon' }), find);
    const none = el('p', 'td-choice-none', 'Nothing found');
    none.hidden = true;
    find.addEventListener('input', () => {
      const q = /** @type {HTMLInputElement} */ (find).value.trim().toLowerCase();
      let n = 0;
      for (const li of list.children) { const hit = !q || (li.textContent ?? '').toLowerCase().includes(q); /** @type {HTMLElement} */ (li).hidden = !hit; if (hit) n++; }
      none.hidden = n > 0;
    });
    parts.push(box, list, none);
  } else parts.push(list);
  body.replaceChildren(...parts);
  if (!d.open) d.showModal();
  if (!find) /** @type {HTMLElement | null} */ (list.querySelector('[aria-selected="true"]') ?? list.querySelector('button'))?.focus({ preventScroll: true });
}

const PRIORITY_COLOR = ['', 'var(--td-p1)', 'var(--td-p2)', 'var(--td-p3)', 'var(--td-p4)'];

/**
 * The Priority sheet: four tiles in a row, P1..P4, each a flag in its colour with the name under it; the chosen one is
 * outlined. A tap saves and closes.
 * @param {number} current @param {(p: number) => unknown} set
 */
export function pickPriority(current, set) {
  const d = sheet(), body = /** @type {HTMLElement} */ (d.querySelector('[data-fill]'));
  shape(d, { fit: true });
  const row = el('div', 'td-prio-tiles');
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', 'Priority');
  for (const p of [1, 2, 3, 4]) {
    const b = /** @type {HTMLButtonElement} */ (el('button', 'td-prio-tile'));
    b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(p === current));
    const f = icon(MORE.flag, { class: 'td-prio-flag' });
    f.style.color = PRIORITY_COLOR[p];
    b.append(f, el('span', 'td-prio-name', `P${p}`));
    b.addEventListener('click', () => { d.close(); void set(p); });
    row.append(b);
  }
  body.replaceChildren(sheetHead('Priority', d, null, { x: false }), row);
  if (!d.open) d.showModal();
  /** @type {HTMLElement | null} */ (row.querySelector('[aria-checked="true"]') ?? row.querySelector('button'))?.focus({ preventScroll: true });
}

/**
 * The Reminders sheet: "Suggestions" (a lead or two not set yet, with the clock time it would ring), "Date & time" (the
 * set reminders, each removable) and a red "+ Add reminder" that opens every lead as a pick list. It redraws itself
 * after each change; `save` gets the whole new list (offsets in minutes, at most 5).
 * @param {number} due the task's due moment (ms) @param {number[]} has @param {(list: number[]) => unknown} save
 */
export function pickReminders(due, has, save) {
  const d = sheet(), body = /** @type {HTMLElement} */ (d.querySelector('[data-fill]'));
  const MAX = 5;
  let list = [...has];
  const change = (/** @type {number[]} */ next) => { list = next; void save(next); draw(); };
  const when = (/** @type {number} */ lead) => whenText(due - lead * 60000, Date.now());
  /** @param {number} lead @param {string} text @param {() => void} run */
  const line = (lead, text, run) => {
    const b = /** @type {HTMLButtonElement} */ (el('button', 'td-remind-line'));
    b.type = 'button';
    b.append(icon(MORE.alarmClock, { class: 'td-choice-icon' }));
    const words = el('span', 'td-remind-words');
    words.append(el('span', 'td-remind-lead', text), el('span', 'td-remind-when', when(lead)));
    b.append(words);
    b.addEventListener('click', run);
    return b;
  };
  function draw() {
    shape(d, { fit: true });
    const parts = [sheetHead('Reminders', d, null, { x: false })];
    const sug = list.length >= MAX ? [] : suggestLeads(list);
    if (sug.length) {
      const sec = el('section', 'td-remind-sec');
      sec.append(el('h3', 'td-remind-h', 'Suggestions'));
      const card = el('div', 'td-card td-remind-card');
      for (const lead of sug) { const b = line(lead, leadText(lead), () => change([...list, lead])); b.setAttribute('data-suggestion', String(lead)); card.append(b); }
      sec.append(card);
      parts.push(sec);
    }
    const sec = el('section', 'td-remind-sec');
    sec.append(el('h3', 'td-remind-h', 'Date & time'));
    const card = el('div', 'td-card td-remind-card');
    for (const lead of [...list].sort((a, b) => a - b)) {
      const r = el('div', 'td-remind-set');
      const ic = icon(MORE.alarmClock, { class: 'td-choice-icon' });
      const words = el('span', 'td-remind-words');
      words.append(el('span', 'td-remind-lead', leadText(lead)), el('span', 'td-remind-when', when(lead)));
      const x = /** @type {HTMLButtonElement} */ (el('button', 'td-remind-x'));
      x.type = 'button'; x.setAttribute('aria-label', `Remove ${leadText(lead)}`); x.append(icon(MORE.x));
      x.addEventListener('click', () => change(list.filter(v => v !== lead)));
      r.append(ic, words, x);
      card.append(r);
    }
    if (list.length < MAX) {
      const add = /** @type {HTMLButtonElement} */ (el('button', 'td-remind-add'));
      add.type = 'button';
      add.append(icon(ICONS.plus, { class: 'td-choice-icon' }), el('span', 'td-choice-label', 'Add reminder'));
      add.addEventListener('click', () => pickOne('Add reminder', LEADS.filter(([n]) => !list.includes(n)).map(([lead, label]) => ({
        label, icon: MORE.bell, run: () => change([...list, lead]) })), { keep: true }));
      card.append(add);
    }
    sec.append(card);
    parts.push(sec);
    body.replaceChildren(...parts);
    if (!d.open) d.showModal();
    /** @type {HTMLElement | null} */ (body.querySelector('.td-remind-add'))?.focus({ preventScroll: true });
  }
  draw();
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
  pickOne('Move to', choices, { search: true, tall: true });
}
