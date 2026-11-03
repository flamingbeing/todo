// Display (#display-sheet, from a list's "…"): choices are a draft until Save. The bottom bar is a red Done pill while nothing has
// changed; after the first change a grey Reset all (back to the list's own look) shows at the left and the button reads Save. A round ?
// at the right of the title says in a toast what the sheet keeps. Grouping, Sorting, Direction, Coloring and the filters are two-line rows
// (the name, its value in grey under it) in grouped cards. The layouts are drawn as small phones (red when chosen, grey otherwise,
// a radio under each). How the list on top is laid out and what it shows. A project chooses
// List or Board (kept with the project, so on every device); every list can be a Calendar instead (on this device:
// Agenda, Week or Month; Upcoming Week or Month, its week named by the days it shows: 3-day on a phone; Today its day), coloured by
// priority, label or project, with a repeating task's later dates if asked. Every list (Upcoming too, under each day) chooses whether done tasks show (greyed, at the end), how its
// tasks are grouped (not in a calendar) and ordered (and which way), and which it shows by priority, label or date.
// Those are kept per list on this device only (the option "display"); a list left as it was keeps nothing.
import { icon } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { REFUSED } from '../items.js';
import { cleanDisplay, plainDisplay } from '../tasks.js';
import { byOrder } from '../order.js';
import { columnCount } from '../cal.js';
import { el, pickOne } from './pick.js';

/** @typedef {import('./views.js').Ctx} Ctx */
/** @typedef {import('../tasks.js').Display} Display */

const GROUP_WORDS = /** @type {const} */ ([['none', 'None'], ['date', 'Date'], ['deadline', 'Deadline'], ['priority', 'Priority'], ['label', 'Label'], ['project', 'Project']]);
const SORT_WORDS = /** @type {const} */ ([['manual', 'Manual'], ['name', 'Name'], ['date', 'Date'], ['deadline', 'Deadline'], ['priority', 'Priority'], ['added', 'Date added']]);
const DATE_WORDS = /** @type {const} */ ([['', 'All'], ['today', 'Today'], ['week', 'This week'], ['overdue', 'Overdue'], ['nodate', 'No date']]);
const COLOR_WORDS = /** @type {const} */ ([['priority', 'Priority'], ['label', 'Label'], ['project', 'Project']]);
const CAL_WORDS = /** @type {const} */ ([['agenda', 'Agenda'], ['week', 'Week'], ['month', 'Month']]);
const SVG = 'http://www.w3.org/2000/svg';

/**
 * @param {Ctx} ctx @param {string} view  the list ('today', 'upcoming', 'inbox', 'project:<id>', 'labels:<id>', 'filters:<id>')
 * @param {import('../items.js').Project | null} project  a project's own page (for its layout)
 */
export function openDisplay(ctx, view, project) {
  const sheet = /** @type {HTMLDialogElement} */ (document.getElementById('display-sheet'));
  const body = /** @type {HTMLElement} */ (sheet.querySelector('[data-fill]'));
  const settings = ctx.app.settings;
  // Upcoming is by day: it groups by nothing else
  const days = view === 'upcoming';
  /** @type {Display} */
  let d = ctx.display(view);
  // the choices are a draft until Save (closing the sheet drops them); the button reads Done while nothing changed
  const first = JSON.stringify(d);
  const save = (/** @type {Partial<Display>} */ patch) => {
    d = cleanDisplay({ ...d, ...patch }, view);
    draw();
  };
  const commit = () => {
    const all = { .../** @type {Record<string, unknown>} */ (settings.get('display') ?? {}) };
    if (plainDisplay(d, view)) delete all[view]; else all[view] = d;
    settings.set('display', all);
    sheet.close();
  };

  const head = el('div', 'td-sheet-head td-display-head');
  const h = el('h2', 'td-sheet-title', 'Display');
  h.id = 'display-sheet-title';
  sheet.setAttribute('aria-labelledby', h.id);
  const help = /** @type {HTMLButtonElement} */ (el('button', 'td-display-help'));
  help.type = 'button';
  help.setAttribute('aria-label', 'About Display');
  help.append(icon(MORE.circleHelp, { class: 'td-display-help-icon' }));
  help.addEventListener('click', () => ctx.toast('These choices are kept for this list on this device. Reset all returns it to its own look.'));
  head.append(h, help);
  // the bottom bar: Done (Save after a change) and, after the first change, Reset all (back to the list's own look)
  const bar = el('div', 'td-display-bar');
  const reset = /** @type {HTMLButtonElement} */ (el('button', 'td-display-reset', 'Reset all'));
  reset.type = 'button';
  reset.addEventListener('click', () => { d = cleanDisplay({}, view); draw(); });
  const ok = /** @type {HTMLButtonElement} */ (el('button', 'td-sheet-done td-display-save', 'Done'));
  ok.type = 'button';
  ok.addEventListener('click', () => { if (JSON.stringify(d) === first) sheet.close(); else commit(); });
  bar.append(reset, ok);
  const rest = el('div', 'td-display');

  const row = (/** @type {import('app-ui/icons/lucide.js').IconNodes} */ ic, /** @type {string} */ label, /** @type {string} */ value, /** @type {() => void} */ run) => {
    const b = /** @type {HTMLButtonElement} */ (el('button', 'td-attr'));
    b.type = 'button';
    b.classList.add('is-two');
    b.append(icon(ic, { class: 'td-attr-icon' }), el('span', 'td-attr-text', ''));
    b.lastElementChild?.append(el('span', 'td-attr-label', label), el('span', 'td-attr-value', value));
    b.addEventListener('click', run);
    return b;
  };
  const choose = (/** @type {string} */ title, /** @type {readonly (readonly [string | number, string])[]} */ words, /** @type {unknown} */ now,
    /** @type {(v: any) => void} */ set) => pickOne(title, words.map(([key, label]) => ({ label, checked: key === now, run: () => set(key) })));
  const toggle = (/** @type {import('app-ui/icons/lucide.js').IconNodes} */ ic, /** @type {string} */ label, /** @type {boolean} */ on, /** @type {(v: boolean) => void} */ set) => {
    const r = el('label', 'td-attr td-switch-row');
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', className: 'ui-switch', checked: on });
    box.addEventListener('change', () => set(box.checked));
    r.append(icon(ic, { class: 'td-attr-icon' }), el('span', 'td-attr-label', label), box);
    return r;
  };
  const word = (/** @type {readonly (readonly [string | number, string])[]} */ words, /** @type {unknown} */ v) => words.find(w => w[0] === v)?.[1] ?? '';

  const draw = () => {
    const parts = [];
    // the layouts: a project's List and Board are its own (synced); a Calendar, and any list's, is this device's
    const now = project ? ctx.data().projects.find(p => p.id === project.id) ?? project : null;
    const cal = d.layout === 'calendar', shown = cal ? 'calendar' : d.layout || now?.view || 'list';
    const card = el('div', 'td-card td-layout-card');
    const tiles = el('div', 'td-layouts');
    tiles.setAttribute('role', 'radiogroup');
    tiles.setAttribute('aria-label', 'Layout');
    // Upcoming is an Agenda already: its tiles are Agenda and the day columns
    // (its calendar shows as many days as the width has columns: three on a phone)
    const tiles_ = days ? /** @type {const} */ ([['list', 'Agenda'], ['calendar', `${columnCount(window.innerWidth)}-day`]]) : /** @type {const} */ ([['list', 'List'], ['board', 'Board'], ['calendar', 'Calendar']]);
    for (const [key, label] of tiles_) {
      const b = /** @type {HTMLButtonElement} */ (el('button', 'td-layout'));
      b.type = 'button';
      b.setAttribute('role', 'radio');
      const on = shown === key;
      b.setAttribute('aria-checked', String(on));
      b.append(picture(days && key === 'calendar' ? 'days' : key), el('span', 'td-layout-name', label), el('span', 'td-layout-radio'));
      b.addEventListener('click', async () => {
        if (on) return;
        // (a list that is not a project: its board is this device's too)
        if (key === 'calendar' || !now) { save({ layout: key === 'list' ? '' : key }); return; }
        if (d.layout) save({ layout: '' });
        if ((now.view ?? 'list') !== key) {
          if (!ctx.canWrite()) return;
          if (await ctx.app.editProject(now, { view: key })) ctx.toast(REFUSED);
        }
        draw();
      });
      tiles.append(b);
    }
    tiles.style.setProperty('--n', String(tiles.children.length));
    card.append(tiles);
    if (cal) {
      // Today is its day; Upcoming has no Agenda (it is one)
      const kinds = view === 'today' ? [] : CAL_WORDS.filter(([k]) => !days || k !== 'agenda');   // (Upcoming: its n-day is Week)
      if (kinds.length) {
        const seg = el('div', 'td-seg');
        seg.setAttribute('role', 'radiogroup');
        seg.setAttribute('aria-label', 'Calendar');
        for (const [key, label] of kinds) {
          const b = /** @type {HTMLButtonElement} */ (el('button', 'td-seg-item', label));
          b.type = 'button';
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', String(d.cal === key));
          b.addEventListener('click', () => save({ cal: key }));
          seg.append(b);
        }
        card.append(seg);
      }
      const colors = COLOR_WORDS.filter(([k]) => k !== 'project' || !(view === 'inbox' || view.startsWith('project:')));
      card.append(row(MORE.palette, 'Coloring', word(COLOR_WORDS, d.color), () => choose('Coloring', colors, d.color, v => save({ color: v }))));
    }
    // (the switches sit in the Layout card, under the tiles, as the reference's)
    const done = toggle(MORE.circleCheckBig, 'Completed tasks', d.completed, v => save({ completed: v }));
    done.classList.add('td-display-done');
    card.append(done);
    if (cal || days) card.append(toggle(ICONS.repeat, 'Future occurrences', d.future, v => save({ future: v })));
    parts.push(el('h3', 'td-display-h', 'Layout'), card);
    const sort = el('div', 'td-card td-attrs');
    if (!days && !cal) sort.append(row(MORE.layers, 'Grouping', word(GROUP_WORDS, d.group), () => choose('Grouping', GROUP_WORDS, d.group, v => save({ group: v }))));
    // (a calendar has no hand-made order: the tasks of a day go by the sort chosen, by time first)
    const sorts = cal ? SORT_WORDS.filter(([k]) => k !== 'manual') : SORT_WORDS;
    sort.append(row(MORE.arrowUpDown, 'Sorting', word(SORT_WORDS, d.sort), () => choose('Sorting', sorts, d.sort, v => save({ sort: v }))));
    if (d.sort !== 'manual') sort.append(row(ICONS.chevronDown, 'Direction', d.dir === 'desc' ? 'Descending' : 'Ascending',
      () => choose('Direction', [['asc', 'Ascending'], ['desc', 'Descending']], d.dir, v => save({ dir: v }))));
    parts.push(el('h3', 'td-display-h', 'Sort'), sort);
    const labels = byOrder(ctx.data().labels.filter(l => l && l.name));
    const label = labels.find(l => l.id === d.label);
    const filter = el('div', 'td-card td-attrs');
    filter.append(
      row(MORE.flag, 'Priority', d.priority ? `Priority ${d.priority}` : 'All', () => choose('Priority', [[0, 'All'], [1, 'Priority 1'], [2, 'Priority 2'], [3, 'Priority 3'], [4, 'Priority 4']], d.priority, v => save({ priority: v }))),
      row(ICONS.tag, 'Label', label?.name ?? 'All', () => choose('Label', [['', 'All'], ...labels.map(l => /** @type {const} */ ([l.id, l.name]))], d.label, v => save({ label: v }))),
      row(MORE.calendarClock, 'Date', word(DATE_WORDS, d.date), () => choose('Date', DATE_WORDS, d.date, v => save({ date: v }))));
    parts.push(el('h3', 'td-display-h', 'Filter'), filter);
    const changed = JSON.stringify(d) !== first;
    reset.hidden = !changed;
    ok.textContent = changed ? 'Save' : 'Done';
    rest.replaceChildren(...parts);
  };
  body.replaceChildren(head, rest, bar);
  draw();
  if (!sheet.open) sheet.showModal();
  ok.focus({ preventScroll: true });
}

/** a small drawing of the layout as a phone: rows (a list), columns of cards (a board), a month grid under a head bar (a
 * calendar) or day columns with their tasks (Upcoming's n-day); drawn in the text colour, which the tile sets
 * @param {'list' | 'board' | 'calendar' | 'days'} kind */
function picture(kind) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 36 56');
  svg.setAttribute('class', 'td-layout-pic');
  svg.setAttribute('aria-hidden', 'true');
  const rect = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h, /** @type {number} */ rx = 1, /** @type {boolean} */ line = false) => {
    const r = document.createElementNS(SVG, 'rect');
    for (const [k, v] of Object.entries({ x, y, width: w, height: h, rx })) r.setAttribute(k, String(v));
    if (line) { r.setAttribute('fill', 'none'); r.setAttribute('stroke', 'currentColor'); r.setAttribute('stroke-width', '2'); }
    svg.append(r);
  };
  rect(1.5, 1.5, 33, 53, 6, true);
  rect(14, 4.5, 8, 1.6, 0.8);
  if (kind === 'list') for (let i = 0; i < 6; i++) { rect(6, 11 + i * 7, 3.4, 3.4, 1.7); rect(12, 12 + i * 7, 18, 1.8, 0.9); }
  else if (kind === 'board') for (let c = 0; c < 2; c++) for (let i = 0; i < 3 - c; i++) rect(5.5 + c * 13, 11 + i * 14, 11.5, 11, 2);
  else if (kind === 'days') for (let c = 0; c < 3; c++) { rect(5 + c * 9.5, 11, 8, 1.8, 0.9); for (let i = 0; i < 3 - (c % 2); i++) rect(5 + c * 9.5, 16 + i * 10, 8, 7, 1.5); }
  else { rect(6, 10, 24, 3, 1); for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) rect(6 + c * 6.3, 17 + r * 7, 4.6, 5, 1); }
  return svg;
}

/**
 * The line over a list whose sort or grouping is not its own ("Sorted by priority · Grouped by label"), with Reset (back
 * to the list's own order and grouping; the filters and the layout stay). Put just before the list, as its sibling, so a
 * list drawn again keeps it; none when both are the list's own. @param {Ctx} ctx @param {string} view @param {HTMLElement} host
 */
export function appliedLine(ctx, view, host) {
  host.parentElement?.querySelector(`:scope > .td-applied[data-for="${host.id}"]`)?.remove();
  const d = ctx.display(view), base = cleanDisplay({}, view), say = (/** @type {readonly (readonly [string, string])[]} */ w, /** @type {string} */ v) => (w.find(x => x[0] === v)?.[1] ?? '').toLowerCase();
  const bits = [d.sort !== 'manual' ? `Sorted by ${say(SORT_WORDS, d.sort)}${d.dir === 'desc' ? ', descending' : ''}` : '', d.group !== base.group ? `Grouped by ${say(GROUP_WORDS, d.group)}` : ''].filter(Boolean);
  if (!bits.length) return;
  const line = el('div', 'td-applied');
  line.dataset.for = host.id;
  const reset = /** @type {HTMLButtonElement} */ (el('button', 'td-text-btn td-applied-reset', 'Reset'));
  reset.type = 'button';
  reset.setAttribute('aria-label', `Reset: ${bits.join(', ')}`);
  reset.addEventListener('click', () => {
    const settings = ctx.app.settings, all = { .../** @type {Record<string, unknown>} */ (settings.get('display') ?? {}) };
    const next = cleanDisplay({ ...ctx.display(view), sort: 'manual', dir: 'asc', group: base.group }, view);
    if (plainDisplay(next, view)) delete all[view]; else all[view] = next;
    settings.set('display', all);
  });
  line.append(icon(MORE.arrowUpDown, { class: 'td-applied-icon' }), el('span', 'td-applied-text', bits.join(' · ')), reset);
  host.before(line);
}
