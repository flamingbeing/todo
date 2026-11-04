// Filters & Labels (#filters-page, from Browse): a group for the saved filters and one for the labels, each with a fold
// and a +. A row is the filter's drop or the label's tag in its colour, the name, and how many open tasks it shows; a
// tap opens its page; a hold lifts it to drag it to another place in its group (or Alt+Up and Alt+Down). The rows of a group
// sit in one rounded card that ends with a Manage filters (Manage labels) row: tapped, the rows show a chevron and a tap on one
// edits it (name, colour, query) until Done.
// Its page (#place-page): a label's open tasks, or a filter's, one list per comma part of its query (headed by that
// part's words when there are several), with its error at the top when it can't be read.
import { icon, gripDrag, haptic } from '@core/ui';
import { ICONS } from '../icons.js';
import { MORE } from '../icons-more.js';
import { isTask, labelsOf } from '../tasks.js';
import { narrowTasks, groupTasks } from '../arrange.js';
import { colorHex } from '../colors.js';
import { byOrder, placeAt } from '../order.js';
import { flatten } from '../tree.js';
import { screens } from '../shell.js';
import { runQuery, countQuery, errorText } from '../query.js';
import { rowList, groupHead, emptyNote } from '../ui/row.js';
import { el } from './pick.js';
import { drawGroupBoard, addFor } from './board.js';
import { INBOX } from '../items.js';
import { openNamedSheet, queryContext } from './named-sheet.js';

/** @typedef {import('./views.js').Ctx} Ctx */
/** @typedef {import('../items.js').Label} Label */
/** @typedef {import('../items.js').Filter} Filter */
/** @typedef {{ kind: 'labels' | 'filters', id: string }} Place */

const FOLD = (/** @type {string} */ kind) => `filters-labels:${kind}-folded`;
const HOLD_MS = 450, SLOP = 10;
/** the list being managed now ('' none): a tap on a row of it edits the row instead of opening its page @type {'' | 'filters' | 'labels'} */
let managing = '';

/** leaving the page ends managing */
export const endManage = () => { managing = ''; };

/** @param {Ctx} ctx @param {HTMLElement} host */
export function drawFiltersLabels(ctx, host) {
  const data = ctx.data(), qc = queryContext(ctx);
  const open = data.tasks.filter(t => isTask(t) && !t.done);
  const group = (/** @type {'filters' | 'labels'} */ kind) => {
    const word = kind === 'filters' ? 'My Filters' : 'Labels';
    const folded = localStorage.getItem(FOLD(kind)) === '1';
    // the head: the name (a tap folds), a + and the fold's chevron at the right
    const head = el('div', 'td-fl-head');
    const h = el('h2', 'td-fl-h');
    const fold = /** @type {HTMLButtonElement} */ (el('button', 'td-fl-fold'));
    fold.type = 'button';
    fold.setAttribute('aria-expanded', String(!folded));
    fold.append(el('span', 'td-fl-name', word));
    fold.addEventListener('click', () => { localStorage.setItem(FOLD(kind), folded ? '0' : '1'); drawFiltersLabels(ctx, host); });
    h.append(fold);
    head.append(h);
    const chev = /** @type {HTMLButtonElement} */ (el('button', 'td-icon-btn td-fl-chev'));
    chev.type = 'button';
    chev.tabIndex = -1;
    chev.setAttribute('aria-hidden', 'true');
    chev.append(icon(folded ? ICONS.chevronDown : ICONS.chevronUp, { class: 'td-fl-chevron' }));
    chev.addEventListener('click', () => fold.click());
    if (ctx.canWrite()) {
      const add = /** @type {HTMLButtonElement} */ (el('button', 'td-icon-btn td-fl-add'));
      add.type = 'button';
      add.setAttribute('aria-label', `Add ${kind === 'filters' ? 'filter' : 'label'}`);
      add.append(icon(ICONS.plus));
      add.addEventListener('click', () => openNamedSheet(ctx, kind, null, id => ctx.openPlace(kind, id)));
      head.append(add);
    }
    head.append(chev);
    const out = [head];
    if (folded) return out;
    const items = /** @type {(Label | Filter)[]} */ (byOrder(/** @type {(Label | Filter)[]} */ (data[kind]).filter(x => x && x.name)));
    if (!items.length && !ctx.canWrite()) return out;
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
      if (n.error) { const bad = el('span', 'td-fl-count td-fl-bad', '!'); bad.title = "This filter can't be read"; bad.setAttribute('aria-hidden', 'true'); b.setAttribute('aria-description', "can't be read"); b.append(bad); }
      else if (n.count) b.append(el('span', 'td-fl-count', String(n.count)));
      b.addEventListener('click', e => {
        if (b.dataset.dragged) { delete b.dataset.dragged; e.preventDefault(); return; }
        if (managing === kind) openNamedSheet(ctx, kind, x); else ctx.openPlace(kind, x.id);
      });
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
    // the closing row: Manage filters / Manage labels (a tap on a row then edits it, until Done)
    if (ctx.canWrite()) {
      const li = el('li', 'td-fl-item'), m = /** @type {HTMLButtonElement} */ (el('button', 'td-fl-row td-fl-manage'));
      const on = managing === kind;
      m.type = 'button';
      m.setAttribute('aria-pressed', String(on));
      m.append(icon(on ? ICONS.check : MORE.settings, { class: 'td-fl-icon' }), el('span', 'td-fl-label', on ? 'Done' : `Manage ${kind}`));
      m.addEventListener('click', () => { managing = on ? '' : kind; drawFiltersLabels(ctx, host); });
      li.append(m);
      list.append(li);
    }
    list.classList.toggle('td-fl-managing', managing === kind);
    out.push(list);
    return out;
  };
  const none = !data.filters.some(x => x && x.name) && !data.labels.some(x => x && x.name);
  const note = none ? [emptyNote('No filters or labels yet', 'Save a search as a filter, or tag tasks with a label, to find them here.', 'tags')] : [];
  note.forEach(e => e.classList.add('td-empty-page', 'td-empty-inline'));
  host.replaceChildren(...group('filters'), ...group('labels'), ...note);
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
 * @param {(tasks: import('../items.js').Task[]) => void} [cal]  in its calendar layout: the tasks found go there (calendar.js)
 */
export function drawPlace(ctx, place, host, empty, d, cal) {
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
  if (cal) { cal([...new Set(lists.flatMap(l => l.tasks))]); return; }
  const none = () => {
    const e = place.kind === 'labels' ? emptyNote('No tasks with this label', 'Add this label to a task and it shows here.', 'label')
      : emptyNote('Nothing matches', 'Tasks this filter finds show here.', 'filter');
    e.classList.add('td-empty-page');
    return e;
  };
  // what a task added from here starts with (a label's page: that label)
  const base = place.kind === 'labels' ? { projectId: INBOX, labels: [x.name] } : { projectId: INBOX };
  if (d.layout === 'board') {
    if (!drawGroupBoard(ctx, { host, below: empty, tasks: [...new Set(lists.flatMap(l => l.tasks))], d, group: d.group, base, title })) empty.prepend(none());
    return;
  }
  // (Display's Table: 840 px and up only, a list under it)
  if (d.layout === 'table' && matchMedia('(min-width: 840px)').matches) {
    void import('../wide/table.js').then(m => { if (!m.drawTable(ctx, { host, empty, tasks: [...new Set(lists.flatMap(l => l.tasks))], d, base, label: title })) empty.prepend(none()); });
    return;
  }
  host.classList.remove('td-board');
  host.removeAttribute('data-swipe-own');
  host.toggleAttribute('data-sorted', d.sort !== 'manual');
  // in Display's groups a row may be dragged to another (ui/row-drag.js: data-grouped, data-gkey); in none it stays put
  if (d.group !== 'none') host.dataset.grouped = d.group; else delete host.dataset.grouped;
  let shown = 0;
  for (const list of lists) {
    const narrowed = narrowTasks(list.tasks, d, data.labels, today);
    const groups = groupTasks(narrowed, d, { projects: data.projects, labels: data.labels, today });
    const sec = el('section', 'td-group');
    if (list.title) sec.append(groupHead(list.title));
    for (const g of groups) {
      const box = d.group === 'none' ? sec : el('div', 'td-subgroup-box');
      if (box !== sec) { box.dataset.gkey = g.key; sec.append(box); }
      if (g.title) {
        const h = el('div', 'td-subgroup'), a = addFor(d.group, g.key, data, base);
        h.append(el('h3', 'td-subgroup-name', g.title));
        if (a && ctx.canWrite()) {
          // the "+" by a group's name: quick add with its value
          const b = /** @type {HTMLButtonElement} */ (el('button', 'td-icon-btn td-group-add'));
          b.type = 'button';
          b.setAttribute('aria-label', `Add task to ${g.title}`);
          b.append(icon(ICONS.plus));
          b.addEventListener('click', () => ctx.openQuickAdd(a));
          h.append(b);
        }
        box.append(h);
      }
      box.append(rowList(flatten(g.tasks, all, { open: () => false }), c, g.title || list.title || title));
      shown += g.tasks.length;
    }
    if (list.title || groups.some(g => g.tasks.length)) parts.push(sec);
  }
  host.replaceChildren(...parts);
  empty.replaceChildren(...(shown ? [] : [none()]));
}

/** opens Filters & Labels */
export const openFiltersLabels = () => screens()?.push('#filters-page', { motion: 'fade' });
