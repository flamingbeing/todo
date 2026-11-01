// Display (#display-sheet, from a list's "…"): how the list on top is laid out and what it shows. A project chooses
// List or Board (kept with the project, so on every device); every list chooses whether done tasks show (greyed, at
// the end), how its tasks are grouped and ordered (and which way), and which it shows by priority, label or date.
// Those are kept per list on this device only (the option "display"); a list left as it was keeps nothing.
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { REFUSED } from '../items.js';
import { cleanDisplay, plainDisplay } from '../tasks.js';
import { byOrder } from '../order.js';
import { el, pickOne } from './pick.js';

/** @typedef {import('./views.js').Ctx} Ctx */
/** @typedef {import('../tasks.js').Display} Display */

const GROUP_WORDS = /** @type {const} */ ([['none', 'None'], ['date', 'Date'], ['priority', 'Priority'], ['label', 'Label'], ['project', 'Project']]);
const SORT_WORDS = /** @type {const} */ ([['manual', 'Manual'], ['name', 'Name'], ['date', 'Date'], ['priority', 'Priority'], ['added', 'Date added']]);
const DATE_WORDS = /** @type {const} */ ([['', 'All'], ['today', 'Today'], ['week', 'This week'], ['overdue', 'Overdue'], ['nodate', 'No date']]);
const SVG = 'http://www.w3.org/2000/svg';

/**
 * @param {Ctx} ctx @param {string} view  the list ('today', 'upcoming', 'inbox', 'project:<id>', 'labels:<id>', 'filters:<id>')
 * @param {import('../items.js').Project | null} project  a project's own page (for its layout)
 */
export function openDisplay(ctx, view, project) {
  const sheet = /** @type {HTMLDialogElement} */ (document.getElementById('display-sheet'));
  const body = /** @type {HTMLElement} */ (sheet.querySelector('[data-fill]'));
  const settings = ctx.app.settings;
  // Upcoming is by day: it groups by nothing else, and shows no done tasks
  const days = view === 'upcoming';
  /** @type {Display} */
  let d = ctx.display(view);
  const save = (/** @type {Partial<Display>} */ patch) => {
    d = cleanDisplay({ ...d, ...patch }, view);
    const all = { .../** @type {Record<string, unknown>} */ (settings.get('display') ?? {}) };
    if (plainDisplay(d, view)) delete all[view]; else all[view] = d;
    settings.set('display', all);
    draw();
  };

  const head = el('div', 'td-sheet-head');
  const x = /** @type {HTMLButtonElement} */ (el('button', 'td-round td-sheet-x'));
  x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.append(icon(ICONS.x));
  x.addEventListener('click', () => sheet.close());
  const h = el('h2', 'td-sheet-title', 'Display');
  h.id = 'display-sheet-title';
  sheet.setAttribute('aria-labelledby', h.id);
  const ok = /** @type {HTMLButtonElement} */ (el('button', 'td-round td-sheet-ok'));
  ok.type = 'button'; ok.setAttribute('aria-label', 'Done'); ok.append(icon(ICONS.check));
  ok.addEventListener('click', () => sheet.close());
  head.append(x, h, ok);
  const rest = el('div', 'td-display');

  const row = (/** @type {import('app-ui/icons/lucide.js').IconNodes} */ ic, /** @type {string} */ label, /** @type {string} */ value, /** @type {() => void} */ run) => {
    const b = /** @type {HTMLButtonElement} */ (el('button', 'td-attr'));
    b.type = 'button';
    b.append(icon(ic, { class: 'td-attr-icon' }), el('span', 'td-attr-label', label), el('span', 'td-attr-value', value), icon(ICONS.chevronRight, { class: 'td-attr-chevron' }));
    b.addEventListener('click', run);
    return b;
  };
  const choose = (/** @type {string} */ title, /** @type {readonly (readonly [string | number, string])[]} */ words, /** @type {unknown} */ now,
    /** @type {(v: any) => void} */ set) => pickOne(title, words.map(([key, label]) => ({ label, checked: key === now, run: () => set(key) })));
  const word = (/** @type {readonly (readonly [string | number, string])[]} */ words, /** @type {unknown} */ v) => words.find(w => w[0] === v)?.[1] ?? '';

  const draw = () => {
    const parts = [];
    if (project) {
      const now = ctx.data().projects.find(p => p.id === project.id) ?? project;
      const card = el('div', 'td-card td-layouts');
      card.setAttribute('role', 'radiogroup');
      card.setAttribute('aria-label', 'Layout');
      for (const [key, label] of /** @type {const} */ ([['list', 'List'], ['board', 'Board']])) {
        const b = /** @type {HTMLButtonElement} */ (el('button', 'td-layout'));
        b.type = 'button';
        b.setAttribute('role', 'radio');
        const on = (now.view ?? 'list') === key;
        b.setAttribute('aria-checked', String(on));
        b.append(picture(key), el('span', 'td-layout-name', label));
        b.addEventListener('click', async () => {
          if (on || !ctx.canWrite()) return;
          if (await ctx.app.editProject(now, { view: key })) ctx.toast(REFUSED);
          draw();
        });
        card.append(b);
      }
      parts.push(el('h3', 'td-display-h', 'Layout'), card);
    }
    if (!days) {
      const done = el('label', 'td-card td-attr td-switch-row td-display-done');
      const box = Object.assign(document.createElement('input'), { type: 'checkbox', className: 'ui-switch', checked: d.completed });
      box.addEventListener('change', () => save({ completed: box.checked }));
      done.append(icon(MORE.circleCheckBig, { class: 'td-attr-icon' }), el('span', 'td-attr-label', 'Completed tasks'), box);
      parts.push(done);
    }
    const sort = el('div', 'td-card td-attrs');
    if (!days) sort.append(row(MORE.layers, 'Grouping', word(GROUP_WORDS, d.group), () => choose('Grouping', GROUP_WORDS, d.group, v => save({ group: v }))));
    sort.append(row(MORE.arrowUpDown, 'Sorting', word(SORT_WORDS, d.sort), () => choose('Sorting', SORT_WORDS, d.sort, v => save({ sort: v }))));
    if (d.sort !== 'manual') sort.append(row(ICONS.chevronDown, 'Direction', d.dir === 'desc' ? 'Descending' : 'Ascending',
      () => choose('Direction', [['asc', 'Ascending'], ['desc', 'Descending']], d.dir, v => save({ dir: v }))));
    parts.push(el('h3', 'td-display-h', 'Sort'), sort);
    const labels = byOrder(ctx.data().labels.filter(l => l && l.name));
    const label = labels.find(l => l.id === d.label);
    const filter = el('div', 'td-card td-attrs');
    filter.append(
      row(ICONS.flag, 'Priority', d.priority ? `Priority ${d.priority}` : 'All', () => choose('Priority', [[0, 'All'], [1, 'Priority 1'], [2, 'Priority 2'], [3, 'Priority 3'], [4, 'Priority 4']], d.priority, v => save({ priority: v }))),
      row(ICONS.tag, 'Label', label?.name ?? 'All', () => choose('Label', [['', 'All'], ...labels.map(l => /** @type {const} */ ([l.id, l.name]))], d.label, v => save({ label: v }))),
      row(MORE.calendarClock, 'Date', word(DATE_WORDS, d.date), () => choose('Date', DATE_WORDS, d.date, v => save({ date: v }))));
    parts.push(el('h3', 'td-display-h', 'Filter'), filter);
    if (!plainDisplay(d, view)) {
      const reset = /** @type {HTMLButtonElement} */ (el('button', 'td-text-btn td-display-reset', 'Reset'));
      reset.type = 'button';
      reset.addEventListener('click', () => { d = cleanDisplay({}, view); save({}); });
      parts.push(reset);
    }
    rest.replaceChildren(...parts);
  };
  body.replaceChildren(head, rest);
  draw();
  if (!sheet.open) sheet.showModal();
  ok.focus({ preventScroll: true });
}

/** a small drawing of the layout: three bars (a list), or three columns of cards (a board) @param {'list' | 'board'} kind */
function picture(kind) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 48 32');
  svg.setAttribute('class', 'td-layout-pic');
  svg.setAttribute('aria-hidden', 'true');
  const rect = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h) => {
    const r = document.createElementNS(SVG, 'rect');
    for (const [k, v] of Object.entries({ x, y, width: w, height: h, rx: 1.5 })) r.setAttribute(k, String(v));
    svg.append(r);
  };
  if (kind === 'list') for (let i = 0; i < 4; i++) { rect(6, 5 + i * 6.5, 4, 4); rect(13, 6 + i * 6.5, 29, 2); }
  else for (let c = 0; c < 3; c++) for (let i = 0; i < 3 - (c % 2); i++) rect(5 + c * 13.5, 5 + i * 8, 11, 6);
  return svg;
}
