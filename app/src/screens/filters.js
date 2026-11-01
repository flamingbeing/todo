// Filters & Labels (#filters-page, from Browse): a group for the saved filters and one for the labels, each with a fold
// and a +. A row is the filter's drop or the label's tag in its colour, the name, and how many open tasks it shows; a
// tap opens its page; a hold lifts it to drag it to another place in its group (or Alt+Up and Alt+Down).
// Its page (#place-page): a label's open tasks, or a filter's, one list per comma part of its query (headed by that
// part's words when there are several), with its error at the top when it can't be read.
import { icon, gripDrag, haptic } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { isTask, labelsOf, narrowTasks, groupTasks } from '../tasks.js';
import { colorHex } from '../colors.js';
import { byOrder, placeAt } from '../order.js';
import { flatten } from '../tree.js';
import { screens } from '../shell.js';
import { runQuery, countQuery, errorText } from '../query.js';
import { rowList, groupHead, emptyNote } from '../ui/row.js';
import { el } from './pick.js';
import { openNamedSheet, queryContext } from './named-sheet.js';

/** @typedef {import('./views.js').Ctx} Ctx */
/** @typedef {import('../items.js').Label} Label */
/** @typedef {import('../items.js').Filter} Filter */
/** @typedef {{ kind: 'labels' | 'filters', id: string }} Place */

const FOLD = (/** @type {string} */ kind) => `filters-labels:${kind}-folded`;
const HOLD_MS = 450, SLOP = 10;

/** @param {Ctx} ctx @param {HTMLElement} host */
export function drawFiltersLabels(ctx, host) {
  const data = ctx.data(), qc = queryContext(ctx);
  const open = data.tasks.filter(t => isTask(t) && !t.done);
  const group = (/** @type {'filters' | 'labels'} */ kind) => {
    const word = kind === 'filters' ? 'Filters' : 'Labels';
    const folded = localStorage.getItem(FOLD(kind)) === '1';
    const head = el('div', 'td-fl-head');
    const h = el('h2', 'td-fl-h');
    const fold = /** @type {HTMLButtonElement} */ (el('button', 'td-fl-fold'));
    fold.type = 'button';
    fold.setAttribute('aria-expanded', String(!folded));
    fold.append(el('span', 'td-fl-name', word), icon(folded ? ICONS.chevronRight : ICONS.chevronDown, { class: 'td-fl-chevron' }));
    fold.addEventListener('click', () => { localStorage.setItem(FOLD(kind), folded ? '0' : '1'); drawFiltersLabels(ctx, host); });
    h.append(fold);
    head.append(h);
    if (ctx.canWrite()) {
      const add = /** @type {HTMLButtonElement} */ (el('button', 'td-icon-btn td-fl-add'));
      add.type = 'button';
      add.setAttribute('aria-label', `Add ${kind === 'filters' ? 'filter' : 'label'}`);
      add.append(icon(ICONS.plus));
      add.addEventListener('click', () => openNamedSheet(ctx, kind, null, id => ctx.openPlace(kind, id)));
      head.append(add);
    }
    const out = [head];
    if (folded) return out;
    const items = /** @type {(Label | Filter)[]} */ (byOrder(/** @type {(Label | Filter)[]} */ (data[kind]).filter(x => x && x.name)));
    if (!items.length) { out.push(el('p', 'td-fl-none', kind === 'filters' ? 'No filters yet. Tap + to save one.' : 'No labels yet. Tap + to add one.')); return out; }
    const list = el('ul', 'td-fl-list');
    list.setAttribute('aria-label', word);
    list.dataset.noGesture = '';
    const drop = (/** @type {number} */ from, /** @type {number} */ to) => {
      if (from === to) return;
      const rest = items.filter((_, k) => k !== from), moved = items[from];
      const { order, renumber } = placeAt(rest, to);
      void ctx.app.orderNamed(kind, [...renumber, { item: moved, order }]).then(r => { if (r) ctx.toast('Could not move it'); });
    };
    list.append(...items.map((x, i) => {
      const li = el('li', 'td-fl-item');
      const b = /** @type {HTMLButtonElement} */ (el('button', 'td-fl-row'));
      b.type = 'button';
      b.dataset.id = x.id;
      const ic = icon(kind === 'filters' ? MORE.droplet : ICONS.tag, { class: 'td-fl-icon' });
      ic.style.color = colorHex(x.color);
      const n = kind === 'filters' ? countQuery(/** @type {Filter} */ (x).query, data.tasks, qc) : { count: open.filter(t => labelsOf(t, data.labels).includes(/** @type {Label} */ (x))).length, error: null };
      b.append(ic, el('span', 'td-fl-label', x.name));
      if (!n.error && n.count) b.append(el('span', 'td-fl-count', String(n.count)));
      b.addEventListener('click', e => { if (b.dataset.dragged) { delete b.dataset.dragged; e.preventDefault(); return; } ctx.openPlace(kind, x.id); });
      if (ctx.canWrite()) {
        b.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
        b.addEventListener('keydown', e => {
          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
          e.preventDefault();
          const to = i + (e.key === 'ArrowUp' ? -1 : 1);
          if (to >= 0 && to < items.length) drop(i, to);
        });
        holdToDrag(b, list, drop);
      }
      li.append(b);
      return li;
    }));
    out.push(list);
    return out;
  };
  host.replaceChildren(...group('filters'), ...group('labels'));
}

/** a hold on a row lifts it for a drag among the list's rows (a move first is a scroll) @param {HTMLElement} b
 * @param {HTMLElement} list @param {(from: number, to: number) => void} drop */
function holdToDrag(b, list, drop) {
  b.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY;
    let timer = setTimeout(() => {
      timer = 0;
      b.dataset.dragged = '1';
      haptic();
      gripDrag(/** @type {PointerEvent} */ (/** @type {unknown} */ ({ currentTarget: b, target: b, clientY: y0, pointerId: e.pointerId, preventDefault: () => {} })), list, drop);
    }, HOLD_MS);
    const off = () => { if (timer) clearTimeout(timer); timer = 0; b.removeEventListener('pointermove', move); };
    const move = (/** @type {PointerEvent} */ ev) => { if (timer && Math.hypot(ev.clientX - x0, ev.clientY - y0) > SLOP) off(); };
    b.addEventListener('pointermove', move);
    b.addEventListener('pointerup', off, { once: true });
    b.addEventListener('pointercancel', off, { once: true });
  });
  b.addEventListener('contextmenu', e => e.preventDefault());
}

/**
 * A label's or a filter's page into host. @param {Ctx} ctx @param {Place} place @param {HTMLElement} host @param {HTMLElement} empty
 * @param {import('../tasks.js').Display} d  this page's Display choices
 */
export function drawPlace(ctx, place, host, empty, d) {
  const data = ctx.data(), x = /** @type {(Label | Filter)[]} */ (data[place.kind]).find(y => y.id === place.id);
  const title = x?.name ?? (place.kind === 'filters' ? 'Filter' : 'Label');
  document.getElementById('place-title')?.replaceChildren(title);
  const page = document.getElementById('place-page');
  page?.style.setProperty('--td-project', colorHex(x?.color));
  if (ctx.top() === 'place-page') { const bar = document.querySelector('.ui-bar-title'); if (bar) bar.textContent = title; }
  if (!x) { host.replaceChildren(); empty.replaceChildren(emptyNote('Not found', 'It may have been deleted')); return; }
  const c = ctx.rows({ place: true }), today = c.today;
  const all = data.tasks.filter(isTask);
  const pool = all.filter(t => !t.done || d.completed);
  /** @type {{ title: string, tasks: import('../items.js').Task[] }[]} */
  let lists;
  /** @type {HTMLElement[]} */
  const parts = [];
  if (place.kind === 'labels') lists = [{ title: '', tasks: pool.filter(t => labelsOf(t, data.labels).includes(/** @type {Label} */ (x))) }];
  else {
    const r = runQuery(/** @type {Filter} */ (x).query, all.map(t => (t.done && d.completed ? { ...t, done: false } : t)), queryContext(ctx));
    if (r.error) {
      const err = el('p', 'td-query-error', `This filter can't be read: ${errorText(r.error)}`);
      err.setAttribute('role', 'alert');
      parts.push(err);
    }
    // (a done task was let through as open to be tested; it shows as done again)
    lists = r.groups.map(g => ({ title: r.groups.length > 1 ? g.title : '', tasks: g.tasks.map(t => all.find(y => y.id === t.id) ?? t) }));
  }
  let shown = 0;
  for (const list of lists) {
    const narrowed = narrowTasks(list.tasks, d, data.labels, today);
    const groups = groupTasks(narrowed, d, { projects: data.projects, labels: data.labels, today });
    const sec = el('section', 'td-group');
    if (list.title) sec.append(groupHead(list.title));
    for (const g of groups) {
      if (g.title) sec.append(el('h3', 'td-subgroup', g.title));
      sec.append(rowList(flatten(g.tasks, all, { open: () => false }), c, g.title || list.title || title));
      shown += g.tasks.length;
    }
    if (list.title || groups.some(g => g.tasks.length)) parts.push(sec);
  }
  host.replaceChildren(...parts);
  empty.replaceChildren(...(shown ? [] : [emptyNote('Nothing here', place.kind === 'labels' ? 'Tasks with this label show here' : 'Tasks this filter finds show here')]));
}

/** opens Filters & Labels */
export const openFiltersLabels = () => screens()?.push('#filters-page');
