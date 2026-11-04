// Display at 840 px and up: a small card under the Display button, its right edge on the button's (display.js opens this
// file in place of its sheet when the window is that wide; the phone's sheet is unchanged). The layout is a row of tiles
// (List, Board, Table, Calendar; Upcoming: Agenda and the day columns), then a row a choice, each a small select; a row
// that is not the list's default has an orange dot. A choice is kept at once (this device, this list); Reset all puts the
// list back to its own look. A project's List and Board are its own (synced), as in the sheet.
import { icon, placeCard } from '@core/ui';
import { MORE } from '../icons-more.js';
import { REFUSED } from '../items.js';
import { cleanDisplay, plainDisplay } from '../tasks.js';
import { byOrder } from '../order.js';
import { columnCount } from '../cal.js';
import { el } from '../screens/pick.js';

/** @typedef {import('../screens/views.js').Ctx} Ctx */
/** @typedef {import('../tasks.js').Display} Display */
/** @typedef {import('app-ui/icons/lucide.js').IconNodes} IconNodes */

// the layout tiles' icons (Lucide, ISC licence: list, square-kanban, table, calendar-days)
/** @type {Record<string, IconNodes>} */
const TILE_ICONS = {
  list: [['path', { d: 'M3 12h.01' }], ['path', { d: 'M3 18h.01' }], ['path', { d: 'M3 6h.01' }], ['path', { d: 'M8 12h13' }], ['path', { d: 'M8 18h13' }], ['path', { d: 'M8 6h13' }]],
  board: [['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }], ['path', { d: 'M8 7v7' }], ['path', { d: 'M12 7v4' }], ['path', { d: 'M16 7v9' }]],
  table: [['path', { d: 'M12 3v18' }], ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2' }], ['path', { d: 'M3 9h18' }], ['path', { d: 'M3 15h18' }]],
  calendar: MORE.calendarDays,
};
const GROUP_WORDS = [['none', 'None'], ['date', 'Date'], ['deadline', 'Deadline'], ['priority', 'Priority'], ['label', 'Label'], ['project', 'Project']];
const SORT_WORDS = [['manual', 'Manual'], ['name', 'Name'], ['date', 'Date'], ['deadline', 'Deadline'], ['priority', 'Priority'], ['added', 'Date added']];
const DATE_WORDS = [['', 'All'], ['today', 'Today'], ['week', 'This week'], ['overdue', 'Overdue'], ['nodate', 'No date']];
const COLOR_WORDS = [['priority', 'Priority'], ['label', 'Label'], ['project', 'Project']];
const WIDTH = 300;

/** @type {HTMLDialogElement | null} */
let pop = null;

/**
 * @param {Ctx} ctx @param {string} view  the list (as display.js's) @param {import('../items.js').Project | null} project  a project's page
 * @param {HTMLElement | null} from  the Display button (the card hangs under it)
 */
export function openPop(ctx, view, project, from) {
  if (!pop) {
    pop = /** @type {HTMLDialogElement} */ (el('dialog', 'td-pop td-display-pop'));
    pop.id = 'display-pop';
    pop.setAttribute('aria-label', 'Display');
    // (a click outside the card, on its see-through backdrop, closes it)
    pop.addEventListener('click', e => {
      const r = /** @type {HTMLDialogElement} */ (pop).getBoundingClientRect();
      if (e.target === pop && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) pop?.close();
    });
    document.body.append(pop);
  }
  const card = pop, settings = ctx.app.settings, days = view === 'upcoming';
  /** @type {Display} */
  let d = ctx.display(view);
  const keep = (/** @type {Partial<Display>} */ patch) => {
    d = cleanDisplay({ ...d, ...patch }, view);
    const all = { .../** @type {Record<string, unknown>} */ (settings.get('display') ?? {}) };
    if (plainDisplay(d, view)) delete all[view]; else all[view] = d;
    settings.set('display', all);
    draw();
  };
  const plain = cleanDisplay({}, view);

  /** a row: its name (a dot when changed) and a select @param {string} label @param {keyof Display} key
   * @param {(string | number)[][]} words @param {(v: string) => void} [set] */
  const pick = (label, key, words, set) => {
    const r = el('label', 'td-pop-row');
    const name = el('span', 'td-pop-name', label);
    if (JSON.stringify(d[key]) !== JSON.stringify(plain[key])) name.append(dot());
    const s = /** @type {HTMLSelectElement} */ (el('select', 'td-pop-select'));
    s.dataset.k = key;
    for (const [k, w] of words) s.append(new Option(String(w), String(k), false, String(k) === String(d[key])));
    s.addEventListener('change', () => (set ?? (v => keep({ [key]: typeof plain[key] === 'number' ? Number(v) : v })))(s.value));
    r.append(name, s);
    return r;
  };
  const dot = () => { const s = el('span', 'td-pop-dot'); s.setAttribute('aria-label', '(changed)'); return s; };

  const draw = () => {
    const now = project ? ctx.data().projects.find(p => p.id === project.id) ?? project : null;
    const shown = d.layout === 'calendar' || d.layout === 'table' ? d.layout : d.layout || now?.view || 'list';
    const tiles = el('div', 'td-pop-seg');
    tiles.setAttribute('role', 'radiogroup');
    tiles.setAttribute('aria-label', 'Layout');
    const list = days ? [['list', 'Agenda'], ['calendar', `${columnCount(window.innerWidth)}-day`]] : [['list', 'List'], ['board', 'Board'], ['table', 'Table'], ['calendar', 'Calendar']];
    for (const [key, label] of list) {
      const b = /** @type {HTMLButtonElement} */ (el('button', 'td-pop-tile'));
      b.type = 'button';
      b.setAttribute('role', 'radio');
      const on = shown === key;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      b.dataset.k = `tile-${key}`;
      b.append(icon(TILE_ICONS[key], { class: 'td-pop-tile-icon' }), el('span', 'td-pop-tile-name', label));
      b.addEventListener('click', async () => {
        if (on) return;
        if (key === 'calendar' || key === 'table' || !now) { keep({ layout: key === 'list' ? '' : key }); return; }
        if (d.layout) keep({ layout: '' });
        if ((now.view ?? 'list') !== key) {
          if (!ctx.canWrite()) return;
          if (await ctx.app.editProject(now, { view: /** @type {'list' | 'board'} */ (key) })) ctx.toast(REFUSED);
        }
        draw();
      });
      tiles.append(b);
    }
    // (arrow keys move along the tiles, as in any radio group)
    tiles.addEventListener('keydown', e => {
      const all = /** @type {HTMLButtonElement[]} */ ([...tiles.children]), i = all.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!step || i < 0) return;
      e.preventDefault();
      const next = all[(i + step + all.length) % all.length];
      next.focus();
      next.click();
    });
    const rows = el('div', 'td-pop-rows');
    const cal = d.layout === 'calendar';
    const done = el('label', 'td-pop-row');
    const doneName = el('span', 'td-pop-name', 'Completed tasks');
    if (d.completed) doneName.append(dot());
    const sw = Object.assign(document.createElement('input'), { type: 'checkbox', className: 'ui-switch', checked: d.completed });
    sw.dataset.k = 'completed';
    sw.addEventListener('change', () => keep({ completed: sw.checked }));
    done.append(doneName, sw);
    rows.append(done);
    if (cal) {
      const kinds = view === 'today' ? [] : [['agenda', 'Agenda'], ['week', `${columnCount(window.innerWidth)}-day`], ['month', 'Month']].filter(([k]) => !days || k !== 'agenda');
      if (kinds.length) rows.append(pick('Calendar', 'cal', kinds));
      rows.append(pick('Coloring', 'color', COLOR_WORDS.filter(([k]) => k !== 'project' || !(view === 'inbox' || view.startsWith('project:')))));
    }
    if (!days && !cal) rows.append(pick('Grouping', 'group', GROUP_WORDS));
    rows.append(pick('Sorting', 'sort', cal ? SORT_WORDS.filter(([k]) => k !== 'manual') : SORT_WORDS));
    if (d.sort !== 'manual') rows.append(pick('Direction', 'dir', [['asc', 'Ascending'], ['desc', 'Descending']]));
    const labels = byOrder(ctx.data().labels.filter(l => l && l.name));
    rows.append(pick('Priority', 'priority', [[0, 'All'], [1, 'Priority 1'], [2, 'Priority 2'], [3, 'Priority 3'], [4, 'Priority 4']]),
      pick('Label', 'label', [['', 'All'], ...labels.map(l => [l.id, l.name])]),
      pick('Date', 'date', DATE_WORDS));
    const foot = el('div', 'td-pop-foot');
    const reset = /** @type {HTMLButtonElement} */ (el('button', 'td-pop-reset td-display-reset', 'Reset all'));
    reset.type = 'button';
    reset.disabled = plainDisplay(d, view);
    reset.addEventListener('click', () => { keep(cleanDisplay({}, view)); tiles.querySelector('[aria-checked="true"]')?.closest('button')?.focus(); });
    foot.append(reset);
    reset.dataset.k = 'reset';
    // (a choice draws the card again: the focus stays on the same control)
    const f = /** @type {HTMLElement | null} */ (card.querySelector('[data-k]:focus'))?.dataset.k;
    card.replaceChildren(el('p', 'td-pop-h', 'Layout'), tiles, rows, foot);
    if (f) /** @type {HTMLElement | null} */ (card.querySelector(`[data-k="${f}"]`) ?? card.querySelector('.td-pop-tile[aria-checked="true"]'))?.focus({ preventScroll: true });
  };
  draw();
  if (!card.open) card.showModal();
  // under the button, its right edge on the button's (kept inside the window)
  const r = (from ?? document.body).getBoundingClientRect();
  const { left, top } = placeCard({ left: r.right - WIDTH, top: r.top, bottom: r.bottom }, { width: WIDTH, height: card.offsetHeight }, { width: innerWidth, height: innerHeight });
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.style.maxHeight = `${Math.max(240, innerHeight - top - 16)}px`;
  /** @type {HTMLElement | null} */ (card.querySelector('.td-pop-tile[aria-checked="true"]'))?.focus({ preventScroll: true });
}
